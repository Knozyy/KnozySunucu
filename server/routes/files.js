const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const FileManager = require('../services/fileManager');

const router = express.Router();

// GET /api/files/list?path=
router.get('/list', authMiddleware, (req, res) => {
    try {
        const fm = new FileManager();
        const items = fm.list(req.query.path || '');
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/files/read?path=
router.get('/read', authMiddleware, (req, res) => {
    try {
        const fm = new FileManager();
        const content = fm.read(req.query.path);
        res.json({ content, path: req.query.path });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/files/write
router.put('/write', authMiddleware, (req, res) => {
    try {
        const fm = new FileManager();
        fm.write(req.body.path, req.body.content);
        res.json({ message: 'Dosya kaydedildi' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/files/create
router.post('/create', authMiddleware, (req, res) => {
    try {
        const fm = new FileManager();
        fm.create(req.body.path, req.body.isDirectory);
        res.json({ message: 'Oluşturuldu' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/files/delete
router.delete('/delete', authMiddleware, (req, res) => {
    try {
        const fm = new FileManager();
        fm.remove(req.query.path);
        res.json({ message: 'Silindi' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/files/rename
router.put('/rename', authMiddleware, (req, res) => {
    try {
        const fm = new FileManager();
        fm.rename(req.body.path, req.body.newName);
        res.json({ message: 'Yeniden adlandırıldı' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
