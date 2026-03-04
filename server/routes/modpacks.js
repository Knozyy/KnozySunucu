const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const curseforgeService = require('../services/curseforgeService');

const router = express.Router();

// GET /api/modpacks/search?query=
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Arama sorgusu gerekli' });
        }

        const results = await curseforgeService.searchModpacks(query);
        res.json({ modpacks: results });
    } catch (error) {
        console.error('[Modpacks] Search error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/modpacks/popular
router.get('/popular', authMiddleware, async (req, res) => {
    try {
        const results = await curseforgeService.getPopularModpacks();
        res.json({ modpacks: results });
    } catch (error) {
        console.error('[Modpacks] Popular error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/modpacks/:modId/files
router.get('/:modId/files', authMiddleware, async (req, res) => {
    try {
        const files = await curseforgeService.getModpackFiles(parseInt(req.params.modId));
        res.json({ files });
    } catch (error) {
        console.error('[Modpacks] Files error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/modpacks/install
router.post('/install', authMiddleware, async (req, res) => {
    try {
        const { modId, fileId } = req.body;
        if (!modId) {
            return res.status(400).json({ error: 'Mod ID gerekli' });
        }

        const result = await curseforgeService.installModpack(modId, fileId);
        res.json({ message: 'Modpack yüklendi', ...result });
    } catch (error) {
        console.error('[Modpacks] Install error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/modpacks/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const result = await curseforgeService.uninstallModpack(parseInt(req.params.id));
        res.json(result);
    } catch (error) {
        console.error('[Modpacks] Uninstall error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/modpacks/installed
router.get('/installed', authMiddleware, (req, res) => {
    try {
        const installed = curseforgeService.getInstalledModpacks();
        res.json({ modpacks: installed });
    } catch (error) {
        console.error('[Modpacks] Installed error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/modpacks/:id/settings - Update modpack settings
router.put('/:id/settings', authMiddleware, (req, res) => {
    try {
        const { name, version } = req.body;
        const db = require('../db/database').getDb();

        const modpack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(req.params.id);
        if (!modpack) {
            return res.status(404).json({ error: 'Modpack bulunamadı' });
        }

        db.prepare(`
            UPDATE installed_modpacks 
            SET name = COALESCE(?, name), version = COALESCE(?, version)
            WHERE id = ?
        `).run(name || null, version || null, req.params.id);

        res.json({ message: 'Modpack ayarları güncellendi' });
    } catch (error) {
        console.error('[Modpacks] Settings update error:', error.message);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
});

module.exports = router;
