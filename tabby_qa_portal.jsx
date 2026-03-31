import { useState, useEffect, useCallback, createContext, useContext } from "react";

const SUPABASE_URL = "https://shuenqmzbrthiiokfzio.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNodWVucW16YnJ0aGlpb2tmemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mzc4MjAsImV4cCI6MjA5MDUxMzgyMH0.WjbpCt33uJ_hGXucKEHn0q5_daaRnGzwRDVbTxs7lG4";

/* ── Minimal Supabase client (no SDK needed) ── */
const sb = {
  headers: (token) => ({
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${token || SUPABASE_ANON}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  }),
  async query(table, { select = "*", filters = "", token, method = "GET", body } = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filters ? "&" + filters : ""}`;
    const opts = { method, headers: this.headers(token) };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
    if (r.status === 204) return [];
    return r.json();
  },
  async rpc(fn, params, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: this.headers(token), body: JSON.stringify(params),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
    return r.json();
  },
  auth: {
    async getSession() {
      const stored = localStorage.getItem("sb_session");
      if (!stored) return null;
      const session = JSON.parse(stored);
      if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
        return sb.auth.refresh(session.refresh_token);
      }
      return session;
    },
    async refresh(refreshToken) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!r.ok) { localStorage.removeItem("sb_session"); return null; }
      const data = await r.json();
      const session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, user: data.user };
      localStorage.setItem("sb_session", JSON.stringify(session));
      return session;
    },
    async signInWithGoogle() {
      const redirectTo = window.location.origin;
      window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
    },
    async handleCallback() {
      const hash = window.location.hash;
      if (!hash || !hash.includes("access_token")) return null;
      const params = new URLSearchParams(hash.substring(1));
      const session = {
        access_token: params.get("access_token"),
        refresh_token: params.get("refresh_token"),
        expires_at: Number(params.get("expires_at")),
        user: null,
      };
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${session.access_token}` },
      });
      if (r.ok) session.user = await r.json();
      localStorage.setItem("sb_session", JSON.stringify(session));
      window.location.hash = "";
      return session;
    },
    signOut() { localStorage.removeItem("sb_session"); window.location.href = "/"; },
  },
};

/* ── Context ── */
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

/* ── Role helpers ── */
const ROLE_LEVEL = { qa: 1, qa_lead: 2, qa_supervisor: 3, admin: 4, super_admin: 5 };
const ROLE_LABELS = { qa: "QA", qa_lead: "QA Lead", qa_supervisor: "QA Supervisor", admin: "Admin", super_admin: "Super Admin" };
const hasRole = (userRole, minRole) => (ROLE_LEVEL[userRole] || 0) >= (ROLE_LEVEL[minRole] || 99);

/* ── Icons (inline SVG) ── */
const Icon = ({ d, size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
);
const icons = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  leaderboard: "M16 8v8m-8-4v4m4-12v12M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  dam: "M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97L13.75 4a2 2 0 00-3.5 0L3.32 16.03A2 2 0 005.07 19z",
  plan: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  coaching: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  hr: "M17 20h5v-2a3 3 0 00-5.36-1.81M17 20H7m10 0v-2c0-.66-.13-1.29-.36-1.86M7 20H2v-2a3 3 0 015.36-1.81M7 20v-2c0-.66.13-1.29.36-1.86m0 0A5.97 5.97 0 0112 14c1.66 0 3.18.68 4.28 1.78M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  escalation: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm0 0h12",
  settings: "M10.33 3.94c.09-.56.6-.94 1.17-.94h1c.57 0 1.08.38 1.17.94l.14.84c.08.49.4.88.84 1.1.13.07.26.14.38.22.44.28.97.34 1.44.12l.8-.28c.54-.19 1.13.02 1.41.5l.5.87c.29.48.18 1.1-.25 1.45l-.66.56c-.38.32-.56.8-.52 1.28.01.15.01.3 0 .44-.04.49.14.96.52 1.28l.66.56c.43.36.54.97.25 1.45l-.5.87c-.28.48-.87.69-1.41.5l-.8-.28c-.47-.17-1-.1-1.44.12-.12.08-.25.15-.38.22-.44.22-.76.61-.84 1.1l-.14.84c-.09.56-.6.94-1.17.94h-1c-.57 0-1.08-.38-1.17-.94l-.14-.84c-.08-.49-.4-.88-.84-1.1-.13-.07-.26-.14-.38-.22-.44-.28-.97-.34-1.44-.12l-.8.28c-.54.19-1.13-.02-1.41-.5l-.5-.87c-.29-.48-.18-1.1.25-1.45l.66-.56c.38-.32.56-.8.52-1.28-.01-.15-.01-.3 0-.44.04-.49-.14-.96-.52-1.28l-.66-.56c-.43-.36-.54-.97-.25-1.45l.5-.87c.28-.48.87-.69 1.41-.5l.8.28c.47.17 1 .1 1.44-.12.12-.08.25-.15.38-.22.44-.22.76-.61.84-1.1l.14-.84zM14 12a2 2 0 11-4 0 2 2 0 014 0z",
  logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  chevronDown: "M19 9l-7 7-7-7",
  google: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 18L18 6M6 6l12 12",
  user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z",
};

/* ── CSS ── */
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');

  :root {
    --bg: #F7F6F3; --bg2: #EFEEE9; --bg3: #FFF; --sidebar-bg: #1B1B19;
    --tx: #1A1A18; --tx2: #6B6A65; --tx3: #9C9B95;
    --bd: #E2E1DC; --bd2: #EFEEE9;
    --accent: #2B6CB0; --accent-light: #EBF4FF; --accent-dark: #1A4971;
    --green: #16A34A; --green-bg: #DCFCE7;
    --amber: #D97706; --amber-bg: #FEF3C7;
    --red: #DC2626; --red-bg: #FEE2E2;
    --teal: #0D9488; --teal-bg: #CCFBF1;
    --radius: 10px; --radius-lg: 14px;
    --shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
    --shadow-lg: 0 4px 12px rgba(0,0,0,.08);
    --font: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    --sidebar-w: 260px;
    --topbar-h: 0px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body, html, #root { height: 100%; font-family: var(--font); background: var(--bg); color: var(--tx); }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--bd); border-radius: 10px; }

  /* ── Login ── */
  .login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1B1B19 0%, #2D3748 50%, #1B1B19 100%); position: relative; overflow: hidden; }
  .login-page::before { content: ''; position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(43,108,176,.15) 0%, transparent 70%); top: -200px; right: -100px; }
  .login-page::after { content: ''; position: absolute; width: 400px; height: 400px; background: radial-gradient(circle, rgba(13,148,136,.1) 0%, transparent 70%); bottom: -100px; left: -50px; }
  .login-card { background: var(--bg3); border-radius: 20px; padding: 48px 40px; width: 100%; max-width: 420px; position: relative; z-index: 1; box-shadow: 0 25px 60px rgba(0,0,0,.3); }
  .login-logo { font-size: 28px; font-weight: 600; letter-spacing: -1px; margin-bottom: 4px; }
  .login-logo span { color: var(--accent); }
  .login-subtitle { color: var(--tx2); font-size: 14px; margin-bottom: 36px; line-height: 1.5; }
  .login-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 14px 24px; border: 1.5px solid var(--bd); border-radius: var(--radius); background: var(--bg3); font-family: var(--font); font-size: 15px; font-weight: 500; color: var(--tx); cursor: pointer; transition: all .2s; }
  .login-btn:hover { background: var(--bg); border-color: var(--accent); box-shadow: var(--shadow-lg); transform: translateY(-1px); }
  .login-btn:active { transform: translateY(0); }
  .login-btn svg { flex-shrink: 0; }
  .login-divider { text-align: center; color: var(--tx3); font-size: 12px; margin: 24px 0; position: relative; }
  .login-divider::before, .login-divider::after { content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: var(--bd); }
  .login-divider::before { left: 0; }
  .login-divider::after { right: 0; }
  .login-domains { display: flex; gap: 8px; justify-content: center; }
  .login-domain { padding: 6px 14px; background: var(--bg); border-radius: 20px; font-size: 12px; color: var(--tx2); font-weight: 500; }
  .login-footer { text-align: center; color: var(--tx3); font-size: 11px; margin-top: 32px; }

  /* ── Layout ── */
  .app-layout { display: flex; height: 100vh; }
  .sidebar { width: var(--sidebar-w); background: var(--sidebar-bg); color: #FFF; display: flex; flex-direction: column; flex-shrink: 0; transition: transform .25s ease; z-index: 50; }
  .sidebar-header { padding: 24px 20px 20px; border-bottom: 1px solid rgba(255,255,255,.08); }
  .sidebar-brand { font-size: 20px; font-weight: 600; letter-spacing: -.5px; }
  .sidebar-brand span { color: #63B3ED; }
  .sidebar-tag { font-size: 10px; background: rgba(99,179,237,.15); color: #63B3ED; padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 500; letter-spacing: .5px; }
  .sidebar-nav { flex: 1; padding: 12px 10px; overflow-y: auto; }
  .sidebar-section { font-size: 10px; color: rgba(255,255,255,.35); font-weight: 500; letter-spacing: 1px; text-transform: uppercase; padding: 16px 12px 6px; }
  .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; font-size: 14px; color: rgba(255,255,255,.6); cursor: pointer; transition: all .15s; margin-bottom: 2px; border: none; background: none; width: 100%; text-align: left; font-family: var(--font); }
  .nav-item:hover { background: rgba(255,255,255,.06); color: rgba(255,255,255,.85); }
  .nav-item.active { background: rgba(99,179,237,.12); color: #63B3ED; font-weight: 500; }
  .nav-item .badge { margin-left: auto; background: var(--red); color: #fff; font-size: 10px; padding: 1px 7px; border-radius: 10px; font-weight: 600; }
  .sidebar-profile { padding: 16px 14px; border-top: 1px solid rgba(255,255,255,.08); display: flex; align-items: center; gap: 10px; }
  .sidebar-avatar { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.12); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: #63B3ED; overflow: hidden; flex-shrink: 0; }
  .sidebar-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .sidebar-user { flex: 1; min-width: 0; }
  .sidebar-user-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sidebar-user-role { font-size: 11px; color: rgba(255,255,255,.4); }
  .sidebar-logout { background: none; border: none; color: rgba(255,255,255,.4); cursor: pointer; padding: 6px; border-radius: 6px; transition: all .15s; }
  .sidebar-logout:hover { color: #FFF; background: rgba(255,255,255,.08); }

  /* ── Main content ── */
  .main-content { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
  .topbar { display: none; padding: 12px 20px; background: var(--bg3); border-bottom: 1px solid var(--bd); align-items: center; gap: 12px; }
  .topbar-menu { background: none; border: none; cursor: pointer; color: var(--tx); padding: 4px; }
  .topbar-title { font-size: 15px; font-weight: 500; }
  .page { flex: 1; padding: 32px; max-width: 1200px; width: 100%; margin: 0 auto; }
  .page-header { margin-bottom: 28px; }
  .page-title { font-size: 24px; font-weight: 600; letter-spacing: -.5px; }
  .page-subtitle { font-size: 14px; color: var(--tx2); margin-top: 4px; }

  /* ── Cards ── */
  .card { background: var(--bg3); border: 1px solid var(--bd2); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow); }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .card-title { font-size: 15px; font-weight: 600; }

  /* ── Stat cards ── */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .stat-card { background: var(--bg3); border: 1px solid var(--bd2); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow); }
  .stat-label { font-size: 12px; color: var(--tx2); font-weight: 500; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
  .stat-value { font-size: 28px; font-weight: 600; letter-spacing: -1px; }
  .stat-change { font-size: 12px; font-weight: 500; margin-top: 4px; }
  .stat-change.up { color: var(--green); }
  .stat-change.down { color: var(--red); }
  .stat-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }

  /* ── Welcome banner ── */
  .welcome-banner { background: linear-gradient(135deg, #1B1B19, #2D3748); border-radius: var(--radius-lg); padding: 32px; color: #FFF; margin-bottom: 28px; position: relative; overflow: hidden; }
  .welcome-banner::after { content: ''; position: absolute; width: 300px; height: 300px; background: radial-gradient(circle, rgba(99,179,237,.12) 0%, transparent 70%); top: -100px; right: -50px; }
  .welcome-banner h2 { font-size: 22px; font-weight: 600; letter-spacing: -.5px; margin-bottom: 6px; position: relative; z-index: 1; }
  .welcome-banner p { color: rgba(255,255,255,.6); font-size: 14px; position: relative; z-index: 1; }
  .welcome-role { display: inline-block; background: rgba(99,179,237,.15); color: #63B3ED; padding: 3px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; margin-top: 12px; position: relative; z-index: 1; }

  /* ── Placeholder pages ── */
  .placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 20px; }
  .placeholder-icon { width: 64px; height: 64px; background: var(--accent-light); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; color: var(--accent); }
  .placeholder h3 { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
  .placeholder p { color: var(--tx2); font-size: 14px; max-width: 400px; }
  .placeholder-badge { margin-top: 16px; padding: 6px 16px; background: var(--amber-bg); color: var(--amber); font-size: 12px; font-weight: 600; border-radius: 20px; }

  /* ── Table ── */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--tx2); font-weight: 500; padding: 10px 14px; border-bottom: 1px solid var(--bd); }
  td { padding: 12px 14px; border-bottom: 1px solid var(--bd2); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg); }

  /* ── Role badge ── */
  .role-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: .3px; }
  .role-qa { background: var(--bg); color: var(--tx2); }
  .role-qa_lead { background: var(--accent-light); color: var(--accent); }
  .role-qa_supervisor { background: var(--teal-bg); color: var(--teal); }
  .role-admin { background: var(--amber-bg); color: var(--amber); }
  .role-super_admin { background: var(--red-bg); color: var(--red); }

  /* ── Domain badge ── */
  .domain-badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 500; }
  .domain-ai { background: #EEF2FF; color: #4338CA; }
  .domain-sa { background: #FFF7ED; color: #C2410C; }

  /* ── Status badge ── */
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .status-active { background: var(--green-bg); color: var(--green); }
  .status-inactive { background: var(--bg); color: var(--tx3); }
  .status-on_leave { background: var(--amber-bg); color: var(--amber); }

  /* ── Buttons ── */
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: var(--radius); font-family: var(--font); font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s; border: 1px solid transparent; }
  .btn-primary { background: var(--accent); color: #FFF; }
  .btn-primary:hover { background: var(--accent-dark); }
  .btn-outline { background: var(--bg3); color: var(--tx); border-color: var(--bd); }
  .btn-outline:hover { background: var(--bg); }
  .btn-sm { padding: 5px 12px; font-size: 12px; }
  .btn-danger { background: var(--red); color: #FFF; }
  .btn-danger:hover { background: #B91C1C; }

  /* ── Select ── */
  .select { padding: 8px 12px; border: 1px solid var(--bd); border-radius: var(--radius); font-family: var(--font); font-size: 13px; background: var(--bg3); color: var(--tx); cursor: pointer; }

  /* ── Loading ── */
  .loading-spinner { display: flex; align-items: center; justify-content: center; padding: 40px; }
  .spinner { width: 32px; height: 32px; border: 3px solid var(--bd); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Toast ── */
  .toast { position: fixed; bottom: 24px; right: 24px; padding: 14px 20px; border-radius: var(--radius); font-size: 14px; font-weight: 500; color: #FFF; z-index: 999; animation: slideUp .3s ease; box-shadow: var(--shadow-lg); }
  .toast-success { background: var(--green); }
  .toast-error { background: var(--red); }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  /* ── Mobile ── */
  .mobile-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 40; }

  @media (max-width: 768px) {
    .sidebar { position: fixed; left: 0; top: 0; bottom: 0; transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .mobile-overlay.open { display: block; }
    .topbar { display: flex; }
    .page { padding: 20px 16px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .welcome-banner { padding: 24px; }
    .welcome-banner h2 { font-size: 18px; }
  }
`;

/* ── Google Logo SVG ── */
const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

/* ── Pages ── */

const DashboardPage = ({ profile }) => (
  <div className="page">
    <div className="welcome-banner">
      <h2>Welcome back, {profile?.display_name?.split(" ")[0] || "there"}</h2>
      <p>Here's your performance overview for this week.</p>
      <div className="welcome-role">{ROLE_LABELS[profile?.role] || "QA"} · {profile?.domain}</div>
    </div>
    <div className="stats-grid">
      {[
        { label: "Composite score", value: "—", icon: "📊", bg: "var(--accent-light)", color: "var(--accent)" },
        { label: "Team rank", value: "—", icon: "🏆", bg: "var(--amber-bg)", color: "var(--amber)" },
        { label: "Domain rank", value: "—", icon: "🌐", bg: "var(--teal-bg)", color: "var(--teal)" },
        { label: "Weeks tracked", value: "0", icon: "📅", bg: "var(--green-bg)", color: "var(--green)" },
      ].map((s, i) => (
        <div className="stat-card" key={i}>
          <div className="stat-icon" style={{ background: s.bg, color: s.color, fontSize: 18 }}>{s.icon}</div>
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">{s.value}</div>
        </div>
      ))}
    </div>
    <div className="card">
      <div className="card-header"><span className="card-title">Recent scores</span></div>
      <div className="placeholder" style={{ padding: "40px 20px" }}>
        <p style={{ color: "var(--tx3)" }}>Score data will appear here once leads start entering weekly scores. Connect your Google Sheets data to populate historical scores.</p>
      </div>
    </div>
  </div>
);

const PlaceholderPage = ({ title, description, icon, minRole, userRole }) => {
  const locked = minRole && !hasRole(userRole, minRole);
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">{title}</div>
      </div>
      <div className="card">
        <div className="placeholder">
          <div className="placeholder-icon"><Icon d={icon} size={28} /></div>
          <h3>{title}</h3>
          <p>{locked ? `This module requires ${ROLE_LABELS[minRole]} access or above.` : description}</p>
          <div className="placeholder-badge">{locked ? "Access restricted" : "Coming in Phase 3+"}</div>
        </div>
      </div>
    </div>
  );
};

const AdminUsersPage = ({ token }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await sb.query("profiles", { select: "id,email,display_name,role,domain,status,created_at,teams(name)", token });
      setUsers(data.sort((a, b) => ROLE_LEVEL[b.role] - ROLE_LEVEL[a.role]));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const saveRole = async (userId) => {
    try {
      await sb.query("profiles", {
        token, method: "PATCH", body: { role: editRole },
        filters: `id=eq.${userId}`,
      });
      setEditingId(null);
      setToast({ type: "success", msg: "Role updated" });
      setTimeout(() => setToast(null), 3000);
      load();
    } catch (e) {
      setToast({ type: "error", msg: e.message });
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">User management</div>
        <div className="page-subtitle">{users.length} users registered</div>
      </div>
      <div className="card">
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Domain</th><th>Team</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.display_name || "—"}</td>
                    <td style={{ color: "var(--tx2)", fontSize: 13 }}>{u.email}</td>
                    <td>
                      {editingId === u.id ? (
                        <select className="select" value={editRole} onChange={e => setEditRole(e.target.value)} style={{ fontSize: 12, padding: "4px 8px" }}>
                          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : (
                        <span className={`role-badge role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                      )}
                    </td>
                    <td><span className={`domain-badge domain-${u.domain === "tabby.ai" ? "ai" : "sa"}`}>{u.domain}</span></td>
                    <td style={{ color: "var(--tx2)", fontSize: 13 }}>{u.teams?.name || "Unassigned"}</td>
                    <td><span className={`status-badge status-${u.status}`}>{u.status}</span></td>
                    <td>
                      {editingId === u.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => saveRole(u.id)}>Save</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => { setEditingId(u.id); setEditRole(u.role); }}>Edit role</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
};

/* ── Navigation config ── */
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: icons.dashboard, section: "Overview" },
  { key: "leaderboard", label: "Leaderboard", icon: icons.leaderboard },
  { key: "dam", label: "DAM flags", icon: icons.dam, minRole: "qa_lead", section: "Performance" },
  { key: "plans", label: "AP / PIP", icon: icons.plan, minRole: "qa_lead" },
  { key: "coaching", label: "Coaching", icon: icons.coaching, minRole: "qa_lead", section: "Management" },
  { key: "hr", label: "HR cases", icon: icons.hr, minRole: "qa_supervisor" },
  { key: "escalations", label: "Escalations", icon: icons.escalation },
  { key: "admin", label: "Admin panel", icon: icons.settings, minRole: "admin", section: "System" },
];

/* ── Main App ── */
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    (async () => {
      let s = await sb.auth.handleCallback();
      if (!s) s = await sb.auth.getSession();
      if (s) {
        setSession(s);
        try {
          const profiles = await sb.query("profiles", {
            select: "id,email,display_name,avatar_url,role,domain,team_id,status",
            filters: `id=eq.${s.user?.id}`,
            token: s.access_token,
          });
          if (profiles.length > 0) setProfile(profiles[0]);
        } catch (e) { console.error("Profile fetch failed:", e); }
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{css}</style>
      <div className="spinner" />
    </div>
  );

  if (!session) return (
    <>
      <style>{css}</style>
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">tabby<span>QA</span></div>
          <div className="login-subtitle">Quality Assurance Performance Portal<br/>Sign in with your Tabby Google account to continue.</div>
          <button className="login-btn" onClick={sb.auth.signInWithGoogle}>
            <GoogleLogo />
            Sign in with Google
          </button>
          <div className="login-divider">Supported domains</div>
          <div className="login-domains">
            <span className="login-domain">@tabby.ai</span>
            <span className="login-domain">@tabby.sa</span>
          </div>
          <div className="login-footer">Internal tool · Tabby QA Assurance</div>
        </div>
      </div>
    </>
  );

  const userRole = profile?.role || "qa";
  const visibleNav = NAV_ITEMS.filter(n =>
    !n.minRole || hasRole(userRole, n.minRole) || n.key === "escalations"
  );

  let currentSection = null;
  const renderPage = () => {
    switch (page) {
      case "dashboard": return <DashboardPage profile={profile} />;
      case "admin": return hasRole(userRole, "admin")
        ? <AdminUsersPage token={session.access_token} />
        : <PlaceholderPage title="Admin panel" description="" icon={icons.settings} minRole="admin" userRole={userRole} />;
      case "leaderboard": return <PlaceholderPage title="Leaderboard" description="Team and global rankings with anonymous mode for QAs. Building next." icon={icons.leaderboard} userRole={userRole} />;
      case "dam": return <PlaceholderPage title="DAM flags" description="Automated disciplinary flags based on performance thresholds." icon={icons.dam} minRole="qa_lead" userRole={userRole} />;
      case "plans": return <PlaceholderPage title="Action plans & PIPs" description="Create, monitor, and close performance improvement plans." icon={icons.plan} minRole="qa_lead" userRole={userRole} />;
      case "coaching": return <PlaceholderPage title="Coaching sessions" description="Session logging, email generation, and weekly score tracking." icon={icons.coaching} minRole="qa_lead" userRole={userRole} />;
      case "hr": return <PlaceholderPage title="HR cases" description="Track disciplinary actions from verbal warnings to terminations." icon={icons.hr} minRole="qa_supervisor" userRole={userRole} />;
      case "escalations": return <PlaceholderPage title="Escalations" description="Privately flag concerns about leadership, routed to senior management." icon={icons.escalation} userRole={userRole} />;
      default: return <DashboardPage profile={profile} />;
    }
  };

  return (
    <>
      <style>{css}</style>
      <div className="app-layout">
        <div className={`mobile-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-header">
            <div className="sidebar-brand">tabby<span>QA</span> <span className="sidebar-tag">PORTAL</span></div>
          </div>
          <nav className="sidebar-nav">
            {visibleNav.map(item => {
              let sectionHeader = null;
              if (item.section && item.section !== currentSection) {
                currentSection = item.section;
                sectionHeader = <div className="sidebar-section" key={`s-${item.section}`}>{item.section}</div>;
              }
              return (
                <div key={item.key}>
                  {sectionHeader}
                  <button
                    className={`nav-item ${page === item.key ? "active" : ""}`}
                    onClick={() => { setPage(item.key); setSidebarOpen(false); }}
                  >
                    <Icon d={item.icon} size={18} />
                    {item.label}
                  </button>
                </div>
              );
            })}
          </nav>
          <div className="sidebar-profile">
            <div className="sidebar-avatar">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
                : (profile?.display_name || "?")[0].toUpperCase()
              }
            </div>
            <div className="sidebar-user">
              <div className="sidebar-user-name">{profile?.display_name || profile?.email}</div>
              <div className="sidebar-user-role">{ROLE_LABELS[userRole]} · {profile?.domain}</div>
            </div>
            <button className="sidebar-logout" onClick={sb.auth.signOut} title="Sign out">
              <Icon d={icons.logout} size={16} />
            </button>
          </div>
        </aside>
        <div className="main-content">
          <div className="topbar">
            <button className="topbar-menu" onClick={() => setSidebarOpen(true)}>
              <Icon d={icons.menu} size={22} />
            </button>
            <span className="topbar-title">{NAV_ITEMS.find(n => n.key === page)?.label || "Dashboard"}</span>
          </div>
          {renderPage()}
        </div>
      </div>
    </>
  );
}
