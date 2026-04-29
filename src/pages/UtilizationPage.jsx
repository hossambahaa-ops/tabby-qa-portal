import React, { useState, useEffect, useMemo } from "react";
import { sb } from "../lib/supabase.js";
import { hasRole } from "../lib/constants.js";
import { nameFromEmail } from "../lib/utils.js";
import { useApp } from "../lib/AppContext.jsx";
import SkeletonPage from "../components/Skeleton.jsx";

// Returns the date string YYYY-MM-DD for "today" in Asia/Riyadh.
const todayRiyadh = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

// Same shape but for N days ago.
const daysAgoRiyadh = (n) => {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
};

const fmtMinutes = (m) => {
  const n = Number(m) || 0;
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60), mins = n % 60;
  return mins ? `${h}h ${mins}m` : `${h}h`;
};

const fmtRelative = (ts) => {
  if (!ts) return "—";
  const diffSec = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
  return `${Math.floor(diffSec / 86400)} d ago`;
};

const ONLINE_THRESHOLD_MIN = 6;

// Admin-only utilization view: who's actively using the app, how
// long, and which pages they spend time on. Backed by user_activity
// which is one row per (user, Riyadh-day) — see App.jsx heartbeat.
export default function UtilizationPage() {
  const { token, profile } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("today"); // today | week | 30d
  const [refreshAt, setRefreshAt] = useState(Date.now());
  const [expandedUser, setExpandedUser] = useState(null);

  const isAdmin = hasRole(profile?.role, "admin") || hasRole(profile?.role, "qa_supervisor");

  useEffect(() => {
    if (!token || !isAdmin) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const minDate = scope === "today" ? todayRiyadh() : scope === "week" ? daysAgoRiyadh(6) : daysAgoRiyadh(29);
      const data = await sb.query("user_activity", {
        select: "user_email,date,first_seen_at,last_seen_at,total_minutes,page_visits,last_page,user_agent",
        filters: `date=gte.${minDate}&order=last_seen_at.desc`,
        token,
      }).catch(() => []);
      if (!cancelled) {
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, isAdmin, scope, refreshAt]);

  // Auto-tick every 30s so "currently online" stays fresh without a
  // user click. We only re-render — no re-fetch — by bumping a state
  // that the relative-time formatters key off.
  useEffect(() => {
    const id = setInterval(() => setRefreshAt(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const today = todayRiyadh();
    const todayRows = rows.filter(r => r.date === today);
    const cutoff = Date.now() - ONLINE_THRESHOLD_MIN * 60 * 1000;
    const onlineNow = todayRows.filter(r => new Date(r.last_seen_at).getTime() > cutoff).length;
    const uniqueUsers = new Set(rows.map(r => r.user_email)).size;
    const totalMinutes = rows.reduce((a, r) => a + (Number(r.total_minutes) || 0), 0);
    const pageCounts = {};
    rows.forEach(r => {
      const v = r.page_visits || {};
      Object.keys(v).forEach(k => { pageCounts[k] = (pageCounts[k] || 0) + (Number(v[k]) || 0); });
    });
    const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { onlineNow, uniqueUsers, totalMinutes, topPages, todayCount: todayRows.length };
  }, [rows, refreshAt]);

  // Per-user roll-up (across the scope window) so the table doesn't
  // show one row per (user × day) — easier to scan.
  const userRows = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = r.user_email;
      const cur = map.get(k);
      const lastSeen = new Date(r.last_seen_at).getTime();
      // Merge page_visits objects across days
      const mergeVisits = (existing, incoming) => {
        const out = { ...(existing || {}) };
        Object.entries(incoming || {}).forEach(([p, n]) => {
          out[p] = (out[p] || 0) + (Number(n) || 0);
        });
        return out;
      };
      if (!cur) {
        map.set(k, {
          email: r.user_email,
          last_seen_at: r.last_seen_at,
          last_page: r.last_page,
          total_minutes: Number(r.total_minutes) || 0,
          page_visits: { ...(r.page_visits || {}) },
          days: 1,
        });
      } else {
        cur.total_minutes += Number(r.total_minutes) || 0;
        cur.page_visits = mergeVisits(cur.page_visits, r.page_visits);
        cur.days += 1;
        if (lastSeen > new Date(cur.last_seen_at).getTime()) {
          cur.last_seen_at = r.last_seen_at;
          cur.last_page = r.last_page;
        }
      }
    }
    return [...map.values()].sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at));
  }, [rows]);

  if (!isAdmin) {
    return <div className="page"><div className="card" style={{ padding: 32, textAlign: "center", color: "var(--tx3)" }}>Admins only.</div></div>;
  }
  if (loading) return <div className="page"><SkeletonPage /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">App utilization</div>
        <div className="page-subtitle">Who's using the app, when, and where their time goes.</div>
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--bd)", overflow: "hidden", width: "fit-content" }}>
          {[
            { id: "today", label: "Today" },
            { id: "week", label: "Last 7 days" },
            { id: "30d", label: "Last 30 days" },
          ].map(t => (
            <button key={t.id} onClick={() => setScope(t.id)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
              fontFamily: "var(--font)",
              background: scope === t.id ? "var(--tabby-purple)" : "transparent",
              color: scope === t.id ? "#fff" : "var(--tx3)",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: `Online now (≤${ONLINE_THRESHOLD_MIN} min)`, val: stats.onlineNow, color: "var(--green)" },
          { label: "Unique users in window", val: stats.uniqueUsers, color: "var(--tx)" },
          { label: "Active today", val: stats.todayCount, color: "var(--tx)" },
          { label: "Total minutes (window)", val: fmtMinutes(stats.totalMinutes), color: "var(--tx)" },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ padding: "10px 14px" }}>
            <span className="card-title">Users · {scope === "today" ? "today" : scope === "week" ? "last 7 days" : "last 30 days"}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th style={{ textAlign: "right", width: 90 }}>Time</th>
                  <th style={{ textAlign: "right", width: 70 }}>Days</th>
                  <th style={{ width: 110 }}>Last page</th>
                  <th style={{ width: 110 }}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {userRows.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--tx3)" }}>No activity in window.</td></tr>
                )}
                {userRows.map(u => {
                  const online = (Date.now() - new Date(u.last_seen_at).getTime()) < ONLINE_THRESHOLD_MIN * 60 * 1000;
                  const isExpanded = expandedUser === u.email;
                  const pageEntries = Object.entries(u.page_visits || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10);
                  const maxVisits = pageEntries[0]?.[1] || 1;
                  return (
                    <React.Fragment key={u.email}>
                      <tr
                        onClick={() => setExpandedUser(isExpanded ? null : u.email)}
                        style={{ cursor: "pointer", background: isExpanded ? "var(--bg)" : undefined }}
                      >
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: online ? "var(--green)" : "var(--bd2)", flexShrink: 0 }} title={online ? "online now" : "offline"} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{nameFromEmail(u.email)}</div>
                              <div style={{ fontSize: 11, color: "var(--tx3)" }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMinutes(u.total_minutes)}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{u.days}</td>
                        <td style={{ fontSize: 12, color: "var(--tx2)" }}>{u.last_page || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--tx2)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {fmtRelative(u.last_seen_at)}
                            <span style={{ marginLeft: "auto", color: "var(--tx3)", fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: "var(--bg)" }}>
                          <td colSpan={5} style={{ padding: "10px 16px 14px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>
                              Page visits breakdown
                            </div>
                            {pageEntries.length === 0
                              ? <span style={{ fontSize: 12, color: "var(--tx3)" }}>No page visit data.</span>
                              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "6px 20px" }}>
                                  {pageEntries.map(([page, count]) => (
                                    <div key={page}>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                                        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page || "dashboard"}</span>
                                        <span style={{ color: "var(--tx3)", fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: 6 }}>{count}</span>
                                      </div>
                                      <div style={{ height: 4, background: "var(--bd)", borderRadius: 2, overflow: "hidden" }}>
                                        <div style={{ width: `${(count / maxVisits) * 100}%`, height: "100%", background: "var(--tabby-purple)", borderRadius: 2 }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                            }
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ padding: "10px 14px" }}>
            <span className="card-title">Top pages</span>
          </div>
          <div style={{ padding: "8px 14px 14px" }}>
            {stats.topPages.length === 0 && <div style={{ color: "var(--tx3)", fontSize: 12, padding: 12 }}>No page visits in window.</div>}
            {stats.topPages.map(([page, count], i) => {
              const max = stats.topPages[0][1] || 1;
              const pct = (count / max) * 100;
              return (
                <div key={page} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{page || "dashboard"}</span>
                    <span style={{ fontSize: 11, color: "var(--tx3)", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                  </div>
                  <div style={{ width: "100%", height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: i === 0 ? "var(--tabby-purple)" : "var(--accent-light)", transition: "width .3s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
