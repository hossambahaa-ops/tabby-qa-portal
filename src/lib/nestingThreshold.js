// Data + maths for the Nesting Pass Threshold Simulator.
//
// Deliberately a standalone module with NO React and no network calls: the
// page reads everything through the helpers below, so when these batches are
// replaced by a live Metabase / BigQuery pull only this file changes. Keep it
// that way — no component should reach past `simulate()` into the raw counts.
//
// SCORING MODEL
// Each agent is assessed on 4 tickets. Each ticket scores 4 attributes worth
// 25 points each (Investigation, Resolution, Tone of Voice, Empathy &
// Personalization). Two compliance attributes (Customer Data, Avoidance &
// Misconduct) are not scored, but a violation zeroes THAT TICKET only. An
// agent's score is the mean of their 4 tickets, so every possible score is a
// multiple of 100/16 = 6.25.
//
// Those steps are exact in binary floating point (6.25 = 2^2 + 2^1 + 2^-2), so
// `score >= threshold` is safe here and needs no epsilon. That is a property of
// this particular scale, not a general licence — if the step ever stops being a
// power-of-two fraction, revisit every comparison in this file.

export const SCORE_STEP = 6.25;
export const MAX_SCORE = 100;

// The threshold the business is currently proposing. Every "change versus
// baseline" figure on the page is measured against this, so it lives here
// rather than being repeated in the UI.
export const BASELINE_THRESHOLD = 75;

export const REGIONS = [
  { key: "all", label: "All" },
  { key: "ksa", label: "KSA" },
  { key: "egypt", label: "Egypt" },
];

// ── Primary model ────────────────────────────────────────────────────────
// Legacy-checklist assessments re-scored under V2 rules.
export const PRIMARY = {
  id: "primary",
  label: "Primary model",
  note: "Legacy assessments re-scored under V2 rules",
  period: "June–August 2026",
  agents: 137,
  tickets: 749,
  // score → agents, split by region. Regions are the atomic unit; "All" is
  // always computed as ksa + egypt so the two can never drift apart.
  byScore: [
    { score: 25.0, ksa: 1, egypt: 0 },
    { score: 31.25, ksa: 1, egypt: 0 },
    { score: 37.5, ksa: 1, egypt: 1 },
    { score: 43.75, ksa: 5, egypt: 0 },
    { score: 50.0, ksa: 3, egypt: 3 },
    { score: 56.25, ksa: 1, egypt: 0 },
    { score: 62.5, ksa: 2, egypt: 3 },
    { score: 68.75, ksa: 4, egypt: 2 },
    { score: 75.0, ksa: 8, egypt: 5 },
    { score: 81.25, ksa: 14, egypt: 11 },
    { score: 87.5, ksa: 12, egypt: 9 },
    { score: 93.75, ksa: 15, egypt: 17 },
    { score: 100.0, ksa: 13, egypt: 6 },
  ],
};

// ── Validation model ─────────────────────────────────────────────────────
// A separate cohort assessed NATIVELY on V2 — not re-scored. Its value is
// independence: it is the only check that the re-scoring exercise above did
// not bake in an artefact. KSA-only, so it has no region split.
export const VALIDATION = {
  id: "validation",
  label: "Native V2 pilot",
  note: "Assessed directly on V2, not re-scored",
  period: "August 2026",
  agents: 42,
  region: "KSA only",
  // No region split exists for this cohort, so the counts are parked under
  // `ksa` to keep one row shape. Always query it with region "all" — asking
  // for "egypt" would return a truthful-looking zero that means "not measured".
  regionSplit: false,
  byScore: [
    { score: 37.5, ksa: 1, egypt: 0 },
    { score: 50.0, ksa: 1, egypt: 0 },
    { score: 62.5, ksa: 4, egypt: 0 },
    { score: 68.75, ksa: 3, egypt: 0 },
    { score: 75.0, ksa: 3, egypt: 0 },
    { score: 81.25, ksa: 7, egypt: 0 },
    { score: 87.5, ksa: 10, egypt: 0 },
    { score: 93.75, ksa: 8, egypt: 0 },
    { score: 100.0, ksa: 5, egypt: 0 },
  ],
};

// ── Re-assessment ────────────────────────────────────────────────────────
// Agents who failed, were coached, and were assessed again. Evidence about
// recovery, NOT about where the threshold should sit.
//
// Caveat carried in the data because it changes how the panel must be read:
// this cohort was re-assessed under the LEGACY checklist. No re-assessment has
// run under V2 yet.
export const REASSESSMENT = {
  id: "reassessment",
  label: "Re-assessment after coaching",
  agents: 16,
  byScore: [
    { score: 50.0, ksa: 1, egypt: 0 },
    { score: 75.0, ksa: 1, egypt: 0 },
    { score: 81.25, ksa: 1, egypt: 0 },
    { score: 87.5, ksa: 5, egypt: 0 },
    { score: 93.75, ksa: 6, egypt: 0 },
    { score: 100.0, ksa: 2, egypt: 0 },
  ],
};

// ── Attribute failure rates ──────────────────────────────────────────────
// Share of TICKETS on which each attribute was failed. Denominator is the
// 749-ticket pool, which is NOT the same as the 137 x 4 = 548 tickets behind
// the score distribution above — so these rates explain WHERE agents lose
// points, but you cannot multiply them back into the pass rate. The page says
// so next to the panel.
export const ATTRIBUTE_FAILS = {
  ticketBase: 749,
  rows: [
    { attribute: "Resolution", rate: 28.3, scored: true },
    { attribute: "Investigation", rate: 15.9, scored: true },
    { attribute: "Compliance", rate: 5.9, scored: false },
    { attribute: "Tone of Voice", rate: 5.7, scored: true },
    { attribute: "Empathy & Personalization", rate: 4.0, scored: true },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────

/** Agents at a given score row for the selected region. */
const countFor = (row, region) =>
  region === "ksa" ? row.ksa : region === "egypt" ? row.egypt : row.ksa + row.egypt;

/** Every score on the scale, ascending — the x-axis for the distribution. */
export const scoreScale = (dataset = PRIMARY) => dataset.byScore.map((r) => r.score);

/** Every threshold a viewer can choose, ascending. */
export const thresholdScale = () => {
  const out = [];
  for (let s = 25; s <= MAX_SCORE + 1e-9; s += SCORE_STEP) out.push(Number(s.toFixed(2)));
  return out;
};

/**
 * The one function the UI computes from.
 *
 * @returns {{
 *   total:number, pass:number, fail:number, passRate:number,
 *   borderline:number, baselineFail:number, deltaFail:number,
 *   bars:Array<{score:number,count:number,passing:boolean}>
 * }}
 *
 * `borderline` counts agents who pass now but would fail if the threshold
 * moved up one 6.25 step — i.e. sitting exactly ON the threshold. That is the
 * population a small policy change swings, which is why it is called out.
 *
 * `deltaFail` is signed: positive means MORE agents fail than at the 75%
 * baseline. Pass rates are returned unrounded; formatting is the UI's job.
 */
export function simulate(threshold, region = "all", dataset = PRIMARY) {
  const bars = dataset.byScore.map((row) => {
    const count = countFor(row, region);
    return { score: row.score, count, passing: row.score >= threshold };
  });

  const total = bars.reduce((n, b) => n + b.count, 0);
  const pass = bars.reduce((n, b) => n + (b.passing ? b.count : 0), 0);
  const borderline = bars.reduce(
    (n, b) => n + (b.score >= threshold && b.score < threshold + SCORE_STEP ? b.count : 0),
    0,
  );

  const baselinePass = dataset.byScore.reduce(
    (n, row) => n + (row.score >= BASELINE_THRESHOLD ? countFor(row, region) : 0),
    0,
  );

  return {
    total,
    pass,
    fail: total - pass,
    passRate: total ? (pass / total) * 100 : 0,
    borderline,
    baselineFail: total - baselinePass,
    deltaFail: (total - pass) - (total - baselinePass),
    bars,
  };
}

/** Pass rate at every threshold — the trade-off curve. */
export function tradeOffCurve(region = "all", dataset = PRIMARY) {
  return thresholdScale().map((threshold) => {
    const { passRate, pass, fail } = simulate(threshold, region, dataset);
    return { threshold, passRate, pass, fail };
  });
}

/** Median of a score distribution, honouring the even-n average. */
export function medianScore(dataset, region = "all") {
  const values = dataset.byScore.flatMap((row) =>
    Array(countFor(row, region)).fill(row.score),
  );
  if (!values.length) return null;
  const mid = values.length / 2;
  return values.length % 2
    ? values[Math.floor(mid)]
    : (values[mid - 1] + values[mid]) / 2;
}

/** Mean of a score distribution. */
export function meanScore(dataset, region = "all") {
  let sum = 0, n = 0;
  for (const row of dataset.byScore) {
    const c = countFor(row, region);
    sum += row.score * c;
    n += c;
  }
  return n ? sum / n : null;
}

/** The most common score. Reported alongside the median because for the
 *  re-assessment cohort the two differ, and the mode is the flattering one. */
export function modeScore(dataset, region = "all") {
  let best = null, bestCount = -1;
  for (const row of dataset.byScore) {
    const c = countFor(row, region);
    if (c > bestCount) { bestCount = c; best = row.score; }
  }
  return best;
}
