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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Clear old caches on startup, then register updated SW. When a new
// SW takes control after an update, soft-reload once so the page picks
// up the freshly-deployed bundle without requiring a hard refresh.
if ('serviceWorker' in navigator) {
  caches.keys().then(keys =>
    keys.forEach(k => { if (k !== 'tabby-pulse-v3') caches.delete(k); })
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
