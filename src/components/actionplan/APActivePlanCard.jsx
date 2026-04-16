import React, { useState } from "react";
import { hasRole, sortMonthsDesc } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { safeError } from "../../lib/utils.js";
import { Icon, icons } from "../Icons.jsx";
import { useApp } from "../../lib/AppContext.jsx";

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

  const saveManualActuals = async (weekId, targets) => {
    const week = plan.action_plan_weeks?.find(w => w.id === weekId);
    if (!week) return;
    const targetData = safeJson(week.target_data);
    const actualData = {};
    targets.forEach(t => {
      const key = t.kpi_key || t.label;
      const val = manualValues[key];
      if (val !== undefined && val !== "") actualData[key] = parseFloat(val);
    });
    if (Object.keys(actualData).length === 0) { globalToast("error", "Enter at least one value"); return; }
    const metTargets = Object.keys(targetData).every(key => {
      const actual = actualData[key];
      const target = targetData[key];
      if (actual === null || actual === undefined) return true;
      if (target === null || target === undefined || target === "") return true;
      return Number(actual) >= Number(target);
    });
    try {
      await sb.query("action_plan_weeks", {
        token, method: "PATCH",
        body: { actual_data: JSON.stringify(actualData), met_targets: metTargets, updated_at: new Date().toISOString() },
        filters: `id=eq.${weekId}`,
      });
      globalToast("success", "Actuals saved manually");
      setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, actual_data: JSON.stringify(actualData), met_targets: metTargets } : w));
      setEditingWeek(null);
      setManualValues({});
    } catch (e) { globalToast("error", safeError(e)); }
  };

  const prog = getPlanProgress(plan);
  const isExp = expandedPlan === plan.id;
  const targetsData = parseTargets(plan.targets);
  const targets = targetsData.metrics;
  const progressPct = prog.totalWeeks ? (prog.elapsed / prog.totalWeeks) * 100 : 0;
  const daysLeft = plan.end_date ? Math.max(0, Math.ceil((new Date(plan.end_date) - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className="card" style={{
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
                      const met = actual !== null && actual !== undefined && target !== undefined && Number(actual) >= Number(target);
                      const isEditing = editingWeek === week.id;
                      return (
                        <td key={tKey} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "var(--tx3)" }}>T: {target !== undefined ? target + (t.is_custom ? "" : "%") : "—"}</div>
                          {isEditing ? <input type="number" step="0.01" className="form-input" style={{width:60,fontSize:11,padding:"3px 6px",textAlign:"center",fontWeight:600}}
                            placeholder="—" value={manualValues[tKey]??""}
                            onChange={e=>setManualValues(prev=>({...prev,[tKey]:e.target.value}))} /> :
                          hasActuals ? <div style={{ fontSize: 12, fontWeight: 600, color: met ? "var(--green)" : "var(--red)" }}>
                            A: {actual !== null && actual !== undefined ? (typeof actual === "number" ? actual.toFixed(1) + "%" : actual) : "—"}
                          </div> : null}
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
                        <button className="btn btn-primary btn-sm" onClick={()=>saveManualActuals(week.id,targets)} style={{fontSize:10,padding:"2px 8px"}}>Save</button>
                        <button className="btn btn-outline btn-sm" onClick={()=>{setEditingWeek(null);setManualValues({});}} style={{fontSize:10,padding:"2px 6px"}}>✕</button>
                      </div> : <div style={{display:"flex",gap:4,flexDirection:"column"}}>
                        {!hasActuals && <button className="btn btn-outline btn-sm" onClick={() => updateWeekActuals(week.id, plan.qa_email)} style={{ fontSize: 10, padding: "2px 8px" }}>
                          Pull MTD
                        </button>}
                        <button className="btn btn-outline btn-sm" onClick={()=>{setEditingWeek(week.id);setManualValues(hasActuals?{...actualData}:{});}} style={{fontSize:10,padding:"2px 8px",color:"var(--accent-text)"}}>
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

          {hasRole(profile?.role, "super_admin") && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)", marginLeft: "auto" }} onClick={async (e) => {
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
