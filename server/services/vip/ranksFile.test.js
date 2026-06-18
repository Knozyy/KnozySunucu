const test = require('node:test');
const assert = require('node:assert');
const rf = require('./ranksFile');

// Gerçekçi ranks.snbt örneği (tab girintili, tırnaklı/tırnaksız anahtar karışık).
const L = [
    '{',
    '\tranks: {',
    '\t\t"player": {',
    '\t\t\tname: "Player"',
    '\t\t\tpower: 0',
    '\t\t\tcondition: "true"',
    '\t\t}',
    '\t\tvip: {',
    '\t\t\tname: "VIP"',
    '\t\t\tpower: 50',
    '\t\t\t"ftbranks.name_format": "&b[VIP] {name}&r"',
    '\t\t\t"ftbessentials.home.max": 10',
    '\t\t\t"command.back": true',
    '\t\t\t"ftbchunks.max_claimed": 750',
    '\t\t}',
    '\t\tvip_plus: {',
    '\t\t\tname: "VIP+"',
    '\t\t\tpower: 60',
    '\t\t\t"ftbessentials.home.max": 20',
    '\t\t\t"command.rtp": true',
    '\t\t}',
    '\t}',
    '}',
];
const SAMPLE = L.join('\n');

const META = { vip: { name: 'VIP', power: 50 }, vip_plus: { name: 'VIP+', power: 60 }, mvp: { name: 'MVP', power: 70 } };

// ── findBlock ───────────────────────────────────────────────────────────────
test('findBlock: mevcut bloğu bulur', () => {
    const b = rf.findBlock(SAMPLE, 'vip');
    assert.ok(b, 'blok bulunmalı');
    const text = SAMPLE.slice(b.start, b.end);
    assert.ok(text.startsWith('vip:'), `başlangıç vip: olmalı, oldu: ${text.slice(0, 12)}`);
    assert.ok(text.trimEnd().endsWith('}'), 'kapanış } olmalı');
    assert.match(text, /home\.max/);
});

test('findBlock: vip ≠ vip_plus (tam eşleşme)', () => {
    const b = rf.findBlock(SAMPLE, 'vip');
    const text = SAMPLE.slice(b.start, b.end);
    assert.ok(!text.includes('vip_plus'), 'vip bloğu vip_plus içine taşmamalı');
    assert.ok(!text.includes('VIP+'), 'vip_plus içeriği sızmamalı');

    const b2 = rf.findBlock(SAMPLE, 'vip_plus');
    assert.ok(b2);
    assert.match(SAMPLE.slice(b2.start, b2.end), /VIP\+/);
});

test('findBlock: olmayan kademe için null', () => {
    assert.equal(rf.findBlock(SAMPLE, 'mvp'), null);
});

test('findBlock: string içindeki } parantez sayımını bozmaz', () => {
    const raw = [
        '{', '\tranks: {',
        '\tweird: {',
        '\t\tname: "a } brace in string {"',
        '\t\t"ftbessentials.home.max": 5',
        '\t}',
        '\t}', '}',
    ].join('\n');
    const b = rf.findBlock(raw, 'weird');
    assert.ok(b);
    const text = raw.slice(b.start, b.end);
    assert.match(text, /home\.max/, 'blok erken kapanmamalı');
});

// ── readPerks ─────────────────────────────────────────────────────────────
test('readPerks: tırnaklı anahtar + bool/sayı okur', () => {
    const r = rf.readPerks(SAMPLE, 'vip');
    assert.equal(r.exists, true);
    assert.equal(r.name, 'VIP');
    assert.equal(r.power, 50);
    assert.equal(r.perks.nameFormat, '&b[VIP] {name}&r');
    assert.equal(r.perks.homeMax, 10);
    assert.equal(r.perks.back, true);
    assert.equal(r.perks.maxClaimed, 750);
});

test('readPerks: olmayan anahtarlar null/false', () => {
    const r = rf.readPerks(SAMPLE, 'vip');
    assert.equal(r.perks.homeCooldown, null);
    assert.equal(r.perks.rtp, false);
    assert.equal(r.perks.enderchest, false);
    assert.equal(r.perks.maxForceLoaded, null);
});

test('readPerks: olmayan blok exists:false', () => {
    const r = rf.readPerks(SAMPLE, 'mvp');
    assert.equal(r.exists, false);
});

// ── writePerks ─────────────────────────────────────────────────────────────
test('writePerks: mevcut sayı değerini günceller', () => {
    const out = rf.writePerks(SAMPLE, 'vip', { homeMax: 20 }, META.vip);
    assert.equal(rf.readPerks(out, 'vip').perks.homeMax, 20);
    // diğer perkler bozulmamalı
    assert.equal(rf.readPerks(out, 'vip').perks.maxClaimed, 750);
});

test('writePerks: toggle kapatınca satır silinir', () => {
    const out = rf.writePerks(SAMPLE, 'vip', { back: false }, META.vip);
    assert.equal(rf.readPerks(out, 'vip').perks.back, false);
    assert.ok(!out.includes('"command.back"'), 'command.back satırı kalmamalı');
});

test('writePerks: toggle açınca satır eklenir', () => {
    const out = rf.writePerks(SAMPLE, 'vip', { rtp: true }, META.vip);
    assert.equal(rf.readPerks(out, 'vip').perks.rtp, true);
});

test('writePerks: şema dışı elle eklenmiş anahtar korunur', () => {
    const withFly = SAMPLE.replace('"command.back": true', '"command.back": true\n\t\t\t"command.fly": true');
    const out = rf.writePerks(withFly, 'vip', { homeMax: 15 }, META.vip);
    assert.ok(out.includes('"command.fly": true'), 'command.fly korunmalı');
    assert.equal(rf.readPerks(out, 'vip').perks.homeMax, 15);
});

test('writePerks: olmayan bloğu oluşturur', () => {
    const out = rf.writePerks(SAMPLE, 'mvp', { homeMax: 35, back: true, enderchest: true }, META.mvp);
    const r = rf.readPerks(out, 'mvp');
    assert.equal(r.exists, true);
    assert.equal(r.name, 'MVP');
    assert.equal(r.power, 70);
    assert.equal(r.perks.homeMax, 35);
    assert.equal(r.perks.back, true);
    assert.equal(r.perks.enderchest, true);
    // mevcut bloklar bozulmamalı
    assert.equal(rf.readPerks(out, 'vip').perks.homeMax, 10);
    assert.equal(rf.readPerks(out, 'vip_plus').perks.homeMax, 20);
});

test('writePerks → readPerks round-trip', () => {
    const perks = {
        nameFormat: '&6[MVP] {name}&r', homeMax: 35, homeCooldown: 0,
        back: true, rtp: true, tpr: true, enderchest: true,
        spawn: true, hat: false, nickname: true,
        craftingTable: true, anvil: false, smithing: true, stonecutter: false, trashcan: true,
        maxClaimed: 2000, maxForceLoaded: 200,
    };
    const out = rf.writePerks(SAMPLE, 'mvp', perks, META.mvp);
    const r = rf.readPerks(out, 'mvp').perks;
    assert.deepEqual(r, perks);
});

test('writePerks: yeni tek-node perkler doğru anahtarı yazar', () => {
    const out = rf.writePerks(SAMPLE, 'vip', { tpr: true, craftingTable: true, hat: true }, META.vip);
    assert.match(out, /"command\.moonlight\.tpr": true/);
    assert.match(out, /"command\.open\.crafting": true/);
    assert.match(out, /"command\.hat": true/);
    const p = rf.readPerks(out, 'vip').perks;
    assert.equal(p.tpr, true);
    assert.equal(p.craftingTable, true);
    assert.equal(p.hat, true);
});

test('writePerks: nameFormat özel karakterleri korur', () => {
    const out = rf.writePerks(SAMPLE, 'vip', { nameFormat: '&a[VIP] {name}&r' }, META.vip);
    assert.equal(rf.readPerks(out, 'vip').perks.nameFormat, '&a[VIP] {name}&r');
});
