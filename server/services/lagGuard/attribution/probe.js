/**
 * LagGuard · Attribution · Probe (Faz 3)
 * ──────────────────────────────────────
 * Lag anında "kim/ne" sorusuna en iyi-çaba yanıt verir ve SHADOW LOG'a yazar
 * (ceza YOK — o Faz 4). Komut seti SUNUCUYA göre değişir:
 *
 *   • Forge/NeoForge → `forge tps` per-dim (en kötü boyut) + `forge entity list`
 *     (entity census). Sadece algılanan loader forge ise denenir.
 *   • Vanilla (1.20.3+/1.21, `tick query`) → per-dim TPS ve entity list komutu YOK.
 *     Atıf, oyuncu census'una dayanır: `data get entity <n> Dimension`/`Pos` (vanilla'da
 *     çalışır) → boyut, OYUNCU YOĞUNLUĞUNDAN türetilir; konum + FTB claim ile zenginleşir.
 *
 * ÖNEMLİ: olmayan komut GÖNDERİLMEZ (vanilla'da "forge tps" konsolu "Unknown command"
 * ile spam'ler). Algılanan komut (mc._tpsCmdActive) loader tespitinde kullanılır.
 *
 * UUID: usercache.json (Mojang'a gerek yok). FTB Chunks: best-effort.
 */
const { getDb } = require('../../../db/database');
const { cleanConsoleLine } = require('../../../utils/text');
const usercache = require('./usercache');
const ftbChunks = require('./ftbChunks');

// ── Parserlar (savunmacı — log prefix/timestamp içinden çalışır) ─────────────
// "Dim 0 (minecraft:overworld): Mean tick time: 3.4 ms. Mean TPS: 20.0"   (eski Forge)
// "Dim minecraft:overworld (Overworld): Mean tick time: 3.4 ms"           (Forge 1.19+)
// "Dim minecraft:overworld: Mean tick time 5.1 ms. Mean TPS: 20.000"      (NeoForge, iki-noktasız)
const DIM_RE = /\bDim\b[^\n]*?([a-z][a-z0-9_.-]*:[a-z0-9_/.-]+)[^\n]*?Mean tick time:?\s*([\d.]+)\s*ms/i;
// Entity census — sayı/id sırası ve ayraç (":" / "x" / boşluk) değişebilir; timestamp
// rakamları bozmasın diye id'nin sayıya BİTİŞİK olması şart (anchor yok).
const ENT_COUNT_FIRST = /(\d+)\s*(?:[:x]\s*|\s+)([a-z][a-z0-9_]*:[a-z0-9_/]+)/i;
const ENT_ID_FIRST    = /([a-z][a-z0-9_]*:[a-z0-9_/]+)\s*(?:[:x]\s*|\s+)(\d+)\b/i;
// "<name> has the following entity data: "minecraft:overworld""  (isim + boyut)
const PNAME_DIM_RE = /(\w{1,16}) has the following entity data:\s*"([a-z0-9_]+:[a-z0-9_/.-]+)"/i;
// "<name> has the following entity data: [123.4d, 64.0d, -56.7d]"  (isim + konum)
const PNAME_POS_RE = /(\w{1,16}) has the following entity data:\s*\[\s*(-?[\d.]+)d?,\s*(-?[\d.]+)d?,\s*(-?[\d.]+)d?/i;

function clean(lines) { return lines.map(l => cleanConsoleLine(String(l))); }

function parseDims(lines) {
    const byDim = {};
    for (const l of lines) {
        const m = l.match(DIM_RE);
        if (!m) continue;
        const dim = m[1], mspt = parseFloat(m[2]);
        if (!byDim[dim] || mspt > byDim[dim]) byDim[dim] = mspt; // tekrar gelirse en kötüsü
    }
    return Object.entries(byDim).map(([dim, mspt]) => ({ dim, mspt })).sort((a, b) => b.mspt - a.mspt);
}

function parseEntities(lines) {
    const counts = {};
    for (const l of lines) {
        if (/mean tick time|mean tps/i.test(l)) continue; // tps satırını entity sanma
        let m = l.match(ENT_COUNT_FIRST);
        if (m) { counts[m[2]] = (counts[m[2]] || 0) + parseInt(m[1]); continue; }
        m = l.match(ENT_ID_FIRST);
        if (m) counts[m[1]] = (counts[m[1]] || 0) + parseInt(m[2]);
    }
    return Object.entries(counts).map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count).slice(0, 12);
}

// Kalibrasyon için: parse başarısızsa ham satırların küçük bir örneğini sakla
function rawSample(lines) {
    return lines
        .filter(l => l && !/^\[.*\] \[.*\]: $/.test(l))
        .slice(-25)
        .map(l => l.slice(0, 200));
}

class AttributionProbe {
    constructor() {
        this._busy = false;
        this._lastAutoAt = 0;
    }

    /** EventEmitter'dan komut çıktısını pencere boyunca topla. */
    _capture(mc, command, windowMs = 3000) {
        return new Promise((resolve) => {
            if (!mc || typeof mc.sendCommand !== 'function') return resolve([]);
            const lines = [];
            const onLine = (line) => {
                const t = typeof line === 'string' ? line : (line?.data || line?.message || '');
                if (t) lines.push(t);
            };
            try { mc.on('log', onLine); } catch { return resolve([]); }
            try { mc.sendCommand(command); } catch { /* ignore */ }
            const timer = setTimeout(() => {
                try { mc.off('log', onLine); } catch { /* ignore */ }
                resolve(lines);
            }, windowMs);
            if (timer.unref) timer.unref();
        });
    }

    /** Birden çok komutu tek pencerede gönder + çıktıyı topla (isimle eşleme için). */
    _captureBatch(mc, commands, windowMs = 3500) {
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

    /**
     * Atıf taraması çalıştır → shadow log'a yaz. Komut seti loader'a göre seçilir;
     * olmayan komut gönderilmez (vanilla'da forge komutları atlanır).
     */
    async runScan(mc, { mode = 'manual', mspt = null, deep = false } = {}) {
        if (this._busy) return { ok: false, note: 'Zaten çalışan bir tarama var.' };
        if (!mc || mc.status !== 'running') return { ok: false, note: 'Sunucu çalışmıyor.' };
        this._busy = true;
        try {
            const serverPath = (() => { try { return mc.getServerPath ? mc.getServerPath() : null; } catch { return null; } })();
            const detected = mc._tpsCmdActive || '';
            const isForge = /forge/i.test(detected); // "forge tps" / "neoforge tps"
            const online = Array.isArray(mc.players) ? [...mc.players].slice(0, 40) : [];
            const notes = [];
            if (mspt == null) { try { mspt = require('../metrics').getLive().mspt; } catch { /* ignore */ } }

            // 1) Per-boyut lag — yalnız Forge/NeoForge'da mümkün (vanilla tick query vermez)
            let dims = [], rawTps = null;
            if (isForge) {
                const tpsLines = clean(await this._capture(mc, detected, 3000));
                dims = parseDims(tpsLines);
                if (!dims.length) { rawTps = rawSample(tpsLines); notes.push(`Boyut parse edilemedi ("${detected}"). Ham örnek kaydedildi.`); }
            } else {
                notes.push('Vanilla komut seti: per-boyut TPS yok → boyut, oyuncu yoğunluğundan türetiliyor.');
            }

            // 2) Oyuncu census — boyut (+derin: konum). Tek pencere, isimle eşle.
            const cmds = [];
            for (const n of online) {
                cmds.push(`data get entity ${n} Dimension`);
                if (deep) cmds.push(`data get entity ${n} Pos`);
            }
            const pInfo = {}; // name → { dimension, pos }
            if (cmds.length) {
                const lines = clean(await this._captureBatch(mc, cmds, deep ? 5000 : 3500));
                for (const l of lines) {
                    const dm = l.match(PNAME_DIM_RE);
                    if (dm) { (pInfo[dm[1]] = pInfo[dm[1]] || {}).dimension = dm[2]; continue; }
                    const pm = l.match(PNAME_POS_RE);
                    if (pm) { (pInfo[pm[1]] = pInfo[pm[1]] || {}).pos = [Math.round(+pm[2]), Math.round(+pm[3]), Math.round(+pm[4])]; }
                }
            }

            // Boyut dağılımı (oyuncu sayısı)
            const dimCounts = {};
            for (const n of online) { const dd = pInfo[n]?.dimension; if (dd) dimCounts[dd] = (dimCounts[dd] || 0) + 1; }
            const dimDist = Object.entries(dimCounts).map(([dim, players]) => ({ dim, players })).sort((a, b) => b.players - a.players);
            const resolvedDims = Object.values(pInfo).filter(p => p.dimension).length;
            if (online.length && !resolvedDims) notes.push('Oyuncu boyutları alınamadı (data get çıktısı parse edilemedi). Ham örnek kaydedildi.');

            // En kötü boyut: forge per-dim varsa MSPT'ye göre; yoksa en kalabalık boyut
            let worst = dims[0] ? { dim: dims[0].dim, mspt: dims[0].mspt } : null;
            let worstFrom = worst ? 'forge-perdim' : null;
            if (!worst && dimDist.length) { worst = { dim: dimDist[0].dim, players: dimDist[0].players }; worstFrom = 'oyuncu-yogunlugu'; }

            // 3) Entity census — yalnız Forge
            let entities = [], rawEnt = null, entCmd = null;
            if (isForge) {
                entCmd = /neoforge/i.test(detected) ? 'neoforge entity list' : 'forge entity list';
                const entLines = clean(await this._capture(mc, entCmd, 3500));
                entities = parseEntities(entLines);
                if (!entities.length) { rawEnt = rawSample(entLines); notes.push(`Entity census parse edilemedi ("${entCmd}"). Ham örnek kaydedildi.`); }
            } else {
                notes.push('Vanilla: entity census komutu yok (forge entity list yok) → atıf oyuncu konumu + claim ile yapılır.');
            }

            // 4) FTB Chunks durumu
            const ftb = ftbChunks.status(serverPath);
            if (!ftb.available) notes.push(ftb.note);

            // 5) Adaylar — en yoğun/kötü boyuttakiler önce
            const suspects = online.map(name => {
                const info = pInfo[name] || {};
                const inWorst = !!(worst && info.dimension && info.dimension === worst.dim);
                return {
                    name, uuid: usercache.uuidOf(serverPath, name),
                    dimension: info.dimension || null, pos: info.pos || null,
                    reason: info.dimension ? (inWorst ? 'en yoğun boyutta' : 'online') : 'boyut alınamadı',
                    _w: inWorst ? 0 : 1,
                };
            }).sort((a, b) => a._w - b._w);
            suspects.forEach(s => delete s._w);

            const evidence = {
                dims, dimDist, entities, players: online, suspects, worstFrom,
                ftb: { available: ftb.available, owners: ftb.owners?.slice(0, 20) || [], note: ftb.note },
                notes, detected, isForge, entCmd, deep,
                ...(rawTps ? { rawTps } : {}), ...(rawEnt ? { rawEnt } : {}),
            };

            const row = {
                ts: Date.now(), mode, mspt_at: mspt,
                worst_dim: worst?.dim || null, worst_dim_mspt: worst?.mspt ?? null,
                suspect_count: suspects.length, evidence: JSON.stringify(evidence),
            };
            try {
                getDb().prepare(`INSERT INTO lag_attribution
                    (ts, mode, mspt_at, worst_dim, worst_dim_mspt, suspect_count, evidence)
                    VALUES (@ts, @mode, @mspt_at, @worst_dim, @worst_dim_mspt, @suspect_count, @evidence)`).run(row);
                getDb().prepare("DELETE FROM lag_attribution WHERE ts < ?").run(Date.now() - 30 * 86400_000);
            } catch (e) { notes.push(`Kayıt hatası: ${e.message}`); }

            return { ok: true, worst, worstFrom, suspectCount: suspects.length, suspects: suspects.slice(0, 12), entities: entities.slice(0, 8), dimDist, notes };
        } finally {
            this._busy = false;
        }
    }

    /** Karar motoru için: sürekli kritik lag'de seyrek otomatik tarama (rate-limit). */
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
