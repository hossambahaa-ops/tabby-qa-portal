import { lazy } from "react";
import { hardRecoverReload } from "./hardReload.js";

// Wraps React.lazy with stale-chunk recovery. After a Cloudflare Pages
// deploy, the open tab is holding an old index.html that references
// hashed chunks that no longer exist. The default lazy() bubbles the
// import failure up to ErrorBoundary, which causes a visible blank
// flash before the reload kicks in.
//
// Strategy:
//   1. Try the import.
//   2. On failure that looks like a stale-chunk error, retry once after
//      a 400 ms delay (covers transient Cloudflare cache-edge misses).
//   3. If the retry also fails AND we haven't reloaded in the last 30 s,
//      stamp sessionStorage and hard-reload. Return a never-resolving
//      promise so the Suspense fallback (the pulse-loader) keeps
//      painting until the browser swaps the document — no error UI
//      ever appears.
//   4. If we already reloaded recently, rethrow so ErrorBoundary's
//      fallback UI handles the truly broken case.
const isStaleChunkError = (err) => {
  const msg = (err?.message || String(err || "")).toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("chunkloaderror") ||
    (msg.includes("loading chunk") && msg.includes("failed"))
  );
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export const lazyWithRetry = (importer) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (err) {
      if (!isStaleChunkError(err)) throw err;
      try {
        await sleep(400);
        return await importer();
      } catch (err2) {
        if (!isStaleChunkError(err2)) throw err2;
        try {
          const last = parseInt(sessionStorage.getItem("__chunk_reload_at") || "0", 10);
          if (Date.now() - last > 30_000) {
            sessionStorage.setItem("__chunk_reload_at", String(Date.now()));
            hardRecoverReload(); // escape a wedged SW, not just reload
            // Pending forever — Suspense keeps showing the spinner
            // until the browser tears down this document.
            return new Promise(() => {});
          }
        } catch { /* sessionStorage unavailable — fall through */ }
        throw err2;
      }
    }
  });

export default lazyWithRetry;
