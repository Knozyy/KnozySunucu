# Adil Lag Atıfı — "Savunulabilir Kanıt" Modeli — Tasarım

**Tarih:** 2026-06-09
**Durum:** ✅ Tasarım onaylandı — uygulamaya hazır (plan bekliyor).
**Bağlam:** Mevcut atıf sistemi (LagGuard Faz 3, `attribution/probe.js`) adaletsiz sonuç üretiyor.
Kullanıcının doğruladığı belirtiler: (1) oranlar suçsuzu suçluyor, (2) ardışık taramalar tutarsız,
(3) claim sahibi ≠ suçlu. Kullanım amacı: **admin görünürlüğü + ileride Faz 4 ceza önerisi temeli**
→ en muhafazakâr, "mahkemede savunulabilir" standart.

## Sorunun kökü (mevcut algoritma)

1. **Görece yüzde:** `pct = 100 × sahipMaliyeti / ölçülenToplam` — yüzdeler her zaman 100'e
   tamamlanır. Sunucu tamamen sağlıklıyken (tick 5ms) bile biri "%60 lag" görünür.
2. **Tek tarama damgalar:** 20sn'lik tek Observable profili shadow log'a kalıcı yazılır;
   geçici durum (mob döngüsü, gezici canlılar) oyuncuyu işaretler.
3. **Claim sahibi = suçlu varsayımı:** Gezici canlılar, başkasının mobları, wild kıyısı —
   hepsi koordinattaki claim sahibine yazılır; makine/canlı ayrımı yok.
4. **Sahte MSPT:** `metrics._onTps`: gerçek MSPT yokken "TPS ≥ 20 → MSPT = 50ms" varsayımı —
   sağlıklı sunucu (10ms) panelde "sınırda" görünür. Lag kapısı MSPT'ye dayanacağı için
   bu varsayım haksız suçlamayı tetikleyebilir.

## Karar: Yaklaşım A — Bütçe-bazlı + tekrarlanan kanıt

Ölçüm (Observable + ftbChunks + `lag_attribution` tablosu) **kalır**; değişen şey matematik,
birikim katmanı ve sunum. (Elenen alternatifler: B = spark'a geçiş — adaletsizliği çözmez,
ölçüm yükseltmesi olarak ileride; C = profiler'sız sayım — sayı ≠ maliyet, daha adaletsiz.)

### 1. Yeni atıf matematiği — `attribution/probe.js · attributeProfile` (değişir)

Sahip başına çıktı (evidence JSON `v: 2`):
```js
{ owner, blockMs, entityMs, totalMs, budgetPct }   // budgetPct = totalMs / 50 × 100
```
- `blockMs` = blok-entity'ler (makineler; sabit → claim sahibinin malı = **güçlü kanıt**).
- `entityMs` = canlılar (gezinebilir, başkasının olabilir = **zayıf kanıt**) — ayrı tutulur/gösterilir.
- **Wild (claimsiz)** ayrı satır; hiçbir oyuncuya yazılmaz, işaretlenemez.
- "Toplamın %X'i" başlık metriği kalkar (ham hotspot verisi evidence'ta kalır — teşhis için).
- `top` (en pahalı hotspot'lar) ve `types` (tür kırılımı) aynen kalır; satırlarda ms + budgetPct.

### 2. Kanıt birikimi — YENİ modül `attribution/evidence.js` (saf · TDD)

Tek tarama asla suçlamaz:
- **Lag kapısı:** yalnızca `mspt_at ≥ msptWarn` (52) anında alınan taramalar suçlama kanıtıdır
  ("lag-taraması"). Sağlıklı sunucudaki manuel tarama = sadece teşhis; pencereye girmez,
  işaretleyemez.
- **Pencere:** son `attribWindowScans` (varsayılan **6**) **lag-taraması** (v2). 3'ten az
  lag-taraması varsa kimse işaretlenmez ("yetersiz kanıt").
- **Eksik tarama = 0:** sahip bir taramada görünmüyorsa o tarama için maliyeti 0 sayılır
  (medyan doğal sönümler).
- **İşaretleme şartı (ikisi birden):** medyan `totalMs ≥ attribFlagMs` (**5ms**) VE son N
  lag-taramasının **≥ `attribMinScans`** (**3**) tanesinde eşik üstü.
- **Güven etiketi:** 5-6/6 = yüksek · 3-4/6 = orta; çıktıda "5/6 taramada · medyan 14ms".
- Saf fonksiyon: `summarize(scans, settings) → { flagged[], wild, diagnostic[], gateInfo }`.

### 3. MSPT dürüstlüğü — `metrics.js` (küçük düzeltme)

- "TPS ≥ 20 → MSPT = 50" varsayımı kalkar → gerçek MSPT yoksa **null (bilinmiyor)**.
- TPS < 20 → `1000/TPS` türetmesi kalır (tick-bound sunucuda matematiksel olarak doğru).
- MSPT null iken seviye TPS eşikleri + Can't-keep-up'tan belirlenir (lagGuard/index.js'te
  TPS fallback'i zaten var; doğrulanıp gerekirse tamamlanır).

### 4. Panel — LagGuardPage "Atıf" sekmesi

- En üste **"Tekrarlanan Yük"** kartı (`GET /attribution/evidence`):
  - İşaretli sahipler: medyan ms + bütçe% + makine/canlı kırılımı + kanıt sayısı + güven.
  - Kimse işaretli değilse: "Tekrarlanan yük tespit edilmedi".
  - Wild ayrı satır + "kimseye yazılmaz" notu.
- Tarama geçmişi (shadow log) kalır; sahip satırları `ms + bütçe%` gösterir (görece % değil).

### 5. API + ayarlar

- YENİ: `GET /lag-guard/attribution/evidence` (auth) → `evidence.summarize` çıktısı.
- Mevcut `POST /attribution/scan`, `GET /attribution`, `DELETE /attribution` aynen.
- `DEFAULTS`'a 3 ayar: `attribFlagMs: 5`, `attribMinScans: 3`, `attribWindowScans: 6`
  (Ayarlar sekmesine girdi alanları).
- **Geriye uyumluluk:** evidence JSON'una `v: 2`; birikim modülü yalnızca v2 kayıtları
  kullanır, eski kayıtlar geçmiş listesinde görünmeye devam eder.

### 6. Test

- `evidence.js` — TDD: medyan hesabı, eksik tarama = 0, lag kapısı (sağlıklı tarama suçlamaz),
  3/6 kuralı, güven etiketi, v2 filtresi, boş pencere.
- `attributeProfile` — saf fonksiyon testi: blok/canlı ayrımı, wild ayrımı, budgetPct,
  v2 şekli.
- `metrics._onTps` — MSPT fallback: TPS ≥ 20 + mspt yok → null; TPS < 20 → türetilmiş.

## Dosya değişiklikleri (özet)

| Dosya | Değişiklik |
|---|---|
| `server/services/lagGuard/attribution/probe.js` | attributeProfile: blockMs/entityMs/budgetPct, v2 |
| `server/services/lagGuard/attribution/evidence.js` | YENİ — birikim/işaretleme (saf) |
| `server/services/lagGuard/attribution/evidence.test.js` | YENİ — TDD |
| `server/services/lagGuard/metrics.js` | MSPT=50 varsayımı kalkar |
| `server/services/lagGuard/index.js` | DEFAULTS +3 ayar; MSPT-null seviye fallback doğrulama |
| `server/routes/lagGuard.js` | GET /attribution/evidence |
| `client/src/pages/LagGuardPage.jsx` | "Tekrarlanan Yük" kartı; tarama satırları ms+bütçe% |

## Kapsam dışı

- Faz 4 ceza önerisi/uygulaması (bu tasarım onun kanıt temelini hazırlar).
- Spark entegrasyonu (ileride ölçüm yükseltmesi).
- TPS komut tespiti değişikliği (adaptif sistem çalışıyor; dokunulmaz).
