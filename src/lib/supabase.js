export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Canonical production URL. Used as the OAuth redirect target so that
// even if someone loads the app at a stale / mirror domain (e.g. a
// preview build or a bookmark to an old host), the sign-in flow always
// lands them on the supported domain and Google sees a redirect_uri
// that matches the Cloud Console allow-list.
// Overridable via VITE_APP_URL for preview/staging builds; dev defaults
// to window.location.origin so localhost still works.
const _envAppUrl = import.meta.env.VITE_APP_URL;
export const CANONICAL_APP_URL =
  _envAppUrl && _envAppUrl.trim()
    ? _envAppUrl.trim().replace(/\/+$/, "")
    : (typeof window !== "undefined" && /^(localhost|127\.|\[::1\])/.test(window.location.hostname)
        ? window.location.origin
        : "https://tabby-qa-portal.pages.dev");

if (!SUPABASE_URL) {
  console.error("Missing VITE_SUPABASE_URL — check your .env file");
}
if (!SUPABASE_ANON) {
  console.error("Missing VITE_SUPABASE_ANON_KEY — check your .env file");
}
// Read a PostgREST response body without assuming there IS one.
//
// Read the `exp` claim out of a JWT without verifying it.
//
// Only ever used to decide WHEN to refresh — the server stays the sole
// authority on whether a token is actually valid, so an unverified read is
// safe here. It exists because the OAuth callback hash doesn't reliably carry
// `expires_at`, and the token itself always knows when it dies.
function jwtExp(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return 0;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return Number(JSON.parse(json).exp) || 0;
  } catch { return 0; }
}

// A write sent with `Prefer: return=minimal` comes back with an EMPTY body —
// and, for a POST, with status 201, not 204. The old code only special-cased
// 204 and then called r.json() regardless, so every minimal write blew up on
// `JSON.parse("")` with "Unexpected end of JSON input". That is what a lead
// saw when dismissing an AP/PIP: the row was written correctly, the toast
// reported failure, and the entry stayed on screen so they retried.
// Applies to any minimal-write caller (dismissals, VMV nominations, feature
// releases), not just this one.
async function readBody(res) {
  if (res.status === 204 || res.status === 205) return [];
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

export const sb = {
  headers: (token) => ({ apikey: SUPABASE_ANON, Authorization: `Bearer ${token || SUPABASE_ANON}`, "Content-Type": "application/json", Prefer: "return=representation" }),
  async query(table, { select = "*", filters = "", token, method = "GET", body, headers: extra } = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters ? "&" + filters : ""}`;
    const opts = { method, headers: { ...this.headers(token), ...extra } };
    if (body) opts.body = JSON.stringify(body);
    // Network-level retry: the first request after a keep-alive socket idles
    // out can fail with a "Failed to fetch" TypeError (a cold-connection blip,
    // common on flaky / proxied networks). Retry idempotent reads once on a
    // freshly opened connection before surfacing the error — otherwise a
    // single blip during a page's initial fetch burst silently blanks a whole
    // view (e.g. attendance showing "0 team members" when the roster fetch
    // caught the blip and returned []). Non-GET is not retried (avoid any
    // chance of a double write).
    let r;
    try {
      r = await fetch(url, opts);
    } catch (netErr) {
      if (method !== "GET") throw netErr;
      await new Promise(res => setTimeout(res, 300));
      r = await fetch(url, opts);
    }
    // Auto-refresh on 401 (JWT expired) and retry once
    if (r.status === 401) {
      const session = await sb.auth.getSession();
      if (session?.access_token && session.access_token !== token) {
        // Update stored session and retry with new token
        const retryOpts = { method, headers: { ...this.headers(session.access_token), ...extra } };
        if (body) retryOpts.body = JSON.stringify(body);
        const r2 = await fetch(url, retryOpts);
        if (!r2.ok) { const e = await r2.json().catch(() => ({})); throw new Error(e.message || e.details || r2.statusText); }
        // Notify app to update token
        window.dispatchEvent(new CustomEvent("session-refreshed", { detail: session }));
        return readBody(r2);
      }
      // We got a 401 and getSession() couldn't produce a different token, so
      // this session is dead and retrying will never fix it. Tear it down and
      // tell the app, rather than leaving the user on a shell that renders "—"
      // in every field while background pollers re-fail every few minutes.
      try { localStorage.removeItem("sb_session"); } catch {}
      window.dispatchEvent(new CustomEvent("session-expired"));
      throw new Error("Session expired. Please sign in again.");
    }
    if (!r.ok) { const e = await r.json().catch(() => ({})); const err = new Error(e.message || e.details || r.statusText); window.dispatchEvent(new CustomEvent("sb-error", { detail: { table, method, error: err.message } })); throw err; }
    return readBody(r);
  },
  async rpc(fn, params, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: this.headers(token), body: JSON.stringify(params) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  },
  auth: {
    async getSession() {
      const s = localStorage.getItem("sb_session");
      if (!s) return null;
      try {
        const p = JSON.parse(s);
        // Fall back to the token's own `exp` when the stored session has no
        // usable expires_at. This guard used to be `if (p.expires_at && ...)`,
        // so a session stored with expires_at: 0 -- which happens whenever the
        // OAuth callback hash omits the field -- was never eligible for
        // refresh. The dead token then got replayed on every poll: one QA sat
        // on the same expired JWT for 19 hours and 69 straight 401s, seeing a
        // dashboard where every field rendered "—".
        //
        // No expiry we can read at all means we can't reason about the token,
        // so try to refresh rather than trust it; refresh() clears the session
        // if the refresh token is dead too.
        const exp = Number(p.expires_at) || jwtExp(p.access_token);
        if (!exp || Date.now()/1000 > exp - 60) return sb.auth.refresh(p.refresh_token);
        return p;
      } catch { localStorage.removeItem("sb_session"); return null; }
    },
    async refresh(rt) { try { const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method:"POST", headers:{apikey:SUPABASE_ANON,"Content-Type":"application/json"}, body:JSON.stringify({refresh_token:rt}) }); if(!r.ok){localStorage.removeItem("sb_session");return null;} const d=await r.json(); const s={access_token:d.access_token,refresh_token:d.refresh_token,expires_at:d.expires_at,user:d.user}; localStorage.setItem("sb_session",JSON.stringify(s)); return s; } catch{localStorage.removeItem("sb_session");return null;} },
    signInWithGoogle(){window.location.href=`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(CANONICAL_APP_URL)}`;},
    async handleCallback(){
      // main.jsx stashes any access_token=... hash into sessionStorage
      // before HashRouter boots (HashRouter would otherwise normalize
      // the hash and wipe the tokens before this runs). Fall back to
      // reading window.location.hash directly in case the stash didn't
      // happen (older bundle still cached, etc.).
      let tokenParams = null;
      try {
        const stashed = sessionStorage.getItem("sb_oauth_hash");
        if (stashed && stashed.includes("access_token")) {
          tokenParams = new URLSearchParams(stashed);
          sessionStorage.removeItem("sb_oauth_hash");
        }
      } catch {}
      if (!tokenParams) {
        const h = window.location.hash || "";
        if (h.includes("access_token")) {
          tokenParams = new URLSearchParams(h.replace(/^#/, ""));
        }
      }
      if (tokenParams && tokenParams.get("access_token")) {
        const access_token = tokenParams.get("access_token");
        // Three sources for the expiry, in descending order of directness.
        // `expires_at` is not guaranteed to be in the callback hash, and
        // Number(null) is 0 — storing that zero is what created the
        // never-refreshing zombie sessions, so always land on a real number.
        const expiresIn = Number(tokenParams.get("expires_in"));
        const s = {
          access_token,
          refresh_token: tokenParams.get("refresh_token"),
          expires_at: Number(tokenParams.get("expires_at"))
            || (expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : 0)
            || jwtExp(access_token),
          user: null,
        };
        // Decode the JWT payload to get identity without a second network
        // hop. The token is already signed by Supabase so we trust the
        // claims; a later profile fetch uses the same token as Bearer.
        try {
          const [, payload] = access_token.split(".");
          if (payload) {
            const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
            const claims = JSON.parse(decodeURIComponent(escape(json)));
            s.user = {
              id: claims.sub,
              email: claims.email,
              user_metadata: claims.user_metadata || {},
              app_metadata: claims.app_metadata || {},
            };
          }
        } catch {}
        // Belt and braces: if JWT decode ever fails, try the /user endpoint.
        if (!s.user) {
          try {
            const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${access_token}` } });
            if (r.ok) s.user = await r.json();
          } catch {}
        }
        localStorage.setItem("sb_session", JSON.stringify(s));
        // A fresh sign-in counts as today's daily refresh, so the midnight
        // daily-refresh modal never double-prompts someone who just logged in.
        try{localStorage.setItem("pulse_daily_refresh_ack", new Date(Date.now()+108e5).toISOString().slice(0,10));}catch{}
        window.history.replaceState(null, "", window.location.pathname);
        return s;
      }
      const urlParams = new URLSearchParams(window.location.search);
      const c = urlParams.get("code");
      const state = urlParams.get("state");
      /* Skip Gmail OAuth codes — they are handled by CoachingPage */
      if (c && state === "gmail_oauth") { return null; }
      if (c) {
        try {
          const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`, { method: "POST", headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" }, body: JSON.stringify({ auth_code: c, code_verifier: sessionStorage.getItem("code_verifier") || "" }) });
          if (r.ok) {
            const d = await r.json();
            const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, user: d.user };
            localStorage.setItem("sb_session", JSON.stringify(s));
            // Fresh sign-in counts as today's daily refresh (see midnight gate in App.jsx).
            try{localStorage.setItem("pulse_daily_refresh_ack", new Date(Date.now()+108e5).toISOString().slice(0,10));}catch{}
            window.history.replaceState(null, "", window.location.pathname);
            return s;
          }
        } catch {}
      }
      return null;
    },
    async signOut(){
      dataCache.invalidate();
      localStorage.removeItem("sb_session");
      // Clear user-scoped browsing state so the next user signing in
      // on the same browser doesn't inherit it. recent_qas leaked the
      // previous user's QA browsing history; notif_dismissed_* leaked
      // their notification preferences (and could silently hide
      // entries for the next user when IDs collided).
      try {
        localStorage.removeItem("recent_qas");
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("notif_dismissed") || k.startsWith("plan_seen_v1_"))) {
            localStorage.removeItem(k);
          }
        }
      } catch {}
      sessionStorage.clear();
      window.location.href=window.location.origin;
    },
  },
};

/* ═══ GLOBAL DATA CACHE — avoids redundant fetches across pages ═══ */
export const dataCache = {
  _store: {},
  // Short TTL keeps the app feeling live: cached entries are treated
  // as stale after 30 s, which triggers a background refresh on the
  // next read while still returning the cached value instantly. With
  // Supabase on the paid plan this is well within the IO budget; on
  // the free Nano tier we ran 5 min to avoid throttling.
  _ttl: 30000,
  get(key) {
    const entry = this._store[key];
    if (!entry) return null;
    return entry.data; // return regardless of age; freshness checked separately
  },
  isFresh(key) {
    const entry = this._store[key];
    return !!entry && Date.now() - entry.ts < this._ttl;
  },
  set(key, data) { this._store[key] = { data, ts: Date.now() }; },
  invalidate(key) { if (key) delete this._store[key]; else this._store = {}; },
  /** Invalidate + notify all listeners to refetch */
  bust(keys) {
    if (Array.isArray(keys)) keys.forEach(k => delete this._store[k]);
    else if (keys) delete this._store[keys];
    else this._store = {};
    window.dispatchEvent(new CustomEvent("data-changed"));
  },
  async fetch(key, queryFn) {
    const entry = this._store[key];
    // Fresh cache hit → return cached data immediately, no network.
    if (entry && Date.now() - entry.ts < this._ttl) {
      return entry.data;
    }
    // Stale or empty → await fresh data so callers (auto-refresh loops
    // especially) actually update with the latest values instead of
    // serving stale and only catching up on the next tick. Falls back
    // to whatever was cached if the network request fails so the UI
    // doesn't go blank on a transient error.
    try {
      const data = await Promise.resolve(queryFn());
      this.set(key, data);
      return data;
    } catch (e) {
      if (entry) return entry.data;
      throw e;
    }
  }
};
