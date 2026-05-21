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
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, path, port = 25565, min_ram = '2G', max_ram = '4G', jvm_args = '' } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Sunucu adı gerekli' });
        if (!path?.trim()) return res.status(400).json({ error: 'Sunucu yolu gerekli' });
        const db = getDb();
        const result = db.prepare(
            'INSERT INTO servers (name, path, port, min_ram, max_ram, jvm_args, is_active) VALUES (?, ?, ?, ?, ?, ?, 0)'
        ).run(name.trim(), path.trim(), port, min_ram, max_ram, jvm_args);
        logAudit(req.user?.username || 'admin', 'sunucu_ekle', name.trim(), req.ip);
        res.status(201).json({ id: result.lastInsertRowid, message: 'Sunucu eklendi' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/servers/:id
router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { name, path, port, min_ram, max_ram, jvm_args } = req.body;
        const db = getDb();
        db.prepare(
            'UPDATE servers SET name = ?, path = ?, port = ?, min_ram = ?, max_ram = ?, jvm_args = ? WHERE id = ?'
        ).run(name, path, port, min_ram, max_ram, jvm_args, req.params.id);
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

        const minecraftService = require('../services/minecraftService');
        if (minecraftService.status === 'running') {
            return res.status(400).json({ error: 'Sunucu çalışırken geçiş yapamazsınız. Önce durdurun.' });
        }

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

// GET /api/servers/status-all — tüm sunucuların durumu
router.get('/status-all', authMiddleware, (req, res) => {
    try {
        const { serverManager } = require('../services/serverManager');
        res.json({ servers: serverManager.getAllStatus() });
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
