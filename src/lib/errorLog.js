import { sb, SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";

// ═══════════════════════════════════════════════════════════════════
// Runtime error reporter.
// Captures uncaught exceptions, unhandled promise rejections, and React
// ErrorBoundary crashes, and ships them to public.client_errors in
// Supabase. The admin panel surfaces the table for review.
//
// Designed to be dependency-light and to never crash the app itself:
//  • silent if not yet initialized
//  • dedupes identical errors within a short window to avoid loops
//  • bypasses sb.query so a broken auth state can still log
// ═══════════════════════════════════════════════════════════════════

let initialized = false;
let getToken = () => null;
let getUser = () => ({});
const recentHashes = new Map(); // message+stack hash -> ts
const DEDUPE_WINDOW_MS = 10_000;

const hashOf = (message, stack) => {
  const s = `${message || ""}|${(stack || "").slice(0, 200)}`;
  // Lightweight hash — enough to dedupe identical thrown errors.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
};

const shouldSkip = (message, stack) => {
  const h = hashOf(message, stack);
  const now = Date.now();
  const last = recentHashes.get(h);
  if (last && now - last < DEDUPE_WINDOW_MS) return true;
  recentHashes.set(h, now);
  // Cap map size so it doesn't grow forever.
  if (recentHashes.size > 100) {
    const cutoff = now - DEDUPE_WINDOW_MS;
    for (const [k, v] of recentHashes) if (v < cutoff) recentHashes.delete(k);
  }
  return false;
};

const trim = (v, max = 2000) => (v == null ? null : String(v).slice(0, max));

async function shipError({ source, message, stack, context }) {
  if (!message) return;
  if (shouldSkip(message, stack)) return;
  const user = (() => { try { return getUser() || {}; } catch { return {}; } })();
  const token = (() => { try { return getToken(); } catch { return null; } })();

  const body = [{
    user_email: user?.email || null,
    user_role:  user?.role  || null,
    source,
    message: trim(message, 1000),
    stack:   trim(stack, 6000),
    url:     trim(typeof window !== "undefined" ? window.location.href : "", 500),
    user_agent: trim(typeof navigator !== "undefined" ? navigator.userAgent : "", 300),
    context: context || null,
  }];

  // Use raw fetch so we don't depend on sb.query behaviour or any
  // higher-level wrapper that might itself be the thing throwing.
  // Falls back to anon (just apikey) when the user isn't yet logged in
  // so boot-time and OAuth-flow errors still get captured.
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/client_errors`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token || SUPABASE_ANON}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    // 4xx/5xx is interesting — log to console so we know the reporter
    // itself is broken (RLS rejection, schema drift, etc.). Won't throw.
    if (!r.ok) {
      try { console.warn(`[errorLog] insert returned ${r.status}: ${(await r.text()).slice(0, 200)}`); } catch {}
    }
  } catch (e) {
    // Last-resort: never throw from the reporter.
    try { console.warn("[errorLog] network error:", e?.message || e); } catch {}
  }
}

export function initErrorLog({ getToken: gt, getUser: gu } = {}) {
  if (initialized) return;
  initialized = true;
  if (gt) getToken = gt;
  if (gu) getUser = gu;

  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    const err = event?.error;
    shipError({
      source: "window_onerror",
      message: err?.message || event?.message || "unknown error",
      stack: err?.stack,
      context: {
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const message = reason?.message || String(reason || "unhandled promise rejection");
    shipError({
      source: "unhandledrejection",
      message,
      stack: reason?.stack,
    });
  });
}

// Manual API for places that want to opt-in log (e.g. ErrorBoundary)
export function logClientError(payload) {
  shipError(payload);
}
