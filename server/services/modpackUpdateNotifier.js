const { getDb } = require('../db/database');

/**
 * Modpack güncelleme bildirimi
 * ────────────────────────────
 * Periyodik olarak kurulu CurseForge paketlerinin yeni sürümünü kontrol eder;
 * yeni sürüm çıktıysa Discord webhook'una bir kez bildirim düşer (spam yok —
 * bildirilen file id app_settings'te tutulur).
 *
 * Aç/kapa: app_settings 'modpack_update_notify' (varsayılan açık).
 * Bildirim kanalı: mevcut Discord webhook altyapısı (webhookService).
 */

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 saat
const INITIAL_DELAY_MS = 5 * 60 * 1000;       // açılıştan 5 dk sonra ilk kontrol

class ModpackUpdateNotifier {
    constructor() {
        this._timer = null;
    }

    start() {
        const initial = setTimeout(() => this.checkAll().catch(() => {}), INITIAL_DELAY_MS);
        if (initial.unref) initial.unref();
        this._timer = setInterval(() => this.checkAll().catch(() => {}), CHECK_INTERVAL_MS);
        if (this._timer.unref) this._timer.unref();
        console.log('[ModpackNotify] Güncelleme bildirimi servisi başlatıldı (6 saatte bir).');
    }

    stop() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    _enabled() {
        try {
            const row = getDb().prepare("SELECT value FROM app_settings WHERE key = 'modpack_update_notify'").get();
            return row ? row.value !== '0' : true; // varsayılan açık
        } catch { return true; }
    }

    async checkAll() {
        if (!this._enabled()) return [];

        const db = getDb();
        let packs = [];
        try {
            packs = db.prepare("SELECT * FROM installed_modpacks WHERE provider IS NULL OR provider = 'curseforge'").all();
        } catch { return []; }

        const curseForge = require('./curseforgeService');
        const webhookService = require('./webhookService');
        const found = [];

        for (const pack of packs) {
            try {
                const result = await curseForge.checkUpdate(pack.curseforge_id);
                if (!result.hasUpdate || !result.latestFileId) continue;

                // Aynı sürüm için tekrar bildirme
                const key = `modpack_notified_${pack.id}`;
                const prev = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
                if (prev && Number(prev.value) === Number(result.latestFileId)) continue;

                webhookService.send('modpack_update',
                    `**${pack.name}** paketinin yeni sürümü çıktı!`,
                    {
                        fields: [
                            { name: 'Kurulu Sürüm', value: result.currentVersion || pack.version || '—', inline: true },
                            { name: 'Yeni Sürüm', value: result.latestVersion || '—', inline: true },
                            { name: 'Güncelleme', value: 'Panel → Modpacks sayfasından tek tıkla güncelleyebilirsiniz.', inline: false },
                        ],
                    });

                db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
                    .run(key, String(result.latestFileId));

                found.push({ id: pack.id, name: pack.name, latestVersion: result.latestVersion });
                console.log(`[ModpackNotify] Yeni sürüm bildirildi: ${pack.name} → ${result.latestVersion}`);
            } catch (err) {
                console.error(`[ModpackNotify] ${pack.name} kontrol hatası:`, err.message);
            }
        }
        return found;
    }
}

module.exports = new ModpackUpdateNotifier();
