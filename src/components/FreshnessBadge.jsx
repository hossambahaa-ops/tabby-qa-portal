import React from "react";

const fmtAge = (ts) => {
  if (!ts) return null;
  const diffSec = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

/**
 * FreshnessBadge({ ts })
 *
 * Shows a small "Live · synced Xm ago" pill. Tooltip lists per-table ages.
 * ts = { daily, mtd, csat } — each an ISO string or null.
 */
export default function FreshnessBadge({ ts }) {
  if (!ts) return null;
  const labels = [
    { label: "Daily", v: ts.daily },
    { label: "MTD",   v: ts.mtd   },
    { label: "CSAT",  v: ts.csat  },
  ];
  const defined = labels.filter(l => l.v);
  if (defined.length === 0) return null;

  // Show age of the oldest (most stale) table so users know the worst case.
  const oldest = [...defined].sort((a, b) => new Date(a.v) - new Date(b.v))[0];
  const age = fmtAge(oldest.v);
  const tooltip = labels.map(l => `${l.label}: ${l.v ? fmtAge(l.v) : "—"}`).join("\n");

  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11, color: "var(--tx3)",
        padding: "3px 9px", borderRadius: 10,
        background: "var(--bg)", border: "1px solid var(--bd2)",
        fontWeight: 500, cursor: "default", userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: "var(--green)", flexShrink: 0,
      }} />
      Live · synced {age}
    </span>
  );
}
