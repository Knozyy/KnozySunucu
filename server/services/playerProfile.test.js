const { test } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { getBanHistory, findAltAccounts, getPlaytimeDaily } = require('./playerProfile');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE player_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, joined_at INTEGER, left_at INTEGER, duration_seconds INTEGER, ip_address TEXT);
    CREATE TABLE ban_log (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, action TEXT, reason TEXT, banned_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);
  return db;
}

test('getBanHistory oyuncunun ban kayitlarini doner', () => {
  const db = makeDb();
  db.prepare('INSERT INTO ban_log (username, action, reason) VALUES (?,?,?)').run('Steve', 'ban', 'kural ihlali');
  db.prepare('INSERT INTO ban_log (username, action, reason) VALUES (?,?,?)').run('Steve', 'unban', '');
  db.prepare('INSERT INTO ban_log (username, action, reason) VALUES (?,?,?)').run('Alex', 'ban', 'x');
  const rows = getBanHistory(db, 'Steve');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].action, 'unban'); // DESC
});

test('findAltAccounts ayni IP ustunden farkli kullanicilari bulur', () => {
  const db = makeDb();
  const ins = db.prepare('INSERT INTO player_sessions (username, joined_at, ip_address) VALUES (?,?,?)');
  ins.run('Steve', 1000, '1.2.3.4');
  ins.run('Steve', 2000, '1.2.3.4');
  ins.run('Notch', 1500, '1.2.3.4');   // aynı IP → alt
  ins.run('Alex',  1600, '9.9.9.9');   // farklı IP → alt değil
  const alts = findAltAccounts(db, 'Steve');
  assert.strictEqual(alts.length, 1);
  assert.strictEqual(alts[0].username, 'Notch');
  assert.strictEqual(alts[0].ip, '1.2.3.4');
});

test('findAltAccounts IP yoksa bos doner', () => {
  const db = makeDb();
  db.prepare('INSERT INTO player_sessions (username, joined_at) VALUES (?,?)').run('Steve', 1000);
  assert.deepStrictEqual(findAltAccounts(db, 'Steve'), []);
});

test('getPlaytimeDaily oturumlari gune gore toplar', () => {
  const db = makeDb();
  const day = 86400000;
  const ins = db.prepare('INSERT INTO player_sessions (username, joined_at, duration_seconds) VALUES (?,?,?)');
  ins.run('Steve', 0,        3600);   // gün 0
  ins.run('Steve', 1000,     1800);   // gün 0
  ins.run('Steve', day,      600);    // gün 1
  const daily = getPlaytimeDaily(db, 'Steve');
  assert.strictEqual(daily.length, 2);
  assert.strictEqual(daily[0].seconds, 5400);
  assert.strictEqual(daily[1].seconds, 600);
});
