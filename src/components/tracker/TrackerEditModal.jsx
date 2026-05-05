import React, { useState, useEffect, useMemo } from "react";
import {
  STATUSES, PRIORITIES, TEAMS, TASK_TYPES,
  TEAM_COLORS, TASK_TYPE_COLORS,
} from "../../lib/initiatives.js";
import { nameFromEmail } from "../../lib/utils.js";
import SearchableSelect from "../SearchableSelect.jsx";

// Tracker create/edit modal. Reuses Pulse's modal styling. Props:
//   open    — boolean
//   row     — null for create, existing row for edit/view
//   readOnly — when true, fields are disabled (viewer can't edit)
//   profiles — full app profiles list, used for the assignee picker
//   onClose — () => void
//   onSave  — (patch) => Promise<void>; patch is partial for edit, full for create
//   onDelete — () => Promise<void> | undefined (omit to hide the delete btn)

const blank = () => ({
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
});

const cleanForSave = (form) => {
  const out = { ...form };
  // Empty-string dates need to become null for Postgres date columns.
  if (!out.start_date) out.start_date = null;
  if (!out.eta_date) out.eta_date = null;
  if (!out.assigned_to) out.assigned_to = null;
  if (!out.priority) out.priority = null;
  // links: drop empty rows.
  out.links = (out.links || []).filter(l => l && (l.label || l.url));
  return out;
};

export default function TrackerEditModal({ open, row, readOnly, profiles, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (row) {
      setForm({
        title: row.title || "",
        description: row.description || "",
        status: row.status || "Not started",
        priority: row.priority || "",
        team: Array.isArray(row.team) ? [...row.team] : [],
        task_type: Array.isArray(row.task_type) ? [...row.task_type] : [],
        assigned_to: row.assigned_to || "",
        start_date: row.start_date || "",
        eta_date: row.eta_date || "",
        links: Array.isArray(row.links) ? [...row.links] : [],
      });
    } else {
      setForm(blank());
    }
    setError(null);
  }, [open, row]);

  const peopleOptions = useMemo(() => {
    return (profiles || [])
      .filter(p => p.email)
      .map(p => ({ value: p.email.toLowerCase(), label: `${nameFromEmail(p.email)} (${p.email})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [profiles]);

  if (!open) return null;

  const toggleArrayValue = (key, val) => {
    setForm(f => {
      const set = new Set(f[key] || []);
      if (set.has(val)) set.delete(val); else set.add(val);
      return { ...f, [key]: [...set] };
    });
  };

  const updateLink = (i, field, val) => setForm(f => {
    const next = [...(f.links || [])];
    next[i] = { ...(next[i] || {}), [field]: val };
    return { ...f, links: next };
  });
  const removeLink = (i) => setForm(f => ({ ...f, links: (f.links || []).filter((_, k) => k !== i) }));
  const addLink = () => setForm(f => ({ ...f, links: [...(f.links || []), { label: "", url: "" }] }));

  const save = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError(null);
    try {
      await onSave(cleanForSave(form));
      onClose();
    } catch (e) { setError(e.message || "Could not save."); }
    setSaving(false);
  };

  const isEdit = !!row;
  const fieldDisabled = readOnly;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 40 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg3)", borderRadius: 14, border: "1px solid var(--bd)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--tx)" }}>
            {isEdit ? (readOnly ? "View task" : "Edit task") : "New task"}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--tx3)" }}>×</button>
        </div>

        <div className="form-group">
          <label className="form-label">Title</label>
          <input type="text" className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Short summary…" disabled={fieldDisabled} />
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea rows={3} className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Context, acceptance criteria…" disabled={fieldDisabled} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <select className="select form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} disabled={fieldDisabled}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Priority</label>
            <select className="select form-input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} disabled={fieldDisabled}>
              <option value="">—</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Start date</label>
            <input type="date" className="form-input" value={form.start_date || ""} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} disabled={fieldDisabled} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">ETA</label>
            <input type="date" className="form-input" value={form.eta_date || ""} onChange={e => setForm(f => ({ ...f, eta_date: e.target.value }))} disabled={fieldDisabled} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Assignee</label>
          <SearchableSelect
            options={peopleOptions}
            value={form.assigned_to || ""}
            onChange={(v) => setForm(f => ({ ...f, assigned_to: v }))}
            placeholder="Unassigned"
            disabled={fieldDisabled}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Team</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TEAMS.map(t => {
              const on = form.team?.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => !fieldDisabled && toggleArrayValue("team", t)}
                  disabled={fieldDisabled}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 12,
                    border: `1px solid ${on ? (TEAM_COLORS[t] || "var(--tx2)") : "var(--bd)"}`,
                    background: on ? (TEAM_COLORS[t] + "22") : "transparent",
                    color: on ? TEAM_COLORS[t] : "var(--tx2)",
                    cursor: fieldDisabled ? "default" : "pointer",
                  }}
                >{t}</button>
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
                <button
                  key={t}
                  type="button"
                  onClick={() => !fieldDisabled && toggleArrayValue("task_type", t)}
                  disabled={fieldDisabled}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 12,
                    border: `1px solid ${on ? (TASK_TYPE_COLORS[t] || "var(--tx2)") : "var(--bd)"}`,
                    background: on ? (TASK_TYPE_COLORS[t] + "22") : "transparent",
                    color: on ? TASK_TYPE_COLORS[t] : "var(--tx2)",
                    cursor: fieldDisabled ? "default" : "pointer",
                  }}
                >{t}</button>
              );
            })}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Links</span>
            {!fieldDisabled && (
              <button type="button" onClick={addLink} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--bd)", background: "transparent", color: "var(--tx2)", cursor: "pointer" }}>+ Add</button>
            )}
          </label>
          {(form.links || []).length === 0 && <div style={{ fontSize: 11, color: "var(--tx3)", fontStyle: "italic" }}>No links yet.</div>}
          {(form.links || []).map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 6, marginBottom: 6 }}>
              <input type="text" className="form-input" placeholder="Label" value={l.label || ""} onChange={e => updateLink(i, "label", e.target.value)} disabled={fieldDisabled} />
              <input type="url" className="form-input" placeholder="https://…" value={l.url || ""} onChange={e => updateLink(i, "url", e.target.value)} disabled={fieldDisabled} />
              {!fieldDisabled && (
                <button type="button" onClick={() => removeLink(i)} style={{ fontSize: 14, padding: "0 8px", border: "1px solid var(--bd)", background: "transparent", color: "var(--red)", cursor: "pointer", borderRadius: 4 }}>×</button>
              )}
            </div>
          ))}
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 16 }}>
          <div>
            {isEdit && onDelete && !readOnly && (
              <button className="btn btn-outline btn-sm" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={async () => { if (window.confirm("Delete this task?")) { await onDelete(); onClose(); } }}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            {!readOnly && (
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save" : "Create"}
              </button>
            )}
          </div>
        </div>

        {isEdit && row?.created_by && (
          <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--bd2)" }}>
            Created by {nameFromEmail(row.created_by)} · {new Date(row.created_at).toLocaleString()}
            {row.updated_at && row.updated_at !== row.created_at && (
              <> · Updated {new Date(row.updated_at).toLocaleString()}</>
            )}
            {row.completed_at && (
              <> · Completed {new Date(row.completed_at).toLocaleString()}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
