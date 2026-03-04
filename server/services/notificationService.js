const https = require('https');
const http = require('http');
const { getDb } = require('../db/database');

/**
 * Bildirim Servisi - Discord webhook, e-posta bildirimleri
 */
class NotificationService {
    constructor() {
        this._ensureTable();
    }

    _ensureTable() {
        try {
            const db = getDb();
            db.exec(`
                CREATE TABLE IF NOT EXISTS notification_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL UNIQUE,
                    enabled INTEGER DEFAULT 0,
                    config TEXT DEFAULT '{}',
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Varsayılan ayarları oluştur
            const types = ['discord', 'server_crash', 'disk_warning', 'update_available', 'player_join'];
            for (const type of types) {
                const exists = db.prepare('SELECT id FROM notification_settings WHERE type = ?').get(type);
                if (!exists) {
                    db.prepare('INSERT INTO notification_settings (type, enabled, config) VALUES (?, 0, ?)').run(type, '{}');
                }
            }
        } catch { /* DB henüz hazır değilse ignore */ }
    }

    getSettings() {
        const db = getDb();
        return db.prepare('SELECT * FROM notification_settings').all().map(s => ({
            ...s,
            config: JSON.parse(s.config || '{}'),
        }));
    }

    updateSetting(type, data) {
        const db = getDb();
        db.prepare('UPDATE notification_settings SET enabled = ?, config = ? WHERE type = ?')
            .run(data.enabled ? 1 : 0, JSON.stringify(data.config || {}), type);
    }

    async send(type, message, extra = {}) {
        const db = getDb();
        const setting = db.prepare('SELECT * FROM notification_settings WHERE type = ?').get('discord');
        if (!setting || !setting.enabled) return;

        const config = JSON.parse(setting.config || '{}');
        if (!config.webhookUrl) return;

        const embed = {
            title: this._getTitle(type),
            description: message,
            color: this._getColor(type),
            timestamp: new Date().toISOString(),
            footer: { text: 'Sunucu Paneli' },
            ...extra,
        };

        try {
            await this._sendDiscord(config.webhookUrl, { embeds: [embed] });
        } catch (err) {
            console.error('[Notification] Discord error:', err.message);
        }
    }

    _getTitle(type) {
        const titles = {
            server_crash: '🔴 Sunucu Çöktü!',
            disk_warning: '⚠️ Disk Uyarısı',
            update_available: '🔄 Güncelleme Mevcut',
            player_join: '👋 Oyuncu Katıldı',
            server_start: '🟢 Sunucu Başladı',
            server_stop: '🔴 Sunucu Durdu',
            backup_complete: '💾 Yedekleme Tamamlandı',
        };
        return titles[type] || '📢 Bildirim';
    }

    _getColor(type) {
        const colors = {
            server_crash: 0xFF0000,
            disk_warning: 0xFFA500,
            update_available: 0x3498DB,
            player_join: 0x2ECC71,
            server_start: 0x2ECC71,
            server_stop: 0xFF0000,
            backup_complete: 0x9B59B6,
        };
        return colors[type] || 0x808080;
    }

    _sendDiscord(webhookUrl, body) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(body);
            const parsedUrl = new URL(webhookUrl);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const req = protocol.request(parsedUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
            }, (res) => {
                res.on('data', () => { });
                res.on('end', resolve);
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    async testWebhook(webhookUrl) {
        await this._sendDiscord(webhookUrl, {
            content: '✅ Sunucu Paneli webhook testi başarılı!',
        });
    }
}

module.exports = new NotificationService();
