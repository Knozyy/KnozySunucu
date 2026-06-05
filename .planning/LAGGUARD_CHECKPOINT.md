# LagGuard — Durum Checkpoint'i

**Son güncelleme:** 2026-06-05
**Amaç:** Modlu MC sunucusunda lag yönetimi — (1) adaptif throttle (lag'de kıs, stabilde kademeli aç = AIMD), (2) lag atıfı + kademeli ban. Modüler + çok-modpack uyumlu + panel sekmesi.

---

## ✅ YAPILANLAR

### Faz 0 — Görünürlük (TAMAMLANDI, çalışıyor)
Modüler `server/services/lagGuard/` altyapısı kuruldu (yalnızca izleme, aksiyon yok):
- `metrics.js` — minecraftService `tps`/`lag` event'lerini dinler, ring buffer + `lag_samples` tablosuna 30sn snapshot
- `observable.js` — `observable run N` tetikleyip sonuç URL'sini yakalar (probe)
- `index.js` — orkestratör + ayarlar (`app_settings.lagguard_*`)
- `routes/lagGuard.js` — `/api/lag-guard/{status,metrics,settings,observable/run}`
- `client/src/pages/LagGuardPage.jsx` — canlı TPS/MSPT grafiği, Can't Keep Up sayacı, Observable butonu, TPS kaynağı göstergesi
- DB: `lag_samples` tablosu; NAV + Cmd+K girişi
- `minecraftService` artık `tps` event'i yayar (gevşek bağlılık)

### Konsol & TPS bug fix'leri (TAMAMLANDI, doğrulandı)
- `server/utils/text.js` — `cleanConsoleLine`/`stripAnsi`: "[m> [K" terminal kodlarını + screen prompt artıklarını temizler. `wsRouter` (gösterim) + `minecraftService._parseLine` (parse) kullanıyor.
- **Adaptif TPS komut tespiti**: kör `tps`+`forge tps` yerine aday listesini (`forge tps, neoforge tps, tick query, tps, spark tps`) dener, çalışanı kilitler, "Unknown command" döneni öğrenir. `app_settings.lagguard_tpsCommands` ile override. Her başlangıçta yeniden tespit.
- TPS poll **gerçekten 30sn**'de bir (eski `loopCount>=6` hatası her 5sn gönderiyordu → modulo ile düzeltildi).

### Commit'ler (hepsi main'e push'lu)
- `2d39e1f` Faz 0 LagGuard
- `d0917dd` ANSI temizlik + adaptif TPS
- (+ bu checkpoint + 30sn fix)

---

## 🔎 SUNUCU GERÇEKLERİ (test ortamından)
- **Komut seti vanilla 1.20.3+/1.21** (`/tick query` çalışıyor → TPS kaynağı bu). `tps` ve `forge tps` YOK.
- Modlu **Skyblock** paketi (`de.me.sk.SkyblockBuilder`, "Chaos Guardian" boss vb.), **FTB Chunks** var.
- Observable kurulu, profil verisini **observable.tas.sh'e upload** ediyor (SPA, düz JSON değil).
- Gözlemlenen lag: ~11/20 oyuncu, **MSPT 56-61ms** (hedef 50ms), sık "Can't keep up" → gerçek ~16-17 TPS. Yani sistem gerçek bir lag senaryosunda test edilecek.

---

### Faz 1 — Komut/gamerule kaldıraçları + AIMD (TAMAMLANDI ✅, sunucuda test bekliyor)
- DB: `lag_levers` (generic veri-tabanlı kaldıraç) + `lag_lever_history`
- `levers/registry.js` — CRUD + başlangıç kütüphanesi: ⭐`random_tick_speed` (gamerule, def 3→min 0), `max_entity_cramming`, `mob_spawning` (acil, kapalı)
- `levers/appliers.js` — gamerule/command (canlı) + config_reload/config_restart (configParser yeniden kullanıldı, restart toggle-gated)
- `decision.js` — AIMD: MSPT + Can't keep up birleşik tetikleyici; lag'de sert kıs (kritikte 2×), stabilde tek-adım aç; **sweet-spot tavanı** (lag_ceiling: lag yapan değeri aşma)
- Modlar: **off / dryrun (öner) / auto** — varsayılan off, dryrun güvenli test
- Route: mode, levers CRUD, seed, reset, history
- Panel: mod seçici + Genel/Kaldıraçlar/Log sekmeleri + kaldıraç ekle-düzenle modal + canlı karar logu
- **Config gezgini** (`configExplorer.js` + `/config/files`,`/config/read`): config kaldıracı eklerken mevcut mod config dosyalarını listeler, parse edip sayısal anahtarları+güncel değerleri gösterir; tıklayınca kaldıraç alanları otomatik dolar
- **YÖN-BAĞIMSIZ model** (önemli): min/max yerine `default_value` (normal) + `relief_value` (lag'de gidilecek). Yön otomatik: relief<default→lag'de AZALT (randomTickSpeed), relief>default→lag'de ARTIR (ör. pipez tick gecikmesi). decision.js her iki yönde de throttle/recover + sweet-spot yapıyor. DB migration: eski min_value/step_down → relief_value/step backfill.
- **Toplu ekleme**: config gezgininde çoklu seçim (checkbox) → "Lag'de AZALT/ARTIR %X" → tek tıkla N kaldıraç (`/levers/bulk`). Pipez gibi onlarca anahtarı hızlı ekler.
- **Test adımı:** sunucuda mod=dryrun yap, lag'de "öner" loglarını izle; mantık doğruysa auto'ya al.

### Temizlik & UI tamamlama (TAMAMLANDI ✅)
- **AutoThrottle tamamen söküldü** (planlı temizlik): `services/autoThrottle.js`, `routes/autoThrottle.js`, `pages/AutoThrottlePage.jsx` silindi; `minecraftService` (`_feedAutoThrottle`/`feedCantKeepUp` çağrıları), `server/index.js` (require/attach/route), `App.jsx`, `Sidebar.jsx`, `database.js` (`throttle_*` tabloları) temizlendi. LagGuard tek sistem.
- **Sidebar'a Lag-Guard girişi** eklendi (eski Auto-Throttle navının yerine; LagGuard sayfası route'luydu ama menüde yoktu).
- **LagGuard Ayarlar sekmesi** eklendi: `allowRestartLevers` toggle (config_restart kaldıraçları için kritik) + MSPT/TPS eşikleri + zamanlama alanları (`/settings` GET/PUT'a bağlı).
- **History filtre + CSV export**: aksiyon filtresi (kıs/aç/sıfırla) + kaldıraç arama + BOM'lu UTF-8 CSV indirme.

### Faz 2 — Restart-config kuyruğu + etki-güdümlü hedefleme (TAMAMLANDI ✅, sunucuda test bekliyor)
- **Restart-config kuyruğu** (toggle'lı): `config_restart` kaldıraçları canlı AIMD döngüsünden
  ayrıldı; karar motoru istenen restart-sonrası değeri `lag_restart_queue`'ya yazar
  (lag→relief, stabil→default; lever başına tek pending, upsert). Panel Ayarlar sekmesinde
  kuyruk kartı + "Uygula" (config'e yaz) / "Uygula + Restart" / "Temizle" / satır-iptal +
  sekmede bekleyen-sayısı rozeti. `allowRestartLevers` ile gated.
- **Etki-güdümlü ("profiler") hedefleme**: Observable SPA-only olduğundan ölçülen etkiye
  geçildi — her throttle'dan ~1 tick sonra MSPT farkı `effect_score`'a EMA ile işlenir
  (lag_levers.effect_score/effect_samples). Throttle adayları önce etkiye, sonra priority'ye
  göre sıralanır; veri birikene kadar effect=0 → eski priority davranışıyla bire bir aynı.
  Panelde kaldıraç başına "etki ~X.Xms/adım" rozeti.

## ⏳ YAPILACAKLAR

### Faz 3 — Atıf (shadow log): **FTB Chunks claim sahibi UUID birincil**, Observable opsiyonel
### Faz 4 — Ceza: `lag_offense` + merdiven, muafiyet, mod off/shadow/enforce. Shadow'da bile ban eşiğine gelen oyuncuyu **Discord DM + webhook** ile bildir.
  - **KARAR (kullanıcı):** ceza felsefesi = **shadow + manuel onay** (sistem kick/ban ÖNERİR, admin panelden onaylar). Tam otomatik ban YOK.

---

## ⚠️ NOTLAR
- ~~Eski `autoThrottle*` WIP dormant referans; Faz 1 sonunda temizlenecek.~~ → TEMİZLENDİ ✅
- Standing rule: her commit otomatik `main`'e push.
- Tam tasarım planı: `~/.claude/plans/eventual-juggling-raccoon.md`
