const test = require('node:test');
const assert = require('node:assert');
const { buildEmbed } = require('./lagBoardService');

const EV = (over = {}) => ({
    insufficient: false, lagScanCount: 6, windowScans: 6, msptWarn: 52, minScans: 3,
    flagged: [], watch: [], wild: null, ...over,
});

test('buildEmbed: veri yokken iki bölüm de açıklayıcı', () => {
    const e = buildEmbed({ evidence: null, lastScan: null });
    assert.equal(e.title, '🛡️ Lag Sıralaması');
    assert.equal(e.fields.length, 2);
    assert.match(e.fields[0].value, /Yeterli veri yok/);
    assert.match(e.fields[1].value, /Henüz tarama yok/);
});

test('buildEmbed: yetersiz kanıt mesajı minScans içerir', () => {
    const e = buildEmbed({ evidence: EV({ insufficient: true, lagScanCount: 1 }), lastScan: null });
    assert.match(e.fields[0].value, /Yeterli veri yok/);
    assert.match(e.fields[0].value, /3/);
});

test('buildEmbed: Ortalama — flagged+watch birleşik, desc, ilk 5, >0 filtreli', () => {
    const evidence = EV({
        flagged: [{ owner: 'A', medianMs: 14 }, { owner: 'B', medianMs: 6.5 }],
        watch: [{ owner: 'C', medianMs: 3.2 }, { owner: 'D', medianMs: 20 }, { owner: 'E', medianMs: 1.1 },
                { owner: 'F', medianMs: 0 }, { owner: 'G', medianMs: 0.8 }],
    });
    const e = buildEmbed({ evidence, lastScan: null });
    const lines = e.fields[0].value.split('\n');
    assert.equal(lines.length, 5); // 7 satır → F (0) elenir, 6 aday → ilk 5
    assert.match(lines[0], /1\. \*\*D\*\* — 20 ms/);
    assert.match(lines[1], /2\. \*\*A\*\* — 14 ms/);
    assert.match(lines[4], /5\. \*\*E\*\* — 1\.1 ms/);
    assert.ok(!e.fields[0].value.includes('F'), 'medianMs=0 listeye girmemeli (>0 filtresi)');
    assert.ok(!e.fields[0].value.includes('G'), '6. aday (0.8ms) ilk-5 kesiminde elenmeli');
    assert.match(e.fields[0].name, /Ortalama/);
    assert.match(e.fields[0].name, /son 6/);
});

test('buildEmbed: Son Tarama v2 — totalMs desc ilk 5 + lag anında teşhis YOK', () => {
    const lastScan = {
        ts: Date.now(), mspt_at: 58,
        evidence: { v: 2, ok: true, owners: [
            { owner: 'X', totalMs: 3 }, { owner: 'Y', totalMs: 9 }, { owner: 'Z', totalMs: 0 },
        ] },
    };
    const e = buildEmbed({ evidence: EV(), lastScan });
    assert.match(e.fields[1].value, /1\. \*\*Y\*\* — 9 ms/);
    assert.match(e.fields[1].value, /2\. \*\*X\*\* — 3 ms/);
    assert.ok(!e.fields[1].value.includes('Z'));
    assert.match(e.fields[1].name, /MSPT 58/);
    assert.ok(!e.fields[1].name.includes('teşhis'), 'MSPT 58 ≥ 52 → teşhis etiketi olmamalı');
});

test('buildEmbed: Son Tarama eski format (ms anahtarı) + sağlıklıysa teşhis etiketi', () => {
    const lastScan = {
        ts: Date.now(), mspt_at: 30,
        evidence: { ok: true, owners: [{ owner: 'Eski', ms: 7, pct: 80 }] },
    };
    const e = buildEmbed({ evidence: EV(), lastScan });
    assert.match(e.fields[1].value, /1\. \*\*Eski\*\* — 7 ms/);
    assert.match(e.fields[1].name, /teşhis/, 'MSPT 30 < 52 → teşhis etiketi');
});
