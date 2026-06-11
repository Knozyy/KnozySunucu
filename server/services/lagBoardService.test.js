const test = require('node:test');
const assert = require('node:assert');
const { buildEmbed } = require('./lagBoardService');

const EV = (over = {}) => ({
    insufficient: false, lagScanCount: 6, windowScans: 6, msptWarn: 52, minScans: 3,
    flagged: [], watch: [], wild: null, ...over,
});

// Stil A: madalya (🥇🥈🥉4️⃣5️⃣) + lidere oranlı 10'luk bar (▰▱) + `X.X ms` kod kutusu
// Her giriş 2 satır: "🥇 **isim**" + "　▰▰… `11.2 ms`"

test('buildEmbed: veri yokken iki bölüm de açıklayıcı + durum bilinmiyor', () => {
    const e = buildEmbed({ evidence: null, lastScan: null });
    assert.equal(e.title, '🛡️ Lag Sıralaması');
    assert.equal(e.fields.length, 2);
    assert.match(e.fields[0].value, /Yeterli veri yok/);
    assert.match(e.fields[1].value, /Henüz tarama yok/);
    assert.match(e.description, /durum/);
    assert.match(e.description, /son güncelleme: <t:\d+:R>/);
    assert.equal(e.color, 0x95a5a6); // tarama yok → gri
});

test('buildEmbed: yetersiz kanıt mesajı minScans içerir', () => {
    const e = buildEmbed({ evidence: EV({ insufficient: true, lagScanCount: 1 }), lastScan: null });
    assert.match(e.fields[0].value, /Yeterli veri yok/);
    assert.match(e.fields[0].value, /3/);
});

test('buildEmbed: Ortalama — madalya+bar, desc, ilk 5, >0 filtreli, 1 ondalık', () => {
    const evidence = EV({
        flagged: [{ owner: 'A', medianMs: 14 }, { owner: 'B', medianMs: 6.5 }],
        watch: [{ owner: 'C', medianMs: 3.2 }, { owner: 'D', medianMs: 20 }, { owner: 'E', medianMs: 1.1 },
                { owner: 'F', medianMs: 0 }, { owner: 'G', medianMs: 0.8 }],
    });
    const e = buildEmbed({ evidence, lastScan: null });
    const lines = e.fields[0].value.split('\n');
    assert.equal(lines.length, 10); // 5 giriş × 2 satır (F=0 elenir, 6 aday → ilk 5)
    assert.match(lines[0], /^🥇 \*\*D\*\*$/);
    assert.match(lines[1], /^　▰{10} `20\.0 ms`$/);          // lider → bar tam dolu
    assert.match(lines[2], /^🥈 \*\*A\*\*$/);
    assert.match(lines[3], /`14\.0 ms`/);
    assert.match(lines[8], /^5️⃣ \*\*E\*\*$/);
    assert.match(lines[9], /^　▰▱{9} `1\.1 ms`$/);           // 1.1/20 → en az 1 dolu blok
    assert.ok(!e.fields[0].value.includes('F'), 'medianMs=0 listeye girmemeli (>0 filtresi)');
    assert.ok(!e.fields[0].value.includes('G'), '6. aday (0.8ms) ilk-5 kesiminde elenmeli');
    assert.match(e.fields[0].name, /Ortalama/);
    assert.match(e.fields[0].name, /son 6/);
});

test('buildEmbed: Son Tarama v2 — lag anında kırmızı + teşhis YOK', () => {
    const lastScan = {
        ts: Date.now(), mspt_at: 58,
        evidence: { v: 2, ok: true, owners: [
            { owner: 'X', totalMs: 3 }, { owner: 'Y', totalMs: 9 }, { owner: 'Z', totalMs: 0 },
        ] },
    };
    const e = buildEmbed({ evidence: EV(), lastScan });
    const lines = e.fields[1].value.split('\n');
    assert.match(lines[0], /^🥇 \*\*Y\*\*$/);
    assert.match(lines[1], /`9\.0 ms`/);
    assert.match(lines[2], /^🥈 \*\*X\*\*$/);
    assert.ok(!e.fields[1].value.includes('Z'));
    assert.match(e.fields[1].name, /MSPT 58/);
    assert.ok(!e.fields[1].name.includes('teşhis'), 'MSPT 58 ≥ 52 → teşhis etiketi olmamalı');
    assert.equal(e.color, 0xe74c3c);           // lag → kırmızı
    assert.match(e.description, /🔴 zorlanıyor/);
});

test('buildEmbed: Son Tarama eski format (ms anahtarı) + sağlıklıysa yeşil + teşhis', () => {
    const lastScan = {
        ts: Date.now(), mspt_at: 30,
        evidence: { ok: true, owners: [{ owner: 'Eski', ms: 7, pct: 80 }] },
    };
    const e = buildEmbed({ evidence: EV(), lastScan });
    assert.match(e.fields[1].value, /^🥇 \*\*Eski\*\*$/m);
    assert.match(e.fields[1].value, /`7\.0 ms`/);
    assert.match(e.fields[1].name, /teşhis/, 'MSPT 30 < 52 → teşhis etiketi');
    assert.equal(e.color, 0x2ecc71);           // sağlıklı → yeşil
    assert.match(e.description, /🟢 sağlıklı/);
});
