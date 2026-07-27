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

import { SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";

const withTimeout = (p, ms) =>
  Promise.race([Promise.resolve(p).catch(() => {}), new Promise((res) => setTimeout(res, ms))]);

// Record that we had to nuke the service worker to recover. Chunk-load errors
// are filtered out of the normal error reporter (they usually auto-recover),
// so a hard recovery — the persistent, user-visible-blank-screen case — would
// otherwise be invisible. keepalive lets the POST outlive the reload we're
// about to trigger. Best-effort; never blocks or throws.
function logRecovery(reason) {
  try {
    fetch(`${SUPABASE_URL}/rest/v1/client_errors`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([{
        source: "sw_hard_recover",
        message: String(reason || "stale-chunk hard recovery (SW unregistered)").slice(0, 1000),
        url: (typeof location !== "undefined" ? location.href : "").slice(0, 500),
        user_agent: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 300),
      }]),
    }).catch(() => {});
  } catch { /* never throw from recovery */ }
}

let recovering = false;

export async function hardRecoverReload(reason) {
  if (recovering) return; // don't stack recoveries within one document
  recovering = true;
  logRecovery(reason);

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
