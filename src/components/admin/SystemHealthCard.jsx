import React, { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";

// One-pane cron health for admins. Replaces the "is the sync working?"
// question that previously required running SQL by hand.
//
// Source of truth: public.cron_health() — a SECURITY DEFINER function
// over cron.job + cron.job_run_details, granted to authenticated.
// Returns last run time, last status, and 24h success/fail counts
// per scheduled job.
//
// Visibility: only renders for admin role and above. The route the
// component lives on (Admin → Audit) already gates that.
const fmtRelative = (iso) => {
  if (!iso) return "never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

const fmtAbsolute = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

// Riyadh-pretty schedule explainer for the common cron forms used
// in this project. Falls back to the raw cron expression for anything
// custom.
const explainSchedule = (s) => {
  if (!s) return "—";
  if (s === "*/5 * * * *")  return "every 5 min";
  if (s === "*/15 * * * *") return "every 15 min";
  if (s === "0 * * * *")    return "hourly (:00)";
  if (s === "5 * * * *")    return "hourly (:05)";
  if (s === "17 * * * *")   return "hourly (:17)";
  if (s === "30 5 * * *")   return "daily · 08:30 KSA";
  if (s === "0 8 * * 0-4")  return "Sun–Thu · 11:00 KSA";
  if (s === "30 8 * * 0-4") return "Sun–Thu · 11:30 KSA (watchdog)";
  if (s === "0 11 * * *")   return "daily · 14:00 KSA";
  if (s === "30 11 * * *")  return "daily · 14:30 KSA (watchdog)";
  if (s === "0 16 * * *")   return "daily · 19:00 KSA";
  return s;
};

const statusPill = (status, failed24h) => {
  if (failed24h > 0) return { label: `⚠ ${failed24h} failed (24h)`, bg: "var(--red-bg)", color: "var(--red)" };
  if (status === "succeeded") return { label: "✓ healthy", bg: "var(--green-bg)", color: "var(--green)" };
  if (status === "failed") return { label: "✗ last failed", bg: "var(--red-bg)", color: "var(--red)" };
  if (status === "running") return { label: "running", bg: "var(--accent-light)", color: "var(--accent-text)" };
  if (!status) return { label: "no runs yet", bg: "var(--bg3)", color: "var(--tx3)" };
  return { label: status, bg: "var(--bg3)", color: "var(--tx3)" };
};

export default function SystemHealthCard() {
  const { token } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    setErr(null);
    try {
      // PostgREST RPC. The function is SECURITY DEFINER + granted
      // to authenticated, so any signed-in user can call it; we
      // still only render this component to admin via AdminPage.
      // (Note: imports are SUPABASE_URL / SUPABASE_ANON from
      // lib/supabase.js — NOT import.meta.env.VITE_* — same pattern
      // every other direct fetch in the app uses. Using the env
      // form 401'd because those Vite-prefixed vars aren't defined.)
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cron_health`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`);
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("cron_health:", e);
      setErr(e?.message || String(e));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);
  // Refresh "relative" labels every 30s without re-fetching.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const totalFailed = rows.reduce((s, r) => s + Number(r.failed_24h || 0), 0);
  const inactiveCount = rows.filter(r => !r.active).length;

  return (
    <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)" }}>System health · cron jobs</div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>
            Last 24h: <strong style={{ color: totalFailed > 0 ? "var(--red)" : "var(--green)" }}>{totalFailed} failed</strong> across {rows.length} job{rows.length === 1 ? "" : "s"}.
            {inactiveCount > 0 && <> · <strong style={{ color: "var(--amber)" }}>{inactiveCount} inactive</strong></>}
          </div>
        </div>
        <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={load}>↻ Refresh</button>
      </div>
      {loading && (
        <div style={{ padding: "8px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {[78, 62, 70, 55].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 14, width: `${w}%`, borderRadius: 6 }}/>
          ))}
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: "var(--red)", padding: 12 }}>Error: {err}</div>}
      {!loading && !err && rows.length === 0 && <div style={{ fontSize: 12, color: "var(--tx3)", padding: 12 }}>No cron jobs scheduled.</div>}
      {!loading && !err && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--bg)", color: "var(--tx3)", textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Job</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Schedule</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Last run</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Status</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>24h success</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>24h fail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = statusPill(r.last_status, Number(r.failed_24h || 0));
                return (
                  <tr key={r.jobname} style={{ borderTop: "1px solid var(--bd2)", opacity: r.active ? 1 : 0.55 }}>
                    <td style={{ padding: "8px 10px", fontWeight: 500, color: "var(--tx)" }}>
                      {r.jobname}
                      {!r.active && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--amber-bg)", color: "var(--amber)", fontWeight: 600 }}>paused</span>}
                    </td>
                    <td style={{ padding: "8px 10px", color: "var(--tx2)" }}>{explainSchedule(r.schedule)}</td>
                    <td style={{ padding: "8px 10px", color: "var(--tx2)" }} title={fmtAbsolute(r.last_run)}>
                      {/* eslint-disable-next-line no-unused-vars */}
                      {(() => { const _ = now; return fmtRelative(r.last_run); })()}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 12, background: pill.bg, color: pill.color, fontSize: 10, fontWeight: 700 }}>{pill.label}</span>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--tx2)", fontVariantNumeric: "tabular-nums" }}>{Number(r.succeeded_24h || 0)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: Number(r.failed_24h || 0) > 0 ? "var(--red)" : "var(--tx3)", fontWeight: Number(r.failed_24h || 0) > 0 ? 700 : 400 }}>{Number(r.failed_24h || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
