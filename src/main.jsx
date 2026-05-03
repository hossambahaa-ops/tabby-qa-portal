import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Supabase OAuth implicit flow returns tokens in the URL hash:
//   /#access_token=…&refresh_token=…&expires_at=…
// HashRouter boots synchronously and rewrites any hash that doesn't
// match its "#/route" convention, which wipes the tokens before
// handleCallback can read them. Capture + stash the hash here before
// React mounts; handleCallback in supabase.js will pick it up from
// sessionStorage and clear it.
(() => {
  const h = window.location.hash || "";
  if (h.includes("access_token=") && h.includes("refresh_token=")) {
    try { sessionStorage.setItem("sb_oauth_hash", h.replace(/^#/, "")); } catch {}
    // Strip the hash so HashRouter starts clean and tokens don't sit
    // in the URL bar / browser history.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
})();

// Stale-chunk safety net: if a dynamic import fails (because the open
// tab is holding an old index.html that points at a chunk hash that no
// longer exists on the CDN), hard-reload once to pick up the fresh
// index. Guarded against reload loops via sessionStorage.
const isStaleChunkMessage = (m) => {
  const s = String(m || "").toLowerCase();
  return (
    s.includes("failed to fetch dynamically imported module") ||
    s.includes("importing a module script failed") ||
    s.includes("error loading dynamically imported module") ||
    s.includes("chunkloaderror") ||
    (s.includes("loading chunk") && s.includes("failed"))
  );
};
const tryReloadForStaleChunk = () => {
  try {
    const last = parseInt(sessionStorage.getItem("__chunk_reload_at") || "0", 10);
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem("__chunk_reload_at", String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {}
  return false;
};
window.addEventListener("unhandledrejection", (e) => {
  if (isStaleChunkMessage(e.reason?.message || e.reason)) tryReloadForStaleChunk();
});
window.addEventListener("error", (e) => {
  if (isStaleChunkMessage(e.message || e.error?.message)) tryReloadForStaleChunk();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Clear old caches on startup, then register updated SW. When a new
// SW takes control after an update, soft-reload once so the page picks
// up the freshly-deployed bundle without requiring a hard refresh.
if ('serviceWorker' in navigator) {
  // Aggressively clear ALL old caches — v3 cached authenticated
  // Supabase responses which can hang the boot. The new SW (v4) skips
  // Supabase entirely; nuking every legacy cache here too belt-and-
  // braces protects users still holding a stale v3 cache from a
  // previous deploy before the new SW finishes activating.
  caches.keys().then(keys =>
    keys.forEach(k => { if (k !== 'tabby-pulse-v4') caches.delete(k); })
  );

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // Long-lived tabs poll for SW updates every minute
    setInterval(() => { reg.update().catch(() => {}); }, 60_000);
    // Also check on tab focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}
