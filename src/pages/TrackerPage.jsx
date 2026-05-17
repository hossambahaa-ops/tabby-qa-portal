import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useApp } from "../lib/AppContext.jsx";
import { hasRole } from "../lib/constants.js";
import { listInitiatives, createInitiative, updateInitiative, deleteInitiative } from "../api/initiatives.js";
import { listProfiles } from "../api/profiles.js";
import {
  STATUSES, PRIORITIES, TEAMS, TASK_TYPES,
  canEdit, canDelete,
} from "../lib/initiatives.js";
import TrackerBoard from "../components/tracker/TrackerBoard.jsx";
import TrackerTable from "../components/tracker/TrackerTable.jsx";
import TrackerTimeline from "../components/tracker/TrackerTimeline.jsx";
import TrackerDetailPanel from "../components/tracker/TrackerDetailPanel.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { nameFromEmail } from "../lib/utils.js";
import PlaceholderPage from "./PlaceholderPage.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { useAutoRefresh } from "../lib/hooks.jsx";

// Tracker — Phase 1.
//   - Board (Kanban) and Table views, toggleable.
//   - Filters: search, status, priority, team, task type, assignee, "Mine".
//   - Drag-and-drop status changes on Board.
//   - Click any card or row to open the edit modal.
//   - Permissions: senior_qa+ to view; creator/assignee/admin to edit.

const VIEW_KEY  = "tracker_view_v1";
const SORT_KEY  = "tracker_board_sort_v1";
const GROUP_KEY = "tracker_board_group_v1";

export default function TrackerPage() {
  const { token, profile, globalToast } = useApp();
  const myEmail = profile?.email?.toLowerCase() || "";
  const isAdmin = hasRole(profile?.role, "admin");

  // Role gate captured before any hooks so we can branch the render
  // at the BOTTOM (post-hooks) rather than early-returning above the
  // useState calls. Early-returning above hooks would break React's
  // hooks-order invariant when a viewer's role drops mid-session and
  // the component re-renders along the no-permission branch — it
  // would throw "Rendered fewer hooks than expected" and white-
  // screen the page. The route guard in App.jsx is still the
  // primary protection; this is the belt-and-suspenders branch.
  const allowed = hasRole(profile?.role, "senior_qa");

  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || "board");
  const [boardSort,  setBoardSort]  = useState(() => localStorage.getItem(SORT_KEY)  || "eta");
  const [boardGroup, setBoardGroup] = useState(() => localStorage.getItem(GROUP_KEY) || "none");
  // Slide-out panel stack. Each entry is either { kind: 'view', rowId }
  // or { kind: 'create', parentId? }. The top of the stack is what the
  // panel currently displays; back pops one, close clears.
  const [panelStack, setPanelStack] = useState([]);
  const pushPanel = useCallback((entry) => setPanelStack(prev => [...prev, entry]), []);
  const popPanel  = useCallback(() => setPanelStack(prev => prev.slice(0, -1)), []);
  const closePanel = useCallback(() => setPanelStack([]), []);

  // Filters
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fTeam, setFTeam] = useState("");
  const [fType, setFType] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);
  useEffect(() => { localStorage.setItem(SORT_KEY,  boardSort);  }, [boardSort]);
  useEffect(() => { localStorage.setItem(GROUP_KEY, boardGroup); }, [boardGroup]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [initiatives, profs] = await Promise.all([
        listInitiatives({ token }),
        listProfiles({ token, select: "email,display_name,role,status" }),
      ]);
      setRows(initiatives);
      setProfiles(profs.filter(p => p.email && p.status !== "deactivated"));
    } catch (e) {
      globalToast?.("error", e.message || "Failed to load tracker.");
    }
    setLoading(false);
  }, [token, globalToast]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 60000);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter(r => {
      // "Mine only" now matches either assigned_to OR created_by so a
      // task the user opened (but didn't yet assign to themselves)
      // doesn't disappear from their own filter the moment they pick
      // a different assignee.
      if (mineOnly && r.assigned_to?.toLowerCase() !== myEmail && r.created_by?.toLowerCase() !== myEmail) return false;
      if (fStatus   && r.status   !== fStatus)   return false;
      if (fPriority && r.priority !== fPriority) return false;
      if (fAssignee && r.assigned_to?.toLowerCase() !== fAssignee) return false;
      if (fTeam     && !(r.team || []).includes(fTeam))           return false;
      if (fType     && !(r.task_type || []).includes(fType))     return false;
      if (q) {
        const hay = `${r.title || ""} ${r.description || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fStatus, fPriority, fAssignee, fTeam, fType, mineOnly, myEmail]);

  // Optimistic status change from drag-drop on the board.
  const onStatusChange = async (row, nextStatus) => {
    const prev = row.status;
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, status: nextStatus } : r));
    try {
      const result = await updateInitiative({ token, id: row.id, patch: { status: nextStatus } });
      const fresh = Array.isArray(result) ? result[0] : result;
      if (fresh) setRows(rs => rs.map(r => r.id === row.id ? fresh : r));
    } catch (e) {
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, status: prev } : r));
      globalToast?.("error", "Move failed: " + (e.message || ""));
    }
  };

  // Manual reorder within a column. Position is a sparse numeric so we
  // can usually drop a card between two neighbours without renumbering.
  // Optimistic update + rollback on RLS reject.
  const onReorder = async (row, newPosition) => {
    const prev = row.position;
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, position: newPosition } : r));
    try {
      const result = await updateInitiative({ token, id: row.id, patch: { position: newPosition } });
      const fresh = Array.isArray(result) ? result[0] : result;
      if (fresh) setRows(rs => rs.map(r => r.id === row.id ? fresh : r));
    } catch (e) {
      setRows(rs => rs.map(r => r.id === row.id ? { ...r, position: prev } : r));
      globalToast?.("error", "Reorder failed: " + (e.message || ""));
    }
  };

  // Cross-lane drag → reassign the grouping attribute (assignee /
  // priority / first team) AND maybe the status in one PATCH. Same
  // optimistic + rollback flow.
  const onLaneReassign = async (row, patch) => {
    const prev = { ...row };
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, ...patch } : r));
    try {
      const result = await updateInitiative({ token, id: row.id, patch });
      const fresh = Array.isArray(result) ? result[0] : result;
      if (fresh) setRows(rs => rs.map(r => r.id === row.id ? fresh : r));
    } catch (e) {
      setRows(rs => rs.map(r => r.id === row.id ? prev : r));
      globalToast?.("error", "Reassign failed: " + (e.message || ""));
    }
  };

  const openCreate = useCallback(() => setPanelStack([{ kind: "create" }]), []);
  const openRow    = useCallback((row) => setPanelStack([{ kind: "view", rowId: row.id }]), []);
  const openNewSubtask = useCallback(({ parentId } = {}) => pushPanel({ kind: "create", parentId }), [pushPanel]);
  const openChildRow = useCallback((row) => pushPanel({ kind: "view", rowId: row.id }), [pushPanel]);

  // Look up the row currently shown by the panel (top of stack).
  const top = panelStack[panelStack.length - 1] || null;
  const currentRow = top?.kind === "view"
    ? rows.find(r => r.id === top.rowId)
    : null;

  const onSave = async (form) => {
    if (top?.kind === "view" && currentRow) {
      const result = await updateInitiative({ token, id: currentRow.id, patch: form });
      const fresh = Array.isArray(result) ? result[0] : result;
      setRows(rs => rs.map(r => r.id === currentRow.id ? (fresh || { ...r, ...form }) : r));
      globalToast?.("success", "Task updated.");
    } else {
      const result = await createInitiative({ token, row: { ...form, created_by: myEmail } });
      const fresh = Array.isArray(result) ? result[0] : result;
      if (fresh) setRows(rs => [fresh, ...rs]);
      globalToast?.("success", "Task created.");
    }
  };

  const onDelete = async () => {
    if (!currentRow) return;
    if (!canDelete(currentRow, myEmail, isAdmin)) {
      globalToast?.("error", "You can only delete tasks you created.");
      return;
    }
    await deleteInitiative({ token, id: currentRow.id });
    setRows(rs => rs.filter(r => r.id !== currentRow.id));
    globalToast?.("success", "Task deleted.");
  };

  // Role-downgraded viewer falls through to the PlaceholderPage
  // AFTER every hook above has run — preserves the call order.
  if (!allowed) {
    return <PlaceholderPage title="Tracker" icon={icons.tracker} minRole="senior_qa" userRole={profile?.role} />;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div className="page-title">Tracker</div>
          <div className="page-subtitle">Unit-level work items — Kanban + table for senior QAs and above.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div role="tablist" aria-label="View" style={{ display: "inline-flex", border: "1px solid var(--bd)", borderRadius: 8, overflow: "hidden", background: "var(--bg2)" }}>
            {[
              { key: "board",    label: "Board" },
              { key: "table",    label: "Table" },
              { key: "timeline", label: "Timeline" },
            ].map(t => (
              <button
                key={t.key}
                role="tab" aria-selected={view === t.key}
                onClick={() => setView(t.key)}
                style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", border: "none", cursor: "pointer", background: view === t.key ? "var(--tabby-purple)" : "transparent", color: view === t.key ? "#fff" : "var(--tx2)" }}
              >{t.label}</button>
            ))}
          </div>
          {view === "board" && (
            <>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--tx3)" }}>
                Group
                <select
                  value={boardGroup}
                  onChange={e => setBoardGroup(e.target.value)}
                  className="select"
                  style={{ fontSize: 11, padding: "4px 8px" }}
                >
                  <option value="none">None</option>
                  <option value="assignee">Assignee</option>
                  <option value="team">Team</option>
                  <option value="priority">Priority</option>
                </select>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--tx3)" }}>
                Sort
                <select
                  value={boardSort}
                  onChange={e => setBoardSort(e.target.value)}
                  className="select"
                  style={{ fontSize: 11, padding: "4px 8px" }}
                >
                  <option value="eta">ETA</option>
                  <option value="manual">Manual (drag)</option>
                  <option value="priority">Priority</option>
                </select>
              </div>
            </>
          )}
          <button className="btn btn-primary btn-sm" onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon d={icons.plus} size={14} /> New task
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: "10px 12px", marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          placeholder="Search title or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 220, flex: "0 0 240px", fontSize: 12 }}
        />
        <select className="select" value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" value={fPriority} onChange={e => setFPriority(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="select" value={fTeam} onChange={e => setFTeam(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">All teams</option>
          {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="select" value={fType} onChange={e => setFType(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">All types</option>
          {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ minWidth: 220 }}>
          <SearchableSelect
            options={[{ value: "", label: "All assignees" }, ...profiles.map(p => ({ value: p.email.toLowerCase(), label: nameFromEmail(p.email) }))]}
            value={fAssignee}
            onChange={setFAssignee}
            placeholder="All assignees"
          />
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tx2)", cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} style={{ accentColor: "var(--tabby-purple)" }} />
          Mine only
        </label>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--tx3)" }}>{filtered.length} of {rows.length}</span>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--tx3)" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create the first one — it'll show up on the board for everyone in the unit."
          cta={{ label: "New task", onClick: openCreate }}
        />
      ) : view === "board" ? (
        <TrackerBoard
          rows={filtered}
          onOpen={openRow}
          onStatusChange={onStatusChange}
          onReorder={onReorder}
          onLaneReassign={onLaneReassign}
          sortMode={boardSort}
          groupBy={boardGroup}
        />
      ) : view === "timeline" ? (
        <TrackerTimeline rows={filtered} onOpen={openRow} />
      ) : (
        <TrackerTable rows={filtered} onOpen={openRow} />
      )}

      <TrackerDetailPanel
        stack={panelStack}
        rows={rows}
        profiles={profiles}
        readOnlyFor={(row) => !canEdit(row, myEmail, isAdmin)}
        onClose={closePanel}
        onPop={popPanel}
        onSave={onSave}
        onDelete={currentRow && canDelete(currentRow, myEmail, isAdmin) ? onDelete : undefined}
        onOpenRow={openChildRow}
        onOpenNew={openNewSubtask}
      />
    </div>
  );
}
