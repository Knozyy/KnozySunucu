const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { getDb } = require('../db/database');
const { logAudit } = require('../services/auditService');

const router = express.Router();

// GET /api/servers
router.get('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const servers = db.prepare('SELECT * FROM servers ORDER BY is_active DESC, id ASC').all();
        res.json({ servers });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/servers
// NOT: RAM artık sunucuya özel değil; modpack veya jvm_args üzerinden okunur.
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, path, port = 25565, jvm_args = '' } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Sunucu adı gerekli' });
        if (!path?.trim()) return res.status(400).json({ error: 'Sunucu yolu gerekli' });
        const db = getDb();
        // Port benzersizliği — aynı port iki sunucuda çakışır
        const portTaken = db.prepare('SELECT id FROM servers WHERE port = ?').get(port);
        if (portTaken) return res.status(400).json({ error: `Port ${port} zaten başka bir sunucu tarafından kullanılıyor` });
        const result = db.prepare(
            'INSERT INTO servers (name, path, port, jvm_args, is_active) VALUES (?, ?, ?, ?, 0)'
        ).run(name.trim(), path.trim(), port, jvm_args);
        logAudit(req.user?.username || 'admin', 'sunucu_ekle', name.trim(), req.ip);
        res.status(201).json({ id: result.lastInsertRowid, message: 'Sunucu eklendi' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/servers/:id
router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, path, port, jvm_args } = req.body;
        const db = getDb();
        // Port benzersizliği — kendisi hariç başka sunucu aynı portu kullanıyorsa engelle
        if (port != null) {
            const portTaken = db.prepare('SELECT id FROM servers WHERE port = ? AND id != ?').get(port, req.params.id);
            if (portTaken) return res.status(400).json({ error: `Port ${port} zaten başka bir sunucu tarafından kullanılıyor` });
        }
        db.prepare(
            'UPDATE servers SET name = ?, path = ?, port = ?, jvm_args = ? WHERE id = ?'
        ).run(name, path, port, jvm_args, req.params.id);
        logAudit(req.user?.username || 'admin', 'sunucu_guncelle', name, req.ip);
        res.json({ message: 'Güncellendi' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/servers/:id/activate — aktif sunucuyu değiştir
router.post('/:id/activate', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
        if (!server) return res.status(404).json({ error: 'Sunucu bulunamadı' });

        db.prepare('UPDATE servers SET is_active = 0').run();
        db.prepare('UPDATE servers SET is_active = 1 WHERE id = ?').run(req.params.id);
        logAudit(req.user?.username || 'admin', 'sunucu_gecis', server.name, req.ip);
        res.json({ message: `"${server.name}" aktif sunucu olarak ayarlandı` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/servers/:id/start
router.post('/:id/start', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { serverManager } = require('../services/serverManager');
        const instance = serverManager.getInstance(parseInt(req.params.id));
        if (!instance) return res.status(404).json({ error: 'Sunucu bulunamadı' });
        // CPU auto-split
        const os = require('os');
        const runningCount = serverManager.getRunningCount() + 1;
        const coresPerServer = Math.max(1, Math.floor(os.cpus().length / runningCount));
        instance._cpuFlag = runningCount > 1 ? ` -XX:ActiveProcessorCount=${coresPerServer}` : '';
        instance.start();
        logAudit(req.user?.username || 'admin', 'sunucu_baslat', instance._serverConfig?.name || '', req.ip);
        res.json({ message: 'Sunucu başlatılıyor' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/servers/:id/stop
router.post('/:id/stop', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { serverManager } = require('../services/serverManager');
        const instance = serverManager.getInstance(parseInt(req.params.id));
        if (!instance) return res.status(404).json({ error: 'Sunucu bulunamadı' });
        await instance.stop();
        logAudit(req.user?.username || 'admin', 'sunucu_durdur', instance._serverConfig?.name || '', req.ip);
        res.json({ message: 'Sunucu durduruluyor' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/servers/:id/restart
router.post('/:id/restart', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { serverManager } = require('../services/serverManager');
        const instance = serverManager.getInstance(parseInt(req.params.id));
        if (!instance) return res.status(404).json({ error: 'Sunucu bulunamadı' });
        await instance.restart();
        logAudit(req.user?.username || 'admin', 'sunucu_yeniden_baslat', instance._serverConfig?.name || '', req.ip);
        res.json({ message: 'Yeniden başlatılıyor' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/servers/recommendations — yeni sunucu için kaynak önerileri
router.get('/recommendations', authMiddleware, (req, res) => {
    try {
        const os = require('os');
        const db = getDb();
        const servers = db.prepare('SELECT * FROM servers ORDER BY id ASC').all();

        // Port önerisi
        const usedPorts = servers.map(s => s.port);
        let suggestedPort = 25565;
        while (usedPorts.includes(suggestedPort)) suggestedPort++;

        // RAM hesabı
        const totalRamGB = Math.floor(os.totalmem() / (1024 ** 3));
        const parseGB = (str) => {
            if (!str) return 0;
            const m = str.match(/^(\d+)([GgMm])$/);
            if (!m) return 0;
            return m[2].toLowerCase() === 'g' ? parseInt(m[1]) : Math.ceil(parseInt(m[1]) / 1024);
        };
        // Aktif modpack'lerin max_ram toplamı (sunucuya özel RAM yok)
        const usedRamGB = servers.reduce((acc, s) => {
            if (!s.active_modpack_id) return acc;
            const pack = db.prepare('SELECT max_ram FROM installed_modpacks WHERE id = ?').get(s.active_modpack_id);
            return acc + parseGB(pack?.max_ram);
        }, 0);
        const freeRamGB = Math.max(0, totalRamGB - 2 - usedRamGB); // 2GB OS için ayrıldı
        const recMaxGB  = Math.max(2, freeRamGB);
        const recMinGB  = Math.max(1, Math.floor(recMaxGB * 0.6));

        // CPU önerisi
        const totalCores  = os.cpus().length;
        const serverCount = servers.length;
        // Java büyük ölçüde tek çekirdekte çalışır; çekirdekleri eşit böl
        const coresEach   = serverCount > 0 ? Math.floor(totalCores / (serverCount + 1)) : totalCores;
        // Yeni sunucu için başlangıç çekirdeği (0-indexed)
        const startCore   = serverCount > 0 ? serverCount * Math.floor(totalCores / (serverCount + 1)) : 0;
        const endCore     = Math.min(totalCores - 1, startCore + coresEach - 1);

        res.json({
            suggestedPort,
            usedPorts,
            totalRamGB,
            usedRamGB,
            freeRamGB,
            recommendedMaxRam: `${recMaxGB}G`,
            recommendedMinRam: `${recMinGB}G`,
            totalCores,
            suggestedCores: coresEach,
            suggestedCoreRange: serverCount > 0 ? `${startCore}-${endCore}` : `0-${totalCores - 1}`,
            serverCount,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/servers/:id/set-profile — sunucuya modpack profili ata
router.post('/:id/set-profile', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
        if (!server) return res.status(404).json({ error: 'Sunucu bulunamadı' });

        const { modpack_id } = req.body; // null ise profil kaldır

        if (modpack_id) {
            // Aynı profil başka bir sunucuda zaten açıksa engelle
            const conflict = db.prepare(
                'SELECT s.name FROM servers s WHERE s.active_modpack_id = ? AND s.id != ?'
            ).get(modpack_id, req.params.id);
            if (conflict) {
                return res.status(400).json({
                    error: `Bu profil "${conflict.name}" sunucusunda zaten aktif. Önce o sunucudan kaldırın.`
                });
            }
            const pack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(modpack_id);
            if (!pack) return res.status(404).json({ error: 'Modpack bulunamadı' });
        }

        db.prepare('UPDATE servers SET active_modpack_id = ? WHERE id = ?')
            .run(modpack_id || null, req.params.id);

        logAudit(req.user?.username || 'admin', 'sunucu_profil_ata', server.name, req.ip);
        res.json({ message: modpack_id ? 'Profil atandı' : 'Profil kaldırıldı' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/servers/status-all — tüm sunucuların durumu
router.get('/status-all', authMiddleware, (req, res) => {
    try {
        const { serverManager } = require('../services/serverManager');
        res.json({ servers: serverManager.getAllStatus() });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/servers/auto-restart — global ayar + tüm sunucuların çöküm durumu
router.get('/auto-restart', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'auto_restart_enabled'").get();
        const enabled = !setting || setting.value === '1';

        // Her sunucunun anlık çöküm sayacı
        const serverRegistry = require('../services/serverRegistry');
        const instances = [];
        try {
            for (const [id, inst] of serverRegistry._instances.entries()) {
                instances.push({
                    id,
                    name: inst._serverConfig?.name || `Sunucu #${id}`,
                    status: inst.status,
                    crashCount: inst._crashCount || 0,
                    crashWindowStart: inst._crashWindowStart || 0,
                });
            }
        } catch { /* ignore */ }

        // Son 24 saatteki çöküm kayıtları
        let recentCrashes = [];
        try {
            recentCrashes = db.prepare(`
                SELECT id, exit_code, auto_restarted, crash_count, occurred_at
                FROM crash_events
                WHERE occurred_at > datetime('now', '-24 hours')
                ORDER BY id DESC LIMIT 20
            `).all();
        } catch { /* ignore */ }

        res.json({ enabled, instances, recentCrashes });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/servers/auto-restart
router.post('/auto-restart', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const enabled = req.body.enabled ? '1' : '0';
        const db = getDb();
        db.prepare(`INSERT INTO app_settings (key, value) VALUES ('auto_restart_enabled', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
            .run(enabled);
        res.json({ enabled: enabled === '1' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/servers/:id/reset-crash-counter — çöküm döngüsü kilitlendiyse manuel sıfırla
router.post('/:id/reset-crash-counter', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const serverRegistry = require('../services/serverRegistry');
        const inst = serverRegistry.get(parseInt(req.params.id));
        if (!inst) return res.status(404).json({ error: 'Sunucu bulunamadı' });
        inst.resetCrashCounter();
        res.json({ message: 'Çöküm sayacı sıfırlandı', crashCount: 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/servers/:id
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
        if (!server) return res.status(404).json({ error: 'Sunucu bulunamadı' });
        if (server.is_active) return res.status(400).json({ error: 'Aktif sunucu silinemez' });
        db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
        logAudit(req.user?.username || 'admin', 'sunucu_sil', server.name, req.ip);
        res.json({ message: 'Silindi' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
