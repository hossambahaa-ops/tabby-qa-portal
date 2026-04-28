import React from "react";
import { Icon, icons } from "../Icons.jsx";
import { priorityFor } from "../../lib/taskUI.js";
import { nameFromEmail } from "../../lib/utils.js";

// Read-only-ish task detail card surfaced when the user clicks a task
// in the calendar / list. Holds the standard CTA row (toggle done,
// edit, postpone, delete) that the parent wires up via callbacks.
export default function TaskDetailModal({
  selectedTask,
  userTasks,
  onClose,
  onToggleDone,
  onEdit,
  onPostpone,
  onDelete,
}) {
  if (!selectedTask) return null;
  const t = userTasks.find(x => x.id === selectedTask.id) || selectedTask;
  const pc = priorityFor(t.priority);
  const isDone = t.status === "done";
  const isOverdue = (() => {
    if (!t.eta_date || isDone) return false;
    const td = new Date(); td.setHours(0, 0, 0, 0);
    return new Date(t.eta_date + "T00:00:00") < td;
  })();

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 440, margin: 20, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 8, background: pc.bg, color: pc.color, fontWeight: 700, textTransform: "uppercase" }}>{pc.label}</span>
            {isDone && <span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 8, background: "var(--green-bg)", color: "var(--green)", fontWeight: 700 }}>Completed</span>}
            {isOverdue && <span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", fontWeight: 700 }}>Overdue</span>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", marginBottom: 8, textDecoration: isDone ? "line-through" : "none" }}>{t.title}</div>
        {t.description && <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 16, lineHeight: 1.6, padding: "10px 14px", background: "var(--bg)", borderRadius: 8 }}>{t.description}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16, fontSize: 13 }}>
          {t.eta_date && <div><span style={{ color: "var(--tx3)", fontSize: 11 }}>ETA</span><div style={{ fontWeight: 500, color: isOverdue ? "var(--red)" : "var(--tx)" }}>{new Date(t.eta_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div></div>}
          {t.assigned_to && <div><span style={{ color: "var(--tx3)", fontSize: 11 }}>Assigned to</span><div style={{ fontWeight: 500 }}>{nameFromEmail(t.assigned_to)}</div></div>}
          {t.created_by && <div><span style={{ color: "var(--tx3)", fontSize: 11 }}>Created by</span><div style={{ fontWeight: 500 }}>{nameFromEmail(t.created_by)}</div></div>}
          {t.created_at && <div><span style={{ color: "var(--tx3)", fontSize: 11 }}>Created</span><div style={{ fontWeight: 500 }}>{new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div></div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={`btn ${isDone ? "btn-outline" : "btn-primary"} btn-sm`} style={isDone ? {} : { background: "var(--green)" }} onClick={() => onToggleDone(t)}>
            {isDone ? "Reopen task" : "Mark as done"}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => onEdit(t)}>
            <Icon d={icons.edit} size={14} />Edit
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => onPostpone(t)}>
            <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={14} />Postpone
          </button>
          <button className="btn btn-outline btn-sm" style={{ color: "var(--red)", marginLeft: "auto" }} onClick={() => onDelete(t)}>
            <Icon d={icons.trash} size={14} />Delete
          </button>
        </div>
      </div>
    </div>
  );
}
