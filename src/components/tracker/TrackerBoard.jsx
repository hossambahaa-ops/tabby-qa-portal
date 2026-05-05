import React, { useState, useMemo, useCallback } from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { STATUSES, STATUS_COLORS } from "../../lib/initiatives.js";
import TrackerCard from "./TrackerCard.jsx";

// Kanban view. Columns are statuses; cards are initiatives. Drag a card
// across columns to PATCH its status. Drag-within-column reordering is
// intentionally NOT supported in Phase 1 — the cards sort by ETA asc
// inside each column. Adding manual order is a Phase 2 thing.

function Column({ status, items, onOpen, childCountsById, isSubMap, descendantsById, expandedSet, toggleExpanded }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { kind: "column", status } });
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
        <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>{items.length}</span>
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

export default function TrackerBoard({ rows, onOpen, onStatusChange }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const grouped = useMemo(() => {
    const buckets = Object.fromEntries(STATUSES.map(s => [s, []]));
    (rows || []).forEach(r => {
      const s = STATUSES.includes(r.status) ? r.status : "Not started";
      buckets[s].push(r);
    });
    // Sort each column by ETA asc, then created_at asc for cards without ETA.
    Object.keys(buckets).forEach(k => {
      buckets[k].sort((a, b) => {
        const ea = a.eta_date || "9999-12-31";
        const eb = b.eta_date || "9999-12-31";
        if (ea !== eb) return ea < eb ? -1 : 1;
        return (a.created_at || "").localeCompare(b.created_at || "");
      });
    });
    return buckets;
  }, [rows]);

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
    // Drop target is either a column (id = status) or another card —
    // when dropped on a card, dnd-kit gives us the card's id; we then
    // look up that card's status as the target column.
    let targetStatus = STATUSES.includes(over.id) ? over.id : null;
    if (!targetStatus) {
      const card = (rows || []).find(r => r.id === over.id);
      targetStatus = card?.status || null;
    }
    if (!targetStatus) return;
    const dragged = (rows || []).find(r => r.id === active.id);
    if (!dragged || dragged.status === targetStatus) return;
    onStatusChange?.(dragged, targetStatus);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        {STATUSES.map(s => (
          <Column
            key={s}
            status={s}
            items={grouped[s] || []}
            onOpen={onOpen}
            childCountsById={childCountsById}
            isSubMap={isSubMap}
            descendantsById={descendantsById}
            expandedSet={expandedSet}
            toggleExpanded={toggleExpanded}
          />
        ))}
      </div>
    </DndContext>
  );
}
