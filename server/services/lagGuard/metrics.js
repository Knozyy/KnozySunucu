/**
 * LagGuard · Metrics
 * ──────────────────
 * minecraftService'in yaydığı `tps` ve `lag` (Can't keep up) event'lerini dinler.
 * Bellekte bir ring buffer tutar, periyodik olarak `lag_samples` tablosuna
 * downsample'lı snapshot yazar (panel grafiği restart sonrası da dolu gelsin).
 *
 * Bu modül HİÇBİR AKSİYON ALMAZ — sadece okur/toplar (Faz 0).
 */
const { getDb } = require('../../db/database');

const RING_SIZE = 240;            // ~ son 240 örnek (canlı grafik için)
const SNAPSHOT_INTERVAL = 30_000; // 30sn'de bir DB'ye yaz
const CANTKEEPUP_WINDOW = 300_000; // "Can't keep up" sayımı için 5 dk pencere
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün geçmiş tut

class Metrics {
    constructor() {
        this._ring = [];            // { ts, tps, mspt }
        this._cantKeepUpTimes = []; // timestamp[]
        this._lastTps = null;
        this._lastMspt = null;
        this._lastSource = null;
        this._mc = null;
        this._snapshotTimer = null;
        this._onTps = this._onTps.bind(this);
        this._onLag = this._onLag.bind(this);
    }

    /** minecraftService (EventEmitter) singleton'ına bağlan. */
    attach(mcService) {
        if (this._mc === mcService) return;
        this.detach();
        this._mc = mcService;
        if (mcService) {
            mcService.on('tps', this._onTps);
            mcService.on('lag', this._onLag);
        }
        if (!this._snapshotTimer) {
            this._snapshotTimer = setInterval(() => this._snapshot(), SNAPSHOT_INTERVAL);
            if (this._snapshotTimer.unref) this._snapshotTimer.unref();
        }
    }

    detach() {
        if (this._mc) {
            try {
                this._mc.off('tps', this._onTps);
                this._mc.off('lag', this._onLag);
            } catch { /* ignore */ }
        }
        this._mc = null;
    }

    // ── Event handler'ları ──────────────────────────────────────────────
    _onTps({ tps, mspt }) {
        if (tps == null) return;
        // MSPT yoksa TPS'ten yaklaşık türet (≥20 TPS → ~50ms)
        const effMspt = mspt != null ? mspt : (tps >= 20 ? 50 : Math.round((1000 / Math.max(tps, 1)) * 10) / 10);
        this._lastTps = tps;
        this._lastMspt = effMspt;
        this._ring.push({ ts: Date.now(), tps, mspt: effMspt });
        if (this._ring.length > RING_SIZE) this._ring.shift();
    }

    _onLag({ behindMs } = {}) {
        const now = Date.now();
        this._cantKeepUpTimes.push(now);
        this._pruneCantKeepUp(now);
    }

    _pruneCantKeepUp(now = Date.now()) {
        const cutoff = now - CANTKEEPUP_WINDOW;
        this._cantKeepUpTimes = this._cantKeepUpTimes.filter(t => t > cutoff);
    }

    // ── DB snapshot ─────────────────────────────────────────────────────
    _snapshot() {
        if (this._lastTps == null) return; // henüz veri yok
        try {
            const db = getDb();
            const players = this._currentPlayers();
            db.prepare(`INSERT INTO lag_samples (ts, tps, mspt, players, cant_keep_up)
                        VALUES (?, ?, ?, ?, ?)`)
              .run(Date.now(), this._lastTps, this._lastMspt, players, this.getCantKeepUpCount());
            // Eski kayıtları temizle
            db.prepare('DELETE FROM lag_samples WHERE ts < ?').run(Date.now() - RETENTION_MS);
        } catch { /* DB henüz hazır olmayabilir */ }
    }

    _currentPlayers() {
        try {
            const st = this._mc?.getStatus?.();
            return st?.playerCount ?? st?.players?.length ?? 0;
        } catch { return 0; }
    }

    // ── Okuma API'si ────────────────────────────────────────────────────
    getCantKeepUpCount() {
        this._pruneCantKeepUp();
        return this._cantKeepUpTimes.length;
    }

    /** Canlı durum — panelin sık (2-3sn) sorgulayacağı hafif veri. */
    getLive() {
        return {
            tps: this._lastTps,
            mspt: this._lastMspt,
            players: this._currentPlayers(),
            cantKeepUpCount: this.getCantKeepUpCount(),
            ring: this._ring.slice(-120), // son ~120 örnek (sparkline)
        };
    }

    /** Geçmiş — DB'den. range: saat cinsinden (varsayılan 6 saat). */
    getHistory(rangeHours = 6) {
        try {
            const db = getDb();
            const since = Date.now() - rangeHours * 3600_000;
            return db.prepare('SELECT ts, tps, mspt, players, cant_keep_up FROM lag_samples WHERE ts >= ? ORDER BY ts ASC')
                     .all(since);
        } catch { return []; }
    }
}

module.exports = new Metrics();
