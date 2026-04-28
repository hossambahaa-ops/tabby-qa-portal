import React from "react";
import SearchableSelect from "../SearchableSelect.jsx";
import { nameFromEmail } from "../../lib/utils.js";

// "Request OT" (QA) / "Add OT" (lead) modal. The parent owns the form
// state so it can pre-fill defaults when the user opens the modal
// (today's date, hours per day = 2, target email = self for QAs).
export default function AttendanceOtModal({
  open,
  onClose,
  isQA,
  visibleQAs,
  otFrom, setOtFrom,
  otTo, setOtTo,
  otHoursPerDay, setOtHoursPerDay,
  otTarget, setOtTarget,
  otNote, setOtNote,
  applyOtRequest,
}) {
  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 80 }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg3)", borderRadius: 16, border: "1px solid var(--bd)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: 460, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--tx)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "#0D948820", color: "#0D9488", fontWeight: 700 }}>OT</span>
            {isQA ? "Request overtime" : "Add overtime"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--tx3)" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 12, lineHeight: 1.5 }}>
          {isQA
            ? "Pick the day(s) you worked overtime. Your QA Lead will get a notification and can approve or replace it."
            : "Pick the day(s) and the QA. This is added directly as approved overtime — no further approval needed."}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label">From</label>
            <input type="date" className="form-input" value={otFrom} onChange={e => setOtFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">To</label>
            <input type="date" className="form-input" value={otTo} onChange={e => setOtTo(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hours per day</label>
            <input type="number" min="0.25" step="0.25" className="form-input" value={otHoursPerDay} onChange={e => setOtHoursPerDay(e.target.value)} />
          </div>
          <div className="form-group" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div style={{ fontSize: 11, color: "var(--tx3)", padding: "6px 0" }}>
              Total: <strong style={{ color: "var(--tx)" }}>{(() => {
                if (!otFrom || !otTo) return "—";
                const s = new Date(otFrom + "T00:00:00"), e = new Date(otTo + "T00:00:00");
                if (e < s) return "—";
                const days = Math.round((e - s) / (86400000)) + 1;
                const h = parseFloat(otHoursPerDay) || 0;
                return `${(days * h).toFixed(2)}h across ${days} day${days > 1 ? "s" : ""}`;
              })()}</strong>
            </div>
          </div>
        </div>
        {!isQA && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">QA</label>
            <SearchableSelect
              options={visibleQAs.map(r => ({ value: r.email, label: r.email + " — " + nameFromEmail(r.email) }))}
              value={otTarget}
              onChange={setOtTarget}
              placeholder="Pick the QA..."
            />
          </div>
        )}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Note (optional)</label>
          <input type="text" className="form-input" value={otNote} onChange={e => setOtNote(e.target.value)} placeholder="e.g. weekend coverage for launch" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={applyOtRequest}>{isQA ? "Send request" : "Add OT"}</button>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
