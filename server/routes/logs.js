const express = require('express');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

function getServerPath() {
    return process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
}

// GET /api/logs/files
router.get('/files', authMiddleware, (req, res) => {
    try {
        const logsDir = path.join(getServerPath(), 'logs');

        if (!fs.existsSync(logsDir)) {
            return res.json({ files: [] });
        }

        const files = fs.readdirSync(logsDir)
            .filter(f => f.endsWith('.log') || f.endsWith('.log.gz'))
            .map(f => {
                const stats = fs.statSync(path.join(logsDir, f));
                return {
                    name: f,
                    size: stats.size,
                    modified: stats.mtime,
                };
            })
            .sort((a, b) => b.modified - a.modified);

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
        const logFile = path.join(getServerPath(), 'logs', 'latest.log');

        if (!fs.existsSync(logFile)) {
            return res.json({ content: '', lines: 0 });
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

        const filePath = path.join(getServerPath(), 'logs', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Dosya bulunamadı' });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ filename, content });
    } catch (error) {
        console.error('[Logs] File read error:', error.message);
        res.status(500).json({ error: 'Dosya okunamadı' });
    }
});

module.exports = router;
