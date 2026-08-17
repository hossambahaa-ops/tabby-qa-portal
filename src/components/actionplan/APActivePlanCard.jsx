import React, { useState } from "react";
import { hasRole, sortMonthsDesc } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { safeError } from "../../lib/utils.js";
import { Icon, icons } from "../Icons.jsx";
import { useApp } from "../../lib/AppContext.jsx";
import { riyadhTodayStr } from "../../lib/attendancePlan.js";
import { targetMet, fmtMetricVal } from "../../lib/actionPlan.js";

export default function APActivePlanCard({
  plan,
  expandedPlan,
  setExpandedPlan,
  getPlanProgress,
  parseTargets,
  getAutoRecommendation,
  safeJson,
  updateWeekActuals,
  setConcludingPlan,
  setConclusionOutcome,
  startCreate,
  nameFromEmail,
  mtd,
  pullMonth,
  setPullMonth,
  setPlans,
  setWeeks,
  confirmAsk,
  loading,
}) {
  const { token, profile, globalToast } = useApp();
  const [editingWeek, setEditingWeek] = useState(null); // week id being manually edited
  const [manualValues, setManualValues] = useState({});
  // Separate map for target edits. Lets the lead bump a week's target
  // (e.g., raise the CSAT bar from 90% to 95% mid-plan) without losing
  // their actuals entry. Same edit session writes both at once.
  const [editingTargets, setEditingTargets] = useState({});
  const [editingStartDate, setEditingStartDate] = useState(null); // null | YYYY-MM-DD while super-admin is editing
  const [savingDate, setSavingDate] = useState(false);

  const saveStartDate = async () => {
    if (!editingStartDate) { globalToast("error", "Pick a start date"); return; }
    setSavingDate(true);
    try {
      const targetsData = parseTargets(plan.targets);
      const followUpMode = targetsData.follow_up_mode || "weekly";
      const duration = plan.duration_weeks || 4;
      const perDays = followUpMode === "monthly" ? 30 : 7;
      const newStart = editingStartDate;
      const newStartMs = new Date(newStart + "T00:00:00").getTime();
      const newEnd = new Date(newStartMs + duration * perDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      await sb.query("action_plans", {
        token, method: "PATCH",
        body: { start_date: newStart, end_date: newEnd, updated_at: new Date().toISOString() },
        filters: `id=eq.${plan.id}`,
      });

      // Shift every week's start proportionally
      const planWeeks = prog.planWeeks || [];
      for (const w of planWeeks) {
        const wStart = new Date(newStartMs + (w.week_number - 1) * perDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        await sb.query("action_plan_weeks", {
          token, method: "PATCH",
          body: { week_start: wStart, updated_at: new Date().toISOString() },
          filters: `id=eq.${w.id}`,
        });
      }

      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, start_date: newStart, end_date: newEnd } : p));
      setWeeks(prev => prev.map(w => {
        if (w.plan_id !== plan.id) return w;
        const wStart = new Date(newStartMs + (w.week_number - 1) * perDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        return { ...w, week_start: wStart };
      }));
      globalToast("success", "Plan dates updated");
      setEditingStartDate(null);
    } catch (e) {
      globalToast("error", safeError(e));
    } finally {
      setSavingDate(false);
    }
  };

  const saveManualActuals = async (weekId, targets, week) => {
    if (!week) return;
    // Start from the existing targets, then overlay any edits the lead
    // typed in this session. Lets them tweak just one metric's target
    // without having to retype the others.
    const targetData = { ...safeJson(week.target_data) };
    targets.forEach(t => {
      const key = t.kpi_key || t.label;
      const v = editingTargets[key];
      if (v !== undefined && v !== "") {
        const n = parseFloat(v);
        if (!isNaN(n)) targetData[key] = n;
      }
    });

    const actualData = {};
    targets.forEach(t => {
      const key = t.kpi_key || t.label;
      const val = manualValues[key];
      if (val !== undefined && val !== "") actualData[key] = parseFloat(val);
    });

    // If neither targets nor actuals have any new content, nothing to save.
    const targetsEdited = Object.keys(editingTargets).some(k => editingTargets[k] !== undefined && editingTargets[k] !== "");
    if (Object.keys(actualData).length === 0 && !targetsEdited) {
      globalToast("error", "Enter at least one value");
      return;
    }

    // met_targets re-derives against the (possibly updated) target set.
    const metTargets = Object.keys(targetData).every(key => {
      const metric = targets.find(t => (t.kpi_key || t.label) === key);
      return targetMet(actualData[key], targetData[key], metric?.lower_better);
    });
    try {
      // Build patch body. target_data only sent when the lead changed
      // it, so unrelated saves don't churn the column.
      const body = {
        actual_data: Object.keys(actualData).length > 0 ? JSON.stringify(actualData) : week.actual_data,
        met_targets: metTargets,
        updated_at: new Date().toISOString(),
      };
      if (targetsEdited) body.target_data = JSON.stringify(targetData);

      await sb.query("action_plan_weeks", {
        token, method: "PATCH", body, filters: `id=eq.${weekId}`,
      });
      globalToast("success", targetsEdited ? "Targets and actuals saved" : "Actuals saved manually");
      setWeeks(prev => prev.map(w => w.id === weekId ? {
        ...w,
        actual_data: body.actual_data,
        target_data: targetsEdited ? body.target_data : w.target_data,
        met_targets: metTargets,
      } : w));
      setEditingWeek(null);
      setManualValues({});
      setEditingTargets({});
    } catch (e) { globalToast("error", safeError(e)); }
  };

  const prog = getPlanProgress(plan);
  const isExp = expandedPlan === plan.id;
  const targetsData = parseTargets(plan.targets);
  const targets = targetsData.metrics;
  const progressPct = prog.totalWeeks ? (prog.elapsed / prog.totalWeeks) * 100 : 0;
  const daysLeft = plan.end_date ? Math.max(0, Math.ceil((new Date(plan.end_date) - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  // Drafts raised by the monthly auto-detect job land here as pending_review.
  // They are NOT live against the QA until a human activates them, so the card
  // says so plainly and offers the two ways out: activate, or conclude as
  // non-applicable (which the conclude modal makes require a justification).
  const isDraft = plan.status === "pending_review";
  const activateDraft = async () => {
    if (!(await confirmAsk(`Activate this ${plan.type.toUpperCase()} for ${nameFromEmail(plan.qa_email)}? It becomes live and the QA will see it.`))) return;
    try {
      await sb.query("action_plans", {
        token, method: "PATCH", body: { status: "active" }, filters: `id=eq.${plan.id}`,
      });
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, status: "active" } : p));
      globalToast("success", `${plan.type.toUpperCase()} activated for ${nameFromEmail(plan.qa_email)}`);
    } catch (e) { globalToast("error", safeError(e)); }
  };

  return (
    <div className="card" style={{
      borderLeft: `4px solid ${isDraft ? "var(--tx3)" : plan.type === "pip" ? "var(--red)" : "var(--amber)"}`,
      opacity: isDraft ? 0.94 : 1,
    }}>
      {isDraft && (
        <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 8, background: "var(--bg)", border: "1px dashed var(--bd)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", padding: "2px 8px", borderRadius: 10, background: "var(--amber-bg)", color: "var(--amber)" }}>Draft — needs review</span>
            <span style={{ fontSize: 12, color: "var(--tx2)", flex: 1, minWidth: 180 }}>
              {plan.auto_created ? `Auto-raised from ${plan.source_month || "month-end"} review. ` : ""}Not live yet — activate it, or conclude it as non-applicable.
            </span>
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); activateDraft(); }} disabled={loading}>Activate</button>
            <button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); setConcludingPlan(plan); setConclusionOutcome("non_applicable"); }}>Not applicable</button>
          </div>
          {/* Why this was raised. The banner said a plan existed but never what
              failed, so a lead had to expand the card to judge it. Each chip is
              the KPI that missed, its actual value, and the target it missed. */}
          {targets?.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }} title={plan.reason || ""}>
              <span style={{ fontSize: 10, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 700 }}>Raised for</span>
              {targets.map(t => (
                <span key={t.kpi_key} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "var(--red-bg)", color: "var(--red)", whiteSpace: "nowrap" }}>
                  {t.label} {t.current_value != null ? `${Number(t.current_value).toFixed(1)}${t.unit || ""}` : "—"}
                  <span style={{ color: "var(--tx3)", fontWeight: 500 }}> vs {t.target_value}{t.unit || ""}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
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
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx2)", textTransform: "uppercase", letterSpacing: ".5px" }}>{targetsData.follow_up_mode === "monthly" ? "Monthly" : "Weekly"} tracking</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:"var(--tx3)",fontWeight:500}}>Pull from:</span>
            <select className="form-input" style={{fontSize:11,padding:"3px 8px",width:"auto",minWidth:120}} value={pullMonth} onChange={e=>setPullMonth(e.target.value)}>
              <option value="">Latest month</option>
              {sortMonthsDesc([...new Set(mtd.map(r=>r.month))]).map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
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
                      const met = (actual !== null && actual !== undefined && target !== undefined && target !== "") && targetMet(actual, target, t.lower_better);
                      const isEditing = editingWeek === week.id;
                      return (
                        <td key={tKey} style={{ textAlign: "center" }}>
                          {isEditing ? (
                            <>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600, width: 14 }}>T:</span>
                                <input
                                  type="number" step="0.01" className="form-input"
                                  style={{ width: 56, fontSize: 11, padding: "2px 5px", textAlign: "center", fontWeight: 600, color: "var(--accent-text)" }}
                                  placeholder={target !== undefined ? String(target) : "—"}
                                  value={editingTargets[tKey] ?? (target !== undefined ? String(target) : "")}
                                  onChange={e => setEditingTargets(prev => ({ ...prev, [tKey]: e.target.value }))}
                                  title="Target for this week — editable by the lead. Defaults to the value set at plan creation."
                                />
                              </div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                <span style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600, width: 14 }}>A:</span>
                                <input
                                  type="number" step="0.01" className="form-input"
                                  style={{ width: 56, fontSize: 11, padding: "2px 5px", textAlign: "center", fontWeight: 600 }}
                                  placeholder="—"
                                  value={manualValues[tKey] ?? ""}
                                  onChange={e => setManualValues(prev => ({ ...prev, [tKey]: e.target.value }))}
                                  title="Actual value for this week."
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 11, color: "var(--tx3)" }}>T: {target !== undefined && target !== "" ? fmtMetricVal(target, t.is_custom ? "" : (t.unit ?? "%")) : "—"}</div>
                              {hasActuals && <div style={{ fontSize: 12, fontWeight: 600, color: met ? "var(--green)" : "var(--red)" }}>
                                A: {actual !== null && actual !== undefined ? fmtMetricVal(actual, t.is_custom ? "" : (t.unit ?? "%")) : "—"}
                              </div>}
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "center" }}>
                      {hasActuals && !editingWeek ? (
                        week.met_targets ?
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>✅</span> :
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>❌</span>
                      ) : <span style={{ color: "var(--tx3)" }}>—</span>}
                    </td>
                    <td>
                      {editingWeek === week.id ? <div style={{display:"flex",gap:4}}>
                        <button className="btn btn-primary btn-sm" onClick={()=>saveManualActuals(week.id,targets,week)} style={{fontSize:10,padding:"2px 8px"}}>Save</button>
                        <button className="btn btn-outline btn-sm" onClick={()=>{setEditingWeek(null);setManualValues({});setEditingTargets({});}} style={{fontSize:10,padding:"2px 6px"}}>✕</button>
                      </div> : <div style={{display:"flex",gap:4,flexDirection:"column"}}>
                        {!hasActuals && <button className="btn btn-outline btn-sm" onClick={() => updateWeekActuals(week.id, plan.qa_email)} style={{ fontSize: 10, padding: "2px 8px" }}>
                          Pull MTD
                        </button>}
                        <button className="btn btn-outline btn-sm" onClick={()=>{setEditingWeek(week.id);setManualValues(hasActuals?{...actualData}:{});setEditingTargets({});}} style={{fontSize:10,padding:"2px 8px",color:"var(--accent-text)"}}>
                          {hasActuals?"Edit":"Manual"}
                        </button>
                      </div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn btn-outline btn-sm" style={{ color: "var(--accent-text)" }} onClick={() => {
            window.dispatchEvent(new CustomEvent("navigate", { detail: "quality" }));
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("qc-tab", { detail: "coaching" }));
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("prefill-coaching", { detail: {
                  email: plan.qa_email,
                  type: plan.type === "pip" ? "PIP Review" : "Action Plan Review",
                }}));
              }, 300);
            }, 200);
          }}>
            <Icon d={icons.coaching} size={14} />Send Review Email
          </button>

          <button className="btn btn-outline btn-sm" onClick={() => {
            const title = encodeURIComponent(`${plan.type === "pip" ? "PIP" : "AP"} Review — ${plan.qa_email?.split("@")[0].split(".").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ")}`);
            const details = encodeURIComponent(`${plan.type === "pip" ? "PIP" : "Action Plan"} follow-up meeting.\n\nQA: ${plan.qa_email}\nPlan created: ${new Date(plan.created_at).toLocaleDateString()}`);
            const attendee = encodeURIComponent(plan.qa_email);
            const now = new Date();
            const start = new Date(now.getTime() + 24*60*60*1000);
            start.setHours(10,0,0,0);
            const end = new Date(start.getTime() + 30*60*1000);
            const fmt = (d) => d.toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
            const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${fmt(start)}/${fmt(end)}&add=${attendee}`;
            window.open(url, "_blank");
          }}>
            <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={14} />Schedule Meeting
          </button>

          {prog.planWeeks.some(w => !w.actual_data) && <button className="btn btn-outline btn-sm" onClick={async () => {
            for (const w of prog.planWeeks.filter(w => !w.actual_data)) {
              await updateWeekActuals(w.id, plan.qa_email);
            }
          }}>
            <Icon d={icons.upload} size={14} />Pull all actuals from MTD
          </button>}

          <button className="btn btn-primary btn-sm" onClick={() => {
            setConcludingPlan(plan);
            const rec = getAutoRecommendation(plan);
            setConclusionOutcome(rec || "");
          }}>
            <Icon d={icons.check} size={14} />Conclude {plan.type.toUpperCase()}
          </button>

          {plan.type === "ap" && prog.successRate < 50 && prog.elapsed >= 2 && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={() => startCreate(plan.qa_email, "pip")}>
            <Icon d={icons.dam} size={14} />Escalate to PIP
          </button>}

          {hasRole(profile?.role, "super_admin") && (editingStartDate !== null ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto", padding: "4px 8px", background: "var(--bg)", borderRadius: 6, border: "1px solid var(--bd)" }} onClick={e => e.stopPropagation()}>
              <span style={{ fontSize: 11, color: "var(--tx3)" }}>Start:</span>
              <input type="date" className="form-input" style={{ fontSize: 11, padding: "3px 6px" }} value={editingStartDate} onChange={e => setEditingStartDate(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={savingDate} onClick={saveStartDate} style={{ fontSize: 11, padding: "3px 10px" }}>{savingDate ? "…" : "Save"}</button>
              <button className="btn btn-outline btn-sm" disabled={savingDate} onClick={() => setEditingStartDate(null)} style={{ fontSize: 11, padding: "3px 8px" }}>✕</button>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm" style={{ color: "var(--accent-text)", marginLeft: "auto" }} onClick={e => { e.stopPropagation(); setEditingStartDate(plan.start_date || riyadhTodayStr()); }}>
              <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={14} />Edit dates
            </button>
          ))}

          {hasRole(profile?.role, "super_admin") && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async (e) => {
            e.stopPropagation();
            confirmAsk(`Delete ${plan.type.toUpperCase()}?`,`Permanently delete this plan for ${nameFromEmail(plan.qa_email)}? This cannot be undone.`,async()=>{
            try {
              await sb.query("action_plan_weeks", { token, method: "DELETE", filters: `plan_id=eq.${plan.id}` });
              await sb.query("action_plans", { token, method: "DELETE", filters: `id=eq.${plan.id}` });
              globalToast("success", "Plan permanently deleted");
              setPlans(prev => prev.filter(p => p.id !== plan.id));
              setWeeks(prev => prev.filter(w => w.plan_id !== plan.id));
            } catch (err) { globalToast("error", safeError(err)); }
          },"Delete","var(--red)");}}>
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
}
