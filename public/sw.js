const CACHE_NAME = 'tabby-pulse-v15';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      // Drop EVERY old cache when this SW activates — v3 cached
      // authenticated Supabase responses, which is both a privacy
      // hazard and the cause of indefinite request hangs (SW promise
      // never resolved → page stuck on "Loading your workspace…").
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // CRITICAL: never intercept or cache Supabase requests. Caching
  // authenticated responses leaks data across users, and the previous
  // network-first/cache-fallback could hang indefinitely when the
  // network promise neither resolved nor rejected. Letting the
  // browser handle these directly is the safe default.
  if (url.hostname.includes('supabase')) return;

  // Network-first for HTML / navigation — always get latest index.html
  if (e.request.mode === 'navigate' || e.request.destination === 'document' ||
      url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Stale-while-revalidate for hashed static assets (JS/CSS)
  // Vite adds content hashes to filenames, so new deploys = new URLs
  if (e.request.method === 'GET' && url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(e.request).then((cached) => {
          const fetchPromise = fetch(e.request).then((res) => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
  }
});
