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
export const sb = {
  headers: (token) => ({ apikey: SUPABASE_ANON, Authorization: `Bearer ${token || SUPABASE_ANON}`, "Content-Type": "application/json", Prefer: "return=representation" }),
  async query(table, { select = "*", filters = "", token, method = "GET", body, headers: extra } = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters ? "&" + filters : ""}`;
    const opts = { method, headers: { ...this.headers(token), ...extra } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    // Auto-refresh on 401 (JWT expired) and retry once
    if (r.status === 401) {
      const session = await sb.auth.getSession();
      if (session?.access_token && session.access_token !== token) {
        // Update stored session and retry with new token
        const retryOpts = { method, headers: { ...this.headers(session.access_token), ...extra } };
        if (body) retryOpts.body = JSON.stringify(body);
        const r2 = await fetch(url, retryOpts);
        if (!r2.ok) { const e = await r2.json().catch(() => ({})); throw new Error(e.message || e.details || r2.statusText); }
        if (r2.status === 204) return [];
        // Notify app to update token
        window.dispatchEvent(new CustomEvent("session-refreshed", { detail: session }));
        return r2.json();
      }
      const e = await r.json().catch(() => ({}));
      throw new Error("Session expired. Please sign in again.");
    }
    if (!r.ok) { const e = await r.json().catch(() => ({})); const err = new Error(e.message || e.details || r.statusText); window.dispatchEvent(new CustomEvent("sb-error", { detail: { table, method, error: err.message } })); throw err; }
    if (r.status === 204) return [];
    return r.json();
  },
  async rpc(fn, params, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: this.headers(token), body: JSON.stringify(params) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  },
  auth: {
    async getSession() { const s = localStorage.getItem("sb_session"); if (!s) return null; try { const p = JSON.parse(s); if (p.expires_at && Date.now()/1000 > p.expires_at-60) return sb.auth.refresh(p.refresh_token); return p; } catch { localStorage.removeItem("sb_session"); return null; } },
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
        const s = {
          access_token,
          refresh_token: tokenParams.get("refresh_token"),
          expires_at: Number(tokenParams.get("expires_at")),
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
            window.history.replaceState(null, "", window.location.pathname);
            return s;
          }
        } catch {}
      }
      return null;
    },
    async signOut(){dataCache.invalidate();localStorage.removeItem("sb_session");sessionStorage.clear();window.location.href=window.location.origin;},
  },
};

/* ═══ GLOBAL DATA CACHE — avoids redundant fetches across pages ═══ */
export const dataCache = {
  _store: {},
  _ttl: 300000, // 5 min cache lifetime
  get(key) {
    const entry = this._store[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttl) { delete this._store[key]; return null; }
    return entry.data;
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
    const cached = this.get(key);
    if (cached) return cached;
    const data = await queryFn();
    this.set(key, data);
    return data;
  }
};
