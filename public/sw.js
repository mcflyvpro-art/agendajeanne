/* Service worker — notifications push + actions rapides */
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Agenda Jeanne', body: '', url: '/' };
  try { data = { ...data, ...event.data.json() }; } catch { data.body = event.data ? event.data.text() : ''; }

  const actions = [];
  if (data.kind === 'start' || data.kind === 'nudge' || data.kind === 'before') {
    actions.push({ action: 'open', title: 'Je commence' });
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || data.kind || 'agenda',
      renotify: true,
      requireInteraction: data.kind === 'start' || data.kind === 'nudge',
      data: { url: data.url || '/' },
      actions,
      vibrate: [90, 50, 90],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
