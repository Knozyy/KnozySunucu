const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const PlayerManager = require('../services/playerManager');
const { getDb } = require('../db/database');
const mcService = require('../services/minecraftService');

const router = express.Router();
const pm = new PlayerManager();

function logBan(username, action, reason, bannedBy) {
    try {
        getDb().prepare('INSERT INTO ban_log (username, action, reason, banned_by) VALUES (?, ?, ?, ?)')
            .run(username, action, reason || '', bannedBy || 'admin');
    } catch { /* ignore */ }
}

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
    try {
        pm.banPlayer(req.body.name, req.body.reason);
        logBan(req.body.name, 'ban', req.body.reason, req.user?.username);
        res.json({ message: 'Banlandı' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/ban/:name', authMiddleware, (req, res) => {
    pm.unbanPlayer(req.params.name);
    logBan(req.params.name, 'unban', '', req.user?.username);
    res.json({ message: 'Ban kaldırıldı' });
});
router.post('/ban-ip', authMiddleware, (req, res) => {
    try {
        pm.banIp(req.body.ip, req.body.reason);
        logBan(req.body.ip, 'ban-ip', req.body.reason, req.user?.username);
        res.json({ message: 'IP banlandı' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/ban-ip/:ip', authMiddleware, (req, res) => {
    pm.unbanIp(req.params.ip);
    logBan(req.params.ip, 'unban-ip', '', req.user?.username);
    res.json({ message: 'IP ban kaldırıldı' });
});

// GET /api/players/banlog
router.get('/banlog', authMiddleware, (req, res) => {
    try {
        const rows = getDb().prepare('SELECT * FROM ban_log ORDER BY id DESC LIMIT 200').all();
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/players/online - anlık online oyuncular
router.get('/online', authMiddleware, (req, res) => {
    res.json({ players: mcService.players, count: mcService.players.length, status: mcService.status });
});

// GET /api/players/sessions?limit=50&username=xxx
router.get('/sessions', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const username = req.query.username?.trim();
        let rows;
        if (username) {
            rows = db.prepare(
                'SELECT * FROM player_sessions WHERE username = ? ORDER BY joined_at DESC LIMIT ?'
            ).all(username, limit);
        } else {
            rows = db.prepare(
                'SELECT * FROM player_sessions ORDER BY joined_at DESC LIMIT ?'
            ).all(limit);
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/players/stats - oyuncu bazlı toplam süre ve oturum sayısı
router.get('/stats', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(`
            SELECT
                username,
                COUNT(*) AS session_count,
                SUM(COALESCE(duration_seconds, 0)) AS total_seconds,
                MAX(joined_at) AS last_seen
            FROM player_sessions
            GROUP BY username
            ORDER BY total_seconds DESC
            LIMIT 20
        `).all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
