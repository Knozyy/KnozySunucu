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

// ── Tek seferlik zamanlanmış restart ──────────────────────────────────────

// GET /api/scheduler/one-time-restart — mevcut planı sorgula
router.get('/one-time-restart', authMiddleware, (req, res) => {
    res.json({ restart: scheduler.getOneTimeRestartStatus() });
});

// POST /api/scheduler/one-time-restart — yeni restart planla
router.post('/one-time-restart', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { delayMinutes, serverId } = req.body;
        if (!delayMinutes || delayMinutes < 1) return res.status(400).json({ error: 'En az 1 dakika olmalı' });
        if (delayMinutes > 1440) return res.status(400).json({ error: 'En fazla 24 saat (1440 dakika) olabilir' });
        const result = scheduler.scheduleOneTimeRestart(parseInt(delayMinutes), serverId ? parseInt(serverId) : null);
        res.json({ message: `Sunucu ${delayMinutes} dakika sonra yeniden başlatılacak`, ...result });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/scheduler/one-time-restart — planı iptal et
router.delete('/one-time-restart', authMiddleware, requireRole('admin'), (req, res) => {
    const cancelled = scheduler.cancelOneTimeRestart();
    res.json({ message: cancelled ? 'Zamanlanmış restart iptal edildi' : 'Aktif restart planı yok', cancelled });
});

module.exports = router;
