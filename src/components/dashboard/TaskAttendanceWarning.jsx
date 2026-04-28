import React from "react";
import ReactDOM from "react-dom";

// "Sara is on Annual Leave today — assign anyway?" portal modal that
// fires before saveTask when the QA's attendance row for the task's
// target day signals AL / Paid SL / OFF / NSNC. The parent owns the
// saveTask(force=true) callback so it can resume the original flow.
export default function TaskAttendanceWarning({ attWarning, onCancel, onAssignAnyway }) {
  if (!attWarning) return null;
  const today = new Date().toISOString().split("T")[0];
  const dateLabel = (() => {
    if (!attWarning.date || attWarning.date === today) return "today";
    const d = new Date(attWarning.date + "T00:00:00");
    return `on ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
  })();

  return ReactDOM.createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.55)", display: "flex", justifyContent: "center", alignItems: "center" }}
      onClick={onCancel}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg3)", borderRadius: 16, border: "1px solid var(--bd)", boxShadow: "0 25px 50px rgba(0,0,0,0.5)", width: "100%", maxWidth: 400, padding: 24, textAlign: "center", margin: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--amber-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "var(--tx)" }}>{attWarning.name}</div>
        <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 20 }}>
          is marked as <span style={{ fontWeight: 700, color: "var(--amber)" }}>{attWarning.status}</span> {dateLabel}. Do you still want to assign this task?
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-primary btn-sm" style={{ padding: "8px 20px" }} onClick={onAssignAnyway}>Assign anyway</button>
          <button className="btn btn-outline btn-sm" style={{ padding: "8px 20px" }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
