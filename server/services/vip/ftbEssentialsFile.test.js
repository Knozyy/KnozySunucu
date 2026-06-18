const test = require('node:test');
const assert = require('node:assert');
const ef = require('./ftbEssentialsFile');

// Gerçek ftbessentials.snbt yapısının küçültülmüş hâli: çok-satırlı (home/back/rtp) +
// tek-anahtarlı tek-satır (misc.*.enabled) + çok-anahtarlı tek-satır (spawn — yönetilmez).
const SAMPLE = [
    '{',
    '\tmisc: {',
    '\t\tanvil: { enabled: true }',
    '\t\tenderchest: { enabled: true }',
    '\t\that: { enabled: true }',
    '\t\tnear: { enabled: true }',
    '\t}',
    '\tteleportation: {',
    '\t\tback: {',
    '\t\t\t# FTB Ranks override: ftbessentials.back.cooldown',
    '\t\t\tcooldown: 30',
    '\t\t\tenabled: true',
    '\t\t\tmax: 10',
    '\t\t}',
    '\t\thome: {',
    '\t\t\tcooldown: 10',
    '\t\t\tenabled: true',
    '\t\t\thome_min_y: -2147483648',
    '\t\t\tmax: 1',
    '\t\t\twarmup: 0',
    '\t\t}',
    '\t\trtp: {',
    '\t\t\tallow_custom_max_distance: false',
    '\t\t\tcooldown: 600',
    '\t\t\tmax_distance: 25000',
    '\t\t\tmin_distance: 500',
    '\t\t}',
    '\t\tspawn: { cooldown: 10; enabled: true; warmup: 0 }',
    '\t}',
    '}',
].join('\n');

test('readSettings: iç içe sayısal alanları doğru yoldan okur', () => {
    const s = ef.readSettings(SAMPLE);
    assert.equal(s.homeMax, 1);
    assert.equal(s.homeCooldown, 10);
    assert.equal(s.backCooldown, 30);
    assert.equal(s.backMax, 10);
    assert.equal(s.rtpCooldown, 600);
    assert.equal(s.rtpMaxDistance, 25000);   // allow_custom_max_distance ile karışmamalı
    assert.equal(s.rtpMinDistance, 500);
});

test('readSettings: tek-satır blok bool (misc.*.enabled) okur', () => {
    const s = ef.readSettings(SAMPLE);
    assert.equal(s.cmdEnderchest, true);
    assert.equal(s.cmdHat, true);
    assert.equal(s.cmdNear, true);
    assert.equal(s.cmdNick, null); // dosyada yok
});

test('writeSettings: home.max yerinde güncellenir, başka max bozulmaz', () => {
    const out = ef.writeSettings(SAMPLE, { homeMax: 5 });
    assert.equal(ef.readSettings(out).homeMax, 5);
    assert.equal(ef.readSettings(out).backMax, 10, 'back.max etkilenmemeli');
    assert.match(out, /\t\t\tmax: 5/, 'home.max girintisi korunmalı');
});

test('writeSettings: misc tek-satır bool kapatma', () => {
    const out = ef.writeSettings(SAMPLE, { cmdEnderchest: false });
    assert.equal(ef.readSettings(out).cmdEnderchest, false);
    assert.match(out, /enderchest: \{ enabled: false\}/);
    assert.equal(ef.readSettings(out).cmdHat, true, 'hat etkilenmemeli');
});

test('writeSettings: rtp mesafeleri ayrı ayrı güncellenir', () => {
    const out = ef.writeSettings(SAMPLE, { rtpMaxDistance: 30000, rtpMinDistance: 1000 });
    const s = ef.readSettings(out);
    assert.equal(s.rtpMaxDistance, 30000);
    assert.equal(s.rtpMinDistance, 1000);
    assert.match(out, /allow_custom_max_distance: false/, 'komşu anahtar bozulmamalı');
});

test('writeSettings: boş/olmayan değer dokunmaz', () => {
    const out = ef.writeSettings(SAMPLE, { homeMax: '', cmdNick: true /* dosyada yok */ });
    assert.equal(out, SAMPLE);
});
