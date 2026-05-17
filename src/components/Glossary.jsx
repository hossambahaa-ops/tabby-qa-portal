import React, { useState } from "react";
import { metricHelp } from "../lib/metricHelp.js";

// Glossary panel — renders every metric definition from
// `metricHelp` as a searchable card grid. Embedded under Admin →
// Audit Trail's tab bar (you can lift it elsewhere if a better home
// appears). Single source of truth so the tooltips on every page
// and the glossary itself can't drift apart — both read the same
// constant.
const SECTIONS = [
  { title: "Composite & ranking", keys: ["score", "rank", "jkq"] },
  { title: "Customer satisfaction", keys: ["csat", "csat_total", "dsat"] },
  { title: "Productivity", keys: ["occupancy", "ticket_per_day", "side_tasks", "pending_side", "working_days", "wd_payable"] },
  { title: "Coaching", keys: ["coaching_pct", "sbs", "rtr", "observation", "calibration"] },
  { title: "Attendance", keys: ["adherence", "attendance_health", "nsnc", "shift_end", "planned_code", "checked_in_at"] },
];

const LABELS = {
  score: "Score / MTD score",
  rank: "Rank",
  jkq: "JKQ",
  csat: "CSAT",
  csat_total: "CSAT total (surveys)",
  dsat: "DSAT",
  occupancy: "Occupancy",
  ticket_per_day: "Avg T/D (tickets per day)",
  side_tasks: "ST/Hr (side-task hours)",
  pending_side: "Pending side tasks",
  working_days: "WD (working days)",
  wd_payable: "WD Payable",
  coaching_pct: "Coaching %",
  sbs: "SBS (side-by-side)",
  rtr: "RTR (real-time review)",
  observation: "CO % (coaching observation)",
  calibration: "Calibration",
  adherence: "Adherence",
  attendance_health: "Attendance Health",
  nsnc: "NSNC (no show / no call)",
  shift_end: "shift_end",
  planned_code: "planned_code",
  checked_in_at: "checked_in_at",
};

export default function Glossary() {
  const [q, setQ] = useState("");
  const lower = q.trim().toLowerCase();
  const matches = (key) => {
    if (!lower) return true;
    const label = (LABELS[key] || key).toLowerCase();
    const def = (metricHelp[key] || "").toLowerCase();
    return label.includes(lower) || def.includes(lower) || key.toLowerCase().includes(lower);
  };
  const total = Object.keys(metricHelp).length;
  const visible = Object.keys(metricHelp).filter(matches);
  return (
    <div>
      <div className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)" }}>Metric glossary</div>
            <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>
              Every metric in Pulse, with a one-line definition. Same source as the in-line tooltips, so what you see here is what your QAs see when they hover the ⓘ on a KPI label. {visible.length} of {total} shown.
            </div>
          </div>
          <input
            className="form-input"
            style={{ fontSize: 12, padding: "6px 10px", minWidth: 240 }}
            type="text"
            placeholder="Search metric…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {SECTIONS.map(({ title, keys }) => {
        const sectionKeys = keys.filter(matches);
        if (sectionKeys.length === 0) return null;
        return (
          <div key={title} className="card" style={{ padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>{title}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {sectionKeys.map((k) => (
                <div key={k} style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--bd2)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>{LABELS[k] || k}</div>
                  <div style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.5 }}>{metricHelp[k]}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
