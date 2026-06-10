import React, { useRef } from "react";
import { riyadhTodayStr } from "../../lib/attendancePlan.js";
import { LEAVE_CODES, shiftBadge } from "../../lib/attendance.js";
import CellPicker from "./CellPicker.jsx";

// One day-square inside MyMonthCalendar. Anchors CellPicker via a div ref.
//
// `enhanced` mode adds a third line at the bottom of the cell showing
// the check-in time when present (from att.checked_in_at), and a
// distinct "Not yet" indicator for planned-P days that haven't been
// checked in yet. Default off so existing QA views render unchanged.
//
// Extracted from SchedulePage 2026-05-08.
export default function CalendarDayCell({
  day, dateStr, att, st, planned, attType, isPending, isDenied,
  isWeekend, isToday, isEditing, canEdit, onOpen, onClose,
  em, dayNum, isQA, canApprove, pickerStage, pendingReason,
  onSetAtt, onApproveAtt, onClearAtt, setPendingReason, setPickerStage,
  enhanced = false,
}) {
  const ref = useRef(null);
  // Enhanced-mode helpers
  const checkInAt = att?.checked_in_at || null;
  const fmtTime = (ts) => {
    if (!ts) return "";
    try { return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }); }
    catch { return ""; }
  };
  // True when the QA is on a planned-P day but hasn't checked in yet.
  // Distinct visual state — neither "Present" nor "NSNC" yet.
  const todayIso = riyadhTodayStr();
  const isPlannedNoCheckIn = enhanced && planned === "P" && !checkInAt && st !== "NSNC" && !LEAVE_CODES.has(st);
  const isFutureDay = dateStr > todayIso;
  return (
    <div
      ref={ref}
      onClick={() => { if (canEdit) { isEditing ? onClose() : onOpen(); } }}
      title={attType?.label || (planned ? `Planned: ${planned}` : "Click to set attendance")}
      style={{
        minHeight: 78,
        padding: 6,
        background: isToday ? "rgba(106,44,121,.10)" : isWeekend ? "rgba(156,163,175,0.05)" : "var(--bg)",
        border: `1px solid ${isToday ? "var(--tabby-purple)" : "var(--bd2)"}`,
        borderRadius: 8,
        cursor: canEdit ? "pointer" : "default",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: "background .12s ease, border-color .12s ease",
      }}
      onMouseEnter={(e) => { if (canEdit) e.currentTarget.style.borderColor = isToday ? "var(--tabby-purple)" : "var(--tabby-purple)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = isToday ? "var(--tabby-purple)" : "var(--bd2)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: isToday ? "var(--tabby-purple)" : isWeekend ? "var(--tx3)" : "var(--tx)" }}>
          {day}
        </span>
        {planned && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 3,
              background: planned === "H" ? "rgba(59,130,246,.18)" : planned === "P" ? "rgba(34,197,94,.18)" : "rgba(156,163,175,.20)",
              color: planned === "H" ? "#3B82F6" : planned === "P" ? "#16A34A" : "var(--tx3)",
            }}
            title={planned === "H" ? "Planned: Home" : planned === "P" ? "Planned: Office" : "Planned: OFF (no work)"}
          >
            {planned}
          </span>
        )}
      </div>
      {/* Status badge: in enhanced mode, only render when there's a
          REAL outcome — checked-in, a mismatch with the plan, or a
          definitive status code (NSNC / AL / SL / PH). Skip when status
          merely echoes the plan with no check-in (column-default 'P'
          on planned-P rows) so the plan badge in the corner is the
          single source of truth until the QA actually marks themselves. */}
      {st && attType && (() => {
        if (!enhanced) return true;
        if (checkInAt) return true;                               // QA self-checked in
        if (st === "NSNC") return true;                            // auto / manual NSNC
        if (LEAVE_CODES.has(st)) return true;                       // approved leave
        if (planned && st !== planned) return true;                // mismatch — keep visible
        return false;                                              // default-status echoing the plan → hide
      })() && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 4,
              background: attType.bg,
              color: attType.color,
              fontWeight: 700,
              opacity: isPending ? 0.55 : isDenied ? 0.4 : 1,
              outline: isPending ? `1px dashed ${attType.color}` : isDenied ? "1px dashed var(--red)" : "none",
            }}
          >
            {st}
          </span>
          {isPending && <span style={{ fontSize: 10, color: "var(--amber)" }} title="Pending lead approval">⏳</span>}
          {isDenied && <span style={{ fontSize: 10, color: "var(--red)" }} title="Denied">✗</span>}
        </div>
      )}
      {!st && planned && !enhanced && (
        <div style={{ fontSize: 10, color: "var(--tx3)", fontStyle: "italic" }}>
          {planned === "H" ? "Home" : planned === "P" ? "Office" : "Day off"}
        </div>
      )}
      {/* Enhanced-mode footer: the assigned shift (when set) plus the
          timing trail. The actual check-in time replaces the hint once
          present, but the shift window stays visible alongside it — so a
          viewer can always see which shift the QA was on, including after
          they've checked in (previously the shift vanished on check-in
          and only ever showed as a pre-check-in window hint on today). */}
      {enhanced && (checkInAt || isPlannedNoCheckIn || (att?.shift_start && att?.shift_end)) && (() => {
        const badge = shiftBadge(att?.shift_start, att?.shift_end);
        const timing = checkInAt
          ? `✓ ${fmtTime(checkInAt)}`
          : isFutureDay
            ? "planned"
            : isToday
              ? "⏳ not in yet"
              : "Not yet";
        return (
          <div style={{ marginTop: "auto", paddingTop: 4, fontSize: 9.5, color: "var(--tx3)", fontVariantNumeric: "tabular-nums", fontWeight: 500, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 }}>
            {badge && <span title="Assigned shift" style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: badge.color + "22", color: badge.color }}>{badge.label}</span>}
            <span>{timing}</span>
          </div>
        );
      })()}
      {isEditing && (
        <CellPicker
          anchorEl={ref.current}
          em={em}
          dayNum={dayNum}
          dateIso={dateStr}
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
    </div>
  );
}
