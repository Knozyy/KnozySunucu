# Adil Lag Atıfı Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** LagGuard atıf sistemini "savunulabilir kanıt" modeline geçirmek: lag kapısı + mutlak maliyet (ms / 50ms bütçe) + medyan/tekrar-şartlı işaretleme + makine/canlı ayrımı + MSPT dürüstlüğü.

**Architecture:** Ölçüm (Observable + ftbChunks + `lag_attribution`) aynen kalır. `probe.attributeProfile` v2 şekline geçer (blockMs/entityMs/budgetPct, wild ayrı). Yeni saf modül `attribution/evidence.js` son N lag-taramasından medyan tabanlı işaretleme üretir. `metrics.js`'teki sahte "TPS≥20 → MSPT=50" varsayımı kalkar; `getStatus()` seviye hesabına TPS fallback eklenir. Panel "Tekrarlanan Yük" kartı + v2 satır gösterimi alır.

**Tech Stack:** Node.js (CommonJS), `node --test`, Express 5, React + @tanstack/react-query, better-sqlite3.

**Spec:** `.planning/specs/2026-06-09-adil-lag-atifi-tasarim.md`

**Çalışma dizini notu:** Tüm `node --test` komutları `server/` dizininden koşulur. Frontend lint/build `client/` dizininden.

---

### Task 1: `attributeProfile` v2 — mutlak maliyet + makine/canlı/wild ayrımı

**Files:**
- Modify: `server/services/lagGuard/attribution/probe.js` (attributeProfile metodu, ~satır 30-81)
- Test (Create): `server/services/lagGuard/attribution/probe.test.js`

- [x] **Step 1: Failing testi yaz**

`server/services/lagGuard/attribution/probe.test.js` (yeni dosya):

```js
const test = require('node:test');
const assert = require('node:assert');
const probe = require('./probe');

const NS = 1e6; // 1 ms/tick = 1e6 ns/tick

function profileJson() {
    return {
        data: {
            entities: {
                'minecraft:overworld': [
                    { type: 'minecraft:zombie', position: { x: 10, y: 64, z: 10 }, rate: 4 * NS },
                    { type: 'minecraft:cow', position: { x: 500, y: 64, z: 500 }, rate: 2 * NS },
                ],
            },
            blocks: {
                'minecraft:overworld': [
                    { type: 'modid:quarry', position: { x: 12, y: 30, z: 14 }, rate: 10 * NS },
                ],
            },
            ticks: 400,
        },
        diagnostics: { duration: '20s', modLoader: 'forge', minecraftVersion: '1.20.1' },
    };
}

// Sahte sahip çözücü: x<100 → Knozy claim'i; diğerleri wild (null)
const fakeOwnerAt = (dim, x, z) => (x < 100 ? 'Knozy' : null);

test('attributeProfile v2: makine/canlı ayrımı + bütçe yüzdesi', () => {
    const r = probe.attributeProfile(profileJson(), null, fakeOwnerAt);
    assert.equal(r.v, 2);
    assert.equal(r.owners.length, 1);
    const k = r.owners[0];
    assert.equal(k.owner, 'Knozy');
    assert.equal(k.blockMs, 10);   // quarry (blok-entity = güçlü kanıt)
    assert.equal(k.entityMs, 4);   // zombie (canlı = zayıf kanıt)
    assert.equal(k.totalMs, 14);
    assert.equal(k.budgetPct, 28); // 14ms / 50ms bütçe
});

test('attributeProfile v2: wild kimseye yazılmaz, ayrı kovada', () => {
    const r = probe.attributeProfile(profileJson(), null, fakeOwnerAt);
    assert.equal(r.wild.entityMs, 2); // cow → wild
    assert.equal(r.wild.totalMs, 2);
    assert.equal(r.wild.budgetPct, 4);
    assert.ok(!r.owners.some(o => /wild|claimsiz/i.test(o.owner)), 'wild owners listesine girmemeli');
});

test('attributeProfile v2: top/types budgetPct içerir, görece pct YOK', () => {
    const r = probe.attributeProfile(profileJson(), null, fakeOwnerAt);
    assert.equal(r.top[0].ms, 10);
    assert.equal(r.top[0].budgetPct, 20); // 10/50
    assert.equal(r.top[0].owner, 'Knozy');
    assert.ok(r.top.every(h => h.pct === undefined), 'top içinde görece pct kalmamalı');
    assert.ok(r.types.every(t => t.pct === undefined), 'types içinde görece pct kalmamalı');
    assert.equal(r.totalMs, 16); // 10+4+2
});
```

- [x] **Step 2: Testin FAIL ettiğini gör**

Çalıştır (server/ dizininden): `node --test services/lagGuard/attribution/probe.test.js`
Beklenen: 3 test FAIL (`r.v` undefined — eski format; `blockMs` undefined).

- [x] **Step 3: attributeProfile'ı v2'ye geçir**

`server/services/lagGuard/attribution/probe.js` — `const NS_PER_MS = 1e6;` satırının altına ekle:

```js
const TICK_BUDGET_MS = 50; // bir tick bütçesi — budgetPct bunun yüzdesi
```

Mevcut `attributeProfile(json, serverPath) { ... }` metodunu (satır ~30-81) TAMAMEN şununla değiştir:

```js
    /**
     * Observable JSON'unu sahip/hotspot/tür atıfına çevirir (saf fonksiyon) — v2.
     * v2: görece "toplamın %X'i" YOK; mutlak ms + 50ms tick bütçesi yüzdesi var.
     * Makine (blk) ve canlı (ent) maliyeti ayrı; wild (claimsiz) hiçbir sahibe yazılmaz.
     * @param ownerAt — test için enjekte edilebilir sahip çözücü (dim,x,z) → owner|null
     */
    attributeProfile(json, serverPath, ownerAt = null) {
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
            return o && o.owner ? o.owner : null;
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
```

NOT: `runScan` içindeki `attr.owners.slice(0, 10)` ve `suspectCount: attr.owners.length` çağrıları v2 ile uyumlu kalır (owners hâlâ dizi) — dokunma.

- [x] **Step 4: Testlerin PASS ettiğini gör**

Çalıştır: `node --test services/lagGuard/attribution/probe.test.js`
Beklenen: 3 test PASS.

- [x] **Step 5: Commit**

```bash
git add server/services/lagGuard/attribution/probe.js server/services/lagGuard/attribution/probe.test.js
git commit -m "feat(lag-guard/atif): attributeProfile v2 — mutlak maliyet + makine/canli/wild ayrimi

Gorece 'toplamin %X'i' kalkti; ms/tick + 50ms butce yuzdesi geldi.
blockMs (makine=guclu kanit) / entityMs (canli=zayif) ayri; wild kimseye yazilmaz.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `evidence.js` — tekrarlanan kanıt birikimi (saf · TDD)

**Files:**
- Create: `server/services/lagGuard/attribution/evidence.js`
- Test (Create): `server/services/lagGuard/attribution/evidence.test.js`

- [x] **Step 1: Failing testleri yaz**

`server/services/lagGuard/attribution/evidence.test.js` (yeni dosya):

```js
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
```

- [x] **Step 2: Testin FAIL ettiğini gör**

Çalıştır: `node --test services/lagGuard/attribution/evidence.test.js`
Beklenen: `Cannot find module './evidence'` ile FAIL.

- [x] **Step 3: evidence.js'i yaz**

`server/services/lagGuard/attribution/evidence.js` (yeni dosya):

```js
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
    const msptWarn = Number(settings.msptWarn) || 52;
    const flagMs = Number(settings.attribFlagMs) || 5;
    const minScans = Number(settings.attribMinScans) || 3;
    const windowScans = Number(settings.attribWindowScans) || 6;

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
```

- [x] **Step 4: Testlerin PASS ettiğini gör**

Çalıştır: `node --test services/lagGuard/attribution/evidence.test.js`
Beklenen: 9 test PASS.
(Not: "eksik tarama" testinde Ali `watch` içinde `medianMs: 0` ile görünür — `med > 0` şartı YOKTUR; watch tüm işaretlenmemiş sahipleri kapsar, panelde ilk 8'i gösterilir.)

- [x] **Step 5: Commit**

```bash
git add server/services/lagGuard/attribution/evidence.js server/services/lagGuard/attribution/evidence.test.js
git commit -m "feat(lag-guard/atif): kanit birikimi — lag kapisi + medyan + tekrar sarti (saf modul)

Tek tarama asla suclamaz: son N lag-taramasinin medyani + >=K taramada esik ustu
+ guven etiketi. Wild hicbir zaman isaretlenmez. TDD: 9 birim test.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: MSPT dürüstlüğü (`metrics.js`) + seviye TPS fallback (`index.js`)

**Files:**
- Modify: `server/services/lagGuard/metrics.js` (`_onTps`, ~satır 56-64)
- Modify: `server/services/lagGuard/index.js` (`getStatus`, ~satır 82-88)
- Test (Create): `server/services/lagGuard/metrics.test.js`

- [x] **Step 1: Failing testi yaz**

`server/services/lagGuard/metrics.test.js` (yeni dosya):

```js
const test = require('node:test');
const assert = require('node:assert');
const metrics = require('./metrics');

// getLive() sunucu kapalıyken değerleri null'ladığından sahte mc takıyoruz
function asRunning() { metrics._mc = { status: 'running' }; }

test('_onTps: TPS=20 + gerçek MSPT yok → MSPT bilinmiyor (null), 50 VARSAYILMAZ', () => {
    asRunning();
    metrics._onTps({ tps: 20, mspt: null });
    assert.equal(metrics.getLive().tps, 20);
    assert.equal(metrics.getLive().mspt, null);
});

test('_onTps: TPS<20 + MSPT yok → 1000/TPS türetilir (tick-bound, doğru)', () => {
    asRunning();
    metrics._onTps({ tps: 10, mspt: null });
    assert.equal(metrics.getLive().mspt, 100);
});

test('_onTps: gerçek MSPT her zaman öncelikli', () => {
    asRunning();
    metrics._onTps({ tps: 20, mspt: 12.5 });
    assert.equal(metrics.getLive().mspt, 12.5);
});
```

- [x] **Step 2: Testin FAIL ettiğini gör**

Çalıştır: `node --test services/lagGuard/metrics.test.js`
Beklenen: 1. test FAIL (`50 != null` — eski varsayım), 2-3 PASS.

- [x] **Step 3: `_onTps`'i düzelt**

`server/services/lagGuard/metrics.js` — `_onTps` metodunu şununla değiştir:

```js
    _onTps({ tps, mspt }) {
        if (tps == null) return;
        // MSPT yoksa: TPS<20 ise türet (sunucu tick-bound → 1000/TPS matematiksel olarak doğru).
        // TPS≥20 ise BİLİNMİYOR (null) bırak — eski "=50ms" varsayımı sağlıklı sunucuyu
        // "sınırda" gösteriyor ve atıf lag kapısını haksız tetikleyebiliyordu.
        const effMspt = mspt != null ? mspt
            : (tps < 20 ? Math.round((1000 / Math.max(tps, 1)) * 10) / 10 : null);
        this._lastTps = tps;
        this._lastMspt = effMspt;
        this._ring.push({ ts: Date.now(), tps, mspt: effMspt });
        if (this._ring.length > RING_SIZE) this._ring.shift();
    }
```

Etki notları (kod değişikliği GEREKTİRMEZ, bilgi):
- `decision._avgMspt` ring'deki null mspt'leri zaten süzüyor; hepsi null ise karar motoru o tick'i atlar (sağlıklı sunucu = müdahale gerekmez, doğru davranış).
- `_snapshot` `lag_samples.mspt` kolonuna null yazabilir — SQLite kabul eder, panel grafiği boşluk gösterir.

- [x] **Step 4: Testlerin PASS ettiğini gör**

Çalıştır: `node --test services/lagGuard/metrics.test.js`
Beklenen: 3 PASS.

- [x] **Step 5: `getStatus` seviye hesabına TPS fallback ekle**

`server/services/lagGuard/index.js` (~satır 82-88) — mevcut blok:

```js
        let level = 'unknown';
        if (live.mspt != null) {
            if (live.mspt >= s.msptCritical) level = 'critical';
            else if (live.mspt >= s.msptWarn) level = 'warn';
            else if (live.mspt <= s.msptTarget) level = 'stable';
            else level = 'minor';
        }
```

Şununla değiştir:

```js
        let level = 'unknown';
        if (live.mspt != null) {
            if (live.mspt >= s.msptCritical) level = 'critical';
            else if (live.mspt >= s.msptWarn) level = 'warn';
            else if (live.mspt <= s.msptTarget) level = 'stable';
            else level = 'minor';
        } else if (live.tps != null) {
            // MSPT bilinmiyor (örn. TPS=20 ve kaynak MSPT vermiyor) → TPS eşikleriyle değerlendir
            if (live.tps <= s.tpsCritical) level = 'critical';
            else if (live.tps <= s.tpsWarn) level = 'warn';
            else if (live.tps >= s.tpsTarget) level = 'stable';
            else level = 'minor';
        }
```

- [x] **Step 6: Tüm sunucu testleri yeşil mi kontrol et**

Çalıştır: `npm test` (server/ dizininden)
Beklenen: mevcut 33 + yeni 15 (3 probe + 9 evidence + 3 metrics) = 48 test PASS, 0 FAIL.

- [x] **Step 7: Commit**

```bash
git add server/services/lagGuard/metrics.js server/services/lagGuard/metrics.test.js server/services/lagGuard/index.js
git commit -m "fix(lag-guard): MSPT durustlugu — sahte 'TPS>=20 -> 50ms' varsayimi kalkti

Gercek MSPT yoksa null (bilinmiyor); TPS<20'de 1000/TPS turetmesi kalir.
getStatus seviyesi MSPT yokken TPS esikleriyle hesaplanir (fallback yoktu, eklendi).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Ayarlar (DEFAULTS) + `getAttributionEvidence` + API route

**Files:**
- Modify: `server/services/lagGuard/index.js` (DEFAULTS ~satır 23-39; yeni metot `getMetrics`'in yanına)
- Modify: `server/routes/lagGuard.js` (GET /attribution'ın yanına)

- [x] **Step 1: DEFAULTS'a 3 ayar ekle**

`server/services/lagGuard/index.js` — `DEFAULTS` içinde `observableSeconds: 20,` satırının ALTINA ekle:

```js
    // Atıf — adil kanıt (tek tarama asla suçlamaz)
    attribFlagMs: 5,        // sahip işaretleme eşiği (medyan ms/tick)
    attribMinScans: 3,      // en az bu kadar lag-taramasında eşik üstü olmalı
    attribWindowScans: 6,   // kanıt penceresi (son N lag-taraması)
```

(`updateSettings`/`_loadSettings` jeneriktir — `k in this._settings` kontrolüyle yeni anahtarları otomatik kaydeder/yükler; ek değişiklik gerekmez.)

- [x] **Step 2: `getAttributionEvidence` metodu ekle**

`server/services/lagGuard/index.js` — `getMetrics(rangeHours = 6) { ... }` satırının ALTINA ekle:

```js
    /** Tekrarlanan yük özeti — son taramalardan medyan tabanlı adil işaretleme. */
    getAttributionEvidence() {
        const evidence = require('./attribution/evidence');
        return evidence.summarize(attribution.list(100), this._settings);
    }
```

- [x] **Step 3: Route ekle**

`server/routes/lagGuard.js` — `router.get('/attribution', ...)` bloğunun ÜSTÜNE ekle (Express'te `/attribution/evidence` somut path olduğundan sıra kritik değil ama okunabilirlik için birlikte dursun):

```js
router.get('/attribution/evidence', authMiddleware, (req, res) => {
    try { res.json(lagGuard.getAttributionEvidence()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [x] **Step 4: Smoke test — modüller yükleniyor mu**

Çalıştır (server/ dizininden): `node -e "require('./services/lagGuard'); require('./routes/lagGuard'); console.log('OK');"`
Beklenen: `OK`.

- [x] **Step 5: Commit**

```bash
git add server/services/lagGuard/index.js server/routes/lagGuard.js
git commit -m "feat(lag-guard/atif): kanit ozeti API'si — GET /lag-guard/attribution/evidence + 3 ayar

attribFlagMs/attribMinScans/attribWindowScans DEFAULTS'a eklendi (panelden ayarlanabilir).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Panel — "Tekrarlanan Yük" kartı + v2 satırlar + ayar grubu

**Files:**
- Modify: `client/src/pages/LagGuardPage.jsx` (4 nokta: query, Atıf tab, AttributionCard, SETTINGS_GROUPS)

- [x] **Step 1: Kanıt query'si ekle**

`LagGuardPage` bileşeninde, mevcut `lagguard-attribution` query'sinin (satır ~66) ALTINA ekle:

```js
    const { data: attrEvidence } = useQuery({
        queryKey: ['lagguard-attr-evidence'],
        queryFn: () => api.get('/lag-guard/attribution/evidence').then(r => r.data),
        refetchInterval: 30000,
        enabled: tab === 'atif',
    });
```

Ayrıca `runScan` mutation'ının `onSuccess` zincirindeki invalidate dizisine kanıt query'sini de ekle — satır ~159'daki `[8000, 16000, 24000, 30000].forEach(...)` callback'inde `qc.invalidateQueries({ queryKey: ['lagguard-attribution'] })` çağrısının yanına:

```js
qc.invalidateQueries({ queryKey: ['lagguard-attr-evidence'] });
```

- [x] **Step 2: Atıf sekmesine "Tekrarlanan Yük" kartını yerleştir + açıklamayı güncelle**

(a) Atıf tab'ında (satır ~436) ilk `Card`'ın ("Lag Atıf — Shadow Log") HEMEN ÜSTÜNE ekle:

```jsx
                    <EvidenceCard ev={attrEvidence} />
```

(b) Aynı kartın içindeki açıklama paragrafını (satır ~448-452) şununla değiştir:

```jsx
                        <p style={{ fontSize: 11, color: A.faint, margin: 0 }}>
                            <strong style={{ color: A.dim }}>Observable</strong> profili her laggy entity/block'un maliyetini (ms/tick) ölçer;
                            koordinat <strong style={{ color: A.dim }}>FTB Chunks claim sahibine</strong> bağlanır. Maliyet
                            <strong style={{ color: A.dim }}> 50ms tick bütçesine göre mutlaktır</strong> — "toplamın yüzdesi" değildir,
                            sağlıklı sunucuda kimse suçlanmaz. <strong style={{ color: A.warn }}>Ceza uygulanmaz</strong> — yalnızca kayıt.
                            Kritik lag'de 10dk'da bir otomatik.
                        </p>
```

(c) Dosyaya yeni bileşeni ekle — `function Empty(...)` tanımının (satır ~520) ALTINA:

```jsx
function EvidenceCard({ ev }) {
    if (!ev) return null;
    const flagged = ev.flagged || [];
    const watch = ev.watch || [];
    return (
        <Card title="Tekrarlanan Yük" accent={flagged.length ? A.err : A.faint}>
            <p style={{ fontSize: 11, color: A.faint, margin: '0 0 10px' }}>
                Yalnızca <strong style={{ color: A.dim }}>lag sırasında</strong> (MSPT ≥ {ev.msptWarn}) alınan son {ev.windowScans} taramanın
                <strong style={{ color: A.dim }}> medyanı</strong>; bir sahip en az {ev.minScans} taramada eşik üstüyse işaretlenir.
                <strong style={{ color: A.warn }}> Tek tarama asla suçlamaz</strong> · wild kimseye yazılmaz.
            </p>
            {ev.insufficient ? (
                <Empty text={`Yetersiz kanıt — ${ev.lagScanCount} lag-taraması var, en az ${ev.minScans} gerekir. Sağlıklı sunucuda kimse işaretlenmez.`} />
            ) : flagged.length === 0 ? (
                <Empty text="Tekrarlanan yük tespit edilmedi — kimse işaretli değil." />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {flagged.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: A.bg, border: `1px solid ${A.border}`, borderRadius: 4, padding: '8px 12px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{f.owner}</span>
                            <Pill color={f.confidence === 'yüksek' ? A.err : A.warn}>güven: {f.confidence}</Pill>
                            <span style={{ fontSize: 11, color: A.faint, fontFamily: A.mono }}>{f.aboveCount}/{f.scanCount} taramada eşik üstü</span>
                            <span style={{ marginLeft: 'auto', fontFamily: A.mono, fontSize: 12 }}>
                                medyan <strong style={{ color: A.err }}>{f.medianMs}ms</strong> · bütçe %{f.budgetPct}
                                <span style={{ color: A.faint, fontSize: 11 }}> · mak {f.medianBlockMs} / canlı {f.medianEntityMs}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
            {!ev.insufficient && (watch.length > 0 || ev.wild) && (
                <div style={{ marginTop: 10, fontSize: 11, color: A.faint, fontFamily: A.mono }}>
                    {watch.length > 0 && <div>izlemede (işaret yok): {watch.filter(w => w.medianMs > 0).map(w => `${w.owner} ${w.medianMs}ms`).join(' · ') || '—'}</div>}
                    {ev.wild && <div>wild (kimseye yazılmaz): medyan {ev.wild.medianMs}ms · bütçe %{ev.wild.budgetPct}</div>}
                </div>
            )}
        </Card>
    );
}
```

- [x] **Step 3: AttributionCard'ı v2-uyumlu yap**

(a) "Sahip başına TPS payı" bölümünü (satır ~544-560) şununla değiştir:

```jsx
            {/* Sahip başına maliyet (v2: mutlak ms + bütçe payı; eski kayıtlarda görece %) */}
            {(owners.length > 0 || (ev.v === 2 && ev.wild?.totalMs > 0)) && (
                <div style={{ marginTop: 12 }}>
                    <Cap>{ev.v === 2 ? 'Sahip başına maliyet (50ms bütçeye göre)' : 'Sahip başına TPS payı (eski format)'}</Cap>
                    <div style={{ marginTop: 4 }}>
                        {(ev.v === 2
                            ? [...owners, ...(ev.wild && ev.wild.totalMs > 0 ? [{ owner: 'claimsiz (wild) — kimseye yazılmaz', ...ev.wild, _wild: true }] : [])]
                            : owners
                        ).slice(0, 12).map((o, i, arr) => {
                            const pctBar = ev.v === 2 ? o.budgetPct : o.pct;
                            return (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 3fr 1.4fr', gap: 10, alignItems: 'center', padding: '5px 0', borderBottom: i !== arr.length - 1 ? `1px solid ${A.border}` : 'none' }}>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: (o._wild || /claimsiz/.test(o.owner)) ? A.faint : A.text }}>{o.owner}</span>
                                    <div style={{ height: 6, background: A.bg, borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(100, pctBar)}%`, height: '100%', background: pctBar > 25 ? A.err : pctBar > 10 ? A.warn : 'var(--accent)' }} />
                                    </div>
                                    <span style={{ fontFamily: A.mono, fontSize: 11.5, textAlign: 'right', color: pctBar > 25 ? A.err : A.text }}>
                                        {ev.v === 2 ? `${o.totalMs}ms · bütçe %${o.budgetPct}` : `%${o.pct} · ${o.ms}ms`}
                                        {ev.v === 2 && !o._wild && <span style={{ color: A.faint, display: 'block', fontSize: 10 }}>mak {o.blockMs} · canlı {o.entityMs}</span>}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
```

(b) "En pahalı türler" chip'indeki yüzdeyi (satır ~587) v2-uyumlu yap — mevcut:

```jsx
{t.type.replace('minecraft:', '')} <strong style={{ color: t.pct > 15 ? A.err : A.text }}>%{t.pct}</strong>
```

şununla değiştir:

```jsx
{t.type.replace('minecraft:', '')} <strong style={{ color: (t.budgetPct ?? t.pct) > 15 ? A.err : A.text }}>{t.budgetPct != null ? `bütçe %${t.budgetPct}` : `%${t.pct}`}</strong>
```

- [x] **Step 4: SETTINGS_GROUPS'a "Atıf — Adil Kanıt" grubu ekle**

`SETTINGS_GROUPS` sabitinde dizinin SONUNA yeni grup ekle:

```js
    {
        title: 'Atıf — Adil Kanıt',
        hint: 'Sahip işaretleme: yalnızca lag sırasındaki (MSPT ≥ uyarı eşiği) taramalar sayılır; medyan + tekrar şartı. Tek tarama asla suçlamaz.',
        fields: [
            { k: 'attribFlagMs', label: 'İşaretleme eşiği (medyan ms/tick)' },
            { k: 'attribMinScans', label: 'En az lag-taraması (tekrar şartı)' },
            { k: 'attribWindowScans', label: 'Kanıt penceresi (son N tarama)' },
        ],
    },
```

- [x] **Step 5: Lint + build doğrula**

Çalıştır (client/ dizininden): `npx eslint src/pages/LagGuardPage.jsx` → hata yok (exit 0).
Çalıştır: `npx vite build` → `✓ built` (chunk-boyut uyarısı normaldir, önceden var).

- [x] **Step 6: Commit**

```bash
git add client/src/pages/LagGuardPage.jsx
git commit -m "feat(lag-guard/atif): panel — Tekrarlanan Yuk karti + v2 mutlak maliyet gosterimi

Atif sekmesi: medyan/guven/tekrar bilgili kanit karti; sahip satirlari ms+butce%
(gorece % kalkti, eski kayitlar geriye uyumlu); ayarlara Adil Kanit grubu.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Uçtan uca doğrulama

**Files:** (yalnızca doğrulama — değişiklik beklenmez)

- [x] **Step 1: Tüm sunucu testleri**

Çalıştır (server/ dizininden): `npm test`
Beklenen: 48 test PASS, 0 FAIL (33 eski + 3 probe + 9 evidence + 3 metrics).

- [x] **Step 2: Sunucu modül yükleme smoke testi**

Çalıştır: `node -e "require('./services/lagGuard'); require('./services/lagGuard/attribution/probe'); require('./services/lagGuard/attribution/evidence'); require('./routes/lagGuard'); console.log('OK');"`
Beklenen: `OK`.

- [x] **Step 3: Frontend lint + build**

Çalıştır (client/ dizininden): `npx eslint src/pages/LagGuardPage.jsx` → exit 0; `npx vite build` → `✓ built`.

- [x] **Step 4: Manuel doğrulama notu (canlı sunucu gerektirir — kullanıcıya bırakılır)**

Panel → Lag Koruması → Atıf:
1. "Tekrarlanan Yük" kartı görünmeli; veri yokken "Yetersiz kanıt — 0 lag-taraması" demeli.
2. "Tara (Observable)" ile sağlıklı sunucuda tarama → tarama geçmişe düşer ama kart "yetersiz kanıt"ta kalır (sağlıklı tarama suçlamaz). Satırlar `Xms · bütçe %Y` göstermeli.
3. Ayarlar sekmesinde "Atıf — Adil Kanıt" grubunda 3 alan görünmeli ve kaydedilebilmeli.

- [x] **Step 5: Spec'in "Durum" satırını güncelle + commit**

`.planning/specs/2026-06-09-adil-lag-atifi-tasarim.md` içindeki `**Durum:**` satırını şu yap:
`**Durum:** ✅ Uygulandı (bkz. .planning/plans/2026-06-09-adil-lag-atifi.md).`

```bash
git add .planning/specs/2026-06-09-adil-lag-atifi-tasarim.md .planning/plans/2026-06-09-adil-lag-atifi.md
git commit -m "docs(lag-guard): adil lag atifi plan + spec durumu guncellendi

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
