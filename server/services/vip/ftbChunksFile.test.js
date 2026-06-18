const test = require('node:test');
const assert = require('node:assert');
const cf = require('./ftbChunksFile');

// Gerçekçi ftbchunks-server.snbt örneği (kök seviye anahtarlar).
const SAMPLE = [
    '{',
    '\tmax_claimed_chunks: 500',
    '\tmax_force_loaded_chunks: 50',
    '\tdisable_protection: false',
    '}',
].join('\n');

test('readSettings: mevcut int anahtarları okur', () => {
    const s = cf.readSettings(SAMPLE);
    assert.equal(s.maxClaimedChunks, 500);
    assert.equal(s.maxForceLoadedChunks, 50);
});

test('readSettings: olmayan anahtar null', () => {
    const s = cf.readSettings('{\n\tmax_claimed_chunks: 500\n}');
    assert.equal(s.maxClaimedChunks, 500);
    assert.equal(s.maxForceLoadedChunks, null);
});

test('writeSettings: mevcut değeri günceller, diğer anahtar korunur', () => {
    const out = cf.writeSettings(SAMPLE, { maxClaimedChunks: 1000 });
    assert.equal(cf.readSettings(out).maxClaimedChunks, 1000);
    assert.equal(cf.readSettings(out).maxForceLoadedChunks, 50);
    assert.match(out, /disable_protection: false/, 'şema dışı anahtar korunmalı');
});

test('writeSettings: olmayan anahtarı ekler', () => {
    const out = cf.writeSettings('{\n\tmax_claimed_chunks: 500\n}', { maxForceLoadedChunks: 80 });
    assert.equal(cf.readSettings(out).maxForceLoadedChunks, 80);
    assert.equal(cf.readSettings(out).maxClaimedChunks, 500);
});

test('writeSettings: boş/null değer dosyaya dokunmaz', () => {
    const out = cf.writeSettings(SAMPLE, { maxClaimedChunks: '', maxForceLoadedChunks: null });
    assert.equal(out, SAMPLE, 'boş değerlerde dosya değişmemeli');
});

test('writeSettings: kök blok yoksa hata', () => {
    assert.throws(() => cf.writeSettings('merhaba', { maxClaimedChunks: 5 }), /Kök/);
});

test('writeSettings → readSettings round-trip', () => {
    const out = cf.writeSettings(SAMPLE, { maxClaimedChunks: 1234, maxForceLoadedChunks: 99 });
    const s = cf.readSettings(out);
    assert.equal(s.maxClaimedChunks, 1234);
    assert.equal(s.maxForceLoadedChunks, 99);
});
