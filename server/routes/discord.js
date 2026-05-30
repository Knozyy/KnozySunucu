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

        const whitelistData = discordBotService.getWhitelist() || {};
        const lowerMcNick = mcNick.trim().toLowerCase();
        
        // Find if this nick is already registered by a different user
        const existingUserId = Object.keys(whitelistData).find(
            uid => uid !== String(userId).trim() && String(whitelistData[uid]).trim().toLowerCase() === lowerMcNick
        );

        if (existingUserId) {
            return res.status(400).json({ 
                error: `Bu Minecraft nick'i (${mcNick}) zaten <@${existingUserId}> tarafından kayıt edilmiş!` 
            });
        }

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

// POST /api/discord/sync-whitelist-to-mc — Paneldeki herkesi MC sunucusunun
// whitelist.json dosyasına DOĞRUDAN yazar. Sunucu açık olmasa bile çalışır.
// Sunucu açıksa ayrıca `whitelist reload` komutu gönderir.
router.post('/sync-whitelist-to-mc', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const https = require('https');
        const serverRegistry = require('../services/serverRegistry');

        const whitelist = discordBotService.getWhitelist() || {};
        const mcNicks = Object.values(whitelist)
            .map(x => typeof x === 'object' ? (x.nickname || x.name || x.mcNick) : x)
            .filter(Boolean)
            .map(s => String(s).trim())
            .filter(s => /^[a-zA-Z0-9_]{2,16}$/.test(s));

        if (mcNicks.length === 0) {
            return res.status(400).json({ error: 'Panelde geçerli Minecraft nick\'i bulunamadı.' });
        }

        // Sunucu instance — hedef serverId verilebilir, yoksa default
        const sid = req.body?.serverId ? parseInt(req.body.serverId) : null;
        const inst = sid ? serverRegistry.get(sid) : serverRegistry.getDefault();
        if (!inst) {
            return res.status(400).json({ error: 'Minecraft sunucusu bulunamadı.' });
        }
        const serverPath = inst.getServerPath();
        if (!serverPath || !fs.existsSync(serverPath)) {
            return res.status(400).json({ error: `Sunucu yolu bulunamadı: ${serverPath}` });
        }

        const wlPath = path.join(serverPath, 'whitelist.json');

        // Mevcut whitelist.json'ı oku (varsa)
        let existing = [];
        if (fs.existsSync(wlPath)) {
            try { existing = JSON.parse(fs.readFileSync(wlPath, 'utf-8')) || []; }
            catch { existing = []; }
            if (!Array.isArray(existing)) existing = [];
        }
        // İsme göre lookup (case-insensitive)
        const existingByName = new Map(
            existing.map(e => [String(e.name || '').toLowerCase(), e])
        );

        // Mojang UUID lookup (paralel, concurrency=4)
        const fetchUuid = (name) => new Promise((resolve) => {
            const opts = {
                hostname: 'api.mojang.com',
                path: `/users/profiles/minecraft/${encodeURIComponent(name)}`,
                method: 'GET',
                headers: { 'User-Agent': 'KnozyPanel (1.0)' },
            };
            const r = https.request(opts, (resp) => {
                let data = '';
                resp.on('data', c => { data += c; });
                resp.on('end', () => {
                    if (resp.statusCode === 200) {
                        try {
                            const j = JSON.parse(data);
                            if (j.id && j.name) {
                                // UUID'yi xxxx-xxxx formatına dönüştür
                                const u = j.id;
                                const formatted = `${u.slice(0,8)}-${u.slice(8,12)}-${u.slice(12,16)}-${u.slice(16,20)}-${u.slice(20)}`;
                                resolve({ uuid: formatted, name: j.name });
                                return;
                            }
                        } catch { /* parse error */ }
                    }
                    resolve(null);
                });
            });
            r.on('error', () => resolve(null));
            r.setTimeout(5000, () => { r.destroy(); resolve(null); });
            r.end();
        });

        const result = {
            added: [],         // yeni eklenen nick'ler
            updated: [],       // case/uuid güncellenen
            unchanged: [],     // zaten doğru
            failed: [],        // Mojang'dan çözülemeyen
        };

        const concurrency = 4;
        for (let i = 0; i < mcNicks.length; i += concurrency) {
            const batch = mcNicks.slice(i, i + concurrency);
            await Promise.all(batch.map(async (nick) => {
                const lower = nick.toLowerCase();
                const cur = existingByName.get(lower);

                // Eğer dosyada zaten varsa ve UUID'si geçerli görünüyorsa atla
                if (cur && cur.uuid && /^[0-9a-f-]{36}$/i.test(cur.uuid)) {
                    result.unchanged.push(nick);
                    return;
                }

                const m = await fetchUuid(nick);
                if (!m) { result.failed.push(nick); return; }

                if (cur) {
                    cur.uuid = m.uuid;
                    cur.name = m.name; // canonical isim
                    result.updated.push(m.name);
                } else {
                    existing.push({ uuid: m.uuid, name: m.name });
                    existingByName.set(m.name.toLowerCase(), { uuid: m.uuid, name: m.name });
                    result.added.push(m.name);
                }
            }));
        }

        // Dosyaya yaz (atomic: önce .tmp'ye, sonra rename)
        const tmpPath = wlPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2), 'utf-8');
        fs.renameSync(tmpPath, wlPath);

        // Sunucu çalışıyorsa whitelist'i reload et
        let reloaded = false;
        try {
            if (inst.status === 'running') {
                inst.sendCommand('whitelist reload');
                reloaded = true;
            }
        } catch { /* ignore */ }

        const summary = [
            `${result.added.length} eklendi`,
            `${result.updated.length} güncellendi`,
            `${result.unchanged.length} değişmedi`,
            result.failed.length > 0 ? `${result.failed.length} başarısız` : null,
            reloaded ? 'sunucuya bildirildi (reload)' : 'sunucu kapalı (dosyaya yazıldı)',
        ].filter(Boolean).join(' · ');

        return res.json({
            message: `Whitelist senkronize edildi: ${summary}`,
            ...result,
            path: wlPath,
            reloaded,
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
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

// POST /api/discord/sync-settings
router.post('/sync-settings', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        discordBotService.forceSyncBot();
        res.json({ message: 'Bot ayarları senkronize edildi' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/discord/trigger-test
router.post('/trigger-test', authMiddleware, requireRole('admin'), (req, res) => {
    try {
        const { test_command } = req.body;
        if (!test_command) return res.status(400).json({ error: 'test_command is required' });

        // test_command'ı veritabanına kaydet
        discordBotService.saveBotSettings({ test_command });
        
        // Bota SIGUSR1 göndererek çalışmasını tetikle
        discordBotService.forceSyncBot();

        res.json({ message: 'Test komutu bota iletildi.' });
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
