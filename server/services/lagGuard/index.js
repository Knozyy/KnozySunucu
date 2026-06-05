/**
 * LagGuard · Orkestratör
 * ──────────────────────
 * Alt modülleri (metrics, observable, … ) bir araya getirir ve aktif Minecraft
 * instance'ına bağlar. Faz 0'da yalnızca metrik toplama + Observable probe aktif;
 * karar/uygulama/atıf/ceza modülleri sonraki fazlarda eklenecek.
 *
 * Bağımlılık yönü: minecraftService BU modülü tanımaz. Biz minecraftService'in
 * yaydığı event'lere abone oluruz (gevşek bağlılık).
 */
const { getDb } = require('../../db/database');
const metrics = require('./metrics');
const observable = require('./observable');

const DEFAULTS = {
    // Faz 0 yalnızca eşik/etiket amaçlı; aksiyon için kullanılmıyor.
    tpsTarget: 19.0,   // bu değerin üzeri "stabil" sayılır
    tpsWarn: 16.0,     // altı "hafif lag"
    tpsCritical: 12.0, // altı "ağır lag"
    observableSeconds: 20,
};

class LagGuard {
    constructor() {
        this._mc = null;
        this._settings = { ...DEFAULTS };
        this._loadSettings();
    }

    /** server/index.js başlangıcında çağrılır. */
    init() {
        this._loadSettings();
    }

    /** Aktif (default) Minecraft instance'ına bağlan. */
    attach(mcService) {
        this._mc = mcService || null;
        metrics.attach(mcService);
        observable.attach(mcService);
    }

    // ── Durum ────────────────────────────────────────────────────────────
    getStatus() {
        const live = metrics.getLive();
        const s = this._settings;
        let level = 'unknown';
        if (live.tps != null) {
            if (live.tps >= s.tpsTarget) level = 'stable';
            else if (live.tps >= s.tpsWarn) level = 'minor';
            else if (live.tps >= s.tpsCritical) level = 'warn';
            else level = 'critical';
        }
        return {
            phase: 0,                 // şu an sadece izleme fazındayız
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
        };
    }

    getMetrics(rangeHours = 6) {
        return { history: metrics.getHistory(rangeHours) };
    }

    getSettings() {
        return { ...this._settings };
    }

    updateSettings(patch = {}) {
        for (const [k, v] of Object.entries(patch)) {
            if (k in this._settings) {
                this._settings[k] = Number(v);
                this._saveSetting(`lagguard_${k}`, String(this._settings[k]));
            }
        }
        return this.getSettings();
    }

    // ── Observable probe ───────────────────────────────────────────────
    async runObservable(seconds) {
        const sec = seconds || this._settings.observableSeconds;
        return observable.runProfile(sec);
    }

    // ── Settings persist (app_settings · lagguard_ öneki) ──────────────
    _loadSettings() {
        try {
            const db = getDb();
            for (const key of Object.keys(DEFAULTS)) {
                const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(`lagguard_${key}`);
                if (row) this._settings[key] = Number(row.value);
            }
        } catch { /* tablo henüz olmayabilir */ }
    }

    _saveSetting(key, value) {
        try {
            const db = getDb();
            db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
                        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`)
              .run(key, value, value);
        } catch { /* ignore */ }
    }
}

module.exports = new LagGuard();
