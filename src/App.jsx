import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import "./index.css";

// Style overrides — topbar, collapsible sidebar, dark mode, notifications, search
document.title = "Tabby Pulse — QA Performance & Analytics";
const styleOverride = document.createElement("style");
styleOverride.textContent = `
  .topbar { display: flex !important; position: sticky; top: 0; z-index: 30; backdrop-filter: blur(12px); background: rgba(250,250,250,.8) !important; }
  @media (min-width: 769px) {
    .topbar-menu { display: none !important; }
  }
  .role-senior_qa{background:var(--blue-bg);color:var(--blue)}
  .sidebar { transition: width .3s var(--ease), transform .3s var(--ease); }
  .sidebar.collapsed { width: 64px !important; overflow: visible !important; }
  .sidebar.collapsed .sidebar-nav { overflow: visible !important; }
  .sidebar.collapsed .sidebar-brand span,
  .sidebar.collapsed .sidebar-tag,
  .sidebar.collapsed .sidebar-section,
  .sidebar.collapsed .sidebar-user,
  .sidebar.collapsed .sidebar-logout,
  .sidebar.collapsed .nav-item-label { display: none !important; }
  .sidebar.collapsed .nav-item { justify-content: center; padding: 10px 0; position: relative; }
  .sidebar.collapsed .nav-item:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 12px);
    top: 50%;
    transform: translateY(-50%);
    background: var(--sidebar-bg);
    color: #fff;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    z-index: 9999;
    box-shadow: 0 8px 24px rgba(0,0,0,.3);
    pointer-events: none;
    border: 1px solid rgba(255,255,255,.08);
  }
  .sidebar.collapsed .nav-item:hover::before {
    content: '';
    position: absolute;
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
    border: 5px solid transparent;
    border-right-color: var(--sidebar-bg);
    z-index: 9999;
    pointer-events: none;
  }
  .sidebar.collapsed .sidebar-header { padding: 24px 12px 20px; text-align: center; }
  .sidebar.collapsed .sidebar-brand { font-size: 16px; }
  .sidebar.collapsed .sidebar-profile { justify-content: center; padding: 16px 8px; }
  .sidebar.collapsed .sidebar-avatar { margin: 0; }
  .sidebar.collapsed .sidebar-nav { padding: 12px 6px; }
  .sidebar-toggle { background: none; border: none; color: rgba(255,255,255,.3); cursor: pointer; padding: 8px; border-radius: 8px; transition: all .2s var(--ease); display: flex; align-items: center; justify-content: center; }
  .sidebar-toggle:hover { color: #fff; background: rgba(255,255,255,.08); }
  .view-as-bar { background: linear-gradient(90deg, rgba(106,44,121,.1), rgba(245,158,11,.1)); padding: 6px 16px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--amber); font-weight: 600; border-bottom: 1px solid rgba(245,158,11,.2); }
  .view-as-bar select { font-size: 11px; padding: 2px 8px; border-radius: 6px; border: 1px solid rgba(245,158,11,.3); background: var(--bg3); font-family: var(--font); }

  /* Notification bell */
  .notif-btn { position: relative; background: none; border: none; cursor: pointer; padding: 8px; border-radius: 10px; color: var(--tx2); transition: all .2s var(--ease); }
  .notif-btn:hover { background: var(--bg2); color: var(--tabby-purple); }
  .notif-badge { position: absolute; top: 2px; right: 2px; min-width: 16px; height: 16px; border-radius: 8px; background: var(--red); color: #fff; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 4px; animation: badgePulse 2s ease infinite; }
  @keyframes badgePulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.4); } 50% { box-shadow: 0 0 0 4px rgba(239,68,68,0); } }
  .notif-dropdown { position: absolute; top: calc(100% + 8px); right: 0; width: 360px; max-height: 420px; overflow-y: auto; background: var(--bg3); border: 1px solid var(--bd); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); z-index: 100; }
  .notif-item { padding: 14px 16px; border-bottom: 1px solid var(--bd2); cursor: pointer; transition: all .15s var(--ease); font-size: 12px; }
  .notif-item:hover { background: var(--bg2); }
  .notif-item:last-child { border-bottom: none; }
  .notif-header { padding: 14px 16px; border-bottom: 1px solid var(--bd); font-size: 13px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; }

  /* Search overlay */
  .search-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); backdrop-filter: blur(8px); z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding-top: 80px; animation: fadeIn .15s var(--ease); }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .search-box { width: 100%; max-width: 560px; background: var(--bg3); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; border: 1px solid var(--bd); }
  .search-input { width: 100%; padding: 18px 20px; border: none; font-size: 16px; font-family: var(--font); background: transparent; color: var(--tx); outline: none; font-weight: 500; }
  .search-results { max-height: 400px; overflow-y: auto; border-top: 1px solid var(--bd2); }
  .search-result { padding: 12px 20px; cursor: pointer; transition: all .15s var(--ease); display: flex; align-items: center; gap: 12px; font-size: 13px; }
  .search-result:hover { background: var(--bg2); }
  .search-result-type { font-size: 9px; padding: 2px 8px; border-radius: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }

  /* Dark mode — Tabby branded */
  .dark { --bg: #0F0D14; --bg2: #181522; --bg3: #211D30; --tx: #F5F3F8; --tx2: #B8B0C8; --tx3: #7E7694; --bd: #332D48; --bd2: #2A2540; --accent-light: #0D3320; --accent-text: #3BFF9D; --primary-light: #251838; --primary-text: #C9A0D8; --sidebar-bg: #0A0814; --green-bg: #0D2E1A; --amber-bg: #2E2410; --red-bg: #2E1010; }
  .dark .topbar { background: rgba(15,13,20,.9) !important; border-color: rgba(255,255,255,.06); }
  .dark .card { background: var(--bg3); border-color: var(--bd2); }
  .dark .card:hover { box-shadow: 0 4px 24px rgba(106,44,121,.1); }
  .dark .btn-primary { background: var(--tabby-purple); }
  .dark .btn-outline { background: var(--bg3); color: var(--tx); border-color: var(--bd); }
  .dark .btn-outline:hover { border-color: var(--tabby-purple-light); color: var(--tabby-purple-light); }
  .dark .select, .dark .input, .dark .form-input { background: var(--bg2); color: var(--tx); border-color: var(--bd); }
  .dark .select:focus, .dark .input:focus, .dark .form-input:focus { border-color: var(--tabby-purple-light); box-shadow: 0 0 0 3px rgba(106,44,121,.15); }
  .dark .notif-dropdown { background: var(--bg3); border-color: var(--bd); }
  .dark .search-box { background: var(--bg3); border-color: var(--bd); }
  .dark .welcome-banner { background: linear-gradient(135deg, rgba(106,44,121,.25), #0F0D14 60%, rgba(59,255,157,.05)); border-color: rgba(106,44,121,.2); }
  .dark .stat-card { background: var(--bg3); border-color: var(--bd2); }
  .dark .stat-card:hover { box-shadow: 0 4px 20px rgba(106,44,121,.1); border-color: rgba(106,44,121,.15); }
  .dark table th { color: var(--tx2); border-color: var(--bd); }
  .dark table td { border-color: var(--bd2); }
  .dark tr:hover td { background: var(--bg2); }
  .dark .login-page { background: linear-gradient(135deg, #080610, #0D0B10, #080610); }
  .dark .login-card { background: rgba(28,24,40,.8); border-color: rgba(106,44,121,.15); }
  .dark .login-btn { background: rgba(106,44,121,.15); color: var(--tx); border-color: rgba(106,44,121,.2); }
  .dark .login-btn:hover { background: rgba(106,44,121,.25); border-color: var(--tabby-green); }
  .dark .tab.active { background: var(--bg3); color: var(--tabby-green); }
  .dark .tab-btn.active { background: var(--bg3); color: var(--tabby-green); }
  .dark .role-super_admin { background: rgba(106,44,121,.15); color: var(--tabby-purple-light); border-color: rgba(106,44,121,.2); }

  @media (max-width: 768px) {
    .sidebar.collapsed { width: var(--sidebar-w) !important; }
    .notif-dropdown { width: 300px; right: -40px; }
  }
`;
document.head.appendChild(styleOverride);

// PWA manifest injection
if (!document.querySelector('link[rel="manifest"]')) {
  const manifest = { name: "Tabby Pulse", short_name: "Pulse", start_url: "/", display: "standalone", background_color: "#1A1A1A", theme_color: "#3CFFA5", icons: [{ src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='10' y='50' width='20' height='40' rx='4' fill='%233CFFA5'/%3E%3Crect x='40' y='25' width='20' height='65' rx='4' fill='%233CFFA5'/%3E%3Crect x='70' y='10' width='20' height='80' rx='4' fill='%233CFFA5'/%3E%3C/svg%3E", sizes: "any", type: "image/svg+xml" }] };
  const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = URL.createObjectURL(blob);
  document.head.appendChild(link);
  const meta = document.createElement("meta");
  meta.name = "apple-mobile-web-app-capable";
  meta.content = "yes";
  document.head.appendChild(meta);
  const metaStatus = document.createElement("meta");
  metaStatus.name = "apple-mobile-web-app-status-bar-style";
  metaStatus.content = "black-translucent";
  document.head.appendChild(metaStatus);
  // Override favicon
  const existingFav = document.querySelector('link[rel="icon"]');
  if (existingFav) existingFav.remove();
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/svg+xml";
  favicon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%236A2C79'/%3E%3Crect x='12' y='50' width='18' height='38' rx='4' fill='%233BFF9D'/%3E%3Crect x='41' y='28' width='18' height='60' rx='4' fill='%233BFF9D' opacity='.8'/%3E%3Crect x='70' y='12' width='18' height='76' rx='4' fill='%233BFF9D' opacity='.6'/%3E%3C/svg%3E";
  document.head.appendChild(favicon);
}

/* ═══ ROLE SYSTEM ═══ */
const ROLE_LEVEL={qa:1,senior_qa:3,qa_lead:3,qa_supervisor:4,admin:5,super_admin:6};
const ROLE_LABELS={qa:"QA",senior_qa:"Senior QA",qa_lead:"QA Lead",auditor:"Auditor",qa_supervisor:"QA Supervisor",admin:"Admin",super_admin:"Super Admin"};
const hasRole=(r,min)=>(ROLE_LEVEL[r]||0)>=(ROLE_LEVEL[min]||99);

// Chronological month sort (newest first): "Mar-2026" > "Feb-2026" > "Jan-2026"
const MONTH_IDX={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
const sortMonthsDesc=(months)=>[...months].sort((a,b)=>{const[am,ay]=a.split("-");const[bm,by]=b.split("-");return(parseInt(by)||0)-(parseInt(ay)||0)||(MONTH_IDX[bm]??0)-(MONTH_IDX[am]??0);});

/* ═══ SEARCHABLE MULTI-SELECT COMPONENT ═══ */
function SearchableSelect({ options, value, onChange, placeholder, multi = false, labelKey = "label", valueKey = "value", className = "" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) { const portal = document.getElementById("ss-portal"); if (portal && portal.contains(e.target)) return; setOpen(false); }};
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setRect(r);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Close on scroll
  useEffect(() => {
    if (!open) return;
    const onScroll = () => { if (ref.current) { const r = ref.current.getBoundingClientRect(); setRect(r); }};
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  const filtered = options.filter(o => {
    const label = typeof o === "string" ? o : o[labelKey] || "";
    return label.toLowerCase().includes(search.toLowerCase());
  });
  const getLabel = (o) => typeof o === "string" ? o : o[labelKey] || "";
  const getValue = (o) => typeof o === "string" ? o : o[valueKey] || "";
  const isSelected = (o) => { const v = getValue(o); return multi ? (value || []).includes(v) : value === v; };
  const toggle = (o) => {
    const v = getValue(o);
    if (multi) { const arr = value || []; onChange(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]); }
    else { onChange(v === value ? "" : v); setOpen(false); setSearch(""); }
  };
  const displayValue = () => {
    if (multi && value?.length > 0) { return value.length === 1 ? (options.find(o => getValue(o) === value[0]) ? getLabel(options.find(o => getValue(o) === value[0])) : value[0]) : `${value.length} selected`; }
    if (!multi && value) { const opt = options.find(o => getValue(o) === value); return opt ? getLabel(opt) : value; }
    return "";
  };

  // Portal container
  let portalEl = document.getElementById("ss-portal");
  if (!portalEl) { portalEl = document.createElement("div"); portalEl.id = "ss-portal"; document.body.appendChild(portalEl); }

  const dropdownTop = rect ? rect.bottom + 4 : 0;
  const dropdownLeft = rect ? rect.left : 0;
  const dropdownWidth = rect ? rect.width : 200;
  const flipUp = rect && (dropdownTop + 260 > window.innerHeight);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 130 }} className={className}>
      <button onClick={() => { setOpen(!open); setSearch(""); }} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", border: "1px solid var(--bd)",
        borderRadius: "var(--radius)", background: "var(--bg3)", fontFamily: "var(--font)", fontSize: 12,
        color: value && (multi ? value.length > 0 : true) ? "var(--tx)" : "var(--tx3)", cursor: "pointer",
        width: "100%", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{displayValue() || placeholder || "Select..."}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0, opacity: 0.5 }}><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
      {open && rect && ReactDOM.createPortal(
        <div style={{
          position: "fixed",
          top: flipUp ? "auto" : dropdownTop,
          bottom: flipUp ? (window.innerHeight - rect.top + 4) : "auto",
          left: dropdownLeft, width: dropdownWidth, minWidth: 180,
          maxHeight: 260, background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: "var(--radius,12px)",
          boxShadow: "0 8px 30px rgba(0,0,0,.18)", zIndex: 99999, overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Type to search..."
            style={{ padding: "8px 10px", border: "none", borderBottom: "1px solid var(--bd2)", fontFamily: "var(--font)", fontSize: 12, background: "transparent", color: "var(--tx)", outline: "none" }}/>
          <div style={{ overflow: "auto", maxHeight: 200 }}>
            {multi && value?.length > 0 && <button onClick={() => onChange([])} style={{ width: "100%", padding: "6px 10px", border: "none", borderBottom: "1px solid var(--bd2)", background: "transparent", fontFamily: "var(--font)", fontSize: 11, color: "var(--red)", cursor: "pointer", textAlign: "left" }}>Clear all</button>}
            {filtered.length === 0 && <div style={{ padding: 10, fontSize: 12, color: "var(--tx3)", textAlign: "center" }}>No results</div>}
            {filtered.map((o, i) => {
              const selected = isSelected(o);
              return <button key={i} onClick={() => toggle(o)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "none",
                background: selected ? "var(--accent-light)" : "transparent", fontFamily: "var(--font)", fontSize: 12,
                color: selected ? "var(--accent-text)" : "var(--tx)", cursor: "pointer", textAlign: "left",
              }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--bg)"; }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
              >
                {multi && <span style={{ width: 14, height: 14, borderRadius: 3, border: selected ? "none" : "1.5px solid var(--bd)", background: selected ? "var(--accent-text)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {selected && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" fill="none" stroke="#fff" strokeWidth="1.5"/></svg>}
                </span>}
                <span>{getLabel(o)}</span>
              </button>;
            })}
          </div>
        </div>,
        portalEl
      )}
    </div>
  );
}

/* ═══ GLOBAL FILTER CONTEXT ═══ */
const defaultFilters = { domain: "", teams: [], month: "", people: [] };

function GlobalFilterBar({ filters, setFilters, months, teams, roster, profile, role }) {
  const isSv = hasRole(role, "qa_supervisor") && !hasRole(role, "admin");
  const isQa = role === "qa";

  // Build people options from roster
  const peopleOptions = [...new Set(roster.map(r => r.email).filter(Boolean))].sort().map(e => ({
    value: e,
    label: e.split("@")[0].split(".").map(p => p.replace(/[\d]+$/, "")).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") + ` (${e.split("@")[1]})`,
  }));

  const teamOptions = [...new Set(roster.map(r => r.queue).filter(Boolean))].sort();
  const domainOptions = [{ value: "tabby.ai", label: "tabby.ai" }, { value: "tabby.sa", label: "tabby.sa" }];

  // Lock domain for supervisors
  useEffect(() => {
    if (isSv && !filters.domain) {
      const svDomain = profile?.operational_domain || profile?.domain || "tabby.ai";
      setFilters(f => ({ ...f, domain: svDomain }));
    }
  }, [isSv, profile]);

  if (isQa) return null; // QAs don't see global filters

  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 24px",
      borderBottom: "1px solid var(--bd2)", background: "var(--bg)", fontSize: 12,
    }}>
      <span style={{ color: "var(--tx3)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px" }}>Filters</span>
      <div style={{ width: 1, height: 16, background: "var(--bd)" }}/>

      <SearchableSelect
        options={domainOptions}
        value={filters.domain}
        onChange={v => setFilters(f => ({ ...f, domain: v, teams: [], people: [] }))}
        placeholder="All domains"
        disabled={isSv}
      />

      <SearchableSelect
        options={teamOptions}
        value={filters.teams}
        onChange={v => setFilters(f => ({ ...f, teams: v }))}
        placeholder="All teams"
        multi
      />

      {months.length > 0 && <SearchableSelect
        options={months}
        value={filters.month}
        onChange={v => setFilters(f => ({ ...f, month: v }))}
        placeholder="Latest month"
      />}

      <SearchableSelect
        options={peopleOptions}
        value={filters.people}
        onChange={v => setFilters(f => ({ ...f, people: v }))}
        placeholder="All people"
        multi
      />

      {(filters.domain || filters.teams.length > 0 || filters.month || filters.people.length > 0) &&
        <button onClick={() => setFilters({ ...defaultFilters, domain: isSv ? filters.domain : "" })} style={{
          background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer",
          fontFamily: "var(--font)", fontWeight: 500, padding: "4px 8px",
        }}>Clear all</button>
      }
    </div>
  );
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://shuenqmzbrthiiokfzio.supabase.co";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNodWVucW16YnJ0aGlpb2tmemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mzc4MjAsImV4cCI6MjA5MDUxMzgyMH0.WjbpCt33uJ_hGXucKEHn0q5_daaRnGzwRDVbTxs7lG4";

const sb = {
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
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || e.details || r.statusText); }
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
    signInWithGoogle(){window.location.href=`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.origin)}`;},
    async handleCallback(){const h=window.location.hash;if(h&&h.includes("access_token")){const p=new URLSearchParams(h.substring(1));const s={access_token:p.get("access_token"),refresh_token:p.get("refresh_token"),expires_at:Number(p.get("expires_at")),user:null};try{const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${s.access_token}`}});if(r.ok)s.user=await r.json();}catch{}localStorage.setItem("sb_session",JSON.stringify(s));window.history.replaceState(null,"",window.location.pathname);return s;}const c=new URLSearchParams(window.location.search).get("code");if(c){try{const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`,{method:"POST",headers:{apikey:SUPABASE_ANON,"Content-Type":"application/json"},body:JSON.stringify({auth_code:c,code_verifier:sessionStorage.getItem("code_verifier")||""})});if(r.ok){const d=await r.json();const s={access_token:d.access_token,refresh_token:d.refresh_token,expires_at:d.expires_at,user:d.user};localStorage.setItem("sb_session",JSON.stringify(s));window.history.replaceState(null,"",window.location.pathname);return s;}}catch{}}return null;},
    signOut(){localStorage.removeItem("sb_session");sessionStorage.clear();window.location.href=window.location.origin;},
  },
};

const monday=(d)=>{const dt=new Date(d);const day=dt.getDay();const diff=dt.getDate()-day+(day===0?-6:1);dt.setDate(diff);return dt.toISOString().split("T")[0];};
const fmtWeek=(d)=>{if(!d)return"—";const dt=new Date(d+"T00:00:00");return`Week of ${dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;};

function useToast(){const[t,setT]=useState(null);const show=(type,msg)=>{setT({type,msg});setTimeout(()=>setT(null),3500);};const el=t?<div className={`toast toast-${t.type}`}>{t.msg}</div>:null;return{show,el};}

/* ═══ GLOBAL FILTER HELPERS ═══ */
// Apply global filters to MTD/roster data — call this in each page
function applyGF(rows, gf, emailField = "qa_email") {
  if (!gf || !rows) return rows;
  let r = rows;
  if (gf.domain) r = r.filter(x => (x[emailField] || x.email || "").endsWith("@" + gf.domain));
  if (gf.people?.length > 0) r = r.filter(x => gf.people.includes((x[emailField] || x.email || "").toLowerCase()));
  if (gf.teams?.length > 0) {
    // Need roster context — filter by team queue. Store on window for simplicity
    const rosterMap = window.__gfRoster || {};
    r = r.filter(x => {
      const em = (x[emailField] || x.email || "").toLowerCase();
      const q = rosterMap[em];
      return q && gf.teams.includes(q);
    });
  }
  return r;
}
function applyGFMonth(months, gf) {
  if (gf?.month) return gf.month;
  return months[0] || "";
}

const Icon=({d,size=20,color="currentColor"})=>(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>);
const icons={
  dashboard:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  leaderboard:"M16 8v8m-8-4v4m4-12v12M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  dam:"M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97L13.75 4a2 2 0 00-3.5 0L3.32 16.03A2 2 0 005.07 19z",
  plan:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  coaching:"M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  hr:"M17 20h5v-2a3 3 0 00-5.36-1.81M17 20H7m10 0v-2c0-.66-.13-1.29-.36-1.86M7 20H2v-2a3 3 0 015.36-1.81M7 20v-2c0-.66.13-1.29.36-1.86m0 0A5.97 5.97 0 0112 14c1.66 0 3.18.68 4.28 1.78M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  escalation:"M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm0 0h12",
  settings:"M10.33 3.94c.09-.56.6-.94 1.17-.94h1c.57 0 1.08.38 1.17.94l.14.84c.08.49.4.88.84 1.1.13.07.26.14.38.22.44.28.97.34 1.44.12l.8-.28c.54-.19 1.13.02 1.41.5l.5.87c.29.48.18 1.1-.25 1.45l-.66.56c-.38.32-.56.8-.52 1.28.01.15.01.3 0 .44-.04.49.14.96.52 1.28l.66.56c.43.36.54.97.25 1.45l-.5.87c-.28.48-.87.69-1.41.5l-.8-.28c-.47-.17-1-.1-1.44.12-.12.08-.25.15-.38.22-.44.22-.76.61-.84 1.1l-.14.84c-.09.56-.6.94-1.17.94h-1c-.57 0-1.08-.38-1.17-.94l-.14-.84c-.08-.49-.4-.88-.84-1.1-.13-.07-.26-.14-.38-.22-.44-.28-.97-.34-1.44-.12l-.8.28c-.54.19-1.13-.02-1.41-.5l-.5-.87c-.29-.48-.18-1.1.25-1.45l.66-.56c.38-.32.56-.8.52-1.28-.01-.15-.01-.3 0-.44.04-.49-.14-.96-.52-1.28l-.66-.56c-.43-.36-.54-.97-.25-1.45l.5-.87c.28-.48.87-.69 1.41-.5l.8.28c.47.17 1 .1 1.44-.12.12-.08.25-.15.38-.22.44-.22.76-.61.84-1.1l.14-.84zM14 12a2 2 0 11-4 0 2 2 0 014 0z",
  logout:"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  menu:"M4 6h16M4 12h16M4 18h16",
  upload:"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  plus:"M12 4v16m8-8H4",
  scores:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  check:"M5 13l4 4L19 7",
  edit:"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
};
const TabbyLogo = ({size=24, color="#3BFF9D"}) => (
  <svg width={size * 5} height={size} viewBox="0 0 500 100" fill="none">
    <rect width="500" height="100" rx="16" fill="var(--sidebar-bg)"/>
    <path d="M30 50 L55 50 L65 25 L80 75 L95 35 L105 50 L130 50" stroke="url(#logoGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <defs><linearGradient id="logoGrad" x1="30" y1="50" x2="130" y2="50"><stop offset="0%" stopColor="#3BFF9D"/><stop offset="100%" stopColor="#6A2C79"/></linearGradient></defs>
    <text x="142" y="68" fontFamily="'Plus Jakarta Sans', sans-serif" fontSize="52" fontWeight="700" fill="#fff" letterSpacing="-1">tabby</text>
    <text x="336" y="68" fontFamily="'Plus Jakarta Sans', sans-serif" fontSize="52" fontWeight="700" fill={color} letterSpacing="-1">Pulse</text>
  </svg>
);

/* ═══ DASHBOARD CHART COMPONENTS ═══ */

// Progress Ring — circular progress indicator
const ProgressRing = ({ value, max, size = 64, stroke = 5, color = "var(--tabby-green)", label, sublabel }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circ * (1 - pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bd2)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      {(label || sublabel) && <div>
        {label && <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" }}>{label}</div>}
        {sublabel && <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 500 }}>{sublabel}</div>}
      </div>}
    </div>
  );
};

// Mini Bar Chart — simple vertical bars for trend data
const MiniBarChart = ({ data, height = 48, color = "var(--tabby-green)", showLabels = false }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.min(12, (100 / data.length) - 2);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{
              width: "100%", maxWidth: barW, borderRadius: 3,
              height: `${Math.max((d.value / max) * height, 3)}px`,
              background: i === data.length - 1 ? color : "var(--bd)",
              transition: "height .6s cubic-bezier(.4,0,.2,1)",
              opacity: 0.4 + (i / data.length) * 0.6,
            }} title={`${d.label}: ${d.value}`} />
          </div>
        ))}
      </div>
      {showLabels && <div style={{ display: "flex", gap: 3 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "var(--tx3)", fontWeight: 500 }}>
            {d.label?.slice(0, 3)}
          </div>
        ))}
      </div>}
    </div>
  );
};

// Spark Line — inline trend line
const SparkLine = ({ data, width = 100, height = 28, color = "var(--tabby-green)" }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
      <circle cx={(data.length - 1) / (data.length - 1) * width} cy={height - ((data[data.length-1] - min) / range) * (height - 4) - 2} r="3" fill={color} />
    </svg>
  );
};

// Skeleton loader — shows pulsing placeholder while data loads
const SkeletonLoader = ({ rows = 4 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 8 }}>
    <div className="stats-grid">
      {[1,2,3,4].map(i => (
        <div key={i} className="stat-card" style={{ minHeight: 100 }}>
          <div style={{ width: "40%", height: 10, borderRadius: 6, background: "var(--bd2)", marginBottom: 16, animation: "pulse 1.5s ease infinite" }} />
          <div style={{ width: "60%", height: 28, borderRadius: 8, background: "var(--bd2)", animation: "pulse 1.5s ease infinite", animationDelay: `${i * 0.1}s` }} />
        </div>
      ))}
    </div>
    {[...Array(rows)].map((_, i) => (
      <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--bd2)" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bd2)", flexShrink: 0, animation: "pulse 1.5s ease infinite", animationDelay: `${i * 0.1}s` }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: `${60 + Math.random() * 30}%`, height: 12, borderRadius: 6, background: "var(--bd2)", marginBottom: 6, animation: "pulse 1.5s ease infinite" }} />
          <div style={{ width: "40%", height: 10, borderRadius: 6, background: "var(--bd2)", animation: "pulse 1.5s ease infinite" }} />
        </div>
      </div>
    ))}
  </div>
);

const GoogleLogo=()=>(<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>);

/* ═══ PAGES ═══ */

function DashboardPage({profile,token,gf}){
  const[mtd,setMtd]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);const[appProfiles,setAppProfiles]=useState([]);
  const[damCount,setDamCount]=useState(0);const[profileCount,setProfileCount]=useState({qas:0,leads:0,active:0});
  const[apPlans,setApPlans]=useState([]);const[apWeeks,setApWeeks]=useState([]);const[apDetections,setApDetections]=useState([]);
  const[apDismissals,setApDismissals]=useState([]);const[dismissModal,setDismissModal]=useState(null);const[dismissReason,setDismissReason]=useState("");
  const[userTasks,setUserTasks]=useState([]);const[showTaskForm,setShowTaskForm]=useState(false);const[taskView,setTaskView]=useState("calendar");const[hideCompleted,setHideCompleted]=useState(false);
  const[taskForm,setTaskForm]=useState({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:""});
  const[editingTask,setEditingTask]=useState(null);const[postponeModal,setPostponeModal]=useState(null);const[postponeDate,setPostponeDate]=useState("");const[postponeReason,setPostponeReason]=useState("");const[selectedTask,setSelectedTask]=useState(null);
  const[showAnnForm,setShowAnnForm]=useState(false);
  const[annForm,setAnnForm]=useState({title:"",message:"",priority:"normal",target_type:"all",target_value:""});
  const isLead=hasRole(profile?.role,"qa_lead");
  const isAdmin=hasRole(profile?.role,"admin");
  const isSupervisor=hasRole(profile?.role,"qa_supervisor");
  const canAnnounce=isAdmin||isSupervisor;
  const{show,el:toastEl}=useToast();

  const sendAnnouncement=async()=>{
    if(!annForm.title.trim()||!annForm.message.trim()){show("error","Title and message are required");return;}
    if(annForm.target_type!=="all"&&!annForm.target_value){show("error","Please select a target");return;}
    try{
      const result = await sb.query("announcements",{token,method:"POST",body:{
        title:annForm.title,message:annForm.message,priority:annForm.priority,
        target_type:annForm.target_type,target_value:annForm.target_type==="all"?null:annForm.target_value,
        sent_by:profile?.email,requires_ack:true,
      }});
      logActivity(token,profile?.email,"announcement_sent","announcements",null,`Title: ${annForm.title}, Target: ${annForm.target_type}${annForm.target_value?" ("+annForm.target_value+")":""}`);
      setShowAnnForm(false);
      setAnnForm({title:"",message:"",priority:"normal",target_type:"all",target_value:""});
      show("success","Announcement sent successfully!");
    }catch(e){
      console.error("Announcement error:", e);
      show("error","Failed: " + (e.message || "Unknown error"));
    }
  };

  const nameFromEmail=(email)=>{if(!email)return"—";const local=email.split("@")[0];return local.split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};
  const fmt=(val)=>{if(val===null||val===undefined||val==="")return"—";const s=String(val).trim();if(s.includes("%"))return s;const n=parseFloat(s.replace(",","."));if(isNaN(n))return s;if(n>=0&&n<=2)return(n*100).toFixed(1)+"%";if(n>2&&!Number.isInteger(n))return n.toFixed(1)+"%";return String(val);};

  // Slab engine for dashboard
  const parseRawD=(val)=>{if(!val&&val!==0)return null;const s=String(val).trim().replace(",",".");if(s.includes("%"))return parseFloat(s.replace("%",""));const n=parseFloat(s);if(isNaN(n))return null;if(n>=0&&n<=2)return n*100;return n;};
  const KPI_SLABS_D={occupancy:{weight:15,thresholds:[95,98,100],rawKey:"occupancy_pct"},coaching:{weight:10,thresholds:[90,93,95],rawKey:"ontime_coaching_pct"},calibration:{weight:10,thresholds:[85,90,95],rawKey:"avg_calibration_match_rate"},observation:{weight:10,thresholds:[82,85,88],rawKey:"avg_observation_score_pct"},rtr:{weight:10,thresholds:[80,85,90],rawKey:"avg_rtr_score"}};
  const calcSlabD=(rawPct,th)=>{if(rawPct===null)return 0;if(rawPct>=th[2])return 100;if(rawPct>=th[1])return 75;if(rawPct>=th[0])return 50;return 0;};
  const getScore=(row)=>{return Object.values(KPI_SLABS_D).reduce((sum,def)=>{const raw=parseRawD(row[def.rawKey]);return sum+(def.weight*calcSlabD(raw,def.thresholds))/100;},0);};
  const maxScore=55;
  const scoreColor=(v)=>v>=maxScore*0.7?"var(--green)":v>=maxScore*0.4?"var(--amber)":"var(--red)";
  const scoreBg=(v)=>v>=maxScore*0.7?"var(--green-bg)":v>=maxScore*0.4?"var(--amber-bg)":"var(--red-bg)";

  useEffect(()=>{(async()=>{try{
    const[mtdRows,rosterRows,damFlagsRaw,profs,plans,planWeeks,dismissals,damStepsRaw]=await Promise.all([
      sb.query("mtd_scores",{select:"*",filters:"order=month.desc",token}).catch(()=>[]),
      sb.query("qa_roster",{select:"*",token}).catch(()=>[]),
      sb.query("dam_flags",{select:"id,profile_id,qa_email,rule_id,occurrence_number,status,profiles!dam_flags_profile_id_fkey(email,display_name),dam_rules(name,behavior_type)",filters:"order=triggered_at.desc",token}).catch(()=>[]),
      sb.query("profiles",{select:"id,email,display_name,role,status",filters:"status=eq.active",token}).catch(()=>[]),
      sb.query("action_plans",{select:"*",filters:"order=created_at.desc",token}).catch(()=>[]),
      sb.query("action_plan_weeks",{select:"*",filters:"order=plan_id.asc,week_number.asc",token}).catch(()=>[]),
      sb.query("ap_dismissals",{select:"*",filters:"order=created_at.desc",token}).catch(()=>[]),
      sb.query("dam_escalation_steps",{select:"id,rule_id,occurrence,action,includes_pip,pip_action",token}).catch(()=>[]),
    ]);
    // Build blacklist for non-QA users (both domain variants)
    const nonQaProfsD = profs.filter(p => p.role !== "qa");
    const blacklistD = new Set();
    nonQaProfsD.forEach(p => {
      const em = p.email?.toLowerCase(); if (!em) return;
      blacklistD.add(em);
      const local = em.split("@")[0];
      if (em.endsWith("@tabby.ai")) blacklistD.add(local + "@tabby.sa");
      if (em.endsWith("@tabby.sa")) blacklistD.add(local + "@tabby.ai");
    });
    // Build valid manager set — only QA Lead+ emails (both domain variants)
    const validManagers = new Set();
    profs.filter(p => p.role !== "qa").forEach(p => {
      const em = p.email?.toLowerCase(); if (!em) return;
      validManagers.add(em);
      const local = em.split("@")[0];
      if (em.endsWith("@tabby.ai")) validManagers.add(local + "@tabby.sa");
      if (em.endsWith("@tabby.sa")) validManagers.add(local + "@tabby.ai");
      // Also add without domain for partial matches (roster stores "name" not "name@domain")
      validManagers.add(local);
    });
    // Filter roster: exclude non-QA profiles AND exclude entries with unknown managers
    const filteredRoster = rosterRows.filter(r => {
      if (blacklistD.has(r.email?.toLowerCase())) return false;
      const mgr = r.manager_email?.toLowerCase();
      if (!mgr) return false; // No manager = external/unassigned
      // Check if manager_email matches a known lead (full email or local part)
      if (validManagers.has(mgr)) return true;
      const mgrLocal = mgr.split("@")[0];
      if (validManagers.has(mgrLocal)) return true;
      return false;
    });
    const filteredMtd = mtdRows.filter(r => !blacklistD.has(r.qa_email?.toLowerCase()));
    // Normalize cross-domain: if a QA exists in roster as @tabby.ai, normalize their @tabby.sa MTD records to @tabby.ai (and vice versa)
    const rosterEmailSet = new Set(filteredRoster.map(r=>r.email?.toLowerCase()));
    const normalizedMtd = filteredMtd.map(r => {
      const em = r.qa_email?.toLowerCase();
      if (!em) return r;
      if (rosterEmailSet.has(em)) return r; // already matches roster
      const local = em.split("@")[0];
      const alt = em.endsWith("@tabby.ai") ? local+"@tabby.sa" : local+"@tabby.ai";
      if (rosterEmailSet.has(alt)) return {...r, qa_email: alt}; // normalize to roster email
      return r;
    });
    // Also normalize qa_tl field
    const normalizedMtd2 = normalizedMtd.map(r => {
      const tl = r.qa_tl?.toLowerCase();
      if (!tl) return r;
      const tlLocal = tl.split("@")[0];
      const tlAlt = tl.endsWith("@tabby.ai") ? tlLocal+"@tabby.sa" : tlLocal+"@tabby.ai";
      // If the TL is in profiles under the alt email, normalize
      const profEmails = new Set(profs.map(p=>p.email?.toLowerCase()));
      if (!profEmails.has(tl) && profEmails.has(tlAlt)) return {...r, qa_tl: tlAlt};
      return r;
    });
    setMtd(normalizedMtd2);setRoster(filteredRoster);setAppProfiles(profs);setDamCount(damFlagsRaw.filter(f=>f.status==="pending").length);
    setProfileCount({qas:filteredRoster.length,leads:[...new Set(filteredRoster.map(r=>r.manager_email).filter(Boolean))].length,active:profs.length});
    setApPlans(plans);setApWeeks(planWeeks);setApDismissals(dismissals);

    // Auto-detection for TL dashboard alert — DAM-driven
    if(hasRole(profile?.role,"qa_lead")){
      const dismissedEmails=new Set(dismissals.map(d=>d.qa_email?.toLowerCase()));
      const activePlanEmails=plans.filter(p=>p.status==="active"||p.status==="pending_review").map(p=>p.qa_email?.toLowerCase());
      const pEmail=profile?.email?.toLowerCase()||"";
      const pLocal=pEmail.split("@")[0];
      const pAlt=pEmail.endsWith("@tabby.ai")?pLocal+"@tabby.sa":pLocal+"@tabby.ai";
      const myTeam=rosterRows.filter(r=>{const m=r.manager_email?.toLowerCase();return m&&(m===pEmail||m===pAlt||m===pLocal);}).map(r=>r.email.toLowerCase());
      const mnths=sortMonthsDesc([...new Set(mtdRows.map(r=>r.month))]);
      const latestMtd=mtdRows.filter(r=>r.month===mnths[0]);
      const myTlRows=latestMtd.filter(r=>{const tl=r.qa_tl?.toLowerCase();return tl&&(tl===pEmail||tl===pAlt);}).map(r=>r.qa_email?.toLowerCase());
      const teamEmails=[...new Set([...myTeam,...myTlRows])];

      const activeFlags=(damFlagsRaw||[]).filter(f=>f.status==="pending"||f.status==="acknowledged");
      const flagged=[];
      activeFlags.forEach(flag=>{
        const email=flag.profiles?.email||flag.qa_email?.toLowerCase();
        if(!email)return;
        if(activePlanEmails.includes(email))return;
        if(dismissedEmails.has(email))return;
        if(teamEmails.length>0&&!teamEmails.includes(email))return;
        if(flagged.find(f=>f.email?.toLowerCase()===email))return;

        const step=(damStepsRaw||[]).find(s=>s.rule_id===flag.rule_id&&s.occurrence===flag.occurrence_number);
        if(!step||!step.includes_pip)return;

        const row=latestMtd.find(r=>r.qa_email?.toLowerCase()===email);
        const score=row?getScore(row):0;
        const ruleName=flag.dam_rules?.name||"Unknown";
        const pipAction=step.pip_action||step.action||"AP required";
        flagged.push({email:flag.profiles?.email||flag.qa_email||email,name:flag.profiles?.display_name||nameFromEmail(email),score,reason:`DAM: ${ruleName} — #${flag.occurrence_number}: ${pipAction}`,slab0Count:0,planType:step.includes_pip?"pip":"ap"});
      });
      flagged.sort((a,b)=>a.score-b.score);
      setApDetections(flagged);
    }
  }catch(e){console.error("Dashboard:",e);}setLoading(false);})();},[token]);

  // Load user tasks
  const loadTasks=useCallback(async()=>{try{
    const myEmail=profile?.email?.toLowerCase();
    const t=await sb.query("tasks",{select:"*",filters:"order=priority.asc,due_date.asc",token}).catch(()=>[]);
    // Show tasks created by me OR assigned to me
    const mine=t.filter(tk=>tk.created_by?.toLowerCase()===myEmail||tk.assigned_to?.toLowerCase()===myEmail);
    setUserTasks(mine);
  }catch(e){console.error("Tasks:",e);}},[token,profile?.email]);
  useEffect(()=>{if(profile?.email)loadTasks();},[loadTasks,profile?.email]);

  const months=sortMonthsDesc([...new Set(mtd.map(r=>r.month))]);
  const latestMonth=months[0]||"—";
  const prevMonth=months[1]||null;

  const current=mtd.filter(r=>r.month===latestMonth);
  const previous=prevMonth?mtd.filter(r=>r.month===prevMonth):[];

  const myEmail=profile?.email?.toLowerCase();
  const myData=current.find(r=>r.qa_email?.toLowerCase()===myEmail);
  const myPrevData=previous.find(r=>r.qa_email?.toLowerCase()===myEmail);

  // Rank by calculated score
  const ranked=[...current].sort((a,b)=>getScore(b)-getScore(a));
  const myRank=ranked.findIndex(r=>r.qa_email?.toLowerCase()===myEmail)+1;

  const myRoster=roster.find(r=>r.email.toLowerCase()===myEmail);

  // Team members — match both domain variants of myEmail
  const myEmailLocal=myEmail?myEmail.split("@")[0]:"";
  const myEmailAlt=myEmail?(myEmail.endsWith("@tabby.ai")?myEmailLocal+"@tabby.sa":myEmailLocal+"@tabby.ai"):"";
  const myTeamEmails=roster.filter(r=>{
    const mgr=r.manager_email?.toLowerCase();
    return mgr&&(mgr===myEmail||mgr===myEmailAlt||mgr===myEmailLocal);
  }).map(r=>r.email.toLowerCase());
  const myTlEmails=current.filter(r=>{
    const tl=r.qa_tl?.toLowerCase();
    return tl&&(tl===myEmail||tl===myEmailAlt||tl===myEmailLocal);
  }).map(r=>r.qa_email?.toLowerCase());
  const allTeamEmails=[...new Set([...myTeamEmails,...myTlEmails])];
  const teamCurrent=current.filter(r=>allTeamEmails.includes(r.qa_email?.toLowerCase()));
  const teamPrevious=previous.filter(r=>allTeamEmails.includes(r.qa_email?.toLowerCase()));
  const teamSorted=[...teamCurrent].sort((a,b)=>getScore(b)-getScore(a));

  // Team averages using calculated scores
  const teamAvgScore=teamCurrent.length?(teamCurrent.reduce((a,r)=>a+getScore(r),0)/teamCurrent.length):0;
  const teamAvgScorePrev=teamPrevious.length?(teamPrevious.reduce((a,r)=>a+getScore(r),0)/teamPrevious.length):0;
  const teamTrend=teamPrevious.length?(teamAvgScore-teamAvgScorePrev).toFixed(1):null;
  const teamDsat=teamCurrent.reduce((a,r)=>a+(r.dsat||0),0);

  // Performance trend sparkline using calculated scores
  const myHistory=months.slice(0,6).reverse().map(m=>{const row=mtd.find(r=>r.month===m&&r.qa_email?.toLowerCase()===myEmail);return{month:m,score:row?getScore(row):null};}).filter(d=>d.score!==null);

  const nav=(page)=>window.dispatchEvent(new CustomEvent("navigate",{detail:page}));

  // Task CRUD — optimistic updates
  const saveTask=async()=>{
    if(!taskForm.title.trim()){show("error","Task title is required");return;}
    try{
      const body={title:taskForm.title,description:taskForm.description||null,priority:taskForm.priority,due_date:taskForm.due_date||null,eta_date:taskForm.eta_date||null,created_by:profile?.email,assigned_to:taskForm.assigned_to||null,updated_at:new Date().toISOString()};
      if(editingTask){
        await sb.query("tasks",{token,method:"PATCH",body,filters:`id=eq.${editingTask.id}`});
        setUserTasks(prev=>prev.map(t=>t.id===editingTask.id?{...t,...body}:t));
        logActivity(token,profile?.email,"task_updated","tasks",editingTask.id,`Title: ${taskForm.title}`);
        show("success","Task updated");
      }else{
        const result = await sb.query("tasks",{token,method:"POST",body});
        const created = Array.isArray(result) ? result[0] : result;
        if(created?.id) {
          setUserTasks(prev=>[created,...prev]);
        } else {
          // Fallback: build task locally with temp id
          setUserTasks(prev=>[{...body, id:"temp-"+Date.now(), status:"pending", created_at:new Date().toISOString()}, ...prev]);
        }
        logActivity(token,profile?.email,"task_created","tasks",null,`Title: ${taskForm.title}${taskForm.assigned_to?", Assigned to: "+taskForm.assigned_to:""}`);
        show("success",taskForm.assigned_to?`Task created and assigned to ${nameFromEmail(taskForm.assigned_to)}`:"Task created");
      }
      setShowTaskForm(false);setEditingTask(null);setTaskForm({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:""});
    }catch(e){show("error",e.message);}
  };
  const toggleTaskDone=async(task)=>{
    const newStatus=task.status==="done"?"pending":"done";
    setUserTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:newStatus,completed_at:newStatus==="done"?new Date().toISOString():null}:t));
    try{
      await sb.query("tasks",{token,method:"PATCH",body:{status:newStatus,completed_at:newStatus==="done"?new Date().toISOString():null,updated_at:new Date().toISOString()},filters:`id=eq.${task.id}`});
      logActivity(token,profile?.email,newStatus==="done"?"task_completed":"task_reopened","tasks",task.id,`Title: ${task.title}`);
    }catch(e){show("error",e.message);setUserTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:task.status}:t));}
  };
  const postponeTask=async()=>{
    if(!postponeDate){show("error","Select a new date");return;}
    try{
      await sb.query("tasks",{token,method:"PATCH",body:{status:"postponed",postponed_to:postponeDate,postpone_reason:postponeReason||null,due_date:postponeDate,updated_at:new Date().toISOString()},filters:`id=eq.${postponeModal.id}`});
      setUserTasks(prev=>prev.map(t=>t.id===postponeModal.id?{...t,status:"postponed",eta_date:postponeDate}:t));
      logActivity(token,profile?.email,"task_postponed","tasks",postponeModal.id,`Title: ${postponeModal.title}, New date: ${postponeDate}`);
      show("success","Task postponed");setPostponeModal(null);setPostponeDate("");setPostponeReason("");
    }catch(e){show("error",e.message);}
  };
  const deleteTask=async(task)=>{
    if(!confirm("Delete this task?"))return;
    setUserTasks(prev=>prev.filter(t=>t.id!==task.id));
    try{
      await sb.query("tasks",{token,method:"DELETE",filters:`id=eq.${task.id}`});
      logActivity(token,profile?.email,"task_deleted","tasks",task.id,`Title: ${task.title}`);
      show("success","Task deleted");
    }catch(e){show("error",e.message);loadTasks();}
  };
  const priorityConfig={urgent:{label:"Urgent",color:"var(--red)",bg:"var(--red-bg)"},high:{label:"High",color:"var(--amber)",bg:"var(--amber-bg)"},medium:{label:"Medium",color:"var(--tabby-purple)",bg:"var(--primary-light)"},low:{label:"Low",color:"var(--tx3)",bg:"var(--bg2)"}};
  const activeTasks=userTasks.filter(t=>t.status!=="done");
  const doneTasks=userTasks.filter(t=>t.status==="done");

  const[syncing,setSyncing]=useState(false);

  return(<div className="page">
    {/* Admin/Supervisor action bar */}
    {(hasRole(profile?.role,"super_admin")||canAnnounce)&&<div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8}}>
      {canAnnounce&&<button className="btn btn-outline btn-sm" onClick={()=>setShowAnnForm(!showAnnForm)} style={{fontSize:12}}>
        <Icon d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" size={14}/>Send announcement
      </button>}
      {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" disabled={syncing} onClick={async()=>{
        setSyncing(true);
        try{
          const r=await fetch("https://script.google.com/macros/s/AKfycbwpQjACvkSQBkbJok5L00-jXNMJm9x8b5-cdd4c5imZXeXCD5eHu8_zCsRNgWIegzvZ/exec",{method:"POST",mode:"no-cors"});
          show("success","Sync triggered — data will update in ~30 seconds");
          logActivity(token, profile?.email, "mtd_sync_triggered", "mtd_scores", null, "Manual sync from dashboard");
        }catch(e){
          show("error","Sync request failed: "+e.message);
        }
        setSyncing(false);
      }} style={{fontSize:12}}>
        {syncing?<><div className="spinner" style={{width:14,height:14,borderWidth:2,marginRight:6}}/>Syncing...</>:<><Icon d={icons.upload} size={14}/>Sync MTD data</>}
      </button>}
    </div>}

    {/* Announcement form */}
    {showAnnForm&&<div className="card" style={{marginBottom:16,borderLeft:"4px solid var(--tabby-purple,#6A2C79)"}}>
      <div className="card-header"><span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>📢</span>Send Announcement</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div className="form-group" style={{gridColumn:"1/-1"}}>
          <label className="form-label">Title *</label>
          <input className="form-input" value={annForm.title} onChange={e=>setAnnForm({...annForm,title:e.target.value})} placeholder="Announcement title..." autoFocus/>
        </div>
        <div className="form-group" style={{gridColumn:"1/-1"}}>
          <label className="form-label">Message *</label>
          <textarea className="form-input" rows={4} value={annForm.message} onChange={e=>setAnnForm({...annForm,message:e.target.value})} placeholder="Write your message here..." style={{resize:"vertical"}}/>
        </div>
        <div className="form-group">
          <label className="form-label">Priority</label>
          <SearchableSelect options={[{value:"normal",label:"ℹ️ Normal"},{value:"important",label:"⚠️ Important"},{value:"urgent",label:"🔴 Urgent"}]} value={annForm.priority} onChange={v=>setAnnForm({...annForm,priority:v})} placeholder="Normal"/>
        </div>
        <div className="form-group">
          <label className="form-label">Send to</label>
          <SearchableSelect options={[{value:"all",label:"Everyone"},{value:"domain",label:"Specific domain"},{value:"team",label:"Specific team"},{value:"individual",label:"Individual person"}]} value={annForm.target_type} onChange={v=>setAnnForm({...annForm,target_type:v,target_value:""})} placeholder="Everyone"/>
        </div>
        {annForm.target_type==="domain"&&<div className="form-group">
          <label className="form-label">Domain</label>
          <SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select domain"/>
        </div>}
        {annForm.target_type==="team"&&<div className="form-group">
          <label className="form-label">Team</label>
          <SearchableSelect options={[...new Set(roster.map(r=>r.queue).filter(Boolean))].sort()} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select team"/>
        </div>}
        {annForm.target_type==="individual"&&<div className="form-group">
          <label className="form-label">Person</label>
          <SearchableSelect options={roster.map(r=>({value:r.email,label:nameFromEmail(r.email)+` (${r.email.split("@")[1]})`}))} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select person"/>
        </div>}
      </div>
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button className="btn btn-primary" onClick={sendAnnouncement}>Send announcement</button>
        <button className="btn btn-outline" onClick={()=>setShowAnnForm(false)}>Cancel</button>
      </div>
    </div>}
    <div className="welcome-banner">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:48,height:48,borderRadius:"50%",overflow:"hidden",flexShrink:0,border:"2px solid rgba(255,255,255,.2)"}}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{width:48,height:48,objectFit:"cover"}}/> :
            <div style={{width:48,height:48,background:"linear-gradient(135deg, var(--tabby-purple), var(--tabby-purple-light))",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700}}>{(profile?.display_name||"U").split(" ").map(p=>p[0]).join("").slice(0,2).toUpperCase()}</div>}
          </div>
          <div>
            <h2>Welcome back, {profile?.display_name?.split(" ")[0]||"there"}</h2>
            <p>{isLead?"Here's your team overview for "+latestMonth+".":"Here's your performance overview for "+latestMonth+"."}</p>
            <div className="welcome-role">{ROLE_LABELS[profile?.role]||"QA"} &middot; {profile?.domain}{myRoster?" · "+myRoster.queue:""}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",position:"relative",zIndex:1}}>
          <button onClick={()=>nav("leaderboard")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor="rgba(59,255,157,.3)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
          >Leaderboard →</button>
          {isLead&&<button onClick={()=>nav("scores")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor="rgba(59,255,157,.3)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
          >Performance →</button>}
        </div>
      </div>
    </div>
    {loading?<SkeletonLoader rows={3}/>:<>

    {/* ── User Task Management ── */}
    <div className="card" style={{marginBottom:20}}>
      <div className="card-header">
        <span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>✅</span> My Tasks
          {activeTasks.length>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:"var(--primary-light)",color:"var(--tabby-purple,var(--primary-text))",fontWeight:700}}>{activeTasks.length}</span>}
        </span>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{display:"flex",borderRadius:8,border:"1px solid var(--bd)",overflow:"hidden"}}>
            <button onClick={()=>setTaskView("calendar")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:taskView==="calendar"?"var(--tabby-purple)":"transparent",color:taskView==="calendar"?"#fff":"var(--tx3)"}}>Calendar</button>
            <button onClick={()=>setTaskView("list")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:taskView==="list"?"var(--tabby-purple)":"transparent",color:taskView==="list"?"#fff":"var(--tx3)"}}>List</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>{setShowTaskForm(true);setEditingTask(null);setTaskForm({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:""});}}>
            <Icon d={icons.plus} size={14}/>New task
          </button>
        </div>
      </div>

      {/* Task form */}
      {showTaskForm&&<div style={{marginBottom:16,padding:16,background:"var(--bg)",borderRadius:10,border:"1px solid var(--bd2)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
          <div className="form-group"><label className="form-label">Title *</label><input className="form-input" value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} placeholder="What needs to be done?" autoFocus/></div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})} placeholder="Add details..." style={{resize:"vertical"}}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <SearchableSelect options={[{value:"urgent",label:"🔴 Urgent"},{value:"high",label:"🟠 High"},{value:"medium",label:"🟣 Medium"},{value:"low",label:"⚪ Low"}]} value={taskForm.priority} onChange={v=>setTaskForm({...taskForm,priority:v})} placeholder="Medium"/>
            </div>
            <div className="form-group"><label className="form-label">ETA</label><input type="date" className="form-input" value={taskForm.eta_date} onChange={e=>setTaskForm({...taskForm,eta_date:e.target.value})}/></div>
          </div>
          {isAdmin&&<div className="form-group">
            <label className="form-label">Assign to</label>
            <SearchableSelect options={(()=>{const seen=new Set();const opts=[];appProfiles.forEach(p=>{const em=p.email?.toLowerCase();if(!em||seen.has(em))return;seen.add(em);opts.push({value:em,label:(p.display_name||nameFromEmail(em))+` (${ROLE_LABELS[p.role]||p.role})`});});roster.forEach(r=>{const em=r.email?.toLowerCase();if(!em||seen.has(em))return;seen.add(em);opts.push({value:em,label:nameFromEmail(em)+` (${r.queue||"QA"})`});});return opts.sort((a,b)=>a.label.localeCompare(b.label));})()}
              value={taskForm.assigned_to} onChange={v=>setTaskForm({...taskForm,assigned_to:v})} placeholder="Assign to someone..."/>
          </div>}
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button className="btn btn-primary btn-sm" onClick={saveTask}>{editingTask?"Update":"Create"}</button>
          <button className="btn btn-outline btn-sm" onClick={()=>{setShowTaskForm(false);setEditingTask(null);}}>Cancel</button>
        </div>
      </div>}

      {/* ── CALENDAR VIEW ── */}
      {taskView==="calendar"&&(()=>{
        const allTasks = hideCompleted ? activeTasks : userTasks;
        const today = new Date(); today.setHours(0,0,0,0);
        const todayStr = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
        const fmtDate = (d) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");

        // Build 5 base days
        const baseDays = [];
        for(let i=0;i<5;i++){
          const d=new Date(today);d.setDate(d.getDate()+i);
          const dateStr=fmtDate(d);
          const dayTasks=allTasks.filter(t=>(t.eta_date||t.due_date)===dateStr);
          baseDays.push({date:d,dateStr,tasks:dayTasks,isToday:i===0});
        }

        // Find urgent/high tasks beyond 5 days (up to 30 days out)
        const extraDays = [];
        for(let i=5;i<30;i++){
          const d=new Date(today);d.setDate(d.getDate()+i);
          const dateStr=fmtDate(d);
          const dayTasks=allTasks.filter(t=>(t.eta_date||t.due_date)===dateStr);
          const hasUrgent=dayTasks.some(t=>t.priority==="urgent"||t.priority==="high");
          if(hasUrgent) extraDays.push({date:d,dateStr,tasks:dayTasks,isToday:false,isExtra:true});
        }

        const noDateTasks=allTasks.filter(t=>!t.eta_date&&!t.due_date);
        const overdueTasks=activeTasks.filter(t=>{const eta=t.eta_date||t.due_date;return eta&&eta<todayStr;});
        const renderMini=(task)=>{const pc=priorityConfig[task.priority]||priorityConfig.medium;const isDone=task.status==="done";return <div key={task.id} onClick={()=>setSelectedTask(task)} style={{padding:"6px 10px",borderRadius:8,background:isDone?"transparent":"var(--bg3)",borderLeft:`3px solid ${isDone?"var(--green)":pc.color}`,marginBottom:4,display:"flex",alignItems:"center",gap:8,opacity:isDone?.5:1,cursor:"pointer"}}>
          <button onClick={(e)=>{e.stopPropagation();toggleTaskDone(task);}} style={{width:18,height:18,borderRadius:5,border:`2px solid ${isDone?"var(--green)":pc.color}`,background:isDone?"var(--green)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,padding:0}}>
            {isDone&&<svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>}
          </button>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:500,textDecoration:isDone?"line-through":"none",color:isDone?"var(--tx3)":"var(--tx)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{task.title}</div>
            {task.assigned_to&&task.created_by?.toLowerCase()===myEmail&&<div style={{fontSize:10,color:"var(--accent-text)",marginTop:1}}>→ {nameFromEmail(task.assigned_to)}</div>}
          </div>
        </div>;};
        return <div>
          {overdueTasks.length>0&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:700,color:"var(--red)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6,display:"flex",alignItems:"center",gap:6}}><Icon d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" size={14}/>Overdue ({overdueTasks.length})</div>{overdueTasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderMini)}</div>}

          {/* 5-day strip */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
            {baseDays.map(day=><div key={day.dateStr} style={{minHeight:90,padding:8,borderRadius:10,background:day.isToday?"var(--primary-light)":"var(--bg)",border:day.isToday?"1.5px solid var(--tabby-purple)":"1px solid var(--bd2)"}}>
              <div style={{fontSize:12,fontWeight:day.isToday?700:500,color:day.isToday?"var(--tabby-purple,var(--primary-text))":"var(--tx2)",marginBottom:6}}>
                <div style={{fontSize:10,color:day.isToday?"var(--tabby-purple,var(--primary-text))":"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>{day.date.toLocaleDateString("en-GB",{weekday:"short"})}</div>
                {day.date.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
              </div>
              {day.tasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(t=>{const pc=priorityConfig[t.priority]||priorityConfig.medium;const isDone=t.status==="done";return <div key={t.id} onClick={()=>setSelectedTask(t)} style={{padding:"4px 8px",borderRadius:6,marginBottom:3,cursor:"pointer",background:isDone?"transparent":pc.bg,borderLeft:`3px solid ${isDone?"var(--green)":pc.color}`,fontSize:11,fontWeight:500,color:isDone?"var(--tx3)":"var(--tx)",textDecoration:isDone?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",opacity:isDone?.5:1}}>{t.title}</div>;})}
            </div>)}
          </div>

          {/* Extra days with urgent tasks */}
          {extraDays.length>0&&<div style={{marginTop:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={14}/>Upcoming urgent ({extraDays.reduce((a,d)=>a+d.tasks.filter(t=>t.priority==="urgent"||t.priority==="high").length,0)})
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
              {extraDays.map(day=><div key={day.dateStr} style={{padding:8,borderRadius:10,background:"var(--bg)",border:"1px solid var(--amber)",borderColor:"rgba(245,158,11,.3)"}}>
                <div style={{fontSize:11,fontWeight:600,color:"var(--tx2)",marginBottom:6}}>
                  {day.date.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
                </div>
                {day.tasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(t=>{const pc=priorityConfig[t.priority]||priorityConfig.medium;const isDone=t.status==="done";return <div key={t.id} onClick={()=>setSelectedTask(t)} style={{padding:"4px 8px",borderRadius:6,marginBottom:3,cursor:"pointer",background:isDone?"transparent":pc.bg,borderLeft:`3px solid ${isDone?"var(--green)":pc.color}`,fontSize:11,fontWeight:500,color:isDone?"var(--tx3)":"var(--tx)",textDecoration:isDone?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",opacity:isDone?.5:1}}>{t.title}</div>;})}
              </div>)}
            </div>
          </div>}

          {noDateTasks.length>0&&<div style={{marginTop:12}}><div style={{fontSize:11,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>No date set ({noDateTasks.length})</div>{noDateTasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderMini)}</div>}
          {doneTasks.length>0&&<div style={{marginTop:12}}><button onClick={()=>setHideCompleted(!hideCompleted)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--tx3)",fontWeight:500,fontFamily:"var(--font)",padding:0}}>{hideCompleted?"Show":"Hide"} {doneTasks.length} completed</button></div>}
        </div>;
      })()}

      {/* ── LIST VIEW ── */}
      {taskView==="list"&&<>
      {activeTasks.length===0&&!showTaskForm?<div style={{textAlign:"center",padding:"24px 0",color:"var(--tx3)",fontSize:13}}>No active tasks</div>:
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {activeTasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(task=>{
            const pc=priorityConfig[task.priority]||priorityConfig.medium;const isOverdue=task.eta_date&&new Date(task.eta_date)<new Date()&&task.status!=="done";const isAssignedToMe=task.assigned_to?.toLowerCase()===myEmail&&task.created_by?.toLowerCase()!==myEmail;
            return <div key={task.id} style={{padding:"14px 18px",borderRadius:12,background:"var(--bg3)",border:"1px solid var(--bd2)",borderLeft:`4px solid ${isOverdue?"var(--red)":pc.color}`}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                <button onClick={()=>toggleTaskDone(task)} style={{width:24,height:24,borderRadius:8,border:`2px solid ${pc.color}`,background:task.status==="done"?pc.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,marginTop:2}}>
                  {task.status==="done"&&<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>}
                </button>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,textDecoration:task.status==="done"?"line-through":"none",color:task.status==="done"?"var(--tx3)":"var(--tx)",marginBottom:6}}>{task.title}</div>
                  {task.description&&<div style={{fontSize:12,color:"var(--tx2)",marginBottom:8,lineHeight:1.5,opacity:.85}}>{task.description}</div>}
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:pc.bg,color:pc.color,fontWeight:700,textTransform:"uppercase"}}>{pc.label}</span>
                    {task.eta_date&&<span style={{fontSize:11,color:isOverdue?"var(--red)":"var(--tx3)",fontWeight:isOverdue?600:400,display:"flex",alignItems:"center",gap:4}}><Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={12}/>{isOverdue?"Overdue":"ETA"}: {new Date(task.eta_date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>}
                    {isAssignedToMe&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--amber-bg)",color:"var(--amber)",fontWeight:600}}>Assigned by {nameFromEmail(task.created_by)}</span>}
                    {task.assigned_to&&task.created_by?.toLowerCase()===myEmail&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--accent-light)",color:"var(--accent-text)",fontWeight:600}}>→ {nameFromEmail(task.assigned_to)}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:2,flexShrink:0}}>
                  <button onClick={()=>setPostponeModal(task)} title="Postpone" style={{background:"none",border:"none",cursor:"pointer",padding:6,borderRadius:8,color:"var(--tx3)"}} onMouseEnter={e=>{e.currentTarget.style.color="var(--amber)";e.currentTarget.style.background="var(--amber-bg)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--tx3)";e.currentTarget.style.background="none";}}><Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={16}/></button>
                  <button onClick={()=>{setEditingTask(task);setTaskForm({title:task.title,description:task.description||"",priority:task.priority,due_date:"",eta_date:task.eta_date||"",assigned_to:task.assigned_to||""});setShowTaskForm(true);}} title="Edit" style={{background:"none",border:"none",cursor:"pointer",padding:6,borderRadius:8,color:"var(--tx3)"}} onMouseEnter={e=>{e.currentTarget.style.color="var(--accent-text)";e.currentTarget.style.background="var(--accent-light)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--tx3)";e.currentTarget.style.background="none";}}><Icon d={icons.edit} size={16}/></button>
                  <button onClick={()=>deleteTask(task)} title="Delete" style={{background:"none",border:"none",cursor:"pointer",padding:6,borderRadius:8,color:"var(--tx3)"}} onMouseEnter={e=>{e.currentTarget.style.color="var(--red)";e.currentTarget.style.background="var(--red-bg)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--tx3)";e.currentTarget.style.background="none";}}><Icon d={icons.trash} size={16}/></button>
                </div>
              </div>
            </div>;
          })}
        </div>}
      {doneTasks.length>0&&<div style={{marginTop:12}}>
        <button onClick={()=>setHideCompleted(!hideCompleted)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--tx3)",fontWeight:500,fontFamily:"var(--font)",padding:"4px 0",display:"flex",alignItems:"center",gap:4}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:hideCompleted?"rotate(-90deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg>
          {doneTasks.length} completed task{doneTasks.length!==1?"s":""}
        </button>
        {!hideCompleted&&<div style={{marginTop:4}}>
          {doneTasks.map(task=><div key={task.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",opacity:.5}}>
            <button onClick={()=>toggleTaskDone(task)} style={{width:20,height:20,borderRadius:6,border:"2px solid var(--green)",background:"var(--green)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
              <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
            <span style={{flex:1,fontSize:13,textDecoration:"line-through",color:"var(--tx3)"}}>{task.title}</span>
            <span style={{fontSize:11,color:"var(--tx3)"}}>{task.completed_at?new Date(task.completed_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):""}</span>
            <button onClick={()=>deleteTask(task)} style={{background:"none",border:"none",cursor:"pointer",padding:4,color:"var(--tx3)"}}><Icon d={icons.trash} size={14}/></button>
          </div>)}
        </div>}
      </div>}
      </>}
    </div>

    {/* ── Task Detail Modal ── */}
    {selectedTask&&(()=>{
      const t=userTasks.find(x=>x.id===selectedTask.id)||selectedTask;
      const pc=priorityConfig[t.priority]||priorityConfig.medium;
      const isDone=t.status==="done";
      const isOverdue=t.eta_date&&new Date(t.eta_date+"T00:00:00")<new Date()&&!isDone;
      return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={e=>{if(e.target===e.currentTarget)setSelectedTask(null);}}>
        <div className="card" style={{width:"100%",maxWidth:440,margin:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:10,padding:"2px 10px",borderRadius:8,background:pc.bg,color:pc.color,fontWeight:700,textTransform:"uppercase"}}>{pc.label}</span>
              {isDone&&<span style={{fontSize:10,padding:"2px 10px",borderRadius:8,background:"var(--green-bg)",color:"var(--green)",fontWeight:700}}>Completed</span>}
              {isOverdue&&<span style={{fontSize:10,padding:"2px 10px",borderRadius:8,background:"var(--red-bg)",color:"var(--red)",fontWeight:700}}>Overdue</span>}
            </div>
            <button onClick={()=>setSelectedTask(null)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:18,padding:0,lineHeight:1}}>×</button>
          </div>
          <div style={{fontSize:18,fontWeight:700,color:"var(--tx)",marginBottom:8,textDecoration:isDone?"line-through":"none"}}>{t.title}</div>
          {t.description&&<div style={{fontSize:13,color:"var(--tx2)",marginBottom:16,lineHeight:1.6,padding:"10px 14px",background:"var(--bg)",borderRadius:8}}>{t.description}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16,fontSize:13}}>
            {t.eta_date&&<div><span style={{color:"var(--tx3)",fontSize:11}}>ETA</span><div style={{fontWeight:500,color:isOverdue?"var(--red)":"var(--tx)"}}>{new Date(t.eta_date+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</div></div>}
            {t.assigned_to&&<div><span style={{color:"var(--tx3)",fontSize:11}}>Assigned to</span><div style={{fontWeight:500}}>{nameFromEmail(t.assigned_to)}</div></div>}
            {t.created_by&&<div><span style={{color:"var(--tx3)",fontSize:11}}>Created by</span><div style={{fontWeight:500}}>{nameFromEmail(t.created_by)}</div></div>}
            {t.created_at&&<div><span style={{color:"var(--tx3)",fontSize:11}}>Created</span><div style={{fontWeight:500}}>{new Date(t.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div></div>}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={`btn ${isDone?"btn-outline":"btn-primary"} btn-sm`} style={isDone?{}:{background:"var(--green)"}} onClick={()=>{toggleTaskDone(t);setSelectedTask(null);}}>
              {isDone?"Reopen task":"Mark as done"}
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>{setEditingTask(t);setTaskForm({title:t.title,description:t.description||"",priority:t.priority,due_date:"",eta_date:t.eta_date||"",assigned_to:t.assigned_to||""});setShowTaskForm(true);setSelectedTask(null);}}>
              <Icon d={icons.edit} size={14}/>Edit
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>{setPostponeModal(t);setSelectedTask(null);}}>
              <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={14}/>Postpone
            </button>
            <button className="btn btn-outline btn-sm" style={{color:"var(--red)",marginLeft:"auto"}} onClick={()=>{deleteTask(t);setSelectedTask(null);}}>
              <Icon d={icons.trash} size={14}/>Delete
            </button>
          </div>
        </div>
      </div>;
    })()}

    {/* ── Postpone Modal ── */}
    {postponeModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={e=>{if(e.target===e.currentTarget){setPostponeModal(null);setPostponeDate("");setPostponeReason("");}}}>
      <div className="card" style={{width:"100%",maxWidth:400,margin:20}}>
        <div className="card-header"><span className="card-title">Postpone: {postponeModal.title}</span></div>
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">New due date *</label>
          <input type="date" className="form-input" value={postponeDate} onChange={e=>setPostponeDate(e.target.value)} min={new Date().toISOString().split("T")[0]}/>
        </div>
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Reason (optional)</label>
          <textarea className="form-input" rows={2} value={postponeReason} onChange={e=>setPostponeReason(e.target.value)} placeholder="Why is this being postponed?" style={{resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-primary" onClick={postponeTask} disabled={!postponeDate}>Postpone</button>
          <button className="btn btn-outline" onClick={()=>{setPostponeModal(null);setPostponeDate("");setPostponeReason("");}}>Cancel</button>
        </div>
      </div>
    </div>}

    {/* ── AP/PIP Detection Alerts for TLs ── */}
    {isLead&&apDetections.length>0&&<div className="card" style={{marginBottom:16,borderLeft:"4px solid var(--amber)"}}>
      <div className="card-header" style={{cursor:"pointer"}} onClick={()=>nav("plans")}>
        <span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>⚠️</span>
          {apDetections.length} QA{apDetections.length!==1?"s":""} flagged for Action Plan
        </span>
        <span style={{fontSize:12,fontWeight:600,color:"var(--amber)"}}>View all →</span>
      </div>
      {apDetections.slice(0,5).map(d=>(
        <div key={d.email} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--bd2)",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,flexShrink:0}}>{d.name.split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}</div>
            <div>
              <div style={{fontSize:13,fontWeight:500}}>{d.name}</div>
              <div style={{fontSize:11,color:"var(--tx3)"}}>{d.reason} · Score: <span style={{fontWeight:600,color:scoreColor(d.score)}}>{d.score.toFixed(1)}/55</span></div>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-primary btn-sm" style={{fontSize:11,padding:"3px 10px",background:d.planType==="pip"?"var(--red)":"",color:d.planType==="pip"?"#fff":""}} onClick={(e)=>{e.stopPropagation();nav("plans");}}>Create {(d.planType||"pip").toUpperCase()}</button>
            {hasRole(profile?.role,"super_admin") ?
              <button className="btn btn-outline btn-sm" style={{fontSize:11,padding:"3px 10px"}} onClick={async(e)=>{e.stopPropagation();try{await sb.query("ap_dismissals",{token,method:"POST",body:{qa_email:d.email,dismissed_by:profile?.email,reason:"Dismissed by super admin",month:months[0]||"",detection_info:d.reason}});setApDetections(prev=>prev.filter(x=>x.email!==d.email));}catch(err){console.error(err);}}}>Dismiss</button> :
              <button className="btn btn-outline btn-sm" style={{fontSize:11,padding:"3px 10px"}} onClick={(e)=>{e.stopPropagation();setDismissModal(d);}}>Dismiss</button>
            }
          </div>
        </div>
      ))}
      {apDetections.length>5&&<div style={{fontSize:12,color:"var(--tx3)",marginTop:8}}>+{apDetections.length-5} more — view all in AP/PIP page</div>}
    </div>}

    {/* ── Dismiss Modal ── */}
    {dismissModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={e=>{if(e.target===e.currentTarget){setDismissModal(null);setDismissReason("");}}}>
      <div className="card" style={{width:"100%",maxWidth:480,margin:20}}>
        <div className="card-header"><span className="card-title">Dismiss AP Detection — {dismissModal.name}</span></div>
        <div style={{fontSize:13,color:"var(--tx2)",marginBottom:12}}>{dismissModal.reason} · Score: {dismissModal.score.toFixed(1)}/55</div>
        <div className="form-group">
          <label className="form-label">Reason for dismissal (required)</label>
          <textarea className="form-input" rows={3} value={dismissReason} onChange={e=>setDismissReason(e.target.value)} placeholder="Explain why this detection is being dismissed — this will be visible to your supervisor..." style={{resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button className="btn btn-primary" disabled={!dismissReason.trim()} onClick={async()=>{
            try{
              await sb.query("ap_dismissals",{token,method:"POST",body:{
                qa_email:dismissModal.email,
                dismissed_by:profile?.email,
                reason:dismissReason.trim(),
                month:months[0]||"",
                detection_info:dismissModal.reason+" · Score: "+dismissModal.score.toFixed(1),
              }});
              setApDetections(prev=>prev.filter(x=>x.email!==dismissModal.email));
              setApDismissals(prev=>[{qa_email:dismissModal.email,dismissed_by:profile?.email,reason:dismissReason.trim(),month:months[0],detection_info:dismissModal.reason,created_at:new Date().toISOString()},...prev]);
              setDismissModal(null);setDismissReason("");
            }catch(err){console.error(err);}
          }}>Confirm dismissal</button>
          <button className="btn btn-outline" onClick={()=>{setDismissModal(null);setDismissReason("");}}>Cancel</button>
        </div>
      </div>
    </div>}

    {/* ── Supervisor: Recent dismissals by TLs (exclude super admin auto-dismissals) ── */}
    {hasRole(profile?.role,"qa_supervisor")&&(()=>{
      const leadDismissals=apDismissals.filter(d=>d.reason!=="Dismissed by super admin");
      if(leadDismissals.length===0)return null;
      return <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <span className="card-title">Recent AP dismissals by leads</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"var(--tx3)"}}>{leadDismissals.length} total</span>
            {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" style={{color:"var(--red)",fontSize:10}} onClick={async()=>{
              if(!confirm("Clear ALL dismissal records? This will allow dismissed QAs to be re-detected."))return;
              try{
                for(const d of apDismissals){await sb.query("ap_dismissals",{token,method:"DELETE",filters:`id=eq.${d.id}`});}
                setApDismissals([]);
              }catch(e){console.error(e);}
            }}>Clear all</button>}
          </div>
        </div>
        {leadDismissals.slice(0,10).map((d,i)=>(
          <div key={i} style={{padding:"8px 0",borderBottom:"1px solid var(--bd2)",fontSize:13}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div>
                <span style={{fontWeight:600}}>{nameFromEmail(d.qa_email)}</span>
                <span style={{color:"var(--tx3)",marginLeft:8}}>dismissed by <span style={{fontWeight:500,color:"var(--tx2)"}}>{nameFromEmail(d.dismissed_by)}</span></span>
              </div>
              <span style={{fontSize:11,color:"var(--tx3)",whiteSpace:"nowrap"}}>{d.created_at?new Date(d.created_at).toLocaleDateString("en-GB",{month:"short",day:"numeric"}):"—"}</span>
            </div>
            <div style={{marginTop:4,padding:"6px 10px",background:"var(--bg)",borderRadius:6,fontSize:12,color:"var(--tx2)"}}>{d.reason}</div>
          </div>
        ))}
      </div>;
    })()}

    {/* ── QA Self-View: My Active Plan (visible only after first coaching meeting) ── */}
    {!isLead&&(()=>{
      const myPlan=apPlans.find(p=>(p.qa_email?.toLowerCase()===myEmail)&&(p.status==="active"||p.status==="pending_review"));
      if(!myPlan)return null;
      const myPlanWeeks=apWeeks.filter(w=>w.plan_id===myPlan.id).sort((a,b)=>a.week_number-b.week_number);
      const hasCoachingSession=myPlanWeeks.some(w=>w.coaching_session_id)||myPlanWeeks.some(w=>w.actual_data);
      if(!hasCoachingSession)return null; // Only show after first meeting/review
      const filledWeeks=myPlanWeeks.filter(w=>w.actual_data);
      const metWeeks=myPlanWeeks.filter(w=>w.met_targets===true);
      const totalW=myPlan.duration_weeks||myPlanWeeks.length;
      const elapsed=filledWeeks.length;
      const successRate=filledWeeks.length?(metWeeks.length/filledWeeks.length*100):0;
      const daysLeft=myPlan.end_date?Math.max(0,Math.ceil((new Date(myPlan.end_date)-Date.now())/(1000*60*60*24))):null;
      const targets=(() => { try { const p=JSON.parse(myPlan.targets||"[]"); return Array.isArray(p)?p:p.metrics||[]; } catch { return []; } })();
      const progressPct=totalW?(elapsed/totalW)*100:0;
      return <div className="card" style={{marginBottom:20,borderLeft:`4px solid ${myPlan.type==="pip"?"var(--red)":"var(--amber)"}`}}>
        <div className="card-header"><span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{padding:"2px 10px",borderRadius:10,fontSize:11,fontWeight:700,background:myPlan.type==="pip"?"var(--red-bg)":"var(--amber-bg)",color:myPlan.type==="pip"?"var(--red)":"var(--amber)"}}>{myPlan.type.toUpperCase()}</span>
          My {myPlan.type==="pip"?"Performance Improvement Plan":"Action Plan"}
        </span>
        {daysLeft!==null&&<span style={{fontSize:13,fontWeight:600,color:daysLeft<=7?"var(--red)":"var(--tx2)"}}>{daysLeft} days remaining</span>}
        </div>
        {/* Progress bar */}
        <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
          <div style={{width:`${progressPct}%`,height:"100%",borderRadius:3,background:successRate>=60?"var(--green)":"var(--amber)",transition:"width .4s"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--tx3)",marginBottom:14}}>
          <span>Week {elapsed} of {totalW}</span>
          <span>{metWeeks.length}/{elapsed} weeks met targets ({successRate.toFixed(0)}%)</span>
        </div>
        {/* Weekly breakdown */}
        {myPlanWeeks.length>0&&<div className="table-wrap"><table style={{fontSize:12}}><thead><tr><th>Week</th>{targets.map(t=><th key={t.kpi_key} style={{textAlign:"center"}}>{t.label}</th>)}<th style={{textAlign:"center"}}>Met?</th></tr></thead><tbody>
          {myPlanWeeks.map(week=>{
            const td=(()=>{try{return JSON.parse(week.target_data||"{}");}catch{return{};}})();
            const ad=(()=>{try{return JSON.parse(week.actual_data||"{}");}catch{return{};}})();
            const hasA=week.actual_data&&Object.keys(ad).length>0;
            return <tr key={week.id} style={{background:hasA?(week.met_targets?"var(--green-bg)":"var(--red-bg)"):"transparent"}}>
              <td style={{fontWeight:600}}>W{week.week_number}</td>
              {targets.map(t=>{const target=td[t.kpi_key];const actual=ad?.[t.kpi_key];const met=actual!==null&&actual!==undefined&&target!==undefined&&actual>=target;return <td key={t.kpi_key} style={{textAlign:"center"}}>
                <div style={{fontSize:11,color:"var(--tx3)"}}>T: {target!==undefined?target+"%":"—"}</div>
                {hasA&&<div style={{fontSize:12,fontWeight:600,color:met?"var(--green)":"var(--red)"}}>A: {actual!==null&&actual!==undefined?actual.toFixed(1)+"%":"—"}</div>}
              </td>;})}
              <td style={{textAlign:"center"}}>{hasA?(week.met_targets?<span style={{color:"var(--green)",fontWeight:700}}>✅</span>:<span style={{color:"var(--red)",fontWeight:700}}>❌</span>):<span style={{color:"var(--tx3)"}}>—</span>}</td>
            </tr>;
          })}
        </tbody></table></div>}
        <div style={{marginTop:10,fontSize:11,color:"var(--tx3)"}}>Started {myPlan.start_date?new Date(myPlan.start_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"}):"—"} · Ends {myPlan.end_date?new Date(myPlan.end_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"}):"—"}</div>
      </div>;
    })()}

    {/* ── Lead+ team overview ── */}
    {isLead&&<>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">My team</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{allTeamEmails.length}</div>
            <div style={{width:40,height:40,borderRadius:12,background:"var(--primary-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👥</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Team avg score</div>
          <ProgressRing value={teamAvgScore} max={maxScore} size={56} stroke={5}
            color={scoreColor(teamAvgScore)}
            label={teamAvgScore.toFixed(1)}
            sublabel={`of ${maxScore} pts`}
          />
          {teamTrend&&<div style={{fontSize:12,marginTop:8,color:Number(teamTrend)>=0?"var(--green)":"var(--red)",fontWeight:600}}>{Number(teamTrend)>=0?"↑":"↓"} {Math.abs(teamTrend)} pts vs {prevMonth}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Team DSAT</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{teamDsat}</div>
            <MiniBarChart data={months.slice(0,4).reverse().map(m=>{
              const mData=mtd.filter(r=>r.month===m&&allTeamEmails.includes(r.qa_email?.toLowerCase()));
              return {label:m.slice(0,3),value:mData.reduce((a,r)=>a+(r.dsat||0),0)};
            })} height={36} color="var(--red)" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending DAM flags</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value" style={{color:damCount>0?"var(--amber)":"var(--tx)"}}>{damCount}</div>
            {damCount>0&&<button className="btn btn-outline btn-sm" onClick={()=>nav("dam")} style={{fontSize:11}}>Review →</button>}
          </div>
        </div>
      </div>

      {/* Team members table */}
      {teamSorted.length>0&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My team — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{teamSorted.length} specialists</span></div>
        <div className="table-wrap"><table><thead><tr>
          <th>#</th>
          <th>Specialist</th>
          <th style={{textAlign:"right"}}>Score</th>
          <th style={{textAlign:"right"}}>Occupancy</th>
          <th style={{textAlign:"right"}}>Avg T/D</th>
          <th style={{textAlign:"right"}}>Coaching %</th>
          <th style={{textAlign:"right"}}>SBS</th>
          <th style={{textAlign:"right"}}>RTR</th>
          <th style={{textAlign:"right"}}>CO %</th>
          <th style={{textAlign:"right"}}>ST/Hr</th>
          <th style={{textAlign:"right"}}>WD</th>
        </tr></thead><tbody>
          {teamSorted.map((r,i)=>{
            const stHours = r.side_tasks_duration_mins ? (r.side_tasks_duration_mins / 60).toFixed(1) : "—";
            return (<tr key={r.id}>
            <td style={{fontWeight:500,color:i<3?"var(--amber)":"var(--tx3)"}}>{i+1}</td>
            <td style={{fontWeight:500}}>{nameFromEmail(r.qa_email)}</td>
            <td style={{textAlign:"right"}}><span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:scoreBg(getScore(r)),color:scoreColor(getScore(r))}}>{getScore(r).toFixed(1)} / {maxScore}</span></td>
            <td style={{textAlign:"right"}}>{fmt(r.occupancy_pct)}</td>
            <td style={{textAlign:"right",color:"var(--blue)",fontWeight:500}}>{r.ticket_per_day??0}</td>
            <td style={{textAlign:"right"}}>{fmt(r.coaching_completion_pct)}</td>
            <td style={{textAlign:"right"}}>{r.sbs??0}</td>
            <td style={{textAlign:"right"}}>{fmt(r.avg_rtr_score)}</td>
            <td style={{textAlign:"right"}}>{fmt(r.avg_observation_score_pct)}</td>
            <td style={{textAlign:"right"}}>{stHours}</td>
            <td style={{textAlign:"right"}}>{r.working_days??0}</td>
          </tr>);})}
        </tbody></table></div>
      </div>}
    </>}

    {/* ── Personal stats (everyone) ── */}
    {myData?<>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">My score</div>
          <ProgressRing value={myData?getScore(myData):0} max={maxScore} size={56} stroke={5}
            color={scoreColor(myData?getScore(myData):0)}
            label={myData?getScore(myData).toFixed(1):"0"}
            sublabel={`of ${maxScore} pts`}
          />
          {myPrevData&&<div style={{fontSize:12,marginTop:8,color:(getScore(myData)-getScore(myPrevData))>=0?"var(--green)":"var(--red)",fontWeight:600}}>{(getScore(myData)-getScore(myPrevData))>=0?"↑":"↓"} {Math.abs(getScore(myData)-getScore(myPrevData)).toFixed(1)} pts vs {prevMonth}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Rank</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{myRank>0?"#"+myRank:"—"}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {ranked.length}</span></div>
            {myHistory.length>=2&&<SparkLine data={myHistory.map(h=>h.score)} width={80} height={32} color={scoreColor(myData?getScore(myData):0)} />}
          </div>
          <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>Performance trend</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tickets / day</div>
          <div className="stat-value">{myData.ticket_per_day??0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">DSAT</div>
          <div className="stat-value">{myData.dsat??0}</div>
        </div>
      </div>

      {/* My KPI detail with slab calculation */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My KPIs — {latestMonth}</span></div>
        {(()=>{
          const KPI_SLABS_DASH = {
            occupancy:{label:"Occupancy",weight:15,thresholds:[95,98,100],rawKey:"occupancy_pct"},
            coaching:{label:"Coaching on-time",weight:10,thresholds:[90,93,95],rawKey:"ontime_coaching_pct"},
            calibration:{label:"Calibration",weight:10,thresholds:[85,90,95],rawKey:"avg_calibration_match_rate"},
            observation:{label:"Coaching observation",weight:10,thresholds:[82,85,88],rawKey:"avg_observation_score_pct"},
            rtr:{label:"RTR score",weight:10,thresholds:[80,85,90],rawKey:"avg_rtr_score"},
          };
          const parseRawD = (val) => {
            if (!val && val !== 0) return null;
            const s = String(val).trim().replace(",",".");
            if (s.includes("%")) return parseFloat(s.replace("%",""));
            const n = parseFloat(s);
            if (isNaN(n)) return null;
            if (n >= 0 && n <= 2) return n * 100;
            return n;
          };
          const calcSlabD = (rawPct, th) => {
            if (rawPct === null) return {slab:0,pct:0,label:"No data"};
            if (rawPct >= th[2]) return {slab:3,pct:100,label:"Slab 3"};
            if (rawPct >= th[1]) return {slab:2,pct:75,label:"Slab 2"};
            if (rawPct >= th[0]) return {slab:1,pct:50,label:"Slab 1"};
            return {slab:0,pct:0,label:"Slab 0"};
          };
          const kpis = Object.entries(KPI_SLABS_DASH).map(([key,def])=>{
            const rawPct = parseRawD(myData[def.rawKey]);
            const slab = calcSlabD(rawPct, def.thresholds);
            const score = (def.weight * slab.pct) / 100;
            return {key,label:def.label,weight:def.weight,rawPct,slab,score,thresholds:def.thresholds};
          });
          const total = kpis.reduce((s,k)=>s+k.score,0);
          const scColor = (v) => v >= 55*0.7 ? "var(--green)" : v >= 55*0.4 ? "var(--amber)" : "var(--red)";
          return <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 20px"}}>
              {kpis.map(k=>(
                <div key={k.key} style={{padding:"10px 12px",background:"var(--bg)",borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600}}>{k.label}</span>
                    <span style={{fontSize:13,fontWeight:700,color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}>{k.score.toFixed(1)} / {k.weight}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--tx2)",marginBottom:4}}>
                    <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</span>
                    <span style={{padding:"1px 6px",borderRadius:8,fontSize:10,fontWeight:600,background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=75?"var(--blue-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}>{k.slab.label} ({k.slab.pct}%)</span>
                  </div>
                  <div style={{height:5,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}/></div>
                </div>
              ))}
            </div>
            <div style={{marginTop:14,padding:"10px 14px",background:"var(--bg)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:600}}>Total (non-CSAT)</span>
              <span style={{fontSize:18,fontWeight:700,color:scColor(total)}}>{total.toFixed(1)} / 55</span>
            </div>
            <div style={{marginTop:12}}>
              <div className="table-wrap"><table><thead><tr><th>Other metrics</th><th style={{textAlign:"right"}}>Value</th></tr></thead><tbody>
                {[
                  {label:"Coaching completion",value:fmt(myData.coaching_completion_pct)},
                  {label:"Tickets/day",value:myData.ticket_per_day??0},
                  {label:"Working days",value:(myData.working_days||0)+(myData.ramadan_wds?" ("+myData.ramadan_wds+" Ramadan)":"")},
                  {label:"DSAT evaluated",value:myData.dsat??0},
                  {label:"JKQ",value:myData.jkq_result&&myData.jkq_result!=="N/A"?myData.jkq_result+(myData.jkq_score>0?" ("+myData.jkq_score+")":""):"—"},
                ].map(row=>(<tr key={row.label}><td style={{color:"var(--tx2)"}}>{row.label}</td><td style={{textAlign:"right",fontWeight:500}}>{row.value}</td></tr>))}
              </tbody></table></div>
            </div>
          </>;
        })()}
      </div>

      {/* ── Peer Comparison — anonymous percentile rank ── */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">Peer comparison — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>How you compare (anonymous)</span></div>
        {(()=>{
          const metrics = [
            {key:"score",label:"Overall score",getValue:r=>getScore(r)},
            {key:"occupancy",label:"Occupancy",getValue:r=>parseFloat(String(r.occupancy_pct||0).replace("%",""))||0},
            {key:"coaching",label:"Coaching on-time",getValue:r=>parseFloat(String(r.ontime_coaching_pct||0).replace("%",""))||0},
            {key:"calibration",label:"Calibration",getValue:r=>parseFloat(String(r.avg_calibration_match_rate||0).replace("%",""))||0},
            {key:"observation",label:"Coaching observation",getValue:r=>parseFloat(String(r.avg_observation_score_pct||0).replace("%",""))||0},
            {key:"rtr",label:"RTR score",getValue:r=>parseFloat(String(r.avg_rtr_score||0).replace("%",""))||0},
            {key:"tpd",label:"Tickets/day",getValue:r=>parseFloat(r.ticket_per_day||0)||0},
          ];
          return <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {metrics.map(m=>{
              const allVals=current.map(r=>m.getValue(r)).filter(v=>v>0).sort((a,b)=>a-b);
              const myVal=m.getValue(myData);
              if(allVals.length<15||myVal<=0) return null;
              const belowMe=allVals.filter(v=>v<myVal).length;
              const pct=Math.round((belowMe/allVals.length)*100);
              const pctLabel=pct>=90?"Outstanding":pct>=75?"Above average":pct>=50?"Average":pct>=25?"Below average":"Needs improvement";
              const pctColor=pct>=75?"var(--green)":pct>=50?"var(--blue)":pct>=25?"var(--amber)":"var(--red)";
              return <div key={m.key} style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:13,fontWeight:500}}>{m.label}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:"var(--tx3)"}}>Top {100-pct}%</span>
                    <span style={{fontSize:12,fontWeight:600,color:pctColor,padding:"2px 8px",borderRadius:10,background:pct>=75?"var(--green-bg)":pct>=50?"rgba(59,130,246,.1)":pct>=25?"var(--amber-bg)":"var(--red-bg)"}}>{pctLabel}</span>
                  </div>
                </div>
                <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden",position:"relative"}}>
                  <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:pctColor,transition:"width .5s"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,color:"var(--tx3)"}}>
                  <span>Your value: {m.key==="score"?myVal.toFixed(1):m.key==="tpd"?myVal.toFixed(1):myVal.toFixed(1)+"%"}</span>
                  <span>Better than {pct}% of peers</span>
                </div>
              </div>;
            }).filter(Boolean)}
          </div>;
        })()}
      </div>

      {/* Sparkline trend */}
      {myHistory.length>1&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">Score trend</span></div>
        <svg width="100%" height="100" viewBox={`0 0 ${myHistory.length*100} 100`} style={{overflow:"visible"}}><polyline fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={myHistory.map((d,i)=>{const y=90-(d.score/maxScore)*70;return`${i*100+50},${Math.max(10,Math.min(90,y))}`;}).join(" ")}/>{myHistory.map((d,i)=>{const y=90-(d.score/maxScore)*70;const cy=Math.max(10,Math.min(90,y));return(<g key={i}><circle cx={i*100+50} cy={cy} r="4" fill="var(--accent-text)"/><text x={i*100+50} y={cy-12} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--tx)" fontFamily="var(--font)">{d.score.toFixed(1)}</text><text x={i*100+50} y={cy+18} textAnchor="middle" fontSize="10" fill="var(--tx3)" fontFamily="var(--font)">{d.month}</text></g>);})}</svg>
      </div>}
    </>:
    /* No personal MTD data */
    (!isLead&&!hasRole(profile?.role,"qa_supervisor"))?<div style={{padding:"16px 0",marginBottom:20,color:"var(--tx3)",fontSize:13}}>No performance data found for your email ({profile?.email}). Data syncs from Metabase hourly.</div>:null}

    {/* ── Global stats (for admins/supervisors) ── */}
    {hasRole(profile?.role,"qa_supervisor")&&(()=>{
      const svDomain=profile?.operational_domain||profile?.domain||"tabby.ai";
      const isAdminRole=hasRole(profile?.role,"admin");
      const svRoster=isAdminRole?roster:roster.filter(r=>r.email?.endsWith("@"+svDomain));
      const svCurrent=isAdminRole?current:current.filter(r=>r.qa_email?.endsWith("@"+svDomain));
      const svRanked=isAdminRole?ranked:[...svCurrent].sort((a,b)=>getScore(b)-getScore(a));
      const svAvg=svRanked.length?svRanked.reduce((a,r)=>a+getScore(r),0)/svRanked.length:0;
      const svTotalDsat=svCurrent.reduce((a,r)=>a+(r.dsat||0),0);
      return <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total QAs ({isAdminRole?"all":svDomain})</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{svRoster.length}</div>
            <div style={{width:40,height:40,borderRadius:12,background:"var(--primary-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👥</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Team leads</div>
          <div className="stat-value">{[...new Set(svRoster.map(r=>r.manager_email).filter(Boolean))].length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg score ({latestMonth})</div>
          <ProgressRing value={svAvg} max={maxScore} size={56} stroke={5}
            color={scoreColor(svAvg)}
            label={svAvg.toFixed(1)}
            sublabel={`of ${maxScore} pts`}
          />
        </div>
        <div className="stat-card">
          <div className="stat-label">Total DSAT ({latestMonth})</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{svTotalDsat}</div>
            <MiniBarChart data={months.slice(0,4).reverse().map(m=>{
              const md=mtd.filter(r=>r.month===m);
              const scoped=isAdminRole?md:md.filter(r=>r.qa_email?.endsWith("@"+svDomain));
              return {label:m.slice(0,3),value:scoped.reduce((a,r)=>a+(r.dsat||0),0)};
            })} height={36} color="var(--red)" />
          </div>
        </div>
      </div>;
    })()}

    </>}
    {toastEl}
  </div>);
}

function TeamManagementPage({token,profile}){
  const[teams,setTeams]=useState([]);const[users,setUsers]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);const[showForm,setShowForm]=useState(false);
  const[form,setForm]=useState({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});const[editId,setEditId]=useState(null);const{show,el}=useToast();
  const load=useCallback(async()=>{try{const[t,u,r]=await Promise.all([
    sb.query("teams",{select:"id,name,domain,lead_id,supervisor_id,profiles!fk_teams_lead(display_name,email),sup:profiles!fk_teams_supervisor(display_name,email)",token}),
    sb.query("profiles",{select:"id,display_name,email,role,domain",token}),
    sb.query("qa_roster",{select:"email,display_name,queue,manager_email",token}).catch(()=>[]),
  ]);setTeams(t);setUsers(u);setRoster(r);

  // Auto-create teams: one DB entry per queue+domain combination
  const existingKeys=new Set(t.map(x=>(x.name.toLowerCase()+"|"+x.domain.toLowerCase())));
  const rosterQueues=[...new Set(r.map(x=>x.queue).filter(Boolean))];
  let created=0;
  for(const q of rosterQueues){
    const hasAi=r.some(x=>x.queue===q&&x.email?.endsWith("@tabby.ai"));
    const hasSa=r.some(x=>x.queue===q&&x.email?.endsWith("@tabby.sa"));
    if(hasAi&&!existingKeys.has(q.toLowerCase()+"|tabby.ai")){
      try{await sb.query("teams",{token,method:"POST",body:{name:q,domain:"tabby.ai"}});created++;existingKeys.add(q.toLowerCase()+"|tabby.ai");}catch(e){console.log("Auto-create:",q,"ai",e);}
    }
    if(hasSa&&!existingKeys.has(q.toLowerCase()+"|tabby.sa")){
      try{await sb.query("teams",{token,method:"POST",body:{name:q,domain:"tabby.sa"}});created++;existingKeys.add(q.toLowerCase()+"|tabby.sa");}catch(e){console.log("Auto-create:",q,"sa",e);}
    }
  }
  if(created>0){
    const t2=await sb.query("teams",{select:"id,name,domain,lead_id,supervisor_id,profiles!fk_teams_lead(display_name,email),sup:profiles!fk_teams_supervisor(display_name,email)",token});
    setTeams(t2);
    show("success",`Auto-created ${created} team(s) from roster`);
  }
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);

  const nameFromEmail=(email)=>{if(!email)return"—";return email.split("@")[0].split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};
  const leads=users.filter(u=>hasRole(u.role,"qa_lead")),supervisors=users.filter(u=>hasRole(u.role,"qa_supervisor"));
  const getMemberCount=(teamName)=>roster.filter(r=>r.queue===teamName&&(!filterDomain||r.email?.endsWith("@"+filterDomain))).length;
  const getTeamMembers=(teamName)=>roster.filter(r=>r.queue===teamName&&(!filterDomain||r.email?.endsWith("@"+filterDomain)));

  const save=async()=>{try{const b={name:form.name,domain:form.domain,lead_id:form.lead_id||null,supervisor_id:form.supervisor_id||null};if(editId){await sb.query("teams",{token,method:"PATCH",body:b,filters:`id=eq.${editId}`});logActivity(token,profile?.email,"team_updated","teams",editId,`Name: ${form.name}`);show("success","Team updated");}else{await sb.query("teams",{token,method:"POST",body:b});logActivity(token,profile?.email,"team_created","teams",null,`Name: ${form.name}, Domain: ${form.domain}`);show("success","Team created");}setShowForm(false);setEditId(null);setForm({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});load();}catch(e){show("error",e.message);}};
  const startEdit=(t)=>{setForm({name:t.name,domain:t.domain,lead_id:t.lead_id||"",supervisor_id:t.supervisor_id||""});setEditId(t.id);setShowForm(true);};
  const del=async(id)=>{if(!confirm("Delete this team?"))return;try{const t=teams.find(x=>x.id===id);await sb.query("teams",{token,method:"DELETE",filters:`id=eq.${id}`});logActivity(token,profile?.email,"team_deleted","teams",id,`Name: ${t?.name||"?"}`);show("success","Deleted");load();}catch(e){show("error",e.message);}};

  const [expandedTeam, setExpandedTeam] = useState(null);
  const [filterDomain, setFilterDomain] = useState("");

  return(<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div className="page-title">Team management</div><div className="page-subtitle">{teams.length} teams · {roster.length} roster members</div></div><button className="btn btn-primary" onClick={()=>{setShowForm(!showForm);setEditId(null);setForm({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});}}><Icon d={icons.plus} size={16}/>New team</button></div>

    {/* Domain filter */}
    <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
      <select className="select" value={filterDomain} onChange={e=>setFilterDomain(e.target.value)}>
        <option value="">All domains</option>
        <option value="tabby.ai">tabby.ai</option>
        <option value="tabby.sa">tabby.sa</option>
      </select>
      {filterDomain && <span style={{fontSize:12,color:"var(--tx3)"}}>Showing {filterDomain} teams only</span>}
    </div>
    {showForm&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">{editId?"Edit team":"Create team"}</span></div>
      <div className="form-grid"><div className="form-group"><label className="form-label">Team name</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Payments QA"/></div>
      <div className="form-group"><label className="form-label">Domain</label><select className="select form-input" value={form.domain} onChange={e=>setForm({...form,domain:e.target.value})}><option value="tabby.ai">tabby.ai</option><option value="tabby.sa">tabby.sa</option></select></div>
      <div className="form-group"><label className="form-label">Lead</label><select className="select form-input" value={form.lead_id} onChange={e=>setForm({...form,lead_id:e.target.value})}><option value="">— Select —</option>{leads.map(u=><option key={u.id} value={u.id}>{u.display_name||u.email}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Supervisor</label><select className="select form-input" value={form.supervisor_id} onChange={e=>setForm({...form,supervisor_id:e.target.value})}><option value="">— Select —</option>{supervisors.map(u=><option key={u.id} value={u.id}>{u.display_name||u.email}</option>)}</select></div></div>
      <div style={{display:"flex",gap:8,marginTop:16}}><button className="btn btn-primary" onClick={save}><Icon d={icons.check} size={16}/>{editId?"Update":"Create"}</button><button className="btn btn-outline" onClick={()=>{setShowForm(false);setEditId(null);}}>Cancel</button></div>
    </div>}
    <div className="card">{loading?<div className="loading-spinner"><div className="spinner"/></div>:teams.length===0?<div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No teams yet. Teams are auto-created from the roster.</p></div>:
      (()=>{
        // Build virtual teams: split each queue by email domain
        const virtualTeams=[];
        const queues=[...new Set(roster.map(r=>r.queue).filter(Boolean))].sort();
        queues.forEach(queue=>{
          const aiMembers=roster.filter(r=>r.queue===queue&&r.email?.endsWith("@tabby.ai"));
          const saMembers=roster.filter(r=>r.queue===queue&&r.email?.endsWith("@tabby.sa"));
          const dbTeamAi=teams.find(t=>t.name===queue&&t.domain==="tabby.ai");
          const dbTeamSa=teams.find(t=>t.name===queue&&t.domain==="tabby.sa");
          if(aiMembers.length>0&&(!filterDomain||filterDomain==="tabby.ai")){
            virtualTeams.push({key:queue+"-ai",name:queue,domain:"tabby.ai",members:aiMembers,dbTeam:dbTeamAi,count:aiMembers.length});
          }
          if(saMembers.length>0&&(!filterDomain||filterDomain==="tabby.sa")){
            virtualTeams.push({key:queue+"-sa",name:queue,domain:"tabby.sa",members:saMembers,dbTeam:dbTeamSa,count:saMembers.length});
          }
        });
        return <div className="table-wrap"><table><thead><tr><th>Team</th><th>Domain</th><th>Members</th><th>Lead</th><th>Supervisor</th><th></th></tr></thead><tbody>
          {virtualTeams.map(vt=>{
            const isExp=expandedTeam===vt.key;
            return(<React.Fragment key={vt.key}>
              <tr onClick={()=>setExpandedTeam(isExp?null:vt.key)} style={{cursor:"pointer"}}>
                <td style={{fontWeight:500}}>{vt.name}</td>
                <td><span className={`domain-badge domain-${vt.domain==="tabby.ai"?"ai":"sa"}`}>{vt.domain}</span></td>
                <td><span style={{fontSize:12,padding:"2px 8px",borderRadius:12,background:"var(--accent-light)",color:"var(--accent-text)",fontWeight:600}}>{vt.count}</span></td>
                <td style={{fontSize:13}}>{vt.dbTeam?.profiles?.display_name||<span style={{color:"var(--tx3)"}}>Not assigned</span>}</td>
                <td style={{fontSize:13}}>{vt.dbTeam?.sup?.display_name||<span style={{color:"var(--tx3)"}}>Not assigned</span>}</td>
                <td><div style={{display:"flex",gap:4}}>
                  {vt.dbTeam&&<button className="btn btn-outline btn-sm" onClick={(e)=>{e.stopPropagation();startEdit(vt.dbTeam);}}><Icon d={icons.edit} size={14}/></button>}
                  {vt.dbTeam&&<button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={(e)=>{e.stopPropagation();del(vt.dbTeam.id);}}><Icon d={icons.trash} size={14}/></button>}
                </div></td>
              </tr>
              {isExp&&vt.members.length>0&&<tr><td colSpan={6} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"12px 20px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Team members — {vt.domain} ({vt.members.length})</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:6}}>
                  {vt.members.sort((a,b)=>(a.display_name||a.email).localeCompare(b.display_name||b.email)).map(m=>(
                    <div key={m.email} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",background:"var(--bg3)",borderRadius:6,fontSize:12}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,flexShrink:0}}>{nameFromEmail(m.email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}</div>
                      <div style={{overflow:"hidden"}}><div style={{fontWeight:500,fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.display_name||nameFromEmail(m.email)}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{m.email}</div></div>
                    </div>
                  ))}
                </div>
                {vt.members.length>0&&<div style={{fontSize:11,color:"var(--tx3)",marginTop:8}}>Manager: {vt.members[0].manager_email?nameFromEmail(vt.members[0].manager_email):"—"}</div>}
              </div></td></tr>}
            </React.Fragment>);
          })}
        </tbody></table></div>;
      })()}</div>{el}
  </div>);
}

function ScoreEntryPage({token,profile,gf}){
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selQA, setSelQA] = useState([]);
  const [selTL, setSelTL] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [selTeam, setSelTeam] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows, profRows] = await Promise.all([
          sb.query("mtd_scores", {select:"*",filters:"order=month.desc,qa_email.asc",token}),
          sb.query("qa_roster", {select:"email,queue,manager_email",token}).catch(()=>[]),
          sb.query("profiles", {select:"id,email,role",filters:"status=eq.active",token}).catch(()=>[]),
        ]);
        setRoster(rosterRows);
        // Build blacklist: exclude both domain variants of non-QA users
        const nonQaProfiles = profRows.filter(p => p.role !== "qa");
        const blacklist = new Set();
        const validMgrs = new Set();
        nonQaProfiles.forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          blacklist.add(email);
          validMgrs.add(email);
          const local = email.split("@")[0];
          if (email.endsWith("@tabby.ai")) { blacklist.add(local + "@tabby.sa"); validMgrs.add(local + "@tabby.sa"); }
          if (email.endsWith("@tabby.sa")) { blacklist.add(local + "@tabby.ai"); validMgrs.add(local + "@tabby.ai"); }
          validMgrs.add(local);
        });
        // Filter MTD: exclude non-QA profiles AND entries managed by unknown managers
        const rosterMgrValid = new Set(rosterRows.filter(r => {
          const mgr = r.manager_email?.toLowerCase();
          if (!mgr) return false;
          return validMgrs.has(mgr) || validMgrs.has(mgr.split("@")[0]);
        }).map(r => r.email?.toLowerCase()));
        const filtered = rows.filter(r => {
          const em = r.qa_email?.toLowerCase();
          if (blacklist.has(em)) return false;
          // If email is in roster, check if their manager is valid
          if (rosterRows.some(x => x.email?.toLowerCase() === em)) {
            return rosterMgrValid.has(em);
          }
          return true; // MTD entries not in roster pass through
        });
        setData(filtered);
        const uniqueMonths = sortMonthsDesc([...new Set(filtered.map(r => r.month))]);
        setMonths(uniqueMonths);
        if (uniqueMonths.length > 0) setSelMonth(uniqueMonths[0]);
        // Auto-scope supervisors to their domain
        if (hasRole(profile?.role,"qa_supervisor") && !hasRole(profile?.role,"admin") && !selDomain) {
          const svDomain = profile?.operational_domain || profile?.domain || "";
          if (svDomain) setSelDomain(svDomain);
        }
        // Sync from global filters
        if (gf?.domain) setSelDomain(gf.domain);
        if (gf?.month && uniqueMonths.includes(gf.month)) setSelMonth(gf.month);
        if (gf?.teams?.length > 0) setSelTeam(gf.teams[0]);
      } catch (e) { console.error("MTD Scores:", e); }
      setLoading(false);
    })();
  }, [token, gf?.domain, gf?.month, gf?.teams]);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  // Format percentage values — handles "94.46%", 0.9446, 1.345, "1", etc.
  const fmtPct = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    const s = String(val).trim();
    if (s.includes("%")) return s; // already formatted
    const n = parseFloat(s.replace(",", "."));
    if (isNaN(n)) return s;
    // If it looks like a 0-1 decimal, multiply by 100
    // If > 1 and < 2, it's likely a raw decimal like 1.345 meaning 134.5%
    // If > 2, it's already a percentage value like 94.46
    if (n >= 0 && n <= 2) return (n * 100).toFixed(1) + "%";
    return n.toFixed(1) + "%";
  };

  // Format general values
  const fmt = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "string" && val.includes("%")) return val;
    if (typeof val === "number" && !Number.isInteger(val)) return val.toFixed(2);
    return String(val);
  };

  const monthData = data.filter(r => r.month === selMonth);
  const qaEmails = [...new Set(monthData.map(r => r.qa_email))].sort();
  const tlEmails = [...new Set(monthData.map(r => r.qa_tl).filter(Boolean))].sort();
  const rosterMap = {};
  roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  const scoreTeams = [...new Set(roster.filter(r => r.queue && (!selDomain || r.email?.endsWith("@"+selDomain))).map(r => r.queue))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+selDomain));
  if (selTeam) filtered = filtered.filter(r => rosterMap[r.qa_email?.toLowerCase()]?.queue === selTeam);
  if (selTL) filtered = filtered.filter(r => r.qa_tl === selTL);
  if (selQA.length > 0) filtered = filtered.filter(r => selQA.includes(r.qa_email));
  // Apply global filters
  if (gf?.people?.length > 0) filtered = filtered.filter(r => gf.people.includes(r.qa_email?.toLowerCase()));
  if (gf?.domain && !selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+gf.domain));
  if (gf?.teams?.length > 0 && !selTeam) filtered = filtered.filter(r => { const q = rosterMap[r.qa_email?.toLowerCase()]?.queue; return q && gf.teams.includes(q); });
  if (gf?.month && !selMonth && gf.month !== selMonth) { /* month already handled by selMonth */ }
  const sorted = [...filtered].sort((a, b) => (b.final_performance || 0) - (a.final_performance || 0));

  const fpColor = (v) => v >= 0.4 ? "var(--green)" : v >= 0.25 ? "var(--amber)" : "var(--red)";
  const fpBg = (v) => v >= 0.4 ? "var(--green-bg)" : v >= 0.25 ? "var(--amber-bg)" : "var(--red-bg)";

  if (loading) return <div className="page"><div className="loading-spinner"><div className="spinner"/></div></div>;

  return (<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
      <div>
        <div className="page-title">Monthly Performance Review</div>
        <div className="page-subtitle">MTD performance data — synced from Metabase hourly</div>
      </div>
      {sorted.length>0&&<div style={{display:"flex",gap:16,alignItems:"center"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>Specialists</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-1px"}}>{sorted.length}</div>
        </div>
        <div style={{width:1,height:32,background:"var(--bd)"}}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>Avg Score</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-1px"}}>{(sorted.reduce((a,r)=>a+(r.final_performance||0),0)/sorted.length*100).toFixed(1)}%</div>
        </div>
        <div style={{width:1,height:32,background:"var(--bd)"}}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>Total DSAT</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-1px",color:sorted.reduce((a,r)=>a+(r.dsat||0),0)>0?"var(--red)":"var(--tx)"}}>{sorted.reduce((a,r)=>a+(r.dsat||0),0)}</div>
        </div>
      </div>}
    </div>

    <div className="card" style={{marginBottom:16,position:"relative",zIndex:50,overflow:"visible"}}>
      <div className="controls-row" style={{overflow:"visible"}}>
        <div className="form-group" style={{flex:1,position:"relative",zIndex:5}}>
          <label className="form-label">Month</label>
          <SearchableSelect
            options={months}
            value={selMonth}
            onChange={v=>{setSelMonth(v);setSelQA([]);setSelTL("");setSelDomain("");setSelTeam("");}}
            placeholder="Select month"
          />
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Domain</label>
          <SearchableSelect
            options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]}
            value={selDomain}
            onChange={v=>{setSelDomain(v);setSelQA([]);setSelTL("");setSelTeam("");}}
            placeholder="All domains"
          />
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Team</label>
          <SearchableSelect
            options={scoreTeams}
            value={selTeam}
            onChange={v=>{setSelTeam(v);setSelQA([]);setSelTL("");}}
            placeholder="All teams"
          />
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">QA Lead</label>
          <SearchableSelect
            options={tlEmails.map(e=>({value:e,label:nameFromEmail(e)}))}
            value={selTL}
            onChange={v=>{setSelTL(v);setSelQA([]);}}
            placeholder={`All leads (${tlEmails.length})`}
          />
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Specialist</label>
          <SearchableSelect
            options={[...new Set(filtered.map(r=>r.qa_email))].sort().map(e=>({value:e,label:nameFromEmail(e)+" ("+e.split("@")[1]+")"}))}
            value={selQA}
            onChange={setSelQA}
            placeholder={`All (${filtered.length})`}
            multi
          />
        </div>
      </div>
    </div>

    {sorted.length === 0 ? (
      <div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No MTD data for {selMonth}. Check that the Google Sheet sync is running.</p></div></div>
    ) : (
      <div className="card">
        <div className="card-header">
          <span className="card-title">{selMonth} — {sorted.length} specialists</span>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:12,color:"var(--tx3)"}}>Synced: {sorted[0]?.synced_at ? new Date(sorted[0].synced_at).toLocaleString() : "—"}</span>
            <button className="btn btn-outline btn-sm" onClick={()=>{
              const csv=["Specialist,Email,TL,Score,Tickets/day,DSAT,Occupancy,RTR,JKQ"];
              sorted.forEach(r=>{
                csv.push(`"${nameFromEmail(r.qa_email)}",${r.qa_email},"${r.qa_tl?nameFromEmail(r.qa_tl):""}",${((r.final_performance||0)*100).toFixed(1)},${r.ticket_per_day||0},${r.dsat||0},${r.occupancy_pct||0},${r.avg_rtr_score||0},${r.jkq_result||""}`);
              });
              const blob=new Blob([csv.join("\n")],{type:"text/csv"});
              const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`performance_${selMonth}.csv`;a.click();
            }} style={{fontSize:11}}>
              <Icon d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" size={13}/>Export CSV
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{minWidth:160}}>Specialist</th>
                <th>TL</th>
                <th style={{textAlign:"right"}}>SBS</th>
                <th style={{textAlign:"right"}}>Non-SBS</th>
                <th style={{textAlign:"right"}}>DSAT</th>
                <th style={{textAlign:"right"}}>Late</th>
                <th style={{textAlign:"right"}}>Never</th>
                <th style={{textAlign:"right"}}>Valid</th>
                <th style={{textAlign:"right"}}>Invalid</th>
                <th style={{textAlign:"right"}}>Sessions</th>
                <th style={{textAlign:"right"}}>On-time</th>
                <th style={{textAlign:"right"}}>Eligible</th>
                <th style={{textAlign:"right"}}>Not coached</th>
                <th style={{textAlign:"right"}}>RTR</th>
                <th style={{textAlign:"right"}}>RTR score</th>
                <th style={{textAlign:"right"}}>Obs.</th>
                <th style={{textAlign:"right"}}>Obs. %</th>
                <th style={{textAlign:"right"}}>Calib.</th>
                <th style={{textAlign:"right"}}>Calib. %</th>
                <th style={{textAlign:"right"}}>Completion</th>
                <th style={{textAlign:"right"}}>On-time %</th>
                <th style={{textAlign:"center"}}>JKQ</th>
                <th style={{textAlign:"right"}}>Tickets/d</th>
                <th style={{textAlign:"right"}}>Occupancy</th>
                <th style={{textAlign:"right"}}>Days</th>
                <th style={{textAlign:"right"}}>Performance</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>
                        {nameFromEmail(r.qa_email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                      </div>
                      <div>
                        <div style={{fontWeight:500,fontSize:13,whiteSpace:"nowrap"}}>{nameFromEmail(r.qa_email)}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{fontSize:12,color:"var(--tx2)",whiteSpace:"nowrap"}}>{r.qa_tl ? nameFromEmail(r.qa_tl) : "—"}</td>
                  <td style={{textAlign:"right"}}>{r.sbs ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.non_sbs ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.dsat ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.late_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.never_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.valid_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.invalid_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.coaching_sessions ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.total_ontime_coachings ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.coaching_eligibility_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.not_coached ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.rtr_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_rtr_score)}</td>
                  <td style={{textAlign:"right"}}>{r.observed_coaching_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_observation_score_pct)}</td>
                  <td style={{textAlign:"right"}}>{r.calibration_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_calibration_match_rate)}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.coaching_completion_pct)}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.ontime_coaching_pct)}</td>
                  <td style={{textAlign:"center"}}>
                    {r.jkq_result && r.jkq_result !== "N/A" ? (
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:r.jkq_result==="Pass"?"var(--green-bg)":"var(--red-bg)",color:r.jkq_result==="Pass"?"var(--green)":"var(--red)"}}>{r.jkq_result}{r.jkq_score>0?` (${r.jkq_score})`:""}</span>
                    ) : <span style={{color:"var(--tx3)"}}>—</span>}
                  </td>
                  <td style={{textAlign:"right",color:"var(--blue)",fontWeight:500}}>{r.ticket_per_day ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.occupancy_pct)}</td>
                  <td style={{textAlign:"right"}}>{r.working_days||"—"}{r.ramadan_wds?<span style={{fontSize:10,color:"var(--tx3)"}}> ({r.ramadan_wds}R)</span>:""}</td>
                  <td style={{textAlign:"right"}}>
                    <span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:fpBg(r.final_performance),color:fpColor(r.final_performance)}}>
                      {((r.final_performance||0)*100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>);
}

function AdminUsersPage({token,teams,profile}){
  const[users,setUsers]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);const[editingId,setEditingId]=useState(null);const[editRole,setEditRole]=useState("");const[editOpDomain,setEditOpDomain]=useState("");const[editTeamIds,setEditTeamIds]=useState([]);const[userTeamsMap,setUserTeamsMap]=useState({});const{show,el}=useToast();
  const load=useCallback(async()=>{try{
    const[d,r,ut]=await Promise.all([
      sb.query("profiles",{select:"id,email,display_name,role,domain,operational_domain,team_id,status",token}),
      sb.query("qa_roster",{select:"email,queue,manager_email",token}).catch(()=>[]),
      sb.query("user_teams",{select:"user_id,team_id",token}).catch(()=>[]),
    ]);
    setUsers(d.sort((a,b)=>ROLE_LEVEL[b.role]-ROLE_LEVEL[a.role]));
    setRoster(r);
    // Build map: user_id -> [team_id, ...]
    const map={};
    ut.forEach(x=>{if(!map[x.user_id])map[x.user_id]=[];map[x.user_id].push(x.team_id);});
    // Also include legacy team_id from profiles
    d.forEach(u=>{if(u.team_id){if(!map[u.id])map[u.id]=[];if(!map[u.id].includes(u.team_id))map[u.id].push(u.team_id);}});
    setUserTeamsMap(map);
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);
  const getUserTeamNames=(u)=>{
    const ids=userTeamsMap[u.id]||[];
    const teamNames=ids.map(tid=>{const t=teams.find(x=>x.id===tid);return t?t.name:null;}).filter(Boolean);
    const rosterTeams=roster.filter(r=>r.email?.toLowerCase()===u.email?.toLowerCase()).map(r=>r.queue).filter(Boolean);
    return [...new Set([...teamNames,...rosterTeams])];
  };
  const getOpDomain=(u)=>u.operational_domain||u.domain||"tabby.ai";
  const save=async(uid)=>{try{
    const u=users.find(x=>x.id===uid);
    await sb.query("profiles",{token,method:"PATCH",body:{role:editRole,operational_domain:editOpDomain,team_id:editTeamIds[0]||null},filters:`id=eq.${uid}`});
    // Sync user_teams junction table
    await sb.query("user_teams",{token,method:"DELETE",filters:`user_id=eq.${uid}`}).catch(()=>{});
    for(const tid of editTeamIds){
      await sb.query("user_teams",{token,method:"POST",body:{user_id:uid,team_id:tid}}).catch(()=>{});
    }
    logActivity(token, profile?.email, "user_updated", "profiles", uid, `${u?.email}: role=${editRole}, domain=${editOpDomain}, teams=${editTeamIds.length}`);
    setUsers(prev=>prev.map(x=>x.id===uid?{...x,role:editRole,operational_domain:editOpDomain,team_id:editTeamIds[0]||null}:x));
    setEditingId(null);show("success","Updated");
  }catch(e){show("error",e.message);}};
  return(<div className="page">
    <div className="page-header"><div className="page-title">User management</div><div className="page-subtitle">{users.length} users</div></div>
    <div className="card">{loading?<div className="loading-spinner"><div className="spinner"/></div>:
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Email domain</th><th>Op. domain</th><th>Teams</th><th>Status</th><th></th></tr></thead><tbody>
        {users.map(u=>{const uTeams=getUserTeamNames(u);return(<tr key={u.id}><td style={{fontWeight:500}}>{u.display_name||"—"}</td><td style={{color:"var(--tx2)",fontSize:13}}>{u.email}</td>
        <td>{editingId===u.id?<SearchableSelect options={Object.entries(ROLE_LABELS).map(([k,v])=>({value:k,label:v}))} value={editRole} onChange={setEditRole} placeholder="Select role"/>:<span className={`role-badge role-${u.role}`}>{ROLE_LABELS[u.role]}</span>}</td>
        <td><span className={`domain-badge domain-${u.domain==="tabby.ai"?"ai":"sa"}`}>{u.domain}</span></td>
        <td>{editingId===u.id?<SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={editOpDomain} onChange={setEditOpDomain} placeholder="Domain"/>:<span className={`domain-badge domain-${getOpDomain(u)==="tabby.ai"?"ai":"sa"}`}>{getOpDomain(u)}</span>}</td>
        <td>{editingId===u.id?<SearchableSelect options={teams.map(t=>({value:t.id,label:`${t.name} (${t.domain})`}))} value={editTeamIds} onChange={setEditTeamIds} placeholder="Select teams..." multi/>:uTeams.length>0?<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{uTeams.map((n,i)=><span key={i} className="team-tag">{n}</span>)}</div>:<span style={{fontSize:13,color:"var(--tx3)"}}>—</span>}</td>
        <td><span className={`status-badge status-${u.status}`}>{u.status}</span></td>
        <td>{editingId===u.id?<div style={{display:"flex",gap:6}}><button className="btn btn-primary btn-sm" onClick={()=>save(u.id)}>Save</button><button className="btn btn-outline btn-sm" onClick={()=>setEditingId(null)}>Cancel</button></div>:<button className="btn btn-outline btn-sm" onClick={()=>{setEditingId(u.id);setEditRole(u.role);setEditOpDomain(getOpDomain(u));setEditTeamIds(userTeamsMap[u.id]||[]);}}>Edit</button>}</td></tr>);})}
      </tbody></table></div>}</div>{el}
  </div>);
}

function AdminFeedbackPage({token}){
  const[items,setItems]=useState([]);const[loading,setLoading]=useState(true);const[expandedId,setExpandedId]=useState(null);
  const{show,el}=useToast();
  const load=useCallback(async()=>{try{
    const d=await sb.query("feedback",{select:"*",filters:"order=created_at.desc",token});
    setItems(d);
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);
  const updateStatus=async(id,status)=>{try{
    await sb.query("feedback",{token,method:"PATCH",body:{status},filters:`id=eq.${id}`});
    setItems(prev=>prev.map(x=>x.id===id?{...x,status}:x));
    show("success","Updated");
  }catch(e){show("error",e.message);}};
  const catIcon={bug:"🐛",feature:"💡",improvement:"✨",general:"💬"};
  const catLabel={bug:"Bug",feature:"Feature",improvement:"Improvement",general:"General"};
  const statusColor={new:{bg:"var(--blue-bg)",color:"var(--blue)"},reviewed:{bg:"var(--amber-bg)",color:"var(--amber)"},planned:{bg:"var(--primary-light)",color:"var(--tabby-purple,#6A2C79)"},done:{bg:"var(--green-bg)",color:"var(--green)"},dismissed:{bg:"var(--bg2)",color:"var(--tx3)"}};
  const counts={new:items.filter(f=>f.status==="new").length,reviewed:items.filter(f=>f.status==="reviewed").length,planned:items.filter(f=>f.status==="planned").length};
  return(<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
      <div>
        <div className="page-title">User Feedback</div>
        <div className="page-subtitle">{items.length} total submissions</div>
      </div>
      {items.length>0&&<div style={{display:"flex",gap:12}}>
        {counts.new>0&&<div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:"var(--blue)"}}>{counts.new}</div><div style={{fontSize:10,color:"var(--tx3)",fontWeight:600}}>NEW</div></div>}
        {counts.reviewed>0&&<div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:"var(--amber)"}}>{counts.reviewed}</div><div style={{fontSize:10,color:"var(--tx3)",fontWeight:600}}>REVIEWED</div></div>}
        {counts.planned>0&&<div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:"var(--tabby-purple,#6A2C79)"}}>{counts.planned}</div><div style={{fontSize:10,color:"var(--tx3)",fontWeight:600}}>PLANNED</div></div>}
      </div>}
    </div>
    {loading?<div className="loading-spinner"><div className="spinner"/></div>:
    items.length===0?<div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No feedback yet.</p></div></div>:
    <div className="card"><div className="table-wrap"><table><thead><tr>
      <th style={{width:30}}></th>
      <th>User</th>
      <th>Category</th>
      <th>Preview</th>
      <th>Rating</th>
      <th>Page</th>
      <th>Date</th>
      <th>Status</th>
    </tr></thead><tbody>
      {items.map(f=>{
        const sc=statusColor[f.status]||statusColor.new;
        const isExp=expandedId===f.id;
        return <React.Fragment key={f.id}>
          <tr onClick={()=>setExpandedId(isExp?null:f.id)} style={{cursor:"pointer"}}>
            <td><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
            <td style={{fontWeight:500}}>{f.user_name||f.user_email?.split("@")[0]}</td>
            <td><span style={{fontSize:12}}>{catIcon[f.category]} {catLabel[f.category]}</span></td>
            <td style={{color:"var(--tx2)",fontSize:12,maxWidth:250,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.message?.slice(0,60)}{f.message?.length>60?"...":""}</td>
            <td>{f.rating?<span style={{fontSize:11}}>{"⭐".repeat(f.rating)}</span>:"—"}</td>
            <td style={{fontSize:12,color:"var(--tx3)"}}>{f.page}</td>
            <td style={{fontSize:12,color:"var(--tx3)",whiteSpace:"nowrap"}}>{new Date(f.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</td>
            <td><span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:sc.bg,color:sc.color,fontWeight:600,textTransform:"uppercase"}}>{f.status}</span></td>
          </tr>
          {isExp&&<tr><td colSpan={8} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px 16px 44px"}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",marginBottom:4}}>{f.user_email}</div>
            <div style={{fontSize:13,color:"var(--tx)",lineHeight:1.7,whiteSpace:"pre-wrap",marginBottom:14,padding:"12px 16px",background:"var(--bg3)",borderRadius:8,border:"1px solid var(--bd2)"}}>{f.message}</div>
            <div style={{display:"flex",gap:6}}>
              {["new","reviewed","planned","done","dismissed"].map(s=>{
                const scc=statusColor[s]||statusColor.new;
                return <button key={s} onClick={(e)=>{e.stopPropagation();updateStatus(f.id,s);}} style={{
                  padding:"4px 12px",borderRadius:8,border:"1px solid "+(f.status===s?scc.color:"var(--bd)"),
                  background:f.status===s?scc.bg:"transparent",color:f.status===s?scc.color:"var(--tx3)",
                  fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",textTransform:"uppercase",
                }}>{s}</button>;
              })}
            </div>
          </div></td></tr>}
        </React.Fragment>;
      })}
    </tbody></table></div></div>}{el}
  </div>);
}

function AdminPage({token,profile}){
  const[tab,setTab]=useState("users");const[teams,setTeams]=useState([]);
  useEffect(()=>{sb.query("teams",{select:"id,name,domain",token}).then(setTeams).catch(()=>{});},[token]);
  return(<div><div className="page" style={{paddingBottom:0}}><div className="page-header" style={{marginBottom:16}}><div className="page-title">Admin panel</div></div>
    <div className="tab-bar" style={{marginBottom:0}}><button className={`tab-btn ${tab==="users"?"active":""}`} onClick={()=>setTab("users")}>Users</button><button className={`tab-btn ${tab==="teams"?"active":""}`} onClick={()=>setTab("teams")}>Teams</button><button className={`tab-btn ${tab==="feedback"?"active":""}`} onClick={()=>setTab("feedback")}>Feedback</button></div></div>
    {tab==="users"&&<AdminUsersPage token={token} teams={teams} profile={profile}/>}{tab==="teams"&&<TeamManagementPage token={token} profile={profile}/>}{tab==="feedback"&&<AdminFeedbackPage token={token}/>}</div>);
}

/* ═══ DAM ENGINE ═══ */
function DAMPage({token,profile,gf}){
  const[tab,setTab]=useState("flags");const[rules,setRules]=useState([]);const[flags,setFlags]=useState([]);const[steps,setSteps]=useState([]);
  const[loading,setLoading]=useState(true);const[showCreate,setShowCreate]=useState(false);
  const[selRule,setSelRule]=useState("");const[selProfile,setSelProfile]=useState("");const[flagNotes,setFlagNotes]=useState("");
  const[profiles,setProfiles]=useState([]);const{show,el}=useToast();

  const load=useCallback(async()=>{try{
    const[r,f,s,p]=await Promise.all([
      sb.query("dam_rules",{select:"id,name,description,behavior_type,dam_reference,severity,auditing_flow,executor_role,auditor_role,goal,compliant_action",filters:"is_active=eq.true&order=behavior_type.asc,name.asc",token}),
      sb.query("dam_flags",{select:"id,profile_id,qa_email,rule_id,severity,recommended_action,triggered_at,status,notes,occurrence_number,reviewed_by,reviewed_at,profiles!dam_flags_profile_id_fkey(display_name,email),dam_rules(name,behavior_type,dam_reference)",filters:"order=triggered_at.desc&limit=100",token}).catch(()=>[]),
      sb.query("dam_escalation_steps",{select:"id,rule_id,occurrence,action,includes_pip,pip_action,deduction_days,is_hr_investigation",filters:"order=rule_id.asc,occurrence.asc",token}),
      sb.query("profiles",{select:"id,display_name,email,role",filters:"status=eq.active",token}),
    ]);
    setRules(r);
    // Scope flags and profiles by domain for supervisors
    const svDomain=profile?.operational_domain||profile?.domain||"tabby.ai";
    const isAdminDAM=hasRole(profile?.role,"admin");
    const isSvDAM=hasRole(profile?.role,"qa_supervisor")&&!isAdminDAM;
    let scopedFlags=isSvDAM?f.filter(fl=>(fl.profiles?.email||fl.qa_email||"").endsWith("@"+svDomain)):f;
    let scopedProfiles=isSvDAM?p.filter(pr=>pr.email?.endsWith("@"+svDomain)):p;
    // Apply global filters
    if(gf?.domain){scopedFlags=scopedFlags.filter(fl=>(fl.profiles?.email||fl.qa_email||"").endsWith("@"+gf.domain));scopedProfiles=scopedProfiles.filter(pr=>pr.email?.endsWith("@"+gf.domain));}
    if(gf?.people?.length>0)scopedFlags=scopedFlags.filter(fl=>gf.people.includes((fl.profiles?.email||fl.qa_email||"").toLowerCase()));
    setFlags(scopedFlags);setSteps(s);setProfiles(scopedProfiles);
  }catch(e){console.error(e);}setLoading(false);},[token]);

  useEffect(()=>{load();},[load]);

  const getStepsForRule=(ruleId)=>steps.filter(s=>s.rule_id===ruleId).sort((a,b)=>a.occurrence-b.occurrence);
  const getOccurrenceCount=(profileId,ruleId)=>flags.filter(f=>f.profile_id===profileId&&f.rule_id===ruleId&&f.status!=="dismissed").length;

  const createFlag=async()=>{
    if(!selRule||!selProfile){show("error","Select a behavior and a person");return;}
    const occ=getOccurrenceCount(selProfile,selRule)+1;
    const rule=rules.find(r=>r.id===selRule);
    const step=getStepsForRule(selRule).find(s=>s.occurrence===occ);
    try{
      await sb.query("dam_flags",{token,method:"POST",body:{
        profile_id:selProfile,rule_id:selRule,severity:rule?.severity||"warning",
        recommended_action:step?.includes_pip?"pip":(step?.is_hr_investigation?"termination_review":"coaching"),
        occurrence_number:occ,escalation_step_id:step?.id||null,
        notes:flagNotes,trigger_data:{created_by:profile.id,step_action:step?.action||"No step defined"},
      }});
      show("success",`Flag created — occurrence #${occ}${step?": "+step.action:""}`);
      logActivity(token, profile?.email, "dam_flag_created", "dam_flags", selProfile, `Rule: ${rules.find(r=>r.id===selRule)?.name}, Occurrence: #${occ}`);
      setShowCreate(false);setSelRule("");setSelProfile("");setFlagNotes("");load();
    }catch(e){show("error",e.message);}
  };

  const updateFlagStatus=async(flagId,status)=>{
    setFlags(prev=>prev.map(f=>f.id===flagId?{...f,status,reviewed_by:profile.id,reviewed_at:new Date().toISOString()}:f));
    try{
      await sb.query("dam_flags",{token,method:"PATCH",body:{status,reviewed_by:profile.id,reviewed_at:new Date().toISOString()},filters:`id=eq.${flagId}`});
      logActivity(token, profile?.email, `dam_flag_${status}`, "dam_flags", flagId, `Status changed to: ${status}`);
      show("success","Flag updated");
    }catch(e){show("error",e.message);load();}
  };

  const behaviorTypes=[{key:"manipulation",label:"Manipulation",color:"var(--red)"},{key:"performance_management",label:"Performance management",color:"var(--amber)"},{key:"completion_attainment",label:"Completion & attainment",color:"var(--accent-text)"}];
  const statusColors={pending:"var(--amber)",acknowledged:"var(--accent-text)",action_created:"var(--blue)",resolved:"var(--green)",dismissed:"var(--tx3)"};

  if(loading)return<div className="page"><div className="loading-spinner"><div className="spinner"/></div></div>;

  return(<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
      <div>
        <div className="page-title">DAM engine</div>
        <div className="page-subtitle">Disciplinary Actions Matrix — behavioral accountability tracking</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {flags.filter(f=>f.status==="pending").length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--amber-bg)",color:"var(--amber)",fontSize:12,fontWeight:700}}>{flags.filter(f=>f.status==="pending").length} pending</span>}
        <button className="btn btn-primary" onClick={()=>setShowCreate(!showCreate)}><Icon d={icons.plus} size={16}/>Create flag</button>
      </div>
    </div>

    <div className="tab-bar">
      <button className={`tab-btn ${tab==="flags"?"active":""}`} onClick={()=>setTab("flags")}>Active flags ({flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").length})</button>
      <button className={`tab-btn ${tab==="rules"?"active":""}`} onClick={()=>setTab("rules")}>Behavior rules ({rules.length})</button>
      <button className={`tab-btn ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}>All history ({flags.length})</button>
    </div>

    {showCreate&&<div className="card" style={{marginBottom:16}}>
      <div className="card-header"><span className="card-title">Create DAM flag</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
        <div className="form-group"><label className="form-label">Person</label>
          <SearchableSelect
            options={profiles.filter(p=>p.role==="qa"||p.role==="senior_qa"||p.role==="qa_lead").map(p=>({value:p.id,label:(p.display_name||p.email)+` (${ROLE_LABELS[p.role]})`}))}
            value={selProfile}
            onChange={setSelProfile}
            placeholder="Select person..."
          />
        </div>
        <div className="form-group"><label className="form-label">Behavior</label>
          <SearchableSelect
            options={rules.map(r=>({value:r.id,label:`[${r.behavior_type}] ${r.name}`}))}
            value={selRule}
            onChange={setSelRule}
            placeholder="Select behavior..."
          />
        </div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-input" rows={2} value={flagNotes} onChange={e=>setFlagNotes(e.target.value)} placeholder="Context, evidence, audit findings..." style={{resize:"vertical"}}/>
        </div>
      </div>
      {selRule&&selProfile&&<div style={{marginTop:12,padding:"10px 14px",background:"var(--bg)",borderRadius:8,fontSize:13}}>
        <strong>Next occurrence:</strong> #{getOccurrenceCount(selProfile,selRule)+1}
        {(()=>{const step=getStepsForRule(selRule).find(s=>s.occurrence===getOccurrenceCount(selProfile,selRule)+1);return step?<span> → <span style={{color:step.is_hr_investigation?"var(--red)":"var(--amber)",fontWeight:600}}>{step.action}</span></span>:<span style={{color:"var(--tx3)"}}> — No escalation step defined for this occurrence</span>;})()}
      </div>}
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button className="btn btn-primary" onClick={createFlag}><Icon d={icons.dam} size={16}/>Create flag</button>
        <button className="btn btn-outline" onClick={()=>setShowCreate(false)}>Cancel</button>
      </div>
    </div>}

    {tab==="flags"&&<div className="card">
      {flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").length===0?
        <div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No active flags. Create one above or wait for auto-detection.</p></div>:
        <div className="table-wrap"><table><thead><tr><th>Person</th><th>Behavior</th><th>Category</th><th>Occurrence</th><th>Escalation</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
          {flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").map(f=>{
            const step=f.escalation_step_id?steps.find(s=>s.id===f.escalation_step_id):getStepsForRule(f.rule_id).find(s=>s.occurrence===f.occurrence_number);
            return(<tr key={f.id}>
              <td style={{fontWeight:500}}>{f.profiles?.display_name||f.profiles?.email||f.qa_email||"—"}</td>
              <td style={{fontSize:13}}>{f.dam_rules?.name||"—"}</td>
              <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:f.dam_rules?.behavior_type==="manipulation"?"var(--red-bg)":f.dam_rules?.behavior_type==="performance_management"?"var(--amber-bg)":"var(--accent-light)",color:f.dam_rules?.behavior_type==="manipulation"?"var(--red)":f.dam_rules?.behavior_type==="performance_management"?"var(--amber)":"var(--accent-text)",fontWeight:500}}>{f.dam_rules?.behavior_type?.replace(/_/g," ")||"—"}</span></td>
              <td style={{fontWeight:600}}>#{f.occurrence_number}</td>
              <td style={{fontSize:13,color:step?.is_hr_investigation?"var(--red)":"var(--tx)"}}>{step?.action||"—"}{step?.deduction_days>0&&<span style={{color:"var(--red)",marginLeft:4}}>(-{step.deduction_days}d)</span>}</td>
              <td><span style={{fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600,background:f.status==="pending"?"var(--amber-bg)":"var(--green-bg)",color:statusColors[f.status]||"var(--tx3)"}}>{f.status}</span></td>
              <td style={{fontSize:12,color:"var(--tx2)"}}>{new Date(f.triggered_at).toLocaleDateString()}</td>
              <td><div style={{display:"flex",gap:4}}>
                {f.status==="pending"&&<button className="btn btn-outline btn-sm" onClick={()=>updateFlagStatus(f.id,"acknowledged")}>Acknowledge</button>}
                {(f.status==="pending"||f.status==="acknowledged")&&<button className="btn btn-outline btn-sm" onClick={()=>updateFlagStatus(f.id,"resolved")} style={{color:"var(--green)"}}>Resolve</button>}
                {f.status==="pending"&&<button className="btn btn-outline btn-sm" onClick={()=>updateFlagStatus(f.id,"dismissed")} style={{color:"var(--tx3)"}}>Dismiss</button>}
              </div></td>
            </tr>);})}
        </tbody></table></div>}
    </div>}

    {tab==="rules"&&<div>{behaviorTypes.map(bt=><div key={bt.key} className="card" style={{marginBottom:16}}>
      <div className="card-header"><span className="card-title" style={{color:bt.color}}>{bt.label}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{rules.filter(r=>r.behavior_type===bt.key).length} behaviors</span></div>
      {rules.filter(r=>r.behavior_type===bt.key).map(r=><div key={r.id} style={{padding:"12px 0",borderBottom:"1px solid var(--bd2)"}}>
        <div style={{fontWeight:500,fontSize:14,marginBottom:4}}>{r.name}</div>
        {r.description&&<div style={{fontSize:13,color:"var(--tx2)",marginBottom:6}}>{r.description}</div>}
        <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:"var(--tx3)"}}>
          {r.auditing_flow&&<span>Audit: {r.auditing_flow}</span>}
          {r.executor_role&&<span>Executor: {ROLE_LABELS[r.executor_role]}</span>}
          {r.auditor_role&&<span>Auditor: {ROLE_LABELS[r.auditor_role]}</span>}
        </div>
        <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
          {getStepsForRule(r.id).map(s=><span key={s.id} style={{fontSize:11,padding:"3px 10px",borderRadius:12,background:s.is_hr_investigation?"var(--red-bg)":"var(--bg2)",color:s.is_hr_investigation?"var(--red)":"var(--tx2)",fontWeight:500}}>
            {s.occurrence}{s.occurrence===1?"st":s.occurrence===2?"nd":s.occurrence===3?"rd":"th"}: {s.action}
          </span>)}
        </div>
      </div>)}
    </div>)}</div>}

    {tab==="history"&&<div className="card">
      {flags.length===0?<div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No flags in history yet.</p></div>:
      <>
      {hasRole(profile?.role,"super_admin")&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={async()=>{
          if(!confirm(`Permanently delete ALL ${flags.length} DAM flag records? This cannot be undone.`))return;
          try{for(const f of flags){await sb.query("dam_flags",{token,method:"DELETE",filters:`id=eq.${f.id}`});}show("success","All DAM flags deleted");setFlags([]);}catch(e){show("error",e.message);}
        }}><Icon d={icons.trash} size={14}/>Clear all history</button>
      </div>}
      <div className="table-wrap"><table><thead><tr><th>Person</th><th>Behavior</th><th>Occ.</th><th>Status</th><th>Date</th><th>Notes</th>{hasRole(profile?.role,"super_admin")&&<th></th>}</tr></thead><tbody>
        {flags.map(f=>(<tr key={f.id}>
          <td style={{fontWeight:500}}>{f.profiles?.display_name||"—"}</td>
          <td style={{fontSize:13}}>{f.dam_rules?.name||"—"}</td>
          <td>#{f.occurrence_number}</td>
          <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:f.status==="resolved"?"var(--green-bg)":f.status==="dismissed"?"var(--bg2)":"var(--amber-bg)",color:statusColors[f.status]||"var(--tx3)"}}>{f.status}</span></td>
          <td style={{fontSize:12,color:"var(--tx2)"}}>{new Date(f.triggered_at).toLocaleDateString()}</td>
          <td style={{fontSize:12,color:"var(--tx2)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.notes||"—"}</td>
          {hasRole(profile?.role,"super_admin")&&<td>
            <button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={async()=>{
              if(!confirm("Delete this flag permanently?"))return;
              try{await sb.query("dam_flags",{token,method:"DELETE",filters:`id=eq.${f.id}`});show("success","Flag deleted");setFlags(prev=>prev.filter(x=>x.id!==f.id));}catch(e){show("error",e.message);}
            }}><Icon d={icons.trash} size={14}/></button>
          </td>}
        </tr>))}
      </tbody></table></div>
      </>}
    </div>}
    {el}
  </div>);
}

/* ═══ LEADERBOARD ═══ */
function LeaderboardPage({token, profile, gf}) {
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selTeam, setSelTeam] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [view, setView] = useState("individual");
  const [expandedRow, setExpandedRow] = useState(null);
  const [search, setSearch] = useState("");
  const [selQuarter, setSelQuarter] = useState("");
  const [selYear, setSelYear] = useState("");
  const [selQaQuarterly, setSelQaQuarterly] = useState("");
  const {show, el} = useToast();

  // Sync global filters to local state — runs whenever global filters change
  useEffect(() => {
    if (gf?.domain) setSelDomain(gf.domain);
    else if (!gf?.domain && selDomain && !hasRole(profile?.role,"qa_supervisor")) setSelDomain("");
    if (gf?.month && months.includes(gf.month)) setSelMonth(gf.month);
    if (gf?.teams?.length > 0) setSelTeam(gf.teams[0]);
    else if (gf?.teams?.length === 0 && selTeam) setSelTeam("");
  }, [gf?.domain, gf?.month, JSON.stringify(gf?.teams), months.length]);

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows, profRows] = await Promise.all([
          sb.query("mtd_scores", {select:"*",filters:"order=month.desc,final_performance.desc",token}),
          sb.query("qa_roster", {select:"email,queue,manager_email",token}).catch(()=>[]),
          sb.query("profiles", {select:"id,email,role",filters:"status=eq.active",token}).catch(()=>[]),
        ]);
        setData(rows);
        setRoster(rosterRows);
        // Build set of non-QA emails to exclude from rankings
        // Build blacklist: for any non-QA user in profiles, block both @tabby.ai and @tabby.sa variants
        const nonQaProfiles = profRows.filter(p => p.role !== "qa");
        const blacklist = new Set();
        nonQaProfiles.forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          blacklist.add(email);
          // Also block the other domain variant
          const local = email.split("@")[0];
          if (email.endsWith("@tabby.ai")) blacklist.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) blacklist.add(local + "@tabby.ai");
        });
        const qaOnlyRows = rows.filter(r => !blacklist.has(r.qa_email?.toLowerCase()));
        setData(qaOnlyRows);
        const uniqueMonths = sortMonthsDesc([...new Set(qaOnlyRows.map(r => r.month))]);
        setMonths(uniqueMonths);
        // Global filter month takes priority, then default to latest
        if (gf?.month && uniqueMonths.includes(gf.month)) {
          setSelMonth(gf.month);
        } else if (uniqueMonths.length > 0 && !selMonth) {
          setSelMonth(uniqueMonths[0]);
        }
        // Global filter domain takes priority
        if (gf?.domain) {
          setSelDomain(gf.domain);
        } else if (hasRole(profile?.role,"qa_supervisor") && !hasRole(profile?.role,"admin") && !selDomain) {
          const svDomain = profile?.operational_domain || profile?.domain || "";
          if (svDomain) setSelDomain(svDomain);
        }
        if (gf?.teams?.length > 0) setSelTeam(gf.teams[0]);
      } catch (e) {
        console.error("Leaderboard:", e);
        show("error", "Failed to load leaderboard data");
      }
      setLoading(false);
    })();
  }, [token]);

  // ── Slab calculation engine ──
  // Parses raw value to a number (handles "94.46%", 0.944, 1.345, etc.)
  const parseRaw = (val) => {
    if (!val && val !== 0) return null;
    const s = String(val).trim().replace(",", ".");
    if (s.includes("%")) return parseFloat(s.replace("%", ""));
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    // If between 0 and 2, it's likely a decimal (0.944 = 94.4%)
    if (n >= 0 && n <= 2) return n * 100;
    return n;
  };

  // KPI slab definitions: { thresholds: [slab1, slab2, slab3], weight }
  // Slab 0 = below slab1 → 0%, Slab 1 = ≥slab1 → 50%, Slab 2 = ≥slab2 → 75%, Slab 3 = ≥slab3 → 100%
  const KPI_SLABS = {
    occupancy:    { label: "Occupancy",            weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
    coaching:     { label: "Coaching on-time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
    calibration:  { label: "Calibration",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
    observation:  { label: "Coaching observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
    rtr:          { label: "RTR score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
  };

  const calcSlab = (rawPct, thresholds) => {
    if (rawPct === null || rawPct === undefined) return { slab: 0, pct: 0, label: "No data" };
    if (rawPct >= thresholds[2]) return { slab: 3, pct: 100, label: "Slab 3" };
    if (rawPct >= thresholds[1]) return { slab: 2, pct: 75,  label: "Slab 2" };
    if (rawPct >= thresholds[0]) return { slab: 1, pct: 50,  label: "Slab 1" };
    return { slab: 0, pct: 0, label: "Slab 0" };
  };

  const getKpiScores = (row) => {
    return Object.entries(KPI_SLABS).map(([key, def]) => {
      const rawPct = parseRaw(row[def.rawKey]);
      const slab = calcSlab(rawPct, def.thresholds);
      const score = (def.weight * slab.pct) / 100; // weighted score
      return { key, label: def.label, weight: def.weight, rawPct, slab, score, thresholds: def.thresholds };
    });
  };

  const getTotalScore = (row) => {
    const kpis = getKpiScores(row);
    return kpis.reduce((sum, k) => sum + k.score, 0);
  };

  // Format raw percentage for display
  const fmtRaw = (val) => {
    if (val === null || val === undefined) return "—";
    return val.toFixed(1) + "%";
  };

  const monthData = data.filter(r => r.month === selMonth);
  const rosterMap = {};
  roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  const teams = [...new Set(roster.filter(r => r.queue && (!selDomain || r.email?.endsWith("@"+selDomain))).map(r => r.queue))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+selDomain));
  if (selTeam) filtered = filtered.filter(r => rosterMap[r.qa_email?.toLowerCase()]?.queue === selTeam);
  if (search.trim()) filtered = filtered.filter(r => r.qa_email?.toLowerCase().includes(search.toLowerCase()));
  // Apply global people filter
  if (gf?.people?.length > 0) filtered = filtered.filter(r => gf.people.includes(r.qa_email?.toLowerCase()));
  // Rank by calculated total score
  const ranked = [...filtered].sort((a, b) => getTotalScore(b) - getTotalScore(a));

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const initialsFromEmail = (email) => {
    const name = nameFromEmail(email);
    const parts = name.split(" ");
    return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
  };

  const teamData = (() => {
    const tlMap = {};
    ranked.forEach(r => {
      const tl = r.qa_tl || "Unassigned";
      if (!tlMap[tl]) tlMap[tl] = { tl, members: [], totalScore: 0 };
      tlMap[tl].members.push(r);
      tlMap[tl].totalScore += getTotalScore(r);
    });
    return Object.values(tlMap).map(t => ({
      ...t,
      avgScore: t.members.length ? (t.totalScore / t.members.length) : 0,
      highest: t.members.length ? Math.max(...t.members.map(m => getTotalScore(m))) : 0,
      lowest: t.members.length ? Math.min(...t.members.map(m => getTotalScore(m))) : 0,
      totalDsat: t.members.reduce((a, m) => a + (m.dsat || 0), 0),
    })).sort((a, b) => b.avgScore - a.avgScore);
  })();

  const maxScore = 55; // total weight of 5 non-CSAT KPIs
  const avgScore = ranked.length ? (ranked.reduce((a, r) => a + getTotalScore(r), 0) / ranked.length) : 0;
  const topPerson = ranked[0];
  const totalDsat = ranked.reduce((a, r) => a + (r.dsat || 0), 0);
  // Color based on score out of 55
  const scoreColor = (v) => v >= maxScore * 0.7 ? "var(--green)" : v >= maxScore * 0.4 ? "var(--amber)" : "var(--red)";
  const scoreBg = (v) => v >= maxScore * 0.7 ? "var(--green-bg)" : v >= maxScore * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Leaderboard</div>
          <div className="page-subtitle">Performance rankings — {selMonth || "All months"}</div>
        </div>
        {hasRole(profile?.role,"qa_lead")&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <SearchableSelect options={months} value={selMonth} onChange={v=>{setSelMonth(v);setSelDomain("");setSelTeam("");}} placeholder="Select month"/>
          <SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={selDomain} onChange={v=>{setSelDomain(v);setSelTeam("");}} placeholder="All domains"/>
        </div>}
      </div>

      {loading ? <div className="loading-spinner"><div className="spinner"/></div> : <>

      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
        <div className="tabs">
          <button className={`tab ${view==="individual"?"active":""}`} onClick={()=>setView("individual")}>Individual</button>
          {hasRole(profile?.role,"qa_supervisor")&&<button className={`tab ${view==="team"?"active":""}`} onClick={()=>setView("team")}>By team lead</button>}
          {hasRole(profile?.role,"qa_supervisor")&&<button className={`tab ${view==="quarterly"?"active":""}`} onClick={()=>setView("quarterly")}>Quarterly</button>}
        </div>
        {hasRole(profile?.role,"qa_lead")&&<SearchableSelect options={teams} value={selTeam} onChange={setSelTeam} placeholder={`All teams (${teams.length})`}/>}
        {view==="individual" && hasRole(profile?.role,"qa_lead") && <input className="input" placeholder="Search by name or email..." value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:220,marginLeft:"auto",fontSize:12}}/>}
      </div>

      {hasRole(profile?.role,"qa_lead")&&<div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">{view==="individual"?"Ranked":"Teams"}</div>
          <div className="stat-value">{view==="individual"?ranked.length:teamData.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg score</div>
          <ProgressRing value={avgScore} max={maxScore} size={48} stroke={4}
            color={scoreColor(avgScore)} label={avgScore.toFixed(1)} sublabel={`of ${maxScore}`}
          />
        </div>
        {topPerson && view==="individual" && <div className="stat-card">
          <div className="stat-label">Top performer</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:4}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",color:"#92400E",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12}}>1</div>
            <div style={{fontWeight:700,fontSize:15,letterSpacing:"-.3px"}}>{nameFromEmail(topPerson.qa_email)}</div>
          </div>
        </div>}
        <div className="stat-card">
          <div className="stat-label">Total DSAT</div>
          <div className="stat-value" style={{color:totalDsat>0?"var(--red)":"var(--tx)"}}>{totalDsat}</div>
        </div>
      </div>}

      {view==="individual" && (()=>{
        const myEmailInd = profile?.email?.toLowerCase();
        const isQaInd = profile?.role === "qa";
        const isLeadInd = hasRole(profile?.role, "qa_lead") && !hasRole(profile?.role, "qa_supervisor");
        
        // For QA leads: filter to their team only (cross-domain)
        const myLocalInd = myEmailInd?.split("@")[0]||"";
        const myAltInd = myEmailInd?(myEmailInd.endsWith("@tabby.ai")?myLocalInd+"@tabby.sa":myLocalInd+"@tabby.ai"):"";
        const myTeamEmailsInd = roster.filter(r => {const m=r.manager_email?.toLowerCase();return m&&(m===myEmailInd||m===myAltInd||m===myLocalInd);}).map(r => r.email?.toLowerCase());
        
        let visibleRanked = ranked;
        if (isQaInd) {
          // QAs: top 3 + their own rank
          const top3 = ranked.slice(0, 3);
          const myRankIdx = ranked.findIndex(r => r.qa_email?.toLowerCase() === myEmailInd);
          const myEntry = myRankIdx >= 0 ? ranked[myRankIdx] : null;
          visibleRanked = [...top3];
          if (myEntry && myRankIdx >= 3) visibleRanked.push({ ...myEntry, _myRank: myRankIdx + 1 });
          const seen = new Set();
          visibleRanked = visibleRanked.filter(r => { const e = r.qa_email?.toLowerCase(); if (seen.has(e)) return false; seen.add(e); return true; });
        } else if (isLeadInd && myTeamEmailsInd.length > 0) {
          // Leads: their team
          visibleRanked = ranked.filter(r => myTeamEmailsInd.includes(r.qa_email?.toLowerCase()) || r.qa_email?.toLowerCase() === myEmailInd);
        }

        return <>
        {isQaInd && <div style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8,marginBottom:12,fontSize:12,color:"var(--tx3)"}}>
          Showing top 3 performers and your position. Full rankings are visible to team leads.
        </div>}

        {/* ── QA Self-Service: My Performance Panel ── */}
        {isQaInd && (()=>{
          const myRankIdx = ranked.findIndex(r => r.qa_email?.toLowerCase() === myEmailInd);
          const myRow = myRankIdx >= 0 ? ranked[myRankIdx] : null;
          if (!myRow) return null;
          const myKpis = getKpiScores(myRow);
          const myTotal = myKpis.reduce((s,k) => s + k.score, 0);
          // Historical scores across months
          const history = months.slice(0,6).reverse().map(m => {
            const row = mtd.find(r => r.month === m && r.qa_email?.toLowerCase() === myEmailInd);
            if (!row) return { month: m, score: null };
            const ks = getKpiScores(row);
            return { month: m, score: ks.reduce((s,k) => s + k.score, 0) };
          }).filter(h => h.score !== null);

          return <div className="card" style={{marginBottom:24,borderLeft:"4px solid var(--tabby-purple,#6A2C79)"}}>
            <div className="card-header">
              <span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>📊</span> My Performance — {selMonth}
              </span>
              <span style={{fontSize:22,fontWeight:800,letterSpacing:"-1px",color:scoreColor(myTotal)}}>
                {myTotal.toFixed(1)} <span style={{fontSize:13,fontWeight:400,color:"var(--tx3)"}}>/ {maxScore}</span>
                <span style={{fontSize:12,fontWeight:600,color:"var(--tx3)",marginLeft:8}}>Rank #{myRankIdx+1} of {ranked.length}</span>
              </span>
            </div>

            {/* KPI Slab Breakdown */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 20px",marginBottom:16}}>
              {myKpis.map(k => (
                <div key={k.key} style={{padding:"10px 14px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--bd2)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:600}}>{k.label}</span>
                    <span style={{fontSize:12,fontWeight:700,color:scoreColor(k.score/k.weight*maxScore)}}>{k.score.toFixed(1)} / {k.weight}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--tx2)",marginBottom:4}}>
                    <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</span>
                    <span style={{padding:"1px 6px",borderRadius:8,fontSize:9,fontWeight:600,
                      background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=75?"var(--blue-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",
                      color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"
                    }}>{k.slab.label} ({k.slab.pct}%)</span>
                  </div>
                  <div style={{height:5,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)",transition:"width .4s"}}/></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"var(--tx3)",marginTop:3}}>
                    <span>Slab 1: ≥{k.thresholds[0]}%</span><span>Slab 2: ≥{k.thresholds[1]}%</span><span>Slab 3: ≥{k.thresholds[2]}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Extra metrics */}
            <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:16,paddingBottom:12,borderBottom:"1px solid var(--bd2)"}}>
              <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>DSAT: </span><span style={{fontWeight:600,color:(myRow.dsat||0)>0?"var(--red)":"var(--green)"}}>{myRow.dsat||0}</span></div>
              <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Tickets/day: </span><span style={{fontWeight:600}}>{myRow.ticket_per_day||"—"}</span></div>
              <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>JKQ: </span><span style={{fontWeight:600,color:myRow.jkq_result==="Pass"?"var(--green)":myRow.jkq_result==="Missed"?"var(--red)":"var(--tx2)"}}>{myRow.jkq_result||"—"}</span></div>
              <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Working days: </span><span style={{fontWeight:600}}>{myRow.working_days||"—"}</span></div>
            </div>

            {/* Historical Trend */}
            {history.length >= 2 && <div>
              <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Score history</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:60}}>
                {history.map((h,i) => {
                  const pct = h.score / maxScore * 100;
                  const isLatest = i === history.length - 1;
                  return <div key={h.month} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,gap:4}}>
                    <span style={{fontSize:10,fontWeight:isLatest?700:400,color:isLatest?scoreColor(h.score):"var(--tx3)"}}>{h.score.toFixed(1)}</span>
                    <div style={{width:"100%",height:`${Math.max(pct*0.5,4)}px`,borderRadius:4,background:isLatest?scoreColor(h.score):"var(--bd)",transition:"height .3s"}}/>
                    <span style={{fontSize:9,color:"var(--tx3)"}}>{h.month.split("-")[0]}</span>
                  </div>;
                })}
              </div>
            </div>}
          </div>;
        })()}

        {/* Podium top 3 */}
        {ranked.length >= 3 && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:20,marginBottom:32,flexWrap:"wrap"}}>
          {[1,0,2].map(idx => {
            const r = ranked[idx]; const rank = idx + 1; const isGold = rank === 1;
            const total = getTotalScore(r);
            const podiumColors = {
              1: { bg: "linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02))", border: "rgba(245,158,11,.3)", medal: "#F59E0B", ring: "#F59E0B" },
              2: { bg: "linear-gradient(135deg, rgba(156,163,175,.08), rgba(156,163,175,.02))", border: "rgba(156,163,175,.2)", medal: "#9CA3AF", ring: "#9CA3AF" },
              3: { bg: "linear-gradient(135deg, rgba(234,88,12,.06), rgba(234,88,12,.02))", border: "rgba(234,88,12,.2)", medal: "#EA580C", ring: "#EA580C" },
            }[rank];
            return (<div key={r.qa_email} style={{
              textAlign:"center", padding:isGold?"28px 32px":"22px 26px", minWidth:isGold?200:170,
              background: podiumColors.bg, border: `1px solid ${podiumColors.border}`,
              borderRadius: 16, transform:isGold?"translateY(-12px)":"none", transition:"all .3s cubic-bezier(.4,0,.2,1)",
              position: "relative", overflow: "hidden",
            }}
              onMouseEnter={e => e.currentTarget.style.transform = isGold ? "translateY(-16px) scale(1.02)" : "translateY(-4px) scale(1.02)"}
              onMouseLeave={e => e.currentTarget.style.transform = isGold ? "translateY(-12px)" : "none"}
            >
              {/* Rank badge */}
              <div style={{
                width: isGold?36:28, height: isGold?36:28, borderRadius: "50%", background: podiumColors.medal,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: isGold?16:13, margin: "0 auto 12px",
                boxShadow: `0 4px 12px ${podiumColors.medal}40`,
              }}>{rank}</div>
              {/* Avatar with score ring */}
              <div style={{position:"relative",margin:"0 auto 10px",width:isGold?64:52,height:isGold?64:52}}>
                <ProgressRing value={total} max={maxScore} size={isGold?64:52} stroke={3} color={podiumColors.ring} />
                <div style={{
                  position:"absolute",inset:isGold?8:6,borderRadius:"50%",background:"var(--primary-light)",
                  color:"var(--tabby-green)",display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:700,fontSize:isGold?16:13,letterSpacing:"-0.5px",
                }}>{initialsFromEmail(r.qa_email)}</div>
              </div>
              <div style={{fontWeight:700,fontSize:isGold?16:14,letterSpacing:"-.3px"}}>{nameFromEmail(r.qa_email)}</div>
              <div style={{fontSize:11,color:"var(--tx3)",marginBottom:10}}>{r.qa_email.split("@")[1]}</div>
              <div style={{fontSize:isGold?28:22,fontWeight:800,color:scoreColor(total),letterSpacing:"-1px",fontVariantNumeric:"tabular-nums"}}>{total.toFixed(1)}<span style={{fontSize:12,fontWeight:500,color:"var(--tx3)"}}> / {maxScore}</span></div>
              <div style={{fontSize:10,color:"var(--tx3)",marginTop:6,fontWeight:500}}>JKQ: {r.jkq_result||"—"} · {r.ticket_per_day} tickets/day</div>
            </div>);
          })}
        </div>}

        {/* Full ranking table */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Full rankings — {selMonth}</span>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:12,color:"var(--tx3)"}}>{visibleRanked.length} specialists · Scored out of {maxScore}</span>
              {hasRole(profile?.role,"qa_lead")&&<button className="btn btn-outline btn-sm" onClick={()=>{
                const kpiHeaders=Object.values(KPI_SLABS).map(k=>k.label);
                const csv=["Rank,Specialist,Email,TL,"+kpiHeaders.join(",")+",Total"];
                ranked.forEach((r,i)=>{
                  const kpis=getKpiScores(r);
                  csv.push(`${i+1},"${nameFromEmail(r.qa_email)}",${r.qa_email},"${r.qa_tl?nameFromEmail(r.qa_tl):""}",${kpis.map(k=>k.score.toFixed(1)).join(",")},${getTotalScore(r).toFixed(1)}`);
                });
                const blob=new Blob([csv.join("\n")],{type:"text/csv"});
                const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`leaderboard_${selMonth}.csv`;a.click();
              }} style={{fontSize:11}}>
                <Icon d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" size={13}/>Export CSV
              </button>}
            </div>
          </div>
          {visibleRanked.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {selMonth}.</p></div> :
          <div className="table-wrap"><table><thead><tr>
            <th style={{width:50}}>#</th>
            <th>Specialist</th>
            <th>TL</th>
            {Object.values(KPI_SLABS).map(k => <th key={k.label} style={{textAlign:"center",minWidth:100}}>{k.label}<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{k.weight}</span></th>)}
            <th style={{textAlign:"center",minWidth:80}}>Total<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{maxScore}</span></th>
            <th style={{width:40}}></th>
          </tr></thead><tbody>
            {visibleRanked.map((r, i) => {
              const rank = r._myRank || (ranked.findIndex(x => x.qa_email?.toLowerCase() === r.qa_email?.toLowerCase()) + 1);
              const isExp = expandedRow === r.id;
              const isMe = r.qa_email?.toLowerCase() === myEmailInd;
              const showGap = isQaInd && r._myRank && r._myRank > 4;
              const kpis = getKpiScores(r);
              const total = kpis.reduce((s, k) => s + k.score, 0);
              return (<React.Fragment key={r.id || r.qa_email}>
                {showGap && <tr><td colSpan={4 + Object.keys(KPI_SLABS).length} style={{textAlign:"center",padding:"6px",color:"var(--tx3)",fontSize:12,background:"var(--bg)"}}>···</td></tr>}
                <tr onClick={() => setExpandedRow(isExp ? null : r.id)} style={{cursor:"pointer",background:isMe?"var(--accent-light)":"transparent"}}>
                  <td>{rank <= 3 ? <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",fontWeight:700,fontSize:12,background:rank===1?"linear-gradient(135deg,#FEF3C7,#FDE68A)":rank===2?"linear-gradient(135deg,#F3F4F6,#E5E7EB)":"linear-gradient(135deg,#FED7AA,#FDBA74)",color:rank===1?"#92400E":rank===2?"#374151":"#9A3412",boxShadow:rank===1?"0 2px 8px rgba(245,158,11,.3)":"none"}}>{rank}</span> : <span style={{color:"var(--tx3)",fontWeight:600,fontSize:13}}>{rank}</span>}</td>
                  <td><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:34,height:34,borderRadius:"50%",flexShrink:0,background:"var(--primary-light)",color:"var(--tabby-purple-light,var(--accent-text))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,border:"2px solid var(--bd2)"}}>{initialsFromEmail(r.qa_email)}</div><div><div style={{fontWeight:600,fontSize:13.5,letterSpacing:"-.2px"}}>{nameFromEmail(r.qa_email)}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{r.qa_email}</div></div></div></td>
                  <td style={{fontSize:13,color:"var(--tx2)"}}>{r.qa_tl ? nameFromEmail(r.qa_tl) : "—"}</td>
                  {kpis.map(k => (
                    <td key={k.key} style={{textAlign:"center",padding:"8px 6px"}}>
                      <div style={{fontSize:13,fontWeight:600,color:scoreColor(k.score/k.weight*maxScore)}}>{k.score.toFixed(1)}</div>
                      <div style={{fontSize:10,color:"var(--tx3)"}}>{k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</div>
                      <div style={{height:3,background:"var(--bd2)",borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:2,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)",transition:"width .3s"}}/></div>
                    </td>
                  ))}
                  <td style={{textAlign:"center"}}>
                    <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:600,background:scoreBg(total),color:scoreColor(total)}}>{total.toFixed(1)}</span>
                  </td>
                  <td><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
                </tr>

                {/* Expanded KPI detail */}
                {isExp && <tr><td colSpan={9+Object.keys(KPI_SLABS).length} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px 16px 60px"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--tx2)",marginBottom:12,textTransform:"uppercase",letterSpacing:".5px"}}>KPI slab breakdown</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 24px"}}>
                    {kpis.map(k => (
                      <div key={k.key} style={{padding:"10px 12px",background:"var(--bg3)",borderRadius:8,border:"1px solid var(--bd2)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:13,fontWeight:600}}>{k.label}</span>
                          <span style={{fontSize:13,fontWeight:700,color:scoreColor(k.score/k.weight*maxScore)}}>{k.score.toFixed(1)} / {k.weight}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--tx2)",marginBottom:6}}>
                          <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "No data"}</span>
                          <span style={{padding:"1px 8px",borderRadius:10,fontSize:10,fontWeight:600,
                            background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=75?"var(--blue-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",
                            color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"
                          }}>{k.slab.label} ({k.slab.pct}%)</span>
                        </div>
                        <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)",transition:"width .4s"}}/></div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--tx3)",marginTop:4}}>
                          <span>Slab 1: ≥{k.thresholds[0]}%</span>
                          <span>Slab 2: ≥{k.thresholds[1]}%</span>
                          <span>Slab 3: ≥{k.thresholds[2]}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:16,paddingTop:12,borderTop:"1px solid var(--bd2)"}}>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Tickets/day: </span><span style={{fontWeight:600}}>{r.ticket_per_day}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>JKQ: </span><span style={{fontWeight:600,color:r.jkq_result==="Pass"?"var(--green)":r.jkq_result==="Missed"?"var(--red)":"var(--tx2)"}}>{r.jkq_result||"—"} {r.jkq_score>0?`(${r.jkq_score})`:""}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>DSAT: </span><span style={{fontWeight:600}}>{r.dsat||0}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>SBS: </span><span style={{fontWeight:600}}>{r.sbs||0}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Working days: </span><span style={{fontWeight:600}}>{r.working_days||0}{r.ramadan_wds ? ` (${r.ramadan_wds} Ramadan)` : ""}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Total: </span><span style={{fontWeight:700,color:scoreColor(total)}}>{total.toFixed(1)} / {maxScore}</span></div>
                  </div>
                </div></td></tr>}
              </React.Fragment>);
            })}
          </tbody></table></div>}
        </div>
      </>;
      })()}

      {view==="team" && <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {teamData.length === 0 ? <div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {selMonth}.</p></div></div> :
        teamData.map((team, ti) => {
          const rank = ti + 1; const isGold = rank === 1;
          return (<div key={team.tl} className="card" style={{border:isGold?"2px solid var(--amber)":"1px solid var(--bd2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:isGold?"var(--amber-bg)":"var(--bg2)",color:isGold?"var(--amber)":"var(--tx2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16}}>#{rank}</div>
                <div><div style={{fontWeight:600,fontSize:15}}>{nameFromEmail(team.tl)}</div><div style={{fontSize:12,color:"var(--tx3)"}}>{team.tl} · {team.members.length} member{team.members.length!==1?"s":""}</div></div>
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:700,color:scoreColor(team.avgScore)}}>{team.avgScore.toFixed(1)}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {maxScore}</span></div><div style={{fontSize:11,color:"var(--tx3)"}}>avg score</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,paddingTop:12,borderTop:"1px solid var(--bd2)",marginBottom:14}}>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Highest</div><div style={{fontSize:16,fontWeight:600,color:"var(--green)"}}>{team.highest.toFixed(1)} / {maxScore}</div></div>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Lowest</div><div style={{fontSize:16,fontWeight:600,color:scoreColor(team.lowest)}}>{team.lowest.toFixed(1)} / {maxScore}</div></div>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Total DSAT</div><div style={{fontSize:16,fontWeight:600,color:"var(--tx)"}}>{team.totalDsat}</div></div>
            </div>
            <div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Members</div>
            {team.members.sort((a,b)=>getTotalScore(b)-getTotalScore(a)).map((m,mi) => {
              const mScore = getTotalScore(m);
              return (
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:mi<team.members.length-1?"1px solid var(--bd2)":"none"}}>
                <span style={{fontSize:12,color:"var(--tx3)",width:20,textAlign:"right"}}>{mi+1}.</span>
                <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>{initialsFromEmail(m.qa_email)}</div>
                <span style={{fontSize:13,flex:1}}>{nameFromEmail(m.qa_email)}</span>
                <span style={{fontSize:13,fontWeight:600,color:scoreColor(mScore)}}>{mScore.toFixed(1)} / {maxScore}</span>
              </div>);
            })}
          </div>);
        })}
      </div>}

      {/* ═══ QUARTERLY VIEW ═══ */}
      {view==="quarterly" && (()=>{
        const parseMonth = (m) => {
          if (!m) return null;
          const parts = m.split("-");
          const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const mi = monthNames.indexOf(parts[0]);
          const yr = parseInt(parts[1]);
          if (mi === -1 || isNaN(yr)) return null;
          return { monthIndex: mi, year: yr, quarter: Math.floor(mi / 3) + 1 };
        };
        const allParsed = months.map(m => ({ raw: m, ...parseMonth(m) })).filter(p => p.monthIndex !== undefined);
        const quarterMap = {};
        allParsed.forEach(p => {
          const key = `Q${p.quarter}-${p.year}`;
          if (!quarterMap[key]) quarterMap[key] = { label: key, year: p.year, quarter: p.quarter, months: [] };
          quarterMap[key].months.push(p.raw);
        });
        const quarters = Object.values(quarterMap).sort((a, b) => b.year - a.year || b.quarter - a.quarter);
        const activeQ = selQuarter && quarters.find(q => q.label === selQuarter) ? selQuarter : (quarters[0]?.label || "");
        const qData = quarters.find(q => q.label === activeQ);
        // Sort months chronologically within the quarter
        const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const qMonths = qData ? [...qData.months].sort((a, b) => {
          const ai = monthOrder.indexOf(a.split("-")[0]);
          const bi = monthOrder.indexOf(b.split("-")[0]);
          return ai - bi;
        }) : [];
        const qRows = data.filter(r => qMonths.includes(r.month));

        // For each QA, calculate their slab score per month (0-55), then sum across the quarter
        // Max per month = 55, so max per quarter = 55 × months (165 for 3 months)
        const qaMap = {};
        qRows.forEach(row => {
          const email = row.qa_email?.toLowerCase();
          if (!email) return;
          if (selDomain && !email.endsWith("@" + selDomain)) return;
          if (selTeam && rosterMap[email]?.queue !== selTeam) return;
          if (!qaMap[email]) qaMap[email] = { email: row.qa_email, months_present: 0, monthlyScores: [], tl: row.qa_tl, totalDsat: 0, totalTickets: 0, totalWorkingDays: 0 };
          qaMap[email].months_present++;
          qaMap[email].totalDsat += (row.dsat || 0);
          qaMap[email].totalTickets += (row.ticket_per_day || 0);
          qaMap[email].totalWorkingDays += (row.working_days || 0);
          // Raw slab score for this month (0-55)
          const monthScore = getTotalScore(row);
          qaMap[email].monthlyScores.push(monthScore);
        });

        // Quarterly total = sum of monthly raw scores
        const allQas = Object.values(qaMap).map(qa => {
          const totalScore = qa.monthlyScores.reduce((s, p) => s + p, 0);
          return { ...qa, totalScore };
        }).sort((a, b) => b.totalScore - a.totalScore);

        // Visibility
        const myEmailQ = profile?.email?.toLowerCase();
        const isQaQ = profile?.role === "qa";
        const isLeadQ = hasRole(profile?.role, "qa_lead");
        const isSupervisorQ = hasRole(profile?.role, "qa_supervisor");
        const isAdminQ = hasRole(profile?.role, "admin");
        const myDomainQ = profile?.operational_domain || profile?.domain || "tabby.ai";
        const myLocalQ = myEmailQ?.split("@")[0]||"";
        const myAltQ = myEmailQ?(myEmailQ.endsWith("@tabby.ai")?myLocalQ+"@tabby.sa":myLocalQ+"@tabby.ai"):"";
        const rosterTeamQ = roster.filter(r => {const m=r.manager_email?.toLowerCase?.();return m&&(m===myEmailQ||m===myAltQ||m===myLocalQ);}).map(r => r.email?.toLowerCase())
          .concat(qRows.filter(row=>{ const tl=row.qa_tl?.toLowerCase(); return tl&&(tl===myEmailQ||tl===myAltQ); }).map(r=>r.qa_email?.toLowerCase()));
        const teamEmailsQ = [...new Set(rosterTeamQ)];

        let visibleQas;
        if (isAdminQ) { visibleQas = allQas; }
        else if (isSupervisorQ) { visibleQas = allQas.filter(qa => qa.email?.endsWith("@" + myDomainQ)); }
        else if (isLeadQ) { visibleQas = allQas.filter(qa => teamEmailsQ.includes(qa.email?.toLowerCase()) || qa.email?.toLowerCase() === myEmailQ); }
        else {
          const top3 = allQas.slice(0, 3);
          const myEntry = allQas.find(qa => qa.email?.toLowerCase() === myEmailQ);
          const myRankIdx = allQas.findIndex(qa => qa.email?.toLowerCase() === myEmailQ);
          visibleQas = [...top3];
          if (myEntry && myRankIdx >= 3) visibleQas.push({ ...myEntry, _myRank: myRankIdx + 1 });
          const seen = new Set();
          visibleQas = visibleQas.filter(qa => { const e = qa.email?.toLowerCase(); if (seen.has(e)) return false; seen.add(e); return true; });
        }

        // Apply search/email filter
        if (selQaQuarterly) {
          const isExactEmail = allQas.some(qa => qa.email?.toLowerCase() === selQaQuarterly.toLowerCase());
          if (isExactEmail) {
            visibleQas = visibleQas.filter(qa => qa.email?.toLowerCase() === selQaQuarterly.toLowerCase());
          } else {
            const q = selQaQuarterly.toLowerCase();
            visibleQas = visibleQas.filter(qa => {
              const name = qa.email?.split("@")[0]?.split(".").map(p=>p.replace(/[\d]+$/,"")).filter(Boolean).join(" ").toLowerCase() || "";
              return name.includes(q) || qa.email.toLowerCase().includes(q);
            });
          }
        }

        return <div>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <select className="select" value={activeQ} onChange={e=>{setSelQuarter(e.target.value);setSelQaQuarterly("");}}>
              {quarters.map(q => <option key={q.label} value={q.label}>{q.label} ({q.months.length} month{q.months.length!==1?"s":""})</option>)}
            </select>
            <div style={{position:"relative",minWidth:220,flex:1,maxWidth:320}}>
              <input className="form-input" value={selQaQuarterly} onChange={e=>setSelQaQuarterly(e.target.value)} placeholder={`Search specialists (${allQas.length})...`} autoComplete="off" style={{fontSize:13}}/>
              {selQaQuarterly && !allQas.find(qa=>qa.email===selQaQuarterly) && (()=>{
                const q=selQaQuarterly.toLowerCase();
                const matches=allQas.filter(qa=>{
                  const name=qa.email?.split("@")[0]?.split(".").map(p=>p.replace(/[\d]+$/,"")).filter(Boolean).join(" ").toLowerCase()||"";
                  return name.includes(q)||qa.email.toLowerCase().includes(q);
                }).slice(0,8);
                if(!matches.length)return null;
                return <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:"0 0 var(--radius) var(--radius)",boxShadow:"var(--shadow-lg)",maxHeight:220,overflowY:"auto"}}>
                  {matches.map(qa=><div key={qa.email} onClick={()=>setSelQaQuarterly(qa.email)} style={{padding:"8px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontWeight:500}}>{nameFromEmail(qa.email)}</span>
                    <span style={{fontSize:12,fontWeight:600}}>{qa.totalScore.toFixed(1)}%</span>
                  </div>)}
                </div>;
              })()}
              {selQaQuarterly && <button onClick={()=>setSelQaQuarterly("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:16,lineHeight:1}}>×</button>}
            </div>
            {qData && <span style={{fontSize:12,color:"var(--tx3)"}}>Months: {qMonths.join(", ")}</span>}
          </div>

          <div className="stats-grid" style={{marginBottom:20}}>
            <div className="stat-card"><div className="stat-label">Quarter</div><div className="stat-value">{activeQ}</div></div>
            <div className="stat-card"><div className="stat-label">QAs ranked</div><div className="stat-value">{allQas.length}</div></div>
            <div className="stat-card">
              <div className="stat-label">Avg score</div>
              <ProgressRing value={allQas.length?allQas.reduce((a,q)=>a+q.totalScore,0)/allQas.length:0} max={55*qMonths.length} size={48} stroke={4}
                color="var(--tabby-green)"
                label={allQas.length?(allQas.reduce((a,q)=>a+q.totalScore,0)/allQas.length).toFixed(1)+"%":"—"}
                sublabel={`of ${55*qMonths.length}%`}
              />
            </div>
            {allQas[0] && <div className="stat-card">
              <div className="stat-label">Top performer</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:4}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",color:"#92400E",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12}}>1</div>
                <div style={{fontWeight:700,fontSize:15,letterSpacing:"-.3px"}}>{nameFromEmail(allQas[0].email)}</div>
              </div>
            </div>}
          </div>

          {allQas.length >= 3 && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:20,marginBottom:32,flexWrap:"wrap"}}>
            {[1,0,2].map(idx => {
              const qa = allQas[idx]; const rank = idx + 1; const isGold = rank === 1;
              const podiumColors = {
                1: { bg: "linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02))", border: "rgba(245,158,11,.3)", medal: "#F59E0B" },
                2: { bg: "linear-gradient(135deg, rgba(156,163,175,.08), rgba(156,163,175,.02))", border: "rgba(156,163,175,.2)", medal: "#9CA3AF" },
                3: { bg: "linear-gradient(135deg, rgba(234,88,12,.06), rgba(234,88,12,.02))", border: "rgba(234,88,12,.2)", medal: "#EA580C" },
              }[rank];
              return (<div key={qa.email} style={{
                textAlign:"center",padding:isGold?"28px 32px":"22px 26px",minWidth:isGold?200:170,
                background:podiumColors.bg,border:`1px solid ${podiumColors.border}`,borderRadius:16,
                transform:isGold?"translateY(-12px)":"none",transition:"all .3s cubic-bezier(.4,0,.2,1)",
              }}
                onMouseEnter={e => e.currentTarget.style.transform = isGold ? "translateY(-16px) scale(1.02)" : "translateY(-4px) scale(1.02)"}
                onMouseLeave={e => e.currentTarget.style.transform = isGold ? "translateY(-12px)" : "none"}
              >
                <div style={{width:isGold?36:28,height:isGold?36:28,borderRadius:"50%",background:podiumColors.medal,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:isGold?16:13,margin:"0 auto 12px",boxShadow:`0 4px 12px ${podiumColors.medal}40`}}>{rank}</div>
                <div style={{width:isGold?52:40,height:isGold?52:40,borderRadius:"50%",background:"var(--primary-light)",color:"var(--tabby-green,var(--accent-text))",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:isGold?16:13,margin:"0 auto 10px",border:"2px solid var(--bd2)"}}>{initialsFromEmail(qa.email)}</div>
                <div style={{fontWeight:700,fontSize:isGold?16:14,letterSpacing:"-.3px"}}>{nameFromEmail(qa.email)}</div>
                <div style={{fontSize:11,color:"var(--tx3)",marginBottom:10}}>{activeQ}</div>
                <div style={{fontSize:isGold?28:22,fontWeight:800,letterSpacing:"-1px",fontVariantNumeric:"tabular-nums",color:"var(--accent-text)"}}>{qa.totalScore.toFixed(1)}%<span style={{fontSize:12,fontWeight:500,color:"var(--tx3)"}}> / {55*qMonths.length}%</span></div>
              </div>);
            })}
          </div>}

          {isQaQ && <div style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8,marginBottom:12,fontSize:12,color:"var(--tx3)"}}>
            Showing top 3 performers and your position. Full rankings are visible to team leads.
          </div>}

          <div className="card">
            <div className="card-header"><span className="card-title">Quarterly rankings — {activeQ}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{visibleQas.length} specialists</span></div>
            {visibleQas.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {activeQ}.</p></div> :
            <div className="table-wrap"><table><thead><tr>
              <th style={{width:50}}>#</th>
              <th>Specialist</th>
              {qMonths.map(m => <th key={m} style={{textAlign:"center",minWidth:80}}>{m}</th>)}
              <th style={{textAlign:"center",minWidth:80}}>Total<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{55*qMonths.length}%</span></th>
            </tr></thead><tbody>
              {visibleQas.map((qa, i) => {
                const actualRank = qa._myRank || (allQas.findIndex(q => q.email === qa.email) + 1);
                const isMe = qa.email?.toLowerCase() === myEmailQ;
                const showGap = isQaQ && qa._myRank && qa._myRank > 4;
                return (<React.Fragment key={qa.email}>
                  {showGap && <tr><td colSpan={3 + qMonths.length} style={{textAlign:"center",padding:"6px",color:"var(--tx3)",fontSize:12,background:"var(--bg)"}}>···</td></tr>}
                  <tr style={{background:isMe?"var(--accent-light)":"transparent"}}>
                    <td>{actualRank <= 3 ? <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:"50%",fontWeight:600,fontSize:12,background:actualRank===1?"#FEF3C7":actualRank===2?"#F3F4F6":"#FED7AA",color:actualRank===1?"#92400E":actualRank===2?"#374151":"#9A3412"}}>{actualRank}</span> : <span style={{color:"var(--tx3)",fontWeight:500}}>{actualRank}</span>}</td>
                    <td><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600}}>{initialsFromEmail(qa.email)}</div><div><div style={{fontWeight:500,fontSize:14}}>{nameFromEmail(qa.email)}{isMe?" (You)":""}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{qa.email}</div></div></div></td>
                    {qMonths.map(m => {
                      const row = data.find(r => r.month === m && r.qa_email?.toLowerCase() === qa.email?.toLowerCase());
                      const monthScore = row ? getTotalScore(row) : null;
                      return <td key={m} style={{textAlign:"center",padding:"8px 6px"}}>
                        <div style={{fontSize:13,fontWeight:600,color:monthScore===null?"var(--tx3)":monthScore>=55*0.7?"var(--green)":monthScore>=55*0.4?"var(--amber)":"var(--red)"}}>{monthScore !== null ? monthScore.toFixed(1)+"%" : "—"}</div>
                      </td>;
                    })}
                    <td style={{textAlign:"center"}}><span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:700,background:"var(--accent-light)",color:"var(--accent-text)"}}>{qa.totalScore.toFixed(1)}%</span></td>
                  </tr>
                </React.Fragment>);
              })}
            </tbody></table></div>}
          </div>

        </div>;
      })()}

      </>}
      {el}
    </div>
  );
}

/* ═══ COACHING MODULE ═══ */
function CoachingPage({token, profile}) {
  const [tab, setTab] = useState("compose"); // compose | history
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [activePlans, setActivePlans] = useState([]);
  const [planWeeks, setPlanWeeks] = useState([]);
  const {show, el} = useToast();

  // Form state
  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [meetingType, setMeetingType] = useState("1:1 Meeting");
  const [topics, setTopics] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [goals, setGoals] = useState("");
  const [actions, setActions] = useState("");
  const [perfRating, setPerfRating] = useState("");
  const [sigName, setSigName] = useState(profile?.display_name || "");
  const [sigTitle, setSigTitle] = useState("QA Lead");

  // Target table state (for AP/PIP reviews)
  const [targetRows, setTargetRows] = useState([{metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);

  // Conclusion state
  const [outcome, setOutcome] = useState("");
  const [nextSteps, setNextSteps] = useState("");

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);

  const MEETING_TYPES = ["1:1 Meeting","MPR","Coaching Session","Weekly Check-in","Action Plan Review","PIP Review"];
  const MEETING_TYPE_ENUM = {"1:1 Meeting":"weekly_1on1","MPR":"performance_review","Coaching Session":"ad_hoc","Weekly Check-in":"weekly_1on1","Action Plan Review":"ap_checkin","PIP Review":"pip_checkin"};
  const ENUM_TO_LABEL = {"weekly_1on1":"1:1 Meeting","performance_review":"MPR","ad_hoc":"Coaching Session","ap_checkin":"Action Plan Review","pip_checkin":"PIP Review","return_from_leave":"Return from Leave"};
  const TARGET_TYPES = ["Action Plan Review","PIP Review"];
  const isTargetType = TARGET_TYPES.includes(meetingType);

  const PERF_OPTIONS = [
    {val:"Needs Attention",emoji:"⚠️",bg:"var(--red-bg)",color:"var(--red)"},
    {val:"Below Expectations",emoji:"📉",bg:"var(--amber-bg)",color:"var(--amber)"},
    {val:"Meets Expectations",emoji:"✅",bg:"var(--green-bg)",color:"var(--green)"},
    {val:"Exceeds Expectations",emoji:"⭐",bg:"var(--accent-light)",color:"var(--accent-text)"},
    {val:"Outstanding",emoji:"🏆",bg:"var(--accent-light)",color:"var(--accent-text)"},
  ];

  const PERF_MESSAGES = {
    "Outstanding":"Your dedication and quality of work have set a commendable standard for the team. This level of performance is highly valued and acknowledged.",
    "Exceeds Expectations":"You have consistently gone beyond the required scope of your responsibilities, demonstrating strong professional commitment.",
    "Meets Expectations":"You are fulfilling your responsibilities in a satisfactory manner and are encouraged to continue building on this foundation.",
    "Below Expectations":"There are areas that require immediate attention and improvement. I am confident in your ability to address these with focus and commitment.",
    "Needs Attention":"I would like us to work closely together to identify the root causes and establish a clear action plan."
  };

  const INTRO_MAP = {
    "1:1 Meeting":"This is a formal summary of our weekly 1:1 meeting.",
    "MPR":"This is a formal summary of your MPR session.",
    "Coaching Session":"This is a formal summary of your Coaching Session.",
    "Weekly Check-in":"This is a formal summary of our Weekly Check-in.",
    "Action Plan Review":"This is a formal summary of your Action Plan Review. Please review your weekly targets and progress carefully.",
    "PIP Review":"This is a formal summary of your Performance Improvement Plan (PIP) Review. Please review your weekly targets and progress carefully."
  };

  const TEMPLATES = {
    "1:1 Meeting":{topics:"Weekly performance update\nTeam challenges and support needed\nCareer development discussion",strengths:"Consistent quality of work\nStrong communication with team members",weaknesses:"Time management on complex cases\nEscalation handling",goals:"Improve first response resolution rate\nComplete pending training module",actions:"Share weekly self-assessment by Thursday\nSchedule shadowing session with senior agent"},
    "Coaching Session":{topics:"Calibration score review\nSpecific case analysis\nScoring accuracy discussion",strengths:"Improvement noted in handling complex cases\nGood alignment with quality standards",weaknesses:"Soft skills in resolution communication\nAttribute scoring consistency",goals:"Reach calibration alignment score above 85%\nReduce scoring deviation",actions:"Review 5 calibration cases before next session\nComplete RTR self-practice twice this week"},
    "Weekly Check-in":{topics:"Weekly scorecard review\nCurrent challenges and blockers\nPriorities for the coming week",strengths:"Maintained consistent quality scores\nProactive communication",weaknesses:"Areas needing attention this week",goals:"Hit weekly targets across all KPIs",actions:"Focus on identified weak areas\nFlag any support needs by Wednesday"},
    "Action Plan Review":{topics:"Weekly target progress review\nCalibration score performance\nRTR session completion\nQuality consistency",strengths:"Commitment to improvement plan\nAttendance and engagement in sessions",weaknesses:"Areas where targets were not fully met\nSpecific attribute scoring gaps",goals:"Achieve agreed weekly targets\nImprove calibration alignment score",actions:"Complete weekly RTR sessions as agreed\nAttend all calibration sessions\nSubmit weekly self-review"},
    "PIP Review":{topics:"PIP target progress review\nDetailed performance metrics discussion\nSupport and resources assessment",strengths:"Positive steps taken during PIP period\nEngagement with coaching sessions",weaknesses:"Areas where PIP targets were not met\nRoot causes identified",goals:"Meet all PIP performance targets\nDemonstrate sustained improvement",actions:"Complete all agreed PIP actions\nMeet with HR for formal review\nSubmit weekly progress log"},
    "MPR":{topics:"Overall performance review for the period\nKey achievements and highlights\nAreas requiring development",strengths:"Demonstrated ownership of quality metrics\nPositive attitude and team collaboration",weaknesses:"Consistency across all ticket categories\nDocumentation quality",goals:"Achieve target KPI scores for next quarter\nComplete mandatory compliance training",actions:"Submit self-appraisal form by end of week\nAgree on development plan for next period"},
  };

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const firstNameFromEmail = (email) => {
    if (!email) return "Team Member";
    const f = email.split("@")[0].split(/[.\-_]/)[0];
    return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
  };

  const fmtDate = (s) => {
    if (!s) return "";
    try { return new Date(s+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"}); }
    catch { return s; }
  };

  // Load roster + history
  useEffect(() => {
    (async () => {
      try {
        const [r, s, ap, apw] = await Promise.all([
          sb.query("qa_roster", {select:"email,display_name,manager_email,queue",token}).catch(()=>[]),
          sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch(()=>[]),
          sb.query("action_plans", {select:"*",filters:"status=eq.active",token}).catch(()=>[]),
          sb.query("action_plan_weeks", {select:"*",filters:"order=plan_id.asc,week_number.asc",token}).catch(()=>[]),
        ]);
        const svDomainC=profile?.operational_domain||profile?.domain||"tabby.ai";
        const isAdminC=hasRole(profile?.role,"admin");
        const isSvC=hasRole(profile?.role,"qa_supervisor")&&!isAdminC;
        let filteredRoster=isSvC?r.filter(x=>x.email?.endsWith("@"+svDomainC)):r;
        let filteredSessions=isSvC?s.filter(x=>x.member_email?.endsWith("@"+svDomainC)):s;
        let filteredPlans=isSvC?ap.filter(x=>x.qa_email?.endsWith("@"+svDomainC)):ap;
        // Apply global filters
        if(gf?.domain){filteredRoster=filteredRoster.filter(x=>x.email?.endsWith("@"+gf.domain));filteredSessions=filteredSessions.filter(x=>x.member_email?.endsWith("@"+gf.domain));filteredPlans=filteredPlans.filter(x=>x.qa_email?.endsWith("@"+gf.domain));}
        if(gf?.people?.length>0){filteredRoster=filteredRoster.filter(x=>gf.people.includes(x.email?.toLowerCase()));filteredSessions=filteredSessions.filter(x=>gf.people.includes(x.member_email?.toLowerCase()));filteredPlans=filteredPlans.filter(x=>gf.people.includes(x.qa_email?.toLowerCase()));}
        if(gf?.teams?.length>0){const rm=window.__gfRoster||{};filteredRoster=filteredRoster.filter(x=>{const q=rm[x.email?.toLowerCase()];return q&&gf.teams.includes(q);});}
        setRoster(filteredRoster);
        setSessions(filteredSessions);
        setActivePlans(filteredPlans);
        setPlanWeeks(apw);
      } catch (e) { console.error("Coaching load:", e); }
    })();
  }, [token]);

  // Listen for prefill from AP/PIP page
  const pendingPrefillRef = useRef(null);
  const pendingPrefillTypeRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.email) {
        setToEmail(e.detail.email);
        setTab("compose");
        if (e.detail.type) setMeetingType(e.detail.type);
        pendingPrefillRef.current = e.detail.email;
        pendingPrefillTypeRef.current = e.detail.type;
      }
    };
    window.addEventListener("prefill-coaching", handler);
    return () => window.removeEventListener("prefill-coaching", handler);
  }, []);

  // When toEmail changes OR activePlans loads, check if we need to fill targets
  useEffect(() => {
    if (!pendingPrefillRef.current) return;
    const email = pendingPrefillRef.current;
    const requestedType = pendingPrefillTypeRef.current;
    // Match by plan type: "PIP Review" → pip, "Action Plan Review" → ap
    const wantType = requestedType === "PIP Review" ? "pip" : "ap";
    const plan = activePlans.find(p => p.qa_email?.toLowerCase() === email.toLowerCase() && p.type === wantType)
      || activePlans.find(p => p.qa_email?.toLowerCase() === email.toLowerCase());
    if (!plan) {
      if (activePlans.length === 0) {
        sb.query("action_plans", {select:"*", filters:`qa_email=eq.${email}&status=eq.active&type=eq.${wantType}`, token}).then(directPlans => {
          if (directPlans.length > 0) fillTargetsFromPlan(directPlans[0]);
        }).catch(() => {});
      }
      return;
    }
    fillTargetsFromPlan(plan);
  }, [toEmail, activePlans.length]);

  // Fill target rows from a plan object
  const fillTargetsFromPlan = (plan) => {
    if (!plan?.targets) return;
    pendingPrefillRef.current = null;
    try {
      const parsed = JSON.parse(plan.targets);
      const isMonthly = parsed.follow_up_mode === "monthly";
      const metrics = Array.isArray(parsed) ? parsed : (parsed.metrics || []);
      if (metrics.length === 0) return;
      const rows = metrics.map(t => {
        const wt = t.weekly_targets || [];
        return {
          metric: t.label || t.kpi_key || "",
          start: t.current_value != null ? String(Math.round(t.current_value)) : "",
          w1: wt[0] != null ? String(wt[0]) : (t.target_value ? String(t.target_value) : ""),
          w2: wt[1] != null ? String(wt[1]) : "",
          w3: wt[2] != null ? String(wt[2]) : "",
          w4: wt[3] != null ? String(wt[3]) : "",
          a1: "", a2: "", a3: "", a4: "", _kpi_key: t.kpi_key,
          _monthly: isMonthly,
        };
      });
      if (rows[0]?.metric) {
        setTargetRows(rows);
        if (plan.type === "pip") setMeetingType("PIP Review");
        else if (plan.type === "ap") setMeetingType("Action Plan Review");
        show("success", `Targets loaded from ${plan.type.toUpperCase()} plan`);
      }
    } catch(e) { console.error("Fill targets:", e); }
  };

  // Get previous sessions for selected member
  const memberHistory = sessions.filter(s => s.member_email?.toLowerCase() === toEmail.toLowerCase()).slice(0, 5);

  // ── AP/PIP Integration: detect active plans for selected member ──
  const memberPlans = activePlans.filter(p => p.qa_email?.toLowerCase() === toEmail.toLowerCase());
  const memberActivePlan = memberPlans.find(p => meetingType === "PIP Review" ? p.type === "pip" : p.type === "ap") || memberPlans[0];
  const memberPlanWeeks = memberActivePlan ? planWeeks.filter(w => w.plan_id === memberActivePlan.id).sort((a, b) => a.week_number - b.week_number) : [];
  const nextUnfilledWeek = memberPlanWeeks.find(w => !w.actual_data);

  // Manual button handler for auto-fill
  const autoFillFromPlan = () => {
    if (memberActivePlan) fillTargetsFromPlan(memberActivePlan);
  };

  // Apply template
  const applyTemplate = (forceType) => {
    const t = TEMPLATES[forceType || meetingType];
    if (!t) return;
    setTopics(t.topics || "");
    setStrengths(t.strengths || "");
    setWeaknesses(t.weaknesses || "");
    setGoals(t.goals || "");
    setActions(t.actions || "");
    if (!forceType) show("success", "Template applied");
  };

  // Auto-apply template when meeting type changes and fields are empty
  useEffect(() => {
    if (!topics && !strengths && !weaknesses && !goals && !actions) {
      const t = TEMPLATES[meetingType];
      if (t) {
        setTopics(t.topics || "");
        setStrengths(t.strengths || "");
        setWeaknesses(t.weaknesses || "");
        setGoals(t.goals || "");
        setActions(t.actions || "");
      }
    }
  }, [meetingType]);

  // Target row helpers
  const addTargetRow = () => setTargetRows([...targetRows, {metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
  const removeTargetRow = (i) => setTargetRows(targetRows.filter((_,idx) => idx !== i));
  const updateTarget = (i, key, val) => {
    const rows = [...targetRows];
    rows[i] = {...rows[i], [key]: val};
    setTargetRows(rows);
  };

  const calcEom = (vals) => {
    const nums = vals.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    return nums.length ? Math.round(nums.reduce((a,b) => a+b, 0) / nums.length) : null;
  };

  const calcDiff = (target, actual) => {
    const t = parseFloat(target), a = parseFloat(actual);
    if (isNaN(t) || isNaN(a) || !actual) return null;
    return Math.round((a - t) * 10) / 10;
  };

  // Serialize target rows
  const serializeTargets = () => targetRows.filter(r => r.metric.trim()).map(r => [r.metric,r.start,r.w1,r.w2,r.w3,r.w4,r.a1,r.a2,r.a3,r.a4].join("|")).join(";;");

  // Build email HTML
  const buildEmailBody = () => {
    const fn = firstNameFromEmail(toEmail);
    const isConclusion = isTargetType && outcome;
    const planName = meetingType === "PIP Review" ? "Performance Improvement Plan" : "Action Plan";
    let html = "";

    // Greeting
    html += `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;max-width:680px;">`;
    html += `<p style="margin:0 0 16px;"><span style="background:#E8F5E8;color:#1A3D2B;padding:5px 16px;border-radius:20px;font-weight:700;font-size:12px;letter-spacing:.03em;">${meetingType}</span></p>`;
    html += `<p style="margin:0 0 16px;">Dear ${fn},</p>`;

    // Conclusion or intro
    if (isConclusion && outcome === "pass") {
      html += `<p style="margin:0 0 20px;">I am pleased to formally confirm that you have successfully completed your ${planName}. Your commitment, consistency, and improvement throughout this period have been genuinely noted and are greatly appreciated. This concludes the formal ${planName} process, and your performance will continue to be monitored through our regular 1:1 sessions.</p>`;
    } else if (isConclusion && outcome === "fail") {
      html += `<p style="margin:0 0 12px;">Following a full review of your ${planName}, I regret to formally notify you that the required performance targets were not met within the agreed timeframe. This outcome has been documented and will be shared with the relevant stakeholders, including Human Resources.</p>`;
      if (nextSteps) html += `<p style="margin:0 0 6px;font-weight:700;">Agreed Next Steps:</p><p style="margin:0 0 20px;">${nextSteps.replace(/\n/g,"<br>")}</p>`;
    } else {
      html += `<p style="margin:0 0 20px;">${INTRO_MAP[meetingType] || "This is a formal summary of our session."}</p>`;
    }

    const mkList = (text) => {
      if (!text?.trim()) return "";
      return `<ul style="margin:8px 0;padding-left:22px;">${text.split("\n").filter(l=>l.trim()).map(l => `<li style="margin-bottom:6px;">${l.replace(/^[-•]\s*/,"").trim()}</li>`).join("")}</ul>`;
    };
    const mkSection = (title, body) => `<div style="margin-top:24px;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1A3D2B;border-bottom:1px solid #E8F5E8;padding-bottom:4px;">${title}</p>${body}</div>`;

    if (topics?.trim()) html += mkSection("Topics Discussed", mkList(topics));

    if (perfRating) {
      const pillStyles = {"Outstanding":"background:#C5F5C5;color:#1A3D2B;","Exceeds Expectations":"background:#A0E8A0;color:#1A3D2B;","Meets Expectations":"background:#E8F5E8;color:#2A5A2A;","Below Expectations":"background:#FEF9F0;color:#854F0B;","Needs Attention":"background:#FCEBEB;color:#A32D2D;"};
      html += mkSection("Overall Performance Rating", `<p style="margin:8px 0 6px;"><span style="${pillStyles[perfRating]||""}padding:4px 16px;border-radius:20px;font-weight:700;font-size:13px;">${perfRating}</span></p><p style="margin:0 0 4px;">${PERF_MESSAGES[perfRating]||""}</p>`);
    }

    if (strengths?.trim()) html += mkSection("Strengths & Recognized Contributions", mkList(strengths));
    if (weaknesses?.trim()) html += mkSection("Areas for Development", mkList(weaknesses));
    if (goals?.trim()) html += mkSection("Goals & Progress Update", mkList(goals));
    if (actions?.trim()) html += mkSection("Action Items & Agreed Next Steps", mkList(actions));

    // Target table
    if (isTargetType && targetRows.some(r => r.metric.trim())) {
      const s = "padding:9px 11px;font-size:13px;text-align:center;border:1px solid #C8E8C8;";
      html += `<div style="margin-top:24px;"><p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#1A3D2B;">Weekly QA Review — Score Tracking</p>`;
      html += `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">`;
      html += `<tr>${["Metric","Row","Start","W1","W2","W3","W4","EOM"].map((c,i) => `<th style="${s}font-weight:700;color:#C5F5C5;background:#1A3D2B;${i<=1?"text-align:left;":""}">${c}</th>`).join("")}</tr>`;

      targetRows.filter(r => r.metric.trim()).forEach((r, ri) => {
        const bg = ri % 2 === 0 ? "#fff" : "#F0FCF0";
        const tEom = calcEom([r.w1,r.w2,r.w3,r.w4]);
        const aEom = calcEom([r.a1,r.a2,r.a3,r.a4]);
        // Target row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:700;" rowspan="3">${r.metric}</td>`;
        html += `<td style="${s}text-align:left;font-weight:600;background:#E8F5E8;color:#1A3D2B;font-size:10px;">Target</td>`;
        html += `<td style="${s}">${r.start ? r.start+"%" : "--"}</td>`;
        ["w1","w2","w3","w4"].forEach(k => { html += `<td style="${s}">${r[k] ? r[k]+"%" : "--"}</td>`; });
        html += `<td style="${s}background:#C5F5C5;color:#1A3D2B;font-weight:700;">${tEom !== null ? tEom+"%" : "--"}</td></tr>`;
        // Actual row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:600;background:#FEF9F0;color:#854F0B;font-size:10px;">Actual</td>`;
        html += `<td style="${s}color:#aaa;">--</td>`;
        ["a1","a2","a3","a4"].forEach(k => { html += `<td style="${s}">${r[k] ? r[k]+"%" : "--"}</td>`; });
        const eAbg = aEom !== null && tEom !== null ? (aEom >= tEom ? "#E0F8E0" : "#FCEBEB") : "#FEF9F0";
        const eAc = aEom !== null && tEom !== null ? (aEom >= tEom ? "#1A6B2A" : "#A32D2D") : "#854F0B";
        html += `<td style="${s}background:${eAbg};color:${eAc};font-weight:700;">${aEom !== null ? aEom+"%" : "--"}</td></tr>`;
        // Diff row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:600;background:#F5F5F5;color:#555;font-size:10px;">Difference</td>`;
        html += `<td style="${s}color:#aaa;">--</td>`;
        ["w1","w2","w3","w4"].forEach((wk,i) => {
          const d = calcDiff(r[wk], r["a"+(i+1)]);
          if (d !== null) {
            const dc = d > 0 ? "#1A6B2A" : d < 0 ? "#A32D2D" : "#555";
            const dbg = d > 0 ? "#E0F8E0" : d < 0 ? "#FCEBEB" : "#F5F5F5";
            html += `<td style="${s}background:${dbg};color:${dc};font-weight:700;">${d > 0 ? "+" : ""}${d}%</td>`;
          } else html += `<td style="${s}color:#ccc;">--</td>`;
        });
        // EOM diff
        if (aEom !== null && tEom !== null) {
          const ed = Math.round((aEom - tEom) * 10) / 10;
          const ec = ed > 0 ? "#1A6B2A" : ed < 0 ? "#A32D2D" : "#555";
          const eb = ed > 0 ? "#E0F8E0" : ed < 0 ? "#FCEBEB" : "#F5F5F5";
          html += `<td style="${s}background:${eb};color:${ec};font-weight:700;">${ed > 0 ? "+" : ""}${ed}%</td></tr>`;
        } else html += `<td style="${s}color:#ccc;">--</td></tr>`;
      });
      html += `</table></div>`;
    }

    // Closing
    html += `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #E8F5E8;">`;
    html += `<p style="margin:0 0 10px;">Should you have any questions, please do not hesitate to reach out.</p>`;
    html += `<p style="margin:0 0 16px;">I appreciate your continued commitment and professionalism.</p>`;
    html += `<p style="margin:0;">Best regards,<br><strong>${sigName || "QA Leader"}</strong><br>${sigTitle || "QA Lead"} | Tabby</p>`;
    html += `</div></div>`;
    return html;
  };

  const emailSubject = `Session Summary: ${meetingType} - ${fmtDate(sessionDate)}`;

  // Build plain text version for Gmail compose URL
  const buildPlainText = () => {
    const fn = firstNameFromEmail(toEmail);
    const isConclusion = isTargetType && outcome;
    const planName = meetingType === "PIP Review" ? "Performance Improvement Plan" : "Action Plan";
    const bullet = (text) => text ? text.split("\n").filter(l=>l.trim()).map(l => " - " + l.replace(/^[-•]\s*/,"").trim()).join("\n") : "";
    let lines = [];

    lines.push(`[${meetingType}]`);
    lines.push("");
    lines.push(`Dear ${fn},`);
    lines.push("");

    if (isConclusion && outcome === "pass") {
      lines.push(`I am pleased to formally confirm that you have successfully completed your ${planName}. Your commitment, consistency, and improvement throughout this period have been genuinely noted and are greatly appreciated. This concludes the formal ${planName} process.`);
    } else if (isConclusion && outcome === "fail") {
      lines.push(`Following a full review of your ${planName}, I regret to formally notify you that the required performance targets were not met within the agreed timeframe. This outcome has been documented and will be shared with the relevant stakeholders, including Human Resources.`);
      if (nextSteps) { lines.push(""); lines.push("Agreed Next Steps:"); lines.push(nextSteps); }
    } else {
      lines.push(INTRO_MAP[meetingType] || "This is a formal summary of our session.");
    }
    lines.push("");

    if (topics?.trim()) { lines.push("TOPICS DISCUSSED"); lines.push(bullet(topics)); lines.push(""); }
    if (perfRating) { lines.push("OVERALL PERFORMANCE RATING"); lines.push(` - ${perfRating}`); lines.push(` ${PERF_MESSAGES[perfRating]||""}`); lines.push(""); }
    if (strengths?.trim()) { lines.push("STRENGTHS & RECOGNIZED CONTRIBUTIONS"); lines.push(bullet(strengths)); lines.push(""); }
    if (weaknesses?.trim()) { lines.push("AREAS FOR DEVELOPMENT"); lines.push(bullet(weaknesses)); lines.push(""); }
    if (goals?.trim()) { lines.push("GOALS & PROGRESS UPDATE"); lines.push(bullet(goals)); lines.push(""); }
    if (actions?.trim()) { lines.push("ACTION ITEMS & AGREED NEXT STEPS"); lines.push(bullet(actions)); lines.push(""); }

    if (isTargetType && targetRows.some(r => r.metric.trim())) {
      lines.push("WEEKLY QA REVIEW — SCORE TRACKING");
      lines.push("");
      targetRows.filter(r => r.metric.trim()).forEach(r => {
        lines.push(`  ${r.metric}`);
        lines.push(`  Target: Start=${r.start||"--"}% W1=${r.w1||"--"}% W2=${r.w2||"--"}% W3=${r.w3||"--"}% W4=${r.w4||"--"}%`);
        lines.push(`  Actual: W1=${r.a1||"--"} W2=${r.a2||"--"} W3=${r.a3||"--"} W4=${r.a4||"--"}`);
        lines.push("");
      });
    }

    lines.push("---");
    lines.push("Should you have any questions, please do not hesitate to reach out.");
    lines.push("I appreciate your continued commitment and professionalism.");
    lines.push("");
    lines.push("Best regards,");
    lines.push(`${sigName || "QA Leader"}`);
    lines.push(`${sigTitle || "QA Lead"} | Tabby`);

    return lines.join("\n");
  };

  // Save session and send via Apps Script
  const APPS_SCRIPT_URL = "https://script.google.com/a/macros/tabby.sa/s/AKfycbzNeENkxlHmRjgik3psWDjcDvZt3ZcdGM-yPEHAanQUvIfbqwKLASRexHzyG3wQirlA/exec";

  const generateAndSend = async () => {
    if (!toEmail) { show("error", "Enter the team member's email"); return; }
    setLoading(true);
    try {
      // Save to Supabase
      await sb.query("coaching_sessions", {
        token, method: "POST",
        body: {
          sender_email: profile?.email || "",
          member_email: toEmail,
          cc_email: ccEmail,
          session_date: sessionDate,
          meeting_type: MEETING_TYPE_ENUM[meetingType] || "ad_hoc",
          topics, strengths, weaknesses, goals,
          action_items: actions,
          performance_rating: perfRating,
          target_data: isTargetType ? serializeTargets() : null,
          follow_up: false,
          outcome: outcome || null,
          next_steps: nextSteps || null,
          sig_name: sigName,
          sig_title: sigTitle,
          email_subject: emailSubject,
        }
      });

      // Send formatted HTML email via Apps Script
      const params = new URLSearchParams({
        action: "sendAndLog",
        to: toEmail,
        cc: ccEmail,
        replyTo: profile?.email || "",
        subject: emailSubject,
        senderEmail: profile?.email || "",
        memberEmail: toEmail,
        sessionDate: sessionDate,
        meetingType: meetingType,
        topics: topics,
        strengths: strengths,
        weaknesses: weaknesses,
        goals: goals,
        actions: actions,
        performance: perfRating,
        sigName: sigName,
        sigTitle: sigTitle,
        targetRows: isTargetType ? serializeTargets() : "",
        followUp: "false",
        threadId: "",
        conclude: outcome ? "true" : "false",
        outcome: outcome || "",
        nextSteps: nextSteps || "",
      });

      const scriptResp = await fetch(APPS_SCRIPT_URL + "?" + params.toString());
      const scriptData = await scriptResp.json();

      if (scriptData.status !== "success") {
        throw new Error(scriptData.message || "Apps Script error");
      }

      // Refresh history
      const s = await sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch(()=>[]);
      setSessions(s);

      // ── AP/PIP Write-back: update action_plan_weeks with actuals from this coaching session ──
      if (isTargetType && memberActivePlan && nextUnfilledWeek) {
        try {
          // Parse actuals from target rows (a1-a4 columns)
          const KPI_RAW_KEYS = { "Occupancy": "occupancy", "Coaching On-Time": "coaching", "Calibration": "calibration", "Coaching Observation": "observation", "RTR Score": "rtr" };
          const actualData = {};
          targetRows.forEach(r => {
            const kpiKey = r._kpi_key || KPI_RAW_KEYS[r.metric];
            if (kpiKey) {
              // Use the latest filled actual value (a4 > a3 > a2 > a1)
              const val = [r.a4, r.a3, r.a2, r.a1].find(v => v !== "" && v !== undefined);
              if (val !== undefined && val !== "") actualData[kpiKey] = parseFloat(val);
            }
          });

          if (Object.keys(actualData).length > 0) {
            // Check if targets met
            const weekTargetData = (() => { try { return JSON.parse(nextUnfilledWeek.target_data || "{}"); } catch { return {}; } })();
            const metTargets = Object.keys(weekTargetData).every(key => {
              const actual = actualData[key];
              const target = weekTargetData[key];
              return actual !== null && actual !== undefined && target !== undefined && actual >= target;
            });

            // Get the coaching session ID we just created
            const latestSession = s.find(sess => sess.member_email?.toLowerCase() === toEmail.toLowerCase() && sess.session_date === sessionDate);

            await sb.query("action_plan_weeks", {
              token, method: "PATCH",
              body: {
                actual_data: JSON.stringify(actualData),
                met_targets: metTargets,
                coaching_session_id: latestSession?.id || null,
                updated_at: new Date().toISOString(),
              },
              filters: `id=eq.${nextUnfilledWeek.id}`,
            });
            show("success", `Email sent & Week ${nextUnfilledWeek.week_number} actuals written to ${memberActivePlan.type.toUpperCase()} plan${metTargets ? " ✅ Targets met!" : " ❌ Targets not met"}`);
          } else {
            show("success", "Email sent and session logged successfully!");
          }
        } catch (e) {
          console.error("AP/PIP write-back:", e);
          show("success", "Email sent! (Note: could not write back to AP/PIP plan)");
        }
      } else {
        show("success", "Email sent and session logged successfully!");
      }
      logActivity(token, profile?.email, "coaching_session_created", "coaching_sessions", null, `Member: ${memberEmail}, Type: ${sessionType}`);
      setShowPreview(false);
    } catch (e) {
      show("error", e.message);
    }
    setLoading(false);
  };

  // Clear form
  const clearForm = () => {
    setToEmail("");setCcEmail("");setSessionDate(new Date().toISOString().split("T")[0]);
    setMeetingType("1:1 Meeting");setTopics("");setStrengths("");setWeaknesses("");
    setGoals("");setActions("");setPerfRating("");setOutcome("");setNextSteps("");
    setTargetRows([{metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
    setShowPreview(false);
  };

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Coaching sessions</div>
          <div className="page-subtitle">1:1 coaching email generator and session tracking</div>
        </div>
        {sessions.length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--primary-light)",color:"var(--primary-text,var(--tabby-purple))",fontSize:12,fontWeight:600}}>{sessions.length} sessions logged</span>}
      </div>

      <div className="tab-bar" style={{marginBottom:16}}>
        <button className={`tab-btn ${tab==="compose"?"active":""}`} onClick={()=>setTab("compose")}><Icon d={icons.coaching} size={16}/>Compose</button>
        <button className={`tab-btn ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}><Icon d={icons.scores} size={16}/>History ({sessions.length})</button>
      </div>

      {/* ═══ COMPOSE TAB ═══ */}
      {tab==="compose" && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* LEFT — Form */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Signature block */}
          <div className="card">
            <div className="card-header"><span className="card-title">Your signature</span></div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Full name</label><input className="form-input" value={sigName} onChange={e=>setSigName(e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={sigTitle} onChange={e=>setSigTitle(e.target.value)}/></div>
            </div>
          </div>

          {/* Session details */}
          <div className="card">
            <div className="card-header"><span className="card-title">Session details</span></div>
            <div className="form-grid">
              <div className="form-group" style={{position:"relative"}}><label className="form-label">Team member email (To)</label>
                <input className="form-input" value={toEmail} onChange={e=>{setToEmail(e.target.value);}} placeholder="Type name or email..." autoComplete="off"/>
                {toEmail && !roster.find(r=>r.email===toEmail) && (() => {
                  const q = toEmail.toLowerCase();
                  const matches = roster.filter(r => (r.email||"").toLowerCase().includes(q) || (r.display_name||"").toLowerCase().includes(q)).slice(0, 8);
                  if (!matches.length) return null;
                  return <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:"0 0 var(--radius) var(--radius)",boxShadow:"var(--shadow-lg)",maxHeight:200,overflowY:"auto"}}>
                    {matches.map(r => <div key={r.email} onClick={()=>{setToEmail(r.email);const mgr=r.manager_email;if(mgr)setCcEmail(mgr);}} style={{padding:"8px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontWeight:500}}>{r.display_name || nameFromEmail(r.email)}</span>
                      <span style={{color:"var(--tx3)",fontSize:12}}>{r.email}</span>
                    </div>)}
                  </div>;
                })()}
              </div>
              <div className="form-group"><label className="form-label">Manager email (CC)</label>
                {toEmail && roster.find(r=>r.email===toEmail)?.manager_email ? (
                  <input className="form-input" value={ccEmail || roster.find(r=>r.email===toEmail)?.manager_email || ""} onChange={e=>setCcEmail(e.target.value)} onFocus={()=>{if(!ccEmail){const m=roster.find(r=>r.email===toEmail)?.manager_email;if(m)setCcEmail(m);}}}/>
                ) : <input className="form-input" value={ccEmail} onChange={e=>setCcEmail(e.target.value)} placeholder="manager@tabby.ai"/>}
              </div>
              <div className="form-group"><label className="form-label">Session date</label><input type="date" className="form-input" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Meeting type</label>
                <select className="select form-input" value={meetingType} onChange={e=>setMeetingType(e.target.value)}>
                  {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Previous sessions for this member */}
            {toEmail && memberHistory.length > 0 && <div style={{marginTop:16,padding:"12px 14px",background:"var(--bg)",borderRadius:8}}>
              <div style={{fontSize:12,fontWeight:600,color:"var(--tx2)",marginBottom:8}}>Previous sessions ({memberHistory.length})</div>
              {memberHistory.map(s => (
                <div key={s.id} style={{fontSize:12,padding:"4px 0",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between"}}>
                  <span>{new Date(s.session_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"})}</span>
                  <span style={{padding:"1px 8px",borderRadius:10,fontSize:10,fontWeight:600,background:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red-bg)":"var(--green-bg)",color:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red)":"var(--green)"}}>{ENUM_TO_LABEL[s.meeting_type]||s.meeting_type}</span>
                  {s.performance_rating && <span style={{color:"var(--tx2)"}}>{s.performance_rating}</span>}
                </div>
              ))}
            </div>}
          </div>

          {/* Active AP/PIP plan notice — show all plans with separate pull buttons */}
          {toEmail && memberPlans.length > 0 && <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {memberPlans.map(mp => {
              const isPip = mp.type === "pip";
              const mpWeeks = planWeeks.filter(w => w.plan_id === mp.id).sort((a, b) => a.week_number - b.week_number);
              const filled = mpWeeks.filter(w => w.actual_data).length;
              return <div key={mp.id} style={{padding:"12px 16px",background:isPip?"var(--red-bg)":"var(--amber-bg)",borderRadius:8,border:`1px solid ${isPip?"var(--red)":"var(--amber)"}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18}}>{isPip?"⚠️":"📋"}</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:isPip?"var(--red)":"var(--amber)"}}>Active {mp.type.toUpperCase()} plan</div>
                    <div style={{fontSize:11,color:"var(--tx2)"}}>
                      {filled} of {mp.duration_weeks} periods filled · {mpWeeks.find(w=>!w.actual_data) ? "Next review due" : "All filled"}
                    </div>
                  </div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => fillTargetsFromPlan(mp)} style={{fontWeight:600}}>
                  Pull {mp.type.toUpperCase()} targets
                </button>
              </div>;
            })}
          </div>}

          {/* Template bar */}
          {TEMPLATES[meetingType] && <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"var(--accent-light)",borderRadius:8,fontSize:13}}>
            <span style={{color:"var(--accent-text)",fontWeight:500}}>Template available for {meetingType}</span>
            <button className="btn btn-outline btn-sm" onClick={applyTemplate}>Apply template</button>
          </div>}

          {/* Content fields */}
          <div className="card">
            <div className="card-header"><span className="card-title">Session content</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[["topics","Topics discussed",topics,setTopics],["strengths","Strengths observed",strengths,setStrengths],["weaknesses","Areas for improvement",weaknesses,setWeaknesses],["goals","Goals & progress update",goals,setGoals],["actions","Action items / next steps",actions,setActions]].map(([id,label,val,setter]) => (
                <div className="form-group" key={id}><label className="form-label">{label}</label>
                  <textarea className="form-input" rows={3} value={val} onChange={e=>setter(e.target.value)} placeholder="One point per line" style={{resize:"vertical"}}/>
                  <div style={{fontSize:10,color:val.length>1800?"var(--red)":"var(--tx3)",textAlign:"right"}}>{val.length} / 2000</div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance rating */}
          <div className="card">
            <div className="card-header"><span className="card-title">Performance rating</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5, 1fr)",gap:6}}>
              {PERF_OPTIONS.map(p => (
                <button key={p.val} onClick={()=>setPerfRating(perfRating===p.val?"":p.val)} style={{
                  padding:"12px 4px",border:perfRating===p.val?`2px solid ${p.color}`:"1.5px solid var(--bd)",
                  borderRadius:8,background:perfRating===p.val?p.bg:"var(--bg)",cursor:"pointer",textAlign:"center",
                  fontSize:11,fontWeight:perfRating===p.val?700:500,color:perfRating===p.val?p.color:"var(--tx2)",
                  fontFamily:"var(--font)",transition:"all .15s",lineHeight:1.3
                }}>
                  <div style={{fontSize:18,marginBottom:4}}>{p.emoji}</div>{p.val}
                </button>
              ))}
            </div>
          </div>

          {/* Target table (AP/PIP only) */}
          {isTargetType && <div className="card" style={{border:"1.5px solid var(--red)",borderColor:"var(--red)"}}>
            {(()=>{
              const isMonthlyPlan = targetRows[0]?._monthly;
              const colLabels = isMonthlyPlan ? ["M1","M2","M3","M4"] : ["W1","W2","W3","W4"];
              return <>
            <div className="card-header"><span className="card-title" style={{color:"var(--accent)"}}>{isMonthlyPlan ? "Monthly" : "Weekly"} QA Review — Score Tracking</span>
              <button className="btn btn-outline btn-sm" onClick={addTargetRow}><Icon d={icons.plus} size={14}/>Add metric</button>
            </div>
            <div className="table-wrap">
              <table style={{fontSize:12}}>
                <thead><tr>
                  <th>Metric</th><th>Row</th><th>Start</th>{colLabels.map(c=><th key={c}>{c}</th>)}<th>EOM</th><th style={{width:30}}></th>
                </tr></thead>
                <tbody>
                  {targetRows.map((r, ri) => {
                    const tEom = calcEom([r.w1,r.w2,r.w3,r.w4]);
                    const aEom = calcEom([r.a1,r.a2,r.a3,r.a4]);
                    const rowBg = ri%2===0?"transparent":"var(--bg)";
                    return (<React.Fragment key={ri}>
                      {/* Target row */}
                      <tr style={{background:rowBg}}>
                        <td rowSpan={3} style={{fontWeight:600,fontSize:12,verticalAlign:"middle",minWidth:100}}>
                          <input className="form-input" value={r.metric} onChange={e=>updateTarget(ri,"metric",e.target.value)} placeholder="Metric name" style={{padding:"4px 6px",fontSize:12,fontWeight:600,border:"none",background:"transparent",color:"var(--tx)"}}/>
                        </td>
                        <td style={{fontSize:10,fontWeight:600,color:"var(--green)",padding:"2px 6px"}}>Target</td>
                        <td><input className="form-input" type="number" value={r.start} onChange={e=>updateTarget(ri,"start",e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent",color:"var(--tx)"}}/></td>
                        {["w1","w2","w3","w4"].map(k => <td key={k}><input className="form-input" type="number" value={r[k]} onChange={e=>updateTarget(ri,k,e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent",color:"var(--tx)"}}/></td>)}
                        <td style={{fontWeight:700,textAlign:"center",color:"var(--green)",fontSize:12}}>{tEom !== null ? tEom+"%" : "—"}</td>
                        <td rowSpan={3} style={{textAlign:"center",verticalAlign:"middle"}}>
                          <button onClick={()=>removeTargetRow(ri)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:14,padding:2}}>×</button>
                        </td>
                      </tr>
                      {/* Actual row */}
                      <tr style={{background:rowBg}}>
                        <td style={{fontSize:10,fontWeight:600,color:"var(--amber)",padding:"2px 6px"}}>Actual</td>
                        <td style={{color:"var(--tx3)",textAlign:"center",fontSize:11}}>—</td>
                        {["a1","a2","a3","a4"].map(k => <td key={k}><input className="form-input" type="number" value={r[k]} onChange={e=>updateTarget(ri,k,e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent",color:"var(--tx)"}}/></td>)}
                        <td style={{fontWeight:700,textAlign:"center",fontSize:12,
                          color:aEom!==null&&tEom!==null?(aEom>=tEom?"var(--green)":"var(--red)"):"var(--amber)"
                        }}>{aEom !== null ? aEom+"%" : "—"}</td>
                      </tr>
                      {/* Diff row */}
                      <tr style={{background:rowBg,borderBottom:"1px solid var(--bd2)"}}>
                        <td style={{fontSize:10,fontWeight:600,color:"var(--tx3)",padding:"2px 6px"}}>Diff</td>
                        <td style={{color:"var(--tx3)",textAlign:"center",fontSize:11}}>—</td>
                        {["w1","w2","w3","w4"].map((wk,wi) => {
                          const d = calcDiff(r[wk], r["a"+(wi+1)]);
                          return <td key={wk} style={{textAlign:"center",fontSize:12,fontWeight:d!==null?700:400,
                            color:d!==null?(d>0?"var(--green)":d<0?"var(--red)":"var(--tx3)"):"var(--tx3)"
                          }}>{d !== null ? (d>0?"+":"")+d+"%" : "—"}</td>;
                        })}
                        {(() => {
                          if (aEom !== null && tEom !== null) {
                            const ed = Math.round((aEom - tEom) * 10) / 10;
                            return <td style={{textAlign:"center",fontSize:12,fontWeight:700,
                              color:ed>0?"var(--green)":ed<0?"var(--red)":"var(--tx3)"
                            }}>{ed>0?"+":""}{ed}%</td>;
                          }
                          return <td style={{textAlign:"center",color:"var(--tx3)"}}>—</td>;
                        })()}
                      </tr>
                    </React.Fragment>);
                  })}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:10,color:"var(--tx3)",marginTop:6,fontStyle:"italic"}}>EOM = average of filled weekly values. Difference = Actual minus Target.</div>

            {/* Conclusion */}
            <div style={{marginTop:16,padding:"14px",background:"var(--bg)",borderRadius:8,border:"1px solid var(--bd2)"}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--tx2)",marginBottom:10}}>Conclude {meetingType === "PIP Review" ? "PIP" : "Action Plan"}</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <button onClick={()=>setOutcome(outcome==="pass"?"":"pass")} className={`btn ${outcome==="pass"?"btn-primary":"btn-outline"}`} style={outcome==="pass"?{background:"var(--green)",color:"#fff"}:{}}>✅ Passed</button>
                <button onClick={()=>setOutcome(outcome==="fail"?"":"fail")} className={`btn ${outcome==="fail"?"btn-primary":"btn-outline"}`} style={outcome==="fail"?{background:"var(--red)",color:"#fff"}:{}}>❌ Did Not Pass</button>
              </div>
              {outcome==="fail" && <div className="form-group" style={{marginTop:8}}>
                <label className="form-label">Agreed next steps / consequence</label>
                <textarea className="form-input" rows={2} value={nextSteps} onChange={e=>setNextSteps(e.target.value)} placeholder="Describe the formal next steps..." style={{resize:"vertical"}}/>
                <div style={{marginTop:8,padding:"8px 12px",background:"var(--red-bg)",borderRadius:6,fontSize:12,color:"var(--red)",fontWeight:500}}>Please add HR to the CC field before sending.</div>
              </div>}
            </div>
          </>; })()}</div>}

          {/* Action buttons */}
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" onClick={()=>setShowPreview(true)} style={{flex:1}}><Icon d={icons.check} size={16}/>Preview email</button>
            <button className="btn btn-outline" onClick={clearForm}>Clear all</button>
          </div>
        </div>

        {/* RIGHT — Preview */}
        <div>
          <div className="card" style={{position:"sticky",top:20}}>
            <div className="card-header"><span className="card-title">Email preview</span>
              <span style={{fontSize:12,color:"var(--tx3)"}}>{showPreview ? "Ready to send" : "Waiting for input"}</span>
            </div>
            {!showPreview ? (
              <div className="placeholder" style={{padding:"60px 20px"}}>
                <div className="placeholder-icon"><Icon d={icons.coaching} size={28}/></div>
                <p style={{color:"var(--tx3)"}}>Fill in the session details, then click<br/><strong>Preview Email</strong></p>
              </div>
            ) : (<div>
              <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>TO:</span> {toEmail}</div>
              {ccEmail && <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>CC:</span> {ccEmail}</div>}
              <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>FROM:</span> {profile?.email}</div>
              <div style={{fontWeight:700,fontSize:15,padding:"12px 0",borderTop:"1px solid var(--bd2)",borderBottom:"1px solid var(--bd2)",margin:"10px 0 14px"}}>{emailSubject}</div>
              <div style={{background:"#fff",color:"#1a1a1a",padding:"20px",borderRadius:8,fontSize:13,lineHeight:1.85,maxHeight:500,overflowY:"auto"}} dangerouslySetInnerHTML={{__html: buildEmailBody()}}/>

              <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--bd2)"}}>
                <button className="btn btn-primary" onClick={generateAndSend} disabled={loading} style={{width:"100%",justifyContent:"center",padding:"12px"}}>
                  {loading ? "Sending..." : <><Icon d={icons.coaching} size={16}/>Send email & log session</>}
                </button>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>{
                    const body = buildEmailBody();
                    navigator.clipboard.writeText("Subject: "+emailSubject+"\n\n"+document.createElement("div").innerHTML);
                    show("success","Copied to clipboard");
                  }}>Copy text</button>
                  <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>setShowPreview(false)}>Edit</button>
                </div>
              </div>
            </div>)}
          </div>
        </div>
      </div>}

      {/* ═══ HISTORY TAB ═══ */}
      {tab==="history" && <div className="card">
        {sessions.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No coaching sessions logged yet.</p></div> :
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Type</th><th>Member</th><th>Sent by</th><th>Performance</th><th>Outcome</th>{hasRole(profile?.role,"super_admin")&&<th></th>}<th style={{width:30}}></th></tr></thead>
          <tbody>
            {sessions.map(s => {
              const isExp=expandedSession===s.id;
              return(<React.Fragment key={s.id}>
                <tr onClick={()=>setExpandedSession(isExp?null:s.id)} style={{cursor:"pointer"}}>
                <td style={{fontSize:13,whiteSpace:"nowrap"}}>{new Date(s.session_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"})}</td>
                <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red-bg)":"var(--green-bg)",color:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red)":"var(--green)"}}>{ENUM_TO_LABEL[s.meeting_type]||s.meeting_type}</span></td>
                <td style={{fontWeight:500}}>{nameFromEmail(s.member_email)}</td>
                <td style={{fontSize:13,color:"var(--tx2)"}}>{nameFromEmail(s.sender_email)}</td>
                <td>{s.performance_rating ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,
                  background:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green-bg)":s.performance_rating==="Meets Expectations"?"var(--accent-light)":"var(--amber-bg)",
                  color:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green)":s.performance_rating==="Meets Expectations"?"var(--accent-text)":"var(--amber)"
                }}>{s.performance_rating}</span> : "—"}</td>
                <td>{s.outcome ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:600,
                  background:s.outcome==="pass"?"var(--green-bg)":"var(--red-bg)",
                  color:s.outcome==="pass"?"var(--green)":"var(--red)"
                }}>{s.outcome==="pass"?"Passed":"Failed"}</span> : "—"}</td>
                {hasRole(profile?.role,"super_admin")&&<td>
                  <button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={async(e)=>{
                    e.stopPropagation();
                    if(!confirm("Delete this coaching session log?"))return;
                    try{
                      await sb.query("coaching_sessions",{token,method:"DELETE",filters:`id=eq.${s.id}`});
                      setSessions(sessions.filter(x=>x.id!==s.id));
                      show("success","Session deleted");
                    }catch(err){show("error",err.message);}
                  }}><Icon d={icons.trash} size={14}/></button>
                </td>}
                <td><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
              </tr>

              {/* Expanded session details */}
              {isExp&&<tr><td colSpan={hasRole(profile?.role,"super_admin")?8:7} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                  <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>To</div><div style={{fontSize:13}}>{s.member_email||"—"}</div></div>
                  <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>CC</div><div style={{fontSize:13}}>{s.cc_email||"—"}</div></div>
                  <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>From</div><div style={{fontSize:13}}>{s.sender_email||"—"}</div></div>
                  <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Subject</div><div style={{fontSize:13}}>{s.email_subject||"—"}</div></div>
                </div>

                {s.topics&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Topics discussed</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.topics}</div></div>}

                {s.strengths&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--green)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Strengths</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.strengths}</div></div>}

                {s.weaknesses&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--red)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Areas for improvement</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.weaknesses}</div></div>}

                {s.goals&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Goals</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.goals}</div></div>}

                {s.action_items&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Action items</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.action_items}</div></div>}

                {s.next_steps&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Next steps</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.next_steps}</div></div>}

                {s.target_data&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Target data</div><div style={{fontSize:12,color:"var(--tx2)",fontFamily:"monospace",background:"var(--bg3)",padding:"8px 10px",borderRadius:6,overflowX:"auto"}}>{s.target_data}</div></div>}

                <div style={{display:"flex",gap:16,flexWrap:"wrap",paddingTop:12,borderTop:"1px solid var(--bd2)",fontSize:12,color:"var(--tx3)"}}>
                  {s.sig_name&&<span>Signed by: <strong style={{color:"var(--tx)"}}>{s.sig_name}</strong>{s.sig_title?" — "+s.sig_title:""}</span>}
                  {s.created_at&&<span>Logged: {new Date(s.created_at).toLocaleString("en-GB",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>}
                </div>
              </div></td></tr>}
              </React.Fragment>);
            })}
          </tbody>
        </table></div>}
      </div>}

      {el}
    </div>
  );
}


function ActionPlanPage({ token, profile }) {
  const [tab, setTab] = useState("active"); // active | create | detection | history
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [mtd, setMtd] = useState([]);
  const [roster, setRoster] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [detections, setDetections] = useState([]);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [dismissModalAP, setDismissModalAP] = useState(null);
  const [dismissReasonAP, setDismissReasonAP] = useState("");
  const { show, el } = useToast();

  // ── Create form state ──
  const [selQaEmail, setSelQaEmail] = useState("");
  const [planType, setPlanType] = useState("ap"); // ap | pip
  const [planDuration, setPlanDuration] = useState(4);
  const [planReason, setPlanReason] = useState("");
  const [planTargets, setPlanTargets] = useState([]);
  const [selectedKpis, setSelectedKpis] = useState([]);
  const [followUpMode, setFollowUpMode] = useState("weekly"); // weekly | monthly
  const [customMetrics, setCustomMetrics] = useState([]); // [{name:"",targets:[]}]
  const [showCreateForm, setShowCreateForm] = useState(false);

  // ── Conclusion modal state ──
  const [concludingPlan, setConcludingPlan] = useState(null);
  const [conclusionOutcome, setConclusionOutcome] = useState("");
  const [conclusionNotes, setConclusionNotes] = useState("");

  // ── Slab engine (same as dashboard/leaderboard) ──
  const KPI_SLABS = {
    occupancy:   { label: "Occupancy",           weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
    coaching:    { label: "Coaching On-Time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
    calibration: { label: "Calibration",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
    observation: { label: "Coaching Observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
    rtr:         { label: "RTR Score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
  };

  const parseRaw = (val) => {
    if (!val && val !== 0) return null;
    const s = String(val).trim().replace(",", ".");
    if (s.includes("%")) return parseFloat(s.replace("%", ""));
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    if (n >= 0 && n <= 2) return n * 100;
    return n;
  };

  const calcSlab = (rawPct, th) => {
    if (rawPct === null) return { slab: 0, pct: 0, label: "Slab 0" };
    if (rawPct >= th[2]) return { slab: 3, pct: 100, label: "Slab 3" };
    if (rawPct >= th[1]) return { slab: 2, pct: 75, label: "Slab 2" };
    if (rawPct >= th[0]) return { slab: 1, pct: 50, label: "Slab 1" };
    return { slab: 0, pct: 0, label: "Slab 0" };
  };

  const getKpiScores = (row) => {
    return Object.entries(KPI_SLABS).map(([key, def]) => {
      const rawPct = parseRaw(row[def.rawKey]);
      const slab = calcSlab(rawPct, def.thresholds);
      const score = (def.weight * slab.pct) / 100;
      return { key, label: def.label, weight: def.weight, rawPct, slab, score, thresholds: def.thresholds, rawKey: def.rawKey };
    });
  };

  const getTotalScore = (row) => getKpiScores(row).reduce((s, k) => s + k.score, 0);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const c = p.replace(/[\d]+$/, "");
      return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const initialsFromEmail = (email) => {
    const name = nameFromEmail(email);
    const parts = name.split(" ");
    return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
  };

  const scoreColor = (v) => v >= 55 * 0.7 ? "var(--green)" : v >= 55 * 0.4 ? "var(--amber)" : "var(--red)";
  const scoreBg = (v) => v >= 55 * 0.7 ? "var(--green-bg)" : v >= 55 * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";

  // ── Data loading ──
  const load = useCallback(async () => {
    try {
      const [planRows, weekRows, mtdRows, rosterRows, profRows, dismissalRows, damFlags, damSteps] = await Promise.all([
        sb.query("action_plans", { select: "*", filters: "order=created_at.desc", token }).catch(() => []),
        sb.query("action_plan_weeks", { select: "*", filters: "order=plan_id.asc,week_number.asc", token }).catch(() => []),
        sb.query("mtd_scores", { select: "*", filters: "order=month.desc", token }).catch(() => []),
        sb.query("qa_roster", { select: "email,display_name,queue,manager_email", token }).catch(() => []),
        sb.query("profiles", { select: "id,email,display_name,role", filters: "status=eq.active", token }).catch(() => []),
        sb.query("ap_dismissals", { select: "*", filters: "order=created_at.desc", token }).catch(() => []),
        sb.query("dam_flags", { select: "id,profile_id,rule_id,occurrence_number,status,notes,profiles!dam_flags_profile_id_fkey(email,display_name),dam_rules(name,behavior_type)", filters: "order=triggered_at.desc", token }).catch(() => []),
        sb.query("dam_escalation_steps", { select: "id,rule_id,occurrence,action,includes_pip,pip_action", token }).catch(() => []),
      ]);
      setPlans(planRows);
      setWeeks(weekRows);
      setMtd(mtdRows);
      setRoster(rosterRows);
      setProfiles(profRows);

      // ── Auto-detection engine (DAM-driven) ──
      runDetection(mtdRows, planRows, dismissalRows, damFlags, damSteps);
    } catch (e) { console.error("AP/PIP load:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // ── Auto-detection: DAM-driven — only flag QAs with DAM escalation that includes AP/PIP ──
  const runDetection = (mtdRows, existingPlans, dismissalRows, damFlagRows, damStepRows) => {
    const activePlanEmails = existingPlans
      .filter(p => p.status === "active" || p.status === "pending_review")
      .map(p => p.qa_email?.toLowerCase());
    const dismissedEmails = new Set((dismissalRows || []).map(d => d.qa_email?.toLowerCase()));
    const months = sortMonthsDesc([...new Set(mtdRows.map(r => r.month))]);
    const latestMonth = months[0] || "—";
    const activeFlags = (damFlagRows || []).filter(f => f.status === "pending" || f.status === "acknowledged");
    const flagged = [];

    activeFlags.forEach(flag => {
      const email = flag.profiles?.email||flag.qa_email?.toLowerCase();
      if (!email) return;
      if (activePlanEmails.includes(email)) return;
      if (dismissedEmails.has(email)) return;
      if (flagged.find(f => f.email?.toLowerCase() === email)) return;

      const step = (damStepRows || []).find(s => s.rule_id === flag.rule_id && s.occurrence === flag.occurrence_number);
      if (!step || !step.includes_pip) return;

      const row = mtdRows.find(r => r.qa_email?.toLowerCase() === email && r.month === latestMonth);
      const totalScore = row ? getTotalScore(row) : 0;
      const kpis = row ? getKpiScores(row) : [];
      const ruleName = flag.dam_rules?.name || "Unknown";
      const behaviorType = flag.dam_rules?.behavior_type?.replace(/_/g, " ") || "";
      const pipAction = step.pip_action || step.action || "Action Plan required";

      flagged.push({
        email: flag.profiles?.email||flag.qa_email || email,
        name: flag.profiles?.display_name || nameFromEmail(email),
        reason: `DAM: ${ruleName} (${behaviorType}) — Occurrence #${flag.occurrence_number}: ${pipAction}`,
        severity: flag.occurrence_number >= 3 ? "critical" : flag.occurrence_number >= 2 ? "warning" : "notice",
        totalScore, kpis, latestMonth,
        tl: row?.qa_tl,
        damFlagId: flag.id,
        planType: step.includes_pip ? "pip" : "ap",
        pipActionType: step.pip_action || "new",
      });
    });

    const sevOrder = { critical: 0, warning: 1, notice: 2 };
    flagged.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) || a.totalScore - b.totalScore);
    setDetections(flagged);
  };

  // ── Generate suggested targets based on current scores ──
  const generateTargets = (qaEmail, kpiKeys) => {
    const months = sortMonthsDesc([...new Set(mtd.map(r => r.month))]);
    const latestMonth = months[0];
    const row = mtd.find(r => r.month === latestMonth && r.qa_email?.toLowerCase() === qaEmail.toLowerCase());
    const periods = followUpMode === "monthly" ? planDuration : planDuration;

    return (kpiKeys || []).map(key => {
      const def = KPI_SLABS[key];
      if (!def) return null;
      const rawPct = row ? parseRaw(row[def.rawKey]) : null;
      const slab = rawPct !== null ? calcSlab(rawPct, def.thresholds) : { slab: 0, label: "No data" };

      return {
        kpi_key: key,
        label: def.label,
        raw_key: def.rawKey,
        current_value: rawPct,
        current_slab: slab.label,
        target_value: "",
        weekly_targets: Array(periods).fill(""),
        weight: def.weight,
        thresholds: def.thresholds,
      };
    }).filter(Boolean);
  };

  // ── Start creating a plan (from detection or manually) ──
  const startCreate = (qaEmail, type) => {
    setSelQaEmail(qaEmail || "");
    setPlanType(type || "ap");
    setPlanDuration(type === "pip" ? 8 : 4);
    setPlanReason("");
    setSelectedKpis([]);
    setPlanTargets([]);
    setFollowUpMode("weekly");
    setCustomMetrics([]);
    setShowCreateForm(true);
    setTab("create");
  };

  // When QA email changes in create form, regenerate targets
  const handleQaEmailChange = (email) => {
    setSelQaEmail(email);
    if (email && roster.find(r => r.email?.toLowerCase() === email.toLowerCase()) && selectedKpis.length > 0) {
      setPlanTargets(generateTargets(email, selectedKpis));
    }
  };

  // Toggle KPI selection
  const toggleKpi = (key) => {
    const newSel = selectedKpis.includes(key) ? selectedKpis.filter(k => k !== key) : [...selectedKpis, key];
    setSelectedKpis(newSel);
    if (selQaEmail && roster.find(r => r.email?.toLowerCase() === selQaEmail.toLowerCase())) {
      setPlanTargets(generateTargets(selQaEmail, newSel));
    } else {
      setPlanTargets(newSel.map(k => {
        const def = KPI_SLABS[k]; if (!def) return null;
        return { kpi_key: k, label: def.label, raw_key: def.rawKey, current_value: null, current_slab: "—", target_value: "", weekly_targets: Array(planDuration).fill(""), weight: def.weight, thresholds: def.thresholds };
      }).filter(Boolean));
    }
  };

  // Custom metrics (free text)
  const addCustomMetric = () => setCustomMetrics(prev => [...prev, { name: "", targets: Array(planDuration).fill("") }]);
  const removeCustomMetric = (idx) => setCustomMetrics(prev => prev.filter((_, i) => i !== idx));

  // ── Save plan to Supabase ──
  const savePlan = async () => {
    if (!selQaEmail) { show("error", "Select a QA specialist"); return; }
    if (!planReason.trim()) { show("error", "Provide a reason for this plan"); return; }
    if (planTargets.length === 0 && customMetrics.length === 0) { show("error", "Select at least one KPI or add a custom metric"); return; }
    // Validate KPI targets
    const missingTargets = planTargets.some(t => t.weekly_targets.some(w => w === "" || w === null || w === undefined));
    if (missingTargets) { show("error", "Fill in all targets for each selected KPI"); return; }
    // Validate custom metrics
    const invalidCustom = customMetrics.some(c => !c.name.trim() || c.targets.some(t => t === "" || t === null || t === undefined));
    if (invalidCustom) { show("error", "Fill in name and all targets for each custom metric"); return; }

    const existing = plans.find(p =>
      p.qa_email?.toLowerCase() === selQaEmail.toLowerCase() &&
      p.type === planType &&
      (p.status === "active" || p.status === "pending_review")
    );
    if (existing) {
      show("error", `${nameFromEmail(selQaEmail)} already has an active ${existing.type.toUpperCase()} plan`);
      return;
    }

    setLoading(true);
    try {
      const startDate = new Date().toISOString().split("T")[0];
      const periodDays = followUpMode === "monthly" ? planDuration * 30 : planDuration * 7;
      const endDate = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Serialize all targets (KPIs + custom)
      const targetsJson = [
        ...planTargets.map(t => ({
          kpi_key: t.kpi_key, label: t.label, raw_key: t.raw_key,
          current_value: t.current_value, target_value: t.target_value,
          weekly_targets: t.weekly_targets, weight: t.weight, thresholds: t.thresholds,
        })),
        ...customMetrics.map((c, i) => ({
          kpi_key: "custom_" + i, label: c.name, raw_key: null,
          current_value: null, target_value: null,
          weekly_targets: c.targets, weight: 0, thresholds: null, is_custom: true,
        })),
      ];

      const qaRoster = roster.find(r => r.email?.toLowerCase() === selQaEmail.toLowerCase());

      const [planResult] = await sb.query("action_plans", {
        token, method: "POST",
        body: {
          qa_email: selQaEmail,
          type: planType,
          status: "active",
          reason: planReason,
          targets: JSON.stringify({ follow_up_mode: followUpMode, metrics: targetsJson }),
          start_date: startDate,
          end_date: endDate,
          duration_weeks: planDuration,
          created_by: profile?.email,
          tl_email: qaRoster?.manager_email || profile?.email,
          team: qaRoster?.queue || null,
        }
      });

      // Create period rows (weeks or months)
      if (planResult?.id) {
        const periodBodies = [];
        for (let p = 1; p <= planDuration; p++) {
          const pDays = followUpMode === "monthly" ? (p - 1) * 30 : (p - 1) * 7;
          const periodStart = new Date(Date.now() + pDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const targetData = {};
          planTargets.forEach(t => { targetData[t.kpi_key] = t.weekly_targets[p - 1] ?? t.target_value; });
          customMetrics.forEach((c, i) => { targetData["custom_" + i] = c.targets[p - 1] ?? ""; });
          periodBodies.push({
            plan_id: planResult.id,
            week_number: p,
            week_start: periodStart,
            target_data: JSON.stringify(targetData),
            actual_data: null, met_targets: null, coaching_session_id: null, notes: null,
          });
        }
        await sb.query("action_plan_weeks", { token, method: "POST", body: periodBodies });
      }

      show("success", `${planType.toUpperCase()} created for ${nameFromEmail(selQaEmail)}`);
      logActivity(token, profile?.email, `${planType}_created`, "action_plans", null, `QA: ${selQaEmail}, Duration: ${planDuration} weeks`);
      setShowCreateForm(false);
      setTab("active");
      // Reload to get new plan with ID
      load();
    } catch (e) {
      show("error", e.message);
    }
    setLoading(false);
  };

  // ── Update week actuals ──
  const updateWeekActuals = async (weekId, qaEmail) => {
    // Find the plan for this week
    const week = weeks.find(w => w.id === weekId);
    if (!week) { show("error", "Week not found"); return; }
    const plan = plans.find(p => p.id === week.plan_id);
    if (!plan) { show("error", "Plan not found"); return; }

    // Parse the plan's targets to know which KPIs to pull
    let targetData = {};
    try { targetData = JSON.parse(week.target_data || "{}"); } catch { }
    const targetKeys = Object.keys(targetData);

    // Parse plan targets to get raw_key mapping
    let planMetrics = [];
    try {
      const parsed = JSON.parse(plan.targets || "[]");
      planMetrics = Array.isArray(parsed) ? parsed : (parsed.metrics || []);
    } catch { }

    // Pull latest MTD data
    const months = sortMonthsDesc([...new Set(mtd.map(r => r.month))]);
    const latestMonth = months[0];
    const qaLocal = qaEmail.toLowerCase().split("@")[0];
    const row = mtd.find(r => r.month === latestMonth && (r.qa_email?.toLowerCase() === qaEmail.toLowerCase() || r.qa_email?.toLowerCase().split("@")[0] === qaLocal));
    if (!row) { show("error", "No MTD data found for " + nameFromEmail(qaEmail) + " in " + latestMonth); return; }

    // Only pull actuals for KPIs that are in this plan's targets
    const actualData = {};
    targetKeys.forEach(key => {
      // Find the metric definition (could be from KPI_SLABS or custom)
      const metric = planMetrics.find(m => m.kpi_key === key);
      if (metric?.raw_key && KPI_SLABS[key]) {
        // Standard KPI — pull from MTD
        actualData[key] = parseRaw(row[KPI_SLABS[key].rawKey]);
      } else if (metric?.raw_key) {
        actualData[key] = parseRaw(row[metric.raw_key]);
      } else {
        // Custom metric — can't pull from MTD, skip
      }
    });

    // Check if targets met (only for keys that have actuals)
    const metTargets = targetKeys.every(key => {
      const actual = actualData[key];
      const target = targetData[key];
      if (actual === null || actual === undefined) return true; // custom metrics without actuals don't block
      if (target === null || target === undefined || target === "") return true;
      return Number(actual) >= Number(target);
    });

    try {
      await sb.query("action_plan_weeks", {
        token, method: "PATCH",
        body: {
          actual_data: JSON.stringify(actualData),
          met_targets: metTargets,
          updated_at: new Date().toISOString(),
        },
        filters: `id=eq.${weekId}`,
      });
      show("success", "Actuals updated from MTD (" + latestMonth + ")");
      // Optimistic update
      setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, actual_data: JSON.stringify(actualData), met_targets: metTargets, updated_at: new Date().toISOString() } : w));
    } catch (e) { show("error", e.message); }
  };

  // ── Conclude plan ──
  const concludePlan = async () => {
    if (!concludingPlan || !conclusionOutcome) return;
    setLoading(true);
    try {
      await sb.query("action_plans", {
        token, method: "PATCH",
        body: {
          status: conclusionOutcome === "pass" ? "completed_pass" : "completed_fail",
          conclusion: conclusionOutcome,
          conclusion_notes: conclusionNotes,
          concluded_by: profile?.email,
          concluded_at: new Date().toISOString(),
        },
        filters: `id=eq.${concludingPlan.id}`,
      });

      // If PIP failed → auto-create DAM flag
      if (concludingPlan.type === "pip" && conclusionOutcome === "fail") {
        try {
          const qaProfile = profiles.find(p => p.email?.toLowerCase() === concludingPlan.qa_email?.toLowerCase());
          if (qaProfile) {
            await sb.query("dam_flags", {
              token, method: "POST",
              body: {
                profile_id: qaProfile.id,
                severity: "critical",
                recommended_action: "termination_review",
                notes: `PIP failed. Plan ID: ${concludingPlan.id}. ${conclusionNotes}`,
                status: "pending",
                occurrence_number: 1,
                trigger_data: JSON.stringify({ source: "pip_failure", plan_id: concludingPlan.id }),
              }
            });
            show("success", "PIP failed — DAM flag created for HR investigation");
          }
        } catch (e) { console.error("DAM flag creation:", e); }
      }

      // If AP failed → create DAM flag (performance_management) — DAM handles escalation
      if (concludingPlan.type === "ap" && conclusionOutcome === "fail") {
        try {
          const qaProfile = profiles.find(p => p.email?.toLowerCase() === concludingPlan.qa_email?.toLowerCase());
          if (qaProfile) {
            // Find the performance_management rule
            let pmRule = null;
            try {
              const rules = await sb.query("dam_rules", { select: "id,name,behavior_type", filters: "behavior_type=eq.performance_management&is_active=eq.true&limit=1", token });
              pmRule = rules[0] || null;
            } catch { }

            // Count existing occurrences for this person + rule
            let occurrence = 1;
            if (pmRule) {
              try {
                const existing = await sb.query("dam_flags", { select: "id", filters: `profile_id=eq.${qaProfile.id}&rule_id=eq.${pmRule.id}&status=neq.dismissed`, token });
                occurrence = (existing?.length || 0) + 1;
              } catch { }
            }

            // Get escalation step for this occurrence
            let step = null;
            if (pmRule) {
              try {
                const steps = await sb.query("dam_escalation_steps", { select: "*", filters: `rule_id=eq.${pmRule.id}&occurrence=eq.${occurrence}`, token });
                step = steps[0] || null;
              } catch { }
            }

            await sb.query("dam_flags", {
              token, method: "POST",
              body: {
                profile_id: qaProfile.id,
                rule_id: pmRule?.id || null,
                severity: "warning",
                recommended_action: step?.includes_pip ? "pip" : (step?.is_hr_investigation ? "termination_review" : "coaching"),
                notes: `Action Plan failed. Plan ID: ${concludingPlan.id}. ${conclusionNotes}`,
                status: "pending",
                occurrence_number: occurrence,
                escalation_step_id: step?.id || null,
                trigger_data: JSON.stringify({ source: "ap_failure", plan_id: concludingPlan.id, step_action: step?.action || "No step defined" }),
              }
            });
            show("success", `AP failed — DAM flag created (occurrence #${occurrence}${step ? ": " + step.action : ""})`);
          }
        } catch (e) {
          console.error("DAM flag creation:", e);
          show("error", "AP concluded as failed. Could not create DAM flag: " + e.message);
        }
      } else {
        show("success", `${concludingPlan.type.toUpperCase()} concluded as ${conclusionOutcome === "pass" ? "PASSED" : "FAILED"}`);
        logActivity(token, profile?.email, `${concludingPlan.type}_concluded`, "action_plans", concludingPlan.id, `QA: ${concludingPlan.qa_email}, Result: ${conclusionOutcome}`);
      }

      setConcludingPlan(null);
      setConclusionOutcome("");
      setConclusionNotes("");
      // Optimistic update
      const newStatus = conclusionOutcome === "pass" ? "completed_pass" : "completed_fail";
      setPlans(prev => prev.map(p => p.id === concludingPlan.id ? { ...p, status: newStatus, conclusion: conclusionOutcome, conclusion_notes: conclusionNotes, concluded_by: profile?.email, concluded_at: new Date().toISOString() } : p));
    } catch (e) { show("error", e.message); }
    setLoading(false);
  };

  // ── Dismiss detection (persisted to DB) ──
  const dismissDetectionDB = async (email, reason) => {
    try {
      await sb.query("ap_dismissals", { token, method: "POST", body: {
        qa_email: email,
        dismissed_by: profile?.email,
        reason: reason || "Dismissed by super admin",
        month: mtd.length ? sortMonthsDesc([...new Set(mtd.map(r => r.month))])[0] : "",
        detection_info: detections.find(d => d.email === email)?.reason || "",
      }});
      setDetections(prev => prev.filter(d => d.email !== email));
      show("success", "Detection dismissed for " + nameFromEmail(email));
    } catch (e) { show("error", e.message); }
  };

  // ── Helper: parse JSON safely ──
  const safeJson = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
  const safeJsonArr = (str) => { try { return JSON.parse(str || "[]"); } catch { return []; } };
  // Parse targets — handles old format (array) and new format ({follow_up_mode, metrics})
  const parseTargets = (str) => {
    try {
      const parsed = JSON.parse(str || "[]");
      if (Array.isArray(parsed)) return { follow_up_mode: "weekly", metrics: parsed };
      if (parsed.metrics) return parsed;
      return { follow_up_mode: "weekly", metrics: [] };
    } catch { return { follow_up_mode: "weekly", metrics: [] }; }
  };

  // ── Filtered plans ──
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSupervisor = hasRole(profile?.role, "qa_supervisor");
  const isAdmin = hasRole(profile?.role, "admin");
  const myEmail = profile?.email?.toLowerCase();
  const myDomain = profile?.operational_domain || profile?.domain || "tabby.ai";

  // Leads see their team's plans; supervisors see their domain; admins see all
  const myTeamLocal = myEmail?.split("@")[0]||"";
  const myEmailAltAP = myEmail?(myEmail.endsWith("@tabby.ai")?myTeamLocal+"@tabby.sa":myTeamLocal+"@tabby.ai"):"";
  const myTeamEmails = roster.filter(r => {const m=r.manager_email?.toLowerCase();return m&&(m===myEmail||m===myEmailAltAP||m===myTeamLocal);}).map(r => r.email?.toLowerCase());
  const visiblePlans = isAdmin ? plans : isSupervisor ? plans.filter(p =>
    p.qa_email?.endsWith("@" + myDomain)
  ) : plans.filter(p =>
    p.created_by?.toLowerCase() === myEmail ||
    p.tl_email?.toLowerCase() === myEmail ||
    myTeamEmails.includes(p.qa_email?.toLowerCase())
  );

  const activePlans = visiblePlans.filter(p => p.status === "active" || p.status === "pending_review");
  const historyPlans = visiblePlans.filter(p => p.status !== "active" && p.status !== "pending_review");

  const getWeeksForPlan = (planId) => weeks.filter(w => w.plan_id === planId).sort((a, b) => a.week_number - b.week_number);

  // ── Calculate plan progress ──
  const getPlanProgress = (plan) => {
    const planWeeks = getWeeksForPlan(plan.id);
    const filledWeeks = planWeeks.filter(w => w.actual_data);
    const metWeeks = planWeeks.filter(w => w.met_targets === true);
    const totalWeeks = plan.duration_weeks || planWeeks.length;
    const elapsed = filledWeeks.length;
    const remaining = totalWeeks - elapsed;
    const successRate = filledWeeks.length ? (metWeeks.length / filledWeeks.length * 100) : 0;
    return { totalWeeks, elapsed, remaining, metWeeks: metWeeks.length, successRate, planWeeks, filledWeeks };
  };

  // ── Auto-calculate pass recommendation ──
  const getAutoRecommendation = (plan) => {
    const { planWeeks, metWeeks, filledWeeks } = getPlanProgress(plan);
    if (filledWeeks.length === 0) return null;
    // Pass if >= 60% of filled weeks met targets
    const rate = metWeeks / filledWeeks.length;
    if (rate >= 0.6) return "pass";
    return "fail";
  };

  if (loading && plans.length === 0) return <div className="page"><div className="loading-spinner"><div className="spinner" /></div></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title">Action Plans & PIPs</div>
          <div className="page-subtitle">
            {activePlans.length} active plan{activePlans.length !== 1 ? "s" : ""} · {detections.length} detected
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => startCreate("", "ap")}>
          <Icon d={icons.plus} size={16} />New plan
        </button>
      </div>

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>
          Active ({activePlans.length})
        </button>
        <button className={`tab-btn ${tab === "detection" ? "active" : ""}`} onClick={() => setTab("detection")}>
          Detection {detections.length > 0 && <span style={{ marginLeft: 4, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "var(--red-bg)", color: "var(--red)" }}>{detections.length}</span>}
        </button>
        {showCreateForm && <button className={`tab-btn ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>
          Create plan
        </button>}
        <button className={`tab-btn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          History ({historyPlans.length})
        </button>
      </div>

      {/* ═══ DETECTION TAB ═══ */}
      {tab === "detection" && <div>
        {detections.length === 0 ? (
          <div className="card"><div className="placeholder" style={{ padding: "40px" }}>
            <div className="placeholder-icon"><Icon d={icons.check} size={28} /></div>
            <h3>No auto-detections</h3>
            <p>No QAs currently need an Action Plan.<br />AP/PIP detection is triggered by DAM escalation steps with "includes PIP" enabled.</p>
          </div></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: "10px 14px", background: "var(--amber-bg)", borderRadius: 8, fontSize: 13, color: "var(--amber)", fontWeight: 500 }}>
              ⚠️ {detections.length} QA specialist{detections.length !== 1 ? "s" : ""} flagged for potential Action Plan. Review and confirm below.
            </div>
            {detections.map(d => (
              <div key={d.email} className="card" style={{
                borderLeft: `4px solid ${d.severity === "critical" ? "var(--red)" : d.severity === "warning" ? "var(--amber)" : "var(--blue)"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
                      {initialsFromEmail(d.email)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                      <div style={{ fontSize: 12, color: "var(--tx3)" }}>{d.email} · TL: {d.tl ? nameFromEmail(d.tl) : "—"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: d.severity === "critical" ? "var(--red-bg)" : d.severity === "warning" ? "var(--amber-bg)" : "var(--green-bg)",
                      color: d.severity === "critical" ? "var(--red)" : d.severity === "warning" ? "var(--amber)" : "var(--green)",
                    }}>{d.severity.toUpperCase()}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(d.totalScore) }}>
                      {d.totalScore.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--tx3)" }}> / 55</span>
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, color: "var(--tx2)" }}>
                  {d.reason}
                </div>

                {/* KPI breakdown mini */}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {d.kpis.map(k => (
                    <div key={k.key} style={{
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                      background: k.slab.slab === 0 ? "var(--red-bg)" : k.slab.slab === 1 ? "var(--amber-bg)" : "var(--green-bg)",
                      color: k.slab.slab === 0 ? "var(--red)" : k.slab.slab === 1 ? "var(--amber)" : "var(--green)",
                    }}>
                      {k.label}: {k.rawPct !== null ? k.rawPct.toFixed(1) + "%" : "—"} ({k.slab.label})
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => startCreate(d.email, d.planType || "pip")} style={d.planType === "pip" ? { background: "var(--red)", color: "#fff" } : {}}>
                    <Icon d={d.planType === "pip" ? icons.dam : icons.plan} size={14} />Create {(d.planType || "pip").toUpperCase()}
                  </button>
                  {hasRole(profile?.role, "super_admin") ?
                    <button className="btn btn-outline btn-sm" onClick={() => dismissDetectionDB(d.email, "")}>Dismiss</button> :
                    <button className="btn btn-outline btn-sm" onClick={() => { setDismissModalAP(d); setDismissReasonAP(""); }}>Dismiss</button>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dismiss reason modal for non-super-admins */}
        {dismissModalAP && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={e=>{if(e.target===e.currentTarget){setDismissModalAP(null);setDismissReasonAP("");}}}>
          <div className="card" style={{width:"100%",maxWidth:480,margin:20}}>
            <div className="card-header"><span className="card-title">Dismiss Detection — {nameFromEmail(dismissModalAP.email)}</span></div>
            <div style={{fontSize:13,color:"var(--tx2)",marginBottom:12}}>{dismissModalAP.reason}</div>
            <div className="form-group">
              <label className="form-label">Reason for dismissal (required — visible to your supervisor)</label>
              <textarea className="form-input" rows={3} value={dismissReasonAP} onChange={e=>setDismissReasonAP(e.target.value)} placeholder="Why is this detection being dismissed?" style={{resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="btn btn-primary" disabled={!dismissReasonAP.trim()} onClick={async()=>{
                await dismissDetectionDB(dismissModalAP.email, dismissReasonAP.trim());
                setDismissModalAP(null);setDismissReasonAP("");
              }}>Confirm dismissal</button>
              <button className="btn btn-outline" onClick={()=>{setDismissModalAP(null);setDismissReasonAP("");}}>Cancel</button>
            </div>
          </div>
        </div>}
      </div>}

      {/* ═══ CREATE TAB ═══ */}
      {tab === "create" && showCreateForm && <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Create {planType === "pip" ? "Performance Improvement Plan" : "Action Plan"}</span>
          </div>
          <div className="form-grid">
            <div className="form-group" style={{ position: "relative" }}>
              <label className="form-label">QA Specialist</label>
              <input className="form-input" value={selQaEmail} onChange={e => handleQaEmailChange(e.target.value)} placeholder="Type name or email..." autoComplete="off" />
              {selQaEmail && !roster.find(r => r.email === selQaEmail) && (() => {
                const q = selQaEmail.toLowerCase();
                const matches = roster.filter(r => (r.email || "").toLowerCase().includes(q) || (r.display_name || "").toLowerCase().includes(q)).slice(0, 8);
                if (!matches.length) return null;
                return <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: "0 0 var(--radius) var(--radius)", boxShadow: "var(--shadow-lg)", maxHeight: 200, overflowY: "auto" }}>
                  {matches.map(r => <div key={r.email} onClick={() => handleQaEmailChange(r.email)} style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--bd2)", display: "flex", justifyContent: "space-between" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontWeight: 500 }}>{r.display_name || nameFromEmail(r.email)}</span>
                    <span style={{ color: "var(--tx3)", fontSize: 12 }}>{r.email}</span>
                  </div>)}
                </div>;
              })()}
            </div>
            <div className="form-group">
              <label className="form-label">Plan type</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setPlanType("ap"); setPlanDuration(4); }} className={`btn ${planType === "ap" ? "btn-primary" : "btn-outline"}`} style={planType === "ap" ? { background: "var(--amber)" } : {}}>
                  📋 Action Plan
                </button>
                <button onClick={() => { setPlanType("pip"); setPlanDuration(8); }} className={`btn ${planType === "pip" ? "btn-primary" : "btn-outline"}`} style={planType === "pip" ? { background: "var(--red)", color: "#fff" } : {}}>
                  ⚠️ PIP
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Duration</label>
              <select className="select form-input" value={planDuration} onChange={e => {
                const d = Number(e.target.value);
                setPlanDuration(d);
                // Resize existing targets
                setPlanTargets(prev => prev.map(t => ({ ...t, weekly_targets: Array(d).fill("") })));
                setCustomMetrics(prev => prev.map(c => ({ ...c, targets: Array(d).fill("") })));
              }}>
                {followUpMode === "weekly" ? (
                  planType === "ap" ? <option value={4}>4 weeks</option> : <>
                    <option value={4}>4 weeks</option>
                    <option value={6}>6 weeks</option>
                    <option value={8}>8 weeks</option>
                  </>
                ) : (
                  <>
                    <option value={1}>1 month</option>
                    <option value={2}>2 months</option>
                    <option value={3}>3 months</option>
                    <option value={4}>4 months</option>
                  </>
                )}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up frequency</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setFollowUpMode("weekly"); setPlanDuration(4); setPlanTargets(prev => prev.map(t => ({ ...t, weekly_targets: Array(4).fill("") }))); setCustomMetrics(prev => prev.map(c => ({ ...c, targets: Array(4).fill("") }))); }} className={`btn ${followUpMode === "weekly" ? "btn-primary" : "btn-outline"}`} style={{ fontSize: 13 }}>
                  📅 Weekly
                </button>
                <button onClick={() => { setFollowUpMode("monthly"); setPlanDuration(1); setPlanTargets(prev => prev.map(t => ({ ...t, weekly_targets: Array(1).fill("") }))); setCustomMetrics(prev => prev.map(c => ({ ...c, targets: Array(1).fill("") }))); }} className={`btn ${followUpMode === "monthly" ? "btn-primary" : "btn-outline"}`} style={{ fontSize: 13 }}>
                  📆 Monthly
                </button>
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Reason / justification</label>
              <textarea className="form-input" rows={2} value={planReason} onChange={e => setPlanReason(e.target.value)} placeholder="Why is this plan being created? Reference specific KPIs, months, patterns..." style={{ resize: "vertical" }} />
            </div>
          </div>
        </div>

        {/* Target configuration */}
        {/* Step 2: KPI selection */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Select KPIs to track</span>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>Choose which metrics to include in the plan</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
            {Object.entries(KPI_SLABS).map(([key, def]) => {
              const isOn = selectedKpis.includes(key);
              // Get current value for this QA
              const months2 = sortMonthsDesc([...new Set(mtd.map(r => r.month))]);
              const row2 = selQaEmail ? mtd.find(r => r.month === months2[0] && r.qa_email?.toLowerCase() === selQaEmail.toLowerCase()) : null;
              const curVal = row2 ? parseRaw(row2[def.rawKey]) : null;
              return (
                <div key={key} onClick={() => toggleKpi(key)} style={{
                  padding: "10px 16px", borderRadius: 10, cursor: "pointer", minWidth: 140,
                  border: isOn ? "2px solid var(--accent)" : "2px solid var(--bd2)",
                  background: isOn ? "var(--accent-light)" : "var(--bg)",
                  transition: "all .15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: isOn ? "none" : "2px solid var(--bd)", background: isOn ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isOn && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{def.label}</span>
                  </div>
                  {curVal !== null && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Current: {curVal.toFixed(1)}%</div>}
                </div>
              );
            })}
          </div>

          {/* Custom metric input */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--bd2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)" }}>Custom metrics (not in KPI list)</span>
              <button className="btn btn-outline btn-sm" onClick={addCustomMetric} style={{ fontSize: 11 }}>+ Add custom metric</button>
            </div>
            {customMetrics.map((cm, ci) => (
              <div key={ci} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input className="form-input" value={cm.name} onChange={e => {
                  const upd = [...customMetrics]; upd[ci] = { ...upd[ci], name: e.target.value }; setCustomMetrics(upd);
                }} placeholder="Metric name (e.g. CSAT, Attendance, SBS quality...)" style={{ flex: 1, fontSize: 13, padding: "6px 10px" }} />
                <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={() => removeCustomMetric(ci)}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Step 3: Targets (manual entry) */}
        {(planTargets.length > 0 || customMetrics.length > 0) && <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Set {followUpMode === "monthly" ? "monthly" : "weekly"} targets</span>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>Enter target % for each metric per {followUpMode === "monthly" ? "month" : "week"}</span>
          </div>
          <div className="table-wrap">
            <table style={{ fontSize: 12 }}>
              <thead><tr>
                <th>Metric</th>
                <th style={{ textAlign: "center" }}>Current</th>
                {Array.from({ length: planDuration }, (_, i) => (
                  <th key={i} style={{ textAlign: "center" }}>{followUpMode === "monthly" ? `M${i + 1}` : `W${i + 1}`} target</th>
                ))}
                <th style={{ textAlign: "center" }}>Avg</th>
              </tr></thead>
              <tbody>
                {planTargets.map((t, ti) => {
                  const filled = t.weekly_targets.filter(w => w !== "" && w !== null && w !== undefined);
                  const avg = filled.length > 0 ? filled.reduce((a, b) => a + Number(b), 0) / filled.length : null;
                  return (
                  <tr key={t.kpi_key}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>
                      {t.label}
                      {t.current_slab && t.current_slab !== "—" && <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 400 }}>{t.current_slab}</div>}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 500, color: t.current_value !== null ? (t.current_value >= t.thresholds?.[0] ? "var(--green)" : "var(--red)") : "var(--tx3)" }}>
                      {t.current_value !== null ? t.current_value.toFixed(1) + "%" : "—"}
                    </td>
                    {Array.from({ length: planDuration }, (_, wi) => (
                      <td key={wi} style={{ textAlign: "center" }}>
                        <input type="number" step="0.1" className="form-input" value={t.weekly_targets[wi] ?? ""} onChange={e => {
                          const newTargets = [...planTargets];
                          const newWeekly = [...newTargets[ti].weekly_targets];
                          newWeekly[wi] = e.target.value === "" ? "" : Number(e.target.value);
                          newTargets[ti] = { ...newTargets[ti], weekly_targets: newWeekly };
                          setPlanTargets(newTargets);
                        }} placeholder="%" style={{ width: 60, textAlign: "center", padding: "4px 6px", fontSize: 12 }} />
                      </td>
                    ))}
                    <td style={{ textAlign: "center", fontWeight: 600, fontSize: 12, color: avg !== null ? "var(--accent-text)" : "var(--tx3)" }}>
                      {avg !== null ? avg.toFixed(1) + "%" : "—"}
                    </td>
                  </tr>);
                })}
                {customMetrics.map((cm, ci) => {
                  const filledC = cm.targets.filter(t => t !== "" && t !== null && t !== undefined);
                  const nums = filledC.map(Number).filter(n => !isNaN(n));
                  const avgC = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
                  return (
                  <tr key={"custom_" + ci} style={{ background: "var(--bg)" }}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>
                      {cm.name || <span style={{ color: "var(--tx3)", fontStyle: "italic" }}>Custom metric</span>}
                      <div style={{ fontSize: 10, color: "var(--accent-text)", fontWeight: 400 }}>Custom</div>
                    </td>
                    <td style={{ textAlign: "center", color: "var(--tx3)" }}>—</td>
                    {Array.from({ length: planDuration }, (_, wi) => (
                      <td key={wi} style={{ textAlign: "center" }}>
                        <input className="form-input" value={cm.targets[wi] ?? ""} onChange={e => {
                          const upd = [...customMetrics];
                          const newT = [...upd[ci].targets];
                          newT[wi] = e.target.value;
                          upd[ci] = { ...upd[ci], targets: newT };
                          setCustomMetrics(upd);
                        }} placeholder="target" style={{ width: 60, textAlign: "center", padding: "4px 6px", fontSize: 12 }} />
                      </td>
                    ))}
                    <td style={{ textAlign: "center", fontWeight: 600, fontSize: 12, color: avgC !== null ? "var(--accent-text)" : "var(--tx3)" }}>
                      {avgC !== null ? avgC.toFixed(1) : "—"}
                    </td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 8, fontStyle: "italic" }}>
            {followUpMode === "monthly" ? "Targets will be reviewed at the end of each month." : "Targets will be reviewed weekly. Actuals are pulled from MTD data."}{customMetrics.length > 0 ? " Custom metrics are tracked manually." : ""}
          </div>
        </div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={savePlan} disabled={loading}>
            {loading ? "Creating..." : <><Icon d={icons.check} size={16} />Create {planType === "pip" ? "PIP" : "Action Plan"}</>}
          </button>
          <button className="btn btn-outline" onClick={() => { setShowCreateForm(false); setTab("active"); }}>Cancel</button>
        </div>
      </div>}

      {/* ═══ ACTIVE PLANS TAB ═══ */}
      {tab === "active" && <div>
        {activePlans.length === 0 ? (
          <div className="card"><div className="placeholder" style={{ padding: "40px" }}>
            <div className="placeholder-icon"><Icon d={icons.plan} size={28} /></div>
            <h3>No active plans</h3>
            <p>Create a new Action Plan or PIP from the Detection tab or the button above.</p>
          </div></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {activePlans.map(plan => {
              const prog = getPlanProgress(plan);
              const isExp = expandedPlan === plan.id;
              const targetsData = parseTargets(plan.targets);
              const targets = targetsData.metrics;
              const autoRec = getAutoRecommendation(plan);
              const progressPct = prog.totalWeeks ? (prog.elapsed / prog.totalWeeks) * 100 : 0;
              const daysLeft = plan.end_date ? Math.max(0, Math.ceil((new Date(plan.end_date) - Date.now()) / (1000 * 60 * 60 * 24))) : null;

              return (
                <div key={plan.id} className="card" style={{
                  borderLeft: `4px solid ${plan.type === "pip" ? "var(--red)" : "var(--amber)"}`,
                }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, cursor: "pointer" }} onClick={() => setExpandedPlan(isExp ? null : plan.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: plan.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                        color: plan.type === "pip" ? "var(--red)" : "var(--amber)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700,
                      }}>
                        {plan.type === "pip" ? "⚠️" : "📋"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{nameFromEmail(plan.qa_email)}</div>
                        <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                          <span style={{
                            padding: "1px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                            background: plan.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                            color: plan.type === "pip" ? "var(--red)" : "var(--amber)",
                            marginRight: 6,
                          }}>{plan.type.toUpperCase()}</span>
                          {plan.team || "—"} · Created by {nameFromEmail(plan.created_by)} · {new Date(plan.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })} — {new Date(plan.end_date).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Progress</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: prog.successRate >= 60 ? "var(--green)" : "var(--red)" }}>
                          {prog.metWeeks}/{prog.elapsed} {targetsData.follow_up_mode === "monthly" ? "months" : "weeks"} met
                        </div>
                      </div>
                      {daysLeft !== null && <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Remaining</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: daysLeft <= 7 ? "var(--red)" : "var(--tx)" }}>{daysLeft}d</div>
                      </div>}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform .2s", transform: isExp ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop: 12, height: 6, background: "var(--bd2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: 3, background: prog.successRate >= 60 ? "var(--green)" : "var(--amber)", transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--tx3)", marginTop: 4 }}>
                    <span>{targetsData.follow_up_mode === "monthly" ? "Month" : "Week"} {prog.elapsed} of {prog.totalWeeks}</span>
                    <span>Success rate: {prog.successRate.toFixed(0)}%</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--bd2)" }}>

                    {/* Reason */}
                    {plan.reason && <div style={{ marginBottom: 14, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, color: "var(--tx2)" }}>
                      <span style={{ fontWeight: 600, color: "var(--tx)" }}>Reason: </span>{plan.reason}
                    </div>}

                    {/* Weekly tracking table */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>{targetsData.follow_up_mode === "monthly" ? "Monthly" : "Weekly"} tracking</div>
                    <div className="table-wrap">
                      <table style={{ fontSize: 12 }}>
                        <thead><tr>
                          <th>{targetsData.follow_up_mode === "monthly" ? "Month" : "Week"}</th>
                          <th>Date</th>
                          {targets.map(t => <th key={t.kpi_key || t.label} style={{ textAlign: "center" }}>{t.label}{t.is_custom ? <div style={{fontSize:9,color:"var(--tx3)",fontWeight:400}}>Custom</div> : ""}</th>)}
                          <th style={{ textAlign: "center" }}>Met?</th>
                          <th style={{ width: 80 }}></th>
                        </tr></thead>
                        <tbody>
                          {prog.planWeeks.map(week => {
                            const targetData = safeJson(week.target_data);
                            const actualData = safeJson(week.actual_data);
                            const hasActuals = week.actual_data && Object.keys(actualData).length > 0;

                            return (
                              <tr key={week.id} style={{ background: hasActuals ? (week.met_targets ? "var(--green-bg)" : "var(--red-bg)") : "transparent" }}>
                                <td style={{ fontWeight: 600 }}>{targetsData.follow_up_mode === "monthly" ? "M" : "W"}{week.week_number}</td>
                                <td style={{ fontSize: 11, color: "var(--tx3)" }}>
                                  {week.week_start ? new Date(week.week_start + "T00:00:00").toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"}
                                </td>
                                {targets.map(t => {
                                  const tKey = t.kpi_key || t.label;
                                  const target = targetData[tKey];
                                  const actual = actualData?.[tKey];
                                  const met = actual !== null && actual !== undefined && target !== undefined && Number(actual) >= Number(target);
                                  return (
                                    <td key={tKey} style={{ textAlign: "center" }}>
                                      <div style={{ fontSize: 11, color: "var(--tx3)" }}>T: {target !== undefined ? target + (t.is_custom ? "" : "%") : "—"}</div>
                                      {hasActuals && <div style={{ fontSize: 12, fontWeight: 600, color: met ? "var(--green)" : "var(--red)" }}>
                                        A: {actual !== null && actual !== undefined ? (typeof actual === "number" ? actual.toFixed(1) + "%" : actual) : "—"}
                                      </div>}
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: "center" }}>
                                  {hasActuals ? (
                                    week.met_targets ?
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>✅</span> :
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>❌</span>
                                  ) : <span style={{ color: "var(--tx3)" }}>—</span>}
                                </td>
                                <td>
                                  {!hasActuals && <button className="btn btn-outline btn-sm" onClick={() => updateWeekActuals(week.id, plan.qa_email)} style={{ fontSize: 10, padding: "2px 8px" }}>
                                    Pull MTD
                                  </button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      {/* Send coaching review email */}
                      <button className="btn btn-outline btn-sm" style={{ color: "var(--accent-text)" }} onClick={() => {
                        window.dispatchEvent(new CustomEvent("navigate", { detail: "coaching" }));
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent("prefill-coaching", { detail: {
                            email: plan.qa_email,
                            type: plan.type === "pip" ? "PIP Review" : "Action Plan Review",
                          }}));
                        }, 300);
                      }}>
                        <Icon d={icons.coaching} size={14} />Send Review Email
                      </button>

                      {/* Schedule Google Calendar meeting */}
                      <button className="btn btn-outline btn-sm" onClick={() => {
                        const title = encodeURIComponent(`${plan.type === "pip" ? "PIP" : "AP"} Review — ${plan.qa_email?.split("@")[0].split(".").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ")}`);
                        const details = encodeURIComponent(`${plan.type === "pip" ? "PIP" : "Action Plan"} follow-up meeting.\n\nQA: ${plan.qa_email}\nPlan created: ${new Date(plan.created_at).toLocaleDateString()}`);
                        const attendee = encodeURIComponent(plan.qa_email);
                        const now = new Date();
                        const start = new Date(now.getTime() + 24*60*60*1000); // tomorrow
                        start.setHours(10,0,0,0);
                        const end = new Date(start.getTime() + 30*60*1000); // 30 min
                        const fmt = (d) => d.toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
                        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${fmt(start)}/${fmt(end)}&add=${attendee}`;
                        window.open(url, "_blank");
                      }}>
                        <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={14} />Schedule Meeting
                      </button>

                      {/* Pull all remaining weeks */}
                      {prog.planWeeks.some(w => !w.actual_data) && <button className="btn btn-outline btn-sm" onClick={async () => {
                        for (const w of prog.planWeeks.filter(w => !w.actual_data)) {
                          await updateWeekActuals(w.id, plan.qa_email);
                        }
                      }}>
                        <Icon d={icons.upload} size={14} />Pull all actuals from MTD
                      </button>}

                      {/* Conclude */}
                      <button className="btn btn-primary btn-sm" onClick={() => {
                        setConcludingPlan(plan);
                        const rec = getAutoRecommendation(plan);
                        setConclusionOutcome(rec || "");
                      }}>
                        <Icon d={icons.check} size={14} />Conclude {plan.type.toUpperCase()}
                      </button>

                      {/* Failed AP → suggest PIP */}
                      {plan.type === "ap" && prog.successRate < 50 && prog.elapsed >= 2 && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={() => startCreate(plan.qa_email, "pip")}>
                        <Icon d={icons.dam} size={14} />Escalate to PIP
                      </button>}

                      {/* Super admin: hard delete */}
                      {hasRole(profile?.role, "super_admin") && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)", marginLeft: "auto" }} onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Permanently delete this ${plan.type.toUpperCase()} for ${nameFromEmail(plan.qa_email)}? This cannot be undone and leaves no trace.`)) return;
                        try {
                          await sb.query("action_plan_weeks", { token, method: "DELETE", filters: `plan_id=eq.${plan.id}` });
                          await sb.query("action_plans", { token, method: "DELETE", filters: `id=eq.${plan.id}` });
                          show("success", "Plan permanently deleted");
                          setPlans(prev => prev.filter(p => p.id !== plan.id));
                          setWeeks(prev => prev.filter(w => w.plan_id !== plan.id));
                        } catch (err) { show("error", err.message); }
                      }}>
                        <Icon d={icons.trash} size={14} />Delete
                      </button>}
                    </div>

                    {/* Audit trail */}
                    <div style={{ marginTop: 14, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 11, color: "var(--tx3)" }}>
                      Created by {nameFromEmail(plan.created_by)} on {new Date(plan.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                      {plan.tl_email && <span> · TL: {nameFromEmail(plan.tl_email)}</span>}
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === "history" && <div className="card">
        {historyPlans.length === 0 ? (
          <div className="placeholder" style={{ padding: "40px" }}>
            <p style={{ color: "var(--tx3)" }}>No completed plans in history.</p>
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>QA Specialist</th>
              <th>Type</th>
              <th>Duration</th>
              <th style={{ textAlign: "center" }}>Result</th>
              <th>Created by</th>
              <th>Date range</th>
              <th>Concluded by</th>
              <th>Notes</th>
              {hasRole(profile?.role, "super_admin") && <th></th>}
            </tr></thead>
            <tbody>
              {historyPlans.map(p => {
                const prog = getPlanProgress(p);
                const isHistExp = expandedPlan === "h-" + p.id;
                const hTargets = parseTargets(p.targets);
                const hMetrics = hTargets.metrics;
                const isMonthlyH = hTargets.follow_up_mode === "monthly";
                return (<React.Fragment key={p.id}>
                  <tr onClick={() => setExpandedPlan(isHistExp ? null : "h-" + p.id)} style={{ cursor: "pointer" }}>
                    <td style={{ fontWeight: 500 }}>{nameFromEmail(p.qa_email)}</td>
                    <td>
                      <span style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                        background: p.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                        color: p.type === "pip" ? "var(--red)" : "var(--amber)",
                      }}>{p.type.toUpperCase()}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{p.duration_weeks}{isMonthlyH ? "m" : "w"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        padding: "3px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: p.conclusion === "pass" ? "var(--green-bg)" : "var(--red-bg)",
                        color: p.conclusion === "pass" ? "var(--green)" : "var(--red)",
                      }}>
                        {p.conclusion === "pass" ? "Passed" : "Failed"}
                      </span>
                      <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{prog.metWeeks}/{prog.elapsed} {isMonthlyH ? "months" : "weeks"} met</div>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>{nameFromEmail(p.created_by)}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>
                      {p.start_date ? new Date(p.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"} — {p.end_date ? new Date(p.end_date).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>{nameFromEmail(p.concluded_by)}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.conclusion_notes || "—"}
                    </td>
                    {hasRole(profile?.role, "super_admin") && <td>
                      <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Permanently delete this ${p.type.toUpperCase()} for ${nameFromEmail(p.qa_email)}?`)) return;
                        try {
                          await sb.query("action_plan_weeks", { token, method: "DELETE", filters: `plan_id=eq.${p.id}` });
                          await sb.query("action_plans", { token, method: "DELETE", filters: `id=eq.${p.id}` });
                          show("success", "Plan permanently deleted");
                          setPlans(prev => prev.filter(x => x.id !== p.id));
                          setWeeks(prev => prev.filter(w => w.plan_id !== p.id));
                        } catch (err) { show("error", err.message); }
                      }}><Icon d={icons.trash} size={14} /></button>
                    </td>}
                  </tr>
                  {/* Expanded tracking detail */}
                  {isHistExp && <tr><td colSpan={hasRole(profile?.role, "super_admin") ? 9 : 8} style={{ padding: "16px", background: "var(--bg)" }}>
                    {p.reason && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--tx2)" }}>
                      <span style={{ fontWeight: 600, color: "var(--tx)" }}>Reason: </span>{p.reason}
                    </div>}
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>{isMonthlyH ? "Monthly" : "Weekly"} tracking</div>
                    <table style={{ fontSize: 12, width: "100%" }}>
                      <thead><tr>
                        <th>{isMonthlyH ? "Month" : "Week"}</th>
                        <th>Date</th>
                        {hMetrics.map(t => <th key={t.kpi_key || t.label} style={{ textAlign: "center" }}>{t.label}</th>)}
                        <th style={{ textAlign: "center" }}>Met?</th>
                      </tr></thead>
                      <tbody>
                        {prog.planWeeks.map(week => {
                          const td = safeJson(week.target_data);
                          const ad = safeJson(week.actual_data);
                          const hasA = week.actual_data && Object.keys(ad).length > 0;
                          return <tr key={week.id} style={{ background: hasA ? (week.met_targets ? "var(--green-bg)" : "var(--red-bg)") : "transparent" }}>
                            <td style={{ fontWeight: 600 }}>{isMonthlyH ? "M" : "W"}{week.week_number}</td>
                            <td style={{ fontSize: 11, color: "var(--tx3)" }}>{week.week_start ? new Date(week.week_start + "T00:00:00").toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"}</td>
                            {hMetrics.map(t => {
                              const tKey = t.kpi_key || t.label;
                              const target = td[tKey];
                              const actual = ad?.[tKey];
                              const met = actual != null && target != null && Number(actual) >= Number(target);
                              return <td key={tKey} style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 11, color: "var(--tx3)" }}>T: {target != null ? target + "%" : "—"}</div>
                                {hasA && <div style={{ fontSize: 12, fontWeight: 600, color: met ? "var(--green)" : "var(--red)" }}>A: {actual != null ? (typeof actual === "number" ? actual.toFixed(1) + "%" : actual) : "—"}</div>}
                              </td>;
                            })}
                            <td style={{ textAlign: "center" }}>{hasA ? (week.met_targets ? <span style={{ color: "var(--green)", fontWeight: 700 }}>Yes</span> : <span style={{ color: "var(--red)", fontWeight: 700 }}>No</span>) : "—"}</td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                    {p.conclusion_notes && <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg3)", borderRadius: 6, fontSize: 12, color: "var(--tx2)" }}>
                      <span style={{ fontWeight: 600 }}>Conclusion notes: </span>{p.conclusion_notes}
                    </div>}
                  </td></tr>}
                </React.Fragment>);
              })}
            </tbody>
          </table></div>
        )}
      </div>}

      {/* ═══ CONCLUSION MODAL ═══ */}
      {concludingPlan && <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }} onClick={(e) => { if (e.target === e.currentTarget) setConcludingPlan(null); }}>
        <div className="card" style={{ width: "100%", maxWidth: 520, margin: 20 }}>
          <div className="card-header">
            <span className="card-title">Conclude {concludingPlan.type.toUpperCase()} — {nameFromEmail(concludingPlan.qa_email)}</span>
          </div>

          {/* Auto-recommendation */}
          {(() => {
            const rec = getAutoRecommendation(concludingPlan);
            const prog = getPlanProgress(concludingPlan);
            return rec ? (
              <div style={{ padding: "10px 14px", background: rec === "pass" ? "var(--green-bg)" : "var(--red-bg)", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: rec === "pass" ? "var(--green)" : "var(--red)" }}>
                  Auto-recommendation: {rec === "pass" ? "✅ PASS" : "❌ FAIL"}
                </span>
                <span style={{ color: "var(--tx2)", marginLeft: 8 }}>({prog.metWeeks}/{prog.elapsed} periods met targets — {prog.successRate.toFixed(0)}%)</span>
              </div>
            ) : null;
          })()}

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setConclusionOutcome("pass")} className={`btn ${conclusionOutcome === "pass" ? "btn-primary" : "btn-outline"}`} style={conclusionOutcome === "pass" ? { background: "var(--green)", color: "#fff" } : {}}>✅ Passed</button>
            <button onClick={() => setConclusionOutcome("fail")} className={`btn ${conclusionOutcome === "fail" ? "btn-primary" : "btn-outline"}`} style={conclusionOutcome === "fail" ? { background: "var(--red)", color: "#fff" } : {}}>❌ Failed</button>
          </div>

          <div className="form-group">
            <label className="form-label">Conclusion notes</label>
            <textarea className="form-input" rows={3} value={conclusionNotes} onChange={e => setConclusionNotes(e.target.value)} placeholder="Document the final assessment..." style={{ resize: "vertical" }} />
          </div>

          {conclusionOutcome === "fail" && concludingPlan.type === "ap" && (
            <div style={{ padding: "8px 12px", background: "var(--amber-bg)", borderRadius: 6, fontSize: 12, color: "var(--amber)", fontWeight: 500, marginTop: 8 }}>
              ⚠️ Failed AP will recommend escalation to PIP.
            </div>
          )}
          {conclusionOutcome === "fail" && concludingPlan.type === "pip" && (
            <div style={{ padding: "8px 12px", background: "var(--red-bg)", borderRadius: 6, fontSize: 12, color: "var(--red)", fontWeight: 500, marginTop: 8 }}>
              ⚠️ Failed PIP will automatically create a DAM flag for HR investigation.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={concludePlan} disabled={!conclusionOutcome || loading}>
              {loading ? "Processing..." : "Confirm conclusion"}
            </button>
            <button className="btn btn-outline" onClick={() => { setConcludingPlan(null); setConclusionOutcome(""); setConclusionNotes(""); }}>Cancel</button>
          </div>
        </div>
      </div>}

      {el}
    </div>
  );
}

/* ═══ COACHING VIOLATIONS PAGE ═══ */
function CoachingViolationsPage({token, profile, gf}) {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [damRules, setDamRules] = useState([]);
  const [selDamRule, setSelDamRule] = useState("");
  const { show, el } = useToast();

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const c = p.replace(/[\d]+$/, "");
      return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const load = useCallback(async () => {
    try {
      const [v, p, r] = await Promise.all([
        sb.query("coaching_violations", { select: "*", filters: "order=created_at.desc", token }).catch(() => []),
        sb.query("profiles", { select: "id,email,display_name,role", filters: "status=eq.active", token }).catch(() => []),
        sb.query("dam_rules", { select: "id,name,behavior_type", filters: "is_active=eq.true&order=name.asc", token }).catch(() => []),
      ]);
      // Domain scope for supervisors
      const svDomain = profile?.operational_domain || profile?.domain || "tabby.ai";
      const isAdmin = hasRole(profile?.role, "admin");
      const isSv = hasRole(profile?.role, "qa_supervisor") && !isAdmin;
      let filtered = isSv ? v.filter(x => x.qa_emails?.includes("@" + svDomain) || x.lead_email?.includes("@" + svDomain)) : v;
      // Apply global filters
      if(gf?.domain) filtered = filtered.filter(x => x.qa_emails?.includes("@" + gf.domain));
      if(gf?.people?.length > 0) filtered = filtered.filter(x => gf.people.some(p => x.qa_emails?.toLowerCase().includes(p)));
      setViolations(filtered);
      setProfiles(p);
      setDamRules(r);
    } catch (e) { console.error("Violations:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const pendingV = violations.filter(v => v.status === "pending");
  const reviewedV = violations.filter(v => v.status !== "pending");

  const openReview = (v) => {
    setReviewModal(v);
    setReviewStatus(v.status === "pending" ? "" : (v.status === "invalid" ? "invalid" : "valid"));
    setReviewNotes(v.review_notes || "");
    // Auto-detect DAM rule from violation type
    const typeToRule = {
      "> 4 Uses": "Same link for 4+",
      "Multiple Days": "Same link on different days",
      "Multiple Agents": "Same link for multiple agents",
    };
    const matchText = typeToRule[v.violation_type] || "";
    const matched = damRules.find(r => r.name?.toLowerCase().includes(matchText.toLowerCase()));
    setSelDamRule(matched?.id || "");
  };

  const submitReview = async () => {
    if (!reviewStatus) { show("error", "Select Valid or Invalid"); return; }

    try {
      // Update the violation
      await sb.query("coaching_violations", {
        token, method: "PATCH",
        body: {
          status: reviewStatus === "valid" ? "valid" : "invalid",
          reviewed_by: profile?.email,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes.trim() || null,
        },
        filters: `id=eq.${reviewModal.id}`,
      });

      // If valid → auto-create DAM flag (DAM rule is required)
      if (reviewStatus === "valid") {
        if (!selDamRule) { show("error", "Select a DAM rule to create the flag"); setLoading(false); return; }

        const qaEmailsList = reviewModal.qa_emails.split("\n").map(e => e.trim()).filter(Boolean);
        let flagsCreated = 0;

        for (const qaEmail of qaEmailsList) {
          // Try to find profile by email (check both domain variants)
          let qaProfile = profiles.find(p => p.email?.toLowerCase() === qaEmail.toLowerCase());
          if (!qaProfile) {
            const local = qaEmail.split("@")[0];
            qaProfile = profiles.find(p => p.email?.toLowerCase() === (local + "@tabby.ai") || p.email?.toLowerCase() === (local + "@tabby.sa"));
          }

          // Count existing occurrences (by profile_id or qa_email)
          let occurrence = 1;
          try {
            const filterStr = qaProfile
              ? `profile_id=eq.${qaProfile.id}&rule_id=eq.${selDamRule}&status=neq.dismissed`
              : `qa_email=eq.${qaEmail}&rule_id=eq.${selDamRule}&status=neq.dismissed`;
            const existing = await sb.query("dam_flags", { select: "id", filters: filterStr, token });
            occurrence = (existing?.length || 0) + 1;
          } catch {}

          // Create DAM flag — with profile_id if available, otherwise just qa_email
          const selectedRule = damRules.find(r => r.id === selDamRule);
          const flagBody = {
            rule_id: selDamRule,
            qa_email: qaEmail,
            severity: selectedRule?.severity || (occurrence >= 3 ? "critical" : occurrence >= 2 ? "warning" : "notice"),
            recommended_action: selectedRule?.recommended_action || "coaching",
            status: "pending",
            notes: `Auto-created from coaching violation: ${reviewModal.violation_type}. Link: ${reviewModal.coaching_link}. Review notes: ${reviewNotes.trim()}`,
            occurrence_number: occurrence,
          };
          if (qaProfile) flagBody.profile_id = qaProfile.id;

          await sb.query("dam_flags", { token, method: "POST", body: flagBody });
          flagsCreated++;
        }

        // Update violation status to dam_created
        await sb.query("coaching_violations", {
          token, method: "PATCH",
          body: { status: "dam_created", reviewed_by: profile?.email, reviewed_at: new Date().toISOString(), review_notes: reviewNotes.trim() },
          filters: `id=eq.${reviewModal.id}`,
        });

        show("success", `Marked as valid — ${flagsCreated} DAM flag(s) created`);
        logActivity(token, profile?.email, "violation_valid", "coaching_violations", reviewModal.id, `QA: ${reviewModal.qa_emails}, Type: ${reviewModal.violation_type}`);
      } else {
        show("success", "Marked as invalid");
        logActivity(token, profile?.email, "violation_invalid", "coaching_violations", reviewModal.id, `QA: ${reviewModal.qa_emails}, Type: ${reviewModal.violation_type}`);
      }

      setReviewModal(null);
      // Optimistic update
      const newStatus = reviewStatus === "valid" ? "dam_created" : "invalid";
      setViolations(prev => prev.map(v => v.id === reviewModal.id ? { ...v, status: newStatus, reviewed_by: profile?.email, reviewed_at: new Date().toISOString(), review_notes: reviewNotes.trim() } : v));
    } catch (e) { show("error", e.message); }
  };

  const violationColor = (type) => {
    if (type?.includes(">") || type?.includes("4")) return { bg: "var(--red-bg)", color: "var(--red)" };
    if (type?.includes("Day")) return { bg: "var(--amber-bg)", color: "var(--amber)" };
    if (type?.includes("Agent")) return { bg: "#EDE9FE", color: "#7C3AED" };
    return { bg: "var(--bg2)", color: "var(--tx2)" };
  };

  if (loading) return <div className="page"><div className="loading-spinner"><div className="spinner" /></div></div>;

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Coaching Violations</div>
          <div className="page-subtitle">Review coaching link violations detected by the audit script</div>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          {pendingV.length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--red-bg)",color:"var(--red)",fontSize:12,fontWeight:700}}>{pendingV.length} pending</span>}
          <span style={{padding:"4px 12px",borderRadius:20,background:"var(--green-bg)",color:"var(--green)",fontSize:12,fontWeight:600}}>{reviewedV.length} reviewed</span>
        </div>
      </div>

      <div className="tab-bar" style={{marginBottom:16}}>
        <button className={`tab-btn ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
          Pending review ({pendingV.length})
        </button>
        <button className={`tab-btn ${tab === "reviewed" ? "active" : ""}`} onClick={() => setTab("reviewed")}>
          Reviewed ({reviewedV.length})
        </button>
      </div>

      {tab === "pending" && <div className="card">
        {pendingV.length === 0 ? (
          <div className="placeholder" style={{ padding: 40 }}>
            <p style={{ color: "var(--tx3)" }}>No pending violations to review.</p>
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>QA</th>
              <th>Lead</th>
              <th>Violation</th>
              <th>Date</th>
              <th>Link</th>
              <th></th>
            </tr></thead>
            <tbody>
              {pendingV.map(v => {
                const vc = violationColor(v.violation_type);
                return (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>
                      {v.qa_emails?.split("\n").map((e, i) => <div key={i}>{nameFromEmail(e)}</div>)}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--tx2)" }}>
                      {v.lead_email?.split("\n").map((e, i) => <div key={i}>{nameFromEmail(e)}</div>)}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, background: vc.bg, color: vc.color }}>
                        {v.violation_type}
                      </span>
                      {(()=>{
                        const flowMap = { "> 4 Uses": "Coaching Observation", "> 3 Uses": "Coaching Observation", "Multiple Days": "Calendar + Occupancy Audit", "Multiple Agents": "Calendar Audit" };
                        const flow = flowMap[v.violation_type];
                        return flow ? <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{flow}</div> : null;
                      })()}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>
                      {v.violation_date ? new Date(v.violation_date + "T00:00:00").toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <a href={v.coaching_link} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)", textDecoration: "underline", fontSize: 12 }}>Open</a>
                        <button className="btn btn-outline btn-sm" style={{ fontSize: 10, padding: "1px 6px" }} onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(v.coaching_link);
                          show("success", "Link copied!");
                        }}>Copy</button>
                      </div>
                    </td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => openReview(v)}>Review</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>}

      {tab === "reviewed" && <div className="card">
        {reviewedV.length === 0 ? (
          <div className="placeholder" style={{ padding: 40 }}>
            <p style={{ color: "var(--tx3)" }}>No reviewed violations yet.</p>
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>QA</th>
              <th>Violation</th>
              <th>Result</th>
              <th>Reviewed by</th>
              <th>Notes</th>
              <th>Date</th>
              <th></th>
            </tr></thead>
            <tbody>
              {reviewedV.map(v => {
                const vc = violationColor(v.violation_type);
                return (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>
                      {v.qa_emails?.split("\n").map((e, i) => <div key={i}>{nameFromEmail(e)}</div>)}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, background: vc.bg, color: vc.color }}>
                        {v.violation_type}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600,
                        background: v.status === "invalid" ? "var(--green-bg)" : v.status === "dam_created" ? "var(--red-bg)" : "var(--amber-bg)",
                        color: v.status === "invalid" ? "var(--green)" : v.status === "dam_created" ? "var(--red)" : "var(--amber)",
                      }}>
                        {v.status === "invalid" ? "✓ Invalid" : v.status === "dam_created" ? "⚠ Valid → DAM" : "Valid"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>{nameFromEmail(v.reviewed_by)}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.review_notes || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>
                      {v.reviewed_at ? new Date(v.reviewed_at).toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {hasRole(profile?.role, "qa_lead") && <button className="btn btn-outline btn-sm" onClick={() => openReview(v)}><Icon d={icons.edit} size={14} /></button>}
                        {hasRole(profile?.role, "super_admin") && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => {
                          if (!confirm("Delete this violation record?")) return;
                          try {
                            await sb.query("coaching_violations", { token, method: "DELETE", filters: `id=eq.${v.id}` });
                            show("success", "Deleted");
                            load();
                          } catch (e) { show("error", e.message); }
                        }}><Icon d={icons.trash} size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>}

      {/* Review Modal */}
      {reviewModal && (()=>{
        // Map violation type to suggested DAM rule and auditing flow
        const violationMap = {
          "> 4 Uses": { ruleName: "Coaching Recording: Same link for 3+ tickets", flow: "Coaching Observation" },
          "> 3 Uses": { ruleName: "Coaching Recording: Same link for 3+ tickets", flow: "Coaching Observation" },
          "Multiple Days": { ruleName: "Coaching Recording: Same link on different days", flow: "Calendar + Occupancy Audit" },
          "Multiple Agents": { ruleName: "Coaching Recording: Same link for multiple agents", flow: "Calendar Audit" },
        };
        const suggestion = violationMap[reviewModal.violation_type] || null;
        const suggestedRule = suggestion ? damRules.find(r => r.name === suggestion.ruleName) : null;

        return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) setReviewModal(null); }}>
        <div className="card" style={{ width: "100%", maxWidth: 560, margin: 20 }}>
          <div className="card-header"><span className="card-title">{reviewModal.status !== "pending" ? "Update Review" : "Review Violation"}</span></div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: "var(--tx3)" }}>QA: </span><strong>{reviewModal.qa_emails?.split("\n").map(e => nameFromEmail(e)).join(", ")}</strong></div>
              <div><span style={{ color: "var(--tx3)" }}>Type: </span><strong>{reviewModal.violation_type}</strong></div>
              <div><span style={{ color: "var(--tx3)" }}>Date: </span>{reviewModal.violation_date || "—"}</div>
              <div><span style={{ color: "var(--tx3)" }}>Lead: </span>{reviewModal.lead_email?.split("\n").map(e => nameFromEmail(e)).join(", ")}</div>
            </div>

            {/* Suggested auditing flow */}
            {suggestion && <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--amber-bg)", borderRadius: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: "var(--amber)" }}>Suggested audit: </span>
              <span style={{ color: "var(--tx)" }}>{suggestion.flow}</span>
              {suggestedRule && <span style={{ color: "var(--tx3)" }}> · DAM rule: {suggestedRule.name}</span>}
            </div>}

            <div style={{ marginTop: 8 }}>
              <a href={reviewModal.coaching_link} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)", fontSize: 13 }}>
                Open coaching link ↗
              </a>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Decision</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setReviewStatus("valid"); if (suggestedRule) setSelDamRule(suggestedRule.id); }} className={`btn ${reviewStatus === "valid" ? "btn-primary" : "btn-outline"}`} style={reviewStatus === "valid" ? { background: "var(--red)" } : {}}>
                ⚠️ Valid violation
              </button>
              <button onClick={() => setReviewStatus("invalid")} className={`btn ${reviewStatus === "invalid" ? "btn-primary" : "btn-outline"}`} style={reviewStatus === "invalid" ? { background: "var(--green)" } : {}}>
                ✓ Invalid (false positive)
              </button>
            </div>
          </div>

          {reviewStatus === "valid" && <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">DAM rule <span style={{ color: "var(--red)" }}>*</span> (creates flag automatically)</label>
            <select className="select form-input" value={selDamRule} onChange={e => setSelDamRule(e.target.value)}>
              <option value="">— Select DAM rule —</option>
              {damRules.filter(r => r.name?.startsWith("Coaching Recording")).map(r => {
                const isSuggested = r.id === suggestedRule?.id;
                return <option key={r.id} value={r.id}>{isSuggested ? "⭐ " : ""}{r.name}{isSuggested ? " (suggested)" : ""}</option>;
              })}
            </select>
            {!selDamRule && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>DAM rule is required for valid violations</div>}
          </div>}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Notes <span style={{ color: "var(--red)" }}>*</span></label>
            <textarea className="form-input" rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Explain your decision (required)..." style={{ resize: "vertical", borderColor: !reviewNotes.trim() && reviewStatus ? "var(--red)" : "" }} />
            {!reviewNotes.trim() && reviewStatus && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>Notes are required</div>}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={submitReview} disabled={!reviewStatus || !reviewNotes.trim() || (reviewStatus === "valid" && !selDamRule)}>
              {reviewModal.status !== "pending" ? "Update" : "Confirm"}
            </button>
            <button className="btn btn-outline" onClick={() => setReviewModal(null)}>Cancel</button>
          </div>
        </div>
      </div>;
      })()}

      {el}
    </div>
  );
}

/* ═══ ESCALATIONS PAGE ═══ */
const ESCALATION_CATEGORIES = [
  "Unfair treatment",
  "Communication issues",
  "Workload concerns",
  "Policy violation",
  "Harassment or bullying",
  "Performance evaluation dispute",
  "Schedule or attendance issue",
  "Other",
];

const nameFromEmail = (email) => {
  if (!email) return "—";
  return email.split("@")[0].split(".").map(p => {
    const c = p.replace(/[\d]+$/, "");
    return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
  }).filter(Boolean).join(" ");
};

/* Smart escalation routing — based on WHO you're escalating about:
   Chain of command:  QA → Team Lead → Supervisor → Amanda (QA Manager)
   - About a QA         → route to that QA's team lead (roster manager_email)
   - About a Team Lead  → route to their supervisor (by operational_domain)
   - About a Supervisor  → route to Amanda (QA Manager)
   - About Amanda        → route to Imad (Head of QA) — ONLY exception
   - No person selected  → prompt to select
*/
function smartRoute(aboutEmail, roster, supervisors, allProfiles) {
  const AMANDA = { label: "Amanda Souza (QA Manager)", email: "amanda.souza@tabby.ai" };

  if (!aboutEmail) return { label: "Select a person to determine routing", email: null };

  const ap = aboutEmail.toLowerCase();

  // Only exception: about Amanda → Imad
  if (ap.includes("amanda.souza")) return { label: "Imad Moussa (Head of QA)", email: "imad.moussa@tabby.ai" };

  // Look up person in profiles to get their role
  const profileMatch = allProfiles.find(p => p.email?.toLowerCase() === ap);

  // About a Supervisor or anyone above → route to Amanda
  if (profileMatch && (profileMatch.role === "qa_supervisor" || profileMatch.role === "admin" || profileMatch.role === "super_admin")) return AMANDA;

  // About a Team Lead → route to their supervisor (matched by operational_domain)
  if (profileMatch && profileMatch.role === "qa_lead") {
    const leadDomain = profileMatch.operational_domain || (profileMatch.email?.includes("tabby.sa") ? "tabby.sa" : "tabby.ai");
    const sv = supervisors.find(s => s.operational_domain === leadDomain);
    return sv
      ? { label: `${sv.display_name || nameFromEmail(sv.email)} (Supervisor)`, email: sv.email }
      : AMANDA;
  }

  // About a QA → route to their team lead (from roster manager_email)
  const rosterMatch = roster.find(r => r.email?.toLowerCase() === ap);
  if (rosterMatch && rosterMatch.manager_email) {
    return { label: `${nameFromEmail(rosterMatch.manager_email)} (Team Lead)`, email: rosterMatch.manager_email.toLowerCase() };
  }

  // QA found in profiles but not in roster → fallback to Amanda
  if (profileMatch) return AMANDA;

  // Unknown person → Amanda as fallback
  return AMANDA;
}


function EscalationsPage({ token, profile, gf }) {
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState("my");
  const [roster, setRoster] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [viewEsc, setViewEsc] = useState(null);
  const [responseText, setResponseText] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const { show, el } = useToast();

  // Form state
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [aboutPerson, setAboutPerson] = useState("");
  const [isAnonymous] = useState(true);

  const myEmail = profile?.email?.toLowerCase();
  const myRole = profile?.role || "qa";

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const c = p.replace(/[\d]+$/, "");
      return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const getRouting = () => smartRoute(aboutPerson, roster, supervisors, allProfiles);

  const load = useCallback(async () => {
    try {
      const [e, r, svProfs, profs] = await Promise.all([
        sb.query("escalations", { select: "*", filters: "order=created_at.desc", token }).catch(() => []),
        sb.query("qa_roster", { select: "email,manager_email,queue,display_name", token }).catch(() => []),
        sb.query("profiles", { select: "email,display_name,role,operational_domain", filters: "role=eq.qa_supervisor&status=eq.active", token }).catch(() => []),
        sb.query("profiles", { select: "email,display_name,role,domain", token }).catch(() => []),
      ]);
      setRoster(r);
      setSupervisors(svProfs);
      setAllProfiles(profs);

      // Filter: user sees their own submitted + ones routed to them
      const isAdmin = hasRole(myRole, "admin");
      const filtered = isAdmin ? e : e.filter(x =>
        x.submitted_by?.toLowerCase() === myEmail ||
        x.routed_to?.toLowerCase() === myEmail
      );
      setEscalations(filtered);
    } catch (e) { console.error("Escalations:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const mySubmitted = escalations.filter(e => e.submitted_by?.toLowerCase() === myEmail);
  const routedToMe = escalations.filter(e => {
    return e.routed_to?.toLowerCase() === myEmail && e.submitted_by?.toLowerCase() !== myEmail;
  });

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 5 * 1024 * 1024; // 5MB per file
    const allowed = files.filter(f => f.size <= maxSize);
    if (allowed.length < files.length) show("error", "Some files exceeded 5MB and were skipped");
    setAttachments(prev => [...prev, ...allowed].slice(0, 5)); // max 5 files
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const uploadAttachments = async (escId) => {
    const urls = [];
    for (const file of attachments) {
      const ext = file.name.split(".").pop();
      const path = `${escId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      try {
        const r = await fetch(`${SUPABASE_URL}/storage/v1/object/escalation-attachments/${path}`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
          body: file,
        });
        if (r.ok) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/escalation-attachments/${path}`;
          urls.push({ name: file.name, url: publicUrl, size: file.size, type: file.type });
        }
      } catch (e) { console.error("Upload error:", e); }
    }
    return urls;
  };

  const submitEscalation = async () => {
    if (!aboutPerson) { show("error", "Select the person you're escalating about"); return; }
    if (!category) { show("error", "Select a category"); return; }
    if (!description.trim()) { show("error", "Description is required"); return; }

    const routing = getRouting();
    if (!routing.email) { show("error", "Unable to determine routing — select a valid person"); return; }
    const routedTo = routing.email;

    try {
      setUploading(true);
      // Create escalation first
      const result = await sb.query("escalations", {
        token, method: "POST",
        body: {
          submitted_by: myEmail,
          submitted_role: myRole,
          is_anonymous: isAnonymous,
          about_person: aboutPerson.trim() || null,
          category,
          description: description.trim(),
          routed_to: routedTo,
          status: "open",
          attachments: [],
        },
        select: "id",
      });

      // Upload attachments if any
      if (attachments.length > 0 && result?.[0]?.id) {
        const urls = await uploadAttachments(result[0].id);
        if (urls.length > 0) {
          await sb.query("escalations", {
            token, method: "PATCH",
            body: { attachments: urls },
            filters: `id=eq.${result[0].id}`,
          });
        }
      }

      show("success", `Escalation submitted — routed to ${nameFromEmail(routedTo)}`);
      logActivity(token, profile?.email, "escalation_created", "escalations", null, `Category: ${category}, Routed to: ${routing.email}`);
      setShowForm(false);
      setCategory("");
      setDescription("");
      setAboutPerson("");
      setAttachments([]);
      // Optimistic: reload to get new escalation with ID
      load();
    } catch (e) { show("error", e.message); }
    setUploading(false);
  };

  const submitResponse = async (escId) => {
    if (!responseText.trim()) { show("error", "Response is required"); return; }
    try {
      await sb.query("escalations", {
        token, method: "PATCH",
        body: { response: responseText.trim(), responded_by: myEmail, responded_at: new Date().toISOString(), status: "in_progress" },
        filters: `id=eq.${escId}`,
      });
      show("success", "Response sent");
      setEscalations(prev => prev.map(e => e.id === escId ? { ...e, response: responseText.trim(), responded_by: myEmail, responded_at: new Date().toISOString(), status: "in_progress" } : e));
      setResponseText("");
      setViewEsc(null);
    } catch (e) { show("error", e.message); }
  };

  const resolveEscalation = async (escId) => {
    try {
      await sb.query("escalations", {
        token, method: "PATCH",
        body: { status: "resolved", resolution_note: resolutionNote.trim() || null, resolved_at: new Date().toISOString() },
        filters: `id=eq.${escId}`,
      });
      show("success", "Escalation resolved");
      setEscalations(prev => prev.map(e => e.id === escId ? { ...e, status: "resolved", resolution_note: resolutionNote.trim() || null, resolved_at: new Date().toISOString() } : e));
      setResolutionNote("");
      setViewEsc(null);
    } catch (e) { show("error", e.message); }
  };

  const statusColor = (s) => {
    if (s === "open") return { bg: "var(--red-bg)", color: "var(--red)" };
    if (s === "in_progress") return { bg: "var(--amber-bg)", color: "var(--amber)" };
    if (s === "resolved") return { bg: "var(--green-bg)", color: "var(--green)" };
    return { bg: "var(--bg2)", color: "var(--tx3)" };
  };

  if (loading) return <div className="page"><div className="loading-spinner"><div className="spinner" /></div></div>;

  const routing = getRouting();

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title">Escalations</div>
          <div className="page-subtitle">Raise concerns confidentially to leadership</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Icon d={icons.plus} size={16} />New escalation
        </button>
      </div>

      {/* New Escalation Form */}
      {showForm && <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--accent)" }}>
        <div className="card-header"><span className="card-title">Submit an Escalation</span></div>
        <div style={{ padding: "0 0 16px" }}>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">About (person you're escalating about) <span style={{ color: "var(--red)" }}>*</span></label>
            <SearchableSelect
              options={[
                ...roster.filter(r => r.email?.toLowerCase() !== myEmail).map(r => ({
                  value: r.email, label: `${nameFromEmail(r.email)} — QA`
                })),
                ...allProfiles.filter(p =>
                  (p.role === "qa_lead" || p.role === "qa_supervisor" || p.role === "admin" || p.role === "super_admin")
                  && p.email?.toLowerCase() !== myEmail
                  && !p.email?.toLowerCase().includes("imad.moussa")
                  && !roster.find(rr => rr.email?.toLowerCase() === p.email?.toLowerCase())
                ).map(p => ({
                  value: p.email, label: `${p.display_name || nameFromEmail(p.email)} — ${ROLE_LABELS[p.role] || p.role}`
                }))
              ].sort((a,b) => a.label.localeCompare(b.label))}
              value={aboutPerson}
              onChange={v => setAboutPerson(v)}
              placeholder="Search for a person..."
            />
          </div>

          {/* Live routing display */}
          <div style={{ padding: "10px 14px", background: routing.email ? "var(--bg)" : "var(--amber-bg)", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {routing.email
              ? <><span style={{color:"var(--tx3)"}}>Will be routed to: </span><strong style={{color:"var(--accent)"}}>{routing.label}</strong></>
              : <span style={{color:"var(--amber)"}}>{routing.label}</span>
            }
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Category <span style={{ color: "var(--red)" }}>*</span></label>
            <select className="select form-input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">— Select category —</option>
              {ESCALATION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Description <span style={{ color: "var(--red)" }}>*</span></label>
            <textarea className="form-input" rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue in detail..." style={{ resize: "vertical" }} />
          </div>

          <div style={{ padding: "8px 12px", background: "var(--green-bg)", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "var(--green)" }}>
            All escalations are submitted anonymously — your identity is hidden from the person you're escalating about.
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Attachments <span style={{fontWeight:400,color:"var(--tx3)"}}>(optional, max 5 files, 5MB each)</span></label>
            <label style={{display:"inline-flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:8,border:"1px dashed var(--border)",cursor:"pointer",fontSize:13,color:"var(--tx2)",transition:"border-color .2s"}}>
              <Icon d="M12 5v14M5 12h14" size={16}/>
              Add files
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx" onChange={handleFileSelect} style={{display:"none"}}/>
            </label>
            {attachments.length>0&&<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
              {attachments.map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",background:"var(--bg)",borderRadius:6,fontSize:12}}>
                <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                <span style={{color:"var(--tx3)",flexShrink:0}}>{(f.size/1024).toFixed(0)} KB</span>
                <button onClick={()=>removeAttachment(i)} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",padding:"2px",fontSize:14,lineHeight:1}}>×</button>
              </div>)}
            </div>}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={submitEscalation} disabled={!aboutPerson || !category || !description.trim() || uploading}>
              {uploading ? "Submitting..." : "Submit"}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowForm(false); setAttachments([]); }}>Cancel</button>
          </div>
        </div>
      </div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`tab-btn ${tab === "my" ? "active" : ""}`} onClick={() => setTab("my")}>
          My escalations ({mySubmitted.length})
        </button>
        {(hasRole(myRole, "qa_supervisor") || routedToMe.length > 0) && <button className={`tab-btn ${tab === "inbox" ? "active" : ""}`} onClick={() => setTab("inbox")}>
          Inbox ({routedToMe.filter(e => e.status !== "resolved" && e.status !== "dismissed").length})
        </button>}
        {hasRole(myRole, "admin") && <button className={`tab-btn ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
          All ({escalations.length})
        </button>}
      </div>

      {/* Escalation Cards */}
      {(()=>{
        const list = tab === "inbox" ? routedToMe : tab === "all" ? escalations : mySubmitted;
        if (list.length === 0) return <div className="card"><div className="placeholder" style={{ padding: 40 }}><p style={{ color: "var(--tx3)" }}>{tab === "my" ? "You haven't submitted any escalations." : "No escalations in your inbox."}</p></div></div>;

        return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.map(esc => {
            const sc = statusColor(esc.status);
            const isRoutedToMe = esc.routed_to?.toLowerCase() === myEmail || (hasRole(myRole, "qa_supervisor") && esc.routed_to?.includes("supervisor"));
            const submitterDisplay = esc.is_anonymous && isRoutedToMe && !hasRole(myRole, "admin") ? "Anonymous" : nameFromEmail(esc.submitted_by);

            return <div key={esc.id} className="card" style={{ cursor: "pointer", borderLeft: `4px solid ${sc.color}` }} onClick={() => { setViewEsc(esc); setResponseText(""); setResolutionNote(""); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, background: sc.bg, color: sc.color }}>
                      {esc.status.replace("_", " ")}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)" }}>{esc.category}</span>
                    {esc.is_anonymous && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--bg2)", color: "var(--tx3)" }}>Anonymous</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>
                    {esc.description}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tx3)" }}>
                    From: {submitterDisplay} · About: {esc.about_person || "—"} · {new Date(esc.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                {esc.response && <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 500 }}>Has response</div>}
              </div>
            </div>;
          })}
        </div>;
      })()}

      {/* View/Respond Modal */}
      {viewEsc && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) setViewEsc(null); }}>
        <div className="card" style={{ width: "100%", maxWidth: 600, margin: 20, maxHeight: "80vh", overflow: "auto" }}>
          <div className="card-header">
            <span className="card-title">Escalation Details</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, ...statusColor(viewEsc.status) }}>{viewEsc.status.replace("_", " ")}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13, marginBottom: 16 }}>
            <div><span style={{ color: "var(--tx3)" }}>From: </span><strong>{viewEsc.is_anonymous && !hasRole(myRole, "admin") && viewEsc.submitted_by?.toLowerCase() !== myEmail ? "Anonymous" : nameFromEmail(viewEsc.submitted_by)}</strong>{viewEsc.is_anonymous && <span style={{ fontSize: 10, color: "var(--tx3)", marginLeft: 4 }}>(anonymous)</span>}</div>
            <div><span style={{ color: "var(--tx3)" }}>About: </span><strong>{viewEsc.about_person || "—"}</strong></div>
            <div><span style={{ color: "var(--tx3)" }}>Category: </span><strong>{viewEsc.category}</strong></div>
            <div><span style={{ color: "var(--tx3)" }}>Date: </span>{new Date(viewEsc.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}</div>
            <div><span style={{ color: "var(--tx3)" }}>Routed to: </span>{nameFromEmail(viewEsc.routed_to)}</div>
            <div><span style={{ color: "var(--tx3)" }}>Role: </span>{ROLE_LABELS[viewEsc.submitted_role] || viewEsc.submitted_role}</div>
          </div>

          <div style={{ padding: "12px 16px", background: "var(--bg)", borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
            {viewEsc.description}
          </div>

          {/* Attachments */}
          {viewEsc.attachments && viewEsc.attachments.length > 0 && <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx2)", marginBottom: 6 }}>Attachments ({viewEsc.attachments.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {viewEsc.attachments.map((att, i) => <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg)", borderRadius: 6, fontSize: 12, color: "var(--blue)", textDecoration: "none", border: "1px solid var(--border)" }}>
                <Icon d={att.type?.startsWith("image") ? "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" : "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"} size={14}/>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                <span style={{ color: "var(--tx3)", flexShrink: 0 }}>{att.size ? (att.size / 1024).toFixed(0) + " KB" : ""}</span>
              </a>)}
            </div>
          </div>}

          {/* Response section */}
          {viewEsc.response && <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-text)", marginBottom: 4 }}>Response from {nameFromEmail(viewEsc.responded_by)}</div>
            <div style={{ padding: "12px 16px", background: "var(--green-bg)", borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
              {viewEsc.response}
            </div>
            {viewEsc.responded_at && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>{new Date(viewEsc.responded_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}</div>}
          </div>}

          {/* Resolution */}
          {viewEsc.resolution_note && <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--green)", marginBottom: 4 }}>Resolution</div>
            <div style={{ padding: "12px 16px", background: "var(--green-bg)", borderRadius: 8, fontSize: 13 }}>{viewEsc.resolution_note}</div>
          </div>}

          {/* Actions for receiver */}
          {(viewEsc.routed_to?.toLowerCase() === myEmail || hasRole(myRole, "admin")) && viewEsc.status !== "resolved" && viewEsc.status !== "dismissed" && <>
            {!viewEsc.response && <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Your Response</label>
              <textarea className="form-input" rows={3} value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Respond to this escalation..." style={{ resize: "vertical" }} />
              <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => submitResponse(viewEsc.id)} disabled={!responseText.trim()}>Send Response</button>
            </div>}

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Resolve</label>
              <textarea className="form-input" rows={2} value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} placeholder="Resolution notes (optional)..." style={{ resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" style={{ background: "var(--green)" }} onClick={() => resolveEscalation(viewEsc.id)}>Mark Resolved</button>
                {hasRole(myRole, "admin") && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => {
                  try {
                    await sb.query("escalations", { token, method: "PATCH", body: { status: "dismissed" }, filters: `id=eq.${viewEsc.id}` });
                    show("success", "Dismissed");
                    setViewEsc(null);
                    load();
                  } catch (e) { show("error", e.message); }
                }}>Dismiss</button>}
              </div>
            </div>
          </>}

          {/* Super admin delete */}
          {hasRole(myRole, "super_admin") && <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 12, marginTop: 12 }}>
            <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => {
              if (!confirm("Permanently delete this escalation?")) return;
              try {
                await sb.query("escalations", { token, method: "DELETE", filters: `id=eq.${viewEsc.id}` });
                show("success", "Deleted");
                setViewEsc(null);
                load();
              } catch (e) { show("error", e.message); }
            }}><Icon d={icons.trash} size={14} /> Delete permanently</button>
          </div>}

          <div style={{ marginTop: 16 }}>
            <button className="btn btn-outline" onClick={() => setViewEsc(null)}>Close</button>
          </div>
        </div>
      </div>}

      {el}
    </div>
  );
}

function PlaceholderPage({title,description,icon,minRole,userRole}){const locked=minRole&&!hasRole(userRole,minRole);
  return(<div className="page"><div className="page-header"><div className="page-title">{title}</div></div><div className="card"><div className="placeholder"><div className="placeholder-icon"><Icon d={icon} size={28}/></div><h3>{title}</h3><p>{locked?`Requires ${ROLE_LABELS[minRole]} access or above.`:description}</p><div className="placeholder-badge">{locked?"Access restricted":"Coming soon"}</div></div></div></div>);}

/* ═══ ACTIVITY LOGGER ═══ */
async function logActivity(token, actor, action, targetType, targetId, details) {
  try {
    await sb.query("activity_log", { token, method: "POST", body: { actor_email: actor, action, target_type: targetType || null, target_id: targetId || null, details: details || null } });
  } catch {}
}

/* ═══ NOTIFICATION BELL ═══ */
function NotificationBell({ token, profile, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("notif_dismissed") || "[]"); } catch { return []; }
  });
  const ref = useRef(null);
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSv = hasRole(profile?.role, "qa_supervisor");

  const dismiss = (id) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    localStorage.setItem("notif_dismissed", JSON.stringify(updated));
  };

  const dismissAll = () => {
    const allIds = items.map(i => i.id);
    setDismissed(prev => { const u = [...new Set([...prev, ...allIds])]; localStorage.setItem("notif_dismissed", JSON.stringify(u)); return u; });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const myEmail = profile?.email?.toLowerCase();
        const queries = [
          // Tasks assigned to ME
          sb.query("tasks", { select: "id,title,priority,created_by,eta_date,created_at", filters: `assigned_to=eq.${profile?.email}&status=neq.done&order=created_at.desc&limit=10`, token }).catch(() => []),
          // Escalations routed to ME
          sb.query("escalations", { select: "id,category,status,submitted_by,created_at", filters: `routed_to=eq.${profile?.email}&status=eq.open&order=created_at.desc&limit=10`, token }).catch(() => []),
          // Announcements (everyone gets these)
          sb.query("announcements", { select: "id,title,priority,sent_by,created_at", filters: "order=created_at.desc&limit=5", token }).catch(() => []),
          // Feedback responses to MY feedback (any role)
          sb.query("feedback", { select: "id,category,status,admin_response,created_at", filters: `user_email=eq.${profile?.email}&status=neq.new&order=created_at.desc&limit=5`, token }).catch(() => []),
        ];
        // QA Lead gets violations for THEIR team only, DAM flags, and their APs
        if (isLead && !isSv) {
          queries.push(sb.query("coaching_violations", { select: "id,violation_type,qa_emails,lead_email,created_at", filters: `lead_email=eq.${myEmail}&status=eq.pending&order=created_at.desc&limit=10`, token }).catch(() => []));
          queries.push(sb.query("dam_flags", { select: "id,qa_email,status,created_at,dam_rules(name)", filters: "status=eq.pending&order=created_at.desc&limit=10", token }).catch(() => []));
          queries.push(sb.query("action_plans", { select: "id,qa_email,type,status,end_date,tl_email,created_at", filters: `tl_email=eq.${myEmail}&status=eq.active&order=created_at.desc&limit=10`, token }).catch(() => []));
        }
        // Supervisors see their domain's violations + DAM flags
        if (isSv) {
          queries.push(sb.query("coaching_violations", { select: "id,violation_type,qa_emails,lead_email,created_at", filters: "status=eq.pending&order=created_at.desc&limit=10", token }).catch(() => []));
          queries.push(sb.query("dam_flags", { select: "id,qa_email,status,created_at,dam_rules(name)", filters: "status=eq.pending&order=created_at.desc&limit=10", token }).catch(() => []));
          queries.push(sb.query("action_plans", { select: "id,qa_email,type,status,end_date,tl_email,created_at", filters: "status=eq.active&order=created_at.desc&limit=10", token }).catch(() => []));
        }
        const results = await Promise.all(queries);
        const [assignedTasks, escalations, announcements, myFeedback] = results;
        const violations = (isLead || isSv) ? (results[4] || []) : [];
        const damFlags = (isLead || isSv) ? (results[5] || []) : [];
        const activePlans = (isLead || isSv) ? (results[6] || []) : [];

        const all = [
          ...assignedTasks.map(t => ({ id: "t-"+t.id, type: "task", title: `Task: ${t.title}`, sub: `From: ${t.created_by?.split("@")[0]}${t.eta_date?" · ETA: "+new Date(t.eta_date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"}):""}`, time: t.created_at, page: "dashboard" })),
          ...escalations.map(e => ({ id: "e-"+e.id, type: "escalation", title: `Escalation: ${e.category}`, sub: "Anonymous submission", time: e.created_at, page: "escalations" })),
          ...myFeedback.filter(f => f.admin_response).map(f => ({ id: "fb-"+f.id, type: "feedback", title: `Feedback response: ${f.category}`, sub: `Status: ${f.status}`, time: f.created_at, page: "dashboard" })),
          ...violations.map(v => ({ id: "v-"+v.id, type: "violation", title: `Violation: ${v.violation_type}`, sub: v.qa_emails?.split("\n")[0], time: v.created_at, page: "violations" })),
          ...damFlags.map(f => ({ id: "d-"+f.id, type: "dam", title: `DAM: ${f.dam_rules?.name || "Flag"}`, sub: f.qa_email || "—", time: f.created_at, page: "dam" })),
          ...activePlans.filter(p => {
            if (!p.end_date) return false;
            const daysLeft = (new Date(p.end_date) - new Date()) / (1000*60*60*24);
            return daysLeft <= 7 && daysLeft > -1;
          }).map(p => ({ id: "ap-"+p.id, type: "plan", title: `${p.type.toUpperCase()} ending soon`, sub: `${p.qa_email?.split("@")[0]} — ${Math.ceil((new Date(p.end_date)-new Date())/(1000*60*60*24))} days left`, time: p.created_at, page: "plans" })),
        ].sort((a, b) => new Date(b.time) - new Date(a.time));
        setItems(all);
      } catch {}
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [token, profile?.email]);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const visible = items.filter(i => !dismissed.includes(i.id));
  const count = visible.length;
  const typeColor = { violation: { bg: "var(--red-bg)", color: "var(--red)" }, dam: { bg: "var(--amber-bg)", color: "var(--amber)" }, escalation: { bg: "#EDE9FE", color: "#7C3AED" }, task: { bg: "var(--primary-light)", color: "var(--tabby-purple,#6A2C79)" }, plan: { bg: "var(--amber-bg)", color: "var(--amber)" }, feedback: { bg: "var(--green-bg)", color: "var(--green)" } };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="notif-btn" onClick={() => setOpen(!open)}>
        <Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" size={20} />
        {count > 0 && <span className="notif-badge">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && <div className="notif-dropdown">
        <div className="notif-header">
          <span>Notifications</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{ fontSize: 11, color: "var(--tx3)" }}>{count} pending</span>
            {count > 0 && <button onClick={dismissAll} style={{fontSize:10,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>Clear all</button>}
          </div>
        </div>
        {visible.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>All clear!</div> :
          visible.slice(0, 8).map(item => {
            const tc = typeColor[item.type] || {};
            return <div key={item.id} className="notif-item" style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1,cursor:"pointer"}} onClick={() => { onNavigate(item.page); setOpen(false); dismiss(item.id); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="search-result-type" style={{ background: tc.bg, color: tc.color }}>{item.type}</span>
                  <span style={{ fontWeight: 500, fontSize: 12 }}>{item.title}</span>
                </div>
                <div style={{ color: "var(--tx3)", fontSize: 11, marginTop: 2 }}>{item.sub} · {new Date(item.time).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); dismiss(item.id); }} title="Dismiss" style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:14,padding:"2px",lineHeight:1,flexShrink:0,marginTop:2}}>×</button>
            </div>;
          })
        }
      </div>}
    </div>
  );
}

/* ═══ GLOBAL SEARCH ═══ */
function GlobalSearch({ token, onNavigate, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const q = query.toLowerCase();
        const [profiles, violations, damFlags, escalations] = await Promise.all([
          sb.query("profiles", { select: "id,email,display_name,role", filters: `or=(email.ilike.%${q}%,display_name.ilike.%${q}%)&limit=5`, token }).catch(() => []),
          sb.query("coaching_violations", { select: "id,qa_emails,violation_type,status", filters: `qa_emails.ilike.%${q}%&limit=5`, token }).catch(() => []),
          sb.query("dam_flags", { select: "id,qa_email,dam_rules(name)", filters: `qa_email.ilike.%${q}%&limit=5`, token }).catch(() => []),
          sb.query("escalations", { select: "id,category,about_person,status", filters: `or=(about_person.ilike.%${q}%,category.ilike.%${q}%)&limit=5`, token }).catch(() => []),
        ]);
        const all = [
          ...profiles.map(p => ({ id: p.id, type: "profile", label: p.display_name || p.email, sub: `${ROLE_LABELS[p.role]} · ${p.email}`, page: "admin" })),
          ...violations.map(v => ({ id: v.id, type: "violation", label: v.violation_type, sub: v.qa_emails?.split("\n")[0], page: "violations" })),
          ...damFlags.map(f => ({ id: f.id, type: "dam", label: f.dam_rules?.name || "DAM Flag", sub: f.qa_email, page: "dam" })),
          ...escalations.map(e => ({ id: e.id, type: "escalation", label: e.category, sub: e.about_person || "—", page: "escalations" })),
        ];
        setResults(all);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [query, token]);

  const typeColors = { profile: { bg: "var(--accent-light)", color: "var(--accent-text)" }, violation: { bg: "var(--red-bg)", color: "var(--red)" }, dam: { bg: "var(--amber-bg)", color: "var(--amber)" }, escalation: { bg: "#EDE9FE", color: "#7C3AED" } };

  return (
    <div className="search-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-box">
        <input ref={inputRef} className="search-input" placeholder="Search QAs, violations, flags, escalations..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Escape") onClose(); }} />
        {results.length > 0 && <div className="search-results">
          {results.map(r => {
            const tc = typeColors[r.type] || {};
            return <div key={r.type + r.id} className="search-result" onClick={() => { onNavigate(r.page); onClose(); }}>
              <span className="search-result-type" style={{ background: tc.bg, color: tc.color }}>{r.type}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{r.label}</div>
                <div style={{ fontSize: 11, color: "var(--tx3)" }}>{r.sub}</div>
              </div>
            </div>;
          })}
        </div>}
        {query.length >= 2 && results.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>No results found</div>}
      </div>
    </div>
  );
}

const NAV_ITEMS=[
  {key:"dashboard",label:"Dashboard",icon:icons.dashboard,section:"Overview"},
  {key:"leaderboard",label:"Leaderboard",icon:icons.leaderboard},
  {key:"scores",label:"MPR",icon:icons.scores,section:"Performance"},
  {key:"dam",label:"DAM flags",icon:icons.dam,minRole:"qa_lead"},
  {key:"plans",label:"AP / PIP",icon:icons.plan,minRole:"qa_lead"},
  {key:"coaching",label:"Coaching",icon:icons.coaching,minRole:"qa_lead",section:"Management"},
  {key:"violations",label:"Violations",icon:icons.dam,minRole:"qa_lead"},
  {key:"hr",label:"HR cases",icon:icons.hr,minRole:"qa_supervisor"},
  {key:"escalations",label:"Escalations",icon:icons.escalation},
  {key:"admin",label:"Admin panel",icon:icons.settings,minRole:"admin",section:"System"},
];

/* ═══ APP ═══ */
export default function App(){
  const[session,setSession]=useState(null);const[profile,setProfile]=useState(null);const[loading,setLoading]=useState(true);
  const[page,setPage]=useState(()=>{const h=window.location.hash.replace("#","");return h||"dashboard";});
  const[sidebarOpen,setSidebarOpen]=useState(false);
  const[sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem("sb_collapsed")==="true");
  const[viewAsRole,setViewAsRole]=useState("");
  const[darkMode,setDarkMode]=useState(()=>{const stored=localStorage.getItem("dark_mode");return stored===null?true:stored==="true";});
  const[showSearch,setShowSearch]=useState(false);
  const[globalFilters,setGlobalFilters]=useState({...defaultFilters});
  const[globalRoster,setGlobalRoster]=useState([]);
  const[globalMonths,setGlobalMonths]=useState([]);
  const[pendingAnnouncements,setPendingAnnouncements]=useState([]);
  const[showFeedback,setShowFeedback]=useState(false);
  const[feedbackForm,setFeedbackForm]=useState({category:"general",message:"",rating:0});
  const[feedbackSending,setFeedbackSending]=useState(false);
  const[feedbackSent,setFeedbackSent]=useState(false);
  // Persist page in URL hash
  useEffect(()=>{window.location.hash=page;},[page]);
  useEffect(()=>{const onHash=()=>{const h=window.location.hash.replace("#","");if(h)setPage(h);};window.addEventListener("hashchange",onHash);return()=>window.removeEventListener("hashchange",onHash);},[]);
  // Persist sidebar collapse
  useEffect(()=>{localStorage.setItem("sb_collapsed",sidebarCollapsed);},[sidebarCollapsed]);
  // Dark mode
  useEffect(()=>{document.documentElement.classList.toggle("dark",darkMode);localStorage.setItem("dark_mode",darkMode);},[darkMode]);
  // Keyboard shortcut: Cmd/Ctrl+K for search
  useEffect(()=>{const handler=(e)=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setShowSearch(true);}};document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler);},[]);
  // Auto-refresh JWT every 10 minutes to prevent expiry
  useEffect(()=>{
    if(!session?.refresh_token)return;
    const interval=setInterval(async()=>{
      try{const s=await sb.auth.getSession();if(s){setSession(s);}}catch{}
    },10*60*1000);
    return()=>clearInterval(interval);
  },[session?.refresh_token]);
  // Listen for session refresh from sb.query 401 handler
  useEffect(()=>{
    const handler=(e)=>{if(e.detail)setSession(e.detail);};
    window.addEventListener("session-refreshed",handler);
    return()=>window.removeEventListener("session-refreshed",handler);
  },[]);
  useEffect(()=>{const handler=(e)=>setPage(e.detail);window.addEventListener("navigate",handler);return()=>window.removeEventListener("navigate",handler);},[]);
  useEffect(()=>{(async()=>{let s=await sb.auth.handleCallback();if(!s)s=await sb.auth.getSession();if(s){setSession(s);try{
    // First try by Auth UUID
    let p=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user?.id}`,token:s.access_token});
    // If not found, check by email (pre-created profile from violations/admin)
    if(p.length===0 && s.user?.email){
      const emailProf=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`email=eq.${s.user.email}`,token:s.access_token}).catch(()=>[]);
      if(emailProf.length>0){
        // Update the pre-created profile with the real Auth UUID
        await sb.query("profiles",{token:s.access_token,method:"PATCH",body:{id:s.user.id,display_name:s.user.user_metadata?.full_name||s.user.user_metadata?.name||emailProf[0].display_name,avatar_url:s.user.user_metadata?.avatar_url||null},filters:`email=eq.${s.user.email}`}).catch(()=>{});
        p=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user.id}`,token:s.access_token}).catch(()=>[]);
      }
    }
    if(p.length>0){setProfile(p[0]);}else if(s.user?.id){
    // Auto-create profile for first-time login
    const email=s.user.email||"";const domain=email.endsWith("@tabby.sa")?"tabby.sa":"tabby.ai";
    const name=s.user.user_metadata?.full_name||s.user.user_metadata?.name||email.split("@")[0].split(".").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ");
    try{
      await sb.query("profiles",{token:s.access_token,method:"POST",body:{id:s.user.id,email,display_name:name,role:"qa",domain,operational_domain:domain,status:"active",avatar_url:s.user.user_metadata?.avatar_url||null}});
      const p2=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user.id}`,token:s.access_token});
      if(p2.length>0)setProfile(p2[0]);
    }catch(e){console.error("Auto-create profile:",e);}
  }}catch(e){console.error("Profile:",e);}}setLoading(false);})();},[]);

  // Load global filter data (roster + months)
  useEffect(()=>{if(!session)return;(async()=>{try{
    const[r,m]=await Promise.all([
      sb.query("qa_roster",{select:"email,queue,manager_email",token:session.access_token}).catch(()=>[]),
      sb.query("mtd_scores",{select:"month",token:session.access_token}).catch(()=>[]),
    ]);
    setGlobalRoster(r);
    // Build roster map for global filter team lookups
    const rm = {};
    r.forEach(x => { if (x.email && x.queue) rm[x.email.toLowerCase()] = x.queue; });
    window.__gfRoster = rm;
    const uniqueMonths=sortMonthsDesc([...new Set(m.map(x=>x.month).filter(Boolean))]);
    setGlobalMonths(uniqueMonths);
  }catch(e){console.error("Global filters:",e);}})();},[session]);

  // Load pending announcements that need acknowledgement
  useEffect(()=>{if(!session||!profile)return;(async()=>{try{
    const[anns,acks]=await Promise.all([
      sb.query("announcements",{select:"*",filters:"order=created_at.desc",token:session.access_token}).catch(()=>[]),
      sb.query("announcement_acks",{select:"announcement_id",filters:`user_email=eq.${profile.email}`,token:session.access_token}).catch(()=>[]),
    ]);
    const ackedIds=new Set(acks.map(a=>a.announcement_id));
    const myEmail=profile.email?.toLowerCase();
    const myDomain=profile.domain||profile.operational_domain||"";
    const myQueue=(window.__gfRoster||{})[myEmail]||"";
    const pending=anns.filter(a=>{
      if(ackedIds.has(a.id))return false;
      if(a.target_type==="all")return true;
      if(a.target_type==="domain")return myEmail.endsWith("@"+a.target_value);
      if(a.target_type==="team")return myQueue===a.target_value;
      if(a.target_type==="individual")return myEmail===a.target_value?.toLowerCase();
      return false;
    });
    setPendingAnnouncements(pending);
  }catch(e){console.error("Announcements:",e);}})();},[session,profile]);

  const acknowledgeAnnouncement=async(annId)=>{
    try{
      await sb.query("announcement_acks",{token:session.access_token,method:"POST",body:{announcement_id:annId,user_email:profile.email}});
      setPendingAnnouncements(prev=>prev.filter(a=>a.id!==annId));
    }catch(e){console.error("Ack error:",e);}
  };
  if(loading)return<div className="loading-fullscreen">
    <svg width="200" height="60" viewBox="0 0 200 60" fill="none" className="pulse-line-anim">
      <path d="M0 30 L40 30 L55 8 L75 52 L95 20 L110 30 L200 30" stroke="url(#pulseGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <defs><linearGradient id="pulseGrad" x1="0" y1="0" x2="200" y2="0"><stop offset="0%" stopColor="#3BFF9D"/><stop offset="100%" stopColor="#6A2C79"/></linearGradient></defs>
    </svg>
    <div style={{marginTop:20,fontSize:32,fontWeight:700,color:"#fff",letterSpacing:"-1px"}}>tabby<span style={{background:"linear-gradient(135deg, #3BFF9D, #6A2C79)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Pulse</span></div>
    <p style={{marginTop:6,color:"rgba(255,255,255,.35)",fontSize:12,letterSpacing:"2px",textTransform:"uppercase"}}>QA Performance & Analytics</p>
    <div className="spinner" style={{marginTop:28}}/>
    <p style={{marginTop:16,color:"rgba(255,255,255,.3)",fontSize:12}}>Loading your workspace...</p>
  </div>;
  if(!session)return(<div className="login-page"><div className="login-card">
    <div style={{marginBottom:16,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <svg width="120" height="40" viewBox="0 0 120 40" fill="none"><path d="M0 20 L24 20 L33 5 L45 35 L57 13 L66 20 L120 20" stroke="url(#lgGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><defs><linearGradient id="lgGrad" x1="0" y1="0" x2="120" y2="0"><stop offset="0%" stopColor="#3BFF9D"/><stop offset="100%" stopColor="#6A2C79"/></linearGradient></defs></svg>
      <div style={{fontSize:28,fontWeight:700,color:"#fff",letterSpacing:"-1px"}}>tabby<span style={{background:"linear-gradient(135deg, #3BFF9D, #6A2C79)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Pulse</span></div>
    </div>
    <div className="login-subtitle">QA Performance & Analytics<br/>Sign in with your Tabby Google account.</div>
    <button className="login-btn" onClick={()=>sb.auth.signInWithGoogle()}><GoogleLogo/>Sign in with Google</button>
    <div className="login-divider">Supported domains</div>
    <div className="login-domains"><span className="login-domain">@tabby.ai</span><span className="login-domain">@tabby.sa</span></div>
    <div className="login-footer">Internal tool &middot; Tabby Pulse</div>
  </div></div>);
  const realRole=profile?.role||"qa";
  const userRole=viewAsRole||realRole;
  const effectiveProfile=viewAsRole?{...profile,role:viewAsRole}:profile;
  const isAuditor = userRole === "auditor";
  const visibleNav=NAV_ITEMS.filter(n=>{
    if (n.key === "escalations") return true;
    if (isAuditor) {
      // Auditors see: dashboard, leaderboard, scores, dam, violations, plans, escalations
      return !n.minRole || ["dam","violations","plans"].includes(n.key);
    }
    return !n.minRole || hasRole(userRole, n.minRole);
  });let curSec=null;
  const renderPage=()=>{const t=session.access_token;const p=effectiveProfile;const gf=globalFilters;switch(page){
    case"dashboard":return<DashboardPage profile={p} token={t} gf={gf}/>;
    case"scores":return<ScoreEntryPage token={t} profile={p} gf={gf}/>;
    case"admin":return hasRole(userRole,"admin")?<AdminPage token={t} profile={p} gf={gf}/>:<PlaceholderPage title="Admin panel" icon={icons.settings} minRole="admin" userRole={userRole}/>;
    case"leaderboard":return<LeaderboardPage token={t} profile={p} gf={gf}/>;
    case"dam":return (hasRole(userRole,"qa_lead")||userRole==="auditor")?<DAMPage token={t} profile={p} gf={gf}/>:<PlaceholderPage title="DAM flags" icon={icons.dam} minRole="qa_lead" userRole={userRole}/>;
    case"plans":return (hasRole(userRole,"qa_lead")||userRole==="auditor")?<ActionPlanPage token={t} profile={p} gf={gf}/>:<PlaceholderPage title="Action plans & PIPs" icon={icons.plan} minRole="qa_lead" userRole={userRole}/>;
    case"coaching":return hasRole(userRole,"qa_lead")&&userRole!=="auditor"?<CoachingPage token={t} profile={p} gf={gf}/>:<PlaceholderPage title="Coaching sessions" icon={icons.coaching} minRole="qa_lead" userRole={userRole}/>;
    case"violations":return (hasRole(userRole,"qa_lead")||userRole==="auditor")?<CoachingViolationsPage token={t} profile={p} gf={gf}/>:<PlaceholderPage title="Coaching Violations" icon={icons.dam} minRole="qa_lead" userRole={userRole}/>;
    case"hr":return<PlaceholderPage title="HR cases" description="Disciplinary case tracking." icon={icons.hr} minRole="qa_supervisor" userRole={userRole}/>;
    case"escalations":return<EscalationsPage token={t} profile={p} gf={gf}/>;
    default:return<DashboardPage profile={p} token={t} gf={gf}/>;
  }};
  return(<div className="app-layout">
    <div className={`mobile-overlay ${sidebarOpen?"open":""}`} onClick={()=>setSidebarOpen(false)}/>
    <aside className={`sidebar ${sidebarOpen?"open":""} ${sidebarCollapsed?"collapsed":""}`}>
      <div className="sidebar-header" style={{display:"flex",alignItems:"center",justifyContent:sidebarCollapsed?"center":"space-between"}}>
        <div className="sidebar-brand">{sidebarCollapsed?<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 12 L6 12 L8 5 L12 19 L16 9 L18 12 L22 12" stroke="#3BFF9D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>:<>tabby<span>Pulse</span></>}</div>
        <button className="sidebar-toggle" onClick={()=>setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed?"Expand":"Collapse"}>
          <Icon d={sidebarCollapsed?"M9 5l7 7-7 7":"M15 19l-7-7 7-7"} size={16}/>
        </button>
      </div>
      <nav className="sidebar-nav">{visibleNav.map(item=>{let sh=null;if(item.section&&item.section!==curSec){curSec=item.section;sh=<div className="sidebar-section" key={`s-${item.section}`}>{item.section}</div>;}return(<div key={item.key}>{sh}<button className={`nav-item ${page===item.key?"active":""}`} onClick={()=>{setPage(item.key);setSidebarOpen(false);}} data-tooltip={item.label}><Icon d={item.icon} size={18}/><span className="nav-item-label">{item.label}</span></button></div>);})}</nav>
    </aside>
    <div className="main-content">
      {/* View-as banner for super admin */}
      {viewAsRole && <div className="view-as-bar">
        <span>👁 Viewing as <strong>{ROLE_LABELS[viewAsRole]}</strong></span>
        <button onClick={()=>setViewAsRole("")} style={{background:"var(--amber)",color:"#fff",border:"none",borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"var(--font)"}}>Exit</button>
      </div>}
      <div className="topbar"><button className="topbar-menu" onClick={()=>setSidebarOpen(true)}><Icon d={icons.menu} size={22}/></button><span className="topbar-title">{NAV_ITEMS.find(n=>n.key===page)?.label||"Dashboard"}</span>
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
        {/* Search */}
        <button className="notif-btn" onClick={()=>setShowSearch(true)} title="Search (⌘K)">
          <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" size={18}/>
        </button>
        {/* Notifications */}
        <NotificationBell token={session.access_token} profile={profile} onNavigate={setPage}/>
        {/* Dark mode */}
        <button className="notif-btn" onClick={()=>setDarkMode(!darkMode)} title={darkMode?"Light mode":"Dark mode"}>
          <Icon d={darkMode?"M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z":"M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"} size={18}/>
        </button>
        {/* View-as dropdown for super admin */}
        {realRole==="super_admin"&&!viewAsRole&&<select value={viewAsRole} onChange={e=>setViewAsRole(e.target.value)} style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:"1px solid var(--bd)",background:"var(--bg3)",fontFamily:"var(--font)",color:"var(--tx2)",cursor:"pointer"}}>
          <option value="">View as...</option>
          <option value="qa">QA</option>
          <option value="qa_lead">QA Lead</option>
          <option value="qa_supervisor">QA Supervisor</option>
          <option value="admin">Admin</option>
        </select>}
        <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:8,paddingLeft:12,borderLeft:"1px solid var(--bd)"}}>
          <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",flexShrink:0,cursor:"pointer",position:"relative"}} title="Change profile picture" onClick={()=>document.getElementById("avatar-upload")?.click()}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{width:32,height:32,objectFit:"cover",borderRadius:"50%"}}/> :
            <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg, var(--tabby-purple), var(--tabby-purple-light))",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700}}>{(profile?.display_name||"U").split(" ").map(p=>p[0]).join("").slice(0,2).toUpperCase()}</div>}
          </div>
          <input id="avatar-upload" type="file" accept="image/*" style={{display:"none"}} onChange={async(e)=>{
            const file=e.target.files?.[0]; if(!file)return;
            if(file.size>2*1024*1024){alert("Max 2MB");return;}
            try{
              const ext=file.name.split(".").pop();
              const path=`${profile.id}.${ext}`;
              const formData=new FormData();formData.append("file",file);
              await fetch(`https://shuenqmzbrthiiokfzio.supabase.co/storage/v1/object/avatars/${path}`,{method:"POST",headers:{"Authorization":`Bearer ${session.access_token}`},body:formData});
              const url=`https://shuenqmzbrthiiokfzio.supabase.co/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
              await sb.query("profiles",{token:session.access_token,method:"PATCH",body:{avatar_url:url},filters:`id=eq.${profile.id}`});
              setProfile({...profile,avatar_url:url});
            }catch(err){console.error("Avatar upload:",err);}
            e.target.value="";
          }}/>
          <div style={{display:"flex",flexDirection:"column",lineHeight:1.2}}>
            <span style={{fontSize:13,fontWeight:600,color:"var(--tx)",letterSpacing:"-.2px"}}>{profile?.display_name||"User"}</span>
            <span className={`role-badge role-${viewAsRole||profile?.role}`} style={{fontSize:9,padding:"1px 6px",alignSelf:"flex-start"}}>{ROLE_LABELS[viewAsRole||profile?.role]||"QA"}{viewAsRole?" (viewing)":""}</span>
          </div>
        </div>
        <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:profile?.domain==="tabby.sa"?"rgba(234,88,12,.1)":"rgba(79,70,229,.1)",color:profile?.domain==="tabby.sa"?"#EA580C":"#4F46E5",fontWeight:600}}>{profile?.domain}</span>
        <button onClick={()=>{sb.auth.signOut();setSession(null);setProfile(null);window.location.hash="";}} style={{background:"none",border:"1px solid var(--bd)",borderRadius:8,padding:"5px 12px",fontSize:11,color:"var(--tx3)",cursor:"pointer",fontFamily:"var(--font)",fontWeight:500,transition:"all .2s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--red)";e.currentTarget.style.color="var(--red)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--bd)";e.currentTarget.style.color="var(--tx3)";}}
        >Sign out</button>
      </div>
    </div>
    {/* Global filter bar */}
    <GlobalFilterBar filters={globalFilters} setFilters={setGlobalFilters} months={globalMonths} teams={[]} roster={globalRoster} profile={effectiveProfile} role={userRole}/>
    {/* Search overlay */}
    {showSearch&&<GlobalSearch token={session.access_token} onNavigate={setPage} onClose={()=>setShowSearch(false)}/>}
    {renderPage()}

    {/* ═══ ANNOUNCEMENT POPUP — blocks until acknowledged ═══ */}
    {pendingAnnouncements.length>0&&<div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(8px)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,
      animation:"fadeIn .3s cubic-bezier(.4,0,.2,1)",
    }}>
      <div style={{
        width:"100%",maxWidth:520,margin:20,background:"var(--bg3)",borderRadius:20,
        boxShadow:"0 32px 64px rgba(0,0,0,.4)",border:"1px solid var(--bd)",overflow:"hidden",
      }}>
        {/* Header */}
        <div style={{
          padding:"20px 24px",background:"linear-gradient(135deg, var(--tabby-purple-dark,#4A1B56), var(--tabby-purple,#6A2C79))",
          color:"#fff",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <span style={{fontSize:22}}>📢</span>
            <span style={{fontSize:16,fontWeight:700}}>Announcement</span>
            {pendingAnnouncements.length>1&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.15)",fontWeight:600}}>{pendingAnnouncements.length} messages</span>}
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>From: {pendingAnnouncements[0].sent_by?.split("@")[0].split(".").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ")} · {new Date(pendingAnnouncements[0].created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
        </div>
        {/* Body */}
        <div style={{padding:"24px"}}>
          {(()=>{
            const ann=pendingAnnouncements[0];
            const priorityStyle={urgent:{bg:"var(--red-bg)",color:"var(--red)",label:"URGENT"},important:{bg:"var(--amber-bg)",color:"var(--amber)",label:"IMPORTANT"},normal:{bg:"var(--primary-light)",color:"var(--tabby-purple,#6A2C79)",label:"INFO"}}[ann.priority]||{};
            return <>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
                <span style={{fontSize:10,padding:"3px 10px",borderRadius:8,background:priorityStyle.bg,color:priorityStyle.color,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>{priorityStyle.label}</span>
                {ann.target_type!=="all"&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:8,background:"var(--bg2)",color:"var(--tx3)",fontWeight:600}}>To: {ann.target_type==="domain"?ann.target_value:ann.target_type==="team"?"Team: "+ann.target_value:ann.target_value}</span>}
              </div>
              <h3 style={{fontSize:18,fontWeight:700,marginBottom:12,letterSpacing:"-.3px",lineHeight:1.3}}>{ann.title}</h3>
              <div style={{fontSize:14,color:"var(--tx2)",lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:300,overflowY:"auto"}}>{ann.message}</div>
            </>;
          })()}
        </div>
        {/* Footer — must acknowledge */}
        <div style={{padding:"16px 24px",borderTop:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--tx3)"}}>You must acknowledge to continue</span>
          <button onClick={()=>acknowledgeAnnouncement(pendingAnnouncements[0].id)} style={{
            padding:"10px 24px",borderRadius:10,border:"none",
            background:"var(--tabby-purple,#6A2C79)",color:"#fff",fontSize:13,fontWeight:700,
            cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",
          }}
            onMouseEnter={e=>{e.currentTarget.style.background="var(--tabby-purple-light,#8B4D99)";e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="var(--tabby-purple,#6A2C79)";e.currentTarget.style.transform="translateY(0)";}}
          >I Acknowledge</button>
        </div>
      </div>
    </div>}

    {/* ═══ FEEDBACK FLOATING BUTTON + MODAL ═══ */}
    {!showFeedback&&<button onClick={()=>{setShowFeedback(true);setFeedbackSent(false);setFeedbackForm({category:"general",message:"",rating:0});}} style={{
      position:"fixed",bottom:24,right:24,width:48,height:48,borderRadius:"50%",border:"none",
      background:"var(--tabby-purple,#6A2C79)",color:"#fff",fontSize:20,cursor:"pointer",
      boxShadow:"0 4px 20px rgba(106,44,121,.4)",display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:900,transition:"all .2s",
    }}
      onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.1)";e.currentTarget.style.boxShadow="0 6px 28px rgba(106,44,121,.5)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 4px 20px rgba(106,44,121,.4)";}}
      title="Send feedback"
    >💬</button>}

    {showFeedback&&<div style={{position:"fixed",bottom:24,right:24,width:380,maxHeight:"80vh",background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"0 16px 48px rgba(0,0,0,.25)",zIndex:950,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:"16px 20px",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>💬</span>
          <span style={{fontSize:15,fontWeight:700,letterSpacing:"-.3px"}}>Send Feedback</span>
        </div>
        <button onClick={()=>setShowFeedback(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:18,padding:4}}>✕</button>
      </div>

      {feedbackSent?
        /* Success state */
        <div style={{padding:"40px 20px",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>🎉</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Thank you!</div>
          <div style={{fontSize:13,color:"var(--tx2)"}}>Your feedback has been received. We appreciate you taking the time to help us improve.</div>
          <button onClick={()=>setShowFeedback(false)} className="btn btn-primary" style={{marginTop:20}}>Close</button>
        </div>
      :
        /* Form */
        <div style={{padding:"16px 20px",overflow:"auto"}}>
          {/* Rating */}
          <div style={{marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>How's your experience?</div>
            <div style={{display:"flex",justifyContent:"center",gap:8}}>
              {[1,2,3,4,5].map(star=>(
                <button key={star} onClick={()=>setFeedbackForm({...feedbackForm,rating:star})} style={{
                  background:"none",border:"none",cursor:"pointer",fontSize:28,transition:"transform .15s",
                  transform:feedbackForm.rating>=star?"scale(1.1)":"scale(1)",
                  filter:feedbackForm.rating>=star?"none":"grayscale(1) opacity(0.3)",
                }}>⭐</button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="form-group" style={{marginBottom:12}}>
            <label className="form-label">Category</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[{v:"bug",l:"🐛 Bug",c:"var(--red)"},{v:"feature",l:"💡 Feature Request",c:"var(--blue)"},{v:"improvement",l:"✨ Improvement",c:"var(--amber)"},{v:"general",l:"💬 General",c:"var(--tx3)"}].map(cat=>(
                <button key={cat.v} onClick={()=>setFeedbackForm({...feedbackForm,category:cat.v})} style={{
                  padding:"5px 12px",borderRadius:20,border:"1px solid "+(feedbackForm.category===cat.v?cat.c:"var(--bd)"),
                  background:feedbackForm.category===cat.v?"var(--bg)":"transparent",
                  color:feedbackForm.category===cat.v?cat.c:"var(--tx3)",fontSize:11,fontWeight:600,
                  cursor:"pointer",fontFamily:"var(--font)",transition:"all .15s",
                }}>{cat.l}</button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="form-group" style={{marginBottom:16}}>
            <label className="form-label">Your feedback</label>
            <textarea className="form-input" rows={4} value={feedbackForm.message} onChange={e=>setFeedbackForm({...feedbackForm,message:e.target.value})} placeholder="Tell us what's on your mind... What's working? What could be better?" style={{resize:"vertical",fontSize:13}}/>
          </div>

          {/* Submit */}
          <button disabled={!feedbackForm.message.trim()||feedbackSending} onClick={async()=>{
            setFeedbackSending(true);
            try{
              await sb.query("feedback",{token:session.access_token,method:"POST",body:{
                user_email:profile?.email,user_name:profile?.display_name,
                category:feedbackForm.category,message:feedbackForm.message,
                rating:feedbackForm.rating||null,page:page,
              }});
              setFeedbackSent(true);
            }catch(e){console.error("Feedback error:",e);}
            setFeedbackSending(false);
          }} className="btn btn-primary" style={{width:"100%"}}>
            {feedbackSending?"Sending...":"Send feedback"}
          </button>

          <div style={{fontSize:10,color:"var(--tx3)",textAlign:"center",marginTop:8}}>
            Your name and email will be attached so we can follow up if needed.
          </div>
        </div>
      }
    </div>}

    </div>
  </div>);
}
