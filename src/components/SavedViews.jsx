import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";

// Per-user "starred" filter combinations. Each page passes its own
// pageKey + a serialised filter blob; saving / applying is opaque to
// this component — the page owns the shape.
//
// Props:
//   pageKey         e.g. "mtd" | "leaderboard" | "csat" | "utilization" | "expertise"
//   currentFilters  the page's serialised state, used as the body of the save
//   onApply(blob)   called when the user clicks a chip to apply a saved view
//   hasUrlParams    () => boolean — when truthy on first mount, the
//                   default view is NOT auto-applied (URL deep-links win)
export default function SavedViews({ pageKey, currentFilters, onApply, hasUrlParams }) {
  const { token, profile, globalToast } = useApp();
  const userEmail = profile?.email?.toLowerCase() || "";
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDefault, setSaveDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState(null); // which chip is currently applied
  const [ctxMenu, setCtxMenu] = useState(null);   // { x, y, view }
  const autoAppliedRef = useRef(false);

  // Load views once we have a session + email.
  useEffect(() => {
    if (!token || !userEmail || !pageKey) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await sb.query("saved_views", {
          select: "id,name,filters,is_default,created_at,updated_at",
          filters: `user_email=eq.${encodeURIComponent(userEmail)}&page_key=eq.${encodeURIComponent(pageKey)}&order=created_at.asc`,
          token,
        });
        if (cancelled) return;
        setViews(Array.isArray(rows) ? rows : []);
      } catch (e) {
        // saved_views may not exist yet (pre-migration) — fail silently
        // so the page still works rather than blocking on a missing table.
        if (!String(e?.message || "").includes("saved_views")) {
          console.error("SavedViews load:", e);
        }
        if (!cancelled) setViews([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, userEmail, pageKey]);

  // Auto-apply default once views have loaded (only on first mount, and
  // only if the URL hasn't already specified filters).
  useEffect(() => {
    if (loading || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    const skip = typeof hasUrlParams === "function" ? hasUrlParams() : false;
    if (skip) return;
    const def = views.find(v => v.is_default);
    if (def) {
      setActiveId(def.id);
      try { onApply?.(def.filters || {}); }
      catch (e) { console.error("SavedViews auto-apply:", e); }
    }
  }, [loading, views]);

  const sortedViews = useMemo(() => {
    return [...views].sort((a, b) => {
      // Default first, then alphabetical.
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [views]);

  const applyView = (v) => {
    setActiveId(v.id);
    try { onApply?.(v.filters || {}); }
    catch (e) { console.error("SavedViews apply:", e); }
  };

  const persistInsertOrUpdate = async ({ id, name, filters, is_default }) => {
    // If this view becomes the new default, clear the previous default
    // for this page (atomically as best we can — the partial unique
    // index is the safety net).
    if (is_default) {
      const prev = views.find(v => v.is_default && v.id !== id);
      if (prev) {
        await sb.query("saved_views", {
          token, method: "PATCH",
          body: { is_default: false },
          filters: `id=eq.${prev.id}`,
        }).catch(() => {});
      }
    }
    if (id) {
      const updated = await sb.query("saved_views", {
        token, method: "PATCH",
        body: { name, filters, is_default },
        filters: `id=eq.${id}`,
      });
      return Array.isArray(updated) ? updated[0] : updated;
    }
    const inserted = await sb.query("saved_views", {
      token, method: "POST",
      body: { user_email: userEmail, page_key: pageKey, name, filters, is_default },
    });
    return Array.isArray(inserted) ? inserted[0] : inserted;
  };

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    try {
      // If a view with the same name already exists, overwrite it
      // rather than throwing on the unique constraint.
      const existing = views.find(v => v.name.toLowerCase() === name.toLowerCase());
      const saved = await persistInsertOrUpdate({
        id: existing?.id,
        name,
        filters: currentFilters || {},
        is_default: saveDefault,
      });
      // Reload the full list — simpler than splicing, keeps default
      // toggle state consistent.
      const rows = await sb.query("saved_views", {
        select: "id,name,filters,is_default,created_at,updated_at",
        filters: `user_email=eq.${encodeURIComponent(userEmail)}&page_key=eq.${encodeURIComponent(pageKey)}&order=created_at.asc`,
        token,
      });
      setViews(Array.isArray(rows) ? rows : []);
      setActiveId(saved?.id || null);
      setShowSave(false);
      setSaveName("");
      setSaveDefault(false);
      globalToast?.("success", existing ? `Updated "${name}"` : `Saved "${name}"`);
    } catch (e) {
      console.error("SavedViews save:", e);
      globalToast?.("error", `Couldn't save view: ${e?.message || "unknown error"}`);
    }
    setSaving(false);
  };

  const handleRename = async (v) => {
    const next = window.prompt("Rename view", v.name);
    if (!next || next.trim() === v.name) return;
    try {
      await persistInsertOrUpdate({
        id: v.id,
        name: next.trim(),
        filters: v.filters,
        is_default: v.is_default,
      });
      setViews(prev => prev.map(x => x.id === v.id ? { ...x, name: next.trim() } : x));
    } catch (e) {
      globalToast?.("error", `Couldn't rename: ${e?.message || "unknown error"}`);
    }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Delete saved view "${v.name}"?`)) return;
    try {
      await sb.query("saved_views", {
        token, method: "DELETE",
        filters: `id=eq.${v.id}`,
      });
      setViews(prev => prev.filter(x => x.id !== v.id));
      if (activeId === v.id) setActiveId(null);
    } catch (e) {
      globalToast?.("error", `Couldn't delete: ${e?.message || "unknown error"}`);
    }
  };

  const handleToggleDefault = async (v) => {
    const next = !v.is_default;
    try {
      await persistInsertOrUpdate({
        id: v.id,
        name: v.name,
        filters: v.filters,
        is_default: next,
      });
      setViews(prev => prev.map(x =>
        x.id === v.id ? { ...x, is_default: next } : (next ? { ...x, is_default: false } : x)
      ));
    } catch (e) {
      globalToast?.("error", `Couldn't update default: ${e?.message || "unknown error"}`);
    }
  };

  const handleUpdateToCurrent = async (v) => {
    try {
      await persistInsertOrUpdate({
        id: v.id,
        name: v.name,
        filters: currentFilters || {},
        is_default: v.is_default,
      });
      setViews(prev => prev.map(x => x.id === v.id ? { ...x, filters: currentFilters || {} } : x));
      globalToast?.("success", `Updated "${v.name}" with current filters`);
    } catch (e) {
      globalToast?.("error", `Couldn't update: ${e?.message || "unknown error"}`);
    }
  };

  const openCtx = (e, v) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, view: v });
  };

  // Close context menu on outside click / esc.
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = () => setCtxMenu(null);
    const onKey = (e) => { if (e.key === "Escape") setCtxMenu(null); };
    setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  if (loading) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "8px 0", marginBottom: 8,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: "var(--tx3)",
        textTransform: "uppercase", letterSpacing: ".5px",
        marginRight: 4,
      }}>Saved views</span>

      {sortedViews.length === 0 && (
        <span style={{ fontSize: 11, color: "var(--tx3)", fontStyle: "italic" }}>
          No saved views yet — set filters and hit Save view.
        </span>
      )}

      {sortedViews.map(v => {
        const isActive = activeId === v.id;
        return (
          <button
            key={v.id}
            onClick={() => applyView(v)}
            onContextMenu={(e) => openCtx(e, v)}
            title={`${v.name}${v.is_default ? " (default)" : ""} — right-click for options`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 11px", borderRadius: 14, fontSize: 11.5, fontWeight: 600,
              background: isActive ? "var(--tabby-purple, #6A2C79)" : "var(--bg)",
              color: isActive ? "#fff" : "var(--tx2)",
              border: `1px solid ${isActive ? "var(--tabby-purple, #6A2C79)" : "var(--bd)"}`,
              fontFamily: "var(--font)", cursor: "pointer", transition: "all .15s",
              maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg2)"; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "var(--bg)"; }}
          >
            {v.is_default && <span style={{ color: isActive ? "#FFD75A" : "var(--amber, #D97706)", fontSize: 10 }}>★</span>}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</span>
          </button>
        );
      })}

      <button
        onClick={() => { setSaveName(""); setSaveDefault(false); setShowSave(true); }}
        title="Save current filters as a named view"
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "4px 11px", borderRadius: 14, fontSize: 11.5, fontWeight: 600,
          background: "transparent", color: "var(--tx2)",
          border: "1px dashed var(--bd)",
          fontFamily: "var(--font)", cursor: "pointer", transition: "all .15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--tabby-purple, #6A2C79)"; e.currentTarget.style.color = "var(--tabby-purple, #6A2C79)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bd)"; e.currentTarget.style.color = "var(--tx2)"; }}
      >
        <span style={{ fontSize: 11 }}>★</span> Save view
      </button>

      {showSave && ReactDOM.createPortal(
        <div
          onClick={() => setShowSave(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--bg3)", borderRadius: 14, border: "1px solid var(--bd)",
              boxShadow: "0 20px 48px rgba(0,0,0,.35)", width: "100%", maxWidth: 380, padding: 22,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, letterSpacing: "-.2px" }}>
              ★ Save view
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Name</label>
              <input
                autoFocus
                className="form-input"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && saveName.trim()) handleSave(); }}
                placeholder="e.g. Front Line Apr review"
                maxLength={80}
                style={{ fontSize: 13 }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--tx2)", cursor: "pointer", marginBottom: 16 }}>
              <input type="checkbox" checked={saveDefault} onChange={e => setSaveDefault(e.target.checked)} style={{ cursor: "pointer" }} />
              Make this my default for this page
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowSave(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!saveName.trim() || saving}>
                {saving ? "Saving…" : "Save view"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {ctxMenu && ReactDOM.createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: "fixed",
            left: Math.min(ctxMenu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 230),
            top: Math.min(ctxMenu.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 200),
            background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 10,
            boxShadow: "0 10px 32px rgba(0,0,0,.3)", minWidth: 220, padding: "4px 0", zIndex: 10000,
          }}
        >
          {[
            { label: "Apply", onClick: () => applyView(ctxMenu.view) },
            { label: "Update with current filters", onClick: () => handleUpdateToCurrent(ctxMenu.view) },
            { label: ctxMenu.view.is_default ? "Unset as default" : "Set as default", onClick: () => handleToggleDefault(ctxMenu.view) },
            { divider: true },
            { label: "Rename…", onClick: () => handleRename(ctxMenu.view) },
            { label: "Delete", onClick: () => handleDelete(ctxMenu.view), tone: "danger" },
          ].map((item, i) => item.divider ? (
            <div key={i} style={{ height: 1, background: "var(--bd2)", margin: "4px 0" }} />
          ) : (
            <button
              key={i}
              onClick={() => { setCtxMenu(null); try { item.onClick(); } catch (e) { console.error(e); } }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "7px 14px", border: "none", background: "transparent",
                fontSize: 12.5, fontFamily: "var(--font)", cursor: "pointer",
                color: item.tone === "danger" ? "var(--red)" : "var(--tx)",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >{item.label}</button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
