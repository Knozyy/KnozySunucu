# Dashboard Widget Sistemi — Tasarım Dokümanı

**Tarih:** 2026-05-22  
**Durum:** Onaylandı

---

## Özet

Mevcut DashboardPage'deki tüm kartlar bağımsız widget bileşenlerine dönüştürülür. `react-grid-layout` ile sürükle-bırak ve boyutlandırma desteği eklenir. Her kullanıcının yerleşimi `app_settings` tablosunda saklanır.

---

## Mimari

### Katmanlar
1. **Widget bileşenleri** — her kart bağımsız JSX bileşeni (`CpuKpi`, `ResourceChart` vb.)
2. **`WidgetWrapper`** — edit modunda drag handle + delete overlay sağlar
3. **`WidgetGrid`** — `react-grid-layout` ile grid container, layout state yönetimi
4. **`useWidgetLayout` hook** — backend'den yükle, debounce ile kaydet
5. **Backend route** — `app_settings` tablosuna `dashboard_layout_<userId>` key ile JSON yaz/oku

### Dosya Yapısı

```
client/src/components/Dashboard/
  ├── widgets/
  │   ├── CpuKpi.jsx             — CPU % KPI + sparkline
  │   ├── RamKpi.jsx             — RAM GB/max KPI + sparkline
  │   ├── PlayersKpi.jsx         — Online oyuncu sayısı KPI
  │   ├── StatusKpi.jsx          — Sunucu durumu pill KPI
  │   ├── UptimeKpi.jsx          — Uptime süresi KPI
  │   ├── ProfileKpi.jsx         — Aktif profil adı KPI
  │   ├── ResourceChart.jsx      — CPU/RAM 60s dual-line chart
  │   ├── ServerInfoWidget.jsx   — Sunucu KV detay listesi
  │   ├── OnlinePlayersWidget.jsx— Online oyuncu listesi
  │   ├── ActiveProfileWidget.jsx— Profil detayı + heap bar
  │   └── QuickActionsWidget.jsx — Başlat/Durdur/Yeniden butonları
  ├── WidgetWrapper.jsx          — edit modu overlay (drag + delete)
  ├── WidgetGrid.jsx             — react-grid-layout container
  ├── defaultLayout.js           — varsayılan 12-kolon yerleşim
  └── useWidgetLayout.js         — load/save/reset hook
```

**Değiştirilen dosyalar:**
- `client/src/pages/DashboardPage.jsx` — widget sistemi ile yeniden yazılır
- `client/package.json` — `react-grid-layout` bağımlılığı
- `server/app.js` — yeni `/api/dashboard` route kaydı
- `server/routes/dashboard.js` — YENİ: layout GET/PUT endpoint'leri

---

## Widget Tipleri

| Widget ID | Bileşen | Varsayılan boyut (w×h) | Grid konumu |
|-----------|---------|----------------------|-------------|
| `cpu-kpi` | `CpuKpi` | 2×2 | x:0, y:0 |
| `ram-kpi` | `RamKpi` | 2×2 | x:2, y:0 |
| `players-kpi` | `PlayersKpi` | 2×2 | x:4, y:0 |
| `status-kpi` | `StatusKpi` | 2×2 | x:6, y:0 |
| `uptime-kpi` | `UptimeKpi` | 2×2 | x:8, y:0 |
| `profile-kpi` | `ProfileKpi` | 2×2 | x:10, y:0 |
| `resource-chart` | `ResourceChart` | 8×4 | x:0, y:2 |
| `server-info` | `ServerInfoWidget` | 4×4 | x:8, y:2 |
| `online-players` | `OnlinePlayersWidget` | 4×4 | x:0, y:6 |
| `active-profile` | `ActiveProfileWidget` | 4×4 | x:4, y:6 |
| `quick-actions` | `QuickActionsWidget` | 4×3 | x:8, y:6 |

Grid: 12 kolon, `rowHeight: 80px`, `margin: [12, 12]`

---

## Edit Modu

- Dashboard header'ında "Düzeni Düzenle" butonu
- Edit modunda: her widget'ta drag handle (sol üst) + "×" silme butonu görünür
- Silinen widget "Gizli Widgetlar" listesine taşınır, tekrar eklenebilir
- "Kaydet" → layout backend'e yazılır → edit modundan çıkılır
- "İptal" → layout değişiklikleri geri alınır (orijinal layout restore edilir)
- "Sıfırla" → `defaultLayout.js`'teki varsayılan yerleşime dön

---

## Backend API

### `GET /api/dashboard/layout`
- Auth: gerekli
- `app_settings` tablosundan `dashboard_layout_<userId>` key'ini okur
- Kayıt yoksa `{ layout: null }` döner (frontend default layout'u kullanır)

### `PUT /api/dashboard/layout`
- Auth: gerekli
- Body: `{ layout: [...] }` — react-grid-layout item dizisi
- `app_settings` tablosuna `dashboard_layout_<userId>` key ile JSON string kaydeder

---

## `useWidgetLayout` Hook Davranışı

```
mount → GET /api/dashboard/layout
  ├── data geldi → layout state'i set et
  └── null geldi → defaultLayout kullan

layout değişince (edit modunda):
  → debounce 500ms → PUT /api/dashboard/layout

edit modu kapatılınca (İptal):
  → savedLayout state'e geri dön (backend'e yazmadan)
```

---

## Kapsam Dışı

- Widget ekle / widget kütüphanesi (ilk sürümde sadece gizle/göster)
- Renk/tema özelleştirmesi
- Widget başlık düzenleme
- Farklı sunucular için ayrı layout
