const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

function getServerPath() {
    // Aktif profili kontrol et
    try {
        const { getDb } = require('../db/database');
        const db = getDb();
        const active = db.prepare('SELECT install_path FROM installed_modpacks WHERE is_active = 1 LIMIT 1').get();
        if (active?.install_path && fs.existsSync(active.install_path)) {
            return active.install_path;
        }
    } catch { /* fallback */ }
    return process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
}

function findLogsDir(serverPath) {
    const logsDir = path.join(serverPath, 'logs');
    if (fs.existsSync(logsDir)) return logsDir;

    // Alt klasörlerde ara
    try {
        const dirs = fs.readdirSync(serverPath).filter(d => {
            const full = path.join(serverPath, d);
            return fs.statSync(full).isDirectory() && !d.startsWith('.');
        });
        for (const dir of dirs) {
            const subLogs = path.join(serverPath, dir, 'logs');
            if (fs.existsSync(subLogs)) return subLogs;
        }
    } catch { /* ignore */ }

    return logsDir;
}

// GET /api/logs/files
router.get('/files', authMiddleware, (req, res) => {
    try {
        const logsDir = findLogsDir(getServerPath());

        if (!fs.existsSync(logsDir)) {
            return res.json({ files: [] });
        }

        const files = fs.readdirSync(logsDir)
            .filter(f => f.endsWith('.log') || f.endsWith('.log.gz'))
            .map(f => {
                try {
                    const stats = fs.statSync(path.join(logsDir, f));
                    return {
                        name: f,
                        size: stats.size,
                        modified: stats.mtime,
                        isCompressed: f.endsWith('.gz'),
                    };
                } catch { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.modified) - new Date(a.modified));

        res.json({ files });
    } catch (error) {
        console.error('[Logs] Files error:', error.message);
        res.status(500).json({ error: 'Log dosyaları alınamadı' });
    }
});

// GET /api/logs/latest?lines=200
router.get('/latest', authMiddleware, (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 200;
        const serverPath = getServerPath();
        const logsDir = findLogsDir(serverPath);
        const logFile = path.join(logsDir, 'latest.log');

        if (!fs.existsSync(logFile)) {
            return res.json({ content: '', lines: 0, totalLines: 0 });
        }

        const content = fs.readFileSync(logFile, 'utf-8');
        const allLines = content.split('\n');
        const lastLines = allLines.slice(-lines);

        res.json({
            content: lastLines.join('\n'),
            totalLines: allLines.length,
            returnedLines: lastLines.length,
        });
    } catch (error) {
        console.error('[Logs] Latest error:', error.message);
        res.status(500).json({ error: 'Loglar okunamadı' });
    }
});

// GET /api/logs/file/:filename
router.get('/file/:filename', authMiddleware, (req, res) => {
    try {
        const filename = req.params.filename;

        // Güvenlik: path traversal engelleme
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ error: 'Geçersiz dosya adı' });
        }

        const logsDir = findLogsDir(getServerPath());
        const filePath = path.join(logsDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Dosya bulunamadı' });
        }

        // .gz dosyası ise decompress et
        if (filename.endsWith('.gz')) {
            try {
                const compressed = fs.readFileSync(filePath);
                const decompressed = zlib.gunzipSync(compressed);
                const content = decompressed.toString('utf-8');
                res.json({ filename, content });
            } catch (err) {
                res.status(500).json({ error: 'Sıkıştırılmış dosya açılamadı' });
            }
            return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ filename, content });
    } catch (error) {
        console.error('[Logs] File read error:', error.message);
        res.status(500).json({ error: 'Dosya okunamadı' });
    }
});

// GET /api/logs/search?q=ERROR&file=latest.log
router.get('/search', authMiddleware, (req, res) => {
    try {
        const query = (req.query.q || '').toLowerCase();
        const fileName = req.query.file || 'latest.log';
        if (!query) return res.json({ results: [], count: 0 });

        const logsDir = findLogsDir(getServerPath());
        const filePath = path.join(logsDir, fileName);
        if (!fs.existsSync(filePath)) return res.json({ results: [], count: 0 });

        let content;
        if (fileName.endsWith('.gz')) {
            const compressed = fs.readFileSync(filePath);
            content = zlib.gunzipSync(compressed).toString('utf-8');
        } else {
            content = fs.readFileSync(filePath, 'utf-8');
        }

        const lines = content.split('\n');
        const results = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(query)) {
                results.push({ lineNumber: i + 1, content: lines[i] });
                if (results.length >= 200) break;
            }
        }

        res.json({ results, count: results.length, total: lines.length });
    } catch (error) {
        console.error('[Logs] Search error:', error.message);
        res.status(500).json({ error: 'Arama yapılamadı' });
    }
});

module.exports = router;
