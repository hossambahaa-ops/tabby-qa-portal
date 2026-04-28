import React from "react";

// "Pick a new due date + reason" modal. State (postponeDate /
// postponeReason) is owned by the parent so the existing postponeTask
// handler can read them when the user confirms.
export default function TaskPostponeModal({
  postponeModal,
  postponeDate, setPostponeDate,
  postponeReason, setPostponeReason,
  onClose,
  onConfirm,
}) {
  if (!postponeModal) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 400, margin: 20, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="card-header"><span className="card-title">Postpone: {postponeModal.title}</span></div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">New due date *</label>
          <input
            type="date"
            className="form-input"
            value={postponeDate}
            onChange={e => setPostponeDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Reason (optional)</label>
          <textarea
            className="form-input"
            rows={2}
            value={postponeReason}
            onChange={e => setPostponeReason(e.target.value)}
            placeholder="Why is this being postponed?"
            style={{ resize: "vertical" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={onConfirm} disabled={!postponeDate}>Postpone</button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
