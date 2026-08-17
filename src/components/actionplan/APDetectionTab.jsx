import React, { useState } from "react";
import { hasRole } from "../../lib/constants.js";
import { Icon, icons } from "../Icons.jsx";
import { useApp } from "../../lib/AppContext.jsx";
import Modal from "../Modal.jsx";
import EmptyState from "../EmptyState.jsx";

export default function APDetectionTab({
  detections,
  startCreate,
  dismissDetectionDB,
  nameFromEmail,
  initialsFromEmail,
  scoreColor,
  // Rendered inside the Active view now, which has its own empty state — so
  // when there is nothing detected this renders nothing at all rather than
  // stacking a second "all clear" card above the running plans.
  embedded = false,
}) {
  const { profile } = useApp();
  const [dismissModalAP, setDismissModalAP] = useState(null);
  const [dismissReasonAP, setDismissReasonAP] = useState("");
  // "dismiss" = not now; "na" = this QA should not get a plan for this month.
  // Non-applicable ALWAYS requires a justification, for every role — a
  // super_admin can dismiss without a reason, but never mark N/A without one.
  const [dismissModeAP, setDismissModeAP] = useState("dismiss");
  const isNAMode = dismissModeAP === "na";
  const openModal = (d, mode) => { setDismissModalAP(d); setDismissModeAP(mode); setDismissReasonAP(""); };
  const closeModal = () => { setDismissModalAP(null); setDismissReasonAP(""); setDismissModeAP("dismiss"); };

  return (
    <div>
      {detections.length === 0 ? (
        embedded ? null :
        <div className="card"><EmptyState tone="good" illus="check" title="No auto-detections" description='No QAs currently need an Action Plan. AP/PIP detection is triggered by DAM escalation steps with "includes PIP" enabled.'/></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: embedded ? 16 : 0 }}>
          <div style={{ padding: "10px 14px", background: "var(--amber-bg)", borderRadius: 8, fontSize: 13, color: "var(--amber)", fontWeight: 500 }}>
            ⚠️ {detections.length} QA specialist{detections.length !== 1 ? "s" : ""} flagged for potential Action Plan. Review and confirm below.
          </div>
          {detections.map(d => (
            <div key={d.email} className="card" style={{
              borderLeft: `4px solid ${d.severity === "critical" ? "var(--red)" : d.severity === "warning" ? "var(--amber)" : "var(--blue)"}`,
            }}>
              {/* Same review banner as an auto-raised draft plan: a status pill,
                  what it is, and the decisions on the right. Detected candidates
                  and pending_review drafts now sit in one list, so they read as
                  the same kind of thing — something waiting on your call. */}
              <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 8, background: "var(--bg)", border: "1px dashed var(--bd)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", padding: "2px 8px", borderRadius: 10, background: "var(--amber-bg)", color: "var(--amber)" }}>Needs review</span>
                  <span style={{ fontSize: 12, color: "var(--tx2)", flex: 1, minWidth: 180 }}>
                    {d.latestMonth ? `Detected from ${d.latestMonth} review. ` : "Detected from performance review. "}
                    {d.planType ? "No plan yet — create it, or mark it non-applicable." : "Handle the DAM action below, then dismiss."}
                  </span>
                  {d.planType && (
                    <button className="btn btn-primary btn-sm" onClick={() => startCreate(d.email, d.planType)} style={d.planType === "pip" ? { background: "var(--red)", color: "#fff" } : {}}>
                      <Icon d={d.planType === "pip" ? icons.dam : icons.plan} size={14} />
                      Create {d.planType.toUpperCase()}{d.pipActionType === "extension" ? " (extension)" : ""}
                    </button>
                  )}
                  {/* EGY escape hatch — PIP recommended but a lead may choose AP.
                      KSA never gets PIP, so it is hidden there. */}
                  {d.planType === "pip" && d.domain === "tabby.ai" && (
                    <button className="btn btn-outline btn-sm" onClick={() => startCreate(d.email, "ap")}>Create AP instead</button>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => openModal(d, "na")}
                          title="No AP/PIP should be run for this QA this month — records a justification">
                    Not applicable
                  </button>
                  {hasRole(profile?.role, "super_admin") ?
                    <button className="btn btn-outline btn-sm" onClick={() => dismissDetectionDB(d.email, "", "dismissed")}>Dismiss</button> :
                    <button className="btn btn-outline btn-sm" onClick={() => openModal(d, "dismiss")}>Dismiss</button>
                  }
                </div>
                {/* Why it fired — same "Raised for" chip row as a draft plan. */}
                {d.kpis?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }} title={d.reason || ""}>
                    <span style={{ fontSize: 10, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 700 }}>Raised for</span>
                    {d.kpis.map(k => (
                      <span key={k.key} style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap",
                        background: k.slab.slab === 0 ? "var(--red-bg)" : k.slab.slab === 1 ? "var(--amber-bg)" : "var(--green-bg)",
                        color: k.slab.slab === 0 ? "var(--red)" : k.slab.slab === 1 ? "var(--amber)" : "var(--green)",
                      }}>
                        {k.label} {k.rawPct !== null ? k.rawPct.toFixed(1) + "%" : "—"}
                        <span style={{ color: "var(--tx3)", fontWeight: 500 }}> · {k.slab.label}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
                    {initialsFromEmail(d.email)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: "var(--tx3)" }}>{d.email} · TL: {d.tl ? nameFromEmail(d.tl) : "—"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                    background: d.severity === "critical" ? "var(--red-bg)" : d.severity === "warning" ? "var(--amber-bg)" : "var(--green-bg)",
                    color: d.severity === "critical" ? "var(--red)" : d.severity === "warning" ? "var(--amber)" : "var(--green)",
                  }}>{d.severity.toUpperCase()}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(d.totalScore) }}>
                    {d.totalScore.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--tx3)" }}> / 55</span>
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, color: "var(--tx2)" }}>
                {d.reason}
              </div>

              {/* KPI breakdown now lives in the "Raised for" row of the banner
                  above, alongside the actions it justifies. */}

              {/* Nudge: this QA already has an active AP/PIP. Shown
                  ABOVE the DAM action label so the lead sees it
                  first and doesn't open a duplicate. Doesn't block
                  — they may still want to file a new one if the
                  rules say so, but they'll do it deliberately. */}
              {d.existingPlan && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--amber-bg)", borderRadius: 6, fontSize: 12, color: "var(--amber)", border: "1px solid var(--amber)", fontWeight: 500, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  📌
                  <span style={{ color: "var(--tx)", flex: 1, minWidth: 0 }}>
                    Already on an active <strong>{(d.existingPlan.type || "AP").toUpperCase()}</strong>
                    {d.existingPlan.end_date && (
                      <> · ends <strong>{new Date(d.existingPlan.end_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</strong></>
                    )}
                    {/* Partial-overlap context — which KPIs the plan
                        already covers vs which are new this month. */}
                    {(d.existingPlan.coveredKpiNames?.length > 0 || d.existingPlan.newKpiNames?.length > 0) && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--tx2)", fontWeight: 400 }}>
                        {d.existingPlan.coveredKpiNames?.length > 0 && (
                          <span>Covered by plan: <strong style={{ color: "var(--tx)" }}>{d.existingPlan.coveredKpiNames.join(", ")}</strong>. </span>
                        )}
                        {d.existingPlan.newKpiNames?.length > 0 && (
                          <span>Not covered: <strong style={{ color: "var(--red)" }}>{d.existingPlan.newKpiNames.join(", ")}</strong> — needs a new intervention.</span>
                        )}
                      </div>
                    )}
                  </span>
                </div>
              )}
              {/* Per-DAM action label — exact string from the
                  dam_escalation_steps table. Includes the verbal
                  warning prefix at occurrence 1, written/final
                  warning + deduction days at later occurrences. */}
              {d.damActionLabel && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--bg)", borderRadius: 6, fontSize: 12, color: "var(--tx)", border: "1px solid var(--bd)" }}>
                  <strong style={{ color: "var(--tx2)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".4px" }}>DAM occurrence {d.occurrence}:</strong>
                  <span style={{ marginLeft: 8, fontWeight: 600 }}>{d.damActionLabel}</span>
                  {d.deductionDays > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--red)" }}>· {d.deductionDays} day{d.deductionDays === 1 ? "" : "s"} deduction</span>
                  )}
                  {d.isHrInvestigation && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "var(--red)" }}>⚠ HR escalation</span>
                  )}
                  {d.needsReview && !d.isHrInvestigation && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--amber)" }}>🔶 Supervisor / manager review required</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reason modal — used for a lead's dismissal and for "not applicable"
          (any role). Both require a justification before the button enables. */}
      {dismissModalAP && <Modal onClose={closeModal} maxWidth={480}>
          <div className="card-header" style={{marginBottom:16}}>
            <span className="card-title">
              {isNAMode ? "Mark Non-Applicable" : "Dismiss Detection"} — {nameFromEmail(dismissModalAP.email)}
            </span>
          </div>
          <div style={{fontSize:13,color:"var(--tx2)",marginBottom:12}}>{dismissModalAP.reason}</div>
          {isNAMode && (
            <div style={{fontSize:12,color:"var(--tx2)",background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:6,padding:"8px 10px",marginBottom:12}}>
              No AP or PIP will be run for this QA for this period. The justification below is stored against the record and is visible to supervisors.
            </div>
          )}
          <div className="form-group">
            <label className="form-label">
              {isNAMode ? "Justification (required)" : "Reason for dismissal (required — visible to your supervisor)"}
            </label>
            <textarea className="form-input" rows={3} value={dismissReasonAP} onChange={e=>setDismissReasonAP(e.target.value)}
              placeholder={isNAMode ? "Why does no AP/PIP apply? e.g. on long-term leave, changed role, KPI data incorrect" : "Why is this detection being dismissed?"}
              style={{resize:"vertical"}}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button className="btn btn-primary" disabled={!dismissReasonAP.trim()} onClick={async()=>{
              await dismissDetectionDB(dismissModalAP.email, dismissReasonAP.trim(), isNAMode ? "non_applicable" : "dismissed");
              closeModal();
            }}>{isNAMode ? "Confirm non-applicable" : "Confirm dismissal"}</button>
            <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
          </div>
      </Modal>}
    </div>
  );
}
