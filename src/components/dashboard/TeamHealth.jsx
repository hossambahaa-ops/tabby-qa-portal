import React, { useState, useEffect } from "react";
import { sb, dataCache } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { listTeamTargets } from "../../api/teamTargets.js";
import { listTasks } from "../../api/tasks.js";
import { listPlans } from "../../api/plans.js";
import { listViolations } from "../../api/violations.js";

const KPI_DEFS = [
  { key: "sbs", label: "SBS", field: "sbs", type: "sum", noTarget: true },
  { key: "non_sbs", label: "Non-SBS", field: "non_sbs", type: "sum", noTarget: true },
  { key: "occupancy", label: "Occupancy", field: "occupancy_pct", type: "avg", pct: true },
  { key: "coaching_completion", label: "Coaching Completion", field: "coaching_completion_pct", type: "avg", pct: true },
  { key: "ontime_coaching", label: "On-time Coaching", field: "ontime_coaching_pct", type: "avg", pct: true },
  { key: "dsat", label: "DSAT", field: "dsat", type: "sum", invert: true },
  { key: "tickets", label: "Tickets/day", field: "ticket_per_day", type: "avg" },
  { key: "performance", label: "Final Performance", field: "final_performance", type: "avg", pct: true },
];

const TARGET_MAP = {
  occupancy: "occupancy_pct",
  coaching_completion: "coaching_completion_pct", ontime_coaching: "ontime_coaching_pct",
  dsat: "dsat_max", tickets: "ticket_per_day", performance: "final_performance",
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
  const [ops, setOps] = useState(null);

  useEffect(() => {
    listTeamTargets({ token })
      .then(t => setTargets(t || []));
  }, [token]);

  // Operational counts for the team — open tasks, pending violations, active APs/PIPs
  useEffect(() => {
    if (!allTeamEmails?.length) { setOps(null); return; }
    const teamSet = new Set(allTeamEmails.map(e => e?.toLowerCase()).filter(Boolean));
    (async () => {
      const [tasks, plans, violations] = await Promise.all([
        listTasks({ token, select: "id,status,assigned_to", filters: "status=neq.done" }),
        listPlans({ token, select: "id,qa_email,status,end_date", filters: "status=eq.active" }),
        listViolations({ token, select: "id,status,qa_emails", filters: "status=eq.pending" }),
      ]);
      const openTasks = (tasks || []).filter(t => t.assigned_to && teamSet.has(t.assigned_to.toLowerCase())).length;
      const activePlans = (plans || []).filter(p => p.qa_email && teamSet.has(p.qa_email.toLowerCase())).length;
      const now = new Date();
      const plansEndingSoon = (plans || []).filter(p => {
        if (!p.qa_email || !teamSet.has(p.qa_email.toLowerCase()) || !p.end_date) return false;
        const d = (new Date(p.end_date) - now) / 86400000;
        return d >= 0 && d <= 7;
      }).length;
      const pendingViolations = (violations || []).filter(v => {
        if (!v.qa_emails) return false;
        const lower = v.qa_emails.toLowerCase();
        for (const em of teamSet) if (em && lower.includes(em)) return true;
        return false;
      }).length;
      setOps({ openTasks, activePlans, plansEndingSoon, pendingViolations });
    })().catch(() => setOps(null));
  }, [token, allTeamEmails?.join("|")]);

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

    if (kpi.noTarget) {
      const total = vals.reduce((a, b) => a + b, 0);
      const teamVal = kpi.type === "sum" ? total : total / vals.length;
      const teamAvg = kpi.pct ? normPct(teamVal) : teamVal;
      const perQa = kpi.type === "sum" && vals.length > 0 ? total / vals.length : null;
      return { ...kpi, teamAvg, targetVal: null, color: "var(--tx)", belowCount: 0, perQa };
    }

    let teamAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
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
            {r.noTarget ? (
              <>
                <span style={{ color: "var(--tx3)", minWidth: 55, textAlign: "right", fontSize: 11 }}>
                  {r.perQa != null ? `${r.perQa.toFixed(1)}/QA` : ""}
                </span>
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--bg2)", color: "var(--tx3)", fontWeight: 600, flexShrink: 0 }}>team total</span>
              </>
            ) : (
              <>
                <span style={{ color: "var(--tx3)", minWidth: 55, textAlign: "right" }}>/ {fmtVal(r.targetVal, r.pct)}</span>
                {r.belowCount > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", fontWeight: 600, flexShrink: 0 }}>{r.belowCount} below</span>}
                {r.belowCount === 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--green-bg)", color: "var(--green)", fontWeight: 600, flexShrink: 0 }}>all met</span>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Team operations strip */}
      {ops && (
        <div style={{ display: "flex", gap: 16, padding: "10px 16px", borderTop: "1px solid var(--bd2)", fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", flexWrap: "wrap" }}>
          <span>Ops:</span>
          <span>Open tasks <strong style={{ color: ops.openTasks > 0 ? "var(--tabby-purple)" : "var(--tx3)", fontWeight: 800 }}>{ops.openTasks}</strong></span>
          <span>Pending violations <strong style={{ color: ops.pendingViolations > 0 ? "var(--amber)" : "var(--tx3)", fontWeight: 800 }}>{ops.pendingViolations}</strong></span>
          <span>Active AP/PIP <strong style={{ color: ops.activePlans > 0 ? "var(--tx)" : "var(--tx3)", fontWeight: 800 }}>{ops.activePlans}</strong></span>
          {ops.plansEndingSoon > 0 && <span>Ending ≤7d <strong style={{ color: "var(--amber)", fontWeight: 800 }}>{ops.plansEndingSoon}</strong></span>}
        </div>
      )}
    </div>
  );
}

export default TeamHealth;
