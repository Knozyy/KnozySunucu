const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const systemService = require('../services/systemService');

const router = express.Router();

// GET /api/system/info - Total system info
router.get('/info', authMiddleware, async (req, res) => {
    try {
        const info = await systemService.getSystemInfo();
        res.json(info);
    } catch (error) {
        console.error('[System] Info error:', error.message);
        res.status(500).json({ error: 'Sistem bilgisi alınamadı' });
    }
});

// GET /api/system/usage - Current usage
router.get('/usage', authMiddleware, async (req, res) => {
    try {
        const usage = await systemService.getUsage();
        res.json(usage);
    } catch (error) {
        console.error('[System] Usage error:', error.message);
        res.status(500).json({ error: 'Kullanım bilgisi alınamadı' });
    }
});

// GET /api/system/uptime
router.get('/uptime', authMiddleware, (req, res) => {
    try {
        const uptime = systemService.getUptime();
        res.json(uptime);
    } catch (error) {
        console.error('[System] Uptime error:', error.message);
        res.status(500).json({ error: 'Uptime bilgisi alınamadı' });
    }
});

module.exports = router;
