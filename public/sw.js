/* Service worker — notifications push, actions rapides, secours hors ligne */
const OFFLINE_CACHE = 'agenda-offline-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/**
 * Rien n'est mis en cache à la volée : l'app est un tableau de bord partagé
 * entre quatre appareils, des données périmées y seraient pires qu'une erreur.
 * Le seul rôle de ce gestionnaire est d'afficher une page correcte quand le
 * réseau manque — c'est aussi ce qui rend l'app installable sur Mac et PC.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }
    })());
    return;
  }

  if (new URL(req.url).pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
  }
});

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
