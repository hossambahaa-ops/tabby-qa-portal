import React from "react";
import { sortMonthsDesc } from "../../lib/constants.js";
import { Icon, icons } from "../Icons.jsx";
import { riyadhTodayStr } from "../../lib/attendancePlan.js";
import { fmtMetricVal } from "../../lib/actionPlan.js";

export default function APCreateForm({
  // State
  selQaEmail,
  planType,
  planDuration,
  planStartDate,
  planReason,
  planRootCause,
  planActions,
  planTargets,
  selectedKpis,
  followUpMode,
  customMetrics,
  loading,
  roster,
  mtd,
  KPI_SLABS,
  // Callbacks
  handleQaEmailChange,
  setPlanType,
  setPlanDuration,
  setPlanStartDate,
  setPlanReason,
  setPlanRootCause,
  setPlanActions,
  setPlanTargets,
  setFollowUpMode,
  setCustomMetrics,
  toggleKpi,
  addCustomMetric,
  removeCustomMetric,
  savePlan,
  onCancel,
  // Helpers
  nameFromEmail,
  parseRaw,
}) {
  return (
    <div>
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
                {matches.map(r => <div key={r.email} onClick={() => handleQaEmailChange(r.email)} style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--bd2)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                    {r.roleLabel && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--accent-text)", background: "var(--accent-light)", padding: "1px 6px", borderRadius: 6 }}>{r.roleLabel}</span>}
                    <span style={{ color: "var(--tx3)", fontSize: 11 }}>{nameFromEmail(r.email)}</span>
                  </span>
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
          <div className="form-group">
            <label className="form-label">Start date</label>
            <input type="date" className="form-input" value={planStartDate || ""} onChange={e => setPlanStartDate(e.target.value)} max={riyadhTodayStr()} />
            <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Defaults to today. Backdate for plans that already started.</div>
          </div>
          <div className="form-group" style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Reason / justification</label>
            <textarea className="form-input" rows={2} value={planReason} onChange={e => setPlanReason(e.target.value)} placeholder="Why is this plan being created? Reference specific KPIs, months, patterns..." style={{ resize: "vertical" }} />
          </div>
          <div className="form-group" style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Root cause</label>
            <textarea className="form-input" rows={2} value={planRootCause || ""} onChange={e => setPlanRootCause(e.target.value)} placeholder="What's driving the gap? The underlying cause of the performance issue — not just the symptom." style={{ resize: "vertical" }} />
          </div>
          <div className="form-group" style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Actions</label>
            <textarea className="form-input" rows={2} value={planActions || ""} onChange={e => setPlanActions(e.target.value)} placeholder="What actions will be taken to reach the target? Steps, coaching, support, checkpoints..." style={{ resize: "vertical" }} />
          </div>
        </div>
      </div>

      {/* KPI selection */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Select KPIs to track</span>
          <span style={{ fontSize: 12, color: "var(--tx3)" }}>Choose which metrics to include in the plan</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
          {Object.entries(KPI_SLABS).map(([key, def]) => {
            const isOn = selectedKpis.includes(key);
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
                {curVal !== null && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Current: {fmtMetricVal(curVal, def.unit ?? "%")}</div>}
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

      {/* Targets table */}
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
                  <td style={{ textAlign: "center", fontWeight: 500, color: (t.current_value !== null && t.thresholds) ? ((t.lower_better ? t.current_value <= t.thresholds[0] : t.current_value >= t.thresholds[0]) ? "var(--green)" : "var(--red)") : "var(--tx3)" }}>
                    {t.current_value !== null ? fmtMetricVal(t.current_value, t.unit ?? "%") : "—"}
                  </td>
                  {Array.from({ length: planDuration }, (_, wi) => (
                    <td key={wi} style={{ textAlign: "center" }}>
                      <input type="number" step="0.1" className="form-input" value={t.weekly_targets[wi] ?? ""} onChange={e => {
                        const newTargets = [...planTargets];
                        const newWeekly = [...newTargets[ti].weekly_targets];
                        newWeekly[wi] = e.target.value === "" ? "" : Number(e.target.value);
                        newTargets[ti] = { ...newTargets[ti], weekly_targets: newWeekly };
                        setPlanTargets(newTargets);
                      }} placeholder={t.unit || "target"} style={{ width: 60, textAlign: "center", padding: "4px 6px", fontSize: 12 }} />
                    </td>
                  ))}
                  <td style={{ textAlign: "center", fontWeight: 600, fontSize: 12, color: avg !== null ? "var(--accent-text)" : "var(--tx3)" }}>
                    {avg !== null ? fmtMetricVal(avg, t.unit ?? "%") : "—"}
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
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
