const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const lagGuard = require('../services/lagGuard');

const router = express.Router();

// ── Canlı durum (panel sık sorgular) ───────────────────────────────────────
router.get('/status', authMiddleware, (req, res) => {
    try {
        res.json(lagGuard.getStatus());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Geçmiş metrikler ────────────────────────────────────────────────────────
router.get('/metrics', authMiddleware, (req, res) => {
    try {
        const range = parseFloat(req.query.range) || 6; // saat
        res.json(lagGuard.getMetrics(range));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Ayarlar ──────────────────────────────────────────────────────────────────
router.get('/settings', authMiddleware, (req, res) => {
    try {
        res.json({ settings: lagGuard.getSettings() });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        res.json({ message: 'Ayarlar güncellendi', settings: lagGuard.updateSettings(req.body) });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Observable profil probe (Faz 0: yalnızca tetikle + URL yakala) ──────────
router.post('/observable/run', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const seconds = parseInt(req.body?.seconds) || undefined;
        const result = await lagGuard.runObservable(seconds);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
