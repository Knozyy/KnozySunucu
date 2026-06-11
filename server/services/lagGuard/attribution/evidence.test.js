const test = require('node:test');
const assert = require('node:assert');
const { summarize, median } = require('./evidence');

// Yardımcı: tek tarama satırı üret (lag_attribution formatında)
let _ts = 1000000;
function mkScan(msptAt, owners, wild = { blockMs: 0, entityMs: 0, totalMs: 0, budgetPct: 0 }) {
    _ts += 1000;
    return { ts: _ts, mode: 'auto', mspt_at: msptAt, evidence: { v: 2, ok: true, owners, wild } };
}
function owner(name, totalMs, blockMs = totalMs, entityMs = 0) {
    return { owner: name, blockMs, entityMs, totalMs, budgetPct: +(100 * totalMs / 50).toFixed(1) };
}
const SETTINGS = { msptWarn: 52, attribFlagMs: 5, attribMinScans: 3, attribWindowScans: 6 };

test('median: tek/çift/boş', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(median([]), 0);
});

test('lag kapısı: sağlıklı sunucu taramaları (mspt < 52) kanıt sayılmaz → yetersiz', () => {
    const scans = [mkScan(30, [owner('Knozy', 20)]), mkScan(35, [owner('Knozy', 22)]), mkScan(40, [owner('Knozy', 25)])];
    const r = summarize(scans, SETTINGS);
    assert.equal(r.insufficient, true);
    assert.equal(r.lagScanCount, 0);
    assert.deepEqual(r.flagged, []);
});

test('3 lag-taramasından azı varsa kimse işaretlenmez (yetersiz kanıt)', () => {
    const scans = [mkScan(60, [owner('Knozy', 20)]), mkScan(60, [owner('Knozy', 22)])];
    const r = summarize(scans, SETTINGS);
    assert.equal(r.insufficient, true);
    assert.equal(r.lagScanCount, 2);
});

test('işaretleme: medyan ≥ 5ms VE ≥3 taramada eşik üstü', () => {
    const scans = [
        mkScan(60, [owner('Knozy', 14)]),
        mkScan(60, [owner('Knozy', 12)]),
        mkScan(60, [owner('Knozy', 16)]),
        mkScan(60, [owner('Knozy', 13)]),
    ];
    const r = summarize(scans, SETTINGS);
    assert.equal(r.insufficient, false);
    assert.equal(r.flagged.length, 1);
    const f = r.flagged[0];
    assert.equal(f.owner, 'Knozy');
    assert.equal(f.medianMs, 13.5);  // median(12,13,14,16)
    assert.equal(f.aboveCount, 4);
    assert.equal(f.scanCount, 4);
    assert.equal(f.confidence, 'yüksek'); // 4/4 ≥ 0.75
    assert.equal(f.budgetPct, 27);   // 13.5/50
});

test('eksik tarama = 0: tek seferlik yük medyanla sönümlenir, işaretlenmez', () => {
    // Ali yalnızca 1 taramada görünüyor (geçici durum) — medyanı 0'a düşer
    const scans = [
        mkScan(60, [owner('Knozy', 10), owner('Ali', 30)]),
        mkScan(60, [owner('Knozy', 11)]),
        mkScan(60, [owner('Knozy', 12)]),
        mkScan(60, [owner('Knozy', 10)]),
    ];
    const r = summarize(scans, SETTINGS);
    assert.ok(!r.flagged.some(f => f.owner === 'Ali'), 'Ali işaretlenmemeli');
    const w = r.watch.find(x => x.owner === 'Ali');
    assert.ok(w, 'Ali izlemede görünmeli');
    assert.equal(w.medianMs, 0);
});

test('güven: 3/6 = orta, 5/6 = yüksek', () => {
    const six = (msList) => msList.map(m => mkScan(60, m > 0 ? [owner('X', m)] : []));
    // 3/6 eşik üstü, medyan tam 5 → işaretli ama orta güven
    const r1 = summarize(six([8, 9, 10, 0, 0, 5]), SETTINGS); // totals: 8,9,10,0,0,5 → sorted 0,0,5,8,9,10 → medyan 6.5; above(≥5)=4 → 4/6=0.67 orta
    assert.equal(r1.flagged[0].confidence, 'orta');
    const r2 = summarize(six([8, 9, 10, 7, 6, 0]), SETTINGS); // above=5 → 5/6≈0.83 yüksek
    assert.equal(r2.flagged[0].confidence, 'yüksek');
});

test('v2 olmayan (eski) kayıtlar yok sayılır', () => {
    const old = { ts: 999, mode: 'auto', mspt_at: 70, evidence: { ok: true, owners: [{ owner: 'Knozy', ms: 20, pct: 80 }] } };
    const r = summarize([old, old, old], SETTINGS);
    assert.equal(r.lagScanCount, 0);
    assert.equal(r.insufficient, true);
});

test('pencere: yalnızca en yeni N lag-taraması sayılır', () => {
    // 8 lag-taraması; ilk (en eski) 2'sinde devasa yük — pencere (6) dışı kalmalı
    const scans = [
        mkScan(60, [owner('Eski', 40)]), mkScan(60, [owner('Eski', 40)]),
        mkScan(60, []), mkScan(60, []), mkScan(60, []), mkScan(60, []), mkScan(60, []), mkScan(60, []),
    ];
    const r = summarize(scans, SETTINGS);
    assert.equal(r.lagScanCount, 6);
    assert.ok(!r.flagged.some(f => f.owner === 'Eski'));
    assert.ok(!r.watch.some(w => w.owner === 'Eski'), 'pencere dışı sahip hiç görünmemeli');
});

test('wild medyanı ayrı raporlanır', () => {
    const scans = [
        mkScan(60, [], { blockMs: 0, entityMs: 9, totalMs: 9, budgetPct: 18 }),
        mkScan(60, [], { blockMs: 0, entityMs: 11, totalMs: 11, budgetPct: 22 }),
        mkScan(60, [], { blockMs: 0, entityMs: 10, totalMs: 10, budgetPct: 20 }),
    ];
    const r = summarize(scans, SETTINGS);
    assert.equal(r.wild.medianMs, 10);
    assert.equal(r.wild.budgetPct, 20);
    assert.deepEqual(r.flagged, []); // wild asla işaretlenmez
});
