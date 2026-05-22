// server/services/pushService.js
const webpush = require('web-push');
const { getDb } = require('../db/database');

const VAPID_SUBJECT = 'mailto:admin@localhost';

function getVapidKeys() {
    const db = getDb();
    const pub  = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('vapid_public_key');
    const priv = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('vapid_private_key');

    if (pub && priv) return { publicKey: pub.value, privateKey: priv.value };

    // İlk çalıştırmada üret ve kaydet
    const keys = webpush.generateVAPIDKeys();
    const upsert = db.prepare(`
        INSERT INTO app_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
    upsert.run('vapid_public_key',  keys.publicKey);
    upsert.run('vapid_private_key', keys.privateKey);
    return keys;
}

async function sendToAllUsers(type, message) {
    const keys = getVapidKeys();
    webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);

    const db = getDb();
    const rows = db.prepare('SELECT * FROM push_subscriptions').all();
    if (rows.length === 0) return;

    const TITLES = {
        server_crash: '🔴 Sunucu Çöktü',
        disk_warning:  '⚠️ Disk Uyarısı',
    };

    const payload = JSON.stringify({
        title: TITLES[type] || '📢 Sunucu Paneli',
        body:  message,
        url:   '/',
    });

    await Promise.all(rows.map(async (row) => {
        try {
            await webpush.sendNotification(JSON.parse(row.subscription), payload);
        } catch (err) {
            // 410 Gone veya 404 → abonelik süresi dolmuş, sil
            if (err.statusCode === 410 || err.statusCode === 404) {
                db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
            }
        }
    }));
}

module.exports = { getVapidKeys, sendToAllUsers };
