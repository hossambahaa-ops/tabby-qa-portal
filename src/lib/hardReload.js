// Recovery reload that ESCAPES a wedged service worker.
//
// The stale-chunk recovery used to call window.location.reload(), but a
// plain reload re-runs against the same service worker that is serving a
// stale index.html (or failing chunk fetches). When the worker is wedged
// that loops forever on a blank screen — which is exactly what real users
// (e.g. a supervisor stuck on a blank Dashboard) were hitting.
//
// Here we first unregister every service worker and drop every Cache
// Storage bucket, THEN reload cache-busted, so the browser fetches a fresh
// document and fresh chunks straight from the network. main.jsx registers a
// clean worker again on the next load. Each step is time-boxed so a hung
// unregister can never trap us before the reload fires.

const withTimeout = (p, ms) =>
  Promise.race([Promise.resolve(p).catch(() => {}), new Promise((res) => setTimeout(res, ms))]);

let recovering = false;

export async function hardRecoverReload() {
  if (recovering) return; // don't stack recoveries within one document
  recovering = true;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await withTimeout(navigator.serviceWorker.getRegistrations(), 1200);
      if (Array.isArray(regs) && regs.length) {
        await withTimeout(Promise.all(regs.map((r) => r.unregister().catch(() => {}))), 1500);
      }
    }
  } catch { /* best effort */ }

  try {
    if (typeof caches !== "undefined") {
      const keys = await withTimeout(caches.keys(), 800);
      if (Array.isArray(keys) && keys.length) {
        await withTimeout(Promise.all(keys.map((k) => caches.delete(k).catch(() => {}))), 1200);
      }
    }
  } catch { /* best effort */ }

  try {
    const u = new URL(window.location.href);
    u.searchParams.set("_swr", String(Date.now())); // bust any intermediate document cache
    window.location.replace(u.toString());
  } catch {
    window.location.reload();
  }
}

export default hardRecoverReload;
