const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const minecraftService = require('../services/minecraftService');

const router = express.Router();

// GET /api/minecraft/status
router.get('/status', authMiddleware, (req, res) => {
    try {
        const status = minecraftService.getStatus();
        res.json(status);
    } catch (error) {
        console.error('[MC] Status error:', error.message);
        res.status(500).json({ error: 'Durum bilgisi alınamadı' });
    }
});

// POST /api/minecraft/start
router.post('/start', authMiddleware, requireRole(['admin', 'user']), (req, res) => {
    try {
        minecraftService.start();
        res.json({ message: 'Sunucu başlatılıyor...' });
    } catch (error) {
        console.error('[MC] Start error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/minecraft/stop
router.post('/stop', authMiddleware, requireRole(['admin', 'user']), (req, res) => {
    try {
        minecraftService.stop();
        res.json({ message: 'Sunucu durduruluyor...' });
    } catch (error) {
        console.error('[MC] Stop error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/minecraft/restart
router.post('/restart', authMiddleware, requireRole(['admin', 'user']), async (req, res) => {
    try {
        await minecraftService.restart();
        res.json({ message: 'Sunucu yeniden başlatılıyor...' });
    } catch (error) {
        console.error('[MC] Restart error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/minecraft/repair
router.post('/repair', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const result = minecraftService.repair();
        res.json(result);
    } catch (error) {
        console.error('[MC] Repair error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/minecraft/command
router.post('/command', authMiddleware, requireRole(['admin', 'user']), (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return res.status(400).json({ error: 'Komut gerekli' });
        minecraftService.sendCommand(command);
        res.json({ message: 'Komut gönderildi' });
    } catch (error) {
        console.error('[MC] Command error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// GET /api/minecraft/players
router.get('/players', authMiddleware, (req, res) => {
    try {
        const status = minecraftService.getStatus();
        res.json({ players: status.players, count: status.playerCount });
    } catch (error) {
        console.error('[MC] Players error:', error.message);
        res.status(500).json({ error: 'Oyuncu bilgisi alınamadı' });
    }
});

// GET /api/minecraft/properties
router.get('/properties', authMiddleware, (req, res) => {
    try {
        res.json(minecraftService.getProperties());
    } catch (error) {
        console.error('[MC] Properties read error:', error.message);
        res.status(500).json({ error: 'Özellikler okunamadı' });
    }
});

// PUT /api/minecraft/properties
router.put('/properties', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        minecraftService.setProperties(req.body);
        res.json({ message: 'Ayarlar güncellendi' });
    } catch (error) {
        console.error('[MC] Properties write error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/minecraft/logs
router.get('/logs', authMiddleware, (req, res) => {
    try {
        const count = parseInt(req.query.count) || 100;
        res.json({ logs: minecraftService.getRecentLogs(count) });
    } catch (error) {
        console.error('[MC] Logs error:', error.message);
        res.status(500).json({ error: 'Loglar alınamadı' });
    }
});

// GET /api/minecraft/detect-info
router.get('/detect-info', authMiddleware, (req, res) => {
    try {
        res.json({
            modLoader: minecraftService.detectModLoader(),
            mcVersion: minecraftService.detectMinecraftVersion(),
        });
    } catch (error) {
        res.status(500).json({ error: 'Tespit yapılamadı' });
    }
});

module.exports = router;
