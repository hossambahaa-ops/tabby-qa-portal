import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  STATUSES, PRIORITIES, TEAMS, TASK_TYPES,
  TEAM_COLORS, TASK_TYPE_COLORS, STATUS_COLORS, trkRef,
} from "../../lib/initiatives.js";
import { nameFromEmail } from "../../lib/utils.js";
import SearchableSelect from "../SearchableSelect.jsx";

// TrackerDetailPanel — right-side slide-out, replaces the centered
// modal as the canonical detail surface. Designed so the board /
// timeline / table behind stays visible while the user reads or edits.
//
// Stack-aware: a parent can open one of its children straight from
// the inline subtask list, which pushes the child onto the stack.
// "Back" pops one. "Close" clears.
//
// Props
//   stack     — Array<{ kind: 'view'|'create', rowId?: string, parentId?: string }>
//   rows      — full initiatives list (for descendant + parent lookups)
//   profiles  — for the assignee picker
//   readOnlyFor(row) — function returning true iff viewer can't edit row
//   onClose      — () => void
//   onPop        — () => void  (back)
//   onSave       — (form) => Promise<row|undefined>
//   onDelete     — () => Promise<void>  (omit when not allowed)
//   onOpenRow    — (row) => void; pushes that row onto the stack
//   onOpenNew    — ({ parentId }) => void; pushes a create entry

const blank = (parentId) => ({
  title: "",
  description: "",
  status: "Not started",
  priority: "Medium",
  team: [],
  task_type: [],
  assigned_to: "",
  start_date: "",
  eta_date: "",
  links: [],
  parent_id: parentId || "",
});

function descendantIdSet(allRows, rootId) {
  const ids = new Set();
  if (!rootId) return ids;
  const queue = [rootId];
  let safety = 1000;
  while (queue.length && safety-- > 0) {
    const id = queue.shift();
    (allRows || []).forEach(r => {
      if (r.parent_id === id && !ids.has(r.id)) {
        ids.add(r.id);
        queue.push(r.id);
      }
    });
  }
  return ids;
}

const cleanForSave = (form) => {
  const out = { ...form };
  if (!out.start_date) out.start_date = null;
  if (!out.eta_date)   out.eta_date   = null;
  if (!out.assigned_to) out.assigned_to = null;
  if (!out.priority)    out.priority    = null;
  if (!out.parent_id)   out.parent_id   = null;
  out.links = (out.links || []).filter(l => l && (l.label || l.url));
  return out;
};

export default function TrackerDetailPanel({
  stack = [],
  rows = [],
  profiles = [],
  readOnlyFor,
  onClose, onPop, onSave, onDelete,
  onOpenRow, onOpenNew,
}) {
  const top = stack[stack.length - 1] || null;
  const currentRow = top?.kind === "view"
    ? (rows.find(r => r.id === top.rowId) || null)
    : null;
  const isCreate = top?.kind === "create";
  const readOnly = !isCreate && currentRow && readOnlyFor ? readOnlyFor(currentRow) : false;

  const [form, setForm] = useState(() => blank(top?.parentId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset form whenever the top of the stack changes — viewing a new
  // row or pushing a "create new subtask" entry.
  useEffect(() => {
    if (!top) return;
    if (top.kind === "create") {
      setForm(blank(top.parentId));
    } else if (currentRow) {
      setForm({
        title: currentRow.title || "",
        description: currentRow.description || "",
        status: currentRow.status || "Not started",
        priority: currentRow.priority || "",
        team: Array.isArray(currentRow.team) ? [...currentRow.team] : [],
        task_type: Array.isArray(currentRow.task_type) ? [...currentRow.task_type] : [],
        assigned_to: currentRow.assigned_to || "",
        start_date: currentRow.start_date || "",
        eta_date: currentRow.eta_date || "",
        links: Array.isArray(currentRow.links) ? [...currentRow.links] : [],
        parent_id: currentRow.parent_id || "",
      });
    }
    setError(null);
  }, [top, currentRow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc closes the whole panel; only fires when the panel is actually
  // showing something (stack non-empty).
  useEffect(() => {
    if (stack.length === 0) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack.length, onClose]);

  const peopleOptions = useMemo(() => (profiles || [])
    .filter(p => p.email)
    .map(p => ({ value: p.email.toLowerCase(), label: `${nameFromEmail(p.email)} (${p.email})` }))
    .sort((a, b) => a.label.localeCompare(b.label)),
    [profiles]);

  const parentOptions = useMemo(() => {
    const blocked = new Set();
    if (currentRow?.id) {
      blocked.add(currentRow.id);
      descendantIdSet(rows, currentRow.id).forEach(id => blocked.add(id));
    }
    const opts = (rows || [])
      .filter(r => !blocked.has(r.id))
      .map(r => ({
        value: r.id,
        label: `${trkRef(r)}  ·  ${r.title}${r.parent_id ? "  ·  ↳ sub" : ""}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "", label: "— None (top-level task) —" }, ...opts];
  }, [rows, currentRow?.id]);

  // Direct children for the inline subtask list. Sub-subtasks aren't
  // shown here on purpose — opening a child gives access to its own
  // children via its own panel.
  const directChildren = useMemo(() => {
    if (!currentRow?.id) return [];
    return (rows || [])
      .filter(r => r.parent_id === currentRow.id)
      .sort((a, b) => {
        const ea = a.eta_date || "9999-12-31";
        const eb = b.eta_date || "9999-12-31";
        if (ea !== eb) return ea < eb ? -1 : 1;
        return (a.created_at || "").localeCompare(b.created_at || "");
      });
  }, [rows, currentRow?.id]);

  const toggleArr = (key, val) => setForm(f => {
    const set = new Set(f[key] || []);
    if (set.has(val)) set.delete(val); else set.add(val);
    return { ...f, [key]: [...set] };
  });
  const updateLink = (i, field, val) => setForm(f => {
    const next = [...(f.links || [])];
    next[i] = { ...(next[i] || {}), [field]: val };
    return { ...f, links: next };
  });
  const removeLink = (i) => setForm(f => ({ ...f, links: (f.links || []).filter((_, k) => k !== i) }));
  const addLink    = () => setForm(f => ({ ...f, links: [...(f.links || []), { label: "", url: "" }] }));

  const save = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError(null);
    try {
      await onSave?.(cleanForSave(form));
      // For create: pop entry so we go back to whatever was below.
      // For edit:   stay open so the user can keep tweaking.
      if (isCreate) onPop?.();
    } catch (e) { setError(e.message || "Could not save."); }
    setSaving(false);
  };

  const open = stack.length > 0;

  // Always render the chrome so the slide-in transition has something
  // to animate against. When closed, translate it off-screen.
  return (
    <>
      {/* Backdrop — clicking closes the whole panel. Click events on
          the panel itself stop propagation so the user can interact
          inside without dismissing. */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 998,
          background: "rgba(0,0,0,0.4)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .18s ease",
        }}
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={currentRow ? currentRow.title : "Task detail"}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(560px, 100vw)",
          zIndex: 999,
          background: "var(--bg3)",
          borderLeft: "1px solid var(--bd)",
          boxShadow: "-12px 0 32px rgba(0,0,0,.18)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform .22s cubic-bezier(.2,.7,.2,1)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", gap: 8 }}>
          {stack.length > 1 && (
            <button
              onClick={onPop}
              aria-label="Back"
              style={{ background: "none", border: "1px solid var(--bd)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "var(--tx2)", fontSize: 12, fontWeight: 600 }}
            >← Back</button>
          )}
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isCreate ? "New task" : (currentRow?.title || "Task")}
          </div>
          {!isCreate && currentRow?.seq && (
            <button
              type="button"
              onClick={() => { try { navigator.clipboard?.writeText(trkRef(currentRow)); } catch { /* ignored */ } }}
              title="Click to copy"
              style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", letterSpacing: ".4px", padding: "3px 8px", borderRadius: 4, background: "var(--bg2)", border: "1px solid var(--bd2)", cursor: "pointer", fontVariantNumeric: "tabular-nums" }}
            >
              {trkRef(currentRow)}
            </button>
          )}
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--tx3)", padding: "0 6px" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {/* Subtask list — only when viewing an existing parent.
              Child can be opened in this same panel via the stack. */}
          {!isCreate && currentRow && (
            <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--bg2)", borderRadius: 8, border: "1px solid var(--bd2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: directChildren.length > 0 ? 8 : 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tx2)", textTransform: "uppercase", letterSpacing: ".4px" }}>
                  Subtasks {directChildren.length > 0 && <span style={{ color: "var(--tx3)" }}>({directChildren.length})</span>}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => onOpenNew?.({ parentId: currentRow.id })}
                    style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--tabby-purple)", background: "transparent", color: "var(--tabby-purple)", cursor: "pointer" }}
                  >+ Add subtask</button>
                )}
              </div>
              {directChildren.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {directChildren.map(c => {
                    const sm = STATUS_COLORS[c.status] || {};
                    const overdue = c.eta_date && c.status !== "Done" && c.eta_date < new Date().toISOString().slice(0, 10);
                    return (
                      <button
                        key={c.id}
                        onClick={() => onOpenRow?.(c)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--bd2)", background: "var(--bg)", cursor: "pointer", textAlign: "left" }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: sm.bg, color: sm.color, flexShrink: 0 }}>
                          {c.status === "Done" ? "✓" : c.status === "In progress" ? "▶" : "•"}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--tx3)", fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                          {trkRef(c)}
                        </span>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.title}
                        </span>
                        {c.assigned_to && (
                          <span style={{ fontSize: 10, color: "var(--tx3)", flexShrink: 0, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {nameFromEmail(c.assigned_to)}
                          </span>
                        )}
                        {c.eta_date && (
                          <span style={{ fontSize: 10, color: overdue ? "var(--red)" : "var(--tx3)", fontWeight: overdue ? 700 : 400, flexShrink: 0 }}>
                            {overdue ? "⚠ " : ""}{new Date(c.eta_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Form fields */}
          <div className="form-group">
            <label className="form-label">Title</label>
            <input type="text" className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Short summary…" disabled={readOnly} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea rows={3} className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Context, acceptance criteria…" disabled={readOnly} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Status</label>
              <select className="select form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} disabled={readOnly}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Priority</label>
              <select className="select form-input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} disabled={readOnly}>
                <option value="">—</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Start date</label>
              <input type="date" className="form-input" value={form.start_date || ""} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} disabled={readOnly} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">ETA</label>
              <input type="date" className="form-input" value={form.eta_date || ""} onChange={e => setForm(f => ({ ...f, eta_date: e.target.value }))} disabled={readOnly} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Assignee</label>
            <SearchableSelect options={peopleOptions} value={form.assigned_to || ""} onChange={(v) => setForm(f => ({ ...f, assigned_to: v }))} placeholder="Unassigned" disabled={readOnly} />
          </div>
          <div className="form-group">
            <label className="form-label">Parent task <span style={{ fontWeight: 400, color: "var(--tx3)" }}>(makes this a sub-task; nestable)</span></label>
            <SearchableSelect options={parentOptions} value={form.parent_id || ""} onChange={(v) => setForm(f => ({ ...f, parent_id: v }))} placeholder="— None (top-level task) —" disabled={readOnly} />
          </div>
          <div className="form-group">
            <label className="form-label">Team</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TEAMS.map(t => {
                const on = form.team?.includes(t);
                return (
                  <button key={t} type="button" onClick={() => !readOnly && toggleArr("team", t)} disabled={readOnly}
                    style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 12, border: `1px solid ${on ? (TEAM_COLORS[t] || "var(--tx2)") : "var(--bd)"}`, background: on ? (TEAM_COLORS[t] + "22") : "transparent", color: on ? TEAM_COLORS[t] : "var(--tx2)", cursor: readOnly ? "default" : "pointer" }}>{t}</button>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Task type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TASK_TYPES.map(t => {
                const on = form.task_type?.includes(t);
                return (
                  <button key={t} type="button" onClick={() => !readOnly && toggleArr("task_type", t)} disabled={readOnly}
                    style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 12, border: `1px solid ${on ? (TASK_TYPE_COLORS[t] || "var(--tx2)") : "var(--bd)"}`, background: on ? (TASK_TYPE_COLORS[t] + "22") : "transparent", color: on ? TASK_TYPE_COLORS[t] : "var(--tx2)", cursor: readOnly ? "default" : "pointer" }}>{t}</button>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Links</span>
              {!readOnly && (
                <button type="button" onClick={addLink} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--bd)", background: "transparent", color: "var(--tx2)", cursor: "pointer" }}>+ Add</button>
              )}
            </label>
            {(form.links || []).length === 0 && <div style={{ fontSize: 11, color: "var(--tx3)", fontStyle: "italic" }}>No links yet.</div>}
            {(form.links || []).map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 6, marginBottom: 6 }}>
                <input type="text" className="form-input" placeholder="Label" value={l.label || ""} onChange={e => updateLink(i, "label", e.target.value)} disabled={readOnly} />
                <input type="url" className="form-input" placeholder="https://…" value={l.url || ""} onChange={e => updateLink(i, "url", e.target.value)} disabled={readOnly} />
                {!readOnly && (
                  <button type="button" onClick={() => removeLink(i)} style={{ fontSize: 14, padding: "0 8px", border: "1px solid var(--bd)", background: "transparent", color: "var(--red)", cursor: "pointer", borderRadius: 4 }}>×</button>
                )}
              </div>
            ))}
          </div>

          {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}

          {!isCreate && currentRow?.created_by && (
            <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--bd2)" }}>
              Created by {nameFromEmail(currentRow.created_by)} · {new Date(currentRow.created_at).toLocaleString()}
              {currentRow.updated_at && currentRow.updated_at !== currentRow.created_at && (
                <> · Updated {new Date(currentRow.updated_at).toLocaleString()}</>
              )}
              {currentRow.completed_at && (
                <> · Completed {new Date(currentRow.completed_at).toLocaleString()}</>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--bd)", padding: "10px 18px", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            {!isCreate && onDelete && !readOnly && (
              <button className="btn btn-outline btn-sm" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={async () => { if (window.confirm("Delete this task?")) { await onDelete(); onClose?.(); } }}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
            {!readOnly && (
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : isCreate ? "Create" : "Save"}
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
