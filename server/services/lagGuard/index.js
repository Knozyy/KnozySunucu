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
const restartQueue = require('./levers/restartQueue');
const decision = require('./decision');
const configExplorer = require('./configExplorer');
const attribution = require('./attribution/probe');

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
    // Atıf — adil kanıt (tek tarama asla suçlamaz)
    attribFlagMs: 5,        // sahip işaretleme eşiği (medyan ms/tick)
    attribMinScans: 3,      // en az bu kadar lag-taramasında eşik üstü olmalı
    attribWindowScans: 6,   // kanıt penceresi (son N lag-taraması)
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
        } else if (live.tps != null) {
            // MSPT bilinmiyor (örn. TPS=20 ve kaynak MSPT vermiyor) → TPS eşikleriyle değerlendir
            if (live.tps <= s.tpsCritical) level = 'critical';
            else if (live.tps <= s.tpsWarn) level = 'warn';
            else if (live.tps >= s.tpsTarget) level = 'stable';
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
            restartQueueCount: restartQueue.count(),
            attributionBusy: attribution.isBusy(),
            decision: decision.getState(),
        };
    }

    getMetrics(rangeHours = 6) { return { history: metrics.getHistory(rangeHours) }; }

    /** Tekrarlanan yük özeti — son taramalardan medyan tabanlı adil işaretleme. */
    getAttributionEvidence() {
        const evidence = require('./attribution/evidence');
        return evidence.summarize(attribution.list(100), this._settings);
    }

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

    // ── Restart-config kuyruğu (Faz 2) ───────────────────────────────────
    getRestartQueue() { return { queue: restartQueue.listPending(), count: restartQueue.count() }; }

    /** Bekleyen config değişikliklerini dosyalara yaz (etki sonraki restart'ta). */
    applyRestartQueue() {
        const res = restartQueue.applyAll(this._mc);
        registry.logHistory({ action: 'queue', mode: this._mode, detail: `kuyruk uygulandı: ${res.applied} yazıldı, ${res.errors} hata` });
        return res;
    }

    /** Kuyruğu uygula + sunucuyu yeniden başlat (değişiklikler restart'ta etkin olur). */
    async applyRestartQueueAndRestart() {
        const res = restartQueue.applyAll(this._mc);
        let restarted = false;
        if (this._mc?.restart && this._mc.status === 'running') {
            try { await this._mc.restart(); restarted = true; }
            catch (e) { return { ...res, restarted: false, restartError: e.message }; }
        }
        return { ...res, restarted };
    }

    cancelRestartItem(id) { return restartQueue.cancel(parseInt(id)); }
    clearRestartQueue() { return restartQueue.clear(); }

    // ── Lag Atıf / Shadow Log (Faz 3, Observable tabanlı) ────────────────
    getAttribution(limit = 50) { return { log: attribution.list(limit), busy: attribution.isBusy() }; }
    /** Observable taraması başlat (fire-and-forget; ~25sn sürer, panel poll'lar). */
    runAttribution() {
        if (attribution.isBusy()) return { started: false, busy: true, note: 'Zaten çalışıyor' };
        const live = metrics.getLive();
        attribution.runScan(this._mc, { mode: this._mode, mspt: live.mspt }).catch(() => {});
        return { started: true, busy: true };
    }
    clearAttribution() { return attribution.clear(); }

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
