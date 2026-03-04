const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const JavaManager = require('../services/javaManager');

const router = express.Router();

// GET /api/java/installed
router.get('/installed', authMiddleware, (req, res) => {
    try {
        const javaManager = new JavaManager();
        const installed = javaManager.listInstalled();
        res.json({ versions: installed });
    } catch (error) {
        console.error('[Java] List error:', error.message);
        res.status(500).json({ error: 'Java sürümleri listelenemedi' });
    }
});

// GET /api/java/required?mcVersion=1.20.1
router.get('/required', authMiddleware, (req, res) => {
    try {
        const javaManager = new JavaManager();
        const mcVersion = req.query.mcVersion || '1.20.1';
        const required = javaManager.getRequiredVersion(mcVersion);
        const isInstalled = javaManager.isVersionInstalled(required);
        const javaPath = javaManager.getJavaPath(required);

        res.json({
            mcVersion,
            requiredJava: required,
            isInstalled,
            javaPath,
        });
    } catch (error) {
        console.error('[Java] Required error:', error.message);
        res.status(500).json({ error: 'Java sürüm bilgisi alınamadı' });
    }
});

// POST /api/java/install
router.post('/install', authMiddleware, async (req, res) => {
    try {
        const { version } = req.body;
        if (!version) return res.status(400).json({ error: 'Java sürümü gerekli' });

        const javaManager = new JavaManager();
        if (javaManager.isVersionInstalled(version)) {
            return res.json({ message: `Java ${version} zaten kurulu` });
        }

        // Async başlat
        javaManager.install(version, (progress, status) => {
            // Progress callback - ileride WebSocket entegrasyonu yapılabilir
        }).then(() => {
            console.error(`[Java] Java ${version} kurulumu tamamlandı`);
        }).catch(err => {
            console.error(`[Java] Java ${version} kurulum hatası:`, err.message);
        });

        res.json({ message: `Java ${version} kurulumu başlatıldı` });
    } catch (error) {
        console.error('[Java] Install error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/java/cleanup
router.delete('/cleanup', authMiddleware, (req, res) => {
    try {
        const { keepVersion } = req.query;
        if (!keepVersion) return res.status(400).json({ error: 'keepVersion gerekli' });
        const javaManager = new JavaManager();
        const removed = javaManager.cleanup(parseInt(keepVersion));
        res.json({ message: `${removed.length} eski sürüm silindi`, removed });
    } catch (error) {
        console.error('[Java] Cleanup error:', error.message);
        res.status(500).json({ error: 'Temizlik yapılamadı' });
    }
});

module.exports = router;
