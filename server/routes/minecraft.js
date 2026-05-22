const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const serverRegistry = require('../services/serverRegistry');
const { getDb } = require('../db/database');
const { logAudit } = require('../services/auditService');

const router = express.Router();

/**
 * Query string / body / params içindeki serverId'yi instance'a çevir.
 * Belirtilmemişse default sunucuyu (ilk kayıt) kullanır.
 */
function resolveInstance(req) {
    const sid = req.query.serverId || req.body?.serverId || req.params?.serverId || null;
    if (sid) {
        const inst = serverRegistry.get(sid);
        if (inst) return inst;
    }
    return serverRegistry.getDefault();
}

// Tüm endpoint'lerde "Sunucu yok" hatası için ortak yardımcı
function noServer(res) {
    return res.status(404).json({ error: 'Sunucu bulunamadı (DB boş olabilir)' });
}

// GET /api/minecraft/status?serverId=X
router.get('/status', authMiddleware, (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return res.json({ status: 'stopped', players: [], playerCount: 0, processStats: { cpuPercent: 0, memoryMB: 0 }, name: 'Sunucu' });
        const statusData = inst.getStatus();
        // Sunucu adını da ekle (Discord botu için)
        statusData.name = inst._serverConfig?.name || 'Sunucu';
        res.json(statusData);
    } catch (error) {
        console.error('[MC] Status error:', error.message);
        res.status(500).json({ error: 'Durum bilgisi alınamadı' });
    }
});

// POST /api/minecraft/start?serverId=X
router.post('/start', authMiddleware, requireRole(['admin', 'user']), (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return noServer(res);
        // CPU auto-split
        const os = require('os');
        const runningCount = serverRegistry.getRunningCount() + 1;
        const coresPerServer = Math.max(1, Math.floor(os.cpus().length / runningCount));
        inst._cpuFlag = runningCount > 1 ? ` -XX:ActiveProcessorCount=${coresPerServer}` : '';
        inst.start();
        logAudit(req.user?.username, 'sunucu_baslat', inst._serverConfig?.name || '', req.ip);
        res.json({ message: 'Sunucu başlatılıyor...' });
    } catch (error) {
        console.error('[MC] Start error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/minecraft/stop?serverId=X
router.post('/stop', authMiddleware, requireRole(['admin', 'user']), (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return noServer(res);
        inst.stop();
        logAudit(req.user?.username, 'sunucu_durdur', inst._serverConfig?.name || '', req.ip);
        res.json({ message: 'Sunucu durduruluyor...' });
    } catch (error) {
        console.error('[MC] Stop error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/minecraft/restart?serverId=X
router.post('/restart', authMiddleware, requireRole(['admin', 'user']), async (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return noServer(res);
        await inst.restart();
        logAudit(req.user?.username, 'sunucu_yeniden_baslat', inst._serverConfig?.name || '', req.ip);
        res.json({ message: 'Sunucu yeniden başlatılıyor...' });
    } catch (error) {
        console.error('[MC] Restart error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/minecraft/repair?serverId=X
router.post('/repair', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return noServer(res);
        const result = inst.repair();
        res.json(result);
    } catch (error) {
        console.error('[MC] Repair error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/minecraft/command?serverId=X
router.post('/command', authMiddleware, requireRole(['admin', 'user']), (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return res.status(400).json({ error: 'Komut gerekli' });
        const inst = resolveInstance(req);
        if (!inst) return noServer(res);
        inst.sendCommand(command);
        res.json({ message: 'Komut gönderildi' });
    } catch (error) {
        console.error('[MC] Command error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// GET /api/minecraft/players?serverId=X
router.get('/players', authMiddleware, (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return res.json({ players: [], count: 0 });
        const status = inst.getStatus();
        res.json({ players: status.players, count: status.playerCount });
    } catch (error) {
        console.error('[MC] Players error:', error.message);
        res.status(500).json({ error: 'Oyuncu bilgisi alınamadı' });
    }
});

// GET /api/minecraft/properties?serverId=X
router.get('/properties', authMiddleware, (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return res.json({});
        res.json(inst.getProperties());
    } catch (error) {
        console.error('[MC] Properties read error:', error.message);
        res.status(500).json({ error: 'Özellikler okunamadı' });
    }
});

// PUT /api/minecraft/properties?serverId=X
router.put('/properties', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return noServer(res);
        // serverId body'de gelmiş olabilir — props'tan ayırt edelim
        const { serverId, ...props } = req.body;
        inst.setProperties(props);
        res.json({ message: 'Ayarlar güncellendi' });
    } catch (error) {
        console.error('[MC] Properties write error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/minecraft/logs?serverId=X
router.get('/logs', authMiddleware, (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return res.json({ logs: [] });
        const count = parseInt(req.query.count) || 100;
        res.json({ logs: inst.getRecentLogs(count) });
    } catch (error) {
        console.error('[MC] Logs error:', error.message);
        res.status(500).json({ error: 'Loglar alınamadı' });
    }
});

// GET /api/minecraft/detect-info?serverId=X
router.get('/detect-info', authMiddleware, (req, res) => {
    try {
        const inst = resolveInstance(req);
        if (!inst) return res.json({ modLoader: 'forge', mcVersion: '1.20.1' });
        res.json({
            modLoader: inst.detectModLoader(),
            mcVersion: inst.detectMinecraftVersion(),
        });
    } catch (error) {
        res.status(500).json({ error: 'Tespit yapılamadı' });
    }
});

// GET /api/minecraft/auto-restart — global ayar (sunucu bağımsız)
router.get('/auto-restart', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'auto_restart_enabled'").get();
        const enabled = !setting || setting.value === '1';
        const crashes = db.prepare("SELECT * FROM crash_events ORDER BY occurred_at DESC LIMIT 10").all();
        res.json({ enabled, crashes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/minecraft/auto-restart — global ayar
router.put('/auto-restart', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { enabled } = req.body;
        const db = getDb();
        db.prepare(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('auto_restart_enabled', ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(enabled ? '1' : '0');
        res.json({ enabled: !!enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
