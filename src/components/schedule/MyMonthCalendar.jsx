import React from "react";
import { ATT_MAP } from "../../lib/attendance.js";
import CalendarDayCell from "./CalendarDayCell.jsx";

// MyMonthCalendar — Google-Calendar-style 7-column month grid for the
// QA's own attendance. Replaces the wide table on the Calendar tab when
// the viewer is a QA (they only have one row anyway, so the grid is
// overkill). Reuses CellPicker via CalendarDayCell for the same
// click-to-edit flow.
//
// Extracted from SchedulePage 2026-05-08. Public API unchanged.
export default function MyMonthCalendar({
  selMonth, myEmail, attendance, monthIsLocked, isLead, isQA,
  editCell, setEditCell, pickerStage, pendingReason,
  onSetAtt, onApproveAtt, onClearAtt, setPendingReason, setPickerStage,
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

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--tx)", marginBottom: 10, letterSpacing: "-.2px" }}>
        {monthLabel}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
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
        {weeks.map((week, wi) =>
          week.map((day, di) => {
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
              />
            );
          }),
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "var(--tx3)", fontStyle: "italic" }}>
        Click any day to set an attendance code. Today's date is highlighted.
      </div>
    </div>
  );
}
