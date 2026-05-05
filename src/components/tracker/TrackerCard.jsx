import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PRIORITY_COLORS, TEAM_COLORS, TASK_TYPE_COLORS } from "../../lib/initiatives.js";
import { nameFromEmail } from "../../lib/utils.js";

// Single Tracker card. Used inside TrackerBoard (draggable) and the
// table view (non-draggable summary). The board variant wraps the
// card in @dnd-kit's sortable handlers.
//
// Props:
//   row       — initiative row from the DB
//   onOpen    — open detail modal
//   draggable — wire @dnd-kit useSortable when true (board view only)

export default function TrackerCard({ row, onOpen, draggable = false }) {
  const sortable = useSortable({ id: row.id, disabled: !draggable });
  const style = draggable
    ? {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.45 : 1,
        cursor: "grab",
      }
    : undefined;

  const overdue = row.eta_date && row.status !== "Done" && row.eta_date < new Date().toISOString().slice(0, 10);
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {row.title}
          </span>
          {row.priority && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0, background: PRIORITY_COLORS[row.priority]?.bg, color: PRIORITY_COLORS[row.priority]?.color }}>
              {row.priority}
            </span>
          )}
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
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>
            {row.assigned_to ? nameFromEmail(row.assigned_to) : <em style={{ opacity: 0.6 }}>Unassigned</em>}
          </span>
          {row.eta_date && (
            <span style={{ color: overdue ? "var(--red)" : "var(--tx3)", fontWeight: overdue ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
              {overdue ? "⚠ " : ""}{new Date(row.eta_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
