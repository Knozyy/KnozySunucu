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
router.get('/whitelist', authMiddleware, async (req, res) => {
    try {
        const data = discordBotService.getWhitelist();
        const userIds = Object.keys(data);
        let users = {};
        try {
            users = await discordBotService.resolveDiscordUsers(userIds);
        } catch { /* token yoksa veya hata olursa boş döner */ }
        const entries = userIds.map(userId => {
            const info = users[userId];
            return {
                userId,
                mcNick:      data[userId],
                discordName: info?.global_name || info?.username || null,
                username:    info?.username || null,
                avatar:      info?.avatar || null,
            };
        });
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
router.get('/timed-roles', authMiddleware, async (req, res) => {
    try {
        const roles = discordBotService.getTimedRoles();

        // Discord isimlerini çöz (kullanıcı + rol + guild)
        const userIds  = [...new Set(roles.map(r => String(r.user_id)).filter(Boolean))];
        const guildIds = [...new Set(roles.map(r => String(r.guild_id)).filter(Boolean))];
        const roleRefs = roles
            .filter(r => r.role_id && r.guild_id)
            .map(r => ({ role_id: String(r.role_id), guild_id: String(r.guild_id) }));

        let users = {}, rolesInfo = {}, guilds = {};
        try {
            [users, rolesInfo, guilds] = await Promise.all([
                discordBotService.resolveDiscordUsers(userIds),
                discordBotService.resolveDiscordRoles(roleRefs),
                discordBotService.resolveDiscordGuilds(guildIds),
            ]);
        } catch { /* token yoksa boş döner */ }

        const enriched = roles.map(r => {
            const u = users[String(r.user_id)] || null;
            const ro = rolesInfo[String(r.role_id)] || null;
            const g = guilds[String(r.guild_id)] || null;
            return {
                ...r,
                discordName: u?.global_name || u?.username || null,
                username:    u?.username || null,
                roleName:    ro?.name || null,
                roleColor:   ro?.color || null,
                guildName:   g?.name || null,
            };
        });

        res.json({ roles: enriched });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/discord/timed-roles — yeni süreli rol ekle
router.post('/timed-roles', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { user_id, guild_id, role_id, durationDays = 0, durationHours = 0 } = req.body;
        if (!user_id || !guild_id || !role_id) return res.status(400).json({ error: 'user_id, guild_id ve role_id gerekli' });
        const totalSecs = (Number(durationDays) * 86400) + (Number(durationHours) * 3600);
        if (totalSecs <= 0) return res.status(400).json({ error: 'Süre en az 1 saat olmalı' });
        const expiry_timestamp = Math.floor(Date.now() / 1000) + totalSecs;
        discordBotService.addTimedRole({ user_id, guild_id, role_id, expiry_timestamp });
        res.json({ message: 'Süreli rol eklendi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/discord/timed-roles/:index — süreli rolü sil
router.delete('/timed-roles/:index', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const roles = discordBotService.getTimedRoles();
        const role = roles[parseInt(req.params.index)];
        const removed = discordBotService.removeTimedRoleAt(parseInt(req.params.index));
        
        // Discord API üzerinden rolü anında sil
        if (role && role.guild_id && role.user_id && role.role_id) {
            discordBotService._discordApiDelete(`/guilds/${role.guild_id}/members/${role.user_id}/roles/${role.role_id}`)
                .catch(() => {}); // Hata olursa sessizce geç
        }
        
        res.json({ message: 'Süreli rol silindi', removed });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── RCON Queue ────────────────────────────────────────────────────────────────

// GET /api/discord/rcon-queue
router.get('/rcon-queue', authMiddleware, (req, res) => {
    try {
        res.json({ queue: discordBotService.getRconQueue() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/discord/rcon-queue — kuyruğu temizle
router.delete('/rcon-queue', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        discordBotService.clearRconQueue();
        res.json({ message: 'RCON kuyruğu temizlendi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Status messages ───────────────────────────────────────────────────────────

// GET /api/discord/status-messages
router.get('/status-messages', authMiddleware, (req, res) => {
    try {
        res.json({ messages: discordBotService.getStatusMessages() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/discord/status-messages
router.post('/status-messages', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { serverName, message } = req.body;
        if (!serverName || !message) return res.status(400).json({ error: 'serverName ve message gerekli' });
        discordBotService.addStatusMessage(serverName.trim(), message.trim());
        res.json({ message: 'Mesaj eklendi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/discord/status-messages — serverName + index ile sil
router.delete('/status-messages', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { serverName, index } = req.body;
        if (!serverName || index === undefined) return res.status(400).json({ error: 'serverName ve index gerekli' });
        const removed = discordBotService.removeStatusMessage(serverName, parseInt(index));
        res.json({ message: 'Mesaj silindi', removed });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ── Webhook Bildirimleri ──────────────────────────────────────────────────────

const webhookService = require('../services/webhookService');

// GET /api/discord/webhook-config
router.get('/webhook-config', authMiddleware, (req, res) => {
    res.json(webhookService.getConfig());
});

// PUT /api/discord/webhook-config
router.put('/webhook-config', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        webhookService.setConfig(req.body);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/discord/webhook-test
router.post('/webhook-test', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const cfg = webhookService.getConfig();
        if (!cfg.url) return res.status(400).json({ error: 'Webhook URL ayarlanmamış' });
        webhookService.send('server_start', '✅ Bu bir test mesajıdır — webhook başarıyla çalışıyor!');
        res.json({ ok: true });
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

// ── Bot Settings (Node.js bot için) ───────────────────────────────────────

// GET /api/discord/bot-settings
router.get('/bot-settings', authMiddleware, (req, res) => {
    try {
        const settings = discordBotService.getBotSettings();
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/discord/bot-settings
router.put('/bot-settings', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        discordBotService.saveBotSettings(req.body);
        res.json({ message: 'Bot ayarları kaydedildi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/discord/bot-status
router.get('/bot-status', authMiddleware, (req, res) => {
    try {
        const status = discordBotService.getBotStatus();
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/discord/bot-command (start/stop/restart)
router.post('/bot-command', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return res.status(400).json({ error: 'command gerekli' });

        switch (command.toLowerCase()) {
            case 'start':
                discordBotService.startBot();
                res.json({ message: 'Bot başlatılıyor...' });
                break;
            case 'stop':
                discordBotService.stopBot();
                res.json({ message: 'Bot durduruldu' });
                break;
            case 'restart':
                discordBotService.stopBot();
                setTimeout(() => {
                    try {
                        discordBotService.startBot();
                    } catch (e) {
                        console.error('Restart start error:', e.message);
                    }
                }, 1000);
                res.json({ message: 'Bot yeniden başlatılıyor...' });
                break;
            default:
                res.status(400).json({ error: 'Bilinmeyen komut' });
        }
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
