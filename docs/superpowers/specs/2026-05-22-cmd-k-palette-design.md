# CMD+K Komut Paleti — Tasarım Dokümanı

**Tarih:** 2026-05-22  
**Durum:** Onaylandı  

---

## Özet

Panelin herhangi bir sayfasından `Ctrl+K` / `Cmd+K` ile tetiklenen global bir komut paleti. Sayfa navigasyonu, sunucu eylemleri, oyuncu arama ve dosya erişimini tek arayüzde birleştirir.

---

## Mimari

### Rendering Stratejisi
- `App.jsx` seviyesinde `<CommandPalette />` render edilir
- React Portal kullanılarak `document.body`'e bağlanır → hangi sayfada olursa olsun çalışır
- Global `keydown` listener `useEffect` ile `window`'a bağlanır, unmount'ta temizlenir

### Dosya Yapısı

```
client/src/components/CommandPalette/
  ├── CommandPalette.jsx      — ana modal (overlay + input + sonuç listesi)
  ├── CommandItem.jsx         — tek sonuç satırı bileşeni
  ├── commandRegistry.js      — statik sayfa + eylem tanımları
  └── useCommandPalette.js    — state yönetimi + klavye navigasyonu hook'u
```

**Değiştirilen dosyalar:**
- `client/src/App.jsx` — palette render + global Ctrl+K listener
- `package.json` — `fuse.js` bağımlılığı

---

## Veri Kaynakları

| Kategori | Kaynak | Davranış |
|----------|--------|----------|
| Sayfalar | `commandRegistry.js` statik liste | Anlık, API yok |
| Sunucu Eylemleri | `commandRegistry.js` statik + API call | Seç → confirm → `api.post(...)` |
| Oyuncular | `GET /api/players` | Yazarken debounce 300ms, live arama |
| Dosyalar | Yaygın config dosyaları statik + `GET /api/files` | Statik önce göster, sonra dynamic |

### Arama Algoritması
**Fuse.js** (fuzzy search) — typo toleranslı arama. "consle" yazınca "Console" bulur.  
Config: `threshold: 0.4`, `keys: ['label', 'description']`

---

## UI / Etkileşim

### Görünüm
- Yarı-saydam backdrop: `rgba(0,0,0,0.6)` — tıklanınca kapanır
- Merkezi panel: `max-width: 600px`, `max-height: 480px`, overflow scroll
- Renk: `A.panel` arka plan, `box-shadow: 0 24px 64px rgba(0,0,0,0.6)`
- Arama inputu her zaman focus'lu (açılınca `autoFocus`)

### Sonuç Satırı Yapısı
```
[İkon]  Başlık                              [Kategori etiketi]
        Alt açıklama (opsiyonel, dim renk)
```

### Klavye Kısayolları
| Tuş | Eylem |
|-----|-------|
| `Ctrl+K` / `Cmd+K` | Paleti aç/kapat |
| `↑` `↓` | Sonuçlar arası gezin |
| `Enter` | Seçili öğeyi çalıştır |
| `Esc` | Paleti kapat |

### Tehlikeli Eylem Koruması
Sunucu restart/stop gibi eylemlerde seçim sonrası inline confirm adımı gösterilir:
```
⚠ Sunucuyu yeniden başlatmak istediğine emin misin?
  [Evet, Yeniden Başlat]  [İptal]
```

---

## Entegrasyon

- **Sayfa geçişi:** `react-router-dom` `useNavigate`
- **Oyuncu arama:** Mevcut `/api/players?search=` endpoint
- **Sunucu eylemleri:** Mevcut `/api/system/restart`, `/api/backup/create` vb.
- **Dosya erişimi:** Mevcut `/api/files` endpoint

---

## Kapsam Dışı

- Özel kısayol tanımlama (kullanıcı tarafından)
- Komut geçmişi / son kullanılanlar (ilk sürümde yok)
- Offline mod
