const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const autoThrottle = require('../services/autoThrottle');

const router = express.Router();

// ── Durum ────────────────────────────────────────────────────────────────
router.get('/status', authMiddleware, (req, res) => {
    res.json(autoThrottle.getStatus());
});

router.get('/log', authMiddleware, (req, res) => {
    res.json({ log: autoThrottle.getLog() });
});

router.get('/history', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({ history: autoThrottle.getHistory(limit) });
});

// ── Aç / Kapa ────────────────────────────────────────────────────────────
router.post('/toggle', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { enabled } = req.body;
        autoThrottle.setEnabled(!!enabled);
        res.json({ enabled: !!enabled, message: enabled ? 'AutoThrottle aktif edildi' : 'AutoThrottle durduruldu' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Ayarlar ──────────────────────────────────────────────────────────────
router.get('/settings', authMiddleware, (req, res) => {
    res.json({ settings: autoThrottle.getSettings() });
});

router.put('/settings', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        autoThrottle.updateSettings(req.body);
        res.json({ message: 'Ayarlar güncellendi', settings: autoThrottle.getSettings() });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Profil CRUD ──────────────────────────────────────────────────────────
router.get('/profiles', authMiddleware, (req, res) => {
    res.json({ profiles: autoThrottle.getProfiles() });
});

router.post('/profiles', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const profile = autoThrottle.createProfile(req.body);
        res.json({ message: 'Profil oluşturuldu', profile });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/profiles/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        autoThrottle.updateProfile(parseInt(req.params.id), req.body);
        res.json({ message: 'Profil güncellendi' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/profiles/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        autoThrottle.deleteProfile(parseInt(req.params.id));
        res.json({ message: 'Profil silindi' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/profiles/:id/toggle', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const result = autoThrottle.toggleProfile(parseInt(req.params.id));
        res.json(result);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Tümünü Sıfırla ──────────────────────────────────────────────────────
router.post('/reset', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const count = autoThrottle.resetAll();
        res.json({ message: `${count} değer default'a döndürüldü`, resetCount: count });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
