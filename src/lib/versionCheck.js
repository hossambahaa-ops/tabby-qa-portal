// Version-check: detect when Cloudflare Pages has published a newer
// build than what this tab is running, and surface a "Reload now"
// prompt before the user hits a stale-chunk import error.
//
// The running bundle's hash is read from the <script src="/assets/
// index-XXXX.js"> tag the browser inserted at boot. The latest deployed
// hash is read by re-fetching /index.html with no-store. Different
// hashes ⇒ a new deploy is live.
//
// session is preserved automatically — window.location.reload() does
// NOT clear localStorage, and the sb_session row stays put.

const CHECK_INTERVAL_MS = 5 * 60 * 1000;     // poll every 5 min
const FORCE_AFTER_MS    = 60 * 60 * 1000;    // force-reload 1 h after first detection

const currentBundleHash = () => {
  if (typeof document === "undefined") return null;
  const scripts = document.querySelectorAll('script[src*="/assets/"]');
  for (const s of scripts) {
    const m = s.src.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
    if (m) return m[1];
  }
  return null;
};

const fetchLatestBundleHash = async () => {
  try {
    // Append a cache-buster query so intermediate caches can't return
    // a stale index.html.
    const r = await fetch(`/?__v=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

/**
 * startVersionCheck({ onUpdateAvailable, onForce })
 *   onUpdateAvailable({ current, latest, firstDetectedAt }) — called on
 *     each tick where a newer build is available. UI uses this to
 *     show/refresh a banner.
 *   onForce() — called once the FORCE_AFTER_MS grace window elapses.
 *     Default behaviour: window.location.reload(). Override to add UX.
 *
 * Returns a stop() function to clear the interval.
 *
 * No-ops in dev mode (no hashed asset path) or when the running tab
 * was loaded from a non-hashed path.
 */
export const startVersionCheck = ({ onUpdateAvailable, onForce } = {}) => {
  const current = currentBundleHash();
  if (!current) return () => {};

  let firstDetectedAt = null;
  let timer = null;

  const tick = async () => {
    const latest = await fetchLatestBundleHash();
    if (!latest) return;
    if (latest === current) {
      // Build hasn't moved (or the user is already on it). Reset the grace.
      firstDetectedAt = null;
      onUpdateAvailable?.(null);
      return;
    }
    if (!firstDetectedAt) firstDetectedAt = Date.now();
    const elapsed = Date.now() - firstDetectedAt;
    if (elapsed >= FORCE_AFTER_MS) {
      // Force reload. window.location.reload() is a soft reload from the
      // user's POV (no cache wipe); the new index.html will fetch the new
      // chunks. localStorage / sb_session are untouched, so the user
      // stays logged in.
      if (typeof onForce === "function") onForce();
      else window.location.reload();
      return;
    }
    onUpdateAvailable?.({ current, latest, firstDetectedAt, elapsedMs: elapsed });
  };

  // Run once shortly after page load so we catch a deploy that landed
  // while the tab was loading. Then poll on the regular cadence.
  setTimeout(tick, 30 * 1000);
  timer = setInterval(tick, CHECK_INTERVAL_MS);

  return () => { if (timer) clearInterval(timer); };
};
