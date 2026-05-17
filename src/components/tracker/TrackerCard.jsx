import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PRIORITY_COLORS, TEAM_COLORS, TASK_TYPE_COLORS, STATUS_COLORS, trkRef } from "../../lib/initiatives.js";
import { nameFromEmail } from "../../lib/utils.js";
import { riyadhTodayStr } from "../../lib/attendancePlan.js";

// Single Tracker card. Used inside TrackerBoard (draggable) and the
// table view (non-draggable summary). The board variant wraps the
// card in @dnd-kit's sortable handlers.
//
// Props:
//   row          — initiative row from the DB
//   onOpen       — open detail modal
//   draggable    — wire @dnd-kit useSortable when true (board view only)
//   childCounts  — { total: N, done: M } | null — when present, render
//                  a subtask badge so the lead can see "3 ▸ 1 done" at
//                  a glance without expanding anything.
//   isSub        — true if this card itself has a parent (rendered
//                  under another card on the board)
//   children     — full descendant rows (BFS) used by the expand drawer.
//                  When non-empty, the card renders a chevron toggle.
//   expanded     — drawer state controlled by the parent
//   onToggleExpand — () => void — fired when the chevron is clicked

export default function TrackerCard({ row, onOpen, draggable = false, childCounts = null, isSub = false, children = [], expanded = false, onToggleExpand }) {
  const sortable = useSortable({ id: row.id, disabled: !draggable });
  const style = draggable
    ? {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.45 : 1,
        cursor: "grab",
      }
    : undefined;

  const overdue = row.eta_date && row.status !== "Done" && row.eta_date < riyadhTodayStr();
  const teamChips = (row.team || []).slice(0, 3);
  const typeChips = (row.task_type || []).slice(0, 2);

  return (
    <div
      ref={draggable ? sortable.setNodeRef : undefined}
      {...(draggable ? sortable.attributes : {})}
      {...(draggable ? sortable.listeners : {})}
      style={style}
      onClick={(e) => {
        // Drag listeners eat the click during a drag; a real click
        // should still open the modal. dnd-kit reports isDragging,
        // we just suppress the open if we were dragging.
        if (sortable.isDragging) return;
        onOpen?.(row);
      }}
      className="card"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(row); } }}
      role="button"
      aria-label={`Open ${row.title}`}
    >
      <div style={{ padding: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--tx3)", letterSpacing: ".4px", fontVariantNumeric: "tabular-nums" }}>
            {trkRef(row)}
          </span>
          {row.priority && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0, background: PRIORITY_COLORS[row.priority]?.bg, color: PRIORITY_COLORS[row.priority]?.color }}>
              {row.priority}
            </span>
          )}
        </div>
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {row.title}
          </span>
        </div>

        {(teamChips.length > 0 || typeChips.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {teamChips.map(t => (
              <span key={"team-"+t} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: (TEAM_COLORS[t] || "#6B7280") + "22", color: TEAM_COLORS[t] || "var(--tx2)", fontWeight: 600 }}>{t}</span>
            ))}
            {typeChips.map(t => (
              <span key={"type-"+t} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: (TASK_TYPE_COLORS[t] || "#6B7280") + "22", color: TASK_TYPE_COLORS[t] || "var(--tx2)", fontWeight: 600 }}>{t}</span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "var(--tx3)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110, display: "flex", alignItems: "center", gap: 4 }}>
            {isSub && <span title="Sub-task" style={{ color: "var(--tx3)" }}>↳</span>}
            {row.assigned_to ? nameFromEmail(row.assigned_to) : <em style={{ opacity: 0.6 }}>Unassigned</em>}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {childCounts && childCounts.total > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
                onPointerDown={(e) => e.stopPropagation()}
                title={`${childCounts.total} sub-task${childCounts.total !== 1 ? "s" : ""}, ${childCounts.done} done — click to expand`}
                style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                  background: expanded ? "var(--tabby-purple)" : "rgba(106,44,121,0.15)",
                  color: expanded ? "#fff" : "var(--tabby-purple)",
                  border: "none", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 3,
                  lineHeight: 1,
                }}
              >
                {expanded ? "▾" : "▸"} {childCounts.done}/{childCounts.total}
              </button>
            )}
            {row.eta_date && (
              <span style={{ color: overdue ? "var(--red)" : "var(--tx3)", fontWeight: overdue ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
                {overdue ? "⚠ " : ""}{new Date(row.eta_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </span>
        </div>

        {/* Subtask drawer — opens INSIDE the parent card so the
            relationship is visible without leaving the column. Children
            still appear as standalone cards in their own status
            columns; this drawer is the navigation aid, not the
            authoritative location. Click a child to open its detail. */}
        {expanded && children.length > 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--bd)", display: "flex", flexDirection: "column", gap: 4 }}
          >
            {children.map(child => {
              const sm = STATUS_COLORS[child.status] || {};
              const childOverdue = child.eta_date && child.status !== "Done" && child.eta_date < riyadhTodayStr();
              return (
                <button
                  key={child.id}
                  onClick={(e) => { e.stopPropagation(); onOpen?.(child); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 6px", borderRadius: 4,
                    background: "var(--bg2)", border: "1px solid var(--bd2)",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                >
                  <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: sm.bg, color: sm.color, flexShrink: 0, whiteSpace: "nowrap" }}>
                    {child.status === "Done" ? "✓" : child.status === "In progress" ? "▶" : "•"}
                  </span>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {child.title}
                  </span>
                  {child.assigned_to && (
                    <span style={{ fontSize: 9, color: "var(--tx3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 70 }}>
                      {nameFromEmail(child.assigned_to)}
                    </span>
                  )}
                  {child.eta_date && (
                    <span style={{ fontSize: 9, color: childOverdue ? "var(--red)" : "var(--tx3)", fontWeight: childOverdue ? 700 : 400, flexShrink: 0 }}>
                      {childOverdue ? "⚠ " : ""}{new Date(child.eta_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
