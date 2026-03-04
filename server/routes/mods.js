const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const ModManager = require('../services/modManager');

const router = express.Router();

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

module.exports = router;
