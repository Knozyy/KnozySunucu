const { getDb } = require('../db/database');
const https = require('https');
const http = require('http');

/**
 * Zamanlanmış Görevler - Otomatik restart, backup, duyuru
 */
class Scheduler {
    constructor() {
        this.timers = new Map();
        this._loadAndStart();
    }

    _loadAndStart() {
        try {
            const db = getDb();
            // Tablo oluştur
            db.exec(`
                CREATE TABLE IF NOT EXISTS scheduled_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    cron_expression TEXT,
                    interval_minutes INTEGER,
                    action TEXT NOT NULL,
                    action_data TEXT,
                    enabled INTEGER DEFAULT 1,
                    last_run TEXT,
                    next_run TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Aktif görevleri başlat
            const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE enabled = 1').all();
            for (const task of tasks) {
                this._scheduleTask(task);
            }
        } catch { /* DB henüz hazır değilse ignore */ }
    }

    list() {
        const db = getDb();
        return db.prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC').all();
    }

    create(data) {
        const db = getDb();
        const nextRun = Date.now() + (data.intervalMinutes * 60 * 1000);
        const stmt = db.prepare(`
            INSERT INTO scheduled_tasks (name, type, interval_minutes, action, action_data, enabled, next_run)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        `);
        const result = stmt.run(data.name, data.type, data.intervalMinutes, data.action, JSON.stringify(data.actionData || {}), nextRun.toString());
        const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(result.lastInsertRowid);
        this._scheduleTask(task);
        return task;
    }

    remove(id) {
        const db = getDb();
        this._clearTimer(id);
        db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
    }

    toggle(id) {
        const db = getDb();
        const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
        if (!task) throw new Error('Görev bulunamadı');

        const newEnabled = task.enabled ? 0 : 1;
        db.prepare('UPDATE scheduled_tasks SET enabled = ? WHERE id = ?').run(newEnabled, id);

        if (newEnabled) {
            this._scheduleTask({ ...task, enabled: 1 });
        } else {
            this._clearTimer(id);
        }

        return { enabled: !!newEnabled };
    }

    _scheduleTask(task) {
        if (!task.enabled || !task.interval_minutes) return;
        this._clearTimer(task.id);

        let nextRun = parseInt(task.next_run || '0', 10);
        const now = Date.now();
        const intervalMs = task.interval_minutes * 60 * 1000;

        // Geçmişte kalmışsa hemen çalıştıracak şekilde süreyi ayarla
        if (!nextRun || nextRun < now) {
            nextRun = now + intervalMs;
            const db = getDb();
            db.prepare('UPDATE scheduled_tasks SET next_run = ? WHERE id = ?').run(nextRun.toString(), task.id);
        }

        const timeUntilFirstRun = nextRun - now;

        const timer = setTimeout(() => {
            this._executeTask(task);

            // İlk çalışmadan sonra regular interval
            const intervalTimer = setInterval(() => {
                this._executeTask(task);
            }, intervalMs);

            this.timers.set(task.id, intervalTimer);
        }, Math.max(0, timeUntilFirstRun));

        this.timers.set(task.id, timer);
    }

    _clearTimer(id) {
        if (this.timers.has(id)) {
            const timer = this.timers.get(id);
            clearTimeout(timer);
            clearInterval(timer);
            this.timers.delete(id);
        }
    }

    async _executeTask(task) {
        try {
            const db = getDb();
            const now = Date.now();
            const nextRun = now + (task.interval_minutes * 60 * 1000);

            db.prepare('UPDATE scheduled_tasks SET last_run = datetime("now"), next_run = ? WHERE id = ?').run(nextRun.toString(), task.id);

            switch (task.action) {
                case 'restart':
                    const mcService = require('./minecraftService');
                    if (mcService.status === 'running') await mcService.restart();
                    break;
                case 'backup':
                    try {
                        const wm = require('./worldManager');
                        const w = new wm();
                        // tüm dünyaları yedekle
                        const worlds = w.list();
                        for (const world of worlds) {
                            if (world.exists) w.backup(world.name);
                        }
                    } catch (e) { console.error('Oto-Yedekleme Hatası:', e.message); }
                    break;
                case 'announce':
                    const data = JSON.parse(task.action_data || '{}');
                    const mc = require('./minecraftService');
                    if (mc.status === 'running') mc.sendCommand(`say ${data.message || 'Sunucu duyurusu'}`);
                    break;
                case 'webhook':
                    const webhookData = JSON.parse(task.action_data || '{}');
                    if (webhookData.url) await this._sendWebhook(webhookData.url, webhookData.message || 'Zamanlanmış görev çalıştı');
                    break;
            }
        } catch (err) {
            console.error(`[Scheduler] Task ${task.id} error:`, err.message);
        }
    }

    _sendWebhook(url, message) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({ content: message });
            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const req = protocol.request(parsedUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
                res.on('data', () => { });
                res.on('end', resolve);
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
}

module.exports = new Scheduler();
