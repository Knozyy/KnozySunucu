const test = require('node:test');
const assert = require('node:assert');
const cf = require('./ftbChunksFile');

// Gerçek ftbchunks-world.snbt yapısı: bazı anahtarlar kökte, bazıları iç içe bloklarda.
const SAMPLE = [
    '{',
    '\tdisable_protection: false',
    '\tno_wilderness: false',
    '\tpvp_mode: "always"',
    '\tclaiming: {',
    '\t\t# Max claimed chunks.',
    '\t\tmax_claimed_chunks: 500',
    '\t\thard_team_claim_limit: 0',
    '\t}',
    '\tforce_loading: {',
    '\t\tmax_force_loaded_chunks: 25',
    '\t}',
    '}',
].join('\n');

test('readSettings: iç içe + kök anahtarları okur', () => {
    const s = cf.readSettings(SAMPLE);
    assert.equal(s.maxClaimedChunks, 500);       // claiming: {} içinde
    assert.equal(s.maxForceLoadedChunks, 25);     // force_loading: {} içinde
    assert.equal(s.disableProtection, false);
    assert.equal(s.noWilderness, false);
    assert.equal(s.pvpMode, 'always');
});

test('readSettings: olmayan anahtar null', () => {
    const s = cf.readSettings('{\n\tdisable_protection: true\n}');
    assert.equal(s.disableProtection, true);
    assert.equal(s.maxClaimedChunks, null);
});

test('writeSettings: iç içe int değeri YERİNDE ve girintisini koruyarak günceller', () => {
    const out = cf.writeSettings(SAMPLE, { maxClaimedChunks: 1500 });
    assert.equal(cf.readSettings(out).maxClaimedChunks, 1500);
    assert.match(out, /\t\tmax_claimed_chunks: 1500/, '2-tab girinti korunmalı');
    // diğer anahtarlar & yorum bozulmamalı
    assert.match(out, /# Max claimed chunks\./);
    assert.equal(cf.readSettings(out).maxForceLoadedChunks, 25);
});

test('writeSettings: bool ve enum günceller', () => {
    const out = cf.writeSettings(SAMPLE, { disableProtection: true, pvpMode: 'per_team' });
    assert.equal(cf.readSettings(out).disableProtection, true);
    assert.equal(cf.readSettings(out).pvpMode, 'per_team');
    assert.match(out, /pvp_mode: "per_team"/);
});

test('writeSettings: geçersiz enum yok sayılır', () => {
    const out = cf.writeSettings(SAMPLE, { pvpMode: 'banana' });
    assert.equal(cf.readSettings(out).pvpMode, 'always', 'geçersiz değer dosyayı değiştirmemeli');
});

test('writeSettings: boş int dosyaya dokunmaz', () => {
    const out = cf.writeSettings(SAMPLE, { maxClaimedChunks: '', maxForceLoadedChunks: null });
    assert.equal(out, SAMPLE);
});

test('writeSettings: dosyada olmayan anahtar eklenmez (atlanır)', () => {
    const raw = '{\n\tdisable_protection: false\n}';
    const out = cf.writeSettings(raw, { maxClaimedChunks: 999 });
    assert.equal(out, raw, 'olmayan anahtar yanlış yere eklenmemeli');
});

test('writeSettings → readSettings round-trip', () => {
    const out = cf.writeSettings(SAMPLE, { maxClaimedChunks: 1234, maxForceLoadedChunks: 99, noWilderness: true });
    const s = cf.readSettings(out);
    assert.equal(s.maxClaimedChunks, 1234);
    assert.equal(s.maxForceLoadedChunks, 99);
    assert.equal(s.noWilderness, true);
});
