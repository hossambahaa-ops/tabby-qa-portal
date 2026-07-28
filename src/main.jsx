import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { hardRecoverReload } from './lib/hardReload.js';

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
const tryReloadForStaleChunk = (reason) => {
  try {
    const last = parseInt(sessionStorage.getItem("__chunk_reload_at") || "0", 10);
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem("__chunk_reload_at", String(Date.now()));
      hardRecoverReload(reason); // unregister wedged SW + clear caches, then reload
      return true;
    }
  } catch {}
  return false;
};
window.addEventListener("unhandledrejection", (e) => {
  const m = e.reason?.message || e.reason;
  if (isStaleChunkMessage(m)) tryReloadForStaleChunk(m);
});
window.addEventListener("error", (e) => {
  const m = e.message || e.error?.message;
  if (isStaleChunkMessage(m)) tryReloadForStaleChunk(m);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker RETIRED (2026-07-28). It was the source of chronic stale-chunk
// crashes and wedged-recovery loops: it intermittently failed to fetch chunks
// that exist on the server, and the recovery couldn't always break the loop.
// Cloudflare serves hashed assets as `immutable` (browser caches them for a
// year) and index.html as `no-store`, so the SW added risk with zero benefit
// (no push/offline features depend on it). We no longer register a worker; on
// every load we actively unregister any leftover one and drop its caches, so
// existing installs self-heal to clean, direct network fetches.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => { for (const r of regs) r.unregister().catch(() => {}); })
    .catch(() => {});
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => { for (const k of keys) caches.delete(k).catch(() => {}); }).catch(() => {});
  }
}
