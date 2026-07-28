// Tombstone service worker (2026-07-28). The service worker was retired — it
// caused chronic stale-chunk crashes and wedged-recovery loops. This file no
// longer caches or intercepts anything; it exists only so that browsers which
// still have an OLD worker registered will update to this one, which then
// deletes all caches and unregisters itself. After that, no worker controls the
// page and the browser fetches everything directly from the network (Cloudflare
// serves hashed assets as immutable, so caching is unaffected).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_e) { /* ignore */ }
    try {
      await self.registration.unregister();
    } catch (_e) { /* ignore */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) c.navigate(c.url);
    } catch (_e) { /* ignore */ }
  })());
});

// No fetch handler on purpose — the browser handles all requests directly.
