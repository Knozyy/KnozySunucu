/**
 * Süreli Whitelist Servisi
 * Her dakika süresi dolan MC whitelist giriş izinlerini otomatik kaldırır.
 */
const { getDb } = require('../db/database');

class TimedWhitelistService {
    constructor() {
        this._interval = null;
    }

    start() {
        this._check();
        this._interval = setInterval(() => this._check(), 60 * 1000);
        console.error('[TimedWhitelist] Servis başlatıldı.');
    }

    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
    }

    list() {
        const db = getDb();
        return db.prepare('SELECT * FROM timed_whitelist ORDER BY expires_at ASC').all();
    }

    add({ mcNick, addedBy, durationDays = 0, durationHours = 0 }) {
        const totalSecs = (Number(durationDays) * 86400) + (Number(durationHours) * 3600);
        if (totalSecs <= 0) throw new Error('Süre en az 1 saat olmalı.');
        const expiresAt = Math.floor(Date.now() / 1000) + totalSecs;
        const db = getDb();
        const result = db.prepare(
            'INSERT INTO timed_whitelist (mc_nick, added_by, expires_at) VALUES (?, ?, ?)'
        ).run(mcNick.trim(), addedBy || null, expiresAt);
        return { id: result.lastInsertRowid, mcNick: mcNick.trim(), expiresAt };
    }

    remove(id) {
        const db = getDb();
        const entry = db.prepare('SELECT * FROM timed_whitelist WHERE id = ?').get(id);
        if (!entry) throw new Error('Kayıt bulunamadı');
        db.prepare('DELETE FROM timed_whitelist WHERE id = ?').run(id);
        return entry;
    }

    _check() {
        try {
            const db = getDb();
            const now = Math.floor(Date.now() / 1000);
            const expired = db.prepare('SELECT * FROM timed_whitelist WHERE expires_at <= ?').all(now);

            if (expired.length === 0) return;

            const mcService = require('./minecraftService');
            for (const entry of expired) {
                try {
                    mcService.sendCommand(`whitelist remove ${entry.mc_nick}`);
                    console.error(`[TimedWhitelist] ${entry.mc_nick} süresi doldu, çıkarıldı.`);
                } catch (e) {
                    console.error(`[TimedWhitelist] MC komutu gönderilemedi (${entry.mc_nick}): ${e.message}`);
                }
            }

            db.prepare('DELETE FROM timed_whitelist WHERE expires_at <= ?').run(now);
        } catch (err) {
            console.error('[TimedWhitelist] Kontrol hatası:', err.message);
        }
    }
}

module.exports = new TimedWhitelistService();
