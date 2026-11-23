// Alex Training Lab — avisos push de mensajes
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Sin caché: las peticiones van siempre a la red. El manejador existe para que el navegador ofrezca instalar la app.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request));
});


self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Alex Training Lab', {
    body: d.body || 'Tienes un mensaje nuevo',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'mensaje',
    renotify: true,
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    for (const c of lista) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        if ('navigate' in c) c.navigate(url);
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
