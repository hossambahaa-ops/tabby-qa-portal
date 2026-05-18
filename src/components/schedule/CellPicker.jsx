import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { APPROVAL_CODES, PICKER_TYPES, pickerCodesForDate } from "../../lib/attendance.js";

// CellPicker — rendered into a portal at document.body so it can't be
// clipped by the table's overflow:auto container and can't visually
// overlap an adjacent row. Position is computed from the anchor cell's
// bounding rect, then clamped to the viewport so the picker is always
// fully visible regardless of which date column the user clicked.
//
// Extracted from SchedulePage 2026-05-08 to keep the page file focused
// on data + layout. Public API unchanged — props match the original
// definition byte-for-byte.
export default function CellPicker({
  anchorEl, em, dayNum, dateIso, st, isQA, canApprove,
  pickerStage, pendingReason,
  onClose, onSetAtt, onApproveAtt, onClearAtt,
  setPendingReason, setPickerStage,
}) {
  // Pick the right code list for this date. Cells on/after the
  // 2026-06-01 cutover show the simplified 6-code set; earlier cells
  // keep the full legacy list so leads can still clean up May with
  // granular AL / Paid SL / EL / UL / Tabby Day / L picks.
  const codesForThisCell = pickerCodesForDate(dateIso);
  const PICKER_W = 220;     // a touch wider than before; codes never overlap text now
  const PICKER_H_EST = 110; // rough height for clamping decisions

  const computePos = (el) => {
    if (!el) return { left: 0, top: 0, placement: "below" };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let left = Math.round(cx - PICKER_W / 2);
    // Clamp horizontally so the picker is never clipped by viewport edges.
    const maxLeft = window.innerWidth - PICKER_W - 8;
    if (left < 8) left = 8;
    if (left > maxLeft) left = maxLeft;
    // Default below the cell. If there's no room below, flip above.
    let top = Math.round(r.bottom + 4);
    let placement = "below";
    if (top + PICKER_H_EST > window.innerHeight && r.top - PICKER_H_EST > 8) {
      top = Math.round(r.top - PICKER_H_EST - 4);
      placement = "above";
    }
    return { left, top, placement };
  };

  const [pos, setPos] = useState(() => computePos(anchorEl));

  // Reposition on scroll/resize so the picker tracks the cell.
  useEffect(() => {
    if (!anchorEl) return;
    const onChange = () => setPos(computePos(anchorEl));
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [anchorEl]);

  // Outside click → close.
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      if (anchorEl && anchorEl.contains(e.target)) return; // clicks on the anchor cell itself toggle close via TD onClick
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchorEl, onClose]);

  return ReactDOM.createPortal(
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: PICKER_W,
        zIndex: 1000,
        background: "var(--bg3)",
        border: "1px solid var(--bd)",
        borderRadius: 8,
        padding: 6,
        boxShadow: "var(--shadow-lg)",
        fontFamily: "var(--font)",
      }}
    >
      {canApprove && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onApproveAtt(em, dayNum); }}
            style={{ fontSize: 9, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--green)", cursor: "pointer", background: "var(--green-bg)", color: "var(--green)", fontWeight: 700, fontFamily: "var(--font)", width: "100%", marginBottom: 2 }}
          >
            ✓ Approve {st}
          </button>
          <div style={{ fontSize: 8, color: "var(--tx3)", width: "100%", padding: "2px 0", textAlign: "center", fontStyle: "italic" }}>
            Or pick a different code to replace
          </div>
        </>
      )}
      {pickerStage ? (
        <div>
          <div style={{ fontSize: 9, color: "var(--tx3)", marginBottom: 4, fontWeight: 600 }}>
            Reason for {pickerStage.code} <span style={{ fontWeight: 400 }}>(optional)</span>
          </div>
          <input
            autoFocus
            type="text"
            placeholder="e.g. Eid holiday, sick"
            value={pendingReason}
            onChange={(e) => setPendingReason(e.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") { ev.preventDefault(); onSetAtt(em, dayNum, pickerStage.code, pendingReason); }
              if (ev.key === "Escape") { setPickerStage(null); setPendingReason(""); }
            }}
            style={{ width: "100%", fontSize: 10, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--bd)", background: "var(--bg)", color: "var(--tx)", fontFamily: "var(--font)", boxSizing: "border-box", marginBottom: 4 }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => onSetAtt(em, dayNum, pickerStage.code, pendingReason)}
              style={{ flex: 1, fontSize: 9, padding: "4px 0", borderRadius: 4, border: "none", cursor: "pointer", background: "var(--tabby-purple)", color: "#fff", fontWeight: 700, fontFamily: "var(--font)" }}
            >
              Send for approval
            </button>
            <button
              onClick={() => { setPickerStage(null); setPendingReason(""); }}
              style={{ fontSize: 9, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--bd)", cursor: "pointer", background: "var(--bg)", color: "var(--tx2)", fontFamily: "var(--font)" }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {codesForThisCell.map((t) => {
            const SK = { P: "p", H: "h", L: "l", AL: "a", "Paid SL": "s", NSNC: "n", EL: "e", UL: "u", ML: "m" }[t.code];
            const needsReason = isQA && APPROVAL_CODES.has(t.code);
            return (
              <button
                key={t.code}
                onClick={(e) => { e.stopPropagation(); if (needsReason) { setPickerStage({ code: t.code }); setPendingReason(""); } else { onSetAtt(em, dayNum, t.code); } }}
                style={{ fontSize: 9, padding: "4px 6px", borderRadius: 3, border: "none", cursor: "pointer", background: t.bg, color: t.color, fontWeight: 700, fontFamily: "var(--font)" }}
                title={`${t.label}${SK ? ` (${SK})` : ""}`}
              >
                {t.code}
              </button>
            );
          })}
          <div style={{ fontSize: 8, color: "var(--tx3)", width: "100%", textAlign: "center", marginTop: 4, letterSpacing: 0.3 }}>
            Type a key · ← → ↑ ↓ to nav · Esc to close
          </div>
          {st && (
            <button
              onClick={(e) => { e.stopPropagation(); onClearAtt(em, dayNum); }}
              style={{ fontSize: 9, padding: "4px 6px", borderRadius: 3, border: "1px solid var(--red)", cursor: "pointer", background: "var(--red-bg)", color: "var(--red)", fontWeight: 700, fontFamily: "var(--font)", width: "100%", marginTop: 4 }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
