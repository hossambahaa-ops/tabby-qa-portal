import React, { useState, useEffect } from "react";
import { sb, dataCache } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { listTeamTargets } from "../../api/teamTargets.js";

const KPI_DEFS = [
  { key: "sbs", label: "SBS", field: "sbs", type: "sum" },
  { key: "non_sbs", label: "Non-SBS", field: "non_sbs", type: "sum" },
  { key: "occupancy", label: "Occupancy", field: "occupancy_pct", type: "avg", pct: true },
  { key: "coaching_completion", label: "Coaching Completion", field: "coaching_completion_pct", type: "avg", pct: true },
  { key: "ontime_coaching", label: "On-time Coaching", field: "ontime_coaching_pct", type: "avg", pct: true },
  { key: "dsat", label: "DSAT", field: "dsat", type: "sum", invert: true },
  { key: "rtr", label: "RTR Score", field: "avg_rtr_score", type: "avg", pct: true },
  { key: "calibration", label: "Calibration", field: "avg_calibration_match_rate", type: "avg", pct: true },
  { key: "observations", label: "Observations", field: "avg_observation_score_pct", type: "avg", pct: true },
  { key: "tickets", label: "Tickets/day", field: "ticket_per_day", type: "avg" },
  { key: "performance", label: "Final Performance", field: "final_performance", type: "avg", pct: true },
];

const TARGET_MAP = {
  sbs: "sbs", non_sbs: "non_sbs", occupancy: "occupancy_pct",
  coaching_completion: "coaching_completion_pct", ontime_coaching: "ontime_coaching_pct",
  dsat: "dsat_max", rtr: "rtr_count", calibration: "calibration_count",
  observations: "observed_coaching_count", tickets: "ticket_per_day", performance: "final_performance",
};

function parseVal(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", ".").replace("%", ""));
  if (isNaN(n)) return null;
  return n;
}

function normPct(v) {
  if (v === null) return null;
  if (v >= 0 && v <= 2) return v * 100;
  return v;
}

function fmtVal(v, pct) {
  if (v === null) return "—";
  if (pct) return normPct(v).toFixed(1) + "%";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function TeamHealth({ teamData, allTeamEmails, qaQueue, qaDomain }) {
  const { token } = useApp();
  const [targets, setTargets] = useState(null);

  useEffect(() => {
    listTeamTargets({ token })
      .then(t => setTargets(t || []));
  }, [token]);

  if (!targets || !teamData.length) return null;

  const findTarget = (metric) => {
    const tgtKey = TARGET_MAP[metric];
    if (!tgtKey) return null;
    const find = (team, dom) => targets.find(t => t.team_name === team && t.domain === dom && t.metric === tgtKey);
    return find(qaQueue, qaDomain) || find(qaQueue, "all") || find("Default", qaDomain) || find("Default", "all");
  };

  const rows = KPI_DEFS.map(kpi => {
    const vals = teamData.map(r => parseVal(r[kpi.field])).filter(v => v !== null);
    if (vals.length === 0) return null;

    let teamAvg;
    if (kpi.type === "sum") {
      teamAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
    } else {
      teamAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    if (kpi.pct) teamAvg = normPct(teamAvg);

    const tgt = findTarget(kpi.key);
    const targetVal = tgt ? parseFloat(tgt.target_value) : null;
    if (targetVal === null) return null;

    let ratio;
    if (kpi.invert) {
      ratio = teamAvg <= targetVal ? 1 : targetVal / teamAvg;
    } else {
      ratio = targetVal > 0 ? teamAvg / targetVal : 1;
    }

    const color = ratio >= 0.9 ? "var(--green)" : ratio >= 0.5 ? "var(--amber)" : "var(--red)";

    const belowCount = teamData.filter(r => {
      const v = parseVal(r[kpi.field]);
      if (v === null) return false;
      const nv = kpi.pct ? normPct(v) : v;
      if (kpi.invert) return nv > targetVal;
      return nv < targetVal;
    }).length;

    return { ...kpi, teamAvg, targetVal, color, belowCount };
  }).filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header"><span className="card-title">Team Health</span><span style={{ fontSize: 11, color: "var(--tx3)" }}>{allTeamEmails.length} QAs · {teamData.length} with data</span></div>
      <div style={{ padding: "0 16px 12px" }}>
        {rows.map(r => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--bd2)", fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--tx)", fontWeight: 500 }}>{r.label}</span>
            <span style={{ fontWeight: 700, color: r.color, minWidth: 55, textAlign: "right" }}>{fmtVal(r.teamAvg, r.pct)}</span>
            <span style={{ color: "var(--tx3)", minWidth: 55, textAlign: "right" }}>/ {fmtVal(r.targetVal, r.pct)}</span>
            {r.belowCount > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", fontWeight: 600, flexShrink: 0 }}>{r.belowCount} below</span>}
            {r.belowCount === 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--green-bg)", color: "var(--green)", fontWeight: 600, flexShrink: 0 }}>all met</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TeamHealth;
