// client/public/sw.js
// Minimal service worker — sadece push bildirimleri işler

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data?.json() || {}; } catch { data = {}; }

    event.waitUntil(
        self.registration.showNotification(data.title || 'Sunucu Paneli', {
            body:  data.body  || '',
            icon:  '/logo.png',
            badge: '/logo.png',
            data:  { url: data.url || '/' },
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(event.notification.data?.url || '/');
        })
    );
});
