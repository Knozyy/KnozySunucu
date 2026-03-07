const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const curseForge = require('../services/curseforgeService');
const ftbService = require('../services/ftbService');
const { getDb } = require('../db/database');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const getService = (req) => {
    const provider = req.query.provider || req.body.provider || 'curseforge';
    return provider === 'ftb' ? ftbService : curseForge;
};


// Popüler modpackler
router.get('/popular', authMiddleware, async (req, res) => {
    try {
        const service = getService(req);
        const modpacks = await service.getPopularModpacks(20);
        res.json({ modpacks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Arama
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const service = getService(req);
        const modpacks = await service.searchModpacks(req.query.query || '');
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
        const service = getService(req);
        const files = await service.getModpackFiles(req.params.modId);
        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Güncelleme kontrolü - sadece curseforge şimdilik
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
    const provider = req.query.provider || 'curseforge';
    const service = provider === 'ftb' ? ftbService : curseForge;

    // Check both services if provider isn't explicit and one is active
    let status = service.getInstallStatus();
    if (!status.isInstalling) {
        const otherService = provider === 'ftb' ? curseForge : ftbService;
        const otherStatus = otherService.getInstallStatus();
        if (otherStatus.isInstalling) status = otherStatus;
    }

    res.json(status);
});

// Modpack yükle
router.post('/install', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { modId, fileId } = req.body;
        if (!modId) return res.status(400).json({ error: 'modId gerekli' });

        const service = getService(req);
        const result = await service.installModpack(modId, fileId);
        res.json({ message: `${result.name} yüklendi!`, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modpack güncelle (sürüm değiştir)
router.post('/update', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { dbId, modId, fileId } = req.body;
        if (!dbId || !modId || !fileId) {
            return res.status(400).json({ error: 'dbId, modId ve fileId gerekli' });
        }

        const db = getDb();
        const modpack = db.prepare('SELECT provider FROM installed_modpacks WHERE id = ?').get(dbId);
        const provider = modpack?.provider || 'curseforge';
        const service = provider === 'ftb' ? ftbService : curseForge;

        // Note: FTB Update logic might need special handling later, acting as Curseforge for now
        const result = await service.updateModpack ? await service.updateModpack(dbId, modId, fileId) : await curseForge.updateModpack(dbId, modId, fileId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modpack kaldır (dosyaları da siler)
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const result = await curseForge.uninstallModpack(parseInt(req.params.id));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Profil aktif et
router.post('/activate/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const mcService = require('../services/minecraftService');
        const result = await mcService.switchProfile(parseInt(req.params.id));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modpack ayarları (RAM ve Properties) getir
router.get('/:id/settings', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        const modpack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(id);

        if (!modpack) return res.status(404).json({ error: 'Modpack bulunamadı' });

        const settings = {
            id: modpack.id,
            name: modpack.name,
            version: modpack.version,
            server_port: modpack.server_port,
            minRam: modpack.min_ram || '',
            maxRam: modpack.max_ram || '',
            jvmArgs: modpack.jvm_args || '',
            properties: {}
        };

        // Eğer kuruluysa server.properties oku
        if (modpack.install_path) {
            const fs = require('fs');
            const path = require('path');
            const propsPath = path.join(modpack.install_path, 'server.properties');

            if (fs.existsSync(propsPath)) {
                const content = fs.readFileSync(propsPath, 'utf-8');
                content.split('\n').forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) return;
                    const eqIndex = trimmed.indexOf('=');
                    if (eqIndex === -1) return;
                    settings.properties[trimmed.substring(0, eqIndex).trim()] = trimmed.substring(eqIndex + 1).trim();
                });
            }
        }

        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modpack ayarları güncelle (Port, RAM ve Properties)
router.put('/:id/settings', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const db = getDb();
        const id = parseInt(req.params.id);
        const { name, version, server_port, minRam, maxRam, jvmArgs, properties } = req.body;

        const modpack = db.prepare('SELECT * FROM installed_modpacks WHERE id = ?').get(id);
        if (!modpack) return res.status(404).json({ error: 'Modpack bulunamadı' });

        // DB güncelle
        if (name) db.prepare('UPDATE installed_modpacks SET name = ? WHERE id = ?').run(name, id);
        if (version !== undefined) db.prepare('UPDATE installed_modpacks SET version = ? WHERE id = ?').run(version, id);
        if (server_port) db.prepare('UPDATE installed_modpacks SET server_port = ? WHERE id = ?').run(server_port, id);

        // RAM ayarlarını DB'ye yaz (boş bırakılabilir)
        db.prepare('UPDATE installed_modpacks SET min_ram = ?, max_ram = ?, jvm_args = ? WHERE id = ?')
            .run(minRam || '', maxRam || '', jvmArgs || '', id);

        // Properties (Oyun Ayarları) güncelle
        if (properties && typeof properties === 'object' && modpack.install_path) {
            const fs = require('fs');
            const path = require('path');
            const propsPath = path.join(modpack.install_path, 'server.properties');

            // Port'u properties nesnesine de ekle ki dosyaya yazılsın
            if (server_port) {
                properties['server-port'] = server_port;
            }

            if (fs.existsSync(propsPath)) {
                let content = fs.readFileSync(propsPath, 'utf-8');
                const lines = content.split('\n');

                for (const [key, value] of Object.entries(properties)) {
                    let found = false;
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith(key + '=')) {
                            lines[i] = `${key}=${value}`;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        lines.push(`${key}=${value}`);
                    }
                }

                fs.writeFileSync(propsPath, lines.join('\n'), 'utf-8');
            }
        } else if (server_port && modpack.install_path) {
            // Sadece port değiştiyse ve eski formatta properties gelmediyse port'u uygula
            const fs = require('fs');
            const path = require('path');
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
