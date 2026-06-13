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

test('nearestOnlinePlayers: lag noktasına fiziksel en yakın oyuncuyu verir', () => {
    const pos = {
        kivilipvp_real: { x: 100, z: 100, dim: 'minecraft:overworld' },
        XClarius: { x: 5000, z: 5000, dim: 'minecraft:overworld' },
    };
    // (110,110) kivilipvp_real'e ≈14 blok, XClarius çok uzak
    assert.equal(probe.nearestOnlinePlayers(pos, 'minecraft:overworld', 110, 110), 'kivilipvp_real');
    // Kimse eşik (64) içinde değil → null (takım fallback'i devreye girer)
    assert.equal(probe.nearestOnlinePlayers(pos, 'minecraft:overworld', 3000, 3000), null);
    // Farklı boyut → eşleşmez
    assert.equal(probe.nearestOnlinePlayers(pos, 'minecraft:the_nether', 110, 110), null);
});

test('nearestOnlinePlayers: aynı bölgedeki birden çok oyuncu yakınlık sırasıyla birleşir', () => {
    const pos = {
        Ahmet: { x: 100, z: 100, dim: 'minecraft:overworld' },
        Mehmet: { x: 120, z: 100, dim: 'minecraft:overworld' },
    };
    // (105,100): Ahmet (5 blok) < Mehmet (15 blok) → "Ahmet-Mehmet"
    assert.equal(probe.nearestOnlinePlayers(pos, 'minecraft:overworld', 105, 100), 'Ahmet-Mehmet');
    // Konum verisi yoksa null
    assert.equal(probe.nearestOnlinePlayers({}, 'minecraft:overworld', 105, 100), null);
});

test('_joinNames: benzersizleştirir ve uzun listeyi kısaltır', () => {
    assert.equal(probe._joinNames(Array(50).fill('kivilipvp_real')), 'kivilipvp_real');
    assert.equal(probe._joinNames(['A', 'B', 'C', 'D', 'E']), 'A-B-C +2');
    assert.equal(probe._joinNames([]), null);
});

test('ownerLabel: durumsal atıf (takım online → fiziksel → takım adı)', () => {
    const team = { team: 'uuid', owner: 'KiviTakım', owners: ['kivilipvp_real', 'vantedevs'] };

    // 1) Takım üyesi (kivilipvp_real) online iken ZİYARETÇİ base'de olsa bile suçlu takım üyesi
    const posWithVisitor = {
        kivilipvp_real: { x: 100, z: 100, dim: 'minecraft:overworld' },
        ziyaretci:      { x: 100, z: 100, dim: 'minecraft:overworld' },
    };
    assert.equal(probe.ownerLabel(team, posWithVisitor, 'minecraft:overworld', 100, 100), 'kivilipvp_real');

    // 2) Takımda kimse online değil, ama ziyaretçi base'de → ziyaretçi (o chunk'taki kişi)
    const posOnlyVisitor = { ziyaretci: { x: 100, z: 100, dim: 'minecraft:overworld' } };
    assert.equal(probe.ownerLabel(team, posOnlyVisitor, 'minecraft:overworld', 100, 100), 'ziyaretci');

    // 3) Takım offline + kimse yakında yok → takım adı (offline base)
    const posFar = { biri: { x: 9000, z: 9000, dim: 'minecraft:overworld' } };
    assert.equal(probe.ownerLabel(team, posFar, 'minecraft:overworld', 100, 100), 'KiviTakım');

    // 4) Claimsiz (wild) koordinat + yakın oyuncu → o oyuncu
    assert.equal(probe.ownerLabel(null, posOnlyVisitor, 'minecraft:overworld', 100, 100), 'ziyaretci');
    // 5) Claimsiz + kimse yok → null (wild, kimseye yazılmaz)
    assert.equal(probe.ownerLabel(null, posFar, 'minecraft:overworld', 100, 100), null);
});

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
