// THE occupancy definition. Every screen and job must go through this file.
//
// ── The rule ────────────────────────────────────────────────────────────────
//   productive minutes
//     = (every evaluation)      × 15    ← SBS evaluations included in this count
//     + (side-by-side only)     × 20    ← SURCHARGE, on top of the 15, not instead
//     + (coaching sessions)     × 30
//     + side-task minutes
//     + any extra minutes the caller opts into (ABT, login — see below)
//
//   occupancy % = productive minutes / (working days × 480) × 100
//
// ── Why this file exists ────────────────────────────────────────────────────
// The surcharge is the part that keeps getting implemented wrong, so read this
// twice: a side-by-side costs 15 + 20 = 35 minutes, NOT 20. The 20 is what a
// side-by-side costs ON TOP of the ordinary evaluation work it still involves.
//
// Until 2026-09-07 six separate places each wrote `sbs * 20 + nonSbs * 15`,
// which silently drops the 15-minute base on every SBS evaluation. The error is
// exactly `sbs × 15` minutes, so it scales with how much SBS work a QA does and
// looks plausible on every individual row — which is why it survived so long.
// Against Mahmoud's "QA Duration Summary" for Aug-2026 it understated the team
// by up to 30.7 points (pola.emad 118.40% vs a true 149.13%); QAs who happened
// to do zero SBS matched perfectly, which made the bug look like it wasn't there.
//
// The source of truth is that sheet's own formula, `=(C*15)+(D*20)`, where C is
// ALL evaluations and D is the SBS subset — hence the double-count by design.
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
  sbsSurchargeMin: 20,  // ADDITIONAL minutes for a side-by-side, on top of the base
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
