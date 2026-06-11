const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const SCREEN_NAME = 'knozy-discord';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
const DISCORD_API = 'https://discord.com/api/v10';

class DiscordBotService {
    getBotDir() {
        if (process.env.DISCORD_BOT_DIR) return process.env.DISCORD_BOT_DIR;
        try {
            const db = getDb();
            const row = db.prepare("SELECT value FROM app_settings WHERE key = 'discord_bot_dir'").get();
            if (row && row.value) return row.value;
            
            // Auto detect
            const possiblePaths = [
                '/root/Knozy/KnozyBot',
                path.resolve(__dirname, '../../../KnozyBot'),
                path.resolve(__dirname, '../../../Knozy/KnozyBot')
            ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    this.setBotDir(p);
                    return p;
                }
            }
            return null;
        } catch { return null; }
    }

    setBotDir(dir) {
        const db = getDb();
        db.prepare(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('discord_bot_dir', ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(dir);
    }

    isBotRunning() {
        try {
            const pm2Out = execSync('pm2 jlist 2>/dev/null || echo "[]"').toString();
            const pm2List = JSON.parse(pm2Out);
            if (pm2List.some(p => p.name === 'KnozyBot' && p.pm2_env.status === 'online')) return true;
        } catch {}

        try {
            const screenOut = execSync('screen -list 2>/dev/null || true').toString();
            return screenOut.includes(SCREEN_NAME);
        } catch {}
        return false;
    }

    startBot() {
        const dir = this.getBotDir();
        if (!dir) throw new Error('Bot dizini ayarlanmamış. Önce ayarlardan bot dizinini girin.');
        if (!fs.existsSync(dir)) throw new Error(`Bot dizini bulunamadı: ${dir}`);
        if (this.isBotRunning()) throw new Error('Bot zaten çalışıyor.');

        const packageJsonPath = path.join(dir, 'package.json');
        const isNodeBot = fs.existsSync(packageJsonPath);

        let cmd;
        if (isNodeBot) {
            cmd = `cd ${dir} && npm install > /dev/null 2>&1 && pm2 start index.js --name "KnozyBot"`;
        } else {
            cmd = `cd ${dir} && pm2 start main.py --interpreter python3 --name "KnozyBot"`;
        }

        try {
            execSync(cmd, { stdio: 'ignore' });
        } catch (e) {
            throw new Error(`Bot başlatılamadı: ${e.message}`);
        }
    }

    stopBot() {
        if (!this.isBotRunning()) throw new Error('Bot zaten çalışmıyor.');
        let errors = [];
        try { execSync(`pm2 stop KnozyBot 2>/dev/null`); } catch (e) { errors.push(e.message); }
        try { execSync(`screen -S ${SCREEN_NAME} -X quit 2>/dev/null`); } catch (e) { errors.push(e.message); }
        
        if (this.isBotRunning()) {
            throw new Error(`Bot durdurulamadı. PM2 veya Screen oturumu kapatılamıyor.`);
        }
    }

    getRecentLog(lines = 50) {
        try {
            const out = execSync(`pm2 logs KnozyBot --raw --nostream --lines ${lines} 2>/dev/null || echo ""`)
                .toString().trim();
            // Eğer pm2 log yoksa (henüz pm2 geçişi tam yapılmadıysa eski logu göster)
            if (!out) {
                return execSync(`tail -n ${lines} /tmp/knozy-discord.log 2>/dev/null || echo ""`).toString().trim();
            }
            return out;
        } catch { return ''; }
    }

    // ── JSON helpers ──────────────────────────────────────────────────────────

    _jsonPath(filename) {
        const dir = this.getBotDir();
        if (!dir) return null;
        return path.join(dir, filename);
    }

    _readJson(filename, fallback = null) {
        const p = this._jsonPath(filename);
        if (!p || !fs.existsSync(p)) return fallback;
        try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
    }

    _writeJson(filename, data) {
        const p = this._jsonPath(filename);
        if (!p) throw new Error('Bot dizini ayarlanmamış.');
        fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    }

    // ── Whitelist ─────────────────────────────────────────────────────────────

    getWhitelist() {
        return this._readJson('whitelist_data.json', {});
    }

    saveWhitelist(data) {
        this._writeJson('whitelist_data.json', data);
    }

    addWhitelistEntry(userId, mcNick) {
        const data = this.getWhitelist();
        const oldNick = data[String(userId)];
        data[String(userId)] = mcNick;
        this.saveWhitelist(data);
        return { oldNick };
    }

    removeWhitelistEntry(userId) {
        const data = this.getWhitelist();
        const mcNick = data[String(userId)];
        if (!mcNick) throw new Error('Kullanıcı whitelist\'te bulunamadı.');
        delete data[String(userId)];
        this.saveWhitelist(data);
        return { mcNick };
    }

    // ── Timed roles ───────────────────────────────────────────────────────────

    getTimedRoles() {
        return this._readJson('timed_roles.json', []);
    }

    saveTimedRoles(roles) {
        this._writeJson('timed_roles.json', roles);
    }

    addTimedRole({ user_id, guild_id, role_id, expiry_timestamp }) {
        const roles = this.getTimedRoles();
        roles.push({ user_id: String(user_id), guild_id: String(guild_id), role_id: String(role_id), expiry_timestamp: Number(expiry_timestamp) });
        this.saveTimedRoles(roles);
        return roles.length - 1;
    }

    removeTimedRoleAt(index) {
        const roles = this.getTimedRoles();
        if (index < 0 || index >= roles.length) throw new Error('Geçersiz indeks');
        const removed = roles.splice(index, 1)[0];
        this.saveTimedRoles(roles);
        return removed;
    }

    // ── RCON queue ────────────────────────────────────────────────────────────

    getRconQueue() {
        return this._readJson('rcon_queue.json', []);
    }

    clearRconQueue() {
        this._writeJson('rcon_queue.json', []);
    }

    // ── Status messages ───────────────────────────────────────────────────────

    getStatusMessages() {
        return this._readJson('status_messages.json', {});
    }

    saveStatusMessages(data) {
        this._writeJson('status_messages.json', data);
    }

    addStatusMessage(serverName, message) {
        const data = this.getStatusMessages();
        if (!data[serverName]) data[serverName] = [];
        data[serverName].push(message);
        this.saveStatusMessages(data);
        return data[serverName].length - 1;
    }

    removeStatusMessage(serverName, index) {
        const data = this.getStatusMessages();
        if (!data[serverName]) throw new Error('Sunucu adı bulunamadı');
        if (index < 0 || index >= data[serverName].length) throw new Error('Geçersiz indeks');
        const removed = data[serverName].splice(index, 1)[0];
        this.saveStatusMessages(data);
        return removed;
    }

    // ── Dashboard config ──────────────────────────────────────────────────────

    getDashboardConfig() {
        return this._readJson('dashboard_config.json', {});
    }

    // ── Player history ────────────────────────────────────────────────────────

    getPlayerHistory() {
        return this._readJson('player_history.json', []);
    }
    
    addPlayerHistoryRecord(count) {
        // Eğer bot dizini seçilmediyse veya hata varsa çökmemesi için try/catch
        try {
            if (!this.getBotDir()) return;
            const data = this.getPlayerHistory();
            data.push({ timestamp: Date.now(), players: count });
            // Maksimum 2880 kayıt (24 saat @ 30 saniye)
            if (data.length > 2880) data.splice(0, data.length - 2880);
            this._writeJson('player_history.json', data);
        } catch (e) {
            // Sessizce yoksay
        }
    }

    // ── Bot Settings (Node.js bot için) ──────────────────────────────────────

    getBotSettings() {
        try {
            const db = getDb();
            const settings = {};
            const rows = db.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'discord_bot_%'").all();

            for (const row of rows) {
                const key = row.key.replace('discord_bot_', '');
                try {
                    // Sayısal olup olmadığını kontrol et (15 haneden uzunsa Discord ID'sidir, bozma)
                    if (/^\d{16,}$/.test(row.value)) {
                        settings[key] = row.value;
                    } else if (row.value === 'null') {
                        settings[key] = null;
                    } else if (row.value.startsWith('{') || row.value.startsWith('[')) {
                        settings[key] = JSON.parse(row.value);
                    } else if (row.value === 'true' || row.value === 'false') {
                        settings[key] = row.value === 'true';
                    } else {
                        // Diğer normal string'ler
                        settings[key] = row.value;
                    }
                } catch {
                    settings[key] = row.value;
                }
            }

            return settings;
        } catch (e) {
            return {};
        }
    }

    saveBotSettings(settings) {
        try {
            const db = getDb();
            for (const [key, value] of Object.entries(settings)) {
                const dbKey = `discord_bot_${key}`;
                const dbValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

                db.prepare(`
                    INSERT INTO app_settings (key, value, updated_at)
                    VALUES (?, ?, datetime('now'))
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                `).run(dbKey, dbValue);
            }
            
            // Force bot to sync immediately if running
            this.forceSyncBot();
        } catch (e) {
            throw new Error(`Bot ayarları kaydedilemedi: ${e.message}`);
        }
    }

    forceSyncBot() {
        try {
            if (this.isBotRunning()) {
                execSync(`pm2 sendSignal SIGUSR1 KnozyBot 2>/dev/null`);
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    getBotStatus() {
        const botDir = this.getBotDir();
        const running = this.isBotRunning();
        const packageJsonPath = botDir ? path.join(botDir, 'package.json') : null;
        const isNodeBot = packageJsonPath && fs.existsSync(packageJsonPath);

        return {
            running,
            botDir: botDir || '',
            botType: isNodeBot ? 'node' : 'python',
            screenName: SCREEN_NAME,
            dirExists: botDir ? fs.existsSync(botDir) : false,
            lastLog: this.getRecentLog(5),
        };
    }

    // ── Discord token bulma (bot dizininden) ──────────────────────────────────

    /**
     * Bot dizinindeki tipik konfig dosyalarından Discord bot token'ını çıkar.
     * Sıra: env (DISCORD_TOKEN/DISCORD_BOT_TOKEN) → {botDir}/.env →
     *       {botDir}/config.json → {botDir}/config.py
     */
    getDiscordToken() {
        if (process.env.DISCORD_TOKEN)     return process.env.DISCORD_TOKEN.trim();
        if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN.trim();

        const dir = this.getBotDir();
        if (!dir) return null;

        // .env
        try {
            const envPath = path.join(dir, '.env');
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf-8');
                const m = content.match(/^(?:DISCORD_TOKEN|DISCORD_BOT_TOKEN|BOT_TOKEN|TOKEN)\s*=\s*["']?([^"'\r\n]+)["']?/m);
                if (m) return m[1].trim();
            }
        } catch { /* ignore */ }

        // config.json
        try {
            const jsonPath = path.join(dir, 'config.json');
            if (fs.existsSync(jsonPath)) {
                const cfg = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                const t = cfg.token || cfg.bot_token || cfg.discord_token || cfg.DISCORD_TOKEN;
                if (t) return String(t).trim();
            }
        } catch { /* ignore */ }

        // config.py (Python bot)
        try {
            const pyPath = path.join(dir, 'config.py');
            if (fs.existsSync(pyPath)) {
                const content = fs.readFileSync(pyPath, 'utf-8');
                const m = content.match(/^(?:DISCORD_TOKEN|BOT_TOKEN|TOKEN)\s*=\s*["']([^"']+)["']/m);
                if (m) return m[1].trim();
            }
        } catch { /* ignore */ }

        return null;
    }

    // ── Kullanıcı cache ───────────────────────────────────────────────────────

    /**
     * Cache'den kullanıcı bilgilerini oku. Eksik veya stale olanları Discord API'den çek.
     * @param {string[]} userIds
     * @returns {Promise<Object<string,{username, global_name, avatar}>>}
     */
    async resolveDiscordUsers(userIds) {
        if (!userIds || userIds.length === 0) return {};
        const db = getDb();
        const now = Date.now();
        const result = {};
        const stale = [];

        const placeholders = userIds.map(() => '?').join(',');
        const cached = db.prepare(
            `SELECT user_id, username, global_name, avatar, fetched_at FROM discord_user_cache WHERE user_id IN (${placeholders})`
        ).all(...userIds);

        const cachedMap = new Map(cached.map(r => [r.user_id, r]));

        for (const id of userIds) {
            const row = cachedMap.get(id);
            if (row && (now - row.fetched_at) < CACHE_TTL_MS) {
                result[id] = { username: row.username, global_name: row.global_name, avatar: row.avatar };
            } else {
                stale.push(id);
                // Eski veri varsa yine de dön
                if (row) result[id] = { username: row.username, global_name: row.global_name, avatar: row.avatar };
            }
        }

        if (stale.length === 0) return result;

        const token = this.getDiscordToken();
        if (!token) return result; // Token yoksa cache neyi varsa onu döner

        // Paralel fetch (concurrency=5, Discord rate limit dostluğu için)
        const upsert = db.prepare(`
            INSERT INTO discord_user_cache (user_id, username, global_name, avatar, fetched_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              username = excluded.username,
              global_name = excluded.global_name,
              avatar = excluded.avatar,
              fetched_at = excluded.fetched_at
        `);

        const fetchOne = (id) => new Promise((resolve) => {
            const opts = {
                hostname: 'discord.com',
                path: `/api/v10/users/${id}`,
                method: 'GET',
                headers: { 'Authorization': `Bot ${token}`, 'User-Agent': 'KnozyPanel (1.0)' },
            };
            const req = https.request(opts, (res) => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const u = JSON.parse(data);
                            const username = u.username || null;
                            const global_name = u.global_name || u.username || null;
                            const avatar = u.avatar || null;
                            upsert.run(id, username, global_name, avatar, Date.now());
                            result[id] = { username, global_name, avatar };
                        } catch { /* ignore */ }
                    } else if (res.statusCode === 404) {
                        // Kullanıcı silinmiş; "Silinmiş Kullanıcı" diye cache'le ki tekrar denemeyelim
                        upsert.run(id, null, '(Silinmiş Kullanıcı)', null, Date.now());
                        result[id] = { username: null, global_name: '(Silinmiş Kullanıcı)', avatar: null };
                    }
                    // 429/5xx → cache yazma, sonraki sefer dener
                    resolve();
                });
            });
            req.on('error', () => resolve());
            req.setTimeout(5000, () => { req.destroy(); resolve(); });
            req.end();
        });

        const concurrency = 5;
        for (let i = 0; i < stale.length; i += concurrency) {
            await Promise.all(stale.slice(i, i + concurrency).map(fetchOne));
        }

        return result;
    }

    // ── Discord API genel yardımcı ────────────────────────────────────────────

    _discordApiGet(path) {
        const token = this.getDiscordToken();
        if (!token) return Promise.resolve(null);
        return new Promise((resolve) => {
            const opts = {
                hostname: 'discord.com',
                path: `/api/v10${path}`,
                method: 'GET',
                headers: { 'Authorization': `Bot ${token}`, 'User-Agent': 'KnozyPanel (1.0)' },
            };
            const req = https.request(opts, (res) => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try { resolve(JSON.parse(data)); } catch { resolve(null); }
                    } else if (res.statusCode === 404 || res.statusCode === 403) {
                        resolve({ __notfound: true });
                    } else {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.end();
        });
    }

    _discordApiDelete(path) {
        const token = this.getDiscordToken();
        if (!token) return Promise.resolve(null);
        return new Promise((resolve) => {
            const opts = {
                hostname: 'discord.com',
                path: `/api/v10${path}`,
                method: 'DELETE',
                headers: { 'Authorization': `Bot ${token}`, 'User-Agent': 'KnozyPanel (1.0)' },
            };
            const req = https.request(opts, (res) => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode, data });
                });
            });
            req.on('error', () => resolve(null));
            req.setTimeout(5000, () => { req.destroy(); resolve(null); });
            req.end();
        });
    }

    _discordApiPut(path) {
        const token = this.getDiscordToken();
        if (!token) return Promise.resolve(null);
        return new Promise((resolve) => {
            const opts = {
                hostname: 'discord.com',
                path: `/api/v10${path}`,
                method: 'PUT',
                headers: {
                    'Authorization': `Bot ${token}`,
                    'User-Agent': 'KnozyPanel (1.0)',
                    'Content-Length': 0,
                },
            };
            const req = https.request(opts, (res) => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            req.on('error', () => resolve(null));
            req.setTimeout(5000, () => { req.destroy(); resolve(null); });
            req.end();
        });
    }

    /** JSON gövdeli istek (POST/PATCH) — mesaj gönderme/düzenleme için. */
    _discordApiBody(method, path, body) {
        const token = this.getDiscordToken();
        if (!token) return Promise.resolve(null);
        const payload = JSON.stringify(body || {});
        return new Promise((resolve) => {
            const opts = {
                hostname: 'discord.com',
                path: `/api/v10${path}`,
                method,
                headers: {
                    'Authorization': `Bot ${token}`,
                    'User-Agent': 'KnozyPanel (1.0)',
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            };
            const req = https.request(opts, (res) => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            req.on('error', () => resolve(null));
            req.setTimeout(8000, () => { req.destroy(); resolve(null); });
            req.write(payload);
            req.end();
        });
    }

    /** Bir guild'in METİN kanalları (lag panosu kanal seçici için). */
    async listGuildChannels(guildId) {
        if (!guildId) return [];
        const channels = await this._discordApiGet(`/guilds/${guildId}/channels`);
        if (!Array.isArray(channels)) return [];
        return channels
            .filter(c => c.type === 0)
            .map(c => ({ id: String(c.id), name: c.name, position: c.position ?? 0 }))
            .sort((a, b) => a.position - b.position);
    }

    /** Kanala mesaj gönder → { ok, id, statusCode }. */
    async sendChannelMessage(channelId, payload) {
        const r = await this._discordApiBody('POST', `/channels/${channelId}/messages`, payload);
        const ok = !!(r && r.statusCode >= 200 && r.statusCode < 300);
        let id = null;
        if (ok) { try { id = String(JSON.parse(r.data).id); } catch { /* ignore */ } }
        return { ok, id, statusCode: r?.statusCode ?? null };
    }

    /** Mevcut mesajı düzenle → { ok, statusCode } (404 = mesaj silinmiş). */
    async editChannelMessage(channelId, messageId, payload) {
        const r = await this._discordApiBody('PATCH', `/channels/${channelId}/messages/${messageId}`, payload);
        return { ok: !!(r && r.statusCode >= 200 && r.statusCode < 300), statusCode: r?.statusCode ?? null };
    }

    /** Mesajı sil (best-effort). */
    async deleteChannelMessage(channelId, messageId) {
        const r = await this._discordApiDelete(`/channels/${channelId}/messages/${messageId}`);
        return { ok: !!(r && r.statusCode >= 200 && r.statusCode < 300) };
    }

    // ── Üye rol ekle/çıkar (VIP sistemi kullanır) ─────────────────────────────
    async addMemberRole(userId, roleId, guildId) {
        const gid = guildId || await this.getPrimaryGuildId();
        if (!gid || !userId || !roleId) return { ok: false, error: 'guild/user/role eksik' };
        const r = await this._discordApiPut(`/guilds/${gid}/members/${userId}/roles/${roleId}`);
        const ok = r && r.statusCode >= 200 && r.statusCode < 300;
        return { ok, statusCode: r?.statusCode };
    }

    async removeMemberRole(userId, roleId, guildId) {
        const gid = guildId || await this.getPrimaryGuildId();
        if (!gid || !userId || !roleId) return { ok: false, error: 'guild/user/role eksik' };
        const r = await this._discordApiDelete(`/guilds/${gid}/members/${userId}/roles/${roleId}`);
        const ok = r && r.statusCode >= 200 && r.statusCode < 300;
        return { ok, statusCode: r?.statusCode };
    }

    /** Botun bulunduğu tüm sunucular (guild seçici için). */
    async listGuilds() {
        const guilds = await this._discordApiGet('/users/@me/guilds');
        if (!Array.isArray(guilds)) return [];
        return guilds.map(g => ({ id: String(g.id), name: g.name, icon: g.icon || null }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /** Botun bulunduğu birincil guild id (cache'li). */
    async getPrimaryGuildId() {
        if (this._primaryGuildId) return this._primaryGuildId;
        try {
            const guilds = await this._discordApiGet('/users/@me/guilds');
            if (Array.isArray(guilds) && guilds.length) {
                this._primaryGuildId = String(guilds[0].id);
                return this._primaryGuildId;
            }
        } catch { /* ignore */ }
        return null;
    }

    /** Bir guild'in rollerini döndür (panel paket düzenlemede rol seçici için). */
    async listGuildRoles(guildId) {
        const gid = guildId || await this.getPrimaryGuildId();
        if (!gid) return [];
        const roles = await this._discordApiGet(`/guilds/${gid}/roles`);
        if (!Array.isArray(roles)) return [];
        return roles
            .filter(r => r.name !== '@everyone')
            .map(r => ({ id: String(r.id), name: r.name, color: r.color, guild_id: gid }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Rol bilgilerini cache'le (guildId + roleIds[])
     * @returns {Promise<Object<string,{name, color, guild_id}>>}
     */
    async resolveDiscordRoles(roleEntries) {
        // roleEntries: [{ role_id, guild_id }]
        if (!roleEntries || roleEntries.length === 0) return {};
        const db = getDb();
        const now = Date.now();
        const result = {};

        // Önce cache'i oku
        const ids = roleEntries.map(e => String(e.role_id));
        const placeholders = ids.map(() => '?').join(',');
        const cached = db.prepare(
            `SELECT role_id, guild_id, name, color, fetched_at FROM discord_role_cache WHERE role_id IN (${placeholders})`
        ).all(...ids);
        const cachedMap = new Map(cached.map(r => [r.role_id, r]));

        // Hangi guild'ler için yeni veri lazım?
        const guildsToFetch = new Set();
        for (const e of roleEntries) {
            const row = cachedMap.get(String(e.role_id));
            if (row && (now - row.fetched_at) < CACHE_TTL_MS) {
                result[String(e.role_id)] = { name: row.name, color: row.color, guild_id: row.guild_id };
            } else {
                guildsToFetch.add(String(e.guild_id));
                if (row) result[String(e.role_id)] = { name: row.name, color: row.color, guild_id: row.guild_id };
            }
        }

        if (guildsToFetch.size === 0) return result;
        if (!this.getDiscordToken()) return result;

        const upsert = db.prepare(`
            INSERT INTO discord_role_cache (role_id, guild_id, name, color, fetched_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(role_id) DO UPDATE SET
              guild_id = excluded.guild_id,
              name = excluded.name,
              color = excluded.color,
              fetched_at = excluded.fetched_at
        `);

        // Her guild için role listesi çek
        await Promise.all([...guildsToFetch].map(async (gid) => {
            const roles = await this._discordApiGet(`/guilds/${gid}/roles`);
            if (!roles || roles.__notfound || !Array.isArray(roles)) return;
            for (const r of roles) {
                upsert.run(String(r.id), String(gid), r.name || null, r.color || 0, Date.now());
                if (ids.includes(String(r.id))) {
                    result[String(r.id)] = { name: r.name || null, color: r.color || 0, guild_id: gid };
                }
            }
        }));

        return result;
    }

    /**
     * Guild bilgilerini cache'le
     */
    async resolveDiscordGuilds(guildIds) {
        if (!guildIds || guildIds.length === 0) return {};
        const db = getDb();
        const now = Date.now();
        const result = {};
        const stale = [];

        const ids = guildIds.map(String);
        const placeholders = ids.map(() => '?').join(',');
        const cached = db.prepare(
            `SELECT guild_id, name, icon, fetched_at FROM discord_guild_cache WHERE guild_id IN (${placeholders})`
        ).all(...ids);
        const cachedMap = new Map(cached.map(r => [r.guild_id, r]));

        for (const id of ids) {
            const row = cachedMap.get(id);
            if (row && (now - row.fetched_at) < CACHE_TTL_MS) {
                result[id] = { name: row.name, icon: row.icon };
            } else {
                stale.push(id);
                if (row) result[id] = { name: row.name, icon: row.icon };
            }
        }

        if (stale.length === 0 || !this.getDiscordToken()) return result;

        const upsert = db.prepare(`
            INSERT INTO discord_guild_cache (guild_id, name, icon, fetched_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
              name = excluded.name,
              icon = excluded.icon,
              fetched_at = excluded.fetched_at
        `);

        await Promise.all(stale.map(async (gid) => {
            const g = await this._discordApiGet(`/guilds/${gid}`);
            if (!g) return;
            if (g.__notfound) {
                upsert.run(gid, '(Erişim Yok)', null, Date.now());
                result[gid] = { name: '(Erişim Yok)', icon: null };
                return;
            }
            upsert.run(gid, g.name || null, g.icon || null, Date.now());
            result[gid] = { name: g.name || null, icon: g.icon || null };
        }));

        return result;
    }

    // ── Status summary ────────────────────────────────────────────────────────

    getStatus() {
        return this.getBotStatus();
    }
}

module.exports = new DiscordBotService();
