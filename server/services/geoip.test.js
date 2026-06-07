const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { isPrivateIp, lookup, formatLocation } = require('./geoip');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE ip_geo (ip TEXT PRIMARY KEY, country TEXT, country_code TEXT, city TEXT, region TEXT, isp TEXT, is_proxy INTEGER DEFAULT 0, lookedup_at INTEGER);`);
  return db;
}

test('isPrivateIp yerel/ozel adresleri tanir', () => {
  assert.strictEqual(isPrivateIp('127.0.0.1'), true);
  assert.strictEqual(isPrivateIp('::1'), true);
  assert.strictEqual(isPrivateIp('192.168.1.5'), true);
  assert.strictEqual(isPrivateIp('10.0.0.3'), true);
  assert.strictEqual(isPrivateIp('172.16.4.2'), true);
  assert.strictEqual(isPrivateIp('8.8.8.8'), false);
  assert.strictEqual(isPrivateIp(''), true);
});

test('lookup private IP icin fetch cagirmadan null doner', async () => {
  const db = makeDb();
  let called = false;
  const r = await lookup(db, '192.168.1.1', async () => { called = true; return {}; });
  assert.strictEqual(r, null);
  assert.strictEqual(called, false);
});

test('lookup yeni IP icin saglayiciyi cagirir ve cache e yazar', async () => {
  const db = makeDb();
  const fake = async () => ({ country: 'Turkey', countryCode: 'TR', city: 'Istanbul', region: 'Istanbul', isp: 'Turk Telekom', isProxy: true });
  const r = await lookup(db, '88.1.2.3', fake);
  assert.strictEqual(r.country, 'Turkey');
  assert.strictEqual(r.isProxy, true);
  const row = db.prepare('SELECT * FROM ip_geo WHERE ip = ?').get('88.1.2.3');
  assert.strictEqual(row.country_code, 'TR');
  assert.strictEqual(row.is_proxy, 1);
});

test('lookup cache varsa saglayiciyi tekrar cagirmaz', async () => {
  const db = makeDb();
  db.prepare('INSERT INTO ip_geo (ip, country, country_code, city, region, isp, lookedup_at) VALUES (?,?,?,?,?,?,?)')
    .run('88.1.2.3', 'Germany', 'DE', 'Berlin', 'Berlin', 'ISP', Date.now());
  let called = false;
  const r = await lookup(db, '88.1.2.3', async () => { called = true; return {}; });
  assert.strictEqual(called, false);
  assert.strictEqual(r.country, 'Germany');
});

test('lookup saglayici null donerse null', async () => {
  const db = makeDb();
  const r = await lookup(db, '88.9.9.9', async () => null);
  assert.strictEqual(r, null);
});

test('formatLocation sehir+ulke birlestirir', () => {
  assert.strictEqual(formatLocation({ city: 'Istanbul', country: 'Turkey' }), 'Istanbul, Turkey');
  assert.strictEqual(formatLocation({ city: null, country: 'Turkey' }), 'Turkey');
  assert.strictEqual(formatLocation(null), null);
});
