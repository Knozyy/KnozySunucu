/**
 * VIP Servisi
 * ───────────
 * Panelden yönetilen, çoklu-paketli VIP sistemi. Her paket bir Discord rolü atar
 * ve verme/bitiş anında Minecraft komutları çalıştırır ({nick}/{discord} yer tutucu).
 * Süreli; her dakika süresi dolan grant'ları otomatik geri alır.
 *
 * Süreli Roller sisteminden BAĞIMSIZ (kendi tabloları: vip_packages/vip_grants/vip_log).
 */
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');
const ranksFile = require('./vip/ranksFile');

// Panelden yönetilen FTB Ranks kademeleri (eksik blok oluşturulurken meta) — VipPage presetleriyle eşleşir.
const TIER_META = {
    vip:      { name: 'VIP',  power: 50 },
    vip_plus: { name: 'VIP+', power: 60 },
    mvp:      { name: 'MVP',  power: 70 },
};
const VIP_TIERS = Object.keys(TIER_META);

function db() { return getDb(); }
function now() { return Math.floor(Date.now() / 1000); }
function parseCmds(json) { try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a.filter(Boolean) : []; } catch { return []; } }

// {gradient:#RRGGBB:#RRGGBB} → nick'i karakter karakter renklendirir (&#RRGGBB kodlarıyla).
// 1.16+ hex destekleyen chat/nick modlarıyla çalışır (örn. FTB Essentials nick).
function gradientNick(nick, fromHex, toHex) {
    const p = (h) => {
        const m = String(h || '').replace('#', '').match(/^([0-9a-f]{6})$/i);
        return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null;
    };
    const a = p(fromHex), b = p(toHex);
    if (!a || !b || !nick) return nick || '';
    const chars = [...nick];
    const n = Math.max(1, chars.length - 1);
    return chars.map((ch, i) => {
        const t = i / n;
        const hex = [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t).toString(16).padStart(2, '0')).join('');
        return `&#${hex}${ch}`;
    }).join('');
}

function applyTemplate(cmd, { mcNick, userId, packageName }) {
    return String(cmd)
        .replace(/\{gradient:(#?[0-9a-f]{6}):(#?[0-9a-f]{6})\}/gi, (_, c1, c2) => gradientNick(mcNick || '', c1, c2))
        .replace(/\{nick\}/gi, mcNick || '')
        .replace(/\{player\}/gi, mcNick || '')
        .replace(/\{package\}/gi, packageName || '')
        .replace(/\{discord\}/gi, userId || '');
}

// VIP ayar varsayılanları (app_settings · vip_ öneki)
const SETTING_DEFAULTS = {
    lagExemptPct: 50,     // VIP lag-işaretleme eşiği +%X (LagGuard atıf muafiyeti)
    reservedSlots: 0,     // sunucu doluysa VIP'lere ayrılan slot (0 = kapalı)
    joinLeaveEnabled: 1,  // VIP giriş/çıkış duyuruları (0/1)
    reminderDays: 3,      // bitişe bu kadar gün kala oyuncuya Discord DM (0 = kapalı)
};

class VipService {
    constructor() {
        this._interval = null;
        this._mc = null;
        this._settings = { ...SETTING_DEFAULTS };
        this._onJoin = this._onJoin.bind(this);
        this._onLeave = this._onLeave.bind(this);
    }

    start() {
        this._loadSettings();
        this._check();
        this._interval = setInterval(() => this._check(), 60 * 1000);
        if (this._interval.unref) this._interval.unref();
        console.log('[VIP] Servis başlatıldı.');
    }
    stop() { if (this._interval) { clearInterval(this._interval); this._interval = null; } }

    /** minecraftService event'lerine bağlan (giriş/çıkış duyuruları + rezerve slot). */
    attach(mcService) {
        if (this._mc === mcService) return;
        if (this._mc) {
            try { this._mc.off('playerJoin', this._onJoin); this._mc.off('playerLeave', this._onLeave); } catch { /* ignore */ }
        }
        this._mc = mcService || null;
        if (mcService) {
            mcService.on('playerJoin', this._onJoin);
            mcService.on('playerLeave', this._onLeave);
        }
    }

    // ── Ayarlar (app_settings · vip_ öneki) ─────────────────────────────────
    getSettings() { return { ...this._settings }; }
    updateSettings(patch = {}) {
        for (const [k, v] of Object.entries(patch)) {
            if (k in this._settings) {
                this._settings[k] = Number(v);
                this._saveSetting(`vip_${k}`, String(this._settings[k]));
            }
        }
        return this.getSettings();
    }
    _loadSettings() {
        try {
            const d = db();
            for (const key of Object.keys(SETTING_DEFAULTS)) {
                const row = d.prepare('SELECT value FROM app_settings WHERE key = ?').get(`vip_${key}`);
                if (row && Number.isFinite(Number(row.value))) this._settings[key] = Number(row.value);
            }
        } catch { /* tablo henüz olmayabilir */ }
    }
    _saveSetting(key, value) {
        try {
            db().prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
                        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`)
                .run(key, value, value);
        } catch { /* ignore */ }
    }

    // ── VIP nick yardımcıları (LagGuard muafiyeti vb. dış kullanım) ─────────
    /** Aktif VIP mc_nick'leri (lowercase Set). */
    activeVipNicks() {
        try {
            const rows = db().prepare("SELECT mc_nick FROM vip_grants WHERE status = 'active' AND mc_nick IS NOT NULL").all();
            return new Set(rows.map(r => String(r.mc_nick).toLowerCase()));
        } catch { return new Set(); }
    }
    isVipNick(nick) { return nick ? this.activeVipNicks().has(String(nick).toLowerCase()) : false; }
    /** Aktif grant + paketi (nick ile). */
    _activeGrantByNick(nick) {
        try {
            return db().prepare(
                "SELECT * FROM vip_grants WHERE status = 'active' AND LOWER(mc_nick) = ? ORDER BY id DESC LIMIT 1"
            ).get(String(nick).toLowerCase()) || null;
        } catch { return null; }
    }

    // ── Giriş/Çıkış duyuruları + rezerve slot ───────────────────────────────
    _onJoin(name) {
        try {
            // 1) Rezerve slot: sunucu doluysa VIP olmayan oyuncuyu kickle
            const reserved = this._settings.reservedSlots;
            if (reserved > 0 && this._mc && !this.isVipNick(name)) {
                const maxPlayers = this._maxPlayers();
                const online = this._mc.players?.length || 0;
                if (maxPlayers && online > maxPlayers - reserved) {
                    try {
                        this._mc.sendCommand(`kick ${name} Sunucu dolu — kalan slotlar VIP üyelere ayrılmıştır.`);
                        this._log(null, 'reserved_kick', null, name, null, `dolu (${online}/${maxPlayers}, rezerve ${reserved})`);
                    } catch { /* ignore */ }
                    return; // kicklenen oyuncu için duyuru yapma
                }
            }
            // 2) VIP giriş duyurusu
            if (!this._settings.joinLeaveEnabled) return;
            const g = this._activeGrantByNick(name);
            if (!g) return;
            const pkg = g.package_id ? this.getPackage(g.package_id) : null;
            const msg = pkg?.join_message;
            if (!msg) return;
            this._announce(msg, { mcNick: name, packageName: g.package_name, color: pkg?.color });
        } catch { /* ignore */ }
    }

    _onLeave(name) {
        try {
            if (!this._settings.joinLeaveEnabled) return;
            const g = this._activeGrantByNick(name);
            if (!g) return;
            const pkg = g.package_id ? this.getPackage(g.package_id) : null;
            const msg = pkg?.leave_message;
            if (!msg) return;
            this._announce(msg, { mcNick: name, packageName: g.package_name, color: pkg?.color });
        } catch { /* ignore */ }
    }

    /** Sohbete renkli duyuru bas (tellraw, paket rengiyle). */
    _announce(template, { mcNick, packageName, color }) {
        if (!this._mc || this._mc.status !== 'running') return;
        const text = applyTemplate(template, { mcNick, packageName });
        const json = JSON.stringify({ text, color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : 'gold' });
        try { this._mc.sendCommand(`tellraw @a ${json}`); } catch { /* ignore */ }
    }

    /** server.properties / status'tan max oyuncu sayısı. */
    _maxPlayers() {
        try {
            const st = this._mc?.getStatus?.();
            if (st?.maxPlayers) return Number(st.maxPlayers);
        } catch { /* ignore */ }
        try {
            const sp = this._mc?.getServerPath?.();
            if (sp) {
                const m = fs.readFileSync(path.join(sp, 'server.properties'), 'utf-8').match(/^max-players\s*=\s*(\d+)/m);
                if (m) return Number(m[1]);
            }
        } catch { /* ignore */ }
        return null;
    }

    // ── Paketler ──────────────────────────────────────────────────────────
    listPackages() {
        try { return db().prepare('SELECT * FROM vip_packages ORDER BY sort_order ASC, id ASC').all(); }
        catch { return []; }
    }
    getPackage(id) { return db().prepare('SELECT * FROM vip_packages WHERE id = ?').get(id); }

    createPackage(d) {
        if (!d.name) throw new Error('Paket adı gerekli');
        const res = db().prepare(`INSERT INTO vip_packages
            (name, color, discord_role_id, discord_guild_id, duration_days, grant_commands, revoke_commands, join_message, leave_message, sort_order, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            d.name, d.color || '#f1c40f', d.discord_role_id || null, d.discord_guild_id || null,
            Number(d.duration_days) || 0,
            JSON.stringify(Array.isArray(d.grant_commands) ? d.grant_commands : parseCmds(d.grant_commands)),
            JSON.stringify(Array.isArray(d.revoke_commands) ? d.revoke_commands : parseCmds(d.revoke_commands)),
            d.join_message || null, d.leave_message || null,
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
        if ('join_message' in d) m.join_message = d.join_message || null;
        if ('leave_message' in d) m.leave_message = d.leave_message || null;
        if ('sort_order' in d) m.sort_order = Number(d.sort_order) || 0;
        if ('enabled' in d) m.enabled = d.enabled ? 1 : 0;
        db().prepare(`UPDATE vip_packages SET name=@name, color=@color, discord_role_id=@discord_role_id,
            discord_guild_id=@discord_guild_id, duration_days=@duration_days, grant_commands=@grant_commands,
            revoke_commands=@revoke_commands, join_message=@join_message, leave_message=@leave_message,
            sort_order=@sort_order, enabled=@enabled WHERE id=@id`).run({ ...m, id });
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

    /** VIP süresini uzat (+N gün). Süresiz grant uzatılamaz; süresi geçmişse bugünden başlar. */
    extend(grantId, days) {
        const g = this.getGrant(grantId);
        if (!g) throw new Error('Kayıt bulunamadı');
        if (g.status !== 'active') throw new Error('Yalnızca aktif VIP uzatılabilir');
        const d = Number(days);
        if (!Number.isFinite(d) || d <= 0) throw new Error('Geçerli gün sayısı gerekli');
        if (g.expires_at == null) throw new Error('Süresiz VIP uzatılamaz (zaten süresiz)');
        const base = Math.max(now(), Number(g.expires_at));
        const newExpiry = base + Math.round(d * 86400);
        // Yeni bitiş için hatırlatma yeniden gönderilebilsin
        db().prepare('UPDATE vip_grants SET expires_at = ?, reminder_sent_at = NULL WHERE id = ?').run(newExpiry, grantId);
        this._log(grantId, 'extend', g.package_name, g.mc_nick, g.user_id, `+${d} gün → ${new Date(newExpiry * 1000).toLocaleDateString('tr-TR')}`);
        return this.getGrant(grantId);
    }

    /** Bir Discord kullanıcısının aktif VIP'leri (bot /vip + profil kartı için). */
    byUser(userId) {
        try {
            return db().prepare(
                "SELECT g.*, p.color FROM vip_grants g LEFT JOIN vip_packages p ON p.id = g.package_id " +
                "WHERE g.status = 'active' AND g.user_id = ? ORDER BY g.expires_at IS NULL DESC, g.expires_at DESC"
            ).all(String(userId));
        } catch { return []; }
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
    _serverPath() { const i = this._mcInstance(); try { return i?.getServerPath ? i.getServerPath() : null; } catch { return null; } }
    _ranksPath() { const sp = this._serverPath(); return sp ? path.join(sp, 'config', 'ftbranks', 'ranks.snbt') : null; }

    // ── Kademe perkleri (ranks.snbt — panelden düzenlenir) ────────────────────
    /** 3 kademenin (vip/vip_plus/mvp) güncel perklerini ranks.snbt'den oku. */
    readTierPerks() {
        const p = this._ranksPath();
        const found = !!(p && fs.existsSync(p));
        let raw = '';
        if (found) { try { raw = fs.readFileSync(p, 'utf-8'); } catch { /* ignore */ } }
        const tiers = VIP_TIERS.map(rank => {
            const meta = TIER_META[rank];
            const r = found ? ranksFile.readPerks(raw, rank) : { exists: false, name: null, power: null, perks: null };
            return { rank, label: meta.name, defaultPower: meta.power, exists: r.exists, name: r.name, power: r.power, perks: r.perks };
        });
        return { fileFound: found, path: p, serverRunning: this._mcRunning(), tiers };
    }

    /** Bir kademenin perklerini ranks.snbt'ye yaz: yedek + yazma-doğrulama + (açıksa) reload. */
    saveTierPerks(rank, perks) {
        if (!VIP_TIERS.includes(rank)) throw new Error('Geçersiz kademe: ' + rank);
        if (!perks || typeof perks !== 'object') throw new Error('perks gerekli');
        const p = this._ranksPath();
        if (!p) throw new Error('Sunucu yolu çözülemedi (aktif sunucu yok mu?).');
        if (!fs.existsSync(p)) throw new Error(`ranks.snbt bulunamadı: ${p} — sunucuda FTB Ranks kurulu/çalışmış olmalı.`);

        const raw = fs.readFileSync(p, 'utf-8');
        const next = ranksFile.writePerks(raw, rank, perks, TIER_META[rank]);

        try { fs.writeFileSync(p + '.vipbak', raw, 'utf-8'); } catch { /* yedek best-effort */ }
        fs.writeFileSync(p, next, 'utf-8');

        // Yazma doğrulaması — geri oku, istenen değerler gerçekten yazıldı mı?
        const after = ranksFile.readPerks(fs.readFileSync(p, 'utf-8'), rank).perks;
        const bad = this._verifyPerks(after, perks);
        if (bad) {
            try { fs.writeFileSync(p, raw, 'utf-8'); } catch { /* ignore */ }
            throw new Error(`Yazma doğrulanamadı (${bad}) — değişiklik geri alındı.`);
        }

        let reloaded = false;
        if (this._mcRunning()) {
            try { this._mcInstance().sendCommand('ftbranks reload'); reloaded = true; } catch { /* ignore */ }
        }
        return { ok: true, reloaded, path: p };
    }

    // İstenen perkler dosyadan geri okunan değerlerle eşleşiyor mu? Uymuyorsa ilk uyumsuz alanın adı.
    _verifyPerks(after, want) {
        for (const f of Object.keys(want)) {
            const def = ranksFile.MANAGED[f];
            if (!def) continue;
            const w = want[f];
            if (def.type === 'bool') { if (Boolean(after[f]) !== Boolean(w)) return f; }
            else if (def.type === 'int') {
                const ok = w != null && w !== '' && Number.isFinite(Number(w));
                if (ok) { if (Number(after[f]) !== Number(w)) return f; }
                else if (after[f] != null) return f;
            } else {
                if (w) { if (after[f] !== String(w)) return f; }
                else if (after[f] != null) return f;
            }
        }
        return null;
    }

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
                for (const c of cmds) { try { inst.sendCommand(applyTemplate(c, { mcNick, userId, packageName: pkg.name })); n++; } catch { /* ignore */ } }
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
            for (const c of cmds) { try { inst.sendCommand(applyTemplate(c, { mcNick, userId, packageName: pkg?.name })); n++; } catch { /* ignore */ } }
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

            // Bitiş hatırlatması: bitişe ≤N gün kalan aktif VIP'lere bir kez Discord DM
            const rd = this._settings.reminderDays;
            if (rd > 0) {
                const soon = db().prepare(
                    `SELECT * FROM vip_grants WHERE status = 'active' AND user_id IS NOT NULL
                     AND reminder_sent_at IS NULL AND expires_at IS NOT NULL
                     AND expires_at > ? AND expires_at <= ?`
                ).all(now(), now() + rd * 86400);
                for (const g of soon) {
                    try {
                        const daysLeft = Math.max(1, Math.ceil((g.expires_at - now()) / 86400));
                        const dateStr = new Date(g.expires_at * 1000).toLocaleDateString('tr-TR');
                        const discordBotService = require('./discordBotService');
                        const r = await discordBotService.sendDirectMessage(g.user_id,
                            `👑 Merhaba! **${g.package_name}** VIP üyeliğin **${dateStr}** tarihinde (${daysLeft} gün sonra) sona erecek.\n` +
                            `Yenilemek istersen sunucu yetkilileriyle iletişime geçebilirsin.`);
                        // Tek deneme: DM kapalıysa da işaretle (her dakika spam olmasın)
                        db().prepare('UPDATE vip_grants SET reminder_sent_at = ? WHERE id = ?').run(now(), g.id);
                        this._log(g.id, 'reminder', g.package_name, g.mc_nick, g.user_id,
                            r.ok ? `DM gönderildi (${daysLeft} gün kala)` : `DM BAŞARISIZ (${r.statusCode || r.error}) — kullanıcı DM'leri kapalı olabilir`);
                    } catch (e) { console.error(`[VIP] hatırlatma hatası grant#${g.id}:`, e.message); }
                }
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
