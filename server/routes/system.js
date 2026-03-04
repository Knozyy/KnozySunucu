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

// GET /api/system/ram-recommendation - RAM önerisi
router.get('/ram-recommendation', authMiddleware, async (req, res) => {
    try {
        const RAMOptimizer = require('../services/ramOptimizer');
        const modCount = parseInt(req.query.modCount) || 0;
        const recommendation = await RAMOptimizer.getRecommendation(modCount);
        res.json(recommendation);
    } catch (error) {
        console.error('[System] RAM recommendation error:', error.message);
        res.status(500).json({ error: 'RAM önerisi alınamadı' });
    }
});

// PUT /api/system/ram-settings - RAM ayarlarını .env dosyasına kaydet
router.put('/ram-settings', authMiddleware, (req, res) => {
    try {
        const { minRam, maxRam, jvmArgs } = req.body;
        const fs = require('fs');
        const path = require('path');
        const envPath = path.resolve(__dirname, '../../.env');

        let envContent = fs.readFileSync(envPath, 'utf-8');

        if (minRam) {
            envContent = envContent.replace(/MINECRAFT_MIN_RAM=.*/g, `MINECRAFT_MIN_RAM=${minRam}`);
        }
        if (maxRam) {
            envContent = envContent.replace(/MINECRAFT_MAX_RAM=.*/g, `MINECRAFT_MAX_RAM=${maxRam}`);
        }

        // JVM_ARGS satırı yoksa ekle, varsa güncelle
        if (jvmArgs !== undefined) {
            if (envContent.includes('JVM_ARGS=')) {
                envContent = envContent.replace(/JVM_ARGS=.*/g, `JVM_ARGS=${jvmArgs}`);
            } else {
                envContent += `\nJVM_ARGS=${jvmArgs}`;
            }
        }

        fs.writeFileSync(envPath, envContent);

        // Env'yi runtime'da da güncelle
        if (minRam) process.env.MINECRAFT_MIN_RAM = minRam;
        if (maxRam) process.env.MINECRAFT_MAX_RAM = maxRam;
        if (jvmArgs !== undefined) process.env.JVM_ARGS = jvmArgs;

        res.json({
            message: 'RAM ayarları güncellendi. Değişikliklerin etkili olması için sunucuyu yeniden başlatın.',
            current: {
                minRam: process.env.MINECRAFT_MIN_RAM,
                maxRam: process.env.MINECRAFT_MAX_RAM,
                jvmArgs: process.env.JVM_ARGS || '',
            }
        });
    } catch (error) {
        console.error('[System] RAM settings error:', error.message);
        res.status(500).json({ error: 'RAM ayarları güncellenemedi' });
    }
});

// GET /api/system/ram-settings - Mevcut RAM ayarlarını getir
router.get('/ram-settings', authMiddleware, (req, res) => {
    res.json({
        minRam: process.env.MINECRAFT_MIN_RAM || '2G',
        maxRam: process.env.MINECRAFT_MAX_RAM || '4G',
        jvmArgs: process.env.JVM_ARGS || '',
    });
});

module.exports = router;
