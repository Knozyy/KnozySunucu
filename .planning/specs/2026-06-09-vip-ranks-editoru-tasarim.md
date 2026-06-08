# VIP Perk Editörü (ranks.snbt) — Tasarım

**Tarih:** 2026-06-09
**Durum:** ✅ Onaylandı — uygulamaya hazır (TDD).
**Bağlam:** Adım 1 (panel presetleri + perk görünürlüğü) tamam ([VipPage.jsx](../../client/src/pages/VipPage.jsx), commit 314f976). Bu, Adım 2: perkleri **panelden** düzenleyip sunucudaki `config/ftbranks/ranks.snbt`'ye yazma.
**Karar geçmişi:** İzin sistemi = FTB Ranks · editör modeli = **yapılandırılmış form** (ham metin değil). Perk seti: [.planning/2026-06-08-vip-perk-rehberi.md](../2026-06-08-vip-perk-rehberi.md).

## Neden böyle

`ConfigParser` SNBT desteklemiyor; `prismarine-nbt` binary NBT içindir, FTB metin-SNBT'sine (tırnaksız anahtar, virgülsüz, tip ekleri) uymaz. Bu yüzden **hedefli metin düzenleme** (ConfigParser'ın TOML için yaptığının aynısı): bloğu parantez eşleyerek bul, **yeniden üret**, bilinmeyen anahtarları koru.

## Yönetilen perk şeması (managed keys)

| Form alanı | SNBT anahtarı | Tip |
|---|---|---|
| İsim formatı | `ftbranks.name_format` | string |
| Home sayısı | `ftbessentials.home.max` | int |
| Home cooldown | `ftbessentials.home.cooldown` | int |
| /back | `command.back` | varlık (true) |
| /rtp | `command.rtp` | varlık (true) |
| /enderchest | `command.enderchest` | varlık (true) |
| Claim chunk | `ftbchunks.max_claimed` | int |
| Force-load chunk | `ftbchunks.max_force_loaded` | int |

Kademe meta (eksik blok oluşturulurken): `vip`/`vip_plus`/`mvp` → power 50/60/70 (presetlerden).

## Katmanlar

### 1. `server/services/vip/ranksFile.js` (yeni · saf · TDD'li)
- `findBlock(raw, rankKey) → {start, end, indent} | null` — `<rankKey>: {` ... eşleşen `}`. String içindeki `{}` ve `"` atlanır.
- `readPerks(raw, rankKey) → { exists, name, power, perks:{nameFormat, homeMax, homeCooldown, back, rtp, enderchest, maxClaimed, maxForceLoaded} }` — yoksa `exists:false`.
- `writePerks(raw, rankKey, perks, meta) → newRaw`:
  - Blok varsa: satırları ayrıştır, `name/power/condition` + **bilinmeyen anahtarları koru**, yönetilen anahtarları forma göre güncelle (toggle kapalı → anahtarı **çıkar**).
  - Blok yoksa: `ranks: { … }` içine, kapanış `}`'den önce yeni blok ekle (meta name/power + yönetilen perkler).
- Tümü saf string fonksiyonu. Booleans `true`/`false` yazılır; okurken `true/false/1b/0b` kabul.

### 2. `vipService` ekleri
- `_ranksPath()` → `path.join(mc.getServerPath(), 'config/ftbranks/ranks.snbt')` (serverRegistry default). Dosya yoksa anlamlı hata/flag.
- `readTierPerks() → { fileFound, tiers:[{rank, ...readPerks}] }` (3 kademe).
- `saveTierPerks(rank, perks)`:
  1. `.vipbak` yedeği (kayıt-öncesi içerik).
  2. `writePerks` → dosyaya yaz.
  3. **Doğrula:** geri oku + `readPerks`, yazılan değerler eşleşmiyorsa hata (gerekirse yedekten dön).
  4. Sunucu çalışıyorsa `sendCommand('ftbranks reload')`.
  5. `{ ok, reloaded, detail }`.

### 3. `routes/vip.js` ekleri
- `GET /vip/ranks-perks` (auth) → `readTierPerks()`.
- `PUT /vip/ranks-perks/:rank` (auth + admin) → `saveTierPerks`.

### 4. `VipPage.jsx` — "Perkler" sekmesi
- Sekmeler: VIP Ver & Aktif · Paketler · **Perkler** · Log.
- 3 kademe kartı (VIP/VIP+/MVP): isim formatı (text), home sayısı/cooldown (number), /back–/rtp–/enderchest (checkbox), claim/force (number), kademe başına **Kaydet**.
- Yükleme: GET ile doldur; `fileFound:false` ise uyarı + rehbere işaret. Kaydet → PUT → toast (+ reload durumu; sunucu kapalıysa "kaydedildi, açılınca uygulanır").

## Davranış kararları (onaylı)
- Komut kapatınca satır **silinir** (varsayılana döner).
- Eksik kademe bloğu **otomatik oluşturulur**.
- Şema dışı elle eklenmiş anahtarlar **korunur**.
- Her kayıtta `.vipbak` yedeği + yazma sonrası doğrulama + (açıksa) otomatik reload.

## Test (node --test · `server/services/vip/ranksFile.test.js`)
- findBlock: tek/çok kademe, iç içe `{}`, string içindeki `{`/`}`, blok yok.
- readPerks: tırnaklı/tırnaksız anahtar, eksik anahtarlar, exists:false.
- writePerks: mevcut bloğu güncelle · eksik bloğu oluştur · bilinmeyen anahtarı koru · toggle kapatınca satırı sil · değer değiştir.
- round-trip: write → read aynı perkleri verir.

## Kapsam dışı (sonra)
- Yeni özel kademe ekleme/silme (şimdilik sadece vip/vip_plus/mvp).
- Genel SNBT şema editörü.
