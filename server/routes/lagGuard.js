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

// ── Observable profil probe ─────────────────────────────────────────────────
router.post('/observable/run', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const seconds = parseInt(req.body?.seconds) || undefined;
        const result = await lagGuard.runObservable(seconds);
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Config gezgini (kaldıraç eklerken mevcut configten seç) ─────────────────
router.get('/config/files', authMiddleware, (req, res) => {
    try { res.json(lagGuard.listConfigFiles()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/config/read', authMiddleware, (req, res) => {
    try { res.json(lagGuard.readConfig(String(req.query.path || ''))); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Mod (off / dryrun / auto) ────────────────────────────────────────────────
router.put('/mode', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const mode = lagGuard.setMode(String(req.body?.mode || '').trim());
        res.json({ message: `Mod: ${mode}`, mode });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Kaldıraçlar (levers) CRUD ────────────────────────────────────────────────
router.get('/levers', authMiddleware, (req, res) => {
    try { res.json(lagGuard.getLevers()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/levers', authMiddleware, requireRole('admin'), (req, res) => {
    try { res.json({ message: 'Kaldıraç eklendi', lever: lagGuard.createLever(req.body) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/levers/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try { res.json({ message: 'Kaldıraç güncellendi', lever: lagGuard.updateLever(parseInt(req.params.id), req.body) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/levers/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try { lagGuard.deleteLever(parseInt(req.params.id)); res.json({ message: 'Kaldıraç silindi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/levers/:id/toggle', authMiddleware, requireRole('admin'), (req, res) => {
    try { res.json(lagGuard.toggleLever(parseInt(req.params.id))); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/levers/bulk', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const n = lagGuard.bulkCreateLevers(req.body?.levers || []);
        res.json({ message: `${n} kaldıraç eklendi`, count: n });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/levers/seed', authMiddleware, requireRole('admin'), (req, res) => {
    try { res.json({ message: 'Başlangıç kütüphanesi yüklendi', levers: lagGuard.seedLevers() }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Tümünü default'a sıfırla ─────────────────────────────────────────────────
router.post('/reset', authMiddleware, requireRole('admin'), (req, res) => {
    try { const n = lagGuard.resetLevers(); res.json({ message: `${n} kaldıraç sıfırlandı`, count: n }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Kaldıraç değişiklik geçmişi ──────────────────────────────────────────────
router.get('/history', authMiddleware, (req, res) => {
    try { res.json(lagGuard.getLeverHistory(parseInt(req.query.limit) || 100)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
