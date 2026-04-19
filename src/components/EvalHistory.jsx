import React, { useState } from "react";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";
import { PulseLoader } from "./Charts.jsx";

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

function EvalHistory({ qaEmail, matchQA, teamTargets = [], qa }) {
  const { token, globalToast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("daily");
  const today = new Date().toISOString().split("T")[0];
  const thirtyAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; })();
  const [dateFrom, setDateFrom] = useState(thirtyAgo);
  const [dateTo, setDateTo] = useState(today);

  const load = async (from, to) => {
    setLoading(true);
    const f = from || dateFrom;
    const t = to || dateTo;
    try {
      const rows = await sb.query("daily_scores", {
        select: "qa_email,date,sbs,non_sbs,coaching_sessions,side_task_minutes,occupancy_pct",
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

  if (!data && !loading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title">Evaluation History</span>
        </div>
        <div style={{ padding: "24px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--tx3)", marginBottom: 12 }}>Load the last 30 days of daily evaluation data</div>
          <button className="btn btn-outline" onClick={() => load()}>View History</button>
        </div>
      </div>
    );
  }

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
        <div style={{ padding: 24, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>No daily scores found in the last 30 days</div>
      </div>
    );
  }

  const num = (v) => parseFloat(v) || 0;

  // Resolve targets for in-app occupancy calculation
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

  // Weekly aggregation
  const weeklyData = (() => {
    const groups = {};
    data.forEach(d => {
      const wk = isoMonday(d.date);
      if (!groups[wk]) groups[wk] = { weekStart: wk, days: 0, sbs: 0, non_sbs: 0, coaching: 0, side: 0, occ: 0 };
      groups[wk].days++;
      groups[wk].sbs += num(d.sbs);
      groups[wk].non_sbs += num(d.non_sbs);
      groups[wk].coaching += num(d.coaching_sessions);
      groups[wk].side += num(d.side_task_minutes);
      groups[wk].occ += num(d.occupancy_pct);
    });
    return Object.values(groups).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  })();

  const rows = view === "daily" ? data : weeklyData;

  // Chart dimensions
  const barW = view === "daily" ? 16 : 28;
  const gap = view === "daily" ? 4 : 8;
  const chartH = 120;
  const chartW = Math.max(300, rows.length * (barW + gap) + 40);
  const maxTotal = Math.max(...rows.map(r => view === "daily" ? num(r.sbs) + num(r.non_sbs) : r.sbs + r.non_sbs), 1);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="card-title">Evaluation History</span>
        <div style={{ display: "flex", gap: 4, background: "var(--bg2)", padding: 3, borderRadius: 8 }}>
          <button onClick={() => setView("daily")} style={{
            padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600,
            fontFamily: "var(--font)", cursor: "pointer",
            background: view === "daily" ? "var(--bg3)" : "transparent",
            color: view === "daily" ? "var(--tabby-purple)" : "var(--tx3)",
            boxShadow: view === "daily" ? "var(--shadow)" : "none",
          }}>Daily</button>
          <button onClick={() => setView("weekly")} style={{
            padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600,
            fontFamily: "var(--font)", cursor: "pointer",
            background: view === "weekly" ? "var(--bg3)" : "transparent",
            color: view === "weekly" ? "var(--tabby-purple)" : "var(--tx3)",
            boxShadow: view === "weekly" ? "var(--shadow)" : "none",
          }}>Weekly</button>
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
            return <g key={i}>
              {/* Non-SBS (bottom) */}
              <rect x={x} y={baseY - nsbsH} width={barW} height={Math.max(nsbsH, 0)} rx="2" fill="var(--blue)" opacity="0.8" />
              {/* SBS (top) */}
              <rect x={x} y={baseY - barH} width={barW} height={Math.max(sbsH, 0)} rx="2" fill="var(--green)" opacity="0.8" />
              {/* Total label */}
              {total > 0 && <text x={x + barW / 2} y={baseY - barH - 4} textAnchor="middle" fill="var(--tx2)" fontSize="8" fontWeight="600">{total}</text>}
              {/* Date label */}
              <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fill="var(--tx3)" fontSize="7" transform={view === "daily" ? `rotate(-45 ${x + barW / 2} ${chartH + 14})` : ""}>
                {view === "daily" ? fmtDate(r.date) : fmtDate(r.weekStart)}
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
              <th>{view === "daily" ? "Date" : "Week"}</th>
              {view === "weekly" && <th style={{ textAlign: "center" }}>Days</th>}
              <th style={{ textAlign: "center" }}>SBS</th>
              <th style={{ textAlign: "center" }}>Non-SBS</th>
              <th style={{ textAlign: "center" }}>Coaching</th>
              <th style={{ textAlign: "center" }}>Side Tasks</th>
              <th style={{ textAlign: "center" }}>Occupancy</th>
              <th style={{ textAlign: "center", fontWeight: 700 }}>Total</th>
            </tr></thead>
            <tbody>
              {(view === "daily" ? [...data].reverse() : [...weeklyData].reverse()).map((r, i) => {
                const sbs = view === "daily" ? num(r.sbs) : r.sbs;
                const nsbs = view === "daily" ? num(r.non_sbs) : r.non_sbs;
                const coaching = view === "daily" ? num(r.coaching_sessions) : r.coaching;
                const side = view === "daily" ? num(r.side_task_minutes) : r.side;
                const occ = calcOcc(sbs, nsbs, coaching, side);
                const total = sbs + nsbs;
                return <tr key={i}>
                  <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                    {view === "daily" ? fmtDate(r.date) : fmtWeek(r.weekStart)}
                  </td>
                  {view === "weekly" && <td style={{ textAlign: "center", color: "var(--tx3)" }}>{r.days}</td>}
                  <td style={{ textAlign: "center", color: "var(--green)", fontWeight: 600 }}>{sbs || "—"}</td>
                  <td style={{ textAlign: "center", color: "var(--blue)", fontWeight: 600 }}>{nsbs || "—"}</td>
                  <td style={{ textAlign: "center" }}>{coaching || "—"}</td>
                  <td style={{ textAlign: "center" }}>{side || "—"}</td>
                  <td style={{ textAlign: "center", color: occ >= 95 ? "var(--green)" : occ >= 60 ? "var(--amber)" : occ > 0 ? "var(--red)" : "var(--tx3)", fontWeight: 600 }}>{occ > 0 ? occ.toFixed(1) + "%" : "—"}</td>
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
