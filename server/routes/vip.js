const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const vipService = require('../services/vipService');
const discordBotService = require('../services/discordBotService');

const router = express.Router();

// ── Özet ──
router.get('/stats', authMiddleware, (req, res) => {
    try { res.json(vipService.stats()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Discord rolleri (paket düzenlemede rol seçici) ──
router.get('/roles', authMiddleware, async (req, res) => {
    try { res.json({ roles: await discordBotService.listGuildRoles() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Paketler ──
router.get('/packages', authMiddleware, (req, res) => {
    try { res.json({ packages: vipService.listPackages() }); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/packages', authMiddleware, requireRole('admin'), (req, res) => {
    try { res.json({ message: 'Paket oluşturuldu', package: vipService.createPackage(req.body) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/packages/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try { res.json({ message: 'Paket güncellendi', package: vipService.updatePackage(parseInt(req.params.id), req.body) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/packages/:id', authMiddleware, requireRole('admin'), (req, res) => {
    try { vipService.deletePackage(parseInt(req.params.id)); res.json({ message: 'Paket silindi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Grant'lar ──
router.get('/grants', authMiddleware, (req, res) => {
    try { res.json({ grants: vipService.listGrants({ status: req.query.status || 'active', limit: parseInt(req.query.limit) || 200 }) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/grants', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const b = req.body || {};
        const r = await vipService.grant({
            packageId: parseInt(b.packageId), userId: b.userId, mcNick: b.mcNick,
            durationDays: b.durationDays, grantedBy: req.user?.username || 'admin', note: b.note,
        });
        res.json({ message: 'VIP verildi', grant: r });
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/grants/:id/revoke', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const r = await vipService.revoke(parseInt(req.params.id), { by: req.user?.username || 'admin', reason: req.body?.reason || 'manuel' });
        if (r.deferred) return res.status(409).json({ error: 'Sunucu kapalı — MC komutları çalıştırılamadı, sunucu açılınca tekrar deneyin.' });
        res.json({ message: 'VIP geri alındı', ...r });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Log ──
router.get('/log', authMiddleware, (req, res) => {
    try { res.json({ log: vipService.log(parseInt(req.query.limit) || 100) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
