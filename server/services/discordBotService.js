const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const SCREEN_NAME = 'knozy-discord';

class DiscordBotService {
    getBotDir() {
        if (process.env.DISCORD_BOT_DIR) return process.env.DISCORD_BOT_DIR;
        try {
            const db = getDb();
            const row = db.prepare("SELECT value FROM app_settings WHERE key = 'discord_bot_dir'").get();
            return row?.value || null;
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
            const out = execSync('screen -list 2>/dev/null || true').toString();
            return out.includes(SCREEN_NAME);
        } catch { return false; }
    }

    startBot() {
        const dir = this.getBotDir();
        if (!dir) throw new Error('Bot dizini ayarlanmamış. Önce ayarlardan bot dizinini girin.');
        if (!fs.existsSync(dir)) throw new Error(`Bot dizini bulunamadı: ${dir}`);
        if (this.isBotRunning()) throw new Error('Bot zaten çalışıyor.');

        // Node.js bot (yeni sistem) veya Python bot (eski sistem) için
        const packageJsonPath = path.join(dir, 'package.json');
        const isNodeBot = fs.existsSync(packageJsonPath);

        let cmd;
        if (isNodeBot) {
            cmd = `screen -dmS ${SCREEN_NAME} bash -c "cd ${dir} && npm install > /dev/null 2>&1 && node index.js 2>&1 | tee /tmp/knozy-discord.log"`;
        } else {
            // Python bot (eski)
            cmd = `screen -dmS ${SCREEN_NAME} bash -c "cd ${dir} && python3 main.py 2>&1 | tee /tmp/knozy-discord.log"`;
        }

        try {
            execSync(cmd, { stdio: 'ignore' });
        } catch (e) {
            throw new Error(`Bot başlatılamadı: ${e.message}`);
        }
    }

    stopBot() {
        if (!this.isBotRunning()) throw new Error('Bot zaten çalışmıyor.');
        try {
            execSync(`screen -S ${SCREEN_NAME} -X quit`, { stdio: 'ignore' });
        } catch (e) {
            throw new Error(`Bot durdurulamadı: ${e.message}`);
        }
    }

    getRecentLog(lines = 50) {
        try {
            const out = execSync(`tail -n ${lines} /tmp/knozy-discord.log 2>/dev/null || echo ""`)
                .toString().trim();
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

    // ── Bot Settings (Node.js bot için) ──────────────────────────────────────

    getBotSettings() {
        try {
            const db = getDb();
            const settings = {};
            const rows = db.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'discord_bot_%'").all();

            for (const row of rows) {
                const key = row.key.replace('discord_bot_', '');
                try {
                    settings[key] = JSON.parse(row.value);
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
        } catch (e) {
            throw new Error(`Bot ayarları kaydedilemedi: ${e.message}`);
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

    // ── Status summary ────────────────────────────────────────────────────────

    getStatus() {
        return this.getBotStatus();
    }
}

module.exports = new DiscordBotService();
