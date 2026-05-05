import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/AppContext.jsx";
import { listInitiatives } from "../../api/initiatives.js";
import { STATUS_COLORS, PRIORITY_COLORS } from "../../lib/initiatives.js";
import { Icon, icons } from "../Icons.jsx";

// Compact "My Tracker tasks" card. Shown only to senior_qa+ via the
// caller — this component itself doesn't gate. Loads on its own to
// avoid coupling the dashboard's primary loader to RLS-restricted data
// for users who can't see the table.

export default function MyTrackerWidget() {
  const { token, profile } = useApp();
  const myEmail = profile?.email?.toLowerCase() || "";
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listInitiatives({ token });
        if (cancelled) return;
        const mine = (all || []).filter(r =>
          r.assigned_to?.toLowerCase() === myEmail && r.status !== "Done"
        );
        // Closest ETA first, then created.
        mine.sort((a, b) => {
          const ea = a.eta_date || "9999-12-31";
          const eb = b.eta_date || "9999-12-31";
          if (ea !== eb) return ea < eb ? -1 : 1;
          return (a.created_at || "").localeCompare(b.created_at || "");
        });
        setRows(mine);
      } catch { /* noop — widget hides on failure */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, myEmail]);

  if (loading) return null;
  // Don't add chrome when there's nothing to show — keeps the dashboard tidy.
  if (rows.length === 0) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const top = rows.slice(0, 4);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon d={icons.tracker} size={16} />
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--tx)" }}>My Tracker tasks</span>
          <span style={{ fontSize: 11, color: "var(--tx3)", marginLeft: 4 }}>({rows.length})</span>
        </div>
        <button
          onClick={() => navigate("/tracker")}
          style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--bd)", background: "transparent", color: "var(--tx2)", cursor: "pointer" }}
        >
          Open board →
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {top.map(row => {
          const sm = STATUS_COLORS[row.status] || {};
          const pm = row.priority ? PRIORITY_COLORS[row.priority] : null;
          const overdue = row.eta_date && row.status !== "Done" && row.eta_date < todayStr;
          return (
            <div
              key={row.id}
              onClick={() => navigate("/tracker")}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--bd2)", borderRadius: 6, background: "var(--bg2)", cursor: "pointer" }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: sm.bg, color: sm.color, flexShrink: 0 }}>
                {row.status === "In progress" ? "▶" : "•"} {row.status}
              </span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.title}
              </span>
              {pm && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: pm.bg, color: pm.color, flexShrink: 0 }}>
                  {row.priority}
                </span>
              )}
              {row.eta_date && (
                <span style={{ fontSize: 10, color: overdue ? "var(--red)" : "var(--tx3)", fontWeight: overdue ? 700 : 400, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {overdue ? "⚠ " : ""}{new Date(row.eta_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          );
        })}
        {rows.length > top.length && (
          <button
            onClick={() => navigate("/tracker")}
            style={{ fontSize: 11, color: "var(--tabby-purple)", background: "transparent", border: "none", cursor: "pointer", padding: "6px 0", textAlign: "left", fontWeight: 600 }}
          >
            +{rows.length - top.length} more on the board →
          </button>
        )}
      </div>
    </div>
  );
}
