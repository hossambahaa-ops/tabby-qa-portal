import React, { useRef } from "react";
import { ATT_MAP } from "../../lib/attendance.js";
import { nameFromEmail } from "../../lib/utils.js";
import CellPicker from "./CellPicker.jsx";

// Memoized day cell for the wide attendance table (lead/sup view).
// Custom comparator skips re-render unless attendance data, editing
// state, or picker content changed — ~30× fewer renders per cell click /
// keystroke when the table has dozens of QAs and 30+ days.
//
// Extracted from SchedulePage 2026-05-08. Public API:
//   * dateIso — YYYY-MM-DD for this cell's date (added to support
//     the "past-dimmed = missed self check-in" warning border)
//   * todayIso — YYYY-MM-DD for today's date in Riyadh, passed in
//     once from the parent so every cell shares the same reference
//     without recomputing
function areCellPropsEqual(p, n) {
  return (
    p.att === n.att &&
    p.isEditing === n.isEditing &&
    p.canEdit === n.canEdit &&
    p.selMonth === n.selMonth &&
    p.monthIsLocked === n.monthIsLocked &&
    p.dateIso === n.dateIso &&
    p.todayIso === n.todayIso &&
    p.onSetAtt === n.onSetAtt &&
    p.onApproveAtt === n.onApproveAtt &&
    p.onClearAtt === n.onClearAtt &&
    (!p.isEditing || (p.pickerStage === n.pickerStage && p.pendingReason === n.pendingReason))
  );
}

// "Attended" codes that require the QA to self-check-in via the
// dashboard widget. Anything else (AL / Paid SL / PH / OFF / CDO /
// NSNC / EL / UL / ML / OT) is admin-confirmed and renders solid by
// definition.
const SELF_CHECKIN_CODES = new Set(["P", "H"]);

const DayCell = React.memo(function DayCell({
  em, dayNum, dateIso, todayIso, isWeekend, att, isEditing, canEdit, isLead, isQA, canApprove,
  pickerStage, pendingReason,
  onOpen, onClose, onSetAtt, onApproveAtt, onClearAtt, setPendingReason, setPickerStage,
}) {
  const tdRef = useRef(null);
  const st = att?.status || null;
  const attType = st ? ATT_MAP[st] : null;
  const isPending = att?.approval_status === "pending";
  const isDenied  = att?.approval_status === "denied";
  const planned = att?.planned_code || null;
  // Self check-in detection: a real check-in writes checked_in_at via
  // the DailyCheckInWidget / calendar cell. We used to key this off
  // created_by === em, but merge-duplicates preserves the ORIGINAL
  // created_by on an upsert — so a QA who self-checked-in via the
  // widget on a row the lead had created kept created_by = lead, and
  // the cell rendered as dim "plan-only" even though the QA had
  // actually checked in. checked_in_at is the unambiguous signal.
  const isAttendedCode = SELF_CHECKIN_CODES.has(st);
  const isSelfCheckIn = isAttendedCode && !!att?.checked_in_at;
  // "Plan-only" = status is P/H but the QA hasn't actually checked in.
  // This includes lead-pre-filled rows AND rows where status was set by
  // the lead but not yet confirmed by the QA.
  const isPlanOnly = isAttendedCode && !isSelfCheckIn;
  // Date math — only meaningful when dateIso + todayIso are passed.
  const isPast = !!(dateIso && todayIso && dateIso < todayIso);
  const isToday = !!(dateIso && todayIso && dateIso === todayIso);
  // What letter to render in the cell. Solid status wins; otherwise
  // dimmed plan; otherwise the · placeholder.
  const showLetter = st || planned;
  // Dimmed = plan-only attendance OR plan-only with no status set yet.
  const isDimmed = !!showLetter && (isPlanOnly || (!st && !!planned));
  // Past + dimmed = missed self check-in. Surface with a red dotted
  // outline so the lead can spot non-compliance at a glance.
  const isMissed = isDimmed && isPast;

  // Tooltip composition. Three orthogonal facts to communicate:
  //   1. What's the planned code (if any)
  //   2. What's the actual status (if any) and how it was set
  //   3. Approval state (pending / denied)
  const planLabel = planned === "H" ? "Planned: H (Home)" : planned === "P" ? "Planned: P (Office)" : "";
  const actualLabel = !st
    ? ""
    : isAttendedCode
      ? (isSelfCheckIn
          ? `Actual: ${st} · Checked in by self`
          : `${planLabel ? "" : "Planned: "}${st}${isMissed ? " · Missed self check-in" : " · Not yet checked in"}`)
      : `${attType?.label || st}`;
  const cellTitle = isPending
    ? `${attType?.label || st} — pending lead approval${att?.requested_by ? ` (by ${nameFromEmail(att.requested_by)})` : ""}${att?.request_note ? ` · "${att.request_note}"` : ""}${planLabel && !planLabel.startsWith("Planned: " + st) ? ` · ${planLabel}` : ""}`
    : isDenied
    ? `${attType?.label || st} — denied by ${nameFromEmail(att?.denied_by || "")}${att?.denial_reason ? ` · "${att.denial_reason}"` : ""}${planLabel ? ` · ${planLabel}` : ""}`
    : (actualLabel || planLabel);

  // Visual style for the letter span.
  const baseBg = attType?.bg || "var(--bg3)";
  const baseColor = attType?.color || "var(--tx3)";
  const letterStyle = {
    fontSize: 9,
    padding: "2px 3px",
    borderRadius: 3,
    fontWeight: 700,
    display: "inline-block",
    minWidth: 20,
    background: isDimmed ? "transparent" : baseBg,
    color: baseColor,
    opacity: isPending ? 0.55 : isDenied ? 0.4 : isDimmed ? 0.55 : 1,
    border: isDimmed ? `1px dashed ${baseColor}` : "none",
    outline: isPending && !isDimmed ? `1px dashed ${baseColor}` : isDenied ? "1px dashed var(--red)" : "none",
    boxShadow: isMissed ? "0 0 0 1px var(--red)" : "none",
    textDecoration: isToday ? "underline" : "none",
    textUnderlineOffset: 2,
  };

  return (
    <td
      ref={tdRef}
      style={{
        textAlign: "center",
        padding: 1,
        background: isWeekend ? "rgba(156,163,175,0.05)" : (isToday ? "rgba(106,44,121,0.06)" : "transparent"),
        cursor: canEdit ? "pointer" : "default",
        borderTop: isToday ? "1px solid var(--tabby-purple)" : undefined,
        borderBottom: isToday ? "1px solid var(--tabby-purple)" : undefined,
      }}
      onClick={() => { if (canEdit) { isEditing ? onClose() : onOpen(); } }}
      title={cellTitle}
    >
      {showLetter ? (
        <span style={{ position: "relative", display: "inline-block", minWidth: 20, pointerEvents: "none" }}>
          <span style={letterStyle}>{st || planned}</span>
          {isPending && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 8, lineHeight: 1, background: "var(--bg3)", border: "1px solid var(--amber)", color: "var(--amber)", borderRadius: 6, padding: "1px 2px", fontWeight: 700 }}>⏳</span>}
          {isDenied && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 8, lineHeight: 1, background: "var(--bg3)", border: "1px solid var(--red)", color: "var(--red)", borderRadius: 6, padding: "1px 2px", fontWeight: 700 }}>✗</span>}
        </span>
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
