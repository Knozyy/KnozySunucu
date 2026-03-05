const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const curseForge = require('../services/curseforgeService');
const { getDb } = require('../db/database');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Popüler modpackler
router.get('/popular', authMiddleware, async (req, res) => {
    try {
        const modpacks = await curseForge.getPopularModpacks(20);
        res.json({ modpacks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Arama
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const modpacks = await curseForge.searchModpacks(req.query.query || '');
        res.json({ modpacks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Yüklü modpackler
router.get('/installed', authMiddleware, (req, res) => {
    try {
        const modpacks = curseForge.getInstalledModpacks();
        res.json({ modpacks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aktif profil bilgisi
router.get('/active', authMiddleware, (req, res) => {
    try {
        const mcService = require('../services/minecraftService');
        const profile = mcService.getActiveProfile();
        res.json({
            profile,
            serverStatus: mcService.status,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modpack dosyaları (sürüm listesi)
router.get('/:modId/files', authMiddleware, async (req, res) => {
    try {
        const files = await curseForge.getModpackFiles(req.params.modId);
        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Güncelleme kontrolü
router.get('/:modId/check-update', authMiddleware, async (req, res) => {
    try {
        const result = await curseForge.checkUpdate(parseInt(req.params.modId));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Kurulum durumu
router.get('/install-status', authMiddleware, (req, res) => {
    res.json(curseForge.getInstallStatus());
});

// Modpack yükle
router.post('/install', authMiddleware, async (req, res) => {
    try {
        const { modId, fileId } = req.body;
        if (!modId) return res.status(400).json({ error: 'modId gerekli' });

        const result = await curseForge.installModpack(modId, fileId);
        res.json({ message: `${result.name} yüklendi!`, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modpack güncelle (sürüm değiştir)
router.post('/update', authMiddleware, async (req, res) => {
    try {
        const { dbId, modId, fileId } = req.body;
        if (!dbId || !modId || !fileId) {
            return res.status(400).json({ error: 'dbId, modId ve fileId gerekli' });
        }
        const result = await curseForge.updateModpack(dbId, modId, fileId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modpack kaldır (dosyaları da siler)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const result = await curseForge.uninstallModpack(parseInt(req.params.id));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Profil aktif et
router.post('/activate/:id', authMiddleware, async (req, res) => {
    try {
        const mcService = require('../services/minecraftService');
        const result = await mcService.switchProfile(parseInt(req.params.id));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modpack ayarları güncelle (port dahil)
router.put('/:id/settings', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        const { name, version, maxRam, minRam, jvmArgs, server_port } = req.body;

        const modpack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(id);
        if (!modpack) return res.status(404).json({ error: 'Modpack bulunamadı' });

        // DB güncelle
        if (name) db.prepare('UPDATE installed_modpacks SET name = ? WHERE id = ?').run(name, id);
        if (version) db.prepare('UPDATE installed_modpacks SET version = ? WHERE id = ?').run(version, id);
        if (server_port) db.prepare('UPDATE installed_modpacks SET server_port = ? WHERE id = ?').run(server_port, id);

        // Aktif modpack'se server.properties port ayarla
        if (server_port && modpack.is_active === 1 && modpack.install_path) {
            const propsPath = path.join(modpack.install_path, 'server.properties');
            if (fs.existsSync(propsPath)) {
                let content = fs.readFileSync(propsPath, 'utf-8');
                content = content.replace(/^server-port=.*/m, `server-port=${server_port}`);
                fs.writeFileSync(propsPath, content, 'utf-8');
            }
        }

        res.json({ message: 'Ayarlar güncellendi' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
