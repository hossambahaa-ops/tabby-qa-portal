import React, { useState, useEffect } from "react";

const fmtAge = (ts) => {
  if (!ts) return null;
  const diffSec = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

// Returns "green" | "amber" | "red" based on how stale the daily sync is.
// Daily cron fires every 5 min, so > 15 min means ≥ 3 missed cycles.
const syncStatus = (dailyTs) => {
  if (!dailyTs) return "amber"; // No data yet today — unknown state
  const ageMin = (Date.now() - new Date(dailyTs).getTime()) / 60000;
  if (ageMin < 15) return "green";
  if (ageMin < 30) return "amber";
  return "red";
};

const STATUS_COLORS = {
  green: "var(--green)",
  amber: "#F59E0B",
  red:   "var(--red)",
};
const STATUS_LABELS = {
  green: "Syncing normally",
  amber: "Sync slightly delayed",
  red:   "Sync may be broken — last run was over 30 min ago",
};

/**
 * FreshnessBadge({ ts })
 *
 * Shows a "Live · synced Xm ago" pill with a coloured dot:
 *   green  = daily < 15 min (normal)
 *   amber  = daily 15–30 min (delayed)
 *   red    = daily > 30 min (likely broken)
 *
 * The age text ticks every 60 s. Tooltip lists per-table ages + status.
 */
export default function FreshnessBadge({ ts }) {
  // Tick every 60 s so "Xm ago" advances in real-time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!ts) return null;
  const labels = [
    { label: "Daily", v: ts.daily },
    { label: "MTD",   v: ts.mtd   },
    { label: "CSAT",  v: ts.csat  },
  ];
  const defined = labels.filter(l => l.v);
  if (defined.length === 0) return null;

  const status = syncStatus(ts.daily);
  const dotColor = STATUS_COLORS[status];

  // Display age of daily scores (most frequently synced = most informative).
  const primary = labels.find(l => l.label === "Daily" && l.v)
    || [...defined].sort((a, b) => new Date(a.v) - new Date(b.v))[0];
  const age = fmtAge(primary.v);

  const tooltip = [
    STATUS_LABELS[status],
    "",
    ...labels.map(l => `${l.label}: ${l.v ? fmtAge(l.v) : "—"}`),
  ].join("\n");

  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11,
        color: status === "red" ? "var(--red)" : status === "amber" ? "#F59E0B" : "var(--tx3)",
        padding: "3px 9px", borderRadius: 10,
        background: "var(--bg)", border: `1px solid ${status === "green" ? "var(--bd2)" : dotColor}`,
        fontWeight: 500, cursor: "default", userSelect: "none",
        whiteSpace: "nowrap", transition: "border-color .3s, color .3s",
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: dotColor, flexShrink: 0,
        boxShadow: status !== "green" ? `0 0 0 2px ${dotColor}33` : "none",
      }} />
      Live · synced {age}
    </span>
  );
}
