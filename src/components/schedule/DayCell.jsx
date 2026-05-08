import React, { useRef } from "react";
import { ATT_MAP } from "../../lib/attendance.js";
import { nameFromEmail } from "../../lib/utils.js";
import CellPicker from "./CellPicker.jsx";

// Memoized day cell for the wide attendance table (lead/sup view).
// Custom comparator skips re-render unless attendance data, editing
// state, or picker content changed — ~30× fewer renders per cell click /
// keystroke when the table has dozens of QAs and 30+ days.
//
// Extracted from SchedulePage 2026-05-08. Public API unchanged.
function areCellPropsEqual(p, n) {
  return (
    p.att === n.att &&
    p.isEditing === n.isEditing &&
    p.canEdit === n.canEdit &&
    p.selMonth === n.selMonth &&
    p.monthIsLocked === n.monthIsLocked &&
    p.onSetAtt === n.onSetAtt &&
    p.onApproveAtt === n.onApproveAtt &&
    p.onClearAtt === n.onClearAtt &&
    (!p.isEditing || (p.pickerStage === n.pickerStage && p.pendingReason === n.pendingReason))
  );
}

const DayCell = React.memo(function DayCell({
  em, dayNum, isWeekend, att, isEditing, canEdit, isLead, isQA, canApprove,
  pickerStage, pendingReason,
  onOpen, onClose, onSetAtt, onApproveAtt, onClearAtt, setPendingReason, setPickerStage,
}) {
  const tdRef = useRef(null);
  const st = att?.status || null;
  const attType = st ? ATT_MAP[st] : null;
  const isPending = att?.approval_status === "pending";
  const isDenied  = att?.approval_status === "denied";
  // Attendance Plan info — surfaced ONLY in the title tooltip; no overlay
  // on the cell itself so hover/click behavior stays clean.
  const planned = att?.planned_code || null;
  const planLabel = planned === "H" ? "Planned: H" : planned === "P" ? "Planned: P" : "";
  const cellTitle = isPending
    ? `${attType?.label || st} — pending lead approval${att?.requested_by ? ` (by ${nameFromEmail(att.requested_by)})` : ""}${att?.request_note ? ` · "${att.request_note}"` : ""}${planLabel ? ` · ${planLabel}` : ""}`
    : isDenied
    ? `${attType?.label || st} — denied by ${nameFromEmail(att?.denied_by || "")}${att?.denial_reason ? ` · "${att.denial_reason}"` : ""}${planLabel ? ` · ${planLabel}` : ""}`
    : (attType?.label ? `${attType.label}${planLabel ? ` · ${planLabel}` : ""}` : planLabel);
  return (
    <td
      ref={tdRef}
      style={{ textAlign: "center", padding: 1, background: isWeekend ? "rgba(156,163,175,0.05)" : "transparent", cursor: canEdit ? "pointer" : "default" }}
      onClick={() => { if (canEdit) { isEditing ? onClose() : onOpen(); } }}
      title={cellTitle}
    >
      {st ? (
        <span style={{ position: "relative", display: "inline-block", minWidth: 20, pointerEvents: "none" }}>
          <span style={{ fontSize: 9, padding: "2px 3px", borderRadius: 3, background: attType?.bg || "var(--bg3)", color: attType?.color || "var(--tx3)", fontWeight: 700, display: "inline-block", minWidth: 20, opacity: isPending ? 0.55 : isDenied ? 0.4 : 1, outline: isPending ? `1px dashed ${attType?.color || "var(--tx3)"}` : isDenied ? "1px dashed var(--red)" : "none" }}>{st}</span>
          {isPending && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 8, lineHeight: 1, background: "var(--bg3)", border: "1px solid var(--amber)", color: "var(--amber)", borderRadius: 6, padding: "1px 2px", fontWeight: 700 }}>⏳</span>}
          {isDenied && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 8, lineHeight: 1, background: "var(--bg3)", border: "1px solid var(--red)", color: "var(--red)", borderRadius: 6, padding: "1px 2px", fontWeight: 700 }}>✗</span>}
        </span>
      ) : planned ? (
        <span style={{ fontSize: 10, color: "var(--tx3)", pointerEvents: "none", fontWeight: 600, opacity: 0.6 }}>{planned}</span>
      ) : (
        <span style={{ fontSize: 10, color: "var(--bd2)", pointerEvents: "none" }}>·</span>
      )}
      {isEditing && (
        <CellPicker
          anchorEl={tdRef.current}
          em={em}
          dayNum={dayNum}
          st={st}
          isQA={isQA}
          canApprove={canApprove}
          pickerStage={pickerStage}
          pendingReason={pendingReason}
          onClose={onClose}
          onSetAtt={onSetAtt}
          onApproveAtt={onApproveAtt}
          onClearAtt={onClearAtt}
          setPendingReason={setPendingReason}
          setPickerStage={setPickerStage}
        />
      )}
    </td>
  );
}, areCellPropsEqual);

export default DayCell;
