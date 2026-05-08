import React, { useRef } from "react";
import CellPicker from "./CellPicker.jsx";

// One day-square inside MyMonthCalendar. Anchors CellPicker via a div ref.
//
// Extracted from SchedulePage 2026-05-08. Public API unchanged.
export default function CalendarDayCell({
  day, dateStr, att, st, planned, attType, isPending, isDenied,
  isWeekend, isToday, isEditing, canEdit, onOpen, onClose,
  em, dayNum, isQA, canApprove, pickerStage, pendingReason,
  onSetAtt, onApproveAtt, onClearAtt, setPendingReason, setPickerStage,
}) {
  const ref = useRef(null);
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
      {st && attType && (
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
      {!st && planned && (
        <div style={{ fontSize: 10, color: "var(--tx3)", fontStyle: "italic" }}>
          {planned === "H" ? "Home" : planned === "P" ? "Office" : "Day off"}
        </div>
      )}
      {isEditing && (
        <CellPicker
          anchorEl={ref.current}
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
    </div>
  );
}
