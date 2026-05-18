const express = require('express');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const WorldManager = require('../services/worldManager');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
    const wm = new WorldManager();
    res.json({ worlds: wm.list(), totalSize: wm.totalSize() });
});

router.post('/reset', authMiddleware, (req, res) => {
    try {
        if (!req.body.worldName) return res.status(400).json({ error: 'Dünya adı gerekli' });
        const wm = new WorldManager();
        const result = wm.reset(req.body.worldName);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/backup', authMiddleware, (req, res) => {
    try {
        if (!req.body.worldName) return res.status(400).json({ error: 'Dünya adı gerekli' });
        const wm = new WorldManager();
        const result = wm.backup(req.body.worldName);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/worlds/seed - server.properties'ten level-seed okur
router.get('/seed', authMiddleware, (req, res) => {
    try {
        const wm = new WorldManager();
        const propsPath = path.join(wm.serverPath, 'server.properties');
        if (!fs.existsSync(propsPath)) return res.json({ seed: null, message: 'server.properties bulunamadı' });
        const content = fs.readFileSync(propsPath, 'utf-8');
        const match = content.match(/^level-seed\s*=\s*(.*)$/m);
        const seed = match ? (match[1].trim() || '(rastgele)') : '(bulunamadı)';
        res.json({ seed });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/worlds/disk - sunucu klasörü boyut dökümü
router.get('/disk', authMiddleware, async (req, res) => {
    try {
        const wm = new WorldManager();
        const serverPath = wm.serverPath;

        function dirSize(p) {
            let s = 0;
            try {
                for (const item of fs.readdirSync(p)) {
                    const fp = path.join(p, item);
                    try {
                        const st = fs.lstatSync(fp);
                        if (st.isSymbolicLink()) continue;
                        s += st.isDirectory() ? dirSize(fp) : st.size;
                    } catch { /* ignore */ }
                }
            } catch { /* ignore */ }
            return s;
        }

        const KNOWN = ['world', 'world_nether', 'world_the_end', 'mods', 'config', 'logs', 'backups', 'plugins', 'crash-reports'];
        const folders = [];
        let otherBytes = 0;

        try {
            for (const item of fs.readdirSync(serverPath)) {
                const fp = path.join(serverPath, item);
                try {
                    const st = fs.lstatSync(fp);
                    if (!st.isDirectory()) continue;
                    const size = dirSize(fp);
                    if (KNOWN.includes(item)) {
                        folders.push({ name: item, bytes: size });
                    } else {
                        otherBytes += size;
                    }
                } catch { /* ignore */ }
            }
        } catch { /* ignore */ }

        if (otherBytes > 0) folders.push({ name: 'diğer', bytes: otherBytes });
        folders.sort((a, b) => b.bytes - a.bytes);

        const totalBytes = folders.reduce((s, f) => s + f.bytes, 0);
        const fmt = (b) => {
            if (b <= 0) return '0 B';
            const u = ['B','KB','MB','GB'];
            const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
            return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
        };

        // Sistem diski bilgisi
        let sysDisk = null;
        try {
            const si = require('systeminformation');
            const disks = await si.fsSize();
            const d = disks.find(x => x.mount === '/') || disks[0];
            if (d) sysDisk = { totalGB: +(d.size / 1e9).toFixed(1), usedGB: +(d.used / 1e9).toFixed(1), percent: d.use };
        } catch { /* ignore */ }

        res.json({
            folders: folders.map(f => ({ ...f, formatted: fmt(f.bytes), percent: totalBytes ? Math.round((f.bytes / totalBytes) * 100) : 0 })),
            totalBytes,
            totalFormatted: fmt(totalBytes),
            sysDisk,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
