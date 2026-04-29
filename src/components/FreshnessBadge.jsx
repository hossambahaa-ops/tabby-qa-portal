import React, { useState, useEffect, useRef } from "react";
import Tooltip from "./Tooltip.jsx";

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
  if (!dailyTs) return "amber";
  const ageMin = (Date.now() - new Date(dailyTs).getTime()) / 60000;
  if (ageMin < 15) return "green";
  if (ageMin < 30) return "amber";
  return "red";
};

const STATUS_LABELS = {
  green: "Syncing normally",
  amber: "Sync slightly delayed",
  red:   "Sync may be broken — last run was over 30 min ago",
};

/**
 * FreshnessBadge({ ts, pulseKey })
 *
 * Pill that shows live sync status:
 *   green  = daily < 15 min (normal)
 *   amber  = daily 15–30 min (delayed)
 *   red    = daily > 30 min (likely broken)
 *
 * `pulseKey` — when this number changes, the pill briefly pulses green to
 * confirm a successful manual sync (call setPulseKey(k=>k+1) on success).
 */
export default function FreshnessBadge({ ts, pulseKey = 0 }) {
  // Tick every 60 s so "Xm ago" advances in real-time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Trigger a one-shot CSS animation when pulseKey changes.
  const [pulsing, setPulsing] = useState(false);
  const lastPulseKey = useRef(pulseKey);
  useEffect(() => {
    if (pulseKey !== lastPulseKey.current) {
      lastPulseKey.current = pulseKey;
      setPulsing(true);
      const id = setTimeout(() => setPulsing(false), 1400);
      return () => clearTimeout(id);
    }
  }, [pulseKey]);

  if (!ts) return null;
  const labels = [
    { label: "Daily", v: ts.daily },
    { label: "MTD",   v: ts.mtd   },
    { label: "CSAT",  v: ts.csat  },
  ];
  const defined = labels.filter(l => l.v);
  if (defined.length === 0) return null;

  const status = syncStatus(ts.daily);
  const primary = labels.find(l => l.label === "Daily" && l.v)
    || [...defined].sort((a, b) => new Date(a.v) - new Date(b.v))[0];
  const age = fmtAge(primary.v);

  const tooltip = [
    STATUS_LABELS[status],
    "",
    ...labels.map(l => `${l.label}: ${l.v ? fmtAge(l.v) : "—"}`),
  ].join("\n");

  const cls = `pill pill-tone-${status}${pulsing ? " pill-pulse" : ""}`;

  return (
    <Tooltip content={tooltip} placement="bottom">
      <span className={cls}>
        <span className="pill-dot" />
        Live · synced {age}
      </span>
    </Tooltip>
  );
}
