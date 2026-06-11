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
