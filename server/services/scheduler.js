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
        const stmt = db.prepare(`
            INSERT INTO scheduled_tasks (name, type, interval_minutes, action, action_data, enabled)
            VALUES (?, ?, ?, ?, ?, 1)
        `);
        const result = stmt.run(data.name, data.type, data.intervalMinutes, data.action, JSON.stringify(data.actionData || {}));
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

        const intervalMs = task.interval_minutes * 60 * 1000;
        const timer = setInterval(() => {
            this._executeTask(task);
        }, intervalMs);

        this.timers.set(task.id, timer);
    }

    _clearTimer(id) {
        if (this.timers.has(id)) {
            clearInterval(this.timers.get(id));
            this.timers.delete(id);
        }
    }

    async _executeTask(task) {
        try {
            const db = getDb();
            db.prepare('UPDATE scheduled_tasks SET last_run = datetime("now") WHERE id = ?').run(task.id);

            switch (task.action) {
                case 'restart':
                    const mcService = require('./minecraftService');
                    if (mcService.status === 'running') await mcService.restart();
                    break;
                case 'backup':
                    // Backup servisi çağır
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
