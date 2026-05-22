# PWA — Tasarım Dokümanı

**Tarih:** 2026-05-22  
**Durum:** Onaylandı

---

## Özet

KnozySunucu paneline iki PWA özelliği eklenir:

1. **Kurulabilirlik** — `manifest.webmanifest` + `<link rel="manifest">` ile tarayıcı "Ana Ekrana Ekle" prompt'unu etkinleştirir
2. **Push Bildirimleri** — `server_crash` ve `disk_warning` event'lerinde tarayıcı push bildirimi gönderir

---

## Mimari

### Katmanlar

```
Frontend
  client/public/
    manifest.webmanifest        — uygulama adı, ikonlar, display: standalone
    sw.js                       — push event handler + showNotification()
  client/index.html             — <link rel="manifest"> + theme-color meta
  client/src/hooks/
    usePushSubscription.js      — SW kayıt, pushManager.subscribe(), backend POST/DELETE

Backend
  server/services/pushService.js     — VAPID anahtar yönetimi + sendPush()
  server/routes/push.js              — subscribe / unsubscribe / vapid-public-key
  server/db/database.js              — push_subscriptions tablosu
  server/services/notificationService.js  — server_crash / disk_warning → pushService
  server/index.js                    — /api/push route kaydı
```

### Değiştirilen Dosyalar

- `client/index.html` — manifest linki + theme-color meta etiketi
- `client/vite.config.js` — `sw.js` public dosyası için `publicDir` ayarı (zaten public/ destekleniyor)
- `server/db/database.js` — `push_subscriptions` tablo tanımı
- `server/services/notificationService.js` — crash/disk event tetikleyicisine push hook
- `server/index.js` — push route kaydı
- `client/src/pages/SettingsPage.jsx` — "Tarayıcı Bildirimleri" bölümü

---

## Manifest

```json
{
  "name": "Sunucu Paneli",
  "short_name": "KnozyPanel",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0b0d",
  "theme_color": "#0a0b0d",
  "icons": [
    { "src": "/logo.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/logo.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## Service Worker (`sw.js`)

```js
self.addEventListener('push', (event) => {
    const data = event.data?.json() || {};
    event.waitUntil(
        self.registration.showNotification(data.title || 'Sunucu Paneli', {
            body: data.body || '',
            icon: '/logo.png',
            badge: '/logo.png',
            data: { url: data.url || '/' },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

---

## Backend API

### `GET /api/push/vapid-public-key`
- Auth: gerekli
- VAPID public key'i döner (frontend subscribe için gerekli)
- İlk çağrıda anahtar çifti üretilir, `app_settings`'e kaydedilir

### `POST /api/push/subscribe`
- Auth: gerekli
- Body: `{ subscription }` — `PushSubscription` JSON nesnesi
- `push_subscriptions` tablosuna `user_id + endpoint` ile upsert yapar

### `DELETE /api/push/unsubscribe`
- Auth: gerekli
- Body: `{ endpoint }` — silinecek aboneliğin endpoint'i
- `push_subscriptions` tablosundan ilgili kaydı siler

---

## Veritabanı

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    subscription TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Push Servisi (`pushService.js`)

```
getVapidKeys()
  → app_settings'den oku (vapid_public_key / vapid_private_key)
  → yoksa webpush.generateVAPIDKeys() ile üret + kaydet

sendToAllUsers(eventType, payload)
  → push_subscriptions tablosundan tüm kayıtları al
  → her subscription için webpush.sendNotification() çağır
  → geçersiz/süresi dolmuş abonelikler (410 Gone) tablodan silinir
```

---

## Bildirim İçerikleri

| Event | Başlık | Body |
|-------|--------|------|
| `server_crash` | `🔴 Sunucu Çöktü` | `<sunucu adı> beklenmedik şekilde kapandı` |
| `disk_warning` | `⚠️ Disk Uyarısı` | `Disk kullanımı %<değer> seviyesinde` |

---

## `usePushSubscription` Hook Davranışı

```
mount
  → GET /api/push/vapid-public-key
  → navigator.serviceWorker.register('/sw.js')
  → pushManager.getSubscription() ile mevcut aboneliği kontrol et
  → varsa: subscribed = true
  → yoksa: subscribed = false

subscribe()
  → Notification.requestPermission()
  → izin granted: pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  → POST /api/push/subscribe { subscription }
  → subscribed = true

unsubscribe()
  → pushManager.unsubscribe()
  → DELETE /api/push/unsubscribe { endpoint }
  → subscribed = false
```

---

## SettingsPage Entegrasyonu

`SettingsPage.jsx` içine yeni "Tarayıcı Bildirimleri" kartı eklenir:
- `usePushSubscription` hook'u kullanır
- İzin durumunu gösterir (`İzin verilmedi` / `Aktif` / `Pasif`)
- "Etkinleştir" / "Devre Dışı Bırak" butonu
- `Denied` durumunda: "Tarayıcı ayarlarından izin vermeniz gerekiyor" açıklaması

---

## Kapsam Dışı

- Offline caching / Workbox / `vite-plugin-pwa`
- iOS Safari Web Push (ek `apple-touch-icon` ve özel izin akışı gerektirir)
- `update_available` ve `player_join` push bildirimleri
- Push bildirimlerinde aksiyon butonları (Accept/Dismiss)
- Bildirim geçmişi veya okundu/okunmadı takibi
