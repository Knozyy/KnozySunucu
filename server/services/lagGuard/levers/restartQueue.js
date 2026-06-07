/**
 * LagGuard · Restart-config Kuyruğu (Faz 2)
 * ─────────────────────────────────────────
 * `config_restart` kaldıraçları canlı uygulanamaz (etki sonraki restart'ta).
 * Karar motoru bunları DOĞRUDAN yazmak yerine bu kuyruğa ekler; admin panelden
 * "Uygula" (config dosyalarına yaz) veya "Uygula + Restart" deyince işlenir.
 *
 * Kuyruk lever başına TEK bekleyen kayıt tutar (upsert): aynı kaldıraç için yeni
 * hedef gelince eski bekleyen güncellenir.
 */
const path = require('path');
const { getDb } = require('../../../db/database');

function db() { return getDb(); }

function fmt(value, valueType) {
    if (valueType === 'int') return Math.round(value);
    return Math.round(value * 1000) / 1000;
}

const restartQueue = {
    /**
     * Bekleyen kuyruğa ekle/güncelle (lever başına tek pending).
     * @param {object} lever — lag_levers satırı
     * @param {number} value — hedef değer (restart sonrası geçerli olacak)
     * @param {string} reason — kısa gerekçe (ör. "MSPT 61ms")
     */
    enqueue(lever, value, reason = '') {
        const d = db();
        const v = fmt(Number(value), lever.value_type);
        const existing = d.prepare(
            "SELECT id FROM lag_restart_queue WHERE lever_id = ? AND status = 'pending'"
        ).get(lever.id);
        if (existing) {
            d.prepare(`UPDATE lag_restart_queue
                SET target_value = ?, reason = ?, queued_at = datetime('now')
                WHERE id = ?`).run(v, reason, existing.id);
            return { id: existing.id, updated: true };
        }
        const res = d.prepare(`INSERT INTO lag_restart_queue
            (lever_id, lever_key, lever_name, config_path, config_format, config_key, target_value, value_type, reason, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).run(
            lever.id, lever.lever_key, lever.name,
            lever.config_path, lever.config_format || 'toml', lever.config_key,
            v, lever.value_type || 'int', reason
        );
        return { id: res.lastInsertRowid, updated: false };
    },

    /** Belirli kaldıraç için bekleyen kayıt var mı? (target ile) */
    pendingFor(leverId) {
        try {
            return db().prepare(
                "SELECT * FROM lag_restart_queue WHERE lever_id = ? AND status = 'pending'"
            ).get(leverId) || null;
        } catch { return null; }
    },

    listPending() {
        try {
            return db().prepare(
                "SELECT * FROM lag_restart_queue WHERE status = 'pending' ORDER BY queued_at ASC"
            ).all();
        } catch { return []; }
    },

    count() {
        try {
            const r = db().prepare("SELECT COUNT(*) AS n FROM lag_restart_queue WHERE status = 'pending'").get();
            return r?.n || 0;
        } catch { return 0; }
    },

    cancel(id) {
        db().prepare("UPDATE lag_restart_queue SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id);
        return { ok: true };
    },

    /** Bir kaldıracın bekleyen kaydını iptal et (recovery default'a dönerse). */
    cancelForLever(leverId) {
        try { db().prepare("UPDATE lag_restart_queue SET status = 'cancelled' WHERE lever_id = ? AND status = 'pending'").run(leverId); }
        catch { /* ignore */ }
    },

    clear() {
        const r = db().prepare("UPDATE lag_restart_queue SET status = 'cancelled' WHERE status = 'pending'").run();
        return { cleared: r.changes };
    },

    /**
     * Bekleyen tüm config değişikliklerini DOSYAYA yaz (etki sonraki restart'ta).
     * @param {object} mc — minecraftService (serverPath çözümü için)
     * @returns {{ applied, errors, details }}
     */
    applyAll(mc) {
        const ConfigParser = require('../../configParser');
        const serverPath = mc?.getServerPath ? mc.getServerPath() : '';
        const pending = this.listPending();
        const details = [];
        let applied = 0, errors = 0;
        const markApplied = db().prepare("UPDATE lag_restart_queue SET status = 'applied', applied_at = datetime('now') WHERE id = ?");

        for (const q of pending) {
            try {
                if (!q.config_path || !q.config_key) throw new Error('config_path/key eksik');
                const filePath = path.isAbsolute(q.config_path) ? q.config_path : path.join(serverPath, q.config_path);
                const fmtName = q.config_format || 'toml';
                const target = fmt(q.target_value, q.value_type);
                ConfigParser.setValue(filePath, fmtName, q.config_key, target);
                // Yazma doğrulaması: tekrar oku, gerçekten değişti mi? (sessiz "applied" olmasın)
                let after;
                try { after = ConfigParser.getValue(ConfigParser.read(filePath, fmtName).data, q.config_key); } catch { /* ignore */ }
                if (after == null || Number(after) !== Number(target)) {
                    throw new Error(`yazıldı ama doğrulanamadı (${filePath} · ${q.config_key}=${after})`);
                }
                markApplied.run(q.id);
                applied++;
                details.push({ id: q.id, lever: q.lever_name, ok: true, detail: `${filePath} · ${q.config_key} = ${target}` });
            } catch (e) {
                errors++;
                details.push({ id: q.id, lever: q.lever_name, ok: false, detail: e.message });
            }
        }
        return { applied, errors, details };
    },
};

module.exports = restartQueue;
