/**
 * LagGuard · Orkestratör
 * ──────────────────────
 * Alt modülleri (metrics, observable, levers, decision) bir araya getirir ve
 * aktif Minecraft instance'ına bağlar.
 *
 * Faz 0: metrik toplama + Observable probe.
 * Faz 1: komut/gamerule kaldıraçları + AIMD karar döngüsü (off/dryrun/auto modları).
 *
 * Bağımlılık yönü: minecraftService BU modülü tanımaz; biz onun event'lerine
 * abone oluruz (gevşek bağlılık).
 */
const { getDb } = require('../../db/database');
const metrics = require('./metrics');
const observable = require('./observable');
const registry = require('./levers/registry');
const appliers = require('./levers/appliers');
const decision = require('./decision');
const configExplorer = require('./configExplorer');

const DEFAULTS = {
    // Seviye etiketi (TPS) — görüntüleme amaçlı
    tpsTarget: 19.0, tpsWarn: 16.0, tpsCritical: 12.0,
    // Karar eşikleri (MSPT birincil sinyal)
    msptTarget: 46,        // ≤ bu → stabil (recovery'ye uygun)
    msptWarn: 52,          // ≥ bu → throttle
    msptCritical: 65,      // ≥ bu → agresif throttle
    cantKeepUpCritical: 3, // 5dk'da bu kadar "Can't keep up" → kritik
    // Zamanlama (saniye)
    checkInterval: 20,
    cooldownAfterThrottle: 60,
    cooldownAfterRecovery: 120,
    stableForRecovery: 180,
    // Restart gerektiren kaldıraçlar dahil edilsin mi (0/1)
    allowRestartLevers: 0,
    observableSeconds: 20,
};

const MODES = ['off', 'dryrun', 'auto'];

class LagGuard {
    constructor() {
        this._mc = null;
        this._mode = 'off';
        this._settings = { ...DEFAULTS };
        this._loadSettings();
    }

    init() {
        this._loadSettings();
        registry.seedStarter();
        decision.configure({
            getMode: () => this._mode,
            getSettings: () => this._settings,
            getMc: () => this._mc,
        });
        decision.start();
    }

    attach(mcService) {
        this._mc = mcService || null;
        metrics.attach(mcService);
        observable.attach(mcService);
    }

    // ── Mod ──────────────────────────────────────────────────────────────
    getMode() { return this._mode; }
    setMode(mode) {
        if (!MODES.includes(mode)) throw new Error(`Geçersiz mod: ${mode}`);
        this._mode = mode;
        this._saveSetting('lagguard_mode', mode);
        decision.restart();
        return this._mode;
    }

    // ── Durum ────────────────────────────────────────────────────────────
    getStatus() {
        const live = metrics.getLive();
        const s = this._settings;
        let level = 'unknown';
        if (live.mspt != null) {
            if (live.mspt >= s.msptCritical) level = 'critical';
            else if (live.mspt >= s.msptWarn) level = 'warn';
            else if (live.mspt <= s.msptTarget) level = 'stable';
            else level = 'minor';
        }
        const levers = registry.list();
        const throttled = levers.filter(l => l.current_value != null && l.current_value !== l.default_value).length;
        return {
            phase: 1,
            mode: this._mode,
            attached: !!this._mc,
            running: this._mc?.status === 'running',
            level,
            tps: live.tps,
            mspt: live.mspt,
            players: live.players,
            cantKeepUpCount: live.cantKeepUpCount,
            ring: live.ring,
            settings: s,
            observableBusy: observable.isBusy(),
            tpsCommand: this._mc?._tpsCmdActive || null,
            tpsCommandSearching: !!(this._mc && !this._mc._tpsCmdActive && this._mc.status === 'running'),
            leverCount: levers.length,
            throttledCount: throttled,
            decision: decision.getState(),
        };
    }

    getMetrics(rangeHours = 6) { return { history: metrics.getHistory(rangeHours) }; }

    // ── Kaldıraçlar (passthrough) ────────────────────────────────────────
    getLevers() { return { levers: registry.list() }; }
    createLever(data) { return registry.create(data); }
    bulkCreateLevers(items) { return registry.bulkCreate(items || []); }
    updateLever(id, data) { return registry.update(id, data); }
    deleteLever(id) { return registry.remove(id); }
    toggleLever(id) { return registry.toggle(id); }
    getLeverHistory(limit) { return { history: registry.history(limit) }; }
    seedLevers() { registry.seedStarter(); return registry.list(); }

    /** Tüm kaldıraçları default'a sıfırla (mevcut moda göre uygula veya öner). */
    resetLevers() { return decision.resetAll(this._mode); }

    /** Bir kaldıracı ŞİMDİ gerçekten uygula (test amaçlı, moddan bağımsız).
     *  value verilmezse relief_value uygulanır. Sonuç/hata aynen döner. */
    applyLeverNow(id, value) {
        const lever = registry.get(id);
        if (!lever) throw new Error('Kaldıraç bulunamadı');
        const v = (value != null && value !== '') ? Number(value) : Number(lever.relief_value);
        const old = registry.currentOf(lever);
        const res = appliers.apply(lever, v, { dryRun: false, mc: this._mc, allowRestart: true });
        if (res.applied) registry.setCurrent(id, v === lever.default_value ? null : v);
        registry.logHistory({ lever_id: id, lever_key: lever.lever_key, action: 'manual', mode: this._mode, old_value: old, new_value: v, detail: res.detail });
        return { ...res, applied_value: v };
    }

    // ── Settings ─────────────────────────────────────────────────────────
    getSettings() { return { ...this._settings }; }
    updateSettings(patch = {}) {
        let intervalChanged = false;
        for (const [k, v] of Object.entries(patch)) {
            if (k in this._settings) {
                this._settings[k] = Number(v);
                this._saveSetting(`lagguard_${k}`, String(this._settings[k]));
                if (k === 'checkInterval') intervalChanged = true;
            }
        }
        if (intervalChanged) decision.restart();
        return this.getSettings();
    }

    // ── Observable ───────────────────────────────────────────────────────
    async runObservable(seconds) { return observable.runProfile(seconds || this._settings.observableSeconds); }

    // ── Config gezgini (kaldıraç eklerken mevcut configten seçmek için) ──
    _serverPath() {
        try { return this._mc?.getServerPath ? this._mc.getServerPath() : null; } catch { return null; }
    }
    listConfigFiles() { return { files: configExplorer.listFiles(this._serverPath()) }; }
    readConfig(rel) {
        if (!rel) throw new Error('path gerekli');
        return configExplorer.read(this._serverPath(), rel);
    }

    // ── Persist (app_settings · lagguard_ öneki) ────────────────────────
    _loadSettings() {
        try {
            const db = getDb();
            for (const key of Object.keys(DEFAULTS)) {
                const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(`lagguard_${key}`);
                if (row) this._settings[key] = Number(row.value);
            }
            const modeRow = db.prepare("SELECT value FROM app_settings WHERE key = 'lagguard_mode'").get();
            if (modeRow && MODES.includes(modeRow.value)) this._mode = modeRow.value;
        } catch { /* tablo henüz olmayabilir */ }
    }

    _saveSetting(key, value) {
        try {
            getDb().prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
                        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`)
                .run(key, String(value), String(value));
        } catch { /* ignore */ }
    }
}

module.exports = new LagGuard();
