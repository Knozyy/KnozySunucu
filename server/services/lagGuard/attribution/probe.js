/**
 * LagGuard · Attribution · Probe (Faz 3) — Observable tabanlı
 * ──────────────────────────────────────────────────────────
 * Lag anında "kim ne kadar lag yapıyor" → Observable profil verisinden çıkarır
 * ve SHADOW LOG'a yazar (ceza YOK; o Faz 4).
 *
 * Akış:
 *   1) `observable run N` çalıştır → sonuç URL'si (.../p/<id>)   [observable.js]
 *   2) /v1/get/<id> → JSON: her entity/block { position:{x,y,z}, type, rate (ns/tick) }
 *   3) Her hotspot'un koordinatı → FTB Chunks claim SAHİBİ (ftbChunks.ownerAt)
 *   4) Sahip başına maliyet topla → TPS payı (ms/tick + %). En pahalı koordinat/tür de.
 *
 * Tarama ~25sn sürer (20sn profil + veri) → rotalar fire-and-forget çağırır,
 * panel shadow log'u poll'lar.
 */
const { getDb } = require('../../../db/database');
const ftbChunks = require('./ftbChunks');
const observable = require('../observable');

const NS_PER_MS = 1e6;
const TICK_BUDGET_MS = 50; // bir tick bütçesi — budgetPct bunun yüzdesi

class AttributionProbe {
    constructor() {
        this._busy = false;
        this._lastAutoAt = 0;
    }

    isBusy() { return this._busy; }

    /** İsim listesini benzersizleştirip "A-B-C +N" biçiminde birleştirir (boşsa null). */
    _joinNames(names, maxNames = 3) {
        const seen = new Set();
        const uniq = [];
        for (const n of (names || [])) {
            const key = String(n).toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            uniq.push(n);
        }
        if (!uniq.length) return null;
        if (uniq.length <= maxNames) return uniq.join('-');
        return `${uniq.slice(0, maxNames).join('-')} +${uniq.length - maxNames}`;
    }

    /**
     * Lag yapan koordinata FİZİKSEL olarak yakın online oyuncu(ları) döndürür
     * (yakınlık sırasına göre, "Ahmet-Mehmet"). Takım üyeliğinden bağımsızdır:
     * ally'sinin base'inde duran oyuncu o base'e atfedilir, kendi takımına değil.
     * @param positions { nick: { x, z, dim } } — collectPlayerPositions çıktısı
     * @returns string|null — eşik içinde oyuncu yoksa null (çağıran takım adına düşer)
     */
    nearestOnlinePlayers(positions, dim, blockX, blockZ, threshold = 64, maxNames = 3) {
        if (!positions || blockX == null || blockZ == null) return null;
        const near = [];
        for (const nick of Object.keys(positions)) {
            const p = positions[nick];
            if (!p || p.x == null || p.z == null) continue;
            if (p.dim && dim && p.dim !== dim) continue;
            const d = Math.hypot(p.x - blockX, p.z - blockZ);
            if (d <= threshold) near.push({ nick, d });
        }
        if (!near.length) return null;
        near.sort((a, b) => a.d - b.d);
        return this._joinNames(near.map(n => n.nick), maxNames);
    }

    /**
     * Bir koordinatın sahip etiketini DURUMSAL belirler (kullanıcı mantığı):
     *   1) Claim sahibi takımın ONLINE üyeleri → base'in sorumlusu onlardır
     *      (başka takımdan ziyaretçi o an base'de olsa bile lag ona yazılmaz).
     *   2) Takımda online üye yoksa → o noktada FİZİKSEL duran oyuncu
     *      (ziyaretçi/tetikleyici); kimse yoksa…
     *   3) …takım adı (offline base) / claimsiz koordinatta null (wild).
     * @param ownerResult ftbChunks.ownerAt çıktısı ({ team, owner, owners[] }) | null
     * @param playerPositions { nick: { x?, z?, dim? } } — Object.keys = online oyuncular
     */
    ownerLabel(ownerResult, playerPositions, dim, x, z) {
        const onlineNicks = new Set(Object.keys(playerPositions || {}).map(n => String(n).toLowerCase()));
        const o = ownerResult;
        // 1) Claim sahibi takımın online üyeleri
        if (o && o.owners && o.owners.length) {
            const teamOnline = this._joinNames(o.owners.filter(n => onlineNicks.has(String(n).toLowerCase())));
            if (teamOnline) return teamOnline;
        }
        // 2) Takımda online yok → o noktaya fiziksel yakın oyuncu
        const nearby = this.nearestOnlinePlayers(playerPositions, dim, x, z);
        if (nearby) return nearby;
        // 3) Takım adı (offline base) veya wild (null)
        return o && o.owner ? o.owner : null;
    }

    /**
     * Online oyuncuların X/Z/dim konumlarını sunucudan toplar
     * (`data get entity <nick> Pos|Dimension` → log parse). Lag atfını fiziksel
     * konuma dayandırmak için tarama anında çağrılır. Komut/erişim yoksa {} döner.
     * @returns Promise<{ nick: { x, z, dim } }>
     */
    collectPlayerPositions(mc, timeoutMs = 4000) {
        const players = (mc && mc.players) || [];
        if (!players.length || typeof mc.sendCommand !== 'function') return Promise.resolve({});
        const positions = {};
        // Tüm online oyuncuları key olarak başlat: konum gelmese de takım-üye
        // eşlemesi için "online mı?" bilgisi (Object.keys) kullanılabilsin.
        for (const nick of players) positions[nick] = {};
        const posRe = /(\w{1,16}) has the following entity data: \[(-?[\d.]+)d, (-?[\d.]+)d, (-?[\d.]+)d\]/;
        const dimRe = /(\w{1,16}) has the following entity data: "([a-z0-9_:]+)"/i;
        return new Promise((resolve) => {
            const onLine = (line) => {
                const text = typeof line === 'string' ? line : ((line && (line.data || line.message)) || '');
                if (!text) return;
                const pm = text.match(posRe);
                if (pm) { positions[pm[1]] = { ...(positions[pm[1]] || {}), x: Math.round(+pm[2]), z: Math.round(+pm[4]) }; return; }
                const dm = text.match(dimRe);
                if (dm) positions[dm[1]] = { ...(positions[dm[1]] || {}), dim: dm[2] };
            };
            try { mc.on('log', onLine); } catch { /* ignore */ }
            for (const nick of players) {
                try { mc.sendCommand(`data get entity ${nick} Pos`); mc.sendCommand(`data get entity ${nick} Dimension`); } catch { /* ignore */ }
            }
            setTimeout(() => { try { mc.off('log', onLine); } catch { /* ignore */ } resolve(positions); }, timeoutMs);
        });
    }

    /**
     * Observable JSON'unu sahip/hotspot/tür atıfına çevirir (saf fonksiyon) — v2.
     * v2: görece "toplamın %X'i" YOK; mutlak ms + 50ms tick bütçesi yüzdesi var.
     * Makine (blk) ve canlı (ent) maliyeti ayrı; wild (claimsiz) hiçbir sahibe yazılmaz.
     * @param ownerAt — test için enjekte edilebilir sahip çözücü (dim,x,z) → owner|null
     */
    attributeProfile(json, serverPath, ownerAt = null, playerPositions = {}) {
        const d = (json && json.data) || {};
        const diag = (json && json.diagnostics) || {};
        const hotspots = [];
        for (const kind of ['entities', 'blocks']) {
            for (const [dim, arr] of Object.entries(d[kind] || {})) {
                for (const e of (arr || [])) {
                    if (e == null || e.rate == null) continue;
                    const p = e.position || {};
                    hotspots.push({ kind: kind === 'entities' ? 'ent' : 'blk', dim, type: e.type || '?', x: p.x, y: p.y, z: p.z, rate: e.rate });
                }
            }
        }
        const total = hotspots.reduce((s, h) => s + h.rate, 0) || 1;
        const resolve = ownerAt || ((dim, x, z) => {
            const o = ftbChunks.ownerAt(serverPath, dim, x, z);
            return this.ownerLabel(o, playerPositions, dim, x, z);
        });
        const ownerOf = (h) => (h.x == null || h.z == null) ? null : resolve(h.dim, h.x, h.z);

        const ms = (rate) => +(rate / NS_PER_MS).toFixed(3);
        const budgetPct = (rate) => +(100 * (rate / NS_PER_MS) / TICK_BUDGET_MS).toFixed(1);

        // Sahip başına maliyet — makine (blk) ve canlı (ent) AYRI; wild kimseye yazılmaz
        const acc = {}; // owner → { blk, ent } (ns/tick)
        const wildAcc = { blk: 0, ent: 0 };
        for (const h of hotspots) {
            const owner = ownerOf(h);
            const bucket = owner ? (acc[owner] = acc[owner] || { blk: 0, ent: 0 }) : wildAcc;
            bucket[h.kind === 'blk' ? 'blk' : 'ent'] += h.rate;
        }
        const owners = Object.entries(acc).map(([owner, b]) => ({
            owner,
            blockMs: ms(b.blk), entityMs: ms(b.ent), totalMs: ms(b.blk + b.ent),
            budgetPct: budgetPct(b.blk + b.ent),
        })).sort((a, b) => b.totalMs - a.totalMs);
        const wild = {
            blockMs: ms(wildAcc.blk), entityMs: ms(wildAcc.ent), totalMs: ms(wildAcc.blk + wildAcc.ent),
            budgetPct: budgetPct(wildAcc.blk + wildAcc.ent),
        };

        // En pahalı bireysel hotspot'lar (koordinat + sahip)
        hotspots.sort((a, b) => b.rate - a.rate);
        const top = hotspots.slice(0, 15).map(h => ({
            kind: h.kind, type: h.type, dim: h.dim, pos: [h.x, h.y, h.z],
            ms: ms(h.rate), budgetPct: budgetPct(h.rate), owner: ownerOf(h),
        }));

        // En pahalı türler
        const typeRate = {};
        for (const h of hotspots) typeRate[h.type] = (typeRate[h.type] || 0) + h.rate;
        const types = Object.entries(typeRate)
            .map(([type, rate]) => ({ type, ms: ms(rate), budgetPct: budgetPct(rate) }))
            .sort((a, b) => b.ms - a.ms).slice(0, 10);

        return {
            v: 2,
            owners, wild, top, types,
            totalMs: +(total / NS_PER_MS).toFixed(2), count: hotspots.length,
            ticks: d.ticks || null, duration: diag.duration || null,
            modLoader: diag.modLoader || null, mcVersion: diag.minecraftVersion || null,
        };
    }

    /**
     * Tam tarama: Observable çalıştır → veri çek → atıf → shadow log'a yaz.
     * ~25sn sürer; fire-and-forget çağrılmalı (await edilirse HTTP timeout riski).
     */
    async runScan(mc, { mode = 'manual', mspt = null } = {}) {
        if (this._busy) return { ok: false, note: 'Zaten çalışan bir tarama var.' };
        if (!mc || mc.status !== 'running') return { ok: false, note: 'Sunucu çalışmıyor.' };
        this._busy = true;
        const notes = [];
        try {
            const serverPath = (() => { try { return mc.getServerPath ? mc.getServerPath() : null; } catch { return null; } })();
            if (mspt == null) { try { mspt = require('../metrics').getLive().mspt; } catch { /* ignore */ } }
            let seconds = 20;
            try { seconds = require('../index').getSettings().observableSeconds || 20; } catch { /* ignore */ }

            // 1) Observable profili çalıştır → URL
            const prof = await observable.runProfile(seconds);
            if (!prof.ok || !prof.url) {
                this._record({ mode, mspt, evidence: { ok: false, notes: [prof.note || 'Observable URL alınamadı'] }, suspectCount: 0 });
                return { ok: false, note: prof.note || 'Observable URL alınamadı' };
            }
            const id = observable.extractId(prof.url);
            if (!id) {
                this._record({ mode, mspt, evidence: { ok: false, url: prof.url, notes: ['URL parse edilemedi'] }, suspectCount: 0 });
                return { ok: false, note: 'Observable URL parse edilemedi: ' + prof.url };
            }

            // 2) Makine-okunur veriyi çek
            let json;
            try { json = await observable.fetchProfile(id); }
            catch (e) {
                this._record({ mode, mspt, evidence: { ok: false, url: prof.url, id, notes: ['Veri çekilemedi: ' + e.message] }, suspectCount: 0 });
                return { ok: false, note: 'Observable veri çekilemedi: ' + e.message, url: prof.url };
            }

            // 3) Atıf — online oyuncu konumlarıyla (lag noktasına fiziksel yakın oyuncuyu öncele)
            const playerPositions = await this.collectPlayerPositions(mc);
            const attr = this.attributeProfile(json, serverPath, null, playerPositions);
            const ftb = ftbChunks.status(serverPath);
            if (!ftb.available) notes.push('FTB Chunks claim verisi yok → sahipler "claimsiz" görünür. ' + ftb.note);
            else if (!ftb.parsed) notes.push('FTB claim parse edilemedi (format farklı olabilir).');

            const evidence = { ok: true, url: prof.url, id, ...attr, ftb: { available: ftb.available, parsed: ftb.parsed || 0 }, notes };
            this._record({ mode, mspt, evidence, suspectCount: attr.owners.length });
            return { ok: true, url: prof.url, owners: attr.owners.slice(0, 10), totalMs: attr.totalMs, count: attr.count };
        } finally {
            this._busy = false;
        }
    }

    _record({ mode, mspt, evidence, suspectCount }) {
        try {
            getDb().prepare(`INSERT INTO lag_attribution
                (ts, mode, mspt_at, worst_dim, worst_dim_mspt, suspect_count, evidence)
                VALUES (?, ?, ?, NULL, NULL, ?, ?)`)
                .run(Date.now(), mode, mspt, suspectCount, JSON.stringify(evidence));
            getDb().prepare("DELETE FROM lag_attribution WHERE ts < ?").run(Date.now() - 30 * 86400_000);
        } catch { /* ignore */ }

        // Discord lag panosu — yeni kayıt sonrası tazele (kuruluysa; kayıt akışını asla bozmaz)
        try { require('../../lagBoardService').scheduleRefresh(); } catch { /* ignore */ }
    }

    /** Sürekli kritik lag'de seyrek otomatik tarama (rate-limit 10dk; profil overhead'i var). */
    async maybeAutoScan(mc, mode, mspt, minIntervalSec = 600) {
        const now = Date.now();
        if (this._busy || now - this._lastAutoAt < minIntervalSec * 1000) return;
        this._lastAutoAt = now;
        try { await this.runScan(mc, { mode, mspt }); } catch { /* ignore */ }
    }

    list(limit = 50) {
        try {
            const rows = getDb().prepare('SELECT * FROM lag_attribution ORDER BY id DESC LIMIT ?').all(limit);
            return rows.map(r => ({ ...r, evidence: safeJson(r.evidence) }));
        } catch { return []; }
    }

    clear() {
        try { const r = getDb().prepare('DELETE FROM lag_attribution').run(); return { cleared: r.changes }; }
        catch { return { cleared: 0 }; }
    }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = new AttributionProbe();
