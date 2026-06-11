# Discord Lag Panosu — Tasarım

**Tarih:** 2026-06-11
**Durum:** ✅ Tasarım onaylandı — uygulamaya hazır.
**Bağlam:** Adil lag atıfı tamamlandı (spec: 2026-06-09). Kullanıcı, atıf listesini Discord'da
botla yansıtmak istiyor: "sitede her yenilendiğinde Discord'da da yenilenecek".
**Onaylanan kararlar:** İçerik = **kişiler + ms, büyükten küçüğe, ilk 5** · **iki liste**:
"Ortalama" (etiket; veri = adil kanıt **medyanı** — kullanıcı 'medyan' yerine 'Ortalama'
yazılmasını istedi) + "Son Tarama" · kanal **panelden seçilir** (guild→kanal seçici).

## Davranış

Bot, seçilen kanala **tek mesaj** atar; sonrasında hep **aynı mesajı düzenler** (spam yok).
Her yeni atıf taraması kaydedildiğinde (sitedeki verinin değiştiği an) mesaj otomatik tazelenir
(2 sn debounce). Mesaj elle silinmişse refresh yenisini atar.

## Mesaj biçimi (embed)

```
🛡️ Lag Sıralaması
📊 Ortalama (son 6 lag-taraması)        ← evidence.flagged+watch, medianMs desc, ilk 5, >0
1. Knozy — 14.0 ms
…                                        ← yetersizse "Yeterli veri yok…", boşsa "Kayda değer yük yok."
⏱️ Son Tarama (21:40 · MSPT 58[· teşhis]) ← son kayıt; v2: totalMs desc ilk 5 (eski kayıt: ms)
1. Knozy — 14.2 ms                       ← sağlıklı anda alındıysa başlığa "teşhis" eklenir
…
footer: Knozy Sunucu Paneli · timestamp
```

## Parçalar

### 1. `discordBotService` ekleri
- `_discordApiBody(method, path, body)` — JSON gövdeli POST/PATCH (mevcut `_discordApiPut`
  kalıbının gövdeli hâli; 8 sn timeout, hata → null).
- `listGuildChannels(guildId)` — `GET /guilds/{id}/channels` → yalnızca metin kanalları
  (`type === 0`), `{id, name, position}` position'a göre sıralı.
- `sendChannelMessage(channelId, payload)` — `POST /channels/{id}/messages` → `{ok, id, statusCode}`.
- `editChannelMessage(channelId, messageId, payload)` — `PATCH /channels/{id}/messages/{mid}` → `{ok, statusCode}`.

### 2. YENİ `server/services/lagBoardService.js`
- Ayarlar `app_settings`: `lagboard_guild_id` / `lagboard_channel_id` / `lagboard_message_id`
  (webhookService'teki upsert kalıbı).
- `buildEmbed({ evidence, lastScan })` — **saf, birim testli**. "Ortalama" bölümü:
  `flagged+watch` birleşik, `medianMs` desc, >0 filtreli, ilk 5. "Son Tarama": v2 `totalMs` /
  eski kayıt `ms` anahtarı, desc ilk 5; `mspt_at < msptWarn` veya null ise başlığa "teşhis".
- `status()` → `{ configured, guildId, channelId, messageId }`.
- `setup(guildId, channelId)` → embed kur + mesaj gönder + ID'leri kaydet; 403 → "bot kanala
  yazamıyor (izin)" hatası.
- `refresh()` → yapılandırılmamışsa no-op; PATCH; **404 → yeni mesaj at + ID güncelle**.
- `scheduleRefresh()` → 2 sn debounce → `refresh()`.
- `remove()` → mesajı silmeyi dene (best-effort `_discordApiDelete`) + ayarları temizle.
- Veri kaynakları (lazy require — döngüsel bağımlılık önlenir): `lagGuard.getAttributionEvidence()`
  + `attribution/probe.list(1)[0]`.

### 3. Tetik
`probe._record(...)` sonunda fire-and-forget: `require('../../lagBoardService').scheduleRefresh()`
(try/catch, kayıt akışını asla bozmaz).

### 4. API (`routes/lagGuard.js`)
- `GET /lag-guard/board` (auth) — durum.
- `GET /lag-guard/board/channels?guildId=` (auth) — kanal listesi.
- `POST /lag-guard/board/setup` (admin) — `{guildId, channelId}`.
- `POST /lag-guard/board/refresh` (admin) — elle tazele.
- `DELETE /lag-guard/board` (admin) — kaldır.
- Guild listesi için mevcut `GET /vip/guilds` aynen kullanılır (yeni endpoint yok).

### 5. Panel — LagGuard → Ayarlar sekmesi
Restart-kuyruğu kartı ile SettingsPanel arasına **"Discord Lag Panosu"** kartı:
[Sunucu ▾] [#kanal ▾] [Panoyu Kur] · kuruluysa durum satırı + [Şimdi Yenile] [Kaldır].
VIP'teki guild/rol seçici kalıbı (kanal seçici guild seçilince yüklenir).

### 6. Test
`buildEmbed` birim testleri (`node --test`): veri yok · yetersiz kanıt · 7 sahip → sıralama+ilk-5
kesme + >0 filtresi · eski-format son tarama (`ms` anahtarı) + sağlıklı "teşhis" etiketi.
REST çağrıları test edilmez (ağ; mevcut servis kalıbıyla tutarlı).

## Hata yönetimi
- Bot token yok / kanal izni yok → setup panelde net hata (`400` + Türkçe mesaj).
- refresh hataları sessiz loglanır (pano asla tarama kaydını engellemez).
- Rate limit riski yok: tarama en sık 10 dk'da bir (auto) / elle; debounce 2 sn.

## Kapsam dışı
- Discord'dan komutla tarama tetikleme (slash command) — istenirse ayrı iş.
- Birden çok pano/kanal.
