/**
 * LagGuard · Attribution · Probe (Faz 3)
 * ──────────────────────────────────────
 * Lag anında "kim/ne" sorusuna en iyi-çaba yanıt verir ve SHADOW LOG'a yazar
 * (ceza YOK — o Faz 4). Sinyaller, güvenilirlik sırasıyla:
 *   1) En kötü boyut       → `/forge tps` per-dim "Mean tick time" satırları
 *   2) Entity census       → `/forge entity list` tür→adet (neyin yığıldığı)
 *   3) Online oyuncu aday  → mc.players (derin taramada boyut ile filtrelenir)
 *   4) UUID                → usercache.json (Mojang'a gerek yok)
 *   5) FTB Chunks claim    → best-effort (mevcutsa zenginleştirme)
 *
 * Komut çıktısı paket/sürüm arası değişebildiğinden parserlar SAVUNMACIDIR;
 * veri yoksa o sinyal "—" olur, tarama yine sonuç döndürür.
 */
const { getDb } = require('../../../db/database');
const { cleanConsoleLine } = require('../../../utils/text');
const usercache = require('./usercache');
const ftbChunks = require('./ftbChunks');

// ── Parserlar (savunmacı — log prefix/timestamp içinden çalışır) ─────────────
// Yakalanan satırlar HAM gelir (ör. "[12:34:56] [Server thread/INFO]: ...") +
// Forge/NeoForge format farkları (iki-nokta opsiyonel, "Dim 0 (ns:id)" vs "Dim ns:id").
//
// "Dim 0 (minecraft:overworld): Mean tick time: 3.4 ms. Mean TPS: 20.0"   (eski Forge)
// "Dim minecraft:overworld (Overworld): Mean tick time: 3.4 ms"           (Forge 1.19+)
// "Dim minecraft:overworld: Mean tick time 5.1 ms. Mean TPS: 20.000"      (NeoForge, iki-noktasız)
const DIM_RE = /\bDim\b[^\n]*?([a-z][a-z0-9_.-]*:[a-z0-9_/.-]+)[^\n]*?Mean tick time:?\s*([\d.]+)\s*ms/i;
// Entity census — sayı/id sırası ve ayraç (":" / "x" / boşluk) değişebilir; timestamp
// rakamları bozmasın diye id'nin sayıya BİTİŞİK olması şart (anchor yok).
// "   500: minecraft:item" · "500 minecraft:item" · "minecraft:item: 500" · "1267  ae2:cable"
const ENT_COUNT_FIRST = /(\d+)\s*(?:[:x]\s*|\s+)([a-z][a-z0-9_]*:[a-z0-9_/]+)/i;
const ENT_ID_FIRST    = /([a-z][a-z0-9_]*:[a-z0-9_/]+)\s*(?:[:x]\s*|\s+)(\d+)\b/i;
// "<name> has the following entity data: "minecraft:overworld""
const PDIM_RE = /has the following entity data:\s*"?([a-z0-9_]+:[a-z0-9_/.-]+)"?/i;

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

    isBusy() { return this._busy; }

    /**
     * Atıf taraması çalıştır → shadow log'a yaz.
     * @param {object} mc — minecraftService
     * @param {{ mode, mspt, deep }} opt
     * @returns {Promise<object>} kayıt + kanıt
     */
    async runScan(mc, { mode = 'manual', mspt = null, deep = false } = {}) {
        if (this._busy) return { ok: false, note: 'Zaten çalışan bir tarama var.' };
        if (!mc || mc.status !== 'running') return { ok: false, note: 'Sunucu çalışmıyor.' };
        this._busy = true;
        try {
            const serverPath = (() => { try { return mc.getServerPath ? mc.getServerPath() : null; } catch { return null; } })();
            const tpsCmd = mc._tpsCmdActive && /tps/i.test(mc._tpsCmdActive) ? mc._tpsCmdActive : 'forge tps';

            // 1) En kötü boyut
            const tpsLines = clean(await this._capture(mc, tpsCmd, 3000));
            const dims = parseDims(tpsLines);
            const worst = dims[0] || null;

            // 2) Entity census (forge/neoforge)
            const entCmd = /neoforge/i.test(tpsCmd) ? 'neoforge entity list' : 'forge entity list';
            const entLines = clean(await this._capture(mc, entCmd, 3500));
            const entities = parseEntities(entLines);

            // 3) Online oyuncular + UUID
            const online = Array.isArray(mc.players) ? [...mc.players] : [];
            const notes = [];

            // 4) Adaylar — derin taramada her oyuncunun boyutunu sorgulayıp filtrele
            let suspects = [];
            if (deep && worst && online.length) {
                for (const name of online.slice(0, 30)) {
                    const dimLines = await this._capture(mc, `data get entity ${name} Dimension`, 1200);
                    let pdim = null;
                    for (const l of dimLines) { const m = l.match(PDIM_RE); if (m) { pdim = m[1]; break; } }
                    if (pdim === worst.dim) {
                        suspects.push({ name, uuid: usercache.uuidOf(serverPath, name), dimension: pdim, reason: 'en kötü boyutta aktif' });
                    }
                }
                if (!suspects.length) notes.push('Derin tarama: en kötü boyutta online oyuncu bulunamadı (AFK farm / offline claim olabilir).');
            } else {
                // Hafif tarama: tüm online oyuncular düşük-güven aday
                suspects = online.slice(0, 30).map(name => ({
                    name, uuid: usercache.uuidOf(serverPath, name), dimension: null, reason: 'online (boyut doğrulanmadı)',
                }));
            }

            // 5) FTB Chunks durumu (zenginleştirme/raporlama)
            const ftb = ftbChunks.status(serverPath);
            if (!ftb.available) notes.push(ftb.note);

            // Kalibrasyon yardımı: parse boş döndüyse ham çıktının örneğini sakla
            const rawTps = dims.length ? null : rawSample(tpsLines);
            const rawEnt = entities.length ? null : rawSample(entLines);
            if (!dims.length) notes.push(`Boyut parse edilemedi ("${tpsCmd}"). Ham çıktı örneği kaydedildi (kalibrasyon için).`);
            if (!entities.length) notes.push(`Entity census parse edilemedi ("${entCmd}"). Ham çıktı örneği kaydedildi.`);

            const evidence = {
                dims, entities, players: online,
                suspects, ftb: { available: ftb.available, owners: ftb.owners?.slice(0, 20) || [], note: ftb.note },
                notes, tpsCmd, entCmd, deep,
                ...(rawTps ? { rawTps } : {}),
                ...(rawEnt ? { rawEnt } : {}),
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
                // 30 günden eski shadow kayıtları temizle
                getDb().prepare("DELETE FROM lag_attribution WHERE ts < ?").run(Date.now() - 30 * 86400_000);
            } catch (e) { notes.push(`Kayıt hatası: ${e.message}`); }

            return { ok: true, worst, suspectCount: suspects.length, suspects, entities: entities.slice(0, 8), dims, notes };
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
