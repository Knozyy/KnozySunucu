const { test } = require('node:test');
const assert = require('node:assert');
const { parseLoginIp } = require('./logParse');

test('IPv4 giris satirini ayristirir', () => {
  const line = '[12:00:00] [Server thread/INFO]: Steve[/192.168.1.50:54321] logged in with entity id 123 at (1.0, 2.0, 3.0)';
  assert.deepStrictEqual(parseLoginIp(line), { username: 'Steve', ip: '192.168.1.50' });
});

test('IPv6 giris satirini ayristirir', () => {
  const line = '[12:00:00] [Server thread/INFO]: Alex[/[2a01:4f8:1c::ab]:25565] logged in with entity id 9';
  const r = parseLoginIp(line);
  assert.strictEqual(r.username, 'Alex');
  assert.ok(r.ip.includes('2a01:4f8'));
});

test('alakasiz satirda null doner', () => {
  assert.strictEqual(parseLoginIp('[12:00:00] [Server thread/INFO]: Steve joined the game'), null);
});

test('chat ile taklit edilemez (onek disindan)', () => {
  assert.strictEqual(parseLoginIp(']: <Steve> Fake[/1.2.3.4:1] logged in'), null);
});
