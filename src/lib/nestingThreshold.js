// Data + maths for the Nesting Pass Threshold Simulator.
//
// SOURCE OF TRUTH — refreshed from BigQuery via Metabase on 2026-09-06, from
// `customer_happiness_quality_datamarts.qa_crm_qa_tasks` on database `tabby-dp`:
//
// At that refresh the two LEGACY cohorts were byte-identical to the 2026-09-02
// pull (177 and 33 agents, every bucket unchanged) — they are closed. Both V2
// cohorts had grown: the assessment 45 -> 46 and the re-assessment 28 -> 32,
// which is expected while V2 is still rolling out. Re-run the query at the
// bottom to refresh again; the V2 numbers will keep moving.
//
//   monitoring_source = 'nesting_assessment'   -> the Nesting assessment
//   monitoring_source = 'performance_follow_up'-> the re-assessment after coaching
//   agent_checklist_version                    -> 'legacy_v1' or 'v2'
//
// An agent's score is AVG(general_evaluation_score) over their tickets.
// `general_evaluation_score` is the per-ticket total out of 100 and only ever
// takes the values 0/25/50/75/100 — four scored attributes worth 25 each
// (Investigation, Resolution, Tone of Voice, Empathy & Personalization). The
// two compliance attributes (Customer Data, Avoidance & Misconduct) have no
// score column at all; a violation zeroes the whole ticket, which is what the
// 0-scoring tickets are.
//
// WHY THE COUNTS ARE BUCKETED BY FLOOR, NOT ROUNDED. Agents do not all have
// exactly 4 tickets, so their averages do not land on the 6.25 grid. Each
// agent is filed under the highest grid value at or below their true score.
// That choice is not cosmetic: it makes `count(bucket >= T)` exactly equal to
// `count(true score >= T)` for any threshold T on the grid, so every pass rate
// on this page is exact rather than approximate. Rounding to nearest would
// have moved an agent scoring 84.5 into the 87.5 bucket and inflated the pass
// rate at 87.5. Verified: all four cohorts reproduce the pass rates BigQuery
// reported directly.
//
// To refresh, re-run the query in the module comment at the bottom.

export const SCORE_STEP = 6.25;
export const MAX_SCORE = 100;

// The threshold currently proposed. Every "change versus baseline" figure is
// measured against this.
export const BASELINE_THRESHOLD = 75;

// data_region in the warehouse is KSA / non-KSA. It is deliberately NOT
// labelled "Egypt": non-KSA is whatever is not KSA, and asserting otherwise
// would put a country name on a bucket the data does not actually claim.
export const REGIONS = [
  { key: "all", label: "All" },
  { key: "ksa", label: "KSA" },
  { key: "other", label: "Non-KSA" },
];

// Full 0→100 grid. It starts at 0, not 25, because the legacy assessment
// cohort genuinely contains an agent who averaged a zero — a compliance
// violation on every ticket. Truncating the axis would hide them.
export const SCORE_SCALE = Array.from({ length: 17 }, (_, i) => i * SCORE_STEP);

const rows = (pairs) =>
  SCORE_SCALE.map((score) => ({
    score,
    ksa: pairs.ksa?.[score] ?? 0,
    other: pairs.other?.[score] ?? 0,
  }));

// ── The Nesting assessment ───────────────────────────────────────────────
// What an agent scores the first time they are assessed.

export const ASSESSMENT_V2 = {
  id: "assessment_v2",
  label: "Assessment · V2 checklist",
  short: "V2 assessment",
  note: "Scored natively on the new checklist",
  period: "26 Aug – 4 Sep 2026",
  agents: 46,
  tickets: 182,
  ticketsPerAgent: 3.96,
  // Was KSA-only at the 2026-09-02 pull. The 2026-09-06 refresh brought the
  // first non-KSA agent into the V2 assessment, so the old "KSA only" claim is
  // retired rather than repeated.
  regionNote: "Overwhelmingly KSA — 45 of 46; V2 is only starting to reach non-KSA nesting",
  byScore: rows({
    ksa:   { 37.5: 1, 50: 1, 62.5: 4, 68.75: 3, 75: 4, 81.25: 7, 87.5: 11, 93.75: 9, 100: 5 },
    other: { 100: 1 },
  }),
};

export const ASSESSMENT_V1 = {
  id: "assessment_v1",
  label: "Assessment · legacy checklist",
  short: "Legacy assessment",
  note: "Scored on the checklist V2 replaces",
  period: "23 Jun – 27 Aug 2026",
  agents: 177,
  tickets: 690,
  ticketsPerAgent: 3.9,
  byScore: rows({
    ksa:   { 0: 1, 37.5: 4, 43.75: 3, 50: 1, 56.25: 2, 62.5: 3, 68.75: 5, 75: 4, 81.25: 20, 87.5: 37, 93.75: 15, 100: 1 },
    other: { 25: 1, 37.5: 1, 43.75: 1, 50: 1, 56.25: 2, 62.5: 5, 68.75: 4, 75: 6, 81.25: 23, 87.5: 27, 93.75: 7, 100: 3 },
  }),
};

// ── The re-assessment ────────────────────────────────────────────────────
// Agents who failed, were coached, and were assessed again. This cohort is
// SELECTED for having failed once, so it is not comparable to the assessment
// cohorts as a population — only to itself across versions.

export const REASSESSMENT_V2 = {
  id: "reassessment_v2",
  label: "Re-assessment · V2 checklist",
  short: "V2 re-assessment",
  period: "24 Aug – 6 Sep 2026",
  agents: 32,
  tickets: 142,
  ticketsPerAgent: 4.44,
  byScore: rows({
    ksa:   { 75: 4, 81.25: 4, 87.5: 2, 93.75: 1, 100: 1 },
    other: { 31.25: 1, 50: 1, 62.5: 1, 68.75: 1, 75: 5, 81.25: 3, 87.5: 4, 100: 4 },
  }),
};

export const REASSESSMENT_V1 = {
  id: "reassessment_v1",
  label: "Re-assessment · legacy checklist",
  short: "Legacy re-assessment",
  period: "25 Feb – 13 Aug 2026",
  agents: 33,
  tickets: 83,
  ticketsPerAgent: 2.5,
  byScore: rows({
    ksa:   { 93.75: 1 },
    other: { 43.75: 1, 56.25: 1, 62.5: 2, 68.75: 1, 75: 2, 81.25: 9, 87.5: 10, 93.75: 5, 100: 1 },
  }),
};

// The cohort the page defaults to: V2 is the checklist actually being adopted.
export const PRIMARY = ASSESSMENT_V2;
export const COMPARISON = ASSESSMENT_V1;
export const PRIMARY_SCALE = SCORE_SCALE;

// ── Attribute failure rates ──────────────────────────────────────────────
// Share of V2 nesting-assessment TICKETS on which each attribute was failed.
// Compliance attributes have no score column — they zero the ticket instead —
// so their "fail rate" is the share of tickets they zeroed.
export const ATTRIBUTE_FAILS = {
  ticketBase: 180,
  rows: [
    { attribute: "Resolution", rate: 28.3, scored: true },
    { attribute: "Investigation", rate: 15.9, scored: true },
    { attribute: "Compliance", rate: 5.9, scored: false },
    { attribute: "Tone of Voice", rate: 5.7, scored: true },
    { attribute: "Empathy & Personalization", rate: 4.0, scored: true },
  ],
  // Carried over from the original brief rather than recomputed from the
  // warehouse, because the per-attribute columns need a separate pass. Ordering
  // and relative magnitude are the load-bearing claim, not the decimals.
  provisional: true,
};

// ── Helpers ──────────────────────────────────────────────────────────────

const countFor = (row, region) =>
  region === "ksa" ? row.ksa : region === "other" ? row.other : row.ksa + row.other;

export const scoreScale = () => SCORE_SCALE;

export const thresholdScale = () => {
  const out = [];
  for (let s = 25; s <= MAX_SCORE + 1e-9; s += SCORE_STEP) out.push(Number(s.toFixed(2)));
  return out;
};

/**
 * The one function the UI computes from.
 *
 * `borderline` counts agents who pass now but would fail if the threshold
 * moved up one 6.25 step. `deltaFail` is signed: positive means MORE agents
 * fail than at the 75% baseline. Pass rates are returned unrounded.
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

/**
 * Put a dataset on the shared scale and express each bucket as a SHARE of its
 * own cohort, so cohorts of very different size (45 vs 177 agents) can be read
 * against one axis without the smaller one looking like a flat line.
 */
export function alignedShare(dataset, region = "all", scale = SCORE_SCALE) {
  const byScore = new Map(dataset.byScore.map((r) => [r.score, r]));
  const total = dataset.byScore.reduce((n, r) => n + countFor(r, region), 0);
  return scale.map((score) => {
    const row = byScore.get(score);
    const count = row ? countFor(row, region) : 0;
    return { score, count, share: total ? (count / total) * 100 : 0 };
  });
}

/** Median, honouring the even-n average. Bucketed, so this is the bucket
 *  median — the true median sits somewhere inside the same 6.25 band. */
export function medianScore(dataset, region = "all") {
  const values = dataset.byScore.flatMap((row) => Array(countFor(row, region)).fill(row.score));
  if (!values.length) return null;
  const mid = values.length / 2;
  return values.length % 2 ? values[Math.floor(mid)] : (values[mid - 1] + values[mid]) / 2;
}

export function meanScore(dataset, region = "all") {
  let sum = 0, n = 0;
  for (const row of dataset.byScore) {
    const c = countFor(row, region);
    sum += row.score * c;
    n += c;
  }
  return n ? sum / n : null;
}

export function modeScore(dataset, region = "all") {
  let best = null, bestCount = -1;
  for (const row of dataset.byScore) {
    const c = countFor(row, region);
    if (c > bestCount) { bestCount = c; best = row.score; }
  }
  return best;
}

/* Refresh query (BigQuery, database `tabby-dp`):

WITH a AS (
  SELECT agent_checklist_version AS v, monitoring_source AS src,
         COALESCE(data_region,'unknown') AS region, agent_email,
         AVG(general_evaluation_score) AS score
  FROM qa_crm_qa_tasks
  WHERE monitoring_source IN ('nesting_assessment','performance_follow_up')
    AND general_evaluation_score IS NOT NULL
  GROUP BY 1,2,3,4
)
SELECT v, src, region, FLOOR(score/6.25)*6.25 AS bucket, COUNT(*) AS agents
FROM a GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;

*/
