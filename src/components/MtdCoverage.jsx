import React, { useMemo } from "react";

/* Coverage strip for the MTD table.
 *
 * Answers "what is actually populated this month?" before anyone reads a
 * single number. Ported from the pre-publish review page, where it repeatedly
 * caught thin months that looked fine in the table itself — an August with 9
 * of 45 QAs carrying CSAT reads as normal in a grid, and as obviously broken
 * here.
 *
 * It counts the ROWS THE VIEWER IS CURRENTLY LOOKING AT, so it re-scopes with
 * the month / domain / team / QA filters rather than describing the whole
 * table. A strip that ignored the filters would contradict the grid below it.
 */

// A metric counts as present only when it carries real information. "0", "-",
// "N/A" and "0.00%" are absence wearing a number's clothes — the whole point
// of the strip is to not let those pass as coverage.
const filled = (v) => {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s || s === "-" || s === "--" || s === "N/A") return false;
  const n = parseFloat(s.replace("%", ""));
  return Number.isFinite(n) ? n > 0 : true;
};

const METRICS = [
  { key: "evals",   label: "Evaluations", has: (r) => (+r.sbs || 0) + (+r.non_sbs || 0) + (+r.dsat || 0) > 0 },
  { key: "csat",    label: "CSAT",        has: (r) => (+r.csat_total || 0) > 0 },
  { key: "login",   label: "Login hrs",   has: (r) => filled(r.login_hours) },
  { key: "tickets", label: "Tickets",     has: (r) => filled(r.tickets_touched) },
  { key: "side",    label: "Side tasks",  has: (r) => filled(r.side_tasks_duration_mins) },
  { key: "coach",   label: "Coachings",   has: (r) => filled(r.coaching_sessions) },
  { key: "p1",      label: "Phase 1",     has: (r) => filled(r.phase_1_score) },
  { key: "p2",      label: "Phase 2",     has: (r) => filled(r.phase_2_score) },
];

export default function MtdCoverage({ rows, month }) {
  const stats = useMemo(() => {
    const total = rows?.length || 0;
    return METRICS.map((m) => {
      const n = total ? rows.reduce((acc, r) => acc + (m.has(r) ? 1 : 0), 0) : 0;
      return { ...m, n, total, pct: total ? n / total : 0 };
    });
  }, [rows]);

  if (!rows?.length) return null;

  return (
    <div className="card mtd-cov" role="group"
         aria-label={`Data coverage for ${month || "the selected month"}`}>
      <div className="mtd-cov-head">
        <span className="mtd-cov-title">Coverage</span>
        <span className="mtd-cov-sub">
          {rows.length} QA{rows.length === 1 ? "" : "s"}{month ? ` · ${month}` : ""} · matches the filters below
        </span>
      </div>
      <div className="mtd-cov-grid">
        {stats.map((s) => {
          // full / partial / none, so a zero column is visibly different from
          // a nearly-complete one rather than just a shorter bar.
          const tone = s.pct >= 0.95 ? "full" : s.pct === 0 ? "none" : "part";
          return (
            <div key={s.key} className="mtd-cov-item"
                 title={`${s.label}: ${s.n} of ${s.total} QAs have a value`}>
              <div className="mtd-cov-label">{s.label}</div>
              <div className="mtd-cov-value">
                {s.n}<span className="mtd-cov-of">/{s.total}</span>
              </div>
              <div className="mtd-cov-bar">
                <i className={tone} style={{ transform: `scaleX(${s.pct.toFixed(3)})` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
