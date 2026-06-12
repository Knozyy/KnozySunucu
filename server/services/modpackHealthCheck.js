const { getDb } = require('../db/database');

/**
 * Modpack ilk başlatma sağlık testi
 * ─────────────────────────────────
 * Paketi atanmış sunucusunda başlatır, log'da "Done (X.Xs)!" satırını bekler:
 * - Görülürse: BAŞARILI → sunucu kapatılır (keepRunning verilmediyse)
 * - Süreç Done'dan önce ölürse: BAŞARISIZ (crash)
 * - 8 dakikada açılmazsa: ZAMAN AŞIMI
 * Sonuç installed_modpacks.last_health kolonuna yazılır (UI rozeti).
 */

const TIMEOUT_MS = 8 * 60 * 1000;
const DONE_RE = /Done \([\d.,]+\s*s(?:ec(?:onds)?)?\)!/i;

class ModpackHealthCheck {
    constructor() {
        this._active = new Map(); // dbId → { status, startedAt, lastLog }
    }

    /** Testin anlık durumu (yoksa DB'deki son sonuç). */
    getStatus(dbId) {
        const live = this._active.get(Number(dbId));
        if (live) return { running: true, ...live };
        try {
            const row = getDb().prepare('SELECT last_health FROM installed_modpacks WHERE id = ?').get(dbId);
            if (row?.last_health) return { running: false, last: JSON.parse(row.last_health) };
        } catch { /* ignore */ }
        return { running: false, last: null };
    }

    /**
     * Testi başlat (async — durum getStatus ile izlenir).
     * @param {number} dbId
     * @param {{ keepRunning?: boolean }} opts başarılıysa sunucuyu açık bırak
     */
    async run(dbId, opts = {}) {
        dbId = Number(dbId);
        if (this._active.has(dbId)) throw new Error('Bu paket için test zaten sürüyor');

        const db = getDb();
        const pack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(dbId);
        if (!pack) throw new Error('Modpack bulunamadı');

        // Paketin atandığı sunucuyu bul
        const srv = db.prepare('SELECT id FROM servers WHERE active_modpack_id = ?').get(dbId);
        const serverRegistry = require('./serverRegistry');
        const inst = srv ? serverRegistry.get(srv.id) : serverRegistry.getDefault();
        if (!inst) throw new Error('Paket bir sunucuya atanmamış — önce sunucu profiline atayın');
        if (inst.status !== 'stopped') throw new Error(`Sunucu şu an ${inst.status} durumunda — test için kapalı olmalı`);

        const state = { status: 'starting', startedAt: Date.now(), lastLog: '' };
        this._active.set(dbId, state);

        const finish = (result) => {
            cleanup();
            this._active.delete(dbId);
            const record = { ...result, at: new Date().toISOString(), durationSec: Math.round((Date.now() - state.startedAt) / 1000) };
            try {
                db.prepare('UPDATE installed_modpacks SET last_health = ? WHERE id = ?')
                    .run(JSON.stringify(record), dbId);
            } catch { /* ignore */ }
            console.log(`[HealthCheck] ${pack.name}: ${record.status} (${record.durationSec}sn)`);
        };

        const onLog = (line) => {
            state.lastLog = String(line).slice(0, 300);
            if (DONE_RE.test(line)) {
                state.status = 'success';
                finish({ status: 'success', detail: `Sunucu açıldı: ${state.lastLog}` });
                if (!opts.keepRunning) {
                    try { inst.stop(); } catch { /* ignore */ }
                }
            }
        };

        const onStatus = (status) => {
            if (status === 'stopped' && state.status === 'starting') {
                state.status = 'fail';
                finish({ status: 'fail', detail: `Sunucu açılamadan kapandı. Son log: ${state.lastLog || '—'}` });
            }
        };

        const timer = setTimeout(() => {
            if (state.status === 'starting') {
                state.status = 'timeout';
                finish({ status: 'timeout', detail: `8 dakikada açılmadı. Son log: ${state.lastLog || '—'}` });
                try { inst.stop(); } catch { /* ignore */ }
            }
        }, TIMEOUT_MS);
        if (timer.unref) timer.unref();

        const cleanup = () => {
            clearTimeout(timer);
            try { inst.off('log', onLog); inst.off('status', onStatus); } catch { /* ignore */ }
        };

        inst.on('log', onLog);
        inst.on('status', onStatus);

        try {
            inst.start();
        } catch (err) {
            state.status = 'fail';
            finish({ status: 'fail', detail: `Başlatılamadı: ${err.message}` });
            throw err;
        }

        return { started: true, serverId: srv?.id || null };
    }
}

module.exports = new ModpackHealthCheck();
