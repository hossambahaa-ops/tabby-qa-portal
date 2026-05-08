import React from "react";
import Modal from "../Modal.jsx";

// "Assign Task to N selected QAs" modal — opened from the floating
// selection bar at the bottom of ScoreEntryPage. The parent owns the
// async POST loop so it can update the surrounding selection state
// when finished.
export default function MtdBulkTaskModal({
  open,
  onClose,
  selectedRows,
  bulkForm, setBulkForm,
  bulkSending,
  onSubmit,
}) {
  if (!open) return null;
  return (
    <Modal onClose={onClose} maxWidth={480}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Assign Task to {selectedRows.size} QA{selectedRows.size !== 1 ? "s" : ""}</div>
        <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 16 }}>One task will be created for each selected specialist</div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Title</label>
          <input className="form-input" value={bulkForm.title} onChange={e => setBulkForm({ ...bulkForm, title: e.target.value })} placeholder="Task title..." />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Description</label>
          <textarea className="form-input" rows={3} value={bulkForm.description} onChange={e => setBulkForm({ ...bulkForm, description: e.target.value })} placeholder="Optional description..." style={{ resize: "vertical" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-input" value={bulkForm.priority} onChange={e => setBulkForm({ ...bulkForm, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Due date</label>
            <input type="date" className="form-input" value={bulkForm.due_date} onChange={e => setBulkForm({ ...bulkForm, due_date: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!bulkForm.title.trim() || bulkSending} onClick={onSubmit}>
            {bulkSending ? "Creating..." : "Create tasks"}
          </button>
        </div>
    </Modal>
  );
}
