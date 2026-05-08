// Single helper for calling Supabase edge functions from the front end.
// Replaces ~7 inlined `fetch(${SUPABASE_URL}/functions/v1/...)` blocks
// that each rebuilt the same headers + JSON parsing + error mapping.
//
// callEdgeFunction(slug, opts) — POST to /functions/v1/<slug>
//   token   the user's Supabase session token (Authorization bearer)
//   body    optional JSON body (defaults to {})
//   signal  optional AbortSignal
//
// Returns { ok, status, data, error }. Never throws on HTTP failure;
// callers can branch on `ok` and surface the friendly error to the user.
//
// runSyncs([...slugs], { token }) — sequential edge-function fan-out for
// multi-source refresh buttons. Returns per-slug results so the UI can
// say e.g. "Synced 3/4 — mtd-sync failed (HTTP 500)".

import { SUPABASE_URL, SUPABASE_ANON, sb } from "./supabase.js";

export async function callEdgeFunction(slug, { token, body = {}, signal, headers = {} } = {}) {
  if (!slug) return { ok: false, status: 0, data: null, error: "Missing slug" };
  try {
    // Pull the freshest access token before every call. sb.auth.getSession()
    // silently refreshes when the JWT is within 60s of expiry, which fixes
    // the class of bug where an idle tab past the 1h token TTL hits a 401
    // from the edge function's verifyUser path. Falls back to the caller's
    // passed-in token if getSession fails (offline, no session, etc.).
    let bearer = token;
    try {
      const session = await sb.auth.getSession();
      if (session?.access_token) bearer = session.access_token;
    } catch { /* fall through to passed-in token */ }
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.error) {
      return { ok: false, status: r.status, data, error: data?.error || `HTTP ${r.status}` };
    }
    return { ok: true, status: r.status, data, error: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.message || "Network error" };
  }
}

export async function runSyncs(slugs, { token, signal } = {}) {
  const results = {};
  let okCount = 0, failCount = 0;
  for (const slug of slugs) {
    const r = await callEdgeFunction(slug, { token, signal });
    results[slug] = r;
    if (r.ok) okCount++; else failCount++;
  }
  return { results, okCount, failCount, total: slugs.length };
}
