/**
 * LagGuard · Attribution · Probe (Faz 3)
 * ──────────────────────────────────────
 * Lag anında "kim" sorusuna en iyi-çaba yanıt → SHADOW LOG (ceza YOK; o Faz 4).
 *
 * Şu an (vanilla komut seti): her online oyuncunun boyut + konumu
 * `data get entity <n> Dimension|Pos` ile alınır (tek pencere, isimle eşlenir),
 * sonra durduğu chunk'ın FTB Chunks claim SAHİBİ çözülür (ftbChunks.ownerAt).
 *
 * TPS PAYI (her oyuncunun ne kadar lag yaptığı): Observable profil verisi
 * bağlanınca doldurulacak (koordinat bazlı tick maliyeti → sahip başına %).
 * Şimdilik tpsPct/estMs = null.
 */
const { getDb } = require('../../../db/database');
const { cleanConsoleLine } = require('../../../utils/text');
const ftbChunks = require('./ftbChunks');

// "<name> has the following entity data: "minecraft:overworld""  (isim + boyut)
const PNAME_DIM_RE = /(\w{1,16}) has the following entity data:\s*"([a-z0-9_]+:[a-z0-9_/.-]+)"/i;
// "<name> has the following entity data: [123.4d, 64.0d, -56.7d]"  (isim + konum)
const PNAME_POS_RE = /(\w{1,16}) has the following entity data:\s*\[\s*(-?[\d.]+)d?,\s*(-?[\d.]+)d?,\s*(-?[\d.]+)d?/i;

function clean(lines) { return lines.map(l => cleanConsoleLine(String(l))); }

// Kalibrasyon için: parse başarısızsa ham satır örneği
function rawSample(lines) {
    return lines.filter(l => l && !/^\[.*\] \[.*\]: $/.test(l)).slice(-25).map(l => l.slice(0, 200));
}

class AttributionProbe {
    constructor() {
        this._busy = false;
        this._lastAutoAt = 0;
    }

    /** Birden çok komutu tek pencerede gönder + çıktıyı topla (isimle eşleme için). */
    _captureBatch(mc, commands, windowMs = 4000) {
        return new Promise((resolve) => {
            if (!mc || typeof mc.sendCommand !== 'function' || !commands.length) return resolve([]);
            const lines = [];
            const onLine = (line) => {
                const t = typeof line === 'string' ? line : (line?.data || line?.message || '');
                if (t) lines.push(t);
            };
            try { mc.on('log', onLine); } catch { return resolve([]); }
            for (const c of commands) { try { mc.sendCommand(c); } catch { /* ignore */ } }
            const timer = setTimeout(() => {
                try { mc.off('log', onLine); } catch { /* ignore */ }
                resolve(lines);
            }, windowMs);
            if (timer.unref) timer.unref();
        });
    }

    isBusy() { return this._busy; }

    /** Atıf taraması → shadow log'a yaz. */
    async runScan(mc, { mode = 'manual', mspt = null, deep = false } = {}) {
        if (this._busy) return { ok: false, note: 'Zaten çalışan bir tarama var.' };
        if (!mc || mc.status !== 'running') return { ok: false, note: 'Sunucu çalışmıyor.' };
        this._busy = true;
        try {
            const serverPath = (() => { try { return mc.getServerPath ? mc.getServerPath() : null; } catch { return null; } })();
            const online = Array.isArray(mc.players) ? [...mc.players].slice(0, 40) : [];
            const notes = [];
            if (mspt == null) { try { mspt = require('../metrics').getLive().mspt; } catch { /* ignore */ } }

            // Oyuncu boyut + konum — tek pencere, isimle eşle
            const cmds = [];
            for (const n of online) { cmds.push(`data get entity ${n} Dimension`); cmds.push(`data get entity ${n} Pos`); }
            const pInfo = {}; // name → { dimension, pos }
            let rawData = null;
            if (cmds.length) {
                const lines = clean(await this._captureBatch(mc, cmds, 4000));
                for (const l of lines) {
                    const dm = l.match(PNAME_DIM_RE);
                    if (dm) { (pInfo[dm[1]] = pInfo[dm[1]] || {}).dimension = dm[2]; continue; }
                    const pm = l.match(PNAME_POS_RE);
                    if (pm) { (pInfo[pm[1]] = pInfo[pm[1]] || {}).pos = [Math.round(+pm[2]), Math.round(+pm[3]), Math.round(+pm[4])]; }
                }
                const resolved = Object.values(pInfo).filter(p => p.dimension || p.pos).length;
                if (online.length && !resolved) { rawData = rawSample(lines); notes.push('Oyuncu konum/boyutu alınamadı (data get parse edilemedi). Ham örnek kaydedildi.'); }
            }

            // FTB claim sahibi — her oyuncunun durduğu chunk
            const ftb = ftbChunks.status(serverPath);
            const suspects = online.map(name => {
                const info = pInfo[name] || {};
                let ftbOwner = null;
                if (info.pos && info.dimension) {
                    const o = ftbChunks.ownerAt(serverPath, info.dimension, info.pos[0], info.pos[2]);
                    if (o) ftbOwner = o.owner || (o.team ? o.team.slice(0, 8) : null);
                }
                return {
                    name, pos: info.pos || null, dimension: info.dimension || null, ftbOwner,
                    tpsPct: null, estMs: null, // Observable bağlanınca dolacak
                };
            });

            const evidence = {
                suspects, players: online,
                ftb: { available: ftb.available, parsed: ftb.parsed || 0, note: ftb.note },
                notes, deep, ...(rawData ? { rawData } : {}),
            };
            const row = {
                ts: Date.now(), mode, mspt_at: mspt, worst_dim: null, worst_dim_mspt: null,
                suspect_count: suspects.length, evidence: JSON.stringify(evidence),
            };
            try {
                getDb().prepare(`INSERT INTO lag_attribution
                    (ts, mode, mspt_at, worst_dim, worst_dim_mspt, suspect_count, evidence)
                    VALUES (@ts, @mode, @mspt_at, @worst_dim, @worst_dim_mspt, @suspect_count, @evidence)`).run(row);
                getDb().prepare("DELETE FROM lag_attribution WHERE ts < ?").run(Date.now() - 30 * 86400_000);
            } catch (e) { notes.push(`Kayıt hatası: ${e.message}`); }

            return {
                ok: true, suspectCount: suspects.length, suspects: suspects.slice(0, 20),
                ftb: { available: ftb.available, parsed: ftb.parsed || 0 }, notes,
            };
        } finally {
            this._busy = false;
        }
    }

    /** Sürekli kritik lag'de seyrek otomatik tarama (rate-limit 5dk). */
    async maybeAutoScan(mc, mode, mspt, minIntervalSec = 300) {
        const now = Date.now();
        if (now - this._lastAutoAt < minIntervalSec * 1000) return;
        this._lastAutoAt = now;
        try { await this.runScan(mc, { mode, mspt, deep: false }); } catch { /* ignore */ }
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
