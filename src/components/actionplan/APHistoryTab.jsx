import React, { useState } from "react";
import { hasRole } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { nameFromEmail, safeError } from "../../lib/utils.js";
import { targetMet, fmtMetricVal } from "../../lib/actionPlan.js";
import { Icon, icons } from "../Icons.jsx";
import { useApp } from "../../lib/AppContext.jsx";
import { useConfirm } from "../../lib/hooks.jsx";
import EmptyState from "../EmptyState.jsx";

function APHistoryTab({ historyPlans, expandedPlan, setExpandedPlan, getPlanProgress, parseTargets, safeJson, setPlans, setWeeks }) {
  const { token, profile, globalToast } = useApp();
  const { ask: confirmAsk, el: confirmEl } = useConfirm();
  const [metricFilter, setMetricFilter] = useState("");

  if (historyPlans.length === 0) {
    return <div className="card"><EmptyState illus="empty" title="No completed plans" description="Once an AP or PIP wraps, it'll move here for the record."/></div>;
  }

  // Distinct target metrics across history (for the filter) + a per-plan
  // helper. A plan can target several metrics, so the filter matches on
  // inclusion (a plan shows if any of its metrics is the selected one).
  const metricOf = (p) => ((parseTargets(p.targets)?.metrics) || []).map(m => m.label || m.name || m.kpi_key).filter(Boolean);
  const allMetrics = [...new Set(historyPlans.flatMap(metricOf))].sort((a, b) => a.localeCompare(b));
  const shownPlans = metricFilter ? historyPlans.filter(p => metricOf(p).includes(metricFilter)) : historyPlans;

  return <div className="card">
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Metric</span>
      <select className="select" value={metricFilter} onChange={e => setMetricFilter(e.target.value)}
        style={{ fontSize: 12, padding: "6px 10px", minWidth: 170 }}>
        <option value="">All metrics</option>
        {allMetrics.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      {metricFilter && <span style={{ fontSize: 11, color: "var(--tx3)" }}>{shownPlans.length} of {historyPlans.length}</span>}
    </div>
    <div className="table-wrap"><table>
      <thead><tr>
        <th>QA Specialist</th>
        <th>Type</th>
        <th>Metric</th>
        <th>Duration</th>
        <th style={{ textAlign: "center" }}>Result</th>
        <th>Created by</th>
        <th>Date range</th>
        <th>Concluded by</th>
        <th>Notes</th>
        {hasRole(profile?.role, "super_admin") && <th></th>}
      </tr></thead>
      <tbody>
        {shownPlans.map(p => {
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
              <td>
                {(() => {
                  const labels = (hMetrics || []).map(m => m.label || m.name || m.kpi_key).filter(Boolean);
                  if (labels.length === 0) return <span style={{ color: "var(--tx3)" }}>—</span>;
                  return <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 220 }}>
                    {labels.map((mname, i) => <span key={i} style={{ padding: "2px 7px", borderRadius: 8, fontSize: 10, fontWeight: 600, background: "var(--bg3)", border: "1px solid var(--bd)", color: "var(--tx2)", whiteSpace: "nowrap" }}>{mname}</span>)}
                  </div>;
                })()}
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
                  confirmAsk(`Delete ${p.type.toUpperCase()}?`,`Permanently delete this plan for ${nameFromEmail(p.qa_email)}?`,async()=>{
                  try {
                    await sb.query("action_plan_weeks", { token, method: "DELETE", filters: `plan_id=eq.${p.id}` });
                    await sb.query("action_plans", { token, method: "DELETE", filters: `id=eq.${p.id}` });
                    globalToast("success", "Plan permanently deleted");
                    setPlans(prev => prev.filter(x => x.id !== p.id));
                    setWeeks(prev => prev.filter(w => w.plan_id !== p.id));
                  } catch (err) { globalToast("error", safeError(err)); }
                },"Delete","var(--red)");}}><Icon d={icons.trash} size={14} /></button>
              </td>}
            </tr>
            {isHistExp && <tr><td colSpan={hasRole(profile?.role, "super_admin") ? 10 : 9} style={{ padding: "16px", background: "var(--bg)" }}>
              {p.reason && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--tx2)" }}>
                <span style={{ fontWeight: 600, color: "var(--tx)" }}>Reason: </span>{p.reason}
              </div>}
              {p.root_cause && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--tx2)" }}>
                <span style={{ fontWeight: 600, color: "var(--tx)" }}>Root cause: </span>{p.root_cause}
              </div>}
              {p.actions && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--tx2)" }}>
                <span style={{ fontWeight: 600, color: "var(--tx)" }}>Actions: </span>{p.actions}
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
                        const met = targetMet(actual, target, t.lower_better);
                        return <td key={tKey} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "var(--tx3)" }}>T: {target != null && target !== "" ? fmtMetricVal(target, t.unit ?? "%") : "—"}</div>
                          {hasA && <div style={{ fontSize: 12, fontWeight: 600, color: met ? "var(--green)" : "var(--red)" }}>A: {actual != null ? fmtMetricVal(actual, t.unit ?? "%") : "—"}</div>}
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
    {confirmEl}
  </div>;
}

export default APHistoryTab;
