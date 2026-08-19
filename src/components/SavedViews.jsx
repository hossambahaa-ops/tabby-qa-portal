import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../lib/AppContext.jsx";
import { sb } from "../lib/supabase.js";

/**
 * <SavedViews pageKey="mtd" currentFilters={obj} onApply={(filters) => {...}} />
 *
 * Renders a horizontal chip row of the user's saved views for this page.
 * Click a chip → applies its stored filter blob via onApply().
 * "+ Save current" → modal to name + save the currentFilters snapshot.
 * Each chip has an × to delete and a ⭐ toggle to mark/unmark default.
 *
 * Default views auto-apply on first mount when applyOnLoad is true.
 *
 * The filters object shape is page-specific — the caller decides what
 * to serialise. Sets must be converted to arrays before saving.
 */
export default function SavedViews({ pageKey, currentFilters, onApply, applyOnLoad = true }) {
  const { token, profile, globalToast } = useApp();
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState(null);
  const appliedDefault = useRef(false);

  // Load on mount
  useEffect(() => {
    if (!token || !profile?.email) return;
    const email = profile.email.toLowerCase();
    sb.query("saved_views", {
      select: "id,name,filters,is_default,created_at",
      filters: `user_email=eq.${encodeURIComponent(email)}&page_key=eq.${encodeURIComponent(pageKey)}&order=created_at.desc`,
      token,
    }).then(rows => {
      const list = rows || [];
      setViews(list);
      setLoading(false);
      if (applyOnLoad && !appliedDefault.current) {
        appliedDefault.current = true;
        const def = list.find(v => v.is_default);
        if (def) {
          onApply(def.filters || {});
          setActiveId(def.id);
        }
      }
    }).catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, profile?.email, pageKey]);

  const save = async () => {
    if (!name.trim() || !profile?.email) return;
    try {
      const inserted = await sb.query("saved_views", {
        method: "POST",
        body: {
          user_email: profile.email.toLowerCase(),
          page_key: pageKey,
          name: name.trim(),
          filters: currentFilters || {},
          is_default: false,
        },
        token,
      });
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      if (row) {
        setViews(prev => [row, ...prev]);
        setActiveId(row.id);
        globalToast?.("success", `Saved "${row.name}"`);
      }
      setName("");
      setShowForm(false);
    } catch (e) {
      globalToast?.("error", `Save failed: ${e?.message || "unknown error"}`);
    }
  };

  const apply = (v) => {
    onApply(v.filters || {});
    setActiveId(v.id);
  };

  const remove = async (id, e) => {
    e?.stopPropagation();
    try {
      await sb.query("saved_views", { method: "DELETE", filters: `id=eq.${id}`, token });
      setViews(prev => prev.filter(v => v.id !== id));
      if (activeId === id) setActiveId(null);
    } catch (e) { globalToast?.("error", `Delete failed: ${e?.message || "unknown error"}`); }
  };

  const toggleDefault = async (id, e) => {
    e?.stopPropagation();
    const target = views.find(v => v.id === id);
    if (!target) return;
    const newVal = !target.is_default;
    try {
      // If turning ON, clear other defaults for this page first
      if (newVal) {
        await sb.query("saved_views", {
          method: "PATCH",
          body: { is_default: false },
          filters: `user_email=eq.${encodeURIComponent(profile.email.toLowerCase())}&page_key=eq.${encodeURIComponent(pageKey)}&is_default=eq.true`,
          token,
        }).catch(() => {});
      }
      await sb.query("saved_views", {
        method: "PATCH",
        body: { is_default: newVal, updated_at: new Date().toISOString() },
        filters: `id=eq.${id}`,
        token,
      });
      setViews(prev => prev.map(v => ({ ...v, is_default: v.id === id ? newVal : (newVal ? false : v.is_default) })));
      globalToast?.("success", newVal ? `Default view set to "${target.name}"` : `"${target.name}" no longer default`);
    } catch (e) { globalToast?.("error", `Update failed: ${e?.message || "unknown error"}`); }
  };

  if (loading) return null;

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {views.map(v => {
        const isActive = activeId === v.id;
        return (
          <div key={v.id} className="mo-ctl" style={{
            display: "inline-flex", alignItems: "center",
            background: isActive ? "var(--tabby-purple)" : "var(--bg2)",
            color: isActive ? "#fff" : "var(--tx2)",
            border: isActive ? "1px solid var(--tabby-purple)" : "1px solid var(--bd2)",
            borderRadius: 12,
            padding: "2px 4px 2px 10px",
            fontSize: 11, fontWeight: 600,
            cursor: "pointer",
          }}>
            <span title={v.is_default ? "Default for this page (auto-applies on next visit)" : "Saved view — click to apply"} onClick={() => apply(v)} style={{ display: "inline-flex", alignItems: "center", gap: 4, paddingRight: 4 }}>
              {v.is_default ? "⭐" : "📌"} {v.name}
            </span>
            <button title={v.is_default ? "Remove as default" : "Set as default"}
                    onClick={(e) => toggleDefault(v.id, e)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: isActive ? "rgba(255,255,255,.7)" : "var(--tx3)", fontSize: 11, padding: "0 4px" }}>
              {v.is_default ? "—" : "⭐"}
            </button>
            <button title="Delete saved view"
                    onClick={(e) => remove(v.id, e)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: isActive ? "rgba(255,255,255,.7)" : "var(--tx3)", fontSize: 13, padding: "0 4px", lineHeight: 1 }}>
              ×
            </button>
          </div>
        );
      })}
      {showForm ? (
        <>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setShowForm(false); setName(""); } }}
            placeholder="Name this view"
            className="form-input"
            style={{ fontSize: 11, padding: "3px 8px", width: 160 }}
            maxLength={40}
          />
          <button onClick={save} disabled={!name.trim()} className="btn btn-primary btn-sm" style={{ fontSize: 10 }}>Save</button>
          <button onClick={() => { setShowForm(false); setName(""); }} className="btn btn-outline btn-sm" style={{ fontSize: 10 }}>Cancel</button>
        </>
      ) : (
        <button onClick={() => setShowForm(true)} className="btn btn-outline btn-sm" style={{ fontSize: 10 }}>
          ⭐ Save current view
        </button>
      )}
    </div>
  );
}
