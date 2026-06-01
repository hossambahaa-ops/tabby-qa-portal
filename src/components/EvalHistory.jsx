import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { callEdgeFunction } from "../lib/edgeSync.js";
import { useApp } from "../lib/AppContext.jsx";
import { PulseLoader } from "./Charts.jsx";
import { riyadhTodayStr } from "../lib/attendancePlan.js";

function isoMonday(d) {
  const dt = new Date(d + "T12:00:00");
  const dow = dt.getDay() || 7; // Mon=1 … Sun=7
  dt.setDate(dt.getDate() - (dow - 1));
  return dt.toISOString().split("T")[0];
}

function isoWeekNum(d) {
  const dt = new Date(d + "T12:00:00");
  const dow = dt.getDay() || 7;
  dt.setDate(dt.getDate() + 4 - dow); // nearest Thursday
  const yearStart = new Date(dt.getFullYear(), 0, 1);
  return Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
}

function fmtDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtWeek(d) {
  const dt = new Date(d + "T00:00:00");
  const end = new Date(dt);
  end.setDate(end.getDate() + 6);
  const wk = isoWeekNum(d);
  return `W${wk}: ${dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function fmtMonth(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, 1);
  return dt.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function EvalHistory({ qaEmail, matchQA, teamTargets = [], qa, qaMtd = [] }) {
  const { token, globalToast } = useApp();
  const [data, setData] = useState(null);
  // Start in the loading state — the auto-load effect kicks in on mount.
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("daily");
  const [refreshing, setRefreshing] = useState(false);
  const today = riyadhTodayStr();
  // Default range: from May 1 (when productivity_history started) to
  // today, so weekly + monthly views show something useful out of the
  // box. The lead can still narrow it via the date picker.
  const defaultFrom = "2026-05-01";
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(today);

  const load = async (from, to) => {
    setLoading(true);
    const f = from || dateFrom;
    const t = to || dateTo;
    try {
      // New source: productivity_history. Started May 2026; one row per
      // (date, qa_email). Has its own occupancy_pct so we don't have to
      // compute it from targets unless that column is null on a row.
      const rows = await sb.query("productivity_history", {
        select: "qa_email,date,sbs,non_sbs,coaching_sessions,side_task_minutes,pending_side_minutes,occupancy_pct",
        filters: `date=gte.${f}&date=lte.${t}&order=date.desc`,
        token,
      });
      const filtered = (rows || []).filter(r => matchQA(r.qa_email));
      setData(filtered.sort((a, b) => a.date.localeCompare(b.date)));
    } catch (e) {
      console.error("EvalHistory:", e);
      globalToast("error", "Failed to load evaluation history");
      setData([]);
    }
    setLoading(false);
  };

  // Auto-load on mount / QA change. Showing the archive immediately
  // matches expectations for day-over-day comparison.
  useEffect(() => {
    if (!qaEmail) { setLoading(false); return; }
    setData(null);
    setLoading(true);
    load(defaultFrom, today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qaEmail]);

  if (loading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><span className="card-title">Evaluation History</span></div>
        <div style={{ padding: 24 }}><PulseLoader /></div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><span className="card-title">Evaluation History</span></div>
        <div style={{ padding: 24, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>No productivity history rows in the selected range.</div>
      </div>
    );
  }

  const num = (v) => parseFloat(v) || 0;

  // Resolve targets for the legacy in-app occupancy fallback. Used
  // only when productivity_history.occupancy_pct is NULL on a row
  // (shouldn't happen post-bootstrap, but keeps the table robust).
  const qaEmailLow = qaEmail?.toLowerCase() || "";
  const qaDomain = qaEmailLow.endsWith("@tabby.sa") ? "tabby.sa" : "tabby.ai";
  const qaQueue = qa?.queue || "Default";
  const findTgt = (metric) => {
    const qaMatch = teamTargets.find(t => t.qa_email?.toLowerCase() === qaEmailLow && t.metric === metric);
    if (qaMatch) return qaMatch;
    const find = (team, dom) => teamTargets.find(t => !t.qa_email && t.team_name === team && t.domain === dom && t.metric === metric);
    return find(qaQueue, qaDomain) || find(qaQueue, "all") || find("Default", qaDomain) || find("Default", "all");
  };
  const whTarget = parseFloat(findTgt("daily_working_hours")?.target_value) || 8;
  const sbsDur = parseFloat(findTgt("sbs_duration_minutes")?.target_value) || 20;
  const nonSbsDur = parseFloat(findTgt("non_sbs_duration_minutes")?.target_value) || 15;
  const coachingDur = parseFloat(findTgt("coaching_duration_minutes")?.target_value) || 30;
  const shiftMins = whTarget * 60;
  const calcOcc = (sbs, nsbs, coaching, side) => {
    const productive = (sbs * sbsDur) + (nsbs * nonSbsDur) + (coaching * coachingDur) + side;
    return shiftMins > 0 ? (productive / shiftMins) * 100 : 0;
  };
  // Source's stored occupancy already includes APPROVED side-task
  // minutes (side_task_minutes column). Pending minutes live in
  // pending_side_minutes and have not yet been counted.
  const occForRow = (r) => {
    if (r?.occupancy_pct != null) return Number(r.occupancy_pct);
    return calcOcc(num(r.sbs), num(r.non_sbs), num(r.coaching_sessions), num(r.side_task_minutes));
  };
  // Contribution to occupancy if `min` more minutes were approved.
  const minutesAsOccPct = (min) => shiftMins > 0 ? (Number(min || 0) / shiftMins) * 100 : 0;
  // Projected occupancy for a single day = current + (pending / shift).
  // Falls back to current when there are no pending minutes.
  const projOccForRow = (r) => occForRow(r) + minutesAsOccPct(num(r.pending_side_minutes));

  // Weekly aggregation — occupancy is AVERAGE of working-day occupancies.
  // pending tallies sum up so the row can show "if approved" projections.
  const weeklyData = (() => {
    const groups = {};
    data.forEach(d => {
      const wk = isoMonday(d.date);
      if (!groups[wk]) groups[wk] = { weekStart: wk, days: 0, workDays: 0, sbs: 0, non_sbs: 0, coaching: 0, side: 0, pending: 0, occSum: 0, projOccSum: 0 };
      groups[wk].days++;
      const daySbs = num(d.sbs), dayNsbs = num(d.non_sbs), dayCoach = num(d.coaching_sessions), daySide = num(d.side_task_minutes), dayPending = num(d.pending_side_minutes);
      groups[wk].sbs += daySbs;
      groups[wk].non_sbs += dayNsbs;
      groups[wk].coaching += dayCoach;
      groups[wk].side += daySide;
      groups[wk].pending += dayPending;
      const dayOcc = occForRow(d);
      if (dayOcc > 0) {
        groups[wk].occSum += dayOcc;
        groups[wk].projOccSum += dayOcc + minutesAsOccPct(dayPending);
        groups[wk].workDays++;
      }
    });
    return Object.values(groups).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  })();

  // MTD lookup keyed by "YYYY-MM" so monthly rows can pull the official
  // working_days + stored occupancy_pct instead of recomputing from
  // productivity_history alone. Without this, monthly occ averaged each
  // day's pct over the count of any-activity days — Hagar's 27 nonzero
  // days drove the average down to 63% while MTD (which uses 15 official
  // working_days) correctly showed 115%.
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mtdByYM = new Map(
    (qaMtd || [])
      .map(m => {
        const parts = (m?.month || "").split("-");
        const idx = MONTHS.indexOf(parts[0]);
        const yr = parts[1];
        if (idx < 0 || !yr) return null;
        return [`${yr}-${String(idx + 1).padStart(2, "0")}`, m];
      })
      .filter(Boolean)
  );
  const mtdOccForKey = (ymKey) => {
    const mtd = mtdByYM.get(ymKey);
    if (!mtd?.occupancy_pct) return null;
    const v = parseFloat(String(mtd.occupancy_pct).replace("%", "").replace(",", "."));
    return isNaN(v) ? null : v;
  };

  // Monthly aggregation — same shape as weekly, keyed by YYYY-MM.
  const monthlyData = (() => {
    const groups = {};
    data.forEach(d => {
      const m = (d.date || "").slice(0, 7);
      if (!m) return;
      if (!groups[m]) groups[m] = { monthStart: m, days: 0, workDays: 0, sbs: 0, non_sbs: 0, coaching: 0, side: 0, pending: 0, occSum: 0, projOccSum: 0 };
      groups[m].days++;
      const daySbs = num(d.sbs), dayNsbs = num(d.non_sbs), dayCoach = num(d.coaching_sessions), daySide = num(d.side_task_minutes), dayPending = num(d.pending_side_minutes);
      groups[m].sbs += daySbs;
      groups[m].non_sbs += dayNsbs;
      groups[m].coaching += dayCoach;
      groups[m].side += daySide;
      groups[m].pending += dayPending;
      const dayOcc = occForRow(d);
      if (dayOcc > 0) {
        groups[m].occSum += dayOcc;
        groups[m].projOccSum += dayOcc + minutesAsOccPct(dayPending);
        groups[m].workDays++;
      }
    });
    return Object.values(groups).sort((a, b) => a.monthStart.localeCompare(b.monthStart));
  })();

  const rows =
    view === "daily"  ? data :
    view === "weekly" ? weeklyData :
                        monthlyData;

  // Chart dimensions per view granularity.
  const barW = view === "daily" ? 16 : view === "weekly" ? 28 : 40;
  const gap  = view === "daily" ? 4  : view === "weekly" ? 8  : 14;
  const chartH = 120;
  const chartW = Math.max(300, rows.length * (barW + gap) + 40);
  const maxTotal = Math.max(
    ...rows.map(r => view === "daily" ? num(r.sbs) + num(r.non_sbs) : r.sbs + r.non_sbs),
    1,
  );

  const TOGGLES = [
    { key: "daily",   label: "Daily" },
    { key: "weekly",  label: "Weekly" },
    { key: "monthly", label: "Monthly" },
  ];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="card-title">Evaluation History</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Manual sync — fires productivity-history-sync on demand so the user
              doesn't have to wait up to 15 min for the next scheduled refresh. */}
          <button
            className="btn btn-outline btn-sm"
            disabled={refreshing}
            title="Pull the latest productivity data from the Google Sheet"
            onClick={async () => {
              if (refreshing) return;
              setRefreshing(true);
              const r = await callEdgeFunction("productivity-history-sync", { token });
              if (!r.ok) {
                globalToast("error", `Sync failed — ${r.error}`);
              } else {
                await load();
                const n = r.data?.rows_upserted ?? "?";
                globalToast("success", `Synced ${n} row${n === 1 ? "" : "s"} — refreshed.`);
              }
              setRefreshing(false);
            }}
            style={{ fontSize: 11, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}
          >
            {refreshing
              ? <><div className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />Refreshing…</>
              : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>Refresh</>}
          </button>
          <div style={{ display: "flex", gap: 4, background: "var(--bg2)", padding: 3, borderRadius: 8 }}>
          {TOGGLES.map(t => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              style={{
                padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600,
                fontFamily: "var(--font)", cursor: "pointer",
                background: view === t.key ? "var(--bg3)" : "transparent",
                color: view === t.key ? "var(--tabby-purple)" : "var(--tx3)",
                boxShadow: view === t.key ? "var(--shadow)" : "none",
              }}
            >{t.label}</button>
          ))}
          </div>
        </div>
      </div>

      {/* Date range picker */}
      <div style={{ padding: "8px 16px 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>From</label>
        <input type="date" className="form-input" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} style={{ padding: "4px 8px", fontSize: 12, width: "auto" }} />
        <label style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>To</label>
        <input type="date" className="form-input" value={dateTo} min={dateFrom} max={today} onChange={e => setDateTo(e.target.value)} style={{ padding: "4px 8px", fontSize: 12, width: "auto" }} />
        <button className="btn btn-primary btn-sm" onClick={() => load()} style={{ fontSize: 11, padding: "4px 12px" }}>Apply</button>
      </div>

      {/* Stacked bar chart */}
      <div style={{ padding: "8px 16px", overflowX: "auto" }}>
        <svg width={chartW} height={chartH + 30} viewBox={`0 0 ${chartW} ${chartH + 30}`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = chartH - pct * (chartH - 20);
            const val = Math.round(maxTotal * pct);
            return <g key={pct}>
              <line x1="30" y1={y} x2={chartW} y2={y} stroke="var(--bd)" strokeWidth="0.5" strokeDasharray="3" />
              {pct > 0 && <text x="26" y={y + 3} textAnchor="end" fill="var(--tx3)" fontSize="8">{val}</text>}
            </g>;
          })}
          {/* Bars */}
          {rows.map((r, i) => {
            const sbs = view === "daily" ? num(r.sbs) : r.sbs;
            const nsbs = view === "daily" ? num(r.non_sbs) : r.non_sbs;
            const total = sbs + nsbs;
            const barH = total > 0 ? (total / maxTotal) * (chartH - 20) : 0;
            const sbsH = total > 0 ? (sbs / total) * barH : 0;
            const nsbsH = barH - sbsH;
            const x = 35 + i * (barW + gap);
            const baseY = chartH;
            const label =
              view === "daily"   ? fmtDate(r.date) :
              view === "weekly"  ? fmtDate(r.weekStart) :
                                   fmtMonth(r.monthStart);
            return <g key={i}>
              {/* Non-SBS (bottom) */}
              <rect x={x} y={baseY - nsbsH} width={barW} height={Math.max(nsbsH, 0)} rx="2" fill="var(--blue)" opacity="0.8" />
              {/* SBS (top) */}
              <rect x={x} y={baseY - barH} width={barW} height={Math.max(sbsH, 0)} rx="2" fill="var(--green)" opacity="0.8" />
              {/* Total label */}
              {total > 0 && <text x={x + barW / 2} y={baseY - barH - 4} textAnchor="middle" fill="var(--tx2)" fontSize="8" fontWeight="600">{total}</text>}
              {/* Date label */}
              <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fill="var(--tx3)" fontSize="7" transform={view === "daily" ? `rotate(-45 ${x + barW / 2} ${chartH + 14})` : ""}>
                {label}
              </text>
            </g>;
          })}
        </svg>
        {/* Legend */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 4, fontSize: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--green)", opacity: 0.8 }} />
            <span style={{ color: "var(--tx2)" }}>SBS</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--blue)", opacity: 0.8 }} />
            <span style={{ color: "var(--tx2)" }}>Non-SBS</span>
          </div>
        </div>
      </div>

      {/* Data table */}
      <div style={{ padding: "8px 16px 16px" }}>
        <div className="table-wrap">
          <table style={{ fontSize: 12 }}>
            <thead><tr>
              <th>{view === "daily" ? "Date" : view === "weekly" ? "Week" : "Month"}</th>
              {view !== "daily" && <th style={{ textAlign: "center" }}>Days</th>}
              <th style={{ textAlign: "center" }}>SBS</th>
              <th style={{ textAlign: "center" }}>Non-SBS</th>
              <th style={{ textAlign: "center" }}>Coaching</th>
              <th style={{ textAlign: "center" }} title="Approved side-task minutes. Already counted toward Occupancy.">Side Tasks</th>
              <th style={{ textAlign: "center" }} title="Side-task minutes logged but not yet approved. NOT counted in Occupancy until approved.">
                Pending <span style={{ fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 6, background: "rgba(245,158,11,0.18)", color: "var(--amber)", verticalAlign: "middle", marginLeft: 2 }}>ST</span>
              </th>
              <th style={{ textAlign: "center" }} title="Current occupancy. Includes approved side-task time.">Occupancy</th>
              <th style={{ textAlign: "center" }} title="Projection if pending side-task minutes were all approved: occupancy + pending / shift × 100.">If approved</th>
              <th style={{ textAlign: "center", fontWeight: 700 }}>Total</th>
            </tr></thead>
            <tbody>
              {(view === "daily" ? [...data].reverse() : view === "weekly" ? [...weeklyData].reverse() : [...monthlyData].reverse()).map((r, i) => {
                const sbs = view === "daily" ? num(r.sbs) : r.sbs;
                const nsbs = view === "daily" ? num(r.non_sbs) : r.non_sbs;
                const coaching = view === "daily" ? num(r.coaching_sessions) : r.coaching;
                const side = view === "daily" ? num(r.side_task_minutes) : r.side;
                // For monthly view, prefer MTD's official occupancy_pct
                // (uses roster-derived working_days, excludes leave /
                // weekends). Falls back to daily-avg if MTD has no row.
                // Weekly stays as daily-avg — MTD doesn't track weeks.
                const mtdOccVal = view === "monthly" ? mtdOccForKey(r.monthStart) : null;
                const occ =
                  view === "daily"   ? occForRow(r) :
                  view === "monthly" ? (mtdOccVal != null ? mtdOccVal : (r.workDays > 0 ? r.occSum / r.workDays : 0)) :
                                       (r.workDays > 0 ? r.occSum / r.workDays : 0);
                const pending =
                  view === "daily" ? num(r.pending_side_minutes) : r.pending;
                // Projection: when we used MTD's official occ, project on
                // top of THAT (not the daily-avg) so the delta is honest.
                const projOcc =
                  view === "daily"   ? projOccForRow(r) :
                  view === "monthly" && mtdOccVal != null
                    ? mtdOccVal + minutesAsOccPct(r.pending)
                    : (r.workDays > 0 ? r.projOccSum / r.workDays : 0);
                const projDelta = projOcc - occ;
                const total = sbs + nsbs;
                const dateLabel =
                  view === "daily"   ? fmtDate(r.date) :
                  view === "weekly"  ? fmtWeek(r.weekStart) :
                                       fmtMonth(r.monthStart);
                return <tr key={i}>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{dateLabel}</td>
                  {view !== "daily" && <td style={{ textAlign: "center", color: "var(--tx3)" }}>{r.days}</td>}
                  <td style={{ textAlign: "center", color: "var(--green)", fontWeight: 600 }}>{sbs || "—"}</td>
                  <td style={{ textAlign: "center", color: "var(--blue)", fontWeight: 600 }}>{nsbs || "—"}</td>
                  <td style={{ textAlign: "center" }}>{coaching || "—"}</td>
                  <td style={{ textAlign: "center" }}>{side || "—"}</td>
                  <td style={{ textAlign: "center", color: pending > 0 ? "var(--amber)" : "var(--tx3)", fontWeight: pending > 0 ? 700 : 400 }}>
                    {pending > 0 ? pending : "—"}
                  </td>
                  <td style={{ textAlign: "center", color: occ >= 95 ? "var(--green)" : occ >= 60 ? "var(--amber)" : occ > 0 ? "var(--red)" : "var(--tx3)", fontWeight: 600 }}>{occ > 0 ? occ.toFixed(1) + "%" : "—"}</td>
                  <td style={{ textAlign: "center", color: pending > 0 ? (projOcc >= 95 ? "var(--green)" : projOcc >= 60 ? "var(--amber)" : "var(--red)") : "var(--tx3)", fontWeight: 600 }}
                      title={pending > 0 ? `+${projDelta.toFixed(1)}% from ${pending} pending min` : "No pending side-task minutes"}>
                    {pending > 0 ? (
                      <>
                        {projOcc.toFixed(1)}%
                        <span style={{ fontSize: 9, color: "var(--amber)", marginLeft: 4 }}>+{projDelta.toFixed(1)}</span>
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: total > 0 ? "var(--tx)" : "var(--tx3)" }}>{total || "—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default EvalHistory;
