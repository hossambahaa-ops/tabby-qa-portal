import React, { useState, useMemo } from "react";
import { STATUS_COLORS, PRIORITY_COLORS, TEAM_COLORS, TASK_TYPE_COLORS } from "../../lib/initiatives.js";
import { nameFromEmail } from "../../lib/utils.js";

// Sortable, scannable table view. Click a row to open the modal.
// Sort indicator is a single-character glyph next to the column header.
// Phase 1 keeps it simple — no inline edit, no row selection.

const COLUMNS = [
  { key: "title",       label: "Title",     sortable: true,  width: 280 },
  { key: "status",      label: "Status",    sortable: true,  width: 110 },
  { key: "priority",    label: "Priority",  sortable: true,  width: 80  },
  { key: "assigned_to", label: "Assignee",  sortable: true,  width: 140 },
  { key: "team",        label: "Team",      sortable: false, width: 180 },
  { key: "task_type",   label: "Type",      sortable: false, width: 180 },
  { key: "eta_date",    label: "ETA",       sortable: true,  width: 100 },
  { key: "updated_at",  label: "Updated",   sortable: true,  width: 100 },
];

const cmp = (a, b, key) => {
  const av = a?.[key];
  const bv = b?.[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv);
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
};

export default function TrackerTable({ rows, onOpen }) {
  const [sortKey, setSortKey] = useState("updated_at");
  const [sortDir, setSortDir] = useState("desc");

  const sorted = useMemo(() => {
    const out = [...(rows || [])];
    out.sort((a, b) => {
      const r = cmp(a, b, sortKey);
      return sortDir === "asc" ? r : -r;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const arrow = (k) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="card" style={{ overflow: "auto" }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--bd)", background: "var(--bg3)" }}>
            {COLUMNS.map(c => (
              <th
                key={c.key}
                onClick={() => c.sortable && toggleSort(c.key)}
                style={{
                  padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "var(--tx2)",
                  fontSize: 11, cursor: c.sortable ? "pointer" : "default",
                  userSelect: "none", minWidth: c.width,
                }}
              >
                {c.label}{c.sortable ? arrow(c.key) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} style={{ padding: 28, textAlign: "center", color: "var(--tx3)", fontStyle: "italic" }}>
                No tasks match the current filters.
              </td>
            </tr>
          )}
          {sorted.map(r => {
            const sm = STATUS_COLORS[r.status] || {};
            const pm = r.priority ? PRIORITY_COLORS[r.priority] : null;
            const overdue = r.eta_date && r.status !== "Done" && r.eta_date < new Date().toISOString().slice(0, 10);
            return (
              <tr
                key={r.id}
                onClick={() => onOpen?.(r)}
                style={{ borderBottom: "1px solid var(--bd)", cursor: "pointer", transition: "background-color .1s ease" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg2)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 320 }}>
                  {r.title}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: sm.bg, color: sm.color, border: `1px solid ${sm.border || "transparent"}` }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  {pm ? (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: pm.bg, color: pm.color }}>
                      {r.priority}
                    </span>
                  ) : <span style={{ color: "var(--tx3)" }}>—</span>}
                </td>
                <td style={{ padding: "10px 12px", color: r.assigned_to ? "var(--tx)" : "var(--tx3)" }}>
                  {r.assigned_to ? nameFromEmail(r.assigned_to) : "—"}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(r.team || []).slice(0, 4).map(t => (
                      <span key={t} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: (TEAM_COLORS[t] || "#6B7280") + "22", color: TEAM_COLORS[t] || "var(--tx2)", fontWeight: 600 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(r.task_type || []).slice(0, 3).map(t => (
                      <span key={t} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: (TASK_TYPE_COLORS[t] || "#6B7280") + "22", color: TASK_TYPE_COLORS[t] || "var(--tx2)", fontWeight: 600 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: "10px 12px", color: overdue ? "var(--red)" : "var(--tx2)", fontWeight: overdue ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
                  {overdue ? "⚠ " : ""}{r.eta_date ? new Date(r.eta_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--tx3)", fontVariantNumeric: "tabular-nums" }}>
                  {r.updated_at ? new Date(r.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
