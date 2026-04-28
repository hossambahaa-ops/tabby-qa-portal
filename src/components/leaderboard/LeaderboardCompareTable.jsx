import React from "react";
import { getTotalScore } from "../../lib/leaderboardScore.js";
import { nameFromEmail } from "../../lib/utils.js";

// 0–2 raw values are stored as fractions (1.0 = 100%); >2 is already
// in percent form. Normalize then format to 1dp + "%".
const fmtPctRow = (v) => {
  const n = parseFloat(String(v ?? 0).replace("%", "")) || 0;
  return (n > 0 && n <= 2 ? n * 100 : n).toFixed(1) + "%";
};

// Side-by-side comparison table rendered when "Compare" is toggled in
// the leaderboard. Pure rendering — selection state lives on the page.
export default function LeaderboardCompareTable({ selectedEmails, ranked, maxScore }) {
  if (!(selectedEmails.size >= 2)) return null;

  const rows = [
    { label: "Total Score",      getValue: r => getTotalScore(r).toFixed(1) + " / " + maxScore },
    { label: "Occupancy",        getValue: r => fmtPctRow(r.occupancy_pct) },
    { label: "Coaching on-time", getValue: r => fmtPctRow(r.ontime_coaching_pct) },
    { label: "Calibration",      getValue: r => fmtPctRow(r.avg_calibration_match_rate) },
    { label: "Observation",      getValue: r => fmtPctRow(r.avg_observation_score_pct) },
    { label: "RTR Score",        getValue: r => fmtPctRow(r.avg_rtr_score) },
    { label: "Tickets/day",      getValue: r => (parseFloat(r.ticket_per_day || 0) || 0).toFixed(1) },
    { label: "DSAT",             getValue: r => r.dsat || 0 },
    { label: "SBS",              getValue: r => r.sbs || 0 },
    { label: "Non-SBS",          getValue: r => r.non_sbs || 0 },
  ];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12, background: "var(--bg)" }}>
      <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
        Comparing {selectedEmails.size} QAs
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--tx3)", fontWeight: 600 }}>Metric</th>
              {[...selectedEmails].map(em => {
                const r = ranked.find(x => x.qa_email?.toLowerCase() === em);
                return (
                  <th key={em} style={{ textAlign: "center", padding: "6px 10px", fontWeight: 700, minWidth: 110 }}>
                    {r ? nameFromEmail(r.qa_email).split(" ")[0] : em.split("@")[0]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.label} style={{ borderBottom: "1px solid var(--bd2)" }}>
                <td style={{ padding: "8px 10px", color: "var(--tx2)", fontWeight: 500 }}>{m.label}</td>
                {[...selectedEmails].map(em => {
                  const r = ranked.find(x => x.qa_email?.toLowerCase() === em);
                  return (
                    <td key={em} style={{ textAlign: "center", padding: "8px 10px", fontWeight: 600 }}>
                      {r ? m.getValue(r) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
