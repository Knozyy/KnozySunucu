# Oyuncu 360 Profili — Tasarım Dökümanı (Spec)

**Tarih:** 2026-06-07
**Backlog:** `.planning/FEATURE_IDEAS.md` #1
**Durum:** ✅ Tasarım onaylandı — uygulama planı (writing-plans) bir sonraki adım.

---

## 1. Amaç ve Kapsam

Mevcut `PlayerProfileModal`'ı (Genel Bakış / Oturumlar / Notlar) tam bir "360 profil"e
genişletmek. Bu turda eklenecek **4 eksik parça**:

1. **Oynama süresi grafiği** — oturumları güne göre gruplayıp AreaChart.
2. **Ban/kick + not geçmişi (birleşik)** — `ban_log`'dan oyuncunun ban/unban/ip-ban geçmişi + notlar tek "Yönetim" sekmesinde.
3. **Envanter + Ender Chest görüntüleyici** — `world/playerdata/<uuid>.dat` NBT parse, **gerçek doku ikonlarıyla** (modlu dahil).
4. **Alt-hesap (aynı IP) tespiti** — giriş logundan IP yakala, paylaşılan IP'leri olan hesapları göster.

### Zaten mevcut (değişmeyecek temel)
- `GET /api/players/profile/:username` → oturum istatistikleri, son 20 oturum, `world/stats/<uuid>.json`'dan mcStats (ölüm/kill/blok/hasar).
- `player_notes`, `ban_log`, `player_sessions`, `player_stats_archives` tabloları.
- `usercache.json` → UUID çözümü deseni.

### Kapsam dışı (bu tur)
- Kick loglama (şu an hiç loglanmıyor; `ban_log` yalnız ban/unban/ip-ban). Ayrı küçük iş olarak ileride.
- Blokların gerçek 3D izometrik render'ı → **düz-yüz yaklaşımı** kullanılacak.
- Modlu item dokularının tam atlas önceden-bake'i → **lazy (talep-anında)** çözüm.
- Geçmiş oturumlar için IP backfill (mümkün değil — IP ileriye dönük yakalanır).

---

## 2. Mimari — Bileşenler ve Arayüzler

### 2.1 `server/services/playerData.js` (YENİ)
Oyuncu `.dat` NBT okuyucu. Tek sorumluluk: ham NBT → normalize JSON.

```
readPlayerData(serverPath, uuid) -> {
  inventory: [ { slot, id, count, enchants:[{id,lvl}], damage, maxDamage, customName, lore } ],
  enderItems: [ ...aynı şema... ],
  armor:   { head, chest, legs, feet },   // Inventory slot 103,102,101,100
  offhand: <item|null>,                    // Inventory slot -106
  health, foodLevel, xpLevel, xpTotal,
  pos: {x,y,z}, dimension, gameType
}
```

- `prismarine-nbt` ile parse (gzip otomatik algılanır).
- **1.20.5+ data-component formatı**: `id` (string, "minecraft:diamond"), `count` (int), `components` compound:
  - `minecraft:enchantments` → `{ levels: { "modid:ench": lvl } }`
  - `minecraft:damage` → kullanılmış dayanıklılık değeri (int). **Önemli:** taban `maxDamage` item registry'sinde tanımlıdır, oyuncu `.dat`'ında yoktur → yalnız `minecraft:max_damage` component'i varsa `maxDamage` döner, aksi halde `damage` ham gösterilir, yüzde hesaplanmaz.
  - `minecraft:custom_name`, `minecraft:lore`.
- Zırh/offhand `Inventory` listesinden slot numarasıyla ayrıştırılır (100–103 zırh, -106 offhand), kalan 0–35 envanter (0–8 hotbar).
- UUID `usercache.json`'dan çözülür (mevcut desen).

### 2.2 `server/services/itemTextures/` (YENİ — Yaklaşım A: lazy)
Doku pipeline. `(modid:name)` → cache'li PNG yolu.

- **`index.js`** — public API:
  - `getItemTexturePath(serverPath, itemId) -> string|null` (cache'li PNG; yoksa çöz+yaz; bulunamazsa null → route placeholder döner).
- **`vanillaAssets.js`** — `ensureVanilla(serverPath) -> assetsDir`:
  - MC sürümünü tespit: `world/level.dat` → `Data.Version.Name`; `app_settings.mc_version` override.
  - Mojang `version_manifest_v2.json` → sürüm paketi → `downloads.client.url` → jar indir.
  - `assets/minecraft/{textures,models}` → `cache/vanilla-assets/<ver>/`. Idempotent (varsa atla).
- **`assetIndex.js`** — `getModIndex(serverPath) -> Map<modid, jarPath>`:
  - `mods/*.jar` merkezi dizinlerini tara, `assets/<modid>/` öneklerini topla.
  - Jar isim+mtime parmak iziyle bellek+disk cache; mods değişince yeniden kurulur.
- **`modelResolver.js`** — `resolve(jarOrDir, modid, name) -> pngBytes|null`:
  - `assets/<modid>/models/item/<name>.json` oku, `parent` zincirini çöz (sınırlı derinlik, jar'lar arası).
  - **Düz item** (`item/generated`/`builtin/generated`): `textures.layer0`.
  - **Blok** (parent `block/...`): blok modelinden yüz dokusu seç → öncelik `all → side → top → particle → ilk değer` (düz-yüz yaklaşımı).
  - Doku ref `modid:item/foo` → `assets/modid/textures/item/foo.png`.
  - Çıkarılan PNG → `cache/item-textures/<modid>/<name>.png`.
- **Cache:** `server/cache/vanilla-assets/`, `server/cache/item-textures/`. (`.gitignore`'a eklenecek.)
- **Notlar:** Animasyonlu doku (.mcmeta dikey şerit) olduğu gibi servis edilir; UI `object-fit` ile ilk kareye yakın gösterir (kabul edilebilir; ilk-kare kırpma kapsam dışı).

### 2.3 `server/services/minecraftService.js` (DEĞİŞİKLİK)
Giriş logundan IP yakalama:
- Regex: `(\w{1,16})\[/([0-9a-fA-F:.]+):\d+\] logged in` → bellekte `pendingIp[username]=ip`.
- "joined the game" oturumu açılırken (mevcut INSERT) `ip_address`'i de yaz; sonra `pendingIp`'ten sil.
- IPv4 ve IPv6 destekli regex.

### 2.4 DB Migration — `server/db/database.js` (DEĞİŞİKLİK)
- `player_sessions`'a `ip_address TEXT` kolonu: `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN` (mevcut desen, satır ~290).

### 2.5 `server/routes/players.js` (DEĞİŞİKLİK + YENİ)
- `GET /profile/:username` genişlet — ekle:
  - `banHistory`: `SELECT * FROM ban_log WHERE username = ? ORDER BY id DESC`.
  - `altAccounts`: oyuncunun bilinen IP'lerini bul → aynı IP'yi paylaşan **farklı** kullanıcı adları (`DISTINCT`), her biri için son görülme. IP ham değeri yalnız admin yanıtında.
  - `playtimeDaily`: `player_sessions` güne göre (`joined_at`), `SUM(duration_seconds)` — son ~30 gün serisi.
- `GET /profile/:username/inventory` (YENİ): UUID çöz → `playerData.readPlayerData`. Sunucu çalışırken `.dat` flush gecikebilir → not olarak "son kaydedilen veri" etiketi.
- `GET /item-texture/:id` (YENİ): `id` url-encoded (`minecraft:diamond`). `itemTextures.getItemTexturePath` → PNG stream; yoksa 1x1/placeholder PNG. Uzun cache header.

### 2.6 `client/src/pages/PlayersPage.jsx` (DEĞİŞİKLİK)
`PlayerProfileModal` sekmeleri:
- **Genel Bakış**: mevcut + **oynama süresi AreaChart** (`playtimeDaily`, `@/hoodoo/charts`).
- **Envanter** (YENİ): gerçek ızgara düzeni
  - Üst durum çubuğu: can ❤ / açlık 🍗 / XP / boyut / konum.
  - Hotbar (9) + ana envanter (27) + zırh (4 dikey) + offhand (1) + **Ender Chest** (27).
  - Her slot: `<img src="/api/players/item-texture/<id>">` + adet rozeti (>1) + büyü parıltısı (components.enchantments varsa) + hover tooltip (ad, büyüler, dayanıklılık — `max_damage` varsa %, yoksa ham değer, lore).
  - Boş slotlar HooDoo tarzı soluk hücre.
  - Doku 404 → item adı kısaltması fallback (Faz 1'de tüm hücreler isim; Faz 2'de ikon).
- **Yönetim** (YENİ — Notlar'ı içine alır): ban/unban/ip-ban geçmişi listesi + alt-hesap listesi (tıkla→o profile geç) + not ekle/sil.

---

## 3. Veri Akışı

```
Envanter sekmesi açılır
  → GET /profile/:u/inventory
     → usercache.json: u → uuid
     → playerData.readPlayerData(serverPath, uuid)  [gunzip+NBT]
     → normalize JSON  → UI ızgara
  → her dolu slot için <img /item-texture/<id>>
     → itemTextures.getItemTexturePath(serverPath, id)
        → cache hit? PNG döndür
        → yoksa: vanillaAssets.ensureVanilla / assetIndex → modelResolver → PNG yaz → döndür
        → çözülemezse placeholder
```

IP/alt-hesap akışı:
```
Oyuncu girişi → log "Nick[/IP:port] logged in" → pendingIp[Nick]=IP
            → log "Nick joined the game" → INSERT session(... , ip_address=IP)
profil açılır → altAccounts: bu oyuncunun IP'leri → aynı IP'li diğer isimler
```

---

## 4. Hata Yönetimi
- `.dat` yok/bozuk → boş envanter + "veri yok / oyuncu hiç girmemiş" mesajı (500 değil).
- Vanilla indirme başarısız (internet yok) → vanilla ikonlar placeholder, modlu ikonlar etkilenmez; UI bozulmaz.
- Mod jar okunamadı → o item placeholder; diğerleri etkilenmez.
- Tüm NBT/zip işlemleri try/catch; route'lar hiçbir zaman ham NBT exception'ı sızdırmaz.

---

## 5. Mahremiyet ve Yetki
- Ham IP yalnız **admin** yanıtında döner; non-admin alt-hesap eşleşmesini görür ama IP gizli.
- IP yakalama **ileriye dönük** — UI'da "IP takibi bu güncellemeden itibaren" notu.
- Envanter görüntüleme hassas; mevcut sayfa yetkisiyle (PlayersPage erişimi) sınırlı.

---

## 6. Test Stratejisi
- `playerData.readPlayerData`: örnek `.dat` (gzip NBT) ile birim test — slot ayrıştırma, components okuma.
- `modelResolver`: küçük sahte jar (zip) ile generated/block parent çözümleme testi.
- IP regex: IPv4/IPv6 örnek log satırları.
- `altAccounts` SQL: çoklu IP paylaşım senaryosu.
- Smoke: endpoint'ler 200 + şema; `vite build`; hedefli eslint.

---

## 7. Bağımlılıklar (yeni)
- `prismarine-nbt` — gzip NBT parse.
- `adm-zip` — jar (zip) okuma.
- Görsel kütüphane **gerekmez** (düz-yüz → PNG doğrudan servis).

---

## 8. Build Sırası (risk azaltma — 2 faz)

**Faz 1 — 360 çekirdek (dokusuz):**
- `playerData.js` + envanter endpoint
- DB `ip_address` kolonu + `minecraftService` IP yakalama
- `players.js` profil genişletmeleri (banHistory, altAccounts, playtimeDaily)
- Frontend: oynama grafiği, Yönetim sekmesi, envanter ızgarası **isim fallback'iyle**

**Faz 2 — gerçek dokular:**
- `itemTextures/` pipeline (vanillaAssets + assetIndex + modelResolver)
- `/item-texture/:id` endpoint
- Frontend ızgara: isim → `<img>` ikon

Her faz kendi başına çalışır ve deploy edilebilir; Faz 1 tek başına tam "360" değeri verir.

---

## 9. Açık Notlar
- Kick geçmişi ileride (kick loglama eklenince).
- Animasyonlu doku ilk-kare kırpma ileride (görsel kütüphane gerekirse).
- MC sürüm tespiti `level.dat` öncelikli, `app_settings.mc_version` override.
