// Data + maths for the Nesting Pass Threshold Simulator.
//
// SOURCE OF TRUTH — BigQuery via Metabase, refreshed 2026-09-06, from
// `customer_happiness_quality_datamarts.qa_crm_qa_tasks` (database `tabby-dp`):
//
//   monitoring_source = 'nesting_assessment'  -> the ONLY cohort used here
//   agent_checklist_version = 'legacy_v1'     -> the ONLY checklist used here
//
// The re-assessment cohort (performance_follow_up + nesting_re_assessment, 50
// agents) was removed on 2026-09-07. It answered a different question — does
// coaching recover a failed agent — and mixing it into a page about where to
// set the pass mark invited reading a recovery rate as a pass rate. The query
// at the bottom still returns it if it is ever wanted back.
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

// Full 0→100 grid for the histogram. It starts at 0, not 25, because the cohort
// genuinely contains an agent who averaged zero — every one of their tickets
// was voided. (Not necessarily a compliance violation: most voided tickets
// carry no compliance flag at all.) Truncating the axis would hide them.
export const SCORE_SCALE = Array.from({ length: 17 }, (_, i) => i * SCORE_STEP);

// EXACT SCORES, not pre-bucketed counts.
//
// Until 2026-09-07 this file stored counts already bucketed to the 6.25 grid,
// and simulate() counted buckets. That is only lossless when the threshold is
// ITSELF on the grid. The picker offers 80, 85 and 90, none of which are, and
// the error was large: at 85% the page reported 90 agents passing when 121
// actually did, and at 90% it reported 26 against a true 65. Adding 65 and 70
// would have inherited the same flaw — 5 agents sit between 65 and 68.75, and
// 3 between 70 and 75.
//
// So the source of truth is now one score per agent. Pass rates are counted
// from those directly and are exact at ANY threshold. Buckets are derived from
// them purely to draw the histogram, which is the only thing that needs them.
const bucketOf = (score) => Math.min(MAX_SCORE, Math.floor(score / SCORE_STEP) * SCORE_STEP);

const toBuckets = (ksa, other) => {
  const idx = new Map(SCORE_SCALE.map((sc) => [sc, { score: sc, ksa: 0, other: 0 }]));
  ksa.forEach((v) => { idx.get(bucketOf(v)).ksa += 1; });
  other.forEach((v) => { idx.get(bucketOf(v)).other += 1; });
  return SCORE_SCALE.map((sc) => idx.get(sc));
};

/** Build a cohort from exact per-agent scores. */
const cohort = (meta, ksa, other) => ({
  ...meta,
  scores: { ksa, other },
  byScore: toBuckets(ksa, other),
});

// Per-agent scores for the 177-agent assessment cohort, KSA then non-KSA.
// Same agents in both arrays, same order — index i is one person under the two
// scorings, which is what makes this a paired comparison.
const RAW = {
  ksaOld:   [0, 37.75, 39.75, 40.75, 40.75, 44.75, 48, 48.75, 53.5, 59.6667, 62.25, 63, 65.25, 67.25, 69.5, 69.75, 71, 71, 72.25, 78, 78, 78.5, 78.75, 81.3333, 81.75, 83.25, 83.6667, 84, 84.5, 85, 85.25, 85.5, 85.75, 86, 86.25, 86.5, 86.5, 86.75, 86.75, 87, 87, 87.25, 87.25, 87.5, 88, 88.25, 88.25, 88.3333, 88.5, 88.5, 88.5, 88.75, 89, 89, 89.25, 89.5, 90, 90, 90, 90, 90.5, 90.75, 90.75, 91, 91.25, 91.5, 92, 92.25, 92.25, 92.5, 92.5, 92.6667, 92.75, 93, 93.25, 93.25, 93.5, 93.5, 93.5, 93.6667, 94, 94, 94, 94.25, 94.75, 95.25, 95.5, 95.5, 95.75, 96, 96, 96.3333, 96.75, 97.25, 97.5, 100],
  ksaNew:   [0, 12.5, 25, 25, 37.5, 43.75, 50, 43.75, 31.25, 58.3333, 50, 43.75, 68.75, 62.5, 62.5, 62.5, 75, 75, 31.25, 43.75, 50, 56.25, 56.25, 58.3333, 62.5, 75, 66.6667, 50, 68.75, 56.25, 68.75, 81.25, 75, 68.75, 56.25, 75, 68.75, 75, 68.75, 68.75, 81.25, 68.75, 81.25, 75, 81.25, 75, 93.75, 66.6667, 81.25, 81.25, 93.75, 81.25, 81.25, 75, 81.25, 87.5, 75, 75, 75, 50, 75, 81.25, 93.75, 81.25, 87.5, 81.25, 81.25, 93.75, 81.25, 87.5, 93.75, 83.3333, 81.25, 93.75, 87.5, 100, 87.5, 93.75, 87.5, 83.3333, 93.75, 93.75, 87.5, 87.5, 87.5, 93.75, 93.75, 100, 93.75, 100, 100, 83.3333, 93.75, 100, 100, 100],
  otherOld: [29.2, 41, 47.5, 56, 59.3333, 62.25, 62.75, 65.25, 66.625, 67.5, 68.3, 70.25, 71, 74.2, 74.25, 76, 76.8333, 77.75, 78, 78, 80, 81.5, 82, 82.25, 83.5, 84.3333, 84.75, 85, 85.25, 85.5, 85.5, 85.75, 85.75, 86, 86, 86, 86.25, 86.5, 86.5, 86.75, 86.75, 87, 87.25, 87.25, 87.5, 88, 88.25, 88.25, 88.5, 88.5, 88.75, 89, 89, 89.25, 89.5, 89.5, 90, 90, 90.5, 90.5, 90.75, 91.3333, 91.5, 92, 92, 92.5, 92.5, 92.75, 92.75, 92.75, 93.5, 94, 94, 94.5, 94.75, 95.5, 96.25, 97.5, 100, 100, 100],
  otherNew: [20, 43.75, 50, 50, 66.6667, 37.5, 50, 50, 65.625, 56.25, 65, 62.5, 68.75, 70, 56.25, 71.875, 70.8333, 78.125, 68.75, 50, 86.1111, 56.25, 75, 75, 75, 75, 75, 81.25, 75, 62.5, 75, 81.25, 68.75, 83.3333, 75, 75, 75, 75, 75, 81.25, 87.5, 81.25, 75, 75, 81.25, 87.5, 84.375, 75, 68.75, 75, 87.5, 81.25, 100, 87.5, 87.5, 75, 75, 87.5, 75, 81.25, 87.5, 83.3333, 93.75, 87.5, 100, 87.5, 87.5, 87.5, 87.5, 93.75, 93.75, 93.75, 100, 87.5, 87.5, 87.5, 87.5, 100, 100, 100, 100],
};

// ── The four cohorts ─────────────────────────────────────────────────────
// ONE population, TWO scorings. Same 177 agents, same 690 tickets, same
// evaluations — the only thing that changes is which questions count. That
// makes this a PAIRED comparison: every difference is the scoring change, not
// a different group of people. The old V2-pilot comparison could not say that,
// because it was a different 46 agents.
//
// THE MAPPING. The four new attributes were never recorded on legacy
// evaluations — the score columns are all 0 and the text columns all NULL,
// because the evaluator was answering a different checklist. So the "new 4"
// score is reconstructed from the old questions that correspond to each:
//
//   Investigation   internal_research + probing_questions          all at max?
//   Resolution      issue_handling + guidance                      all at max?
//   Tone of Voice   professionalism + grammar_language + greeting   all at max?
//   Empathy         empathy_personalization + assurance             all at max?
//
// Each answers yes -> 25, no -> 0.
//
// ALL-OR-NOTHING PER ATTRIBUTE (2026-09-07, Hossam's decision). Each attribute
// is worth 25 and is scored PASS/FAIL: full marks on every question inside it
// scores 25, any deduction anywhere in it scores 0. There is no partial credit.
// This is how the V2 checklist treats a mistake, so it is the closest the
// legacy data can get to V2's mechanics.
//
// It matters more than the threshold does. The same four attributes scored
// proportionally instead pass 81.4% at 75%; scored all-or-nothing they pass
// 66.7%. A 15-point swing from a scoring rule, against a few points from any
// realistic threshold move.
//
// Because a per-ticket score can only be 0/25/50/75/100, the bar is really a
// count of clean attributes: 75% means "three of four perfect", 87.5%+ means
// "all four". Nothing sits between them.
//
// VOIDED TICKETS (2026-09-07). This is the correction that made the model
// honest. 46 legacy tickets score 0 on the old checklist while still carrying
// ~56 of 67 attribute points: 5 flagged as a misconduct violation, 6 with the
// compliance field blank, and 41 with NO compliance flag at all and no column
// anywhere explaining why. The reconstruction read those points and scored
// them ~84%.
//
// So: if the old checklist voided a ticket, this voids it too. Mirroring the
// outcome, without needing to know the reason. That single change moved the
// assessment at 75% from 94.9% to 81.4% and brought three independent numbers
// into agreement:
//
//   old checklist        80.8%
//   new-4 (this model)   81.4%
//   NATIVE V2, 46 agents 80.4%   <- real V2 scoring, a different cohort
//
// Before it, the model claimed the new checklist was 14 points softer. It is
// not; the gap was an artefact of not voiding what the old checklist voided.
//
// Note the two checklists use DIFFERENT compliance fields — legacy records
// `avoidance_and_misconduct` (agent_customer_data is entirely NULL), v2 records
// `agent_customer_data` (avoidance_and_misconduct is entirely NULL). Neither is
// read directly here; `general_evaluation_score = 0` covers both.

export const ASSESSMENT_OLD = cohort({
  id: "assessment_old",
  label: "Assessment · full old checklist",
  short: "Old scoring",
  note: "All ~15 attributes, as originally scored",
  period: "23 Jun – 27 Aug 2026",
  agents: 177,
  tickets: 690,
  ticketsPerAgent: 3.9,
}, RAW.ksaOld, RAW.otherOld);

export const ASSESSMENT_NEW4 = cohort({
  id: "assessment_new4",
  label: "Assessment · new 4, any mistake costs the attribute",
  short: "New-4 scoring",
  note: "Same evaluations · each attribute all-or-nothing, 25 each · voided tickets stay voided",
  period: "23 Jun – 27 Aug 2026",
  agents: 177,
  tickets: 690,
  ticketsPerAgent: 3.9,
}, RAW.ksaNew, RAW.otherNew);

// The page compares PRIMARY against COMPARISON. Primary is the old scoring,
// because that is the status quo the decision is measured against.
export const PRIMARY = ASSESSMENT_OLD;
export const COMPARISON = ASSESSMENT_NEW4;
export const PRIMARY_SCALE = SCORE_SCALE;


// ── Long history: the OLD checklist only ─────────────────────────────────
// Pass rate at 75% for every month nesting has been assessed, back to the
// start of the record. Two systems: the AppSheet era (Jul 2024 – Mar 2026,
// `customer_happiness_datamarts.qa_manual_assessment`, monitoring_category
// 'Nesting') and the CRM era (Jun 2026 onward, qa_crm_qa_tasks).
//
// THIS CANNOT CARRY THE NEW-4 COMPARISON. The AppSheet table has `final_score`
// and a few yes/no fields — no attribute-level scores at all. There is nothing
// to split, so the second column simply does not exist for these months. It is
// kept as its own series answering a different question ("has nesting quality
// moved?") rather than being drawn as a third line next to the comparison,
// which would invite reading a gap that was never computed.
//
// Apr–May 2026 is a real gap: AppSheet stops in March, CRM nesting starts in
// June. It is left as a hole rather than interpolated.
export const HISTORY = {
  metric: "Pass rate at 75% on the checklist in force at the time",
  gapNote: "Apr–May 2026 missing: AppSheet ended March, the CRM began in June",
  rows: [
    { ym: "2024-07", src: "AppSheet", agents:  49, mean: 72.30, pass75: 63.3 },
    { ym: "2024-08", src: "AppSheet", agents:  61, mean: 85.26, pass75: 82.0 },
    { ym: "2024-09", src: "AppSheet", agents: 114, mean: 74.97, pass75: 61.4 },
    { ym: "2024-10", src: "AppSheet", agents: 182, mean: 77.38, pass75: 65.4 },
    { ym: "2024-11", src: "AppSheet", agents: 200, mean: 75.69, pass75: 62.0 },
    { ym: "2024-12", src: "AppSheet", agents: 180, mean: 81.20, pass75: 72.8 },
    { ym: "2025-01", src: "AppSheet", agents: 251, mean: 79.95, pass75: 75.3 },
    { ym: "2025-02", src: "AppSheet", agents: 222, mean: 82.51, pass75: 76.1 },
    { ym: "2025-03", src: "AppSheet", agents: 259, mean: 83.54, pass75: 80.7 },
    { ym: "2025-04", src: "AppSheet", agents:  89, mean: 79.87, pass75: 71.9 },
    { ym: "2025-05", src: "AppSheet", agents: 152, mean: 88.07, pass75: 93.4 },
    { ym: "2025-06", src: "AppSheet", agents: 177, mean: 87.05, pass75: 88.7 },
    { ym: "2025-07", src: "AppSheet", agents: 262, mean: 84.03, pass75: 80.5 },
    { ym: "2025-08", src: "AppSheet", agents: 328, mean: 80.09, pass75: 73.2 },
    { ym: "2025-09", src: "AppSheet", agents: 395, mean: 79.69, pass75: 71.4 },
    { ym: "2025-10", src: "AppSheet", agents: 470, mean: 80.24, pass75: 72.3 },
    { ym: "2025-11", src: "AppSheet", agents: 366, mean: 79.86, pass75: 72.7 },
    { ym: "2025-12", src: "AppSheet", agents: 354, mean: 81.60, pass75: 76.3 },
    { ym: "2026-01", src: "AppSheet", agents: 461, mean: 82.34, pass75: 77.2 },
    { ym: "2026-02", src: "AppSheet", agents: 262, mean: 81.65, pass75: 75.2 },
    { ym: "2026-03", src: "AppSheet", agents: 153, mean: 82.77, pass75: 77.8 },
    { ym: "2026-06", src: "CRM",      agents:  54, mean: 81.69, pass75: 79.6 },
    { ym: "2026-07", src: "CRM",      agents:  75, mean: 82.46, pass75: 77.3 },
    { ym: "2026-08", src: "CRM",      agents:  64, mean: 82.01, pass75: 84.4 },
  ],
};

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
  const pick = (ds) =>
    region === "ksa" ? ds.scores.ksa
    : region === "other" ? ds.scores.other
    : ds.scores.ksa.concat(ds.scores.other);

  const scores = pick(dataset);
  const total = scores.length;
  // Counted from exact per-agent scores, so this is right at ANY threshold,
  // not only at multiples of SCORE_STEP.
  const pass = scores.reduce((n, v) => n + (v >= threshold ? 1 : 0), 0);
  const borderline = scores.reduce(
    (n, v) => n + (v >= threshold && v < threshold + SCORE_STEP ? 1 : 0), 0);
  const baselinePass = scores.reduce((n, v) => n + (v >= BASELINE_THRESHOLD ? 1 : 0), 0);

  // Bars stay bucketed — the histogram needs discrete columns. `passing` is
  // decided on the bucket's own value, which is what the chart draws.
  const bars = dataset.byScore.map((row) => {
    const count = region === "ksa" ? row.ksa : region === "other" ? row.other : row.ksa + row.other;
    return { score: row.score, count, passing: row.score >= threshold };
  });

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
  WHERE monitoring_source = 'nesting_assessment'
    AND agent_checklist_version = 'legacy_v1'
    AND general_evaluation_score IS NOT NULL
),
a AS (SELECT src, region, ae, AVG(old_s) o, AVG(new_s) n FROM t GROUP BY 1,2,3)
SELECT src,'old'  scoring, region, FLOOR(o/6.25)*6.25 bucket, COUNT(*) agents FROM a GROUP BY 1,2,3,4
UNION ALL
SELECT src,'new4', region, FLOOR(n/6.25)*6.25, COUNT(*) FROM a GROUP BY 1,2,3,4
ORDER BY 1,2,3,4;

*/
