/**
 * VIP Servisi
 * ───────────
 * Panelden yönetilen, çoklu-paketli VIP sistemi. Her paket bir Discord rolü atar
 * ve verme/bitiş anında Minecraft komutları çalıştırır ({nick}/{discord} yer tutucu).
 * Süreli; her dakika süresi dolan grant'ları otomatik geri alır.
 *
 * Süreli Roller sisteminden BAĞIMSIZ (kendi tabloları: vip_packages/vip_grants/vip_log).
 */
const { getDb } = require('../db/database');

function db() { return getDb(); }
function now() { return Math.floor(Date.now() / 1000); }
function parseCmds(json) { try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a.filter(Boolean) : []; } catch { return []; } }

function applyTemplate(cmd, { mcNick, userId }) {
    return String(cmd)
        .replace(/\{nick\}/gi, mcNick || '')
        .replace(/\{player\}/gi, mcNick || '')
        .replace(/\{discord\}/gi, userId || '');
}

class VipService {
    constructor() { this._interval = null; }

    start() {
        this._check();
        this._interval = setInterval(() => this._check(), 60 * 1000);
        if (this._interval.unref) this._interval.unref();
        console.log('[VIP] Servis başlatıldı.');
    }
    stop() { if (this._interval) { clearInterval(this._interval); this._interval = null; } }

    // ── Paketler ──────────────────────────────────────────────────────────
    listPackages() {
        try { return db().prepare('SELECT * FROM vip_packages ORDER BY sort_order ASC, id ASC').all(); }
        catch { return []; }
    }
    getPackage(id) { return db().prepare('SELECT * FROM vip_packages WHERE id = ?').get(id); }

    createPackage(d) {
        if (!d.name) throw new Error('Paket adı gerekli');
        const res = db().prepare(`INSERT INTO vip_packages
            (name, color, discord_role_id, discord_guild_id, duration_days, grant_commands, revoke_commands, sort_order, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            d.name, d.color || '#f1c40f', d.discord_role_id || null, d.discord_guild_id || null,
            Number(d.duration_days) || 0,
            JSON.stringify(Array.isArray(d.grant_commands) ? d.grant_commands : parseCmds(d.grant_commands)),
            JSON.stringify(Array.isArray(d.revoke_commands) ? d.revoke_commands : parseCmds(d.revoke_commands)),
            Number(d.sort_order) || 0, d.enabled === false ? 0 : 1
        );
        return this.getPackage(res.lastInsertRowid);
    }

    updatePackage(id, d) {
        const cur = this.getPackage(id);
        if (!cur) throw new Error('Paket bulunamadı');
        const m = { ...cur };
        if ('name' in d) m.name = d.name;
        if ('color' in d) m.color = d.color;
        if ('discord_role_id' in d) m.discord_role_id = d.discord_role_id || null;
        if ('discord_guild_id' in d) m.discord_guild_id = d.discord_guild_id || null;
        if ('duration_days' in d) m.duration_days = Number(d.duration_days) || 0;
        if ('grant_commands' in d) m.grant_commands = JSON.stringify(Array.isArray(d.grant_commands) ? d.grant_commands : parseCmds(d.grant_commands));
        if ('revoke_commands' in d) m.revoke_commands = JSON.stringify(Array.isArray(d.revoke_commands) ? d.revoke_commands : parseCmds(d.revoke_commands));
        if ('sort_order' in d) m.sort_order = Number(d.sort_order) || 0;
        if ('enabled' in d) m.enabled = d.enabled ? 1 : 0;
        db().prepare(`UPDATE vip_packages SET name=@name, color=@color, discord_role_id=@discord_role_id,
            discord_guild_id=@discord_guild_id, duration_days=@duration_days, grant_commands=@grant_commands,
            revoke_commands=@revoke_commands, sort_order=@sort_order, enabled=@enabled WHERE id=@id`).run({ ...m, id });
        return this.getPackage(id);
    }

    deletePackage(id) { db().prepare('DELETE FROM vip_packages WHERE id = ?').run(id); }

    // ── Grant'lar ─────────────────────────────────────────────────────────
    listGrants({ status = 'active', limit = 200 } = {}) {
        try {
            if (status === 'all') return db().prepare('SELECT * FROM vip_grants ORDER BY id DESC LIMIT ?').all(limit);
            return db().prepare('SELECT * FROM vip_grants WHERE status = ? ORDER BY expires_at IS NULL, expires_at ASC LIMIT ?').all(status, limit);
        } catch { return []; }
    }
    getGrant(id) { return db().prepare('SELECT * FROM vip_grants WHERE id = ?').get(id); }

    /** VIP ver: kayıt oluştur + Discord rolü ekle + verme komutlarını çalıştır. */
    async grant({ packageId, userId, mcNick, durationDays, grantedBy, note }) {
        const pkg = this.getPackage(packageId);
        if (!pkg) throw new Error('Paket bulunamadı');
        userId = userId ? String(userId).trim() : null;
        mcNick = mcNick ? String(mcNick).trim() : null;
        if (!userId && !mcNick) throw new Error('En az Discord kullanıcı veya MC nick gerekli');

        const days = durationDays != null && durationDays !== '' ? Number(durationDays) : pkg.duration_days;
        const expiresAt = days > 0 ? now() + Math.round(days * 86400) : null;

        const res = db().prepare(`INSERT INTO vip_grants
            (package_id, package_name, user_id, mc_nick, granted_by, granted_at, expires_at, status, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`).run(
            pkg.id, pkg.name, userId, mcNick, grantedBy || 'admin', now(), expiresAt, note || ''
        );
        const grantId = res.lastInsertRowid;

        const applied = await this._applyGrant(pkg, { userId, mcNick });
        this._log(grantId, 'grant', pkg.name, mcNick, userId, applied.detail);
        return { id: grantId, ...this.getGrant(grantId), applyDetail: applied.detail };
    }

    /** VIP geri al (manuel veya süre bitince). server kapalıysa ve MC komutu varsa erteler. */
    async revoke(grantId, { by = 'admin', reason = 'manuel', viaExpiry = false } = {}) {
        const g = this.getGrant(grantId);
        if (!g) throw new Error('Kayıt bulunamadı');
        const pkg = g.package_id ? this.getPackage(g.package_id) : null;
        const revokeCmds = pkg ? parseCmds(pkg.revoke_commands) : [];

        // MC komutu gerekiyor ama sunucu kapalıysa: ERTELE (atomik kalsın, sonra tekrar denenir)
        if (revokeCmds.length && g.mc_nick && !this._mcRunning()) {
            return { deferred: true, reason: 'mc_kapali' };
        }

        const detail = await this._applyRevoke(pkg, { userId: g.user_id, mcNick: g.mc_nick });
        db().prepare("UPDATE vip_grants SET status = ?, revoked_at = ? WHERE id = ?")
            .run(viaExpiry ? 'expired' : 'revoked', now(), grantId);
        this._log(grantId, viaExpiry ? 'expire' : 'revoke', g.package_name, g.mc_nick, g.user_id, `${reason} · ${detail}`);
        return { ok: true, detail };
    }

    log(limit = 100) {
        try { return db().prepare('SELECT * FROM vip_log ORDER BY id DESC LIMIT ?').all(limit); }
        catch { return []; }
    }

    // ── Uygulama yardımcıları ───────────────────────────────────────────────
    _mcInstance() { try { return require('./serverRegistry').getDefault(); } catch { return null; } }
    _mcRunning() { const i = this._mcInstance(); return !!(i && i.status === 'running'); }

    async _applyGrant(pkg, { userId, mcNick }) {
        const parts = [];
        // 1) Discord rolü
        if (pkg.discord_role_id && userId) {
            try {
                const discordBotService = require('./discordBotService');
                const r = await discordBotService.addMemberRole(userId, pkg.discord_role_id, pkg.discord_guild_id);
                parts.push(r.ok ? 'rol verildi' : `rol HATA(${r.statusCode || r.error})`);
            } catch (e) { parts.push(`rol HATA: ${e.message}`); }
        }
        // 2) MC komutları
        const cmds = parseCmds(pkg.grant_commands);
        if (cmds.length && mcNick) {
            if (this._mcRunning()) {
                const inst = this._mcInstance();
                let n = 0;
                for (const c of cmds) { try { inst.sendCommand(applyTemplate(c, { mcNick, userId })); n++; } catch { /* ignore */ } }
                parts.push(`${n}/${cmds.length} MC komutu`);
            } else parts.push('MC komutları ERTELENDİ (sunucu kapalı)');
        }
        return { detail: parts.join(' · ') || 'kayıt oluşturuldu' };
    }

    async _applyRevoke(pkg, { userId, mcNick }) {
        const parts = [];
        if (pkg?.discord_role_id && userId) {
            try {
                const discordBotService = require('./discordBotService');
                const r = await discordBotService.removeMemberRole(userId, pkg.discord_role_id, pkg.discord_guild_id);
                parts.push(r.ok ? 'rol alındı' : `rol HATA(${r.statusCode || r.error})`);
            } catch (e) { parts.push(`rol HATA: ${e.message}`); }
        }
        const cmds = pkg ? parseCmds(pkg.revoke_commands) : [];
        if (cmds.length && mcNick && this._mcRunning()) {
            const inst = this._mcInstance();
            let n = 0;
            for (const c of cmds) { try { inst.sendCommand(applyTemplate(c, { mcNick, userId })); n++; } catch { /* ignore */ } }
            parts.push(`${n}/${cmds.length} MC komutu`);
        }
        return parts.join(' · ') || 'geri alındı';
    }

    _log(grantId, action, packageName, mcNick, userId, detail) {
        try {
            db().prepare(`INSERT INTO vip_log (grant_id, action, package_name, mc_nick, user_id, detail)
                VALUES (?, ?, ?, ?, ?, ?)`).run(grantId || null, action, packageName || null, mcNick || null, userId || null, detail || null);
        } catch { /* ignore */ }
    }

    // ── Süre kontrolü (her dakika) ──────────────────────────────────────────
    async _check() {
        try {
            const expired = db().prepare(
                "SELECT id FROM vip_grants WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?"
            ).all(now());
            for (const row of expired) {
                try {
                    const res = await this.revoke(row.id, { by: 'system', reason: 'süre doldu', viaExpiry: true });
                    if (res.deferred) console.warn(`[VIP] grant#${row.id} bitişi ertelendi (sunucu kapalı).`);
                } catch (e) { console.error(`[VIP] grant#${row.id} bitiş hatası:`, e.message); }
            }
        } catch (err) { console.error('[VIP] Kontrol hatası:', err.message); }
    }

    // ── Durum (panel başlık kartı) ──────────────────────────────────────────
    stats() {
        try {
            const active = db().prepare("SELECT COUNT(*) n FROM vip_grants WHERE status = 'active'").get().n;
            const pkgs = db().prepare('SELECT COUNT(*) n FROM vip_packages WHERE enabled = 1').get().n;
            return { activeGrants: active, packages: pkgs };
        } catch { return { activeGrants: 0, packages: 0 }; }
    }
}

module.exports = new VipService();
