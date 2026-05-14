import React, { useState } from "react";
import { ATT_MAP } from "../../lib/attendance.js";
import CalendarDayCell from "./CalendarDayCell.jsx";

// MyMonthCalendar — Google-Calendar-style 7-column month grid for the
// QA's own attendance. Replaces the wide table on the Calendar tab when
// the viewer is a QA (they only have one row anyway, so the grid is
// overkill). Reuses CellPicker via CalendarDayCell for the same
// click-to-edit flow.
//
// `enhanced` mode (super-admin preview today, eventually default):
//   - The week containing today is always visible.
//   - Past weeks are collapsed behind a "Show earlier weeks" expander.
//   - Future weeks are collapsed behind a "Show upcoming weeks" expander.
//   - Each cell shows plan badge + status + check-in time (the third
//     line comes from CalendarDayCell when enhanced=true).
//
// Extracted from SchedulePage 2026-05-08.
export default function MyMonthCalendar({
  selMonth, myEmail, attendance, monthIsLocked, isLead, isQA,
  editCell, setEditCell, pickerStage, pendingReason,
  onSetAtt, onApproveAtt, onClearAtt, setPendingReason, setPickerStage,
  enhanced = false,
}) {
  const [year, monthNum] = selMonth.split("-").map(Number);
  const firstDow = new Date(year, monthNum - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // Build the cell list as one flat array, then split into weeks.
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null); // pad before day 1
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null); // pad to complete the last row
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const myAtt = (dayNum) => {
    if (!dayNum) return null;
    const dateStr = `${selMonth}-${String(dayNum).padStart(2, "0")}`;
    return attendance.find(
      (a) => a.email?.toLowerCase() === myEmail && a.date === dateStr,
    ) || null;
  };

  const todayDateStr = new Date().toISOString().split("T")[0];

  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Find which week index contains today's date (only meaningful when
  // viewing the current calendar month). When viewing a past or future
  // month, default to showing all weeks (no "current" reference point).
  const today = new Date();
  const viewingCurrentMonth =
    enhanced && today.getFullYear() === year && (today.getMonth() + 1) === monthNum;
  let currentWeekIdx = -1;
  if (viewingCurrentMonth) {
    const todayDay = today.getDate();
    currentWeekIdx = weeks.findIndex((w) => w.includes(todayDay));
  }
  const pastWeeks = currentWeekIdx > 0 ? weeks.slice(0, currentWeekIdx) : [];
  const currentWeek = currentWeekIdx >= 0 ? weeks[currentWeekIdx] : null;
  const futureWeeks = currentWeekIdx >= 0 ? weeks.slice(currentWeekIdx + 1) : [];

  // Expander state: both collapsed by default. The current week is
  // always visible regardless.
  const [pastOpen, setPastOpen] = useState(false);
  const [futureOpen, setFutureOpen] = useState(false);

  // Renders a single week row (array of 7 day numbers or nulls).
  const renderWeek = (week, wi, options = {}) => (
    <div
      key={`wk-${wi}`}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 4,
        opacity: options.dimmed ? 0.6 : 1,
        ...(options.highlighted ? {
          padding: 4,
          borderRadius: 12,
          background: "rgba(60,255,165,.04)",
          boxShadow: "0 0 0 1px rgba(60,255,165,.16) inset",
          marginBottom: 4,
        } : {}),
      }}
    >
      {week.map((day, di) => {
        const isWeekend = di === 5 || di === 6;
        if (day === null) {
          return (
            <div
              key={`${wi}-${di}`}
              style={{
                minHeight: 78,
                background: "transparent",
                border: "1px solid transparent",
                borderRadius: 8,
              }}
            />
          );
        }
        const dateStr = `${selMonth}-${String(day).padStart(2, "0")}`;
        const att = myAtt(day);
        const st = att?.status || null;
        const planned = att?.planned_code || null;
        const attType = st ? ATT_MAP[st] : null;
        const isPending = att?.approval_status === "pending";
        const isDenied = att?.approval_status === "denied";
        const cellKey = `${myEmail}-${day}`;
        const isEditing = editCell === cellKey;
        const canEdit = !monthIsLocked;
        const isToday = dateStr === todayDateStr;
        return (
          <CalendarDayCell
            key={`${wi}-${di}`}
            day={day}
            dateStr={dateStr}
            att={att}
            st={st}
            planned={planned}
            attType={attType}
            isPending={isPending}
            isDenied={isDenied}
            isWeekend={isWeekend}
            isToday={isToday}
            isEditing={isEditing}
            canEdit={canEdit}
            onOpen={() => setEditCell(cellKey)}
            onClose={() => { setEditCell(null); setPendingReason(""); }}
            em={myEmail}
            dayNum={day}
            isQA={isQA}
            canApprove={false}
            pickerStage={isEditing ? pickerStage : null}
            pendingReason={isEditing ? pendingReason : ""}
            onSetAtt={onSetAtt}
            onApproveAtt={onApproveAtt}
            onClearAtt={onClearAtt}
            setPendingReason={setPendingReason}
            setPickerStage={setPickerStage}
            enhanced={enhanced}
          />
        );
      })}
    </div>
  );

  // Shared dow-header row
  const dowHeader = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginBottom: 8 }}>
      {dayLabels.map((d, i) => (
        <div
          key={d}
          style={{
            textAlign: "center",
            fontSize: 10,
            fontWeight: 700,
            color: i === 5 || i === 6 ? "var(--tx3)" : "var(--tx2)",
            textTransform: "uppercase",
            letterSpacing: ".4px",
            paddingBottom: 6,
          }}
        >
          {d}
        </div>
      ))}
    </div>
  );

  // Expander button — dashed-outline, opens/collapses a sibling group.
  const expander = (open, setOpen, labelOpen, labelClosed) => (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      style={{
        width: "100%",
        padding: "10px 12px",
        margin: "8px 0",
        border: "1px dashed rgba(255,255,255,.16)",
        borderRadius: 10,
        background: "transparent",
        color: open ? "var(--tabby-green)" : "rgba(255,255,255,.7)",
        fontFamily: "var(--font)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "all .2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(60,255,165,.06)";
        e.currentTarget.style.borderColor = "rgba(60,255,165,.30)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "rgba(255,255,255,.16)";
      }}
    >
      <span style={{ transition: "transform .25s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      <span>{open ? labelOpen : labelClosed}</span>
    </button>
  );

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--tx)", letterSpacing: "-.2px" }}>
          {monthLabel}
        </div>
        {enhanced && viewingCurrentMonth && currentWeek && (
          <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 999, background: "rgba(60,255,165,.12)", color: "#3CFFA5", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px" }}>
            this week
          </span>
        )}
      </div>
      {dowHeader}

      {/* Enhanced + viewing current month: collapsed-by-default past +
          future weeks, with the current week always visible. */}
      {enhanced && viewingCurrentMonth && currentWeek ? (
        <>
          {pastWeeks.length > 0 && (
            <>
              {expander(
                pastOpen, setPastOpen,
                "Hide earlier weeks in this month",
                `Show ${pastWeeks.length} earlier week${pastWeeks.length === 1 ? "" : "s"}`,
              )}
              {pastOpen && pastWeeks.map((w, wi) => renderWeek(w, wi, { dimmed: true }))}
            </>
          )}
          {renderWeek(currentWeek, currentWeekIdx, { highlighted: true })}
          {futureWeeks.length > 0 && (
            <>
              {futureOpen && futureWeeks.map((w, wi) => renderWeek(w, wi + currentWeekIdx + 1))}
              {expander(
                futureOpen, setFutureOpen,
                "Hide upcoming weeks in this month",
                `Show ${futureWeeks.length} upcoming week${futureWeeks.length === 1 ? "" : "s"}`,
              )}
            </>
          )}
        </>
      ) : (
        /* Classic mode (or viewing past / future month): render every week. */
        weeks.map((w, wi) => renderWeek(w, wi))
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "var(--tx3)", fontStyle: "italic" }}>
        Click any day to set an attendance code. Today's date is highlighted.
      </div>
    </div>
  );
}
