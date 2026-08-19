import React, { useState, useMemo } from "react";
import { ATT_MAP } from "../../lib/attendance.js";
import { nameFromEmail } from "../../lib/utils.js";

const fmtDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};
const fmtShort = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const dayNumOf = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.split("-");
  if (parts.length < 3) return null;
  const n = parseInt(parts[2], 10);
  return Number.isFinite(n) ? n : null;
};

export default function PendingApprovals({
  attendance, pendingRequests, roster, visibleQAs, profile, myEmail, isLead,
  selMonth, approveAtt, denyAtt, bulkApprove, bulkDeny, onViewOnCalendar
}) {
  const [denyingKey, setDenyingKey] = useState(null);
  const [denyReason, setDenyReason] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [bulkDenyReason, setBulkDenyReason] = useState("");
  const [showBulkDenyInput, setShowBulkDenyInput] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);

  const visibleEmails = new Set(visibleQAs.map(q => q.email?.toLowerCase()));

  // Show pending from ANY month — a lead shouldn't have to switch the
  // month selector to find an approval. `pendingRequests` is the page's
  // unbounded all-months fetch; fall back to the monthly slice if absent.
  const source = Array.isArray(pendingRequests) ? pendingRequests : attendance;
  const allPending = source
    .filter(a =>
      a.approval_status === "pending" &&
      visibleEmails.has(a.email?.toLowerCase())
    )
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const rows = isLead
    ? allPending
    : allPending.filter(a => a.email?.toLowerCase() === myEmail);

  // Aggregate same-type requests per QA into one card. A QA who asked
  // for 11 Leave days shows as a single "Leave · 11 days · Jun 5–19"
  // request the lead can approve/deny in one action, instead of 11
  // separate rows. Grouped by (email, status); OT keeps its own group
  // so leave and OT never merge.
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const key = `${(r.email || "").toLowerCase()}|${r.status}`;
      if (!m.has(key)) m.set(key, { key, email: r.email, status: r.status, rows: [] });
      m.get(key).rows.push(r);
    }
    return [...m.values()].map(g => {
      const dates = g.rows.map(r => r.date).filter(Boolean).sort();
      const notes = [...new Set(g.rows.map(r => (r.request_note || "").trim()).filter(Boolean))];
      const otHours = g.rows.reduce((s, r) => s + (parseFloat(r.ot_hours) || 0), 0);
      return {
        ...g,
        days: g.rows.length,
        from: dates[0],
        to: dates[dates.length - 1],
        notes,
        otHours,
      };
    }).sort((a, b) => (a.from || "").localeCompare(b.from || "") || (a.email || "").localeCompare(b.email || ""));
  }, [rows]);

  const toggleAll = () => {
    if (selected.size === rows.length && rows.length > 0) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };

  const groupChecked = (g) => g.rows.length > 0 && g.rows.every(r => selected.has(r.id));
  const toggleGroup = (g) => setSelected(prev => {
    const n = new Set(prev);
    const all = g.rows.every(r => n.has(r.id));
    g.rows.forEach(r => (all ? n.delete(r.id) : n.add(r.id)));
    return n;
  });

  const selectedRows = rows.filter(r => selected.has(r.id));

  // Approve/deny a whole group at once via the existing bulk handlers.
  const approveGroup = (g) => { bulkApprove(g.rows); setSelected(new Set()); };
  const denyGroup = (g) => {
    bulkDeny(g.rows, denyReason);
    setDenyingKey(null);
    setDenyReason("");
  };

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: "52px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tx)", marginBottom: 6 }}>No pending requests</div>
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>
          {isLead
            ? "Your team has no pending attendance requests."
            : "You have no pending attendance requests."}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--tx3)" }}>
          <strong style={{ color: "var(--tx)" }}>{groups.length}</strong> request{groups.length !== 1 ? "s" : ""}
          {rows.length !== groups.length && <> · <strong style={{ color: "var(--tx)" }}>{rows.length}</strong> days</>} · <span style={{ color:"var(--tx2)" }}>all months</span>
        </span>
        {isLead && selectedRows.length > 0 && (
          <>
            <span style={{ fontSize: 12, color: "var(--tx2)", fontWeight: 600 }}>· {selectedRows.length} day{selectedRows.length !== 1 ? "s" : ""} selected</span>
            <button
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "1px solid var(--green)", cursor: "pointer", background: "var(--green-bg)", color: "var(--green)", fontWeight: 700, fontFamily: "var(--font)" }}
              onClick={() => { bulkApprove(selectedRows); setSelected(new Set()); }}
            >
              ✓ Approve selected
            </button>
            {showBulkDenyInput ? (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Reason (optional)"
                  value={bulkDenyReason}
                  onChange={e => setBulkDenyReason(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { bulkDeny(selectedRows, bulkDenyReason); setSelected(new Set()); setShowBulkDenyInput(false); setBulkDenyReason(""); }
                    if (e.key === "Escape") { setShowBulkDenyInput(false); setBulkDenyReason(""); }
                  }}
                  style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--bd)", background: "var(--bg)", color: "var(--tx)", fontFamily: "var(--font)", width: 180 }}
                />
                <button
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "1px solid var(--red)", cursor: "pointer", background: "var(--red)", color: "#fff", fontWeight: 700, fontFamily: "var(--font)" }}
                  onClick={() => { bulkDeny(selectedRows, bulkDenyReason); setSelected(new Set()); setShowBulkDenyInput(false); setBulkDenyReason(""); }}
                >
                  Confirm deny
                </button>
                <button
                  style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--bd)", cursor: "pointer", background: "var(--bg3)", color: "var(--tx2)", fontFamily: "var(--font)" }}
                  onClick={() => { setShowBulkDenyInput(false); setBulkDenyReason(""); }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "1px solid var(--red)", cursor: "pointer", background: "var(--red-bg)", color: "var(--red)", fontWeight: 700, fontFamily: "var(--font)" }}
                onClick={() => setShowBulkDenyInput(true)}
              >
                ✕ Deny selected
              </button>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--bd)", background: "var(--bg3)" }}>
              {isLead && (
                <th style={{ width: 36, padding: "9px 12px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    style={{ cursor: "pointer", accentColor: "var(--tabby-purple)" }}
                  />
                </th>
              )}
              <th style={{ padding: "9px 14px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>QA</th>
              <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>When</th>
              <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>Type</th>
              <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>Note</th>
              <th style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const attType = ATT_MAP[g.status];
              const isDenyingThis = denyingKey === g.key;
              const isExpanded = expandedKey === g.key;
              const multi = g.days > 1;
              const whenLabel = multi
                ? `${fmtShort(g.from)} – ${fmtShort(g.to)}`
                : fmtDate(g.from);
              return (
                <React.Fragment key={g.key}>
                  <tr style={{ borderBottom: (isDenyingThis || isExpanded) ? "none" : "1px solid var(--bd)", background: groupChecked(g) ? "var(--accent-light)" : "transparent" }}>
                    {isLead && (
                      <td style={{ width: 36, padding: "11px 12px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={groupChecked(g)}
                          onChange={() => toggleGroup(g)}
                          style={{ cursor: "pointer", accentColor: "var(--tabby-purple)" }}
                        />
                      </td>
                    )}
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--accent-text)", flexShrink: 0 }}>
                          {nameFromEmail(g.email).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{nameFromEmail(g.email)}</span>
                      </div>
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      {multi ? (
                        <button
                          onClick={() => setExpandedKey(isExpanded ? null : g.key)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx)", fontFamily: "var(--font)", fontSize: 12, padding: 0, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}
                          title="Show individual days"
                        >
                          <span>{whenLabel}</span>
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--tabby-purple)", color: "#fff", fontWeight: 700 }}>{g.days} days</span>
                          <span style={{ fontSize: 9, color: "var(--tx3)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform var(--d1)" }}>▾</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onViewOnCalendar(g.email, g.from)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tabby-purple)", fontFamily: "var(--font)", fontSize: 12, padding: 0, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 2 }}
                          title="View on calendar"
                        >
                          {whenLabel}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: attType?.bg || "var(--bg3)", color: attType?.color || "var(--tx3)", fontWeight: 700, border: `1px solid ${attType?.color || "var(--bd)"}30` }}>
                        {g.status}{g.status === "OT" && g.otHours > 0 ? ` · ${g.otHours}h` : ""}
                      </span>
                    </td>
                    <td style={{ padding: "11px 12px", color: g.notes.length ? "var(--tx)" : "var(--tx3)", fontStyle: g.notes.length ? "normal" : "italic", maxWidth: 220 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.notes.length ? g.notes.join(" · ") : "No note"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "right" }}>
                      {isLead ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--green)", cursor: "pointer", background: "var(--green-bg)", color: "var(--green)", fontWeight: 700, fontFamily: "var(--font)" }}
                            onClick={() => approveGroup(g)}
                          >
                            ✓ Approve{multi ? ` all ${g.days}` : ""}
                          </button>
                          <button
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--red)", cursor: "pointer", background: isDenyingThis ? "var(--red)" : "var(--red-bg)", color: isDenyingThis ? "#fff" : "var(--red)", fontWeight: 700, fontFamily: "var(--font)" }}
                            onClick={() => { setDenyingKey(isDenyingThis ? null : g.key); setDenyReason(""); }}
                          >
                            ✕ Deny
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>⏳ Awaiting approval</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded list of the individual days in this request */}
                  {isExpanded && (
                    <tr style={{ background: "var(--bg)", borderBottom: isDenyingThis ? "none" : "1px solid var(--bd)" }}>
                      <td colSpan={isLead ? 6 : 5} style={{ padding: "8px 14px 10px 52px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {g.rows.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(r => (
                            <button
                              key={r.id}
                              onClick={() => onViewOnCalendar(r.email, r.date)}
                              style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--bd)", background: "var(--bg3)", color: "var(--tx2)", cursor: "pointer", fontFamily: "var(--font)" }}
                              title="View on calendar"
                            >
                              {fmtShort(r.date)}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}

                  {isDenyingThis && (
                    <tr style={{ background: "#FEF2F2", borderBottom: "1px solid var(--bd)" }}>
                      <td colSpan={isLead ? 6 : 5} style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>Deny {multi ? `all ${g.days} ${g.status} days` : `this ${g.status}`}</span>
                          <span style={{ fontSize: 11, color: "var(--tx3)" }}>· reason (optional):</span>
                          <input
                            autoFocus
                            type="text"
                            placeholder="e.g. quota exceeded"
                            value={denyReason}
                            onChange={e => setDenyReason(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") denyGroup(g);
                              if (e.key === "Escape") { setDenyingKey(null); setDenyReason(""); }
                            }}
                            style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--red)", background: "var(--bg)", color: "var(--tx)", fontFamily: "var(--font)", flex: 1, minWidth: 160, maxWidth: 300 }}
                          />
                          <button
                            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 4, border: "none", cursor: "pointer", background: "var(--red)", color: "#fff", fontWeight: 700, fontFamily: "var(--font)" }}
                            onClick={() => denyGroup(g)}
                          >
                            Confirm deny
                          </button>
                          <button
                            style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--bd)", cursor: "pointer", background: "var(--bg3)", color: "var(--tx2)", fontFamily: "var(--font)" }}
                            onClick={() => { setDenyingKey(null); setDenyReason(""); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
