const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const FileManager = require('../services/fileManager');
const serverRegistry = require('../services/serverRegistry');

const router = express.Router();

/**
 * Sunucuya özel FileManager üret.
 * `?serverId=X` varsa o sunucunun path'i kullanılır, yoksa default sunucu.
 */
function fmFor(req) {
    const sid = req.query.serverId || req.body?.serverId || null;
    const inst = sid ? serverRegistry.get(sid) : serverRegistry.getDefault();
    const basePath = inst?.getServerPath();
    return new FileManager(basePath);
}

// GET /api/files/list?path=&serverId=X
router.get('/list', authMiddleware, (req, res) => {
    try {
        const items = fmFor(req).list(req.query.path || '');
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/files/read?path=&serverId=X
router.get('/read', authMiddleware, (req, res) => {
    try {
        const content = fmFor(req).read(req.query.path);
        res.json({ content, path: req.query.path });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/files/write   body: { path, content, serverId? }
router.put('/write', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        fmFor(req).write(req.body.path, req.body.content);
        res.json({ message: 'Dosya kaydedildi' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/files/create   body: { path, isDirectory, serverId? }
router.post('/create', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        fmFor(req).create(req.body.path, req.body.isDirectory);
        res.json({ message: 'Oluşturuldu' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/files/delete?path=&serverId=X
router.delete('/delete', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        fmFor(req).remove(req.query.path);
        res.json({ message: 'Silindi' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/files/rename   body: { path, newName, serverId? }
router.put('/rename', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        fmFor(req).rename(req.body.path, req.body.newName);
        res.json({ message: 'Yeniden adlandırıldı' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
