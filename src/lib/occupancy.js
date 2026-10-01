// THE occupancy definition. Every screen and job must go through this file.
//
// ── The rule ────────────────────────────────────────────────────────────────
//   productive minutes
//     = (every evaluation)      × 15    ← SBS evaluations included in this count
//     + (side-by-side only)     × 5     ← SURCHARGE, on top of the 15, not instead
//     + (coaching sessions)     × 30
//     + side-task minutes
//     + any extra minutes the caller opts into (ABT, login — see below)
//
//   occupancy % = productive minutes / (working days × 480) × 100
//
// ── An SBS is 20 minutes, a normal evaluation is 15 ─────────────────────────
// So the SURCHARGE is 5 — the DIFFERENCE between the two, not the cost of an
// SBS. A side-by-side costs 15 + 5 = 20 minutes in total.
//
// This reverses the 2026-09-07 change, on Hossam's explicit instruction
// (2026-10-01): "The SBS is 20 Mins! and the non is 15, the difference is 5
// minutes only." That change had read Mahmoud's "QA Duration Summary" formula
// `=(C*15)+(D*20)` — C all evaluations, D the SBS subset — as a deliberate
// double-count making an SBS 35 minutes. Hossam confirms the real rule is 20,
// so that sheet over-credits SBS and Pulse will no longer agree with it.
// If someone later reports a mismatch against the QA Duration Summary, this is
// why; take it up with Ops rather than changing the number back.
//
// The surcharge keeps getting implemented wrong in one specific way: writing
// `sbs * 20 + nonSbs * 15` drops the 15-minute base on SBS rows. That is still
// wrong — it is just no longer coincidentally close, since the surcharge is 5.
// Import the helpers below instead of re-deriving the arithmetic.
//
// ── If you are about to add a seventh copy of this arithmetic ───────────────
// Don't. Import `productiveMinutes` / `occupancyPct`. Callers differ only in
// which OPTIONAL minutes they fold in, and those differences are deliberate:
//   • ABT (countable_minutes) — QA Profile and Eval History include it.
//   • Login minutes           — only the self-service "today" widget adds these;
//                               every month-level view excludes them, because
//                               login time is availability, not output.
// Pass them via `extraMin` so the choice is visible at the call site instead of
// hiding inside a re-derived formula.

/** Default rates. Overridable per team via `team_targets` (see ratesFrom). */
export const OCCUPANCY_RATES = {
  evalBaseMin: 15,      // every evaluation, side-by-side or not
  sbsSurchargeMin: 5,   // ADDITIONAL minutes for a side-by-side, on top of the base (SBS = 15 + 5 = 20)
  coachingMin: 30,
  shiftMin: 480,        // 8h
};

/**
 * Build a rates object from team_targets lookups, falling back to the defaults.
 * `findTgt` takes a metric key and returns a row with `.target_value`, or null.
 */
export function ratesFrom(findTgt) {
  const num = (key, dflt) => {
    const v = parseFloat(findTgt?.(key)?.target_value);
    return Number.isFinite(v) ? v : dflt;
  };
  return {
    evalBaseMin: num("non_sbs_duration_minutes", OCCUPANCY_RATES.evalBaseMin),
    sbsSurchargeMin: num("sbs_duration_minutes", OCCUPANCY_RATES.sbsSurchargeMin),
    coachingMin: num("coaching_duration_minutes", OCCUPANCY_RATES.coachingMin),
    shiftMin: num("daily_working_hours", 8) * 60,
  };
}

/**
 * Productive minutes for a period.
 *
 * `sbs` must ALSO be counted in nothing else — pass the three evaluation
 * buckets separately and this adds the base to all of them itself. DSAT
 * analyses are ordinary evaluations: base rate, no surcharge.
 */
export function productiveMinutes(
  { sbs = 0, nonSbs = 0, dsat = 0, coaching = 0, sideTaskMin = 0, extraMin = 0 } = {},
  rates = OCCUPANCY_RATES,
) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const evaluations = n(sbs) + n(nonSbs) + n(dsat);
  return (
    evaluations * rates.evalBaseMin +
    n(sbs) * rates.sbsSurchargeMin +
    n(coaching) * rates.coachingMin +
    n(sideTaskMin) +
    n(extraMin)
  );
}

/**
 * Occupancy as a percentage. Returns null when there is no denominator —
 * callers must render that as "—", never as 0%, which reads as "did nothing"
 * rather than "we don't know how many days they worked".
 *
 * Deliberately uncapped: >100% is real and meaningful here (a QA can log more
 * task time than a nominal 8h shift), and Hossam has confirmed it should show.
 */
export function occupancyPct(parts, workingDays, rates = OCCUPANCY_RATES) {
  const wd = Number(workingDays);
  if (!Number.isFinite(wd) || wd <= 0) return null;
  return (productiveMinutes(parts, rates) / (wd * rates.shiftMin)) * 100;
}

/** Single-day occupancy — same rule, one shift as the denominator. */
export function dailyOccupancyPct(parts, rates = OCCUPANCY_RATES) {
  return occupancyPct(parts, 1, rates);
}
