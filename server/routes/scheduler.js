const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const scheduler = require('../services/scheduler');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => { res.json({ tasks: scheduler.list() }); });

// Execution log — görevlerin çalışma geçmişi
router.get('/log', authMiddleware, (req, res) => { res.json({ log: scheduler.getExecutionLog() }); });

router.post('/', authMiddleware, (req, res) => {
    try {
        const task = scheduler.create(req.body);
        res.json({ message: 'Görev oluşturuldu', task });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, (req, res) => {
    try { scheduler.remove(parseInt(req.params.id)); res.json({ message: 'Görev silindi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/toggle', authMiddleware, (req, res) => {
    try { const result = scheduler.toggle(parseInt(req.params.id)); res.json(result); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
