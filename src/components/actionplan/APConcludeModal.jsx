import React from "react";
import Modal from "../Modal.jsx";

export default function APConcludeModal({
  concludingPlan,
  setConcludingPlan,
  conclusionOutcome,
  setConclusionOutcome,
  conclusionNotes,
  setConclusionNotes,
  concludePlan,
  loading,
  getAutoRecommendation,
  getPlanProgress,
  nameFromEmail,
}) {
  if (!concludingPlan) return null;

  const rec = getAutoRecommendation(concludingPlan);
  const prog = getPlanProgress(concludingPlan);

  return (
    <Modal onClose={() => setConcludingPlan(null)} maxWidth={520}>
      <div className="card-header" style={{ marginBottom: 16 }}>
        <span className="card-title">Conclude {concludingPlan.type.toUpperCase()} — {nameFromEmail(concludingPlan.qa_email)}</span>
      </div>

        {/* Auto-recommendation */}
        {rec && (
          <div style={{ padding: "10px 14px", background: rec === "pass" ? "var(--green-bg)" : "var(--red-bg)", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: rec === "pass" ? "var(--green)" : "var(--red)" }}>
              Auto-recommendation: {rec === "pass" ? "✅ PASS" : "❌ FAIL"}
            </span>
            <span style={{ color: "var(--tx2)", marginLeft: 8 }}>({prog.metWeeks}/{prog.elapsed} periods met targets — {prog.successRate.toFixed(0)}%)</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setConclusionOutcome("pass")} className={`btn ${conclusionOutcome === "pass" ? "btn-primary" : "btn-outline"}`} style={conclusionOutcome === "pass" ? { background: "var(--green)", color: "#fff" } : {}}>✅ Passed</button>
          <button onClick={() => setConclusionOutcome("fail")} className={`btn ${conclusionOutcome === "fail" ? "btn-primary" : "btn-outline"}`} style={conclusionOutcome === "fail" ? { background: "var(--red)", color: "#fff" } : {}}>❌ Failed</button>
        </div>

        <div className="form-group">
          <label className="form-label">Conclusion notes</label>
          <textarea className="form-input" rows={3} value={conclusionNotes} onChange={e => setConclusionNotes(e.target.value)} placeholder="Document the final assessment..." style={{ resize: "vertical" }} />
        </div>

        {/* Pre-flight summary — spells out exactly what the click will
            do so leads don't fat-finger a Pass on a fresh PIP or
            wonder what "Fail" actually triggers. Updates live as the
            outcome toggle flips. */}
        {conclusionOutcome && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: conclusionOutcome === "pass" ? "var(--green-bg)" : (concludingPlan.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)"),
            border: `1px solid ${conclusionOutcome === "pass" ? "var(--green)" : (concludingPlan.type === "pip" ? "var(--red)" : "var(--amber)")}`,
            fontSize: 12, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: conclusionOutcome === "pass" ? "var(--green)" : (concludingPlan.type === "pip" ? "var(--red)" : "var(--amber)") }}>
              When you click Confirm:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--tx2)" }}>
              {conclusionOutcome === "pass" ? (
                <>
                  <li>Plan status → <strong>completed_pass</strong>; the QA exits the {concludingPlan.type.toUpperCase()} clean.</li>
                  <li>DAM history for this {concludingPlan.type.toUpperCase()} is closed — no new flag is created.</li>
                  {prog.filledWeeks.length === 0 && (
                    <li style={{ color: "var(--red)", fontWeight: 600 }}>⚠ This plan has 0 weeks of actuals — Pass will be rejected. Add weekly actuals first.</li>
                  )}
                </>
              ) : concludingPlan.type === "pip" ? (
                <>
                  <li>Plan status → <strong>completed_fail</strong>.</li>
                  <li>An auto-DAM flag is created against the <em>performance_management</em> rule with severity <strong>critical</strong>.</li>
                  <li>Occurrence # advances against this QA's existing PM flags — the DAM escalation step matrix determines the recommended action (PIP / termination_review).</li>
                </>
              ) : (
                <>
                  <li>Plan status → <strong>completed_fail</strong>.</li>
                  <li>An auto-DAM flag is created against the <em>performance_management</em> rule with severity <strong>warning</strong>.</li>
                  <li>Occurrence # advances — escalation step matrix decides whether the next consequence is coaching, PIP, or termination_review.</li>
                </>
              )}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={concludePlan} disabled={!conclusionOutcome || loading || (conclusionOutcome === "pass" && prog.filledWeeks.length === 0)}>
            {loading ? "Processing..." : "Confirm conclusion"}
          </button>
          <button className="btn btn-outline" onClick={() => { setConcludingPlan(null); setConclusionOutcome(""); setConclusionNotes(""); }}>Cancel</button>
        </div>
    </Modal>
  );
}
