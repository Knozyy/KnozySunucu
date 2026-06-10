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
