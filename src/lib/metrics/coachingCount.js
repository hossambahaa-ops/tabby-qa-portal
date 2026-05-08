// Canonical resolvers for "how many coachings did this QA do?". The same
// metric exists in 4 different shapes today, each with a different
// denominator and a different freshness window:
//
//   1. mtd_scores.coaching_sessions
//        Coachings counted by COACHING-creation date in BigQuery's MTD
//        rollup. Stable for past months, lags ~1 hour for the current
//        month (mtd-sync runs hourly).
//
//   2. mtd_scores.total_coachings_by_coaching_created_date
//        Same as #1 in spirit but counted by ticket+agent rather than
//        session_key. Always >= #1.
//
//   3. mtd_scores.total_coachings_by_eval_created_date
//        Coachings counted against the MONTH OF THE EVAL they coach,
//        not the month they were delivered in. Used by completion %
//        and on-time % since both ratios anchor on eval eligibility.
//        Will be < #2 early in the month (eval coverage hasn't caught
//        up yet) and approach it as the month closes.
//
//   4. productivity_history.coaching_sessions
//        Daily slice from a separate Google Sheet. Updates within ~15
//        min of the source edit. UNDERCOUNTS today because the daily
//        sheet's SQL doesn't UNION the CRM coaching table — see the
//        2026-05-07 incident. Treat as a freshness window, not a
//        denominator, until the sheet is fixed.
//
//   5. coaching_submissions.count(*)
//        Raw feed (added 2026-05-07). The truth-source as of today,
//        but only covers the rolling 30-day window the upstream sheet
//        publishes.
//
// The drift surfaced today (Hesham's MTD vs daily) was a direct
// consequence of pages mixing #1 / #3 / #4 without naming which one.
// Every coaching count read should now go through one of these named
// helpers so the source is explicit at the call site.

// PRIMARY ACCESSORS (mtd_scores row in, integer out)

// "How many coachings did this QA deliver in the calendar month?"
// Use this for headline counts, leaderboards, performance cards.
export const coachingsDelivered = (mtdRow) =>
  Number(mtdRow?.total_coachings_by_coaching_created_date ?? mtdRow?.coaching_sessions ?? 0);

// "How many of this month's eligible evals were coached?"
// Use this for completion / on-time ratios. Don't show as a headline
// count without the eligibility denominator alongside it.
export const coachingsByEvalDate = (mtdRow) =>
  Number(mtdRow?.total_coachings_by_eval_created_date ?? 0);

// PRIMARY RATIOS

// "Completion %" — what fraction of eligible evals were coached.
// Returns null when no evals are eligible yet (callers should render
// "—", not "0%", for that case).
export const coachingCompletionRatio = (mtdRow) => {
  const eligible = Number(mtdRow?.coaching_eligibility_count ?? 0);
  if (eligible === 0) return null;
  return coachingsByEvalDate(mtdRow) / eligible;
};

// "On-time %" — prefer the eval-based ratio when there's eligibility,
// fall back to the CRM-anchored ratio (creation-date denominator) when
// the eval-based one is undefined / zero. Returns null when neither is
// meaningful.
export const coachingOnTimeRatio = (mtdRow) => {
  const eligible = Number(mtdRow?.coaching_eligibility_count ?? 0);
  if (eligible > 0) {
    const evalDenom = coachingsByEvalDate(mtdRow);
    if (evalDenom > 0) {
      const num = Number(mtdRow?.total_ontime_coachings ?? 0)
                + Number(mtdRow?.late_count ?? 0)
                - Number(mtdRow?.invalid_count ?? 0);
      return Math.min(Math.max(num, 0) / evalDenom, 1);
    }
  }
  // crm_pct_coaching_on_time is stored as text like "94.2%" or "0%"
  const crm = mtdRow?.crm_pct_coaching_on_time;
  if (crm == null || crm === "") return null;
  const n = parseFloat(String(crm).replace("%", "").trim());
  if (isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
};

// DAILY ACCESSOR (productivity_history row in)

// "How many coachings did this QA log on this date?"
// LIMITATION: undercounts because the daily Google Sheet's SQL doesn't
// UNION the CRM coaching table. Use only for daily-trend visualizations
// where directional movement matters more than absolute count. For
// authoritative monthly counts, use coachingsDelivered() against
// mtd_scores.
export const coachingsOnDay = (productivityRow) =>
  Number(productivityRow?.coaching_sessions ?? 0);

// FORMATTERS

// Wrap a ratio in the project's "—" / "0.0%" convention.
export const formatCoachingPct = (ratio) => {
  if (ratio == null || isNaN(ratio)) return "—";
  return (ratio * 100).toFixed(1) + "%";
};
