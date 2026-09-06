// Data + maths for the Nesting Pass Threshold Simulator.
//
// SOURCE OF TRUTH — BigQuery via Metabase, refreshed 2026-09-06, from
// `customer_happiness_quality_datamarts.qa_crm_qa_tasks` (database `tabby-dp`):
//
//   monitoring_source = 'nesting_assessment'    -> the Nesting assessment
//   monitoring_source = 'performance_follow_up' -> the re-assessment after coaching
//   agent_checklist_version = 'legacy_v1'       -> the ONLY data used here
//
// The V2-scored cohorts were removed on 2026-09-06. They were a different 46
// agents, so comparing them against the legacy population confounded "new
// checklist" with "different people". The page now compares one population
// against itself under two scorings — see the mapping note below.
//
// WHY THE COUNTS ARE BUCKETED BY FLOOR, NOT ROUNDED. Agents do not all have the
// same number of tickets, so their averages do not land on the 6.25 grid. Each
// agent is filed under the highest grid value at or below their true score.
// That is not cosmetic: it makes `count(bucket >= T)` exactly equal to
// `count(true score >= T)` for any threshold T on the grid, so every pass rate
// here is exact rather than approximate. Rounding to nearest would move an
// agent scoring 84.5 into the 87.5 bucket and inflate the pass rate there.
//
// To refresh, re-run the query at the bottom of this file.

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

// ── The four cohorts ─────────────────────────────────────────────────────
// ONE population, TWO scorings. Same 177 agents, same 690 tickets, same
// evaluations — the only thing that changes is which questions count. That
// makes this a PAIRED comparison: every difference is the scoring change, not
// a different group of people. The old V2-pilot comparison could not say that,
// because it was a different 46 agents.
//
// THE MAPPING (agreed with Hossam 2026-09-06). The four new attributes were
// never recorded on legacy evaluations — the score columns are all 0 and the
// text columns all NULL, because the evaluator was answering a different
// checklist. So "the same data scored on the new 4" has to be reconstructed
// from the old questions that correspond to each new attribute:
//
//   Investigation   internal_research (5)  + probing_questions (5)      = 10
//   Resolution      issue_handling (11)    + guidance (11)              = 22
//   Tone of Voice   professionalism (11)   + grammar_language (5)
//                                          + greeting (3)               = 19
//   Empathy         empathy_personalization (11) + assurance (5)        = 16
//                                                                  total  67
//
// closing_process was in Resolution in the first draft and removed on request.
// Dropped entirely (33 of 100 points, no equivalent in the new four):
// structure_readability 11, hold_time 5, response_time 5, status 3,
// internal_notes 3, human_topic_selection 3, duplicate_management 3.
//
// The kept 67 points are rebased to 100 so the two scores share an axis.
//
// This mapping is a JUDGEMENT, not a fact in the data. If it is wrong, every
// "new scoring" number on the page moves. It is stated here so it can be
// argued with rather than discovered.

export const ASSESSMENT_OLD = {
  id: "assessment_old",
  label: "Assessment · full old checklist",
  short: "Old scoring",
  note: "All ~15 attributes, as originally scored",
  period: "23 Jun – 27 Aug 2026",
  agents: 177,
  tickets: 690,
  ticketsPerAgent: 3.9,
  byScore: rows({
    ksa:   { 0: 1, 37.5: 4, 43.75: 3, 50: 1, 56.25: 2, 62.5: 3, 68.75: 5, 75: 4, 81.25: 20, 87.5: 37, 93.75: 15, 100: 1 },
    other: { 25: 1, 37.5: 1, 43.75: 1, 50: 1, 56.25: 2, 62.5: 5, 68.75: 4, 75: 6, 81.25: 23, 87.5: 27, 93.75: 7, 100: 3 },
  }),
};

export const ASSESSMENT_NEW4 = {
  id: "assessment_new4",
  label: "Assessment · new 4 attributes only",
  short: "New-4 scoring",
  note: "Same evaluations, counting only Investigation / Resolution / Tone / Empathy",
  period: "23 Jun – 27 Aug 2026",
  agents: 177,
  tickets: 690,
  ticketsPerAgent: 3.9,
  byScore: rows({
    ksa:   { 56.25: 1, 62.5: 3, 68.75: 1, 75: 10, 81.25: 22, 87.5: 28, 93.75: 23, 100: 8 },
    other: { 50: 1, 56.25: 1, 62.5: 1, 68.75: 1, 75: 4, 81.25: 12, 87.5: 30, 93.75: 23, 100: 8 },
  }),
};

// Agents who failed, were coached, and were assessed again. SELECTED for
// having failed once, so comparable only to itself across scorings.
export const REASSESSMENT_OLD = {
  id: "reassessment_old",
  label: "Re-assessment · full old checklist",
  short: "Old scoring",
  period: "25 Feb – 13 Aug 2026",
  agents: 33,
  tickets: 83,
  ticketsPerAgent: 2.5,
  byScore: rows({
    ksa:   { 93.75: 1 },
    other: { 43.75: 1, 56.25: 1, 62.5: 2, 68.75: 1, 75: 2, 81.25: 9, 87.5: 10, 93.75: 5, 100: 1 },
  }),
};

export const REASSESSMENT_NEW4 = {
  id: "reassessment_new4",
  label: "Re-assessment · new 4 attributes only",
  short: "New-4 scoring",
  period: "25 Feb – 13 Aug 2026",
  agents: 33,
  tickets: 83,
  ticketsPerAgent: 2.5,
  byScore: rows({
    ksa:   { 100: 1 },
    other: { 43.75: 1, 68.75: 1, 75: 2, 81.25: 8, 87.5: 4, 93.75: 8, 100: 8 },
  }),
};

// The page compares PRIMARY against COMPARISON. Primary is the old scoring,
// because that is the status quo the decision is measured against.
export const PRIMARY = ASSESSMENT_OLD;
export const COMPARISON = ASSESSMENT_NEW4;
export const REASSESSMENT = REASSESSMENT_OLD;
export const REASSESSMENT_COMPARISON = REASSESSMENT_NEW4;
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

/* Refresh query (BigQuery, database `tabby-dp`). Returns both scorings in one
   pass; feed the buckets straight into the four cohorts above.

WITH t AS (
  SELECT monitoring_source src, COALESCE(data_region,'unknown') region,
         LOWER(agent_email) ae,
         general_evaluation_score AS old_s,
         SAFE_DIVIDE(
           COALESCE(internal_research_score,0) + COALESCE(probing_questions_score,0)
         + COALESCE(issue_handling_score,0)   + COALESCE(guidance_score,0)
         + COALESCE(professionalism_score,0)  + COALESCE(grammar_language_score,0)
         + COALESCE(greeting_score,0)
         + COALESCE(empathy_personalization_score,0) + COALESCE(assurance_score,0)
         , 67) * 100 AS new_s
  FROM `customer_happiness_quality_datamarts.qa_crm_qa_tasks`
  WHERE monitoring_source IN ('nesting_assessment','performance_follow_up')
    AND agent_checklist_version = 'legacy_v1'
    AND general_evaluation_score IS NOT NULL
),
a AS (SELECT src, region, ae, AVG(old_s) o, AVG(new_s) n FROM t GROUP BY 1,2,3)
SELECT src,'old'  scoring, region, FLOOR(o/6.25)*6.25 bucket, COUNT(*) agents FROM a GROUP BY 1,2,3,4
UNION ALL
SELECT src,'new4', region, FLOOR(n/6.25)*6.25, COUNT(*) FROM a GROUP BY 1,2,3,4
ORDER BY 1,2,3,4;

*/
