const test = require('node:test');
const assert = require('node:assert');
const tf = require('./ftbTeamsFile');

const SAMPLE = [
    '{',
    '\t# If >0, party teams have this many limited lives. Default: 0',
    '\tlimited_lives: 0',
    '}',
].join('\n');

test('readSettings: limited_lives okur', () => {
    assert.equal(tf.readSettings(SAMPLE).limitedLives, 0);
});

test('writeSettings: yerinde günceller, yorum korunur', () => {
    const out = tf.writeSettings(SAMPLE, { limitedLives: 3 });
    assert.equal(tf.readSettings(out).limitedLives, 3);
    assert.match(out, /# If >0/, 'yorum korunmalı');
    assert.match(out, /\tlimited_lives: 3/, 'girinti korunmalı');
});

test('writeSettings: boş değer dokunmaz', () => {
    assert.equal(tf.writeSettings(SAMPLE, { limitedLives: '' }), SAMPLE);
});

test('writeSettings: olmayan anahtar eklenmez', () => {
    const raw = '{\n}';
    assert.equal(tf.writeSettings(raw, { limitedLives: 5 }), raw);
});
