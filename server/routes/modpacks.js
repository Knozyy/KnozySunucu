const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const curseforgeService = require('../services/curseforgeService');

const router = express.Router();

// Lazy-load minecraft service (singleton)
let _mcService = null;
function getMcService() {
    if (!_mcService) {
        _mcService = require('../services/minecraftService');
    }
    return _mcService;
}

// GET /api/modpacks/search?query=
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Arama sorgusu gerekli' });
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

// GET /api/modpacks/install-status
router.get('/install-status', authMiddleware, (req, res) => {
    res.json(curseforgeService.getInstallStatus());
});

// POST /api/modpacks/install-status/reset
router.post('/install-status/reset', authMiddleware, (req, res) => {
    curseforgeService.resetInstallStatus();
    res.json({ message: 'Kurulum durumu sıfırlandı' });
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
        if (!modId) return res.status(400).json({ error: 'Mod ID gerekli' });

        // Async başlat, hemen cevap dön
        curseforgeService.installModpack(modId, fileId).catch(err => {
            console.error('[Modpacks] Install async error:', err.message);
        });

        res.json({ message: 'Kurulum başlatıldı. İlerlemeyi takip edebilirsiniz.' });
    } catch (error) {
        console.error('[Modpacks] Install error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/modpacks/update
router.post('/update', authMiddleware, async (req, res) => {
    try {
        const { dbId, modId, fileId } = req.body;
        if (!dbId || !modId || !fileId) {
            return res.status(400).json({ error: 'dbId, modId ve fileId gerekli' });
        }

        curseforgeService.updateModpack(dbId, modId, fileId).catch(err => {
            console.error('[Modpacks] Update async error:', err.message);
        });

        res.json({ message: 'Güncelleme başlatıldı.' });
    } catch (error) {
        console.error('[Modpacks] Update error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/modpacks/check-update
router.post('/check-update', authMiddleware, async (req, res) => {
    try {
        const { modpackId } = req.body;
        if (!modpackId) {
            // Yüklü ilk modpack'i kontrol et
            const installed = curseforgeService.getInstalledModpacks();
            if (installed.length === 0) return res.json({ hasUpdate: false });
            const result = await curseforgeService.checkUpdate(installed[0].curseforge_id);
            return res.json(result);
        }
        const result = await curseforgeService.checkUpdate(modpackId);
        res.json(result);
    } catch (error) {
        console.error('[Modpacks] Check update error:', error.message);
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

// PUT /api/modpacks/:id/settings
router.put('/:id/settings', authMiddleware, (req, res) => {
    try {
        const { name, version } = req.body;
        const db = require('../db/database').getDb();
        const modpack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(req.params.id);
        if (!modpack) return res.status(404).json({ error: 'Modpack bulunamadı' });

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

// GET /api/modpacks/active - Aktif profil bilgisi
router.get('/active', authMiddleware, (req, res) => {
    try {
        const mcService = getMcService();
        const profile = mcService.getActiveProfile();
        const serverStatus = mcService.getStatus().status;
        res.json({ profile, serverStatus });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/modpacks/activate/:id - Profil geçişi
router.post('/activate/:id', authMiddleware, async (req, res) => {
    try {
        const mcService = getMcService();
        const result = await mcService.switchProfile(parseInt(req.params.id));
        res.json(result);
    } catch (error) {
        console.error('[Modpacks] Activate error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
