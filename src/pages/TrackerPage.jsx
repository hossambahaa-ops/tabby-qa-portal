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
import TrackerEditModal from "../components/tracker/TrackerEditModal.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PlaceholderPage from "./PlaceholderPage.jsx";
import { Icon, icons } from "../components/Icons.jsx";

// Tracker — Phase 1.
//   - Board (Kanban) and Table views, toggleable.
//   - Filters: search, status, priority, team, task type, assignee, "Mine".
//   - Drag-and-drop status changes on Board.
//   - Click any card or row to open the edit modal.
//   - Permissions: senior_qa+ to view; creator/assignee/admin to edit.

const VIEW_KEY = "tracker_view_v1";

export default function TrackerPage() {
  const { token, profile, globalToast } = useApp();
  const myEmail = profile?.email?.toLowerCase() || "";
  const isAdmin = hasRole(profile?.role, "admin");

  // Role gate. The route guard in App.jsx already handles this, but a
  // belt-and-suspenders check here protects against deep-links from
  // viewers who get re-rendered after a role downgrade.
  if (!hasRole(profile?.role, "senior_qa")) {
    return <PlaceholderPage title="Tracker" icon={icons.tracker} minRole="senior_qa" userRole={profile?.role} />;
  }

  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || "board");
  const [modalRow, setModalRow] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReadOnly, setModalReadOnly] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fTeam, setFTeam] = useState("");
  const [fType, setFType] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter(r => {
      if (mineOnly && r.assigned_to?.toLowerCase() !== myEmail) return false;
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

  const openCreate = () => { setModalRow(null); setModalReadOnly(false); setModalOpen(true); };
  const openRow = (row) => {
    setModalRow(row);
    setModalReadOnly(!canEdit(row, myEmail, isAdmin));
    setModalOpen(true);
  };

  const onSave = async (form) => {
    if (modalRow) {
      const result = await updateInitiative({ token, id: modalRow.id, patch: form });
      const fresh = Array.isArray(result) ? result[0] : result;
      setRows(rs => rs.map(r => r.id === modalRow.id ? (fresh || { ...r, ...form }) : r));
      globalToast?.("success", "Task updated.");
    } else {
      const result = await createInitiative({ token, row: { ...form, created_by: myEmail } });
      const fresh = Array.isArray(result) ? result[0] : result;
      if (fresh) setRows(rs => [fresh, ...rs]);
      globalToast?.("success", "Task created.");
    }
  };

  const onDelete = async () => {
    if (!modalRow) return;
    if (!canDelete(modalRow, myEmail, isAdmin)) {
      globalToast?.("error", "You can only delete tasks you created.");
      return;
    }
    await deleteInitiative({ token, id: modalRow.id });
    setRows(rs => rs.filter(r => r.id !== modalRow.id));
    globalToast?.("success", "Task deleted.");
  };

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
            <button
              role="tab" aria-selected={view === "board"}
              onClick={() => setView("board")}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", border: "none", cursor: "pointer", background: view === "board" ? "var(--tabby-purple)" : "transparent", color: view === "board" ? "#fff" : "var(--tx2)" }}
            >Board</button>
            <button
              role="tab" aria-selected={view === "table"}
              onClick={() => setView("table")}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", border: "none", cursor: "pointer", background: view === "table" ? "var(--tabby-purple)" : "transparent", color: view === "table" ? "#fff" : "var(--tx2)" }}
            >Table</button>
          </div>
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
            options={[{ value: "", label: "All assignees" }, ...profiles.map(p => ({ value: p.email.toLowerCase(), label: p.display_name || p.email }))]}
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
        <TrackerBoard rows={filtered} onOpen={openRow} onStatusChange={onStatusChange} />
      ) : (
        <TrackerTable rows={filtered} onOpen={openRow} />
      )}

      <TrackerEditModal
        open={modalOpen}
        row={modalRow}
        readOnly={modalReadOnly}
        profiles={profiles}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
        onDelete={modalRow && canDelete(modalRow, myEmail, isAdmin) ? onDelete : undefined}
      />
    </div>
  );
}
