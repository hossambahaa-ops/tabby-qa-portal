import React, { useState, useMemo, useCallback } from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUSES, STATUS_COLORS, WIP_LIMITS } from "../../lib/initiatives.js";
import { nameFromEmail } from "../../lib/utils.js";
import TrackerCard from "./TrackerCard.jsx";

// Kanban view. Columns are statuses; cards are initiatives. Drag a card
// across columns to PATCH its status. Drag-within-column reordering is
// intentionally NOT supported in Phase 1 — the cards sort by ETA asc
// inside each column. Adding manual order is a Phase 2 thing.

function Column({ laneKey, status, items, onOpen, childCountsById, isSubMap, descendantsById, expandedSet, toggleExpanded }) {
  // Droppable id encodes BOTH lane and status when swimlanes are on.
  // The plain status string is preserved as the laneKey "_all" case so
  // the no-grouping branch keeps its existing drop behaviour.
  const dropId = laneKey === "_all" ? status : `${laneKey}|${status}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId, data: { kind: "column", status, laneKey } });
  const meta = STATUS_COLORS[status] || {};
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, minWidth: 240, display: "flex", flexDirection: "column",
        background: "var(--bg2)",
        borderRadius: 10,
        border: `1px solid ${isOver ? meta.border || "var(--tabby-purple)" : "var(--bd2)"}`,
        boxShadow: isOver ? "0 0 0 2px " + (meta.border || "var(--tabby-purple)") + "33" : "none",
        transition: "border-color .12s ease, box-shadow .12s ease",
        padding: 8,
        gap: 6,
        maxHeight: "calc(100vh - 240px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: meta.color || "var(--tx2)", textTransform: "uppercase", letterSpacing: ".4px" }}>
          {status}
        </span>
        {(() => {
          const wip = WIP_LIMITS[status];
          const over = wip != null && items.length > wip;
          if (wip == null) {
            return <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>{items.length}</span>;
          }
          return (
            <span
              title={over ? `Over WIP limit — ${items.length} in this column, soft cap is ${wip}` : `${items.length} of ${wip} (soft WIP cap)`}
              style={{
                fontSize: 11, fontWeight: 700,
                padding: "2px 7px", borderRadius: 10,
                background: over ? "rgba(245,158,11,0.15)" : "rgba(156,163,175,0.12)",
                color: over ? "var(--amber)" : "var(--tx3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {items.length} / {wip}
            </span>
          );
        })()}
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--tx3)", fontStyle: "italic", padding: 14, textAlign: "center" }}>Drop cards here</div>
          ) : (
            items.map(row => (
              <TrackerCard
                key={row.id}
                row={row}
                onOpen={onOpen}
                draggable
                childCounts={childCountsById?.get(row.id) || null}
                isSub={isSubMap?.get(row.id) || false}
                children={descendantsById?.get(row.id) || []}
                expanded={expandedSet?.has(row.id) || false}
                onToggleExpand={() => toggleExpanded?.(row.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

// Position math — sparse mid-point insertion. Keeps gaps so we don't
// have to renumber the whole column on every drag. Falls back to a
// 1024 base when both neighbours are missing (empty column).
function newPosBetween(prev, next) {
  if (prev == null && next == null) return 1024;
  if (prev == null) return (next || 0) - 512;
  if (next == null) return (prev || 0) + 512;
  return (prev + next) / 2;
}

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

// Pick the bucket a row belongs to under the current swimlane mode.
// Multi-select fields (team, task_type) use the FIRST entry alphabetically
// so each row appears in exactly one lane — keeps SortableContext IDs
// unique. Cards visually keep all their chips so the user still sees
// the full set; the lane is just for the layout decision.
function laneKeyFor(row, groupBy) {
  if (groupBy === "assignee") return row.assigned_to?.toLowerCase() || "__unassigned__";
  if (groupBy === "priority") return row.priority || "__none__";
  if (groupBy === "team") {
    const teams = (row.team || []).slice().sort();
    return teams[0] || "__none__";
  }
  return "_all";
}

function laneLabel(key, groupBy) {
  if (key === "_all") return "";
  if (groupBy === "assignee") return key === "__unassigned__" ? "Unassigned" : nameFromEmail(key);
  if (groupBy === "priority") return key === "__none__" ? "No priority" : key;
  if (groupBy === "team")     return key === "__none__" ? "No team" : key;
  return key;
}

// Stable lane order. For priority we want High first; for the others
// it's alphabetical with the "no value" lane last.
function sortLanes(keys, groupBy) {
  const sorted = [...keys];
  if (groupBy === "priority") {
    const rank = { High: 0, Medium: 1, Low: 2, __none__: 99 };
    sorted.sort((a, b) => (rank[a] ?? 50) - (rank[b] ?? 50));
  } else {
    sorted.sort((a, b) => {
      const aLast = a === "__unassigned__" || a === "__none__";
      const bLast = b === "__unassigned__" || b === "__none__";
      if (aLast && !bLast) return 1;
      if (!aLast && bLast) return -1;
      return a.localeCompare(b);
    });
  }
  return sorted;
}

// When a card crosses lanes (drag from Hossam's lane to Reem's),
// the target lane's value gets stamped onto the matching column on
// the row. For team grouping this OVERWRITES the team array with a
// single value — coarse but predictable; admins can re-add teams in
// the modal. Returns null when no group reassign is needed.
function buildLaneReassignPatch(row, fromLaneKey, toLaneKey, groupBy) {
  if (!groupBy || groupBy === "none" || fromLaneKey === toLaneKey) return null;
  if (groupBy === "assignee") {
    return { assigned_to: toLaneKey === "__unassigned__" ? null : toLaneKey };
  }
  if (groupBy === "priority") {
    return { priority: toLaneKey === "__none__" ? null : toLaneKey };
  }
  if (groupBy === "team") {
    return { team: toLaneKey === "__none__" ? [] : [toLaneKey] };
  }
  return null;
}

export default function TrackerBoard({ rows, onOpen, onStatusChange, onReorder, onLaneReassign, sortMode = "eta", groupBy = "none" }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Single computation: split rows into swimlanes (1 lane when groupBy
  // is "none"), then within each lane bucket by status. Each bucket is
  // sorted by the active sortMode. Result shape is the structure the
  // render path consumes directly.
  const lanes = useMemo(() => {
    const cmpEta = (a, b) => {
      const ea = a.eta_date || "9999-12-31";
      const eb = b.eta_date || "9999-12-31";
      if (ea !== eb) return ea < eb ? -1 : 1;
      return (a.created_at || "").localeCompare(b.created_at || "");
    };
    const cmpPos = (a, b) => {
      const pa = a.position == null ? Number.POSITIVE_INFINITY : Number(a.position);
      const pb = b.position == null ? Number.POSITIVE_INFINITY : Number(b.position);
      if (pa !== pb) return pa - pb;
      return (a.created_at || "").localeCompare(b.created_at || "");
    };
    const cmpPri = (a, b) => {
      const ra = PRIORITY_RANK[a.priority] ?? 9;
      const rb = PRIORITY_RANK[b.priority] ?? 9;
      if (ra !== rb) return ra - rb;
      return cmpEta(a, b);
    };
    const cmp = sortMode === "manual" ? cmpPos : sortMode === "priority" ? cmpPri : cmpEta;

    const laneRowMap = new Map();
    (rows || []).forEach(r => {
      const lk = laneKeyFor(r, groupBy);
      const arr = laneRowMap.get(lk) || [];
      arr.push(r);
      laneRowMap.set(lk, arr);
    });
    const orderedKeys = sortLanes([...laneRowMap.keys()], groupBy);
    return orderedKeys.map(k => {
      const buckets = Object.fromEntries(STATUSES.map(s => [s, []]));
      (laneRowMap.get(k) || []).forEach(r => {
        const s = STATUSES.includes(r.status) ? r.status : "Not started";
        buckets[s].push(r);
      });
      Object.keys(buckets).forEach(s => buckets[s].sort(cmp));
      return { key: k, label: laneLabel(k, groupBy), buckets };
    });
  }, [rows, sortMode, groupBy]);

  // Convenience: a flat status→items mapping for the no-grouping case
  // (used by the position-math drag handler so it knows the column's
  // live order). When grouped, we compute per-lane buckets on demand.
  const allByStatus = useMemo(() => {
    const buckets = Object.fromEntries(STATUSES.map(s => [s, []]));
    lanes.forEach(lane => STATUSES.forEach(s => buckets[s].push(...(lane.buckets[s] || []))));
    return buckets;
  }, [lanes]);

  // Pre-compute subtask roll-ups + the full descendant list per parent
  // so each card knows "X of Y children are done" AND can render the
  // expand drawer with the actual subtask rows. Done irrespective of
  // column — a parent's count covers all its descendants regardless of
  // which status they're in.
  const { childCountsById, descendantsById } = useMemo(() => {
    const counts = new Map();
    const desc = new Map();
    const childrenOf = new Map();
    (rows || []).forEach(r => {
      if (!r.parent_id) return;
      const arr = childrenOf.get(r.parent_id) || [];
      arr.push(r);
      childrenOf.set(r.parent_id, arr);
    });
    (rows || []).forEach(r => {
      const direct = childrenOf.get(r.id) || [];
      if (direct.length === 0) return;
      // BFS through descendants for the full roll-up (sub-subtasks too).
      const all = [];
      const queue = [...direct];
      const seen = new Set();
      while (queue.length) {
        const n = queue.shift();
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        all.push(n);
        (childrenOf.get(n.id) || []).forEach(c => queue.push(c));
      }
      counts.set(r.id, {
        total: all.length,
        done: all.filter(x => x.status === "Done").length,
      });
      // Sort the subtask drawer the same way columns sort: ETA asc,
      // then created. Parent-first means breadth-first ordering keeps
      // direct children grouped before grandchildren.
      const sorted = [...all].sort((a, b) => {
        const ea = a.eta_date || "9999-12-31";
        const eb = b.eta_date || "9999-12-31";
        if (ea !== eb) return ea < eb ? -1 : 1;
        return (a.created_at || "").localeCompare(b.created_at || "");
      });
      desc.set(r.id, sorted);
    });
    return { childCountsById: counts, descendantsById: desc };
  }, [rows]);

  // Per-card expand state for the subtask drawer. Only relevant for
  // parents (rows with descendants). Not persisted — collapses on
  // refresh by design so the board defaults to a clean view.
  const [expandedSet, setExpandedSet] = useState(() => new Set());
  const toggleExpanded = useCallback((id) => {
    setExpandedSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const isSubMap = useMemo(() => {
    const m = new Map();
    (rows || []).forEach(r => { if (r.parent_id) m.set(r.id, true); });
    return m;
  }, [rows]);

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;
    const dragged = (rows || []).find(r => r.id === active.id);
    if (!dragged) return;

    // Resolve the drop target into (laneKey, status). over.id is either:
    //   - a status string ("Not started")           — no-grouping column header
    //   - "{laneKey}|{status}"                       — grouped column header
    //   - a card id                                  — dropped on another card
    let targetLane = null;
    let targetStatus = null;
    const overIdStr = String(over.id);
    if (STATUSES.includes(overIdStr)) {
      targetStatus = overIdStr;
      targetLane = "_all";
    } else if (overIdStr.includes("|")) {
      const [lk, st] = overIdStr.split("|");
      if (STATUSES.includes(st)) { targetStatus = st; targetLane = lk; }
    } else {
      const overCard = (rows || []).find(r => r.id === over.id);
      if (overCard) {
        targetStatus = overCard.status;
        targetLane = laneKeyFor(overCard, groupBy);
      }
    }
    if (!targetStatus) return;

    const sourceLane = laneKeyFor(dragged, groupBy);

    // Lane reassign — assigning to a different person / priority / team
    // by drag-and-drop. Only fires when groupBy != "none" AND lanes
    // actually differ. Status is changed in the same patch so users
    // don't have to drop twice.
    if (groupBy && groupBy !== "none" && targetLane !== sourceLane) {
      const patch = buildLaneReassignPatch(dragged, sourceLane, targetLane, groupBy) || {};
      if (targetStatus !== dragged.status) patch.status = targetStatus;
      if (Object.keys(patch).length > 0) onLaneReassign?.(dragged, patch);
      return;
    }

    // Same lane → fall back to the existing same-lane behaviour.
    if (targetStatus !== dragged.status) {
      onStatusChange?.(dragged, targetStatus);
      return;
    }
    // Same lane + same column → manual reorder only.
    if (sortMode !== "manual") return;
    // Find the over card to compute neighbours. Dropping on a column
    // header in the same column with same lane is a no-op.
    const overCard = STATUSES.includes(overIdStr) || overIdStr.includes("|")
      ? null
      : (rows || []).find(r => r.id === over.id);
    if (!overCard) return;
    const laneRows = lanes.find(l => l.key === sourceLane)?.buckets[targetStatus] || [];
    const oldIdx = laneRows.findIndex(r => r.id === dragged.id);
    const newIdx = laneRows.findIndex(r => r.id === overCard.id);
    if (newIdx === -1) return;
    let newPos;
    if (oldIdx === -1) {
      const before = laneRows[newIdx - 1];
      newPos = newPosBetween(before?.position, overCard.position);
    } else if (newIdx > oldIdx) {
      const after = laneRows[newIdx + 1];
      newPos = newPosBetween(overCard.position, after?.position);
    } else if (newIdx < oldIdx) {
      const before = laneRows[newIdx - 1];
      newPos = newPosBetween(before?.position, overCard.position);
    } else {
      return;
    }
    onReorder?.(dragged, newPos);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div style={{ display: "flex", flexDirection: "column", gap: groupBy === "none" ? 0 : 14 }}>
        {lanes.map(lane => (
          <div key={lane.key}>
            {groupBy !== "none" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--tx)", letterSpacing: "-.1px" }}>
                  {lane.label}
                </span>
                <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>
                  · {STATUSES.reduce((n, s) => n + (lane.buckets[s]?.length || 0), 0)} task{STATUSES.reduce((n, s) => n + (lane.buckets[s]?.length || 0), 0) !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
              {STATUSES.map(s => (
                <Column
                  key={s}
                  laneKey={lane.key}
                  status={s}
                  items={lane.buckets[s] || []}
                  onOpen={onOpen}
                  childCountsById={childCountsById}
                  isSubMap={isSubMap}
                  descendantsById={descendantsById}
                  expandedSet={expandedSet}
                  toggleExpanded={toggleExpanded}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </DndContext>
  );
}
