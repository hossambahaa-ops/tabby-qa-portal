// QA "belt" titles — single-holder, monthly-defendable accolades.
// Modeled after fighting-game championship belts: only ONE QA holds each
// belt at a time, and it changes hands as the data updates each month.
//
// Currently gated to super_admin only (preview/testing). Once validated,
// remove the role gate in LeaderboardPage / QAProfilePage to roll out
// to everyone.

import { csatPctValue } from "./utils.js";
import { getTotalScore, KPI_SLABS, compareForRank } from "./leaderboardScore.js";
import { MONTH_IDX, sortMonthsDesc } from "./constants.js";

// MTD rows use month strings like "Apr-2026" / "May-2026" (Mon-YYYY),
// NOT ISO "YYYY-MM". All title helpers below operate on that format.

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Parse "Apr-2026" → Date(2026, 3, 1). Returns null on bad input.
function parseMonth(monStr) {
  if (!monStr) return null;
  const [mon, year] = String(monStr).split("-");
  const idx = MONTH_IDX[mon];
  const y = parseInt(year, 10);
  if (idx == null || !y) return null;
  return new Date(y, idx, 1);
}

// True iff month a is chronologically before month b (both Mon-YYYY).
// Exported so consumers can compare months without re-parsing.
export function monthBefore(a, b) {
  const da = parseMonth(a), db = parseMonth(b);
  if (!da || !db) return false;
  return da.getTime() < db.getTime();
}

// Max possible total leaderboard score = sum of KPI weights (55 today).
// Belts that compare "performance" use this scale, NOT raw final_performance,
// so the result agrees with the leaderboard's own #1 ranking.
const MAX_LB_SCORE = Object.values(KPI_SLABS).reduce((s, k) => s + k.weight, 0);

// "On target" for the Ironpulse streak — at this fraction of MAX_LB_SCORE
// or higher counts as a winning month. ~70% of max is roughly equivalent
// to "Slab 2 across the board" (i.e. consistently hitting target).
const ON_TARGET_FRAC = 0.70;
const ON_TARGET_SCORE = MAX_LB_SCORE * ON_TARGET_FRAC;

// Heartwarden requires a meaningful sample, not 1 perfect survey.
const MIN_CSAT_SURVEYS = 10;

/**
 * getLastCompletedMonth() → "Apr-2026"
 *
 * Belts only change hands at the end of a month. While the current calendar
 * month is in flight, the active belt holder remains the previous month's
 * champion — matches how real championship belts work (you keep the belt
 * until you actually lose a title fight).
 *
 * On 2026-05-04, returns "Apr-2026" — same Mon-YYYY format MTD rows use.
 */
export function getLastCompletedMonth(now = new Date()) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${MONTH_NAMES[prev.getMonth()]}-${prev.getFullYear()}`;
}

/**
 * getCurrentCalendarMonth() → "May-2026"
 *
 * The month the wall clock is in. This is the "belts recalculate at end of
 * THIS month" month — distinct from the leaderboard's selected-view month.
 */
export function getCurrentCalendarMonth(now = new Date()) {
  return `${MONTH_NAMES[now.getMonth()]}-${now.getFullYear()}`;
}

/**
 * formatMonthLabel("Apr-2026") → "April 2026"
 *
 * Human-readable month name for tooltips/headers. Returns "" for empty
 * input so callers can use it without conditional checks.
 */
export function formatMonthLabel(monStr) {
  const d = parseMonth(monStr);
  if (!d) return monStr || "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export const TITLE_CATALOG = {
  pulse_sovereign: {
    label: "Pulse Sovereign",
    emoji: "👑", // 👑
    color: "#F59E0B",
    rank: 1,
    desc: "Undisputed #1 on the leaderboard. They set the rhythm for the team.",
    metricLabel: "Total score",
  },
  heartwarden: {
    label: "Heartwarden",
    emoji: "💞", // 💞
    color: "#22C55E",
    rank: 2,
    desc: `Highest CSAT this month (min ${MIN_CSAT_SURVEYS} surveys). Guards every customer's experience.`,
    metricLabel: "CSAT",
  },
  pulseforge: {
    label: "Pulseforge",
    emoji: "⚒️", // ⚒️
    color: "#EA580C",
    rank: 3,
    desc: "Most evaluations completed this month. Hammers raw work into shape, never tires.",
    metricLabel: "Evaluations",
  },
  ironpulse: {
    label: "Ironpulse",
    emoji: "🛡️", // 🛡️
    color: "#06B6D4",
    rank: 4,
    desc: `Longest active on-target streak (consecutive months scoring ≥${ON_TARGET_SCORE.toFixed(0)} of ${MAX_LB_SCORE}). Never falters, never flatlines.`,
    metricLabel: "Streak",
  },
  risen_phoenix: {
    label: "Risen Phoenix",
    emoji: "🔥", // 🔥
    color: "#EC4899",
    rank: 5,
    desc: "Biggest month-over-month leaderboard climb. Rises from the flatline.",
    metricLabel: "Δ vs last month",
  },
};

export const TITLE_KEYS = ["pulse_sovereign", "heartwarden", "pulseforge", "ironpulse", "risen_phoenix"];

// Sort holder list by belt rank (Sovereign first).
export const sortTitles = (titles) =>
  [...titles].sort((a, b) => (TITLE_CATALOG[a.title_key]?.rank || 99) - (TITLE_CATALOG[b.title_key]?.rank || 99));

// Robust numeric parse for MTD raw fields that arrive as "85", "85.0", "0.85"
// or "85%" depending on which sync wrote them.
const num = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(",", ".").replace("%", "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

// Sort Mon-YYYY month strings descending (latest first). Delegates to
// the project-wide sortMonthsDesc so behavior matches month dropdowns.
const monthsDesc = (months) => sortMonthsDesc(months);

// Walk months ending at `endMonth` going backward, return count of
// consecutive months where the QA's leaderboard total score was at or
// above ON_TARGET_SCORE. Uses getTotalScore so the threshold matches
// the same metric the leaderboard ranks by.
const onTargetStreak = (rowsByMonth, endMonth, allMonthsDesc) => {
  const startIdx = allMonthsDesc.indexOf(endMonth);
  if (startIdx < 0) return 0;
  let streak = 0;
  for (let i = startIdx; i < allMonthsDesc.length; i++) {
    const m = allMonthsDesc[i];
    const row = rowsByMonth[m];
    if (!row) break;
    const score = getTotalScore(row);
    if (!isFinite(score) || score < ON_TARGET_SCORE) break;
    streak++;
  }
  return streak;
};

/**
 * computeTitleHolders(allRows, selectedMonth) → { [title_key]: { qa_email, value, display } | null }
 *
 * allRows:        every MTD row available (across all months) — already
 *                 filtered to QAs only by the page caller.
 * selectedMonth:  YYYY-MM string. The "current month" titles are computed
 *                 against rows where month === selectedMonth.
 *
 * Each entry is the single QA who holds the belt for that month, plus the
 * raw value that earned it (used for tooltips / future tiebreak logic).
 * Returns null for any belt with no eligible holder.
 */
export function computeTitleHolders(allRows, selectedMonth) {
  if (!selectedMonth || !Array.isArray(allRows) || allRows.length === 0) {
    return Object.fromEntries(TITLE_KEYS.map((k) => [k, null]));
  }

  const monthRows = allRows.filter((r) => r.month === selectedMonth);
  const result = { pulse_sovereign: null, heartwarden: null, pulseforge: null, ironpulse: null, risen_phoenix: null };

  // 👑 Pulse Sovereign — leaderboard #1 by total slab-based score.
  // Uses compareForRank (same cascade the leaderboard uses) so the belt
  // holder always matches the visible #1 row even on score ties. Before
  // this change, with 11+ QAs commonly tied at the top score, the
  // belt-holder was effectively random.
  const sovereignSorted = monthRows
    .filter((r) => { const s = getTotalScore(r); return isFinite(s) && s > 0; })
    .slice()
    .sort(compareForRank);
  if (sovereignSorted.length) {
    const winner = sovereignSorted[0];
    result.pulse_sovereign = { qa_email: winner.qa_email, value: getTotalScore(winner), display: getTotalScore(winner).toFixed(1) + " / " + MAX_LB_SCORE };
  }

  // 💞 Heartwarden — highest CSAT % with min surveys.
  // Tie-break: csat desc → surveys desc → qa_email asc (deterministic).
  const heartSorted = monthRows
    .map((r) => ({ r, surveys: Number(r.csat_total || 0), csat: csatPctValue(r.csat_pct) }))
    .filter((x) => x.surveys >= MIN_CSAT_SURVEYS && x.csat !== null)
    .sort((a, b) => {
      if (a.csat !== b.csat) return b.csat - a.csat;
      if (a.surveys !== b.surveys) return b.surveys - a.surveys;
      return String(a.r.qa_email || "").localeCompare(String(b.r.qa_email || ""));
    });
  if (heartSorted.length) {
    const w = heartSorted[0];
    result.heartwarden = { qa_email: w.r.qa_email, value: w.csat, display: w.csat.toFixed(1) + "% (" + w.surveys + " surveys)" };
  }

  // ⚒️ Pulseforge — most evaluations (sbs + non_sbs).
  // Tie-break: evals desc → surveys desc → qa_email asc.
  const forgeSorted = monthRows
    .map((r) => ({ r, evals: (num(r.sbs) || 0) + (num(r.non_sbs) || 0), surveys: Number(r.csat_total || 0) }))
    .filter((x) => x.evals > 0)
    .sort((a, b) => {
      if (a.evals !== b.evals) return b.evals - a.evals;
      if (a.surveys !== b.surveys) return b.surveys - a.surveys;
      return String(a.r.qa_email || "").localeCompare(String(b.r.qa_email || ""));
    });
  if (forgeSorted.length) {
    const w = forgeSorted[0];
    result.pulseforge = { qa_email: w.r.qa_email, value: w.evals, display: Math.round(w.evals).toLocaleString() + " evals" };
  }

  // 🛡️ Ironpulse — longest consecutive on-target streak ending at selectedMonth.
  // Group rows per QA, then walk months back from selectedMonth.
  const allMonths = monthsDesc([...new Set(allRows.map((r) => r.month).filter(Boolean))]);
  const byQa = {};
  allRows.forEach((r) => {
    const e = r.qa_email?.toLowerCase();
    if (!e) return;
    if (!byQa[e]) byQa[e] = { rowsByMonth: {}, anyEmail: r.qa_email };
    byQa[e].rowsByMonth[r.month] = r;
  });
  // Tie-break for streak: streak length desc → current-month score desc
  // → qa_email asc. Without this, two QAs on identical streaks swap the
  // belt randomly per render.
  const streakCandidates = [];
  Object.entries(byQa).forEach(([, q]) => {
    const s = onTargetStreak(q.rowsByMonth, selectedMonth, allMonths);
    if (s < 2) return; // 1-month "streak" is not a streak
    const curr = q.rowsByMonth[selectedMonth];
    streakCandidates.push({ qa_email: q.anyEmail, streak: s, currScore: curr ? getTotalScore(curr) : 0 });
  });
  streakCandidates.sort((a, b) => {
    if (a.streak !== b.streak) return b.streak - a.streak;
    if (a.currScore !== b.currScore) return b.currScore - a.currScore;
    return String(a.qa_email || "").localeCompare(String(b.qa_email || ""));
  });
  if (streakCandidates.length) {
    const w = streakCandidates[0];
    result.ironpulse = { qa_email: w.qa_email, value: w.streak, display: w.streak + " month streak" };
  }

  // 🔥 Risen Phoenix — biggest leaderboard-score climb vs previous month.
  // "Previous month" is the QA's most recent prior row (handles gaps for
  // leave / vacation). Uses getTotalScore so the delta is on the same
  // scale the rest of the app talks in.
  // Tie-break for Phoenix: delta desc → current-month score desc → qa_email asc.
  const phoenixCandidates = [];
  monthRows.forEach((curr) => {
    const e = curr.qa_email?.toLowerCase();
    if (!e || !byQa[e]) return;
    const currScore = getTotalScore(curr);
    if (!isFinite(currScore) || currScore <= 0) return;
    const allOwn = Object.values(byQa[e].rowsByMonth)
      .filter((r) => r.month && monthBefore(r.month, selectedMonth))
      .sort((a, b) => {
        const da = parseMonth(a.month), db = parseMonth(b.month);
        return (db?.getTime() || 0) - (da?.getTime() || 0);
      });
    const prev = allOwn[0];
    if (!prev) return;
    const prevScore = getTotalScore(prev);
    if (!isFinite(prevScore)) return;
    const delta = currScore - prevScore;
    if (delta < 5) return; // don't crown someone for noise
    phoenixCandidates.push({ qa_email: curr.qa_email, delta, currScore });
  });
  phoenixCandidates.sort((a, b) => {
    if (a.delta !== b.delta) return b.delta - a.delta;
    if (a.currScore !== b.currScore) return b.currScore - a.currScore;
    return String(a.qa_email || "").localeCompare(String(b.qa_email || ""));
  });
  if (phoenixCandidates.length) {
    const w = phoenixCandidates[0];
    result.risen_phoenix = { qa_email: w.qa_email, value: w.delta, display: "+" + w.delta.toFixed(1) + " pts" };
  }

  return result;
}

/**
 * holdersByEmail({…}) → { [email_lc]: [{ title_key, value, display }, …] }
 *
 * Inverts the map so leaderboard rows can do an O(1) lookup of "what
 * belts does this QA hold this month?".
 */
export function holdersByEmail(holders) {
  const out = {};
  if (!holders) return out;
  Object.entries(holders).forEach(([title_key, h]) => {
    if (!h || !h.qa_email) return;
    const e = h.qa_email.toLowerCase();
    (out[e] = out[e] || []).push({ title_key, value: h.value, display: h.display });
  });
  // Sort each QA's belts by belt rank.
  Object.keys(out).forEach((e) => { out[e] = sortTitles(out[e]); });
  return out;
}
