const express = require('express');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/authMiddleware');
const PlayerManager = require('../services/playerManager');
const { getDb } = require('../db/database');
const serverRegistry = require('../services/serverRegistry');
const { logAudit } = require('../services/auditService');

const router = express.Router();

/**
 * Sunucu bazlı PlayerManager — `?serverId=X` veya body.serverId
 */
function pmFor(req) {
    const sid = req.query.serverId || req.body?.serverId || null;
    const inst = sid ? serverRegistry.get(sid) : serverRegistry.getDefault();
    return new PlayerManager(inst?.getServerPath());
}

function logBan(username, action, reason, bannedBy) {
    try {
        getDb().prepare('INSERT INTO ban_log (username, action, reason, banned_by) VALUES (?, ?, ?, ?)')
            .run(username, action, reason || '', bannedBy || 'admin');
    } catch { /* ignore */ }
}

// ── Whitelist ────────────────────────────────────────────────────────────────
router.get('/whitelist', authMiddleware, (req, res) => {
    res.json({ players: pmFor(req).getWhitelist() });
});
router.post('/whitelist', authMiddleware, (req, res) => {
    try { pmFor(req).addToWhitelist(req.body.name, req.body.uuid); res.json({ message: 'Whitelist\'e eklendi' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/whitelist/:name', authMiddleware, (req, res) => {
    pmFor(req).removeFromWhitelist(req.params.name); res.json({ message: 'Whitelist\'ten çıkarıldı' });
});

// ── Ops ──────────────────────────────────────────────────────────────────────
router.get('/ops', authMiddleware, (req, res) => {
    res.json({ players: pmFor(req).getOps() });
});
router.post('/ops', authMiddleware, (req, res) => {
    try { pmFor(req).addOp(req.body.name, req.body.uuid); res.json({ message: 'OP yapıldı' }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/ops/:name', authMiddleware, (req, res) => {
    pmFor(req).removeOp(req.params.name); res.json({ message: 'OP kaldırıldı' });
});

// ── Ban ──────────────────────────────────────────────────────────────────────
router.get('/banned', authMiddleware, (req, res) => {
    const pm = pmFor(req);
    res.json({ players: pm.getBannedPlayers(), ips: pm.getBannedIps() });
});
router.post('/ban', authMiddleware, (req, res) => {
    try {
        pmFor(req).banPlayer(req.body.name, req.body.reason);
        logBan(req.body.name, 'ban', req.body.reason, req.user?.username);
        logAudit(req.user?.username, 'oyuncu_ban', `${req.body.name} — ${req.body.reason || ''}`, req.ip);
        res.json({ message: 'Banlandı' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/ban/:name', authMiddleware, (req, res) => {
    pmFor(req).unbanPlayer(req.params.name);
    logBan(req.params.name, 'unban', '', req.user?.username);
    logAudit(req.user?.username, 'oyuncu_ban_kaldir', req.params.name, req.ip);
    res.json({ message: 'Ban kaldırıldı' });
});
router.post('/ban-ip', authMiddleware, (req, res) => {
    try {
        pmFor(req).banIp(req.body.ip, req.body.reason);
        logBan(req.body.ip, 'ban-ip', req.body.reason, req.user?.username);
        logAudit(req.user?.username, 'ip_ban', `${req.body.ip} — ${req.body.reason || ''}`, req.ip);
        res.json({ message: 'IP banlandı' });
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/ban-ip/:ip', authMiddleware, (req, res) => {
    pmFor(req).unbanIp(req.params.ip);
    logBan(req.params.ip, 'unban-ip', '', req.user?.username);
    logAudit(req.user?.username, 'ip_ban_kaldir', req.params.ip, req.ip);
    res.json({ message: 'IP ban kaldırıldı' });
});

// GET /api/players/banlog — global ban log (sunucu bağımsız)
router.get('/banlog', authMiddleware, (req, res) => {
    try {
        const rows = getDb().prepare('SELECT * FROM ban_log ORDER BY id DESC LIMIT 200').all();
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/players/online?serverId=X — anlık online oyuncular (+playtime, +role)
router.get('/online', authMiddleware, (req, res) => {
    try {
        const sid = req.query.serverId || null;
        const inst = sid ? serverRegistry.get(sid) : serverRegistry.getDefault();
        if (!inst) return res.json({ players: [], count: 0, status: 'stopped' });

        const db = getDb();
        let opsByName = new Map();
        try {
            const serverPath = inst.getServerPath();
            const fs = require('fs');
            const path = require('path');
            const opsPath = path.join(serverPath, 'ops.json');
            if (fs.existsSync(opsPath)) {
                const ops = JSON.parse(fs.readFileSync(opsPath, 'utf-8'));
                for (const o of ops) opsByName.set((o.name || '').toLowerCase(), o.level || 4);
            }
        } catch { /* ignore */ }

        // Online oyuncular için playtime özet
        const stmt = db.prepare(`
            SELECT username,
                   COALESCE(SUM(duration_seconds), 0) AS total_seconds,
                   COUNT(*) AS session_count
            FROM player_sessions
            WHERE username = ? AND duration_seconds IS NOT NULL
            GROUP BY username
        `);
        const enriched = inst.players.map(name => {
            const row = stmt.get(name);
            const opLevel = opsByName.get(name.toLowerCase());
            let role = 'PLAYER';
            if (opLevel === 4)      role = 'ADMIN';
            else if (opLevel === 3) role = 'OP';
            else if (opLevel === 2) role = 'MOD';
            return {
                name,
                role,
                playtimeSec: row?.total_seconds || 0,
                sessions:    row?.session_count || 0,
                ping: null, // RCON üzerinden henüz çekilmiyor
            };
        });

        res.json({
            players: enriched,
            // Geriye dönük uyumluluk: eski kod hâlâ array of strings bekliyor olabilir
            names: inst.players,
            count: inst.players.length,
            status: inst.status,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/players/sessions?limit=50&username=xxx — DB global, sunucu bağımsız
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

// GET /api/players/stats — DB global
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

// GET /api/players/profile/:username — oyuncu profili (DB + MC stats JSON)
router.get('/profile/:username', authMiddleware, (req, res) => {
    try {
        const username = req.params.username;
        const db = getDb();

        // Oturum verileri
        const sessionStats = db.prepare(`
            SELECT
                COUNT(*) AS session_count,
                SUM(COALESCE(duration_seconds, 0)) AS total_seconds,
                MIN(joined_at) AS first_seen,
                MAX(joined_at) AS last_seen
            FROM player_sessions WHERE username = ?
        `).get(username);

        const sessions = db.prepare(
            'SELECT * FROM player_sessions WHERE username = ? ORDER BY joined_at DESC LIMIT 20'
        ).all(username);

        // MC stats JSON okuma
        const inst = serverRegistry.getDefault();
        const serverPath = inst?.getServerPath() || '';
        let mcStats = {};

        try {
            // usercache.json'dan UUID bul
            const cacheFile = path.join(serverPath, 'usercache.json');
            if (fs.existsSync(cacheFile)) {
                const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                const entry = cache.find(e => e.name?.toLowerCase() === username.toLowerCase());
                if (entry?.uuid) {
                    const statsFile = path.join(serverPath, 'world', 'stats', `${entry.uuid}.json`);
                    if (fs.existsSync(statsFile)) {
                        const raw = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
                        const custom = raw?.stats?.['minecraft:custom'] || {};
                        const mined  = raw?.stats?.['minecraft:mined']  || {};
                        const placed = raw?.stats?.['minecraft:used']   || {};
                        mcStats = {
                            deaths:        custom['minecraft:deaths'] || 0,
                            playerKills:   custom['minecraft:player_kills'] || 0,
                            mobKills:      custom['minecraft:mob_kills'] || 0,
                            blocksPlaced:  Object.values(placed).reduce((a, b) => a + b, 0),
                            blocksMined:   Object.values(mined).reduce((a, b) => a + b, 0),
                            damageTaken:   Math.round((custom['minecraft:damage_taken'] || 0) / 10),
                            distanceWalked: Math.round((custom['minecraft:walk_one_cm'] || 0) / 100),
                        };
                    }
                }
            }
        } catch { /* MC stats okunamadı, boş döner */ }

        // Online kontrolü
        const isOnline = inst?.players?.includes(username) || false;

        res.json({
            username,
            isOnline,
            sessionCount:  sessionStats?.session_count || 0,
            totalSeconds:  sessionStats?.total_seconds || 0,
            firstSeen:     sessionStats?.first_seen || null,
            lastSeen:      sessionStats?.last_seen || null,
            sessions,
            mcStats,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Oyuncu notları (DB global) ────────────────────────────────────────────────

router.get('/notes/:username', authMiddleware, (req, res) => {
    try {
        const rows = getDb().prepare(
            'SELECT * FROM player_notes WHERE username = ? ORDER BY id DESC'
        ).all(req.params.username);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/notes/:username', authMiddleware, (req, res) => {
    try {
        const { note, color } = req.body;
        if (!note?.trim()) return res.status(400).json({ error: 'Not boş olamaz' });
        getDb().prepare(
            'INSERT INTO player_notes (username, note, color, created_by) VALUES (?, ?, ?, ?)'
        ).run(req.params.username, note.trim(), color || '#6366f1', req.user?.username || 'admin');
        res.json({ message: 'Not eklendi' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/notes/:id', authMiddleware, (req, res) => {
    try {
        getDb().prepare('DELETE FROM player_notes WHERE id = ?').run(req.params.id);
        res.json({ message: 'Not silindi' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
