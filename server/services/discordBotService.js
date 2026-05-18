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

        const cmd = `screen -dmS ${SCREEN_NAME} bash -c "cd ${dir} && python3 main.py 2>&1 | tee /tmp/knozy-discord.log"`;
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

    // ── Player history ────────────────────────────────────────────────────────

    getPlayerHistory() {
        return this._readJson('player_history.json', []);
    }

    // ── Status summary ────────────────────────────────────────────────────────

    getStatus() {
        const botDir = this.getBotDir();
        return {
            running: this.isBotRunning(),
            botDir: botDir || '',
            screenName: SCREEN_NAME,
            dirExists: botDir ? fs.existsSync(botDir) : false,
        };
    }
}

module.exports = new DiscordBotService();
