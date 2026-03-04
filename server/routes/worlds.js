const express = require('express');
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

module.exports = router;
