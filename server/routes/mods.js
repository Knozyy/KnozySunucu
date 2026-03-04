const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const ModManager = require('../services/modManager');
const https = require('https');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const CF_API = 'https://api.curseforge.com';
const CF_KEY = process.env.CURSEFORGE_API_KEY;

router.get('/', authMiddleware, (req, res) => {
    const mm = new ModManager();
    res.json({ mods: mm.listAll(), count: mm.count() });
});

router.post('/disable', authMiddleware, (req, res) => {
    try { const mm = new ModManager(); mm.disable(req.body.name); res.json({ message: 'Mod devre dışı bırakıldı' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/enable', authMiddleware, (req, res) => {
    try { const mm = new ModManager(); mm.enable(req.body.name); res.json({ message: 'Mod aktif edildi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:name', authMiddleware, (req, res) => {
    try { const mm = new ModManager(); mm.remove(req.params.name); res.json({ message: 'Mod silindi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

// CurseForge mod arama
router.get('/search', authMiddleware, async (req, res) => {
    try {
        if (!CF_KEY) return res.status(400).json({ error: 'CurseForge API key ayarlanmamış' });
        const query = req.query.q;
        if (!query) return res.status(400).json({ error: 'Arama sorgusu gerekli' });

        const url = `${CF_API}/v1/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(query)}&pageSize=20&sortField=2&sortOrder=desc`;
        const data = await cfRequest(url);
        const mods = (data.data || []).map(m => ({
            id: m.id,
            name: m.name,
            summary: m.summary,
            downloadCount: m.downloadCount,
            logo: m.logo?.thumbnailUrl,
            latestFile: m.latestFiles?.[0] ? {
                id: m.latestFiles[0].id,
                fileName: m.latestFiles[0].fileName,
                downloadUrl: m.latestFiles[0].downloadUrl,
                gameVersions: m.latestFiles[0].gameVersions,
            } : null,
        }));
        res.json({ mods });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// CurseForge mod indirme
router.post('/download', authMiddleware, async (req, res) => {
    try {
        if (!CF_KEY) return res.status(400).json({ error: 'CurseForge API key ayarlanmamış' });
        const { modId, fileId, fileName } = req.body;
        if (!modId || !fileId) return res.status(400).json({ error: 'modId ve fileId gerekli' });

        // İndirme URL'sini al
        const url = `${CF_API}/v1/mods/${modId}/files/${fileId}/download-url`;
        const data = await cfRequest(url);
        const downloadUrl = data.data;
        if (!downloadUrl) return res.status(400).json({ error: 'İndirme URL bulunamadı' });

        const serverPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
        const modsDir = path.join(serverPath, 'mods');
        if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

        const filePath = path.join(modsDir, fileName || `mod-${modId}-${fileId}.jar`);

        // İndir
        await new Promise((resolve, reject) => {
            const download = (u) => {
                https.get(u, { headers: { 'x-api-key': CF_KEY } }, (response) => {
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        download(response.headers.location);
                        return;
                    }
                    const file = fs.createWriteStream(filePath);
                    response.pipe(file);
                    file.on('finish', () => { file.close(); resolve(); });
                    file.on('error', reject);
                }).on('error', reject);
            };
            download(downloadUrl);
        });

        res.json({ message: `${fileName || 'Mod'} indirildi!`, fileName });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Config editorü - config/ klasöründeki dosyaları listele
router.get('/configs', authMiddleware, (req, res) => {
    try {
        const serverPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
        const configDir = path.join(serverPath, 'config');
        if (!fs.existsSync(configDir)) return res.json({ files: [] });

        const files = listConfigFiles(configDir, configDir);
        res.json({ files });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Config dosyası okuma
router.get('/configs/read', authMiddleware, (req, res) => {
    try {
        const serverPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
        const filePath = path.join(serverPath, 'config', req.query.path || '');
        if (!filePath.startsWith(path.join(serverPath, 'config'))) return res.status(403).json({ error: 'Geçersiz yol' });
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya bulunamadı' });

        const stat = fs.statSync(filePath);
        if (stat.size > 512 * 1024) return res.status(400).json({ error: 'Dosya çok büyük' });

        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ content, path: req.query.path });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Config dosyası yazma
router.put('/configs/write', authMiddleware, (req, res) => {
    try {
        const serverPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
        const filePath = path.join(serverPath, 'config', req.body.path || '');
        if (!filePath.startsWith(path.join(serverPath, 'config'))) return res.status(403).json({ error: 'Geçersiz yol' });

        fs.writeFileSync(filePath, req.body.content, 'utf-8');
        res.json({ message: 'Config kaydedildi' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

function cfRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'x-api-key': CF_KEY, Accept: 'application/json' } }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('API yanıtı ayrıştırılamadı')); } });
        }).on('error', reject);
    });
}

function listConfigFiles(dir, baseDir) {
    const files = [];
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                files.push(...listConfigFiles(fullPath, baseDir));
            } else {
                const ext = path.extname(item).toLowerCase();
                if (['.toml', '.cfg', '.properties', '.json', '.yml', '.yaml', '.txt', '.conf'].includes(ext)) {
                    files.push({ name: item, path: relativePath, size: stat.size });
                }
            }
        }
    } catch { /* ignore */ }
    return files;
}

module.exports = router;
