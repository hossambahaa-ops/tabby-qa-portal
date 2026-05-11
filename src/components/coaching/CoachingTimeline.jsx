import React, { useState } from "react";
import { nameFromEmail } from "../../lib/utils.js";

// Per-QA coaching timeline shown on the QA Profile. Combines two
// recommendations:
//
//   #7 Per-QA timeline — vertical list of every session with date,
//      type, rating, and observation badge.
//
//   #13 Effectiveness scoring — for each session we look at the MTD
//      KPI snapshot in the session's month vs the next month and
//      surface "Δ CSAT" / "Δ Coaching%" so the lead can see whether
//      their coaching moved the needle. "—" when the next month's
//      MTD row doesn't exist yet (current cycle still open).
//
// Props:
//   sessions  array of coaching_session rows (already filtered to this QA)
//   mtd       array of mtd_scores rows for the QA, all months
//
// Pure render — no fetches. Source data comes from useQaProfileData.

const MONTH_NUM = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const monthLabelFromDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" }).replace(" ", "-");
};
const nextMonthLabel = (label) => {
  const [mon, yr] = label.split("-");
  let m = MONTH_NUM[mon] + 1, y = parseInt(yr, 10);
  if (m > 12) { m = 1; y += 1; }
  const monStr = Object.keys(MONTH_NUM).find(k => MONTH_NUM[k] === m);
  return `${monStr}-${y}`;
};
const parsePct = (v) => {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace("%", "").replace(",", "."));
  if (isNaN(n)) return null;
  return n > 1 ? n : n * 100;
};
const ratingTone = (r) => {
  if (!r) return { bg: "var(--bg)", color: "var(--tx3)" };
  if (r === "Outstanding" || r === "Exceeds Expectations") return { bg: "var(--green-bg)", color: "var(--green)" };
  if (r === "Meets Expectations") return { bg: "var(--accent-light)", color: "var(--accent-text)" };
  return { bg: "var(--amber-bg)", color: "var(--amber)" };
};
const deltaTone = (d) => {
  if (d == null) return { color: "var(--tx3)", sign: "" };
  if (d > 0) return { color: "var(--green)", sign: "+" };
  if (d < 0) return { color: "var(--red)", sign: "" };
  return { color: "var(--tx3)", sign: "" };
};

export default function CoachingTimeline({ sessions = [], mtd = [] }) {
  // Effectiveness deltas (Δ CSAT / Δ Coach) are noisy when most rows are
  // current-month and have no next-month MTD to compare against. Default
  // OFF; lead opts in via the small toggle in the header.
  const [showEff, setShowEff] = useState(false);

  if (!sessions || sessions.length === 0) return null;

  const sorted = [...sessions].sort((a, b) => (b.session_date || "").localeCompare(a.session_date || ""));
  // Index MTD rows by month label for O(1) lookup.
  const mtdByMonth = {};
  for (const m of mtd) if (m?.month) mtdByMonth[m.month] = m;

  const observed = sessions.filter(s => s.observed_at).length;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="card-title">Coaching timeline · {sessions.length} coaching{sessions.length === 1 ? "" : "s"}{observed > 0 ? ` · ${observed} observed` : ""}</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--tx2)", cursor: "pointer", fontWeight: 500 }}>
          <input type="checkbox" checked={showEff} onChange={e => setShowEff(e.target.checked)} />
          Show effectiveness
        </label>
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        {showEff && (
          <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 10 }}>
            Δ shows the change in MTD KPIs from the session's month to the following month — a directional read on whether the coaching moved the metric.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map(s => {
            const tone = ratingTone(s.performance_rating);
            const sessMonth = monthLabelFromDate(s.session_date);
            const before = mtdByMonth[sessMonth];
            const after = mtdByMonth[nextMonthLabel(sessMonth)];
            const csatBefore = parsePct(before?.csat_pct);
            const csatAfter = parsePct(after?.csat_pct);
            const compBefore = parsePct(before?.coaching_completion_pct);
            const compAfter = parsePct(after?.coaching_completion_pct);
            const dCsat = (csatBefore != null && csatAfter != null) ? Math.round((csatAfter - csatBefore) * 10) / 10 : null;
            const dComp = (compBefore != null && compAfter != null) ? Math.round((compAfter - compBefore) * 10) / 10 : null;
            const csatTone = deltaTone(dCsat);
            const compTone = deltaTone(dComp);
            const obs = (s.observation_empathy != null || s.observation_clarity != null || s.observation_specificity != null);
            const obsAvg = obs
              ? Math.round((((s.observation_empathy || 0) + (s.observation_clarity || 0) + (s.observation_specificity || 0)) / 3) * 10) / 10
              : null;
            return (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: showEff ? "100px 1fr auto auto" : "100px 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  border: "1px solid var(--bd2)",
                  borderRadius: 8,
                  background: "var(--bg)",
                  fontSize: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: "var(--tx)" }}>
                    {s.session_date ? new Date(s.session_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--tx3)" }}>{sessMonth}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{(s.meeting_type || "").replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)" }}>by {nameFromEmail(s.sender_email)}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {s.performance_rating && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: tone.bg, color: tone.color }}>
                      {s.performance_rating}
                    </span>
                  )}
                  {obs && (
                    <span title={`Coaching style: Empathy ${s.observation_empathy ?? "—"}, Clarity ${s.observation_clarity ?? "—"}, Specificity ${s.observation_specificity ?? "—"}`}
                      style={{ fontSize: 10, color: "var(--accent-text)", fontWeight: 600 }}>
                      Obs · {obsAvg}/5
                    </span>
                  )}
                </div>
                {showEff && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 95 }}>
                    <span style={{ fontSize: 10, color: "var(--tx3)" }}>vs next month</span>
                    <span style={{ fontSize: 11, color: csatTone.color, fontWeight: 600 }}>
                      Δ CSAT {dCsat == null ? "—" : `${csatTone.sign}${dCsat.toFixed(1)}%`}
                    </span>
                    <span style={{ fontSize: 11, color: compTone.color, fontWeight: 600 }}>
                      Δ Coach {dComp == null ? "—" : `${compTone.sign}${dComp.toFixed(1)}%`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
