/**
 * LagGuard · Attribution · Evidence — tekrarlanan kanıt birikimi (adalet katmanı)
 * ────────────────────────────────────────────────────────────────────────────
 * Tek tarama asla suçlamaz. Kurallar (spec: 2026-06-09-adil-lag-atifi-tasarim.md):
 *  - Lag kapısı: yalnızca mspt_at ≥ msptWarn anında alınan v2 taramalar kanıt sayılır.
 *  - Pencere: en yeni attribWindowScans lag-taraması; azı attribMinScans ise "yetersiz".
 *  - Eksik tarama = 0 maliyet (medyan tek seferlik yükü doğal sönümler).
 *  - İşaretleme: medyan totalMs ≥ attribFlagMs VE ≥ attribMinScans taramada eşik üstü.
 *  - Güven: eşik-üstü oranı ≥ 0.75 → 'yüksek', değilse 'orta'.
 *  - Wild hiçbir zaman işaretlenmez; medyanı ayrı raporlanır.
 * Saf modül — DB/IO yok, birim testli (evidence.test.js).
 */

const TICK_BUDGET_MS = 50;

function median(values) {
    if (!values || !values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const r1 = (n) => +Number(n).toFixed(1);

/**
 * @param {Array} scans — lag_attribution satırları ({ ts, mspt_at, evidence }); sıra önemsiz.
 * @param {object} settings — { msptWarn, attribFlagMs, attribMinScans, attribWindowScans }
 * @returns {{ insufficient, lagScanCount, windowScans, msptWarn, minScans, lastScanTs,
 *             flagged: Array, watch: Array, wild: {medianMs,budgetPct}|null }}
 */
function summarize(scans, settings = {}) {
    const numOr = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d); // 0 geçerli bir ayar — || ile ezme
    const msptWarn = numOr(settings.msptWarn, 52);
    const flagMs = numOr(settings.attribFlagMs, 5);
    const minScans = numOr(settings.attribMinScans, 3);
    const windowScans = numOr(settings.attribWindowScans, 6);

    // Lag kapısı + v2 filtresi → en yeni N lag-taraması
    const lagScans = (scans || [])
        .filter(s => s && s.evidence && s.evidence.v === 2 && s.evidence.ok !== false
                  && s.mspt_at != null && s.mspt_at >= msptWarn)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, windowScans);

    const base = { lagScanCount: lagScans.length, windowScans, msptWarn, minScans, lastScanTs: lagScans[0]?.ts ?? null };
    if (lagScans.length < minScans) return { ...base, insufficient: true, flagged: [], watch: [], wild: null };

    // Penceredeki tüm sahipler — taramada görünmeyen sahip o tarama için 0 sayılır
    const ownersAll = new Set();
    for (const s of lagScans) for (const o of (s.evidence.owners || [])) ownersAll.add(o.owner);

    const flagged = [], watch = [];
    for (const owner of ownersAll) {
        const perScan = lagScans.map(s => (s.evidence.owners || []).find(o => o.owner === owner));
        const totals = perScan.map(o => (o ? o.totalMs : 0));
        const med = median(totals);
        const aboveCount = totals.filter(t => t >= flagMs).length;
        const row = {
            owner,
            medianMs: r1(med),
            medianBlockMs: r1(median(perScan.map(o => (o ? o.blockMs : 0)))),
            medianEntityMs: r1(median(perScan.map(o => (o ? o.entityMs : 0)))),
            budgetPct: r1(100 * med / TICK_BUDGET_MS),
            aboveCount, scanCount: lagScans.length,
        };
        if (med >= flagMs && aboveCount >= minScans) {
            row.confidence = (aboveCount / lagScans.length >= 0.75) ? 'yüksek' : 'orta';
            flagged.push(row);
        } else {
            watch.push(row); // izlemede — suçlama değil, görünürlük (medianMs 0 olabilir)
        }
    }
    flagged.sort((a, b) => b.medianMs - a.medianMs);
    watch.sort((a, b) => b.medianMs - a.medianMs);

    const wildMed = median(lagScans.map(s => s.evidence.wild?.totalMs ?? 0));
    const wild = { medianMs: r1(wildMed), budgetPct: r1(100 * wildMed / TICK_BUDGET_MS) };

    return { ...base, insufficient: false, flagged, watch: watch.slice(0, 8), wild };
}

module.exports = { summarize, median };
