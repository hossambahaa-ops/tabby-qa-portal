// QA "belt" titles — single-holder, monthly-defendable accolades.
// Modeled after fighting-game championship belts: only ONE QA holds each
// belt at a time, and it changes hands as the data updates each month.
//
// Currently gated to super_admin only (preview/testing). Once validated,
// remove the role gate in LeaderboardPage / QAProfilePage to roll out
// to everyone.

import { csatPctValue } from "./utils.js";

// Threshold considered "on target" for the Ironpulse streak.
// Matches the `on_target` badge semantics (≥ this final_performance).
const ON_TARGET_PCT = 75;

// Heartwarden requires a meaningful sample, not 1 perfect survey.
const MIN_CSAT_SURVEYS = 10;

export const TITLE_CATALOG = {
  pulse_sovereign: {
    label: "Pulse Sovereign",
    emoji: "👑", // 👑
    color: "#F59E0B",
    rank: 1,
    desc: "Undisputed #1 on the leaderboard. They set the rhythm for the team.",
    metricLabel: "Final performance",
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
    desc: `Longest active on-target streak (consecutive months at ≥${ON_TARGET_PCT}% final performance). Never falters, never flatlines.`,
    metricLabel: "Streak",
  },
  risen_phoenix: {
    label: "Risen Phoenix",
    emoji: "🔥", // 🔥
    color: "#EC4899",
    rank: 5,
    desc: "Biggest month-over-month performance climb. Rises from the flatline.",
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

// Parse a final_performance value, normalizing fractional 0–1 to 0–100.
const perfPct = (v) => {
  const n = num(v);
  if (n === null) return null;
  return n <= 1 ? n * 100 : n;
};

// Sort months YYYY-MM strings descending (latest first). Falls back to
// string compare which is safe for ISO YYYY-MM.
const monthsDesc = (months) => [...months].sort((a, b) => (b > a ? 1 : -1));

// Walk months ending at `endMonth` going backward, return count of
// consecutive months where the QA was at or above ON_TARGET_PCT.
const onTargetStreak = (rowsByMonth, endMonth, allMonthsDesc) => {
  const startIdx = allMonthsDesc.indexOf(endMonth);
  if (startIdx < 0) return 0;
  let streak = 0;
  for (let i = startIdx; i < allMonthsDesc.length; i++) {
    const m = allMonthsDesc[i];
    const row = rowsByMonth[m];
    if (!row) break;
    const p = perfPct(row.final_performance);
    if (p === null || p < ON_TARGET_PCT) break;
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

  // 👑 Pulse Sovereign — highest final_performance this month.
  let topPerf = null;
  monthRows.forEach((r) => {
    const p = perfPct(r.final_performance);
    if (p === null) return;
    if (!topPerf || p > topPerf.value) topPerf = { qa_email: r.qa_email, value: p };
  });
  if (topPerf) result.pulse_sovereign = { ...topPerf, display: topPerf.value.toFixed(1) + "%" };

  // 💞 Heartwarden — highest CSAT % with min surveys.
  let topCsat = null;
  monthRows.forEach((r) => {
    const surveys = Number(r.csat_total || 0);
    if (surveys < MIN_CSAT_SURVEYS) return;
    const c = csatPctValue(r.csat_pct);
    if (c === null) return;
    if (!topCsat || c > topCsat.value || (c === topCsat.value && surveys > topCsat.surveys)) {
      topCsat = { qa_email: r.qa_email, value: c, surveys };
    }
  });
  if (topCsat) result.heartwarden = { qa_email: topCsat.qa_email, value: topCsat.value, display: topCsat.value.toFixed(1) + "% (" + topCsat.surveys + " surveys)" };

  // ⚒️ Pulseforge — most evaluations (sbs + non_sbs).
  let topVol = null;
  monthRows.forEach((r) => {
    const sbs = num(r.sbs) || 0;
    const non = num(r.non_sbs) || 0;
    const total = sbs + non;
    if (total <= 0) return;
    if (!topVol || total > topVol.value) topVol = { qa_email: r.qa_email, value: total };
  });
  if (topVol) result.pulseforge = { ...topVol, display: Math.round(topVol.value).toLocaleString() + " evals" };

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
  let topStreak = null;
  Object.entries(byQa).forEach(([, q]) => {
    const s = onTargetStreak(q.rowsByMonth, selectedMonth, allMonths);
    if (s < 2) return; // 1-month "streak" is not a streak
    if (!topStreak || s > topStreak.value) topStreak = { qa_email: q.anyEmail, value: s };
  });
  if (topStreak) result.ironpulse = { ...topStreak, display: topStreak.value + " month streak" };

  // 🔥 Risen Phoenix — biggest improvement vs previous available month for that QA.
  // "Previous month" is the QA's most recent prior row, not necessarily the
  // calendar month immediately before — handles gaps (vacation, leave).
  let topPhoenix = null;
  monthRows.forEach((curr) => {
    const e = curr.qa_email?.toLowerCase();
    if (!e || !byQa[e]) return;
    const currPerf = perfPct(curr.final_performance);
    if (currPerf === null) return;
    const allOwn = Object.values(byQa[e].rowsByMonth)
      .filter((r) => r.month && r.month < selectedMonth)
      .sort((a, b) => (b.month > a.month ? 1 : -1));
    const prev = allOwn[0];
    if (!prev) return;
    const prevPerf = perfPct(prev.final_performance);
    if (prevPerf === null) return;
    const delta = currPerf - prevPerf;
    if (delta < 5) return; // don't crown someone for noise
    if (!topPhoenix || delta > topPhoenix.value) topPhoenix = { qa_email: curr.qa_email, value: delta };
  });
  if (topPhoenix) result.risen_phoenix = { ...topPhoenix, display: "+" + topPhoenix.value.toFixed(1) + " pts" };

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
