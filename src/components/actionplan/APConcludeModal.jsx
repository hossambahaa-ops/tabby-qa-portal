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

        {conclusionOutcome === "fail" && concludingPlan.type === "ap" && (
          <div style={{ padding: "8px 12px", background: "var(--amber-bg)", borderRadius: 6, fontSize: 12, color: "var(--amber)", fontWeight: 500, marginTop: 8 }}>
            ⚠️ Failed AP will recommend escalation to PIP.
          </div>
        )}
        {conclusionOutcome === "fail" && concludingPlan.type === "pip" && (
          <div style={{ padding: "8px 12px", background: "var(--red-bg)", borderRadius: 6, fontSize: 12, color: "var(--red)", fontWeight: 500, marginTop: 8 }}>
            ⚠️ Failed PIP will automatically create a DAM flag for HR investigation.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={concludePlan} disabled={!conclusionOutcome || loading}>
            {loading ? "Processing..." : "Confirm conclusion"}
          </button>
          <button className="btn btn-outline" onClick={() => { setConcludingPlan(null); setConclusionOutcome(""); setConclusionNotes(""); }}>Cancel</button>
        </div>
    </Modal>
  );
}
