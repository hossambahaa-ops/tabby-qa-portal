import React, { useState, useEffect, useCallback } from "react";
import { hasRole } from "../lib/constants.js";
import { sb } from "../lib/supabase.js";
import { safeError } from "../lib/utils.js";
import { useApp } from "../lib/AppContext.jsx";
import { useConfirm } from "../lib/hooks.jsx";
import { SkeletonTable } from "../components/Skeleton.jsx";

// Admin viewer for public.client_errors — runtime JS errors captured by
// src/lib/errorLog.js (window.onerror + unhandledrejection + React
// ErrorBoundary). Admins read; super_admin can delete.
export default function AdminErrorsPage() {
  const { token, profile, globalToast } = useApp();
  const { ask: confirmAsk, el: confirmEl } = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filterSource, setFilterSource] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await sb.query("client_errors", { select: "*", filters: "order=created_at.desc&limit=200", token });
      setRows(Array.isArray(d) ? d : []);
    } catch { setRows([]); }
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const deleteAll = () => {
    confirmAsk(
      "Delete all error logs?",
      `This will remove ${rows.length} error entries permanently.`,
      async () => {
        try {
          for (const r of rows) {
            await sb.query("client_errors", { token, method: "DELETE", filters: `id=eq.${r.id}` });
          }
          setRows([]);
          globalToast("success", "Error log cleared");
        } catch (e) { globalToast("error", safeError(e)); }
      }, "Delete all", "var(--red)"
    );
  };

  const deleteOne = (row) => {
    confirmAsk("Delete entry?", "Remove this single error entry?", async () => {
      try {
        await sb.query("client_errors", { token, method: "DELETE", filters: `id=eq.${row.id}` });
        setRows(prev => prev.filter(r => r.id !== row.id));
      } catch (e) { globalToast("error", safeError(e)); }
    }, "Delete", "var(--red)");
  };

  const sources = [...new Set(rows.map(r => r.source))].sort();
  const filtered = filterSource ? rows.filter(r => r.source === filterSource) : rows;
  const isSuperAdmin = hasRole(profile?.role, "super_admin");

  const sourceColor = {
    window_onerror:       { bg: "var(--red-bg)",      color: "var(--red)" },
    unhandledrejection:   { bg: "var(--amber-bg)",    color: "var(--amber)" },
    react_boundary:       { bg: "var(--primary-light)", color: "var(--primary-text)" },
    manual:               { bg: "var(--bg2)",         color: "var(--tx2)" },
  };

  return (
    <div className="page">
      {confirmEl}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title">Runtime errors</div>
          <div className="page-subtitle">{rows.length} recent · captured from the client</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {sources.length > 1 && (
            <select className="select form-input" style={{ fontSize: 12, padding: "4px 10px" }} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
              <option value="">All sources ({rows.length})</option>
              {sources.map(s => <option key={s} value={s}>{s} ({rows.filter(r => r.source === s).length})</option>)}
            </select>
          )}
          {isSuperAdmin && rows.length > 0 && (
            <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={deleteAll}>Clear all</button>
          )}
        </div>
      </div>

      {loading ? <SkeletonTable /> :
        filtered.length === 0 ? (
          <div className="card"><div className="placeholder" style={{ padding: 40 }}>
            <p style={{ color: "var(--tx3)" }}>No runtime errors logged. That's good news.</p>
          </div></div>
        ) : (
          <div className="card"><div className="table-wrap"><table>
            <thead><tr>
              <th style={{ width: 30 }}></th>
              <th style={{ width: 140 }}>When</th>
              <th style={{ width: 120 }}>Source</th>
              <th>Message</th>
              <th style={{ width: 180 }}>User</th>
              {isSuperAdmin && <th style={{ width: 40 }}></th>}
            </tr></thead>
            <tbody>
              {filtered.map(r => {
                const sc = sourceColor[r.source] || sourceColor.manual;
                const isExp = expandedId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr onClick={() => setExpandedId(isExp ? null : r.id)} style={{ cursor: "pointer" }}>
                      <td>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform .2s", transform: isExp ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--tx3)", whiteSpace: "nowrap" }}>
                        {new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: sc.bg, color: sc.color, fontWeight: 700, textTransform: "uppercase" }}>{r.source}</span>
                      </td>
                      <td style={{ color: "var(--tx)", fontSize: 12, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message}</td>
                      <td style={{ fontSize: 11, color: "var(--tx3)" }}>{r.user_email || "—"} {r.user_role ? <span style={{ color: "var(--tx3)" }}>· {r.user_role}</span> : null}</td>
                      {isSuperAdmin && <td><button className="btn btn-outline btn-sm" style={{ color: "var(--red)", fontSize: 10 }} onClick={e => { e.stopPropagation(); deleteOne(r); }}>✕</button></td>}
                    </tr>
                    {isExp && (
                      <tr><td colSpan={isSuperAdmin ? 6 : 5} style={{ padding: 0, background: "var(--bg)" }}>
                        <div style={{ padding: "14px 20px 14px 44px", fontSize: 12, color: "var(--tx2)", display: "grid", gap: 10 }}>
                          {r.url && <div><span style={{ color: "var(--tx3)", fontWeight: 600 }}>URL: </span><span style={{ wordBreak: "break-all" }}>{r.url}</span></div>}
                          {r.user_agent && <div><span style={{ color: "var(--tx3)", fontWeight: 600 }}>UA: </span>{r.user_agent}</div>}
                          {r.context && <div>
                            <div style={{ color: "var(--tx3)", fontWeight: 600, marginBottom: 4 }}>Context</div>
                            <pre style={{ background: "var(--bg3)", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--bd2)", fontSize: 11, overflow: "auto", maxHeight: 160, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(r.context, null, 2)}</pre>
                          </div>}
                          {r.stack && <div>
                            <div style={{ color: "var(--tx3)", fontWeight: 600, marginBottom: 4 }}>Stack</div>
                            <pre style={{ background: "var(--bg3)", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--bd2)", fontSize: 11, overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{r.stack}</pre>
                          </div>}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table></div></div>
        )
      }
    </div>
  );
}
