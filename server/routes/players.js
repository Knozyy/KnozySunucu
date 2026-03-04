const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const PlayerManager = require('../services/playerManager');

const router = express.Router();
const pm = new PlayerManager();

// Whitelist
router.get('/whitelist', authMiddleware, (req, res) => { res.json({ players: pm.getWhitelist() }); });
router.post('/whitelist', authMiddleware, (req, res) => {
    try { pm.addToWhitelist(req.body.name, req.body.uuid); res.json({ message: 'Whitelist\'e eklendi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/whitelist/:name', authMiddleware, (req, res) => {
    pm.removeFromWhitelist(req.params.name); res.json({ message: 'Whitelist\'ten çıkarıldı' });
});

// Ops
router.get('/ops', authMiddleware, (req, res) => { res.json({ players: pm.getOps() }); });
router.post('/ops', authMiddleware, (req, res) => {
    try { pm.addOp(req.body.name, req.body.uuid); res.json({ message: 'OP yapıldı' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/ops/:name', authMiddleware, (req, res) => {
    pm.removeOp(req.params.name); res.json({ message: 'OP kaldırıldı' });
});

// Ban
router.get('/banned', authMiddleware, (req, res) => { res.json({ players: pm.getBannedPlayers(), ips: pm.getBannedIps() }); });
router.post('/ban', authMiddleware, (req, res) => {
    try { pm.banPlayer(req.body.name, req.body.reason); res.json({ message: 'Banlandı' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/ban/:name', authMiddleware, (req, res) => {
    pm.unbanPlayer(req.params.name); res.json({ message: 'Ban kaldırıldı' });
});
router.post('/ban-ip', authMiddleware, (req, res) => {
    try { pm.banIp(req.body.ip, req.body.reason); res.json({ message: 'IP banlandı' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/ban-ip/:ip', authMiddleware, (req, res) => {
    pm.unbanIp(req.params.ip); res.json({ message: 'IP ban kaldırıldı' });
});

module.exports = router;
