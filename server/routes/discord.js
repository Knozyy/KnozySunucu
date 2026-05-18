const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const discordBotService = require('../services/discordBotService');
const minecraftService = require('../services/minecraftService');

const router = express.Router();

// GET /api/discord/status
router.get('/status', authMiddleware, (req, res) => {
    try {
        res.json(discordBotService.getStatus());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/discord/start
router.post('/start', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        discordBotService.startBot();
        res.json({ message: 'Bot başlatılıyor...' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/discord/stop
router.post('/stop', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        discordBotService.stopBot();
        res.json({ message: 'Bot durduruldu.' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PUT /api/discord/config
router.put('/config', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { botDir } = req.body;
        if (!botDir) return res.status(400).json({ error: 'botDir gerekli' });
        discordBotService.setBotDir(botDir.trim());
        res.json({ message: 'Kaydedildi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/discord/logs
router.get('/logs', authMiddleware, (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 50;
        res.json({ log: discordBotService.getRecentLog(lines) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Whitelist ─────────────────────────────────────────────────────────────────

// GET /api/discord/whitelist
router.get('/whitelist', authMiddleware, (req, res) => {
    try {
        const data = discordBotService.getWhitelist();
        const entries = Object.entries(data).map(([userId, mcNick]) => ({ userId, mcNick }));
        res.json({ entries, total: entries.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/discord/whitelist
router.post('/whitelist', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { userId, mcNick } = req.body;
        if (!userId || !mcNick) return res.status(400).json({ error: 'userId ve mcNick gerekli' });
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(mcNick))
            return res.status(400).json({ error: 'Geçersiz Minecraft nick (3-16 karakter, harf/rakam/alt çizgi)' });

        const { oldNick } = discordBotService.addWhitelistEntry(userId.trim(), mcNick.trim());

        // MC sunucusuna gönder (hata olursa sessizce geç)
        if (oldNick && oldNick.toLowerCase() !== mcNick.toLowerCase()) {
            try { minecraftService.sendCommand(`whitelist remove ${oldNick}`); } catch {}
        }
        try { minecraftService.sendCommand(`whitelist add ${mcNick}`); } catch {}

        res.json({ message: `${mcNick} eklendi.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/discord/whitelist/:userId
router.delete('/whitelist/:userId', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { mcNick } = discordBotService.removeWhitelistEntry(req.params.userId);
        try { minecraftService.sendCommand(`whitelist remove ${mcNick}`); } catch {}
        res.json({ message: `${mcNick} silindi.` });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── Timed roles ───────────────────────────────────────────────────────────────

// GET /api/discord/timed-roles
router.get('/timed-roles', authMiddleware, (req, res) => {
    try {
        res.json({ roles: discordBotService.getTimedRoles() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Player history ────────────────────────────────────────────────────────────

// GET /api/discord/player-history
router.get('/player-history', authMiddleware, (req, res) => {
    try {
        res.json({ history: discordBotService.getPlayerHistory() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
