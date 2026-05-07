import React from "react";
import Modal from "../Modal.jsx";

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
    <Modal onClose={onClose} maxWidth={400}>
      <div className="card-header" style={{ marginBottom: 16 }}><span className="card-title">Postpone: {postponeModal.title}</span></div>
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
    </Modal>
  );
}
