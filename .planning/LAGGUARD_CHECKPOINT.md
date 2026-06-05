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
- `minecraftService` artık `tps` event'i yayar (gevşek bağlılık; eski `_feedAutoThrottle` korundu)

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

## ⏳ YAPILACAKLAR

### Faz 1 — Komut/gamerule kaldıraçları + AIMD (SIRADAKİ)
- `lag_levers` tablosu (generic, veri-tabanlı): `name, applyMethod(command|gamerule|configReload|configRestart), apply_template, default/min/max/step, priority, enabled, includes_restart`
- Başlangıç kütüphanesi: ⭐`gamerule randomTickSpeed` (en güçlü canlı kaldıraç), Paper'da view/sim-distance, mob cap
- `decision.js` — AIMD: MSPT + Can't keep up + TPS birleşik tetikleyici; lag'de sert kıs, stabilde tek-adım aç; per-lever sweet-spot tavanı
- Güvenlik: **varsayılan "öner/dry-run" modu**, sert alt-sınır, kill-switch, "hepsini default'a sıfırla"
- **Açık sorular (Faz 1 başında karar):** (a) dry-run ile mi başlayalım? (b) başlangıç kütüphanesini ben mi hazırlayayım?

### Faz 2 — Profiler-güdümlü hedefleme + restart-config kuyruğu (toggle'lı)
### Faz 3 — Atıf (shadow log): **FTB Chunks claim sahibi UUID birincil**, Observable opsiyonel
### Faz 4 — Ceza: `lag_offense` + merdiven, muafiyet, mod off/shadow/enforce. Shadow'da bile ban eşiğine gelen oyuncuyu **Discord DM + webhook** ile bildir.

---

## ⚠️ NOTLAR
- Eski `autoThrottle*` WIP dormant referans; Faz 1 sonunda temizlenecek.
- Standing rule: her commit otomatik `main`'e push.
- Tam tasarım planı: `~/.claude/plans/eventual-juggling-raccoon.md`
