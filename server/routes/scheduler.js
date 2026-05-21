const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const scheduler = require('../services/scheduler');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /api/scheduler?serverId=X — verilirse o sunucu görevleri, yoksa hepsi
router.get('/', authMiddleware, (req, res) => {
    try {
        const sid = req.query.serverId ? parseInt(req.query.serverId) : null;
        let tasks = scheduler.list();
        if (sid) tasks = tasks.filter(t => t.server_id === sid || t.server_id == null);
        res.json({ tasks });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/log', authMiddleware, (req, res) => { res.json({ log: scheduler.getExecutionLog() }); });

// POST /api/scheduler  body: { ..., serverId? }
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const task = scheduler.create(req.body);
        res.json({ message: 'Görev oluşturuldu', task });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try { scheduler.remove(parseInt(req.params.id)); res.json({ message: 'Görev silindi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/toggle', authMiddleware, requireRole('admin'), (req, res) => {
    try { const result = scheduler.toggle(parseInt(req.params.id)); res.json(result); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
