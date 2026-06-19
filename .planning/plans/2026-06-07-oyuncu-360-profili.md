# Oyuncu 360 Profili — Uygulama Planı

> **Agentik çalışanlar için:** GEREKLİ ALT-SKILL: superpowers:subagent-driven-development (önerilen) veya superpowers:executing-plans ile bu planı görev-görev uygula. Adımlar checkbox (`- [ ]`) ile takip edilir.

**Hedef:** Mevcut `PlayerProfileModal`'ı tam "360 profil"e genişletmek — oynama grafiği, ban/not geçmişi, envanter+ender chest görüntüleyici (modlu dahil gerçek dokular), alt-hesap (aynı IP) tespiti.

**Mimari:** Backend pure-logic modülleri (`node:test` ile TDD) + ince IO sarmalayıcıları (smoke). Doku pipeline lazy (talep-anında). Frontend mevcut Knozy modalına yeni sekmeler. 2 faz: Faz 1 = dokusuz 360 çekirdek (tek başına deploy edilebilir), Faz 2 = gerçek doku ikonları.

**Tech Stack:** Node 25 (yerleşik `fetch`/`zlib`/`node:test`), Express 5, better-sqlite3, React 18 + Vite, TanStack Query, `prismarine-nbt`, `adm-zip`. Görsel kütüphane yok (düz-yüz → PNG doğrudan servis).

**Spec:** `.planning/specs/2026-06-07-oyuncu-360-profili-tasarim.md`

**Kurallar:** Tüm commit/yorum **Türkçe**. Commit footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Her görevden sonra main'e push. `.claude/settings.local.json` ve `.claude/worktrees/` **commit'lenmez**.

---

## Dosya Yapısı

**Faz 1:**
- Create: `server/services/playerData.js` — NBT oyuncu okuyucu (`normalizePlayerNbt` pure + `readPlayerData` IO)
- Create: `server/services/playerData.test.js` — normalize birim testi
- Create: `server/services/playerProfile.js` — `getBanHistory`/`findAltAccounts`/`getPlaytimeDaily` (db alır)
- Create: `server/services/playerProfile.test.js` — in-memory sqlite ile test
- Create: `server/util/logParse.js` — `parseLoginIp(line)` pure
- Create: `server/util/logParse.test.js`
- Modify: `server/db/database.js` — `player_sessions.ip_address` migration
- Modify: `server/services/minecraftService.js` — login IP yakalama + session INSERT'e ip
- Modify: `server/routes/players.js` — `/profile/:u` genişlet + `/profile/:u/inventory`
- Modify: `server/package.json` — `prismarine-nbt` dep + `"test"` script
- Modify: `client/src/pages/PlayersPage.jsx` — Overview grafiği, Yönetim sekmesi, Envanter sekmesi (isim fallback)

**Faz 2:**
- Create: `server/services/itemTextures/modelResolver.js` — model→doku ref çözümü (pure çekirdek)
- Create: `server/services/itemTextures/modelResolver.test.js`
- Create: `server/services/itemTextures/assetIndex.js` — modid→jar tarama
- Create: `server/services/itemTextures/assetIndex.test.js`
- Create: `server/services/itemTextures/vanillaAssets.js` — MC sürüm tespiti + Mojang indirme
- Create: `server/services/itemTextures/index.js` — orkestrasyon + cache
- Modify: `server/routes/players.js` — `/item-texture/:id`
- Modify: `server/package.json` — `adm-zip` dep
- Modify: `client/src/pages/PlayersPage.jsx` — envanter ızgarasında isim → `<img>` ikon
- Modify: `.gitignore` — `server/cache/`

---

# FAZ 1 — Dokusuz 360 Çekirdek

## Task 1: Bağımlılık + test script

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: prismarine-nbt yükle + test script ekle**

Run:
```bash
cd server && npm install prismarine-nbt@^2.5.0
```

`server/package.json` `scripts` bloğuna ekle:
```json
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Çalıştığını doğrula**

Run: `cd server && node -e "require('prismarine-nbt'); console.log('nbt ok')"`
Beklenen: `nbt ok`

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore(360): prismarine-nbt bagimliligi + node --test script

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 2: NBT oyuncu okuyucu (`playerData.js`)

**Files:**
- Create: `server/services/playerData.js`
- Test: `server/services/playerData.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`server/services/playerData.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizePlayerNbt } = require('./playerData');

// 1.20.5+ data-component formatını taklit eden sadeleştirilmiş NBT
const sample = {
  Inventory: [
    { Slot: 0, id: 'minecraft:diamond_sword', count: 1,
      components: { 'minecraft:enchantments': { levels: { 'minecraft:sharpness': 5 } }, 'minecraft:damage': 120, 'minecraft:max_damage': 1561 } },
    { Slot: 8, id: 'minecraft:cooked_beef', count: 32 },
    { Slot: 103, id: 'minecraft:diamond_helmet', count: 1 },   // head
    { Slot: 100, id: 'minecraft:diamond_boots', count: 1 },    // feet
    { Slot: -106, id: 'minecraft:shield', count: 1 },          // offhand
  ],
  EnderItems: [ { Slot: 0, id: 'minecraft:dirt', count: 64 } ],
  Health: 18.5, foodLevel: 17, XpLevel: 30, XpTotal: 1395,
  Pos: [123.5, 64.0, -88.2], Dimension: 'minecraft:overworld', playerGameType: 0,
};

test('normalizePlayerNbt envanteri ve hotbar slotlarini ayristirir', () => {
  const r = normalizePlayerNbt(sample);
  const sword = r.inventory.find(i => i.slot === 0);
  assert.strictEqual(sword.id, 'minecraft:diamond_sword');
  assert.strictEqual(sword.count, 1);
  assert.deepStrictEqual(sword.enchants, [{ id: 'minecraft:sharpness', lvl: 5 }]);
  assert.strictEqual(sword.damage, 120);
  assert.strictEqual(sword.maxDamage, 1561);
  // 100-103 ve -106 envanterde DEĞİL, zırh/offhand'da
  assert.ok(!r.inventory.some(i => i.slot === 100 || i.slot === 103 || i.slot === -106));
});

test('normalizePlayerNbt zirh ve offhand slotlarini ayirir', () => {
  const r = normalizePlayerNbt(sample);
  assert.strictEqual(r.armor.head.id, 'minecraft:diamond_helmet');
  assert.strictEqual(r.armor.feet.id, 'minecraft:diamond_boots');
  assert.strictEqual(r.armor.chest, null);
  assert.strictEqual(r.offhand.id, 'minecraft:shield');
});

test('normalizePlayerNbt ender chest ve durum verisini cikarir', () => {
  const r = normalizePlayerNbt(sample);
  assert.strictEqual(r.enderItems[0].id, 'minecraft:dirt');
  assert.strictEqual(r.enderItems[0].count, 64);
  assert.strictEqual(r.health, 18.5);
  assert.strictEqual(r.foodLevel, 17);
  assert.strictEqual(r.xpLevel, 30);
  assert.deepStrictEqual(r.pos, { x: 123.5, y: 64.0, z: -88.2 });
  assert.strictEqual(r.dimension, 'minecraft:overworld');
});

test('normalizePlayerNbt bos/eksik veride cokmemeli', () => {
  const r = normalizePlayerNbt({});
  assert.deepStrictEqual(r.inventory, []);
  assert.deepStrictEqual(r.enderItems, []);
  assert.strictEqual(r.offhand, null);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `cd server && node --test services/playerData.test.js`
Beklenen: FAIL — `Cannot find module './playerData'`

- [ ] **Step 3: Minimal implementasyon**

`server/services/playerData.js`:
```js
const fs = require('fs');
const path = require('path');

const ARMOR_SLOTS = { 103: 'head', 102: 'chest', 101: 'legs', 100: 'feet' };
const OFFHAND_SLOT = -106;

function _enchants(components) {
  const e = components?.['minecraft:enchantments'];
  const levels = e?.levels || (e && typeof e === 'object' && !e.levels ? e : null);
  if (!levels || typeof levels !== 'object') return [];
  return Object.entries(levels).map(([id, lvl]) => ({ id, lvl: Number(lvl) }));
}

function _normalizeItem(entry) {
  const c = entry.components || {};
  return {
    slot: entry.Slot,
    id: entry.id || 'minecraft:air',
    count: entry.count ?? entry.Count ?? 1,
    enchants: _enchants(c),
    damage: c['minecraft:damage'] ?? null,
    maxDamage: c['minecraft:max_damage'] ?? null,
    customName: c['minecraft:custom_name'] ?? null,
    lore: c['minecraft:lore'] ?? null,
  };
}

/** Sadeleştirilmiş NBT (nbt.simplify çıktısı) → normalize profil objesi. Saf fonksiyon. */
function normalizePlayerNbt(s) {
  s = s || {};
  const inv = Array.isArray(s.Inventory) ? s.Inventory : [];
  const armor = { head: null, chest: null, legs: null, feet: null };
  let offhand = null;
  const inventory = [];

  for (const raw of inv) {
    const item = _normalizeItem(raw);
    if (ARMOR_SLOTS[raw.Slot]) armor[ARMOR_SLOTS[raw.Slot]] = item;
    else if (raw.Slot === OFFHAND_SLOT) offhand = item;
    else inventory.push(item);
  }

  const ender = (Array.isArray(s.EnderItems) ? s.EnderItems : []).map(_normalizeItem);
  const pos = Array.isArray(s.Pos) && s.Pos.length === 3
    ? { x: s.Pos[0], y: s.Pos[1], z: s.Pos[2] } : null;

  return {
    inventory, enderItems: ender, armor, offhand,
    health: s.Health ?? null,
    foodLevel: s.foodLevel ?? null,
    xpLevel: s.XpLevel ?? null,
    xpTotal: s.XpTotal ?? null,
    pos,
    dimension: s.Dimension ?? null,
    gameType: s.playerGameType ?? null,
  };
}

/** world/playerdata/<uuid>.dat oku → gunzip+parse → normalize. */
async function readPlayerData(serverPath, uuid) {
  const nbt = require('prismarine-nbt');
  const file = path.join(serverPath, 'world', 'playerdata', `${uuid}.dat`);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const { parsed } = await nbt.parse(buf);
  return normalizePlayerNbt(nbt.simplify(parsed));
}

module.exports = { normalizePlayerNbt, readPlayerData };
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `cd server && node --test services/playerData.test.js`
Beklenen: PASS — 4 test

- [ ] **Step 5: Commit**

```bash
git add server/services/playerData.js server/services/playerData.test.js
git commit -m "feat(360): NBT oyuncu okuyucu — envanter/zirh/ender/durum normalize

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 3: IP yakalama — log parse + DB kolonu + minecraftService

**Files:**
- Create: `server/util/logParse.js`
- Test: `server/util/logParse.test.js`
- Modify: `server/db/database.js` (~satır 299, mevcut migration bloğundan sonra)
- Modify: `server/services/minecraftService.js` (~satır 260-268)

- [ ] **Step 1: Başarısız testi yaz**

`server/util/logParse.test.js`:
```js
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
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `cd server && node --test util/logParse.test.js`
Beklenen: FAIL — `Cannot find module './logParse'`

- [ ] **Step 3: Minimal implementasyon**

`server/util/logParse.js`:
```js
// "Nick[/IP:port] logged in" — IPv4 ve IPv6 (köşeli parantezli) destekli.
// Önek "]: " ile sabit; chat satırları "<Nick>" içerdiği için eşleşmez.
const LOGIN_RE = /\]:\s+(\w{1,16})\[\/(?:\[([0-9a-fA-F:]+)\]|([0-9.]+)):\d+\] logged in/;

function parseLoginIp(line) {
  const m = line.match(LOGIN_RE);
  if (!m) return null;
  return { username: m[1], ip: m[2] || m[3] };
}

module.exports = { parseLoginIp };
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `cd server && node --test util/logParse.test.js`
Beklenen: PASS — 4 test

- [ ] **Step 5: DB migration ekle**

`server/db/database.js` — satır ~299'daki `} catch (e) { /* tablo henüz yoksa sorun değil */ }`'dan **sonra**, `installed_modpacks` migration'ından **önce** ekle:
```js
  // Migration: player_sessions.ip_address (Oyuncu 360 — alt-hesap tespiti, ileriye dönük)
  try {
    const psc = database.prepare("PRAGMA table_info(player_sessions)").all().map(c => c.name);
    if (!psc.includes('ip_address')) {
      database.exec('ALTER TABLE player_sessions ADD COLUMN ip_address TEXT');
    }
  } catch (e) { /* tablo henüz yoksa sorun değil */ }
```

- [ ] **Step 6: minecraftService'e IP yakalama bağla**

`server/services/minecraftService.js` — dosyanın üst kısmındaki require'lara ekle (zaten `getDb` import ediliyor):
```js
const { parseLoginIp } = require('../util/logParse');
```

`_handleLog`/log işleyici metodunda, "joined the game" bloğundan (satır ~260) **önce** ekle:
```js
        // Giriş IP'sini yakala (joined satırından önce gelir) — bellekte stash'le
        const login = parseLoginIp(line);
        if (login) {
            if (!this._pendingIp) this._pendingIp = {};
            this._pendingIp[login.username] = login.ip;
        }
```

Mevcut join INSERT'ini (satır ~266) IP yazacak şekilde değiştir:
```js
            try {
                const db = getDb();
                const ip = this._pendingIp?.[joinMatch[1]] || null;
                db.prepare('INSERT INTO player_sessions (username, joined_at, ip_address) VALUES (?, ?, ?)')
                    .run(joinMatch[1], Date.now(), ip);
                if (this._pendingIp) delete this._pendingIp[joinMatch[1]];
            } catch { /* ignore */ }
```

- [ ] **Step 7: Smoke — sunucu boot + şema doğrula**

Run:
```bash
cd server && node -e "const {initDb,getDb}=require('./db/database'); initDb(); const c=getDb().prepare(\"PRAGMA table_info(player_sessions)\").all().map(x=>x.name); console.log(c.includes('ip_address')?'ip_address OK':'EKSIK', c.join(','))"
```
Beklenen: `ip_address OK ...`
(Not: `initDb` fonksiyon adı farklıysa `database.js`'in dışa aktardığı init çağrısını kullan.)

- [ ] **Step 8: Commit**

```bash
git add server/util/logParse.js server/util/logParse.test.js server/db/database.js server/services/minecraftService.js
git commit -m "feat(360): giris IP yakalama + player_sessions.ip_address (ileriye donuk)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 4: Profil yardımcıları (`playerProfile.js`) — ban/alt/grafik

**Files:**
- Create: `server/services/playerProfile.js`
- Test: `server/services/playerProfile.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`server/services/playerProfile.test.js`:
```js
const { test, beforeEach } = require('node:test');
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
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `cd server && node --test services/playerProfile.test.js`
Beklenen: FAIL — `Cannot find module './playerProfile'`

- [ ] **Step 3: Minimal implementasyon**

`server/services/playerProfile.js`:
```js
/** ban_log'dan oyuncunun ban/unban geçmişi (yeni→eski). */
function getBanHistory(db, username) {
  return db.prepare('SELECT * FROM ban_log WHERE username = ? ORDER BY id DESC').all(username);
}

/** Oyuncunun bilinen IP'lerini paylaşan FARKLI kullanıcılar. */
function findAltAccounts(db, username) {
  const ips = db.prepare(
    'SELECT DISTINCT ip_address FROM player_sessions WHERE username = ? AND ip_address IS NOT NULL'
  ).all(username).map(r => r.ip_address);
  if (!ips.length) return [];
  const placeholders = ips.map(() => '?').join(',');
  return db.prepare(`
    SELECT username, ip_address AS ip, MAX(joined_at) AS lastSeen
    FROM player_sessions
    WHERE ip_address IN (${placeholders}) AND username != ?
    GROUP BY username, ip_address
    ORDER BY lastSeen DESC
  `).all(...ips, username);
}

/** Oturumları güne göre toplayıp grafik serisi döner (eski→yeni). */
function getPlaytimeDaily(db, username) {
  const rows = db.prepare(`
    SELECT CAST(joined_at / 86400000 AS INTEGER) AS day,
           SUM(COALESCE(duration_seconds,0)) AS seconds
    FROM player_sessions
    WHERE username = ?
    GROUP BY day ORDER BY day ASC
  `).all(username);
  return rows.map(r => ({ day: r.day, date: new Date(r.day * 86400000).toISOString().slice(0, 10), seconds: r.seconds }));
}

module.exports = { getBanHistory, findAltAccounts, getPlaytimeDaily };
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `cd server && node --test services/playerProfile.test.js`
Beklenen: PASS — 4 test

- [ ] **Step 5: Commit**

```bash
git add server/services/playerProfile.js server/services/playerProfile.test.js
git commit -m "feat(360): profil yardimcilari — ban gecmisi, alt-hesap, gunluk oynama

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 5: Route — profil genişlet + envanter endpoint'i

**Files:**
- Modify: `server/routes/players.js` (`/profile/:username` ~satır 311-376; import bloğu ~satır 1-9)

- [ ] **Step 1: Import'ları ekle**

`server/routes/players.js` üst importlara ekle:
```js
const playerProfile = require('../services/playerProfile');
const { readPlayerData } = require('../services/playerData');
```

- [ ] **Step 2: `/profile/:username` yanıtını genişlet**

`res.json({...})` bloğunu (satır ~365) şu hale getir — UUID çözümünü de tekrar kullanmak için `entry?.uuid`'yi yukarıda bir `resolvedUuid` değişkenine al (mevcut try içindeki `entry` kapsamı dışına çıkar):

Mevcut `let mcStats = {};` satırından sonra `let resolvedUuid = null;` ekle ve UUID bulunduğunda `resolvedUuid = entry.uuid;` ata. Sonra yanıt:
```js
        const isAdmin = req.user?.role === 'admin';
        const banHistory = playerProfile.getBanHistory(db, username);
        let altAccounts = playerProfile.findAltAccounts(db, username);
        if (!isAdmin) altAccounts = altAccounts.map(a => ({ ...a, ip: null })); // ham IP gizle
        const playtimeDaily = playerProfile.getPlaytimeDaily(db, username);

        res.json({
            username,
            isOnline,
            uuid: resolvedUuid,
            sessionCount:  sessionStats?.session_count || 0,
            totalSeconds:  sessionStats?.total_seconds || 0,
            firstSeen:     sessionStats?.first_seen || null,
            lastSeen:      sessionStats?.last_seen || null,
            sessions,
            mcStats,
            banHistory,
            altAccounts,
            playtimeDaily,
        });
```

- [ ] **Step 3: Envanter endpoint'i ekle**

`/notes` route'larından önce (satır ~378) ekle:
```js
// GET /api/players/profile/:username/inventory — playerdata NBT (envanter+ender)
router.get('/profile/:username/inventory', authMiddleware, async (req, res) => {
    try {
        const username = req.params.username;
        const inst = serverRegistry.getDefault();
        const serverPath = inst?.getServerPath() || '';
        // UUID çöz
        let uuid = null;
        const cacheFile = path.join(serverPath, 'usercache.json');
        if (fs.existsSync(cacheFile)) {
            const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            uuid = cache.find(e => e.name?.toLowerCase() === username.toLowerCase())?.uuid || null;
        }
        if (!uuid) return res.json({ found: false, reason: 'uuid_yok' });
        const data = await readPlayerData(serverPath, uuid);
        if (!data) return res.json({ found: false, reason: 'playerdata_yok' });
        res.json({ found: true, ...data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
```

- [ ] **Step 4: Smoke — route yüklenebiliyor mu**

Run: `cd server && node -e "require('./routes/players'); console.log('players route OK')"`
Beklenen: `players route OK`

- [ ] **Step 5: Commit**

```bash
git add server/routes/players.js
git commit -m "feat(360): profil yaniti genisletildi (ban/alt/grafik) + envanter endpoint'i

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 6: Frontend — Overview grafiği + Yönetim sekmesi + Envanter sekmesi (isim fallback)

**Files:**
- Modify: `client/src/pages/PlayersPage.jsx` (`PlayerProfileModal` ~satır 697-941; import bloğu üstte)

- [ ] **Step 1: Chart import'unu doğrula/ekle**

`PlayersPage.jsx` import'larında `@/knozy/charts`'tan `AreaChart` import edildiğinden emin ol; yoksa ekle:
```js
import { AreaChart } from '@/knozy/charts';
```

- [ ] **Step 2: Sekme listesine Envanter + Yönetim ekle**

`const tabs = [...]` (satır ~733) bloğunu değiştir:
```js
    const tabs = [
        { id: 'overview',  label: 'GENEL' },
        { id: 'inventory', label: 'ENVANTER' },
        { id: 'sessions',  label: 'OTURUMLAR' },
        { id: 'manage',    label: 'YÖNETİM' },
    ];
```

- [ ] **Step 3: Body switch'ine yeni sekmeleri bağla**

Body bölümündeki (satır ~804-814) tab render switch'ini değiştir:
```js
                    ) : tab === 'overview' ? (
                        <ProfileOverview profile={profile}/>
                    ) : tab === 'inventory' ? (
                        <ProfileInventory username={username}/>
                    ) : tab === 'sessions' ? (
                        <ProfileSessions sessions={profile?.sessions || []}/>
                    ) : (
                        <ProfileManage
                            profile={profile}
                            notes={notes} note={note} setNote={setNote}
                            onAdd={() => addNote.mutate()} onDelete={id => delNote.mutate(id)}
                            adding={addNote.isPending}
                            onPlayerClick={() => { /* alt hesaba tıkla — modal username'i değiştir */ }}
                        />
                    )}
```

- [ ] **Step 4: ProfileOverview'a oynama grafiği ekle**

`ProfileOverview` içinde MC istatistikleri bloğundan önce (satır ~846) ekle:
```js
            {Array.isArray(profile.playtimeDaily) && profile.playtimeDaily.length > 1 && (
                <>
                    <Cap>Günlük Oynama (saniye)</Cap>
                    <AreaChart
                        data={profile.playtimeDaily.map(d => d.seconds)}
                        width={580} height={70} color="var(--accent)"
                    />
                </>
            )}
```
(Not: `AreaChart` imzasını `charts.jsx`'ten doğrula — `data` dizi bekliyor; farklıysa uydur.)

- [ ] **Step 5: ProfileInventory bileşenini ekle (isim fallback)**

`ProfileNotes` fonksiyonundan sonra (dosya sonu ~941) ekle:
```js
function ProfileInventory({ username }) {
    const { data, isLoading } = useQuery({
        queryKey: ['player-inventory', username],
        queryFn: () => apiClient.get(`/players/profile/${encodeURIComponent(username)}/inventory`).then(r => r.data),
    });
    if (isLoading) return <div style={{ textAlign: 'center', padding: 32 }}><Spinner size={20}/></div>;
    if (!data?.found) return (
        <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: A.mono, fontSize: 11, color: A.faint }}>
            Envanter verisi yok ({data?.reason === 'uuid_yok' ? 'oyuncu hiç girmemiş' : 'playerdata bulunamadı'})
        </div>
    );
    const main = (data.inventory || []).filter(i => i.slot >= 9 && i.slot <= 35);
    const hotbar = (data.inventory || []).filter(i => i.slot >= 0 && i.slot <= 8);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Durum çubuğu */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: A.mono, fontSize: 11, color: A.dim }}>
                <span>❤ {data.health != null ? data.health.toFixed(1) : '—'}</span>
                <span>🍗 {data.foodLevel ?? '—'}</span>
                <span>XP {data.xpLevel ?? '—'}</span>
                <span>{(data.dimension || '').replace('minecraft:', '') || '—'}</span>
                {data.pos && <span>{Math.round(data.pos.x)}, {Math.round(data.pos.y)}, {Math.round(data.pos.z)}</span>}
            </div>
            <Cap>Zırh & El</Cap>
            <InvGrid items={[data.armor?.head, data.armor?.chest, data.armor?.legs, data.armor?.feet, data.offhand]} cols={5}/>
            <Cap>Hotbar</Cap>
            <InvGrid items={hotbarSlots(hotbar)} cols={9}/>
            <Cap>Envanter</Cap>
            <InvGrid items={fillSlots(main, 9, 35)} cols={9}/>
            <Cap>Ender Chest</Cap>
            <InvGrid items={fillSlots(data.enderItems || [], 0, 26)} cols={9}/>
        </div>
    );
}

// slot aralığını boş hücrelerle doldur (görsel ızgara için)
function fillSlots(items, from, to) {
    const map = new Map(items.map(i => [i.slot, i]));
    const out = [];
    for (let s = from; s <= to; s++) out.push(map.get(s) || null);
    return out;
}
function hotbarSlots(items) { return fillSlots(items, 0, 8); }

function InvGrid({ items, cols }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
            {items.map((it, i) => <InvSlot key={i} item={it}/>)}
        </div>
    );
}

function InvSlot({ item }) {
    if (!item || item.id === 'minecraft:air') {
        return <div style={{ aspectRatio: '1', background: A.bgDeeper, border: `1px solid ${A.border}`, borderRadius: 3 }}/>;
    }
    const shortName = item.id.split(':').pop().replace(/_/g, ' ');
    const title = [
        item.customName || shortName,
        ...item.enchants.map(e => `${e.id.split(':').pop()} ${e.lvl}`),
        item.maxDamage ? `Dayanıklılık: ${Math.round(100 * (1 - (item.damage || 0) / item.maxDamage))}%` : null,
    ].filter(Boolean).join('\n');
    return (
        <div title={title} style={{
            position: 'relative', aspectRatio: '1', background: A.bgDeeper,
            border: `1px solid ${item.enchants.length ? 'var(--accent)' : A.border}`,
            borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 2, overflow: 'hidden',
        }}>
            {/* Faz 2'de buraya <img src=/players/item-texture/:id> gelecek */}
            <span style={{ fontFamily: A.mono, fontSize: 7, color: A.dim, textAlign: 'center', lineHeight: 1.1, wordBreak: 'break-word' }}>
                {shortName}
            </span>
            {item.count > 1 && (
                <span style={{ position: 'absolute', bottom: 1, right: 2, fontFamily: A.mono, fontSize: 9, fontWeight: 700, color: A.text, textShadow: '0 1px 2px #000' }}>
                    {item.count}
                </span>
            )}
        </div>
    );
}
```

- [ ] **Step 6: ProfileManage bileşenini ekle (ban geçmişi + alt + notlar)**

`ProfileNotes`'u koru (Manage içinde tekrar kullanılacak) ve dosya sonuna ekle:
```js
function ProfileManage({ profile, notes, note, setNote, onAdd, onDelete, adding }) {
    const bans = profile?.banHistory || [];
    const alts = profile?.altAccounts || [];
    const actionColor = { ban: A.err, 'ban-ip': A.err, unban: A.ok, 'unban-ip': A.ok };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
                <Cap>Alt Hesaplar (aynı IP)</Cap>
                {alts.length === 0 ? (
                    <p style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, margin: '6px 0' }}>
                        Eşleşme yok (IP takibi bu güncellemeden itibaren çalışır)
                    </p>
                ) : alts.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: A.bgDeeper, borderRadius: 3, marginTop: 4 }}>
                        <span style={{ fontFamily: A.mono, fontSize: 11, color: A.text }}>{a.username}</span>
                        <span style={{ fontFamily: A.mono, fontSize: 10, color: A.faint }}>{a.ip || '••• gizli'}</span>
                    </div>
                ))}
            </div>
            <div>
                <Cap>Ban Geçmişi</Cap>
                {bans.length === 0 ? (
                    <p style={{ fontFamily: A.mono, fontSize: 10, color: A.faint, margin: '6px 0' }}>Kayıt yok</p>
                ) : bans.map(b => (
                    <div key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: A.bgDeeper, borderRadius: 3, marginTop: 4 }}>
                        <Pill color={actionColor[b.action] || A.dim}>{b.action}</Pill>
                        <span style={{ flex: 1, fontSize: 11, color: A.text }}>{b.reason || '—'}</span>
                        <span style={{ fontFamily: A.mono, fontSize: 9, color: A.faint }}>{new Date(b.created_at).toLocaleDateString('tr-TR')}</span>
                    </div>
                ))}
            </div>
            <div>
                <Cap>Notlar</Cap>
                <ProfileNotes notes={notes} note={note} setNote={setNote} onAdd={onAdd} onDelete={onDelete} adding={adding}/>
            </div>
        </div>
    );
}
```

- [ ] **Step 7: Build doğrula**

Run: `cd client && npm run build`
Beklenen: build başarılı (hata yok)

- [ ] **Step 8: Hedefli lint**

Run: `cd client && npx eslint src/pages/PlayersPage.jsx`
Beklenen: yeni hata yok (mevcut uyarılar kabul)

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/PlayersPage.jsx
git commit -m "feat(360): profil modali — oynama grafigi, Envanter (isim), Yonetim sekmesi

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

# FAZ 2 — Gerçek Doku İkonları

## Task 7: adm-zip bağımlılığı + .gitignore cache

**Files:**
- Modify: `server/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: adm-zip yükle**

Run: `cd server && npm install adm-zip@^0.5.16`

- [ ] **Step 2: .gitignore'a cache ekle**

`.gitignore`'a ekle:
```
server/cache/
```

- [ ] **Step 3: Doğrula + Commit**

Run: `cd server && node -e "require('adm-zip'); console.log('zip ok')"`
Beklenen: `zip ok`
```bash
git add server/package.json server/package-lock.json .gitignore
git commit -m "chore(360): adm-zip bagimliligi + cache .gitignore

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 8: Model çözümleyici (`modelResolver.js`) — pure çekirdek

**Files:**
- Create: `server/services/itemTextures/modelResolver.js`
- Test: `server/services/itemTextures/modelResolver.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`server/services/itemTextures/modelResolver.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveTextureRef, textureRefToPath } = require('./modelResolver');

// readModel(ns, path) -> model json | null  (jar/dir soyutlaması)
function fakeReader(models) {
  return (ns, p) => models[`${ns}:${p}`] || null;
}

test('duz item layer0 dokusunu cozer', () => {
  const read = fakeReader({
    'minecraft:item/diamond': { parent: 'minecraft:item/generated', textures: { layer0: 'minecraft:item/diamond' } },
  });
  assert.strictEqual(resolveTextureRef(read, 'minecraft', 'diamond'), 'minecraft:item/diamond');
});

test('parent zinciri uzerinden generated cozer', () => {
  const read = fakeReader({
    'create:item/cogwheel': { parent: 'item/generated', textures: { layer0: 'create:item/cogwheel' } },
  });
  assert.strictEqual(resolveTextureRef(read, 'create', 'cogwheel'), 'create:item/cogwheel');
});

test('blok itemda yuz dokusunu (all/side/top) secer', () => {
  const read = fakeReader({
    'minecraft:item/dirt': { parent: 'minecraft:block/dirt' },
    'minecraft:block/dirt': { parent: 'block/cube_all', textures: { all: 'minecraft:block/dirt' } },
  });
  assert.strictEqual(resolveTextureRef(read, 'minecraft', 'dirt'), 'minecraft:block/dirt');
});

test('cozulemezse null', () => {
  assert.strictEqual(resolveTextureRef(fakeReader({}), 'x', 'yok'), null);
});

test('textureRefToPath asset yolunu uretir', () => {
  assert.strictEqual(textureRefToPath('minecraft:block/dirt'), 'assets/minecraft/textures/block/dirt.png');
  assert.strictEqual(textureRefToPath('create:item/cogwheel'), 'assets/create/textures/item/cogwheel.png');
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `cd server && node --test services/itemTextures/modelResolver.test.js`
Beklenen: FAIL — `Cannot find module './modelResolver'`

- [ ] **Step 3: Minimal implementasyon**

`server/services/itemTextures/modelResolver.js`:
```js
const FACE_PRIORITY = ['all', 'side', 'north', 'top', 'particle', 'texture', '0'];

function _normRef(ref, ns) {
  // "modid:path" veya "path" → {ns, path}
  if (ref.includes(':')) { const [n, p] = ref.split(':'); return `${n}:${p}`; }
  return `${ns}:${ref}`;
}

function _parentNsPath(parent, ns) {
  const full = parent.includes(':') ? parent : `${ns}:${parent}`;
  const [n, p] = full.split(':');
  return { ns: n, path: p };
}

/**
 * readModel(ns, path) -> json|null soyutlamasıyla item modelinden doku ref'i çözer.
 * Düz item → layer0; blok → yüz önceliği. Bulunamazsa null.
 */
function resolveTextureRef(readModel, modid, name) {
  let cur = { ns: modid, path: `item/${name}` };
  const textures = {};
  let depth = 0;
  let sawBlock = false;

  while (cur && depth < 12) {
    const model = readModel(cur.ns, cur.path);
    if (!model) break;
    Object.assign(textures, model.textures || {}); // çocuk üste yazar (zaten önce eklendi)
    if (cur.path.startsWith('block/')) sawBlock = true;

    // generated/handheld → düz item, layer0 kullan
    const parent = model.parent;
    const isGenerated = parent && /(?:^|\/)(generated|handheld)$/.test(parent);
    if (textures.layer0 && (isGenerated || !parent)) {
      return _normRef(textures.layer0, cur.ns);
    }
    if (!parent) break;
    cur = _parentNsPath(parent, cur.ns);
    depth++;
  }

  // Blok yolu: yüz önceliğine göre doku seç
  if (sawBlock || Object.keys(textures).length) {
    for (const key of FACE_PRIORITY) {
      if (textures[key] && !textures[key].startsWith('#')) return _normRef(textures[key], modid);
    }
    const first = Object.values(textures).find(v => !v.startsWith('#'));
    if (first) return _normRef(first, modid);
  }
  if (textures.layer0) return _normRef(textures.layer0, modid);
  return null;
}

/** "ns:block/dirt" → "assets/ns/textures/block/dirt.png" */
function textureRefToPath(ref) {
  const [ns, p] = ref.split(':');
  return `assets/${ns}/textures/${p}.png`;
}

module.exports = { resolveTextureRef, textureRefToPath };
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `cd server && node --test services/itemTextures/modelResolver.test.js`
Beklenen: PASS — 5 test

- [ ] **Step 5: Commit**

```bash
git add server/services/itemTextures/modelResolver.js server/services/itemTextures/modelResolver.test.js
git commit -m "feat(360/doku): model cozumleyici — layer0/blok-yuz doku ref'i (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 9: Asset indeksi (`assetIndex.js`) — modid→jar

**Files:**
- Create: `server/services/itemTextures/assetIndex.js`
- Test: `server/services/itemTextures/assetIndex.test.js`

- [ ] **Step 1: Başarısız testi yaz**

`server/services/itemTextures/assetIndex.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { buildModIndex } = require('./assetIndex');

test('jar icindeki assets/<modid>/ oneklerini indeksler', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mods-'));
  const zip = new AdmZip();
  zip.addFile('assets/create/models/item/cogwheel.json', Buffer.from('{}'));
  zip.addFile('assets/create/textures/item/cogwheel.png', Buffer.from('x'));
  zip.addFile('META-INF/MANIFEST.MF', Buffer.from('x'));
  zip.writeZip(path.join(dir, 'create.jar'));

  const idx = buildModIndex(dir);
  assert.strictEqual(idx.get('create'), path.join(dir, 'create.jar'));
  assert.strictEqual(idx.has('minecraft'), false);
});

test('mods klasoru yoksa bos map', () => {
  const idx = buildModIndex(path.join(os.tmpdir(), 'yok-' + Date.now()));
  assert.strictEqual(idx.size, 0);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `cd server && node --test services/itemTextures/assetIndex.test.js`
Beklenen: FAIL

- [ ] **Step 3: Minimal implementasyon**

`server/services/itemTextures/assetIndex.js`:
```js
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/** mods/*.jar tarayıp modid → jarPath haritası kurar (assets/<modid>/ öneklerinden). */
function buildModIndex(modsDir) {
  const map = new Map();
  if (!fs.existsSync(modsDir)) return map;
  const jars = fs.readdirSync(modsDir).filter(f => f.toLowerCase().endsWith('.jar'));
  for (const jar of jars) {
    const full = path.join(modsDir, jar);
    try {
      const entries = new AdmZip(full).getEntries();
      for (const e of entries) {
        const m = e.entryName.match(/^assets\/([^/]+)\//);
        if (m && !map.has(m[1])) map.set(m[1], full);
      }
    } catch { /* bozuk jar atla */ }
  }
  return map;
}

module.exports = { buildModIndex };
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `cd server && node --test services/itemTextures/assetIndex.test.js`
Beklenen: PASS — 2 test

- [ ] **Step 5: Commit**

```bash
git add server/services/itemTextures/assetIndex.js server/services/itemTextures/assetIndex.test.js
git commit -m "feat(360/doku): mod jar asset indeksi (modid -> jar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 10: Vanilla asset sağlayıcı (`vanillaAssets.js`)

**Files:**
- Create: `server/services/itemTextures/vanillaAssets.js`

- [ ] **Step 1: Implementasyon (network → smoke ile doğrulanır)**

`server/services/itemTextures/vanillaAssets.js`:
```js
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/** level.dat → Data.Version.Name; bulunamazsa null. */
async function detectMcVersion(serverPath) {
  try {
    const nbt = require('prismarine-nbt');
    const file = path.join(serverPath, 'world', 'level.dat');
    if (!fs.existsSync(file)) return null;
    const { parsed } = await nbt.parse(fs.readFileSync(file));
    return nbt.simplify(parsed)?.Data?.Version?.Name || null;
  } catch { return null; }
}

/** Mojang piston-meta'dan sürüm için client jar URL'i. */
async function _clientJarUrl(version) {
  const man = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json').then(r => r.json());
  const entry = man.versions.find(v => v.id === version);
  if (!entry) return null;
  const pkg = await fetch(entry.url).then(r => r.json());
  return pkg?.downloads?.client?.url || null;
}

/**
 * Vanilla assets'i cache'e indirir/çıkarır. cacheRoot/vanilla-assets/<ver>/assets/minecraft/...
 * Döner: assets dizini yolu | null (internet yok / sürüm yok).
 */
async function ensureVanilla(serverPath, cacheRoot, versionOverride) {
  const version = versionOverride || await detectMcVersion(serverPath);
  if (!version) return null;
  const dest = path.join(cacheRoot, 'vanilla-assets', version);
  const marker = path.join(dest, '.done');
  if (fs.existsSync(marker)) return path.join(dest, 'assets');
  try {
    const url = await _clientJarUrl(version);
    if (!url) return null;
    const buf = Buffer.from(await fetch(url).then(r => r.arrayBuffer()));
    const zip = new AdmZip(buf);
    fs.mkdirSync(dest, { recursive: true });
    for (const e of zip.getEntries()) {
      if (e.entryName.startsWith('assets/minecraft/textures/') ||
          e.entryName.startsWith('assets/minecraft/models/')) {
        const out = path.join(dest, e.entryName);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, e.getData());
      }
    }
    fs.writeFileSync(marker, version);
    return path.join(dest, 'assets');
  } catch { return null; }
}

module.exports = { detectMcVersion, ensureVanilla };
```

- [ ] **Step 2: Smoke — modül yüklenir, version detect çökmesin**

Run: `cd server && node -e "const v=require('./services/itemTextures/vanillaAssets'); v.detectMcVersion('/yok').then(r=>console.log('detect ok:', r))"`
Beklenen: `detect ok: null` (level.dat yok → null, çökmeden)

- [ ] **Step 3: Commit**

```bash
git add server/services/itemTextures/vanillaAssets.js
git commit -m "feat(360/doku): vanilla asset saglayici — level.dat surum + Mojang indirme

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 11: Orkestrasyon (`index.js`) + `/item-texture/:id` route

**Files:**
- Create: `server/services/itemTextures/index.js`
- Modify: `server/routes/players.js`

- [ ] **Step 1: Orkestratörü yaz**

`server/services/itemTextures/index.js`:
```js
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { buildModIndex } = require('./assetIndex');
const { ensureVanilla } = require('./vanillaAssets');
const { resolveTextureRef, textureRefToPath } = require('./modelResolver');

const CACHE_ROOT = path.join(__dirname, '..', '..', 'cache');
const TEX_DIR = path.join(CACHE_ROOT, 'item-textures');

let _modIndex = null;       // Map<modid, jarPath>
let _vanillaAssets = null;  // assets dir yolu | null
let _ready = null;

async function _init(serverPath) {
  if (_ready) return _ready;
  _ready = (async () => {
    _modIndex = buildModIndex(path.join(serverPath, 'mods'));
    _vanillaAssets = await ensureVanilla(serverPath, CACHE_ROOT);
  })();
  return _ready;
}

// Belirli ns için model okuyucu (jar veya vanilla dir)
function _readerFor(ns) {
  if (ns === 'minecraft' && _vanillaAssets) {
    return (n, p) => {
      // p zaten "item/x" veya "block/x" formatında
      const file = path.join(_vanillaAssets, n, 'models', `${p}.json`);
      if (!fs.existsSync(file)) return null;
      try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
    };
  }
  const jar = _modIndex?.get(ns);
  if (!jar) return () => null;
  const zip = new AdmZip(jar);
  return (n, p) => {
    const entry = zip.getEntry(`assets/${n}/models/${p}.json`);
    if (!entry) return null;
    try { return JSON.parse(entry.getData().toString('utf-8')); } catch { return null; }
  };
}

function _readTextureBytes(ns, assetPath) {
  if (ns === 'minecraft' && _vanillaAssets) {
    const file = path.join(_vanillaAssets, assetPath.replace(/^assets\//, ''));
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  }
  const jar = _modIndex?.get(ns);
  if (!jar) return null;
  const entry = new AdmZip(jar).getEntry(assetPath);
  return entry ? entry.getData() : null;
}

/** itemId ("modid:name") → cache'li PNG yolu | null. */
async function getItemTexturePath(serverPath, itemId) {
  await _init(serverPath);
  const [ns, name] = itemId.includes(':') ? itemId.split(':') : ['minecraft', itemId];
  const safe = `${ns}__${name}`.replace(/[^a-z0-9_]/gi, '_');
  const cached = path.join(TEX_DIR, `${safe}.png`);
  if (fs.existsSync(cached)) return cached;

  const reader = _readerFor(ns);
  const ref = resolveTextureRef(reader, ns, name);
  if (!ref) return null;
  const refNs = ref.split(':')[0];
  const bytes = _readTextureBytes(refNs, textureRefToPath(ref));
  if (!bytes) return null;
  fs.mkdirSync(TEX_DIR, { recursive: true });
  fs.writeFileSync(cached, bytes);
  return cached;
}

module.exports = { getItemTexturePath };
```

- [ ] **Step 2: Route ekle**

`server/routes/players.js` — import'a ekle:
```js
const itemTextures = require('../services/itemTextures');
```
`/profile/:username/inventory`'den sonra ekle:
```js
// GET /api/players/item-texture/:id — item dokusu (cache'li PNG)
router.get('/item-texture/:id', authMiddleware, async (req, res) => {
    try {
        const inst = serverRegistry.getDefault();
        const serverPath = inst?.getServerPath() || '';
        const file = await itemTextures.getItemTexturePath(serverPath, req.params.id);
        if (!file) return res.status(404).end();
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Type', 'image/png');
        fs.createReadStream(file).pipe(res);
    } catch { res.status(404).end(); }
});
```

- [ ] **Step 3: Smoke — modül + route yüklenir**

Run: `cd server && node -e "require('./services/itemTextures'); require('./routes/players'); console.log('textures+route OK')"`
Beklenen: `textures+route OK`

- [ ] **Step 4: Commit**

```bash
git add server/services/itemTextures/index.js server/routes/players.js
git commit -m "feat(360/doku): doku orkestrasyonu + /item-texture endpoint'i (lazy cache)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Task 12: Frontend — envanter ızgarasında gerçek ikon

**Files:**
- Modify: `client/src/pages/PlayersPage.jsx` (`InvSlot` bileşeni)

- [ ] **Step 1: InvSlot'a `<img>` ekle (isim fallback'le)**

`InvSlot` içinde doku yorumunu (`{/* Faz 2'de... */}` + `<span shortName>`) şununla değiştir:
```js
            <ItemIcon id={item.id} fallback={shortName}/>
```
Ve yeni bileşeni ekle:
```js
function ItemIcon({ id, fallback }) {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return <span style={{ fontFamily: A.mono, fontSize: 7, color: A.dim, textAlign: 'center', lineHeight: 1.1, wordBreak: 'break-word' }}>{fallback}</span>;
    }
    return (
        <img
            src={`/api/players/item-texture/${encodeURIComponent(id)}`}
            alt={fallback}
            onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
        />
    );
}
```

- [ ] **Step 2: Build doğrula**

Run: `cd client && npm run build`
Beklenen: build başarılı

- [ ] **Step 3: Hedefli lint**

Run: `cd client && npx eslint src/pages/PlayersPage.jsx`
Beklenen: yeni hata yok

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PlayersPage.jsx
git commit -m "feat(360/doku): envanter izgarasinda gercek item ikonu (isim fallback)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Bitiş Doğrulama (deploy sonrası, VDS'te)

- [ ] `./update.sh` ile deploy (git pull + npm install + vite build + pm2 restart)
- [ ] Oyuncu profili aç → Envanter sekmesi → ikonların yüklendiğini gör (ilk yüklemede vanilla jar indirilir, biraz bekler)
- [ ] Yönetim sekmesi → ban geçmişi + alt-hesap listesi
- [ ] Genel sekmesi → günlük oynama grafiği
- [ ] Bir oyuncu giriş yapsın → `player_sessions.ip_address` dolmalı (alt-hesap ileriye dönük)

---

## Self-Review Notları (plan yazarı)
- **Spec kapsamı:** 4 parça (grafik=Task6, ban/not=Task5+6, envanter=Task2/5/6 + doku Task7-12, alt-hesap=Task3/4/5/6) ✓
- **Kick:** kapsam dışı (spec'te belirtildi) ✓
- **Tip tutarlılığı:** `normalizePlayerNbt` çıktısı (inventory/armor/offhand/enderItems/health...) frontend `ProfileInventory`'de aynı isimlerle tüketiliyor ✓; `findAltAccounts` → `{username, ip, lastSeen}` ile `ProfileManage` uyumlu ✓
- **Belirsizlik:** `AreaChart` imzası deploy öncesi `charts.jsx`'ten teyit edilecek (Task6 Step4 notu) ✓
- **Vanilla model okuyucu** `_readerFor` sadeleştirildi (ölü `f` satırı kaldırıldı) ✓
