import React, { useMemo, useState } from "react";
import { STATUS_COLORS, PRIORITY_COLORS } from "../../lib/initiatives.js";
import { nameFromEmail } from "../../lib/utils.js";

// Gantt-style timeline grouped by assignee. Phase 2 — paired with
// multi-level subtasks. Each row is a swimlane; bars span start_date →
// eta_date and are colored by status. Tasks past their ETA without
// being Done get a red border. A "today" line runs vertically.
//
// Tasks without start_date OR eta_date can't be plotted; they're listed
// in a "Undated" group below the chart so they're not invisible.
//
// Window: an 8-week range centered on today by default. Prev / Next /
// Today buttons let the lead scroll without having to mess with the
// data.

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 28;
const BAR_HEIGHT = 18;
const LABEL_W = 180;
const HEADER_H = 28;

const fmtDay = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayKey = (d) => d.toISOString().slice(0, 10);
const parseDay = (s) => new Date(s + "T00:00:00");

// Round a date to midnight, then add `days` days.
const addDays = (d, days) => new Date(d.getTime() + days * DAY_MS);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function TrackerTimeline({ rows, onOpen }) {
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));

  // 8-week window: 14 days back, 42 days forward (≈ today + 6 weeks).
  // Lead can scroll forward when planning longer pieces.
  const rangeStart = useMemo(() => addDays(anchor, -14), [anchor]);
  const rangeEnd   = useMemo(() => addDays(anchor,  42), [anchor]);
  const totalDays = Math.round((rangeEnd - rangeStart) / DAY_MS);

  // Datable / undated split. Datable means we have BOTH a start and an
  // ETA; we infer the missing one when only one is set:
  //   - has start, no eta  → 5-day default span starting at start
  //   - has eta, no start  → 5-day default span ending at eta
  //   - neither            → undated
  const { datable, undated } = useMemo(() => {
    const yes = [];
    const no = [];
    (rows || []).forEach(r => {
      const s = r.start_date ? parseDay(r.start_date) : null;
      const e = r.eta_date ? parseDay(r.eta_date) : null;
      if (!s && !e) { no.push(r); return; }
      const start = s || addDays(e, -4);
      const end   = e || addDays(s,  4);
      yes.push({ row: r, start, end });
    });
    return { datable: yes, undated: no };
  }, [rows]);

  // Group by assignee. Unassigned and Undated each get their own row
  // at the bottom for findability.
  const swimlanes = useMemo(() => {
    const groups = new Map();
    datable.forEach(item => {
      const k = item.row.assigned_to?.toLowerCase() || "__unassigned__";
      const arr = groups.get(k) || [];
      arr.push(item);
      groups.set(k, arr);
    });
    const lanes = [];
    groups.forEach((items, key) => {
      lanes.push({
        key,
        label: key === "__unassigned__" ? "Unassigned" : nameFromEmail(key),
        items: items.sort((a, b) => a.start - b.start),
      });
    });
    // Stable order: real names alphabetically, unassigned last.
    lanes.sort((a, b) => {
      if (a.key === "__unassigned__") return 1;
      if (b.key === "__unassigned__") return -1;
      return a.label.localeCompare(b.label);
    });
    return lanes;
  }, [datable]);

  // Position helpers — left/width as a percentage of the visible range.
  const pctFor = (day) => Math.max(0, Math.min(100, ((day - rangeStart) / (rangeEnd - rangeStart)) * 100));

  // Week tick lines for visual rhythm. One tick every 7 days starting
  // at the first Sunday >= rangeStart.
  const ticks = useMemo(() => {
    const out = [];
    const cur = new Date(rangeStart);
    cur.setDate(cur.getDate() + ((7 - cur.getDay()) % 7));
    while (cur <= rangeEnd) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 7);
    }
    return out;
  }, [rangeStart, rangeEnd]);

  const todayPct = pctFor(startOfDay(new Date()));
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  return (
    <div className="card" style={{ padding: 12 }}>
      {/* Header — range navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: "var(--tx2)", fontWeight: 700 }}>
          {fmtDay(rangeStart)} — {fmtDay(rangeEnd)} <span style={{ fontWeight: 400, color: "var(--tx3)" }}>· {datable.length} on schedule, {undated.length} undated</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setAnchor(a => addDays(a, -28))} className="btn btn-outline btn-sm">‹ 4w</button>
          <button onClick={() => setAnchor(startOfDay(new Date()))} className="btn btn-outline btn-sm">Today</button>
          <button onClick={() => setAnchor(a => addDays(a, 28))} className="btn btn-outline btn-sm">4w ›</button>
        </div>
      </div>

      {/* Chart */}
      <div style={{ display: "flex", border: "1px solid var(--bd2)", borderRadius: 8, overflow: "hidden" }}>
        {/* Left sticky column: assignee labels */}
        <div style={{ width: LABEL_W, flexShrink: 0, background: "var(--bg2)", borderRight: "1px solid var(--bd2)" }}>
          <div style={{ height: HEADER_H, borderBottom: "1px solid var(--bd2)" }} />
          {swimlanes.length === 0 ? (
            <div style={{ padding: "12px 14px", color: "var(--tx3)", fontSize: 11, fontStyle: "italic" }}>No tasks in this window.</div>
          ) : swimlanes.map(lane => (
            <div key={lane.key} style={{ height: ROW_HEIGHT, padding: "0 14px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--bd2)", fontSize: 12, fontWeight: 600, color: lane.key === "__unassigned__" ? "var(--tx3)" : "var(--tx2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lane.label}
            </div>
          ))}
        </div>

        {/* Right scroll area — chart */}
        <div style={{ flex: 1, position: "relative", overflowX: "auto" }}>
          {/* Date header */}
          <div style={{ height: HEADER_H, borderBottom: "1px solid var(--bd2)", position: "relative", background: "var(--bg2)", fontSize: 10, color: "var(--tx3)" }}>
            {ticks.map(t => {
              const left = pctFor(t);
              if (left < 0 || left > 100) return null;
              return (
                <div key={t.getTime()} style={{ position: "absolute", left: `${left}%`, top: 0, bottom: 0, paddingLeft: 4 }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 1, background: "var(--bd2)" }} />
                  <span style={{ position: "absolute", top: 6, left: 4, whiteSpace: "nowrap" }}>{fmtDay(t)}</span>
                </div>
              );
            })}
          </div>

          {/* Body — swimlane rows */}
          <div style={{ position: "relative" }}>
            {/* Today line spans the body height */}
            {todayInRange && (
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayPct}%`, width: 0 }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 2, background: "var(--red)", opacity: 0.7, zIndex: 1 }} />
              </div>
            )}

            {/* Week tick verticals */}
            {ticks.map(t => {
              const left = pctFor(t);
              return <div key={t.getTime()} style={{ position: "absolute", top: 0, bottom: 0, left: `${left}%`, width: 1, background: "var(--bd2)", opacity: 0.5 }} />;
            })}

            {swimlanes.map(lane => (
              <div key={lane.key} style={{ position: "relative", height: ROW_HEIGHT, borderBottom: "1px solid var(--bd2)" }}>
                {lane.items.map(item => {
                  const r = item.row;
                  const left = pctFor(item.start);
                  const right = pctFor(item.end);
                  if (right < 0 || left > 100) return null;
                  const sm = STATUS_COLORS[r.status] || {};
                  const isOverdue = r.eta_date && r.status !== "Done" && parseDay(r.eta_date) < startOfDay(new Date());
                  // Progress fill: 0 / 50 / 100 by status. Simple,
                  // doesn't pretend we have richer per-task progress.
                  const fillPct = r.status === "Done" ? 100 : r.status === "In progress" ? 50 : 0;
                  const w = Math.max(0.8, right - left);
                  return (
                    <button
                      key={r.id}
                      onClick={() => onOpen?.(r)}
                      title={`${r.title}\n${r.start_date || "?"} → ${r.eta_date || "?"} · ${r.status}${r.priority ? " · " + r.priority : ""}${isOverdue ? " · OVERDUE" : ""}`}
                      style={{
                        position: "absolute",
                        top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                        left: `${left}%`,
                        width: `${w}%`,
                        height: BAR_HEIGHT,
                        padding: 0,
                        border: `1px solid ${isOverdue ? "var(--red)" : sm.border || "var(--bd)"}`,
                        borderRadius: 4,
                        background: sm.bg || "var(--bg)",
                        cursor: "pointer",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        boxShadow: isOverdue ? "0 0 0 1px rgba(239,68,68,0.25)" : "none",
                      }}
                    >
                      {fillPct > 0 && (
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fillPct}%`, background: sm.color || "var(--tabby-purple)", opacity: 0.25 }} />
                      )}
                      <span style={{ position: "relative", zIndex: 1, padding: "0 6px", fontSize: 10, fontWeight: 700, color: sm.color || "var(--tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Undated tail — tasks without dates so they're not invisible. */}
      {undated.length > 0 && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, border: "1px dashed var(--bd2)", background: "var(--bg2)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".4px" }}>
            Undated · {undated.length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {undated.map(r => {
              const sm = STATUS_COLORS[r.status] || {};
              return (
                <button key={r.id} onClick={() => onOpen?.(r)} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 12, border: "1px solid var(--bd2)", background: "var(--bg)", cursor: "pointer", color: "var(--tx2)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: sm.color || "var(--tx3)" }} />
                  {r.title}
                  <span style={{ fontSize: 9, color: "var(--tx3)" }}>· {r.assigned_to ? nameFromEmail(r.assigned_to) : "—"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
