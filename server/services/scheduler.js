const { getDb } = require('../db/database');
const https = require('https');
const http = require('http');

/**
 * Zamanlanmış Görevler - Otomatik restart, backup, duyuru
 * Görev çalıştırıldığında minecraftService'e doğrudan komut gönderir
 */
class Scheduler {
    constructor() {
        this.timers = new Map();
        this.executionLog = []; // Son çalışma logları
        this._loadAndStart();
    }

    _loadAndStart() {
        try {
            const db = getDb();
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

            const tasks = db.prepare('SELECT * FROM scheduled_tasks WHERE enabled = 1').all();
            for (const task of tasks) {
                this._scheduleTask(task);
            }
            this._addLog('system', `Scheduler başlatıldı. ${tasks.length} görev yüklendi.`);
        } catch (err) {
            console.error('[Scheduler] Init error:', err.message);
        }
    }

    _addLog(taskName, message) {
        const entry = {
            time: new Date().toISOString(),
            task: taskName,
            message,
        };
        this.executionLog.push(entry);
        // Son 100 log'u tut
        if (this.executionLog.length > 100) {
            this.executionLog = this.executionLog.slice(-100);
        }
        console.error(`[Scheduler] [${taskName}] ${message}`);
    }

    getExecutionLog() {
        return this.executionLog.slice(-50);
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
        this._addLog(task.name, `Görev oluşturuldu (${task.action}, her ${task.interval_minutes} dk)`);
        return task;
    }

    remove(id) {
        const db = getDb();
        const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
        this._clearTimer(id);
        db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
        if (task) this._addLog(task.name, 'Görev silindi');
    }

    toggle(id) {
        const db = getDb();
        const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
        if (!task) throw new Error('Görev bulunamadı');

        const newEnabled = task.enabled ? 0 : 1;
        db.prepare('UPDATE scheduled_tasks SET enabled = ? WHERE id = ?').run(newEnabled, id);

        if (newEnabled) {
            // next_run'ı şimdiden itibaren tekrar başlat
            const nextRun = Date.now() + (task.interval_minutes * 60 * 1000);
            db.prepare('UPDATE scheduled_tasks SET next_run = ? WHERE id = ?').run(nextRun.toString(), id);
            this._scheduleTask({ ...task, enabled: 1, next_run: nextRun.toString() });
            this._addLog(task.name, 'Görev aktif edildi');
        } else {
            this._clearTimer(id);
            this._addLog(task.name, 'Görev durduruldu');
        }

        return { enabled: !!newEnabled };
    }

    _scheduleTask(task) {
        if (!task.enabled || !task.interval_minutes) return;
        this._clearTimer(task.id);

        let nextRun = parseInt(task.next_run || '0', 10);
        const now = Date.now();
        const intervalMs = task.interval_minutes * 60 * 1000;

        if (!nextRun || nextRun < now) {
            nextRun = now + intervalMs;
            const db = getDb();
            db.prepare('UPDATE scheduled_tasks SET next_run = ? WHERE id = ?').run(nextRun.toString(), task.id);
        }

        const timeUntilFirstRun = nextRun - now;

        const timer = setTimeout(() => {
            this._executeTask(task);

            const intervalTimer = setInterval(() => {
                // Güncel task bilgisini DB'den oku (devre dışı bırakılmış olabilir)
                try {
                    const db = getDb();
                    const freshTask = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(task.id);
                    if (!freshTask || !freshTask.enabled) {
                        this._clearTimer(task.id);
                        return;
                    }
                    this._executeTask(freshTask);
                } catch (err) {
                    console.error(`[Scheduler] Interval check error:`, err.message);
                }
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
        this._addLog(task.name, `Görev çalıştırılıyor... (aksiyon: ${task.action})`);

        try {
            const db = getDb();
            const now = Date.now();
            const nextRun = now + (task.interval_minutes * 60 * 1000);

            db.prepare('UPDATE scheduled_tasks SET last_run = datetime("now"), next_run = ? WHERE id = ?').run(nextRun.toString(), task.id);

            // minecraftService singleton'ını al
            const mcService = require('./minecraftService');

            switch (task.action) {
                case 'restart': {
                    if (mcService.status === 'running') {
                        this._addLog(task.name, 'Sunucu yeniden başlatılıyor...');
                        // Önce uyarı gönder
                        try {
                            mcService.sendCommand('say §c[Otomatik] Sunucu 10 saniye içinde yeniden başlatılacak!');
                        } catch { /* sunucu komut kabul etmeyebilir */ }
                        await new Promise(r => setTimeout(r, 10000));
                        await mcService.restart();
                        this._addLog(task.name, 'Sunucu başarıyla yeniden başlatıldı');
                    } else {
                        this._addLog(task.name, `Sunucu çalışmıyor (durum: ${mcService.status}), restart atlandı`);
                    }
                    break;
                }

                case 'backup': {
                    this._addLog(task.name, 'Yedekleme başlatılıyor...');
                    try {
                        // Sunucu çalışıyorsa save-all gönder
                        if (mcService.status === 'running') {
                            try {
                                mcService.sendCommand('save-all');
                                mcService.sendCommand('say §e[Otomatik] Dünya kaydediliyor, yedek alınıyor...');
                            } catch { /* ignore */ }
                            await new Promise(r => setTimeout(r, 5000));
                        }

                        const WorldManager = require('./worldManager');
                        const wm = new WorldManager();
                        const worlds = wm.list();
                        let backedUp = 0;
                        for (const world of worlds) {
                            if (world.exists) {
                                wm.backup(world.name);
                                backedUp++;
                            }
                        }
                        this._addLog(task.name, `${backedUp} dünya yedeklendi`);

                        if (mcService.status === 'running') {
                            try { mcService.sendCommand('say §a[Otomatik] Yedekleme tamamlandı!'); } catch { /* ignore */ }
                        }
                    } catch (e) {
                        this._addLog(task.name, `Yedekleme hatası: ${e.message}`);
                    }
                    break;
                }

                case 'announce': {
                    const data = JSON.parse(task.action_data || '{}');
                    const message = data.message || 'Sunucu duyurusu';
                    if (mcService.status === 'running') {
                        try {
                            mcService.sendCommand(`say §b[Duyuru] ${message}`);
                            this._addLog(task.name, `Duyuru gönderildi: "${message}"`);
                        } catch (e) {
                            this._addLog(task.name, `Duyuru gönderilemedi: ${e.message}`);
                        }
                    } else {
                        this._addLog(task.name, `Sunucu çalışmıyor, duyuru atlandı`);
                    }
                    break;
                }

                case 'webhook': {
                    const webhookData = JSON.parse(task.action_data || '{}');
                    if (webhookData.url) {
                        await this._sendWebhook(webhookData.url, webhookData.message || `Zamanlanmış görev çalıştı: ${task.name}`);
                        this._addLog(task.name, 'Webhook gönderildi');
                    } else {
                        this._addLog(task.name, 'Webhook URL tanımlanmamış');
                    }
                    break;
                }

                case 'clear_items': {
                    if (mcService.status === 'running') {
                        try {
                            mcService.sendCommand('say §e[Dikkat] Yerdeki tüm eşyalar 10 saniye içinde silinecek!');
                            this._addLog(task.name, 'Açıklama: 10 saniye sonra eşyalar silinecek');
                            await new Promise(r => setTimeout(r, 10000));
                            mcService.sendCommand('kill @e[type=item]');
                            mcService.sendCommand('say §a[Sistem] Yerdeki eşyalar başarıyla temizlendi.');
                            this._addLog(task.name, 'Yerdeki eşyalar temizlendi');
                        } catch (e) {
                            this._addLog(task.name, `Eşya silme hatası: ${e.message}`);
                        }
                    } else {
                        this._addLog(task.name, `Sunucu çalışmıyor, temizleme atlandı`);
                    }
                    break;
                }

                case 'custom_command': {
                    if (mcService.status === 'running') {
                        try {
                            const data = JSON.parse(task.action_data || '{}');
                            if (data.command) {
                                mcService.sendCommand(data.command);
                                this._addLog(task.name, `Özel komut gönderildi: /${data.command}`);
                            } else {
                                this._addLog(task.name, 'Hata: Komut tanımlanmamış');
                            }
                        } catch (e) {
                            this._addLog(task.name, `Komut gönderme hatası: ${e.message}`);
                        }
                    } else {
                        this._addLog(task.name, `Sunucu çalışmıyor, komut atlandı`);
                    }
                    break;
                }

                default:
                    this._addLog(task.name, `Bilinmeyen aksiyon: ${task.action}`);
            }
        } catch (err) {
            this._addLog(task.name, `HATA: ${err.message}`);
            console.error(`[Scheduler] Task ${task.id} (${task.name}) error:`, err.message);
        }
    }

    async _sendWebhook(url, message) {
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const postData = JSON.stringify({ content: message });
                const protocol = urlObj.protocol === 'https:' ? https : http;
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port,
                    path: urlObj.pathname + urlObj.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                    },
                };

                const req = protocol.request(options, (res) => {
                    res.on('data', () => { });
                    res.on('end', () => resolve());
                });
                req.on('error', reject);
                req.write(postData);
                req.end();
            } catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = new Scheduler();
