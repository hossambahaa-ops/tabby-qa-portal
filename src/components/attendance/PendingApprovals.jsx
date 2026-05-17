import React, { useState } from "react";
import { ATT_MAP } from "../../lib/attendance.js";
import { nameFromEmail } from "../../lib/utils.js";

const fmtDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

export default function PendingApprovals({
  attendance, roster, visibleQAs, profile, myEmail, isLead,
  selMonth, approveAtt, denyAtt, bulkApprove, bulkDeny, onViewOnCalendar
}) {
  const [denyingId, setDenyingId] = useState(null);
  const [denyReason, setDenyReason] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [bulkDenyReason, setBulkDenyReason] = useState("");
  const [showBulkDenyInput, setShowBulkDenyInput] = useState(false);

  const visibleEmails = new Set(visibleQAs.map(q => q.email?.toLowerCase()));

  const allPending = attendance
    .filter(a =>
      a.approval_status === "pending" &&
      visibleEmails.has(a.email?.toLowerCase()) &&
      (a.date || "").startsWith(selMonth)
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const rows = isLead
    ? allPending
    : allPending.filter(a => a.email?.toLowerCase() === myEmail);

  const dayNum = (row) => {
    // Guard against malformed dates (null, undefined, or rows where
    // date got a TZ suffix etc.). NaN day numbers would silently flow
    // into approveAtt(row, NaN) and miss the row entirely.
    if (!row?.date || typeof row.date !== "string") return null;
    const parts = row.date.split("-");
    if (parts.length < 3) return null;
    const n = parseInt(parts[2], 10);
    return Number.isFinite(n) ? n : null;
  };

  const toggleAll = () => {
    if (selected.size === rows.length && rows.length > 0) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };

  const toggleRow = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const selectedRows = rows.filter(r => selected.has(r.id));

  const handleDeny = (row) => {
    denyAtt(row.email.toLowerCase(), dayNum(row), denyReason);
    setDenyingId(null);
    setDenyReason("");
  };

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: "52px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tx)", marginBottom: 6 }}>No pending requests</div>
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>
          {isLead
            ? "Your team has no pending attendance requests for this month."
            : "You have no pending attendance requests for this month."}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Bulk action bar */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--tx3)" }}>
          <strong style={{ color: "var(--tx)" }}>{rows.length}</strong> pending request{rows.length !== 1 ? "s" : ""} for {selMonth}
        </span>
        {isLead && selectedRows.length > 0 && (
          <>
            <span style={{ fontSize: 12, color: "var(--tx2)", fontWeight: 600 }}>· {selectedRows.length} selected</span>
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
              <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>Date</th>
              <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>Type</th>
              <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>Note</th>
              <th style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const attType = ATT_MAP[row.status];
              const dn = dayNum(row);
              const isDenyingThis = denyingId === row.id;
              return (
                <React.Fragment key={row.id}>
                  <tr style={{ borderBottom: isDenyingThis ? "none" : "1px solid var(--bd)", background: selected.has(row.id) ? "var(--accent-light)" : "transparent" }}>
                    {isLead && (
                      <td style={{ width: 36, padding: "11px 12px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          style={{ cursor: "pointer", accentColor: "var(--tabby-purple)" }}
                        />
                      </td>
                    )}
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--accent-text)", flexShrink: 0 }}>
                          {nameFromEmail(row.email).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{nameFromEmail(row.email)}</span>
                      </div>
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <button
                        onClick={() => onViewOnCalendar(row.email, dn)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tabby-purple)", fontFamily: "var(--font)", fontSize: 12, padding: 0, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 2 }}
                        title="View on calendar"
                      >
                        {fmtDate(row.date)}
                      </button>
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: attType?.bg || "var(--bg3)", color: attType?.color || "var(--tx3)", fontWeight: 700, border: `1px solid ${attType?.color || "var(--bd)"}30` }}>
                        {row.status}
                      </span>
                    </td>
                    <td style={{ padding: "11px 12px", color: row.request_note ? "var(--tx)" : "var(--tx3)", fontStyle: row.request_note ? "normal" : "italic", maxWidth: 220 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.request_note || "No note"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 12px", textAlign: "right" }}>
                      {isLead ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--green)", cursor: "pointer", background: "var(--green-bg)", color: "var(--green)", fontWeight: 700, fontFamily: "var(--font)" }}
                            onClick={() => approveAtt(row.email.toLowerCase(), dn)}
                          >
                            ✓ Approve
                          </button>
                          <button
                            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--red)", cursor: "pointer", background: isDenyingThis ? "var(--red)" : "var(--red-bg)", color: isDenyingThis ? "#fff" : "var(--red)", fontWeight: 700, fontFamily: "var(--font)" }}
                            onClick={() => { setDenyingId(isDenyingThis ? null : row.id); setDenyReason(""); }}
                          >
                            ✕ Deny
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>⏳ Awaiting approval</span>
                      )}
                    </td>
                  </tr>
                  {isDenyingThis && (
                    <tr style={{ background: "#FEF2F2", borderBottom: "1px solid var(--bd)" }}>
                      <td colSpan={isLead ? 6 : 5} style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>Reason for denial</span>
                          <span style={{ fontSize: 11, color: "var(--tx3)" }}>(optional):</span>
                          <input
                            autoFocus
                            type="text"
                            placeholder="e.g. quota exceeded"
                            value={denyReason}
                            onChange={e => setDenyReason(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleDeny(row);
                              if (e.key === "Escape") { setDenyingId(null); setDenyReason(""); }
                            }}
                            style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--red)", background: "var(--bg)", color: "var(--tx)", fontFamily: "var(--font)", flex: 1, minWidth: 160, maxWidth: 300 }}
                          />
                          <button
                            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 4, border: "none", cursor: "pointer", background: "var(--red)", color: "#fff", fontWeight: 700, fontFamily: "var(--font)" }}
                            onClick={() => handleDeny(row)}
                          >
                            Confirm deny
                          </button>
                          <button
                            style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--bd)", cursor: "pointer", background: "var(--bg3)", color: "var(--tx2)", fontFamily: "var(--font)" }}
                            onClick={() => { setDenyingId(null); setDenyReason(""); }}
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
