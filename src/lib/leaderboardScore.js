// Pure scoring helpers for LeaderboardPage.
// Separate from actionPlan.js because labels differ ("Coaching on-time" vs
// "Coaching On-Time") and calcSlab labels null/undefined as "No data".

export const parseRaw = (val) => {
  if (!val && val !== 0) return null;
  const s = String(val).trim().replace(",", ".");
  if (s.includes("%")) return parseFloat(s.replace("%", ""));
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n >= 0 && n <= 2) return n * 100;
  return n;
};

export const KPI_SLABS = {
  occupancy:    { label: "Occupancy",            weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
  coaching:     { label: "Coaching on-time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
  calibration:  { label: "Calibration",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
  observation:  { label: "Coaching observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
  rtr:          { label: "RTR score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
};

export const calcSlab = (rawPct, thresholds) => {
  if (rawPct === null || rawPct === undefined) return { slab: 0, pct: 0, label: "No data" };
  if (rawPct >= thresholds[2]) return { slab: 3, pct: 100, label: "Slab 3" };
  if (rawPct >= thresholds[1]) return { slab: 2, pct: 75,  label: "Slab 2" };
  if (rawPct >= thresholds[0]) return { slab: 1, pct: 50,  label: "Slab 1" };
  return { slab: 0, pct: 0, label: "Slab 0" };
};

export const getKpiScores = (row) =>
  Object.entries(KPI_SLABS).map(([key, def]) => {
    const rawPct = parseRaw(row[def.rawKey]);
    const slab = calcSlab(rawPct, def.thresholds);
    const score = (def.weight * slab.pct) / 100;
    return { key, label: def.label, weight: def.weight, rawPct, slab, score, thresholds: def.thresholds };
  });

export const getTotalScore = (row) =>
  getKpiScores(row).reduce((sum, k) => sum + k.score, 0);

export const fmtRaw = (val) => {
  if (val === null || val === undefined) return "—";
  return val.toFixed(1) + "%";
};

// Deterministic tie-break for ranking. The slab system buckets each KPI
// into 4 possible values, so ~30% of QAs share scores with at least one
// teammate in any given month. Without a cascade, sort order is whatever
// V8 happens to do — ranks shuffle on every page load.
//
// Cascade (most-meaningful first):
//  1. Total score desc        — the primary ranking metric
//  2. CSAT % desc             — public-facing, customer-driven signal
//  3. Total surveys desc      — more data = more confidence in the CSAT tie-break
//  4. DSAT asc                — fewer penalties = better
//  5. qa_email asc            — final alphabetic fallback (deterministic)
//
// Use this in EVERY .sort() that produces a rank — monthly, team-card,
// quarterly, time-travel re-rank. Mixing with a bare score-desc sort
// re-introduces the randomness.
export const compareForRank = (a, b) => {
  const sa = getTotalScore(a), sb = getTotalScore(b);
  if (sa !== sb) return sb - sa;
  // CSAT only counts as a tie-breaker when there are real surveys behind it
  // — a stored "0%"/stale value on a 0-survey QA must not rank them above or
  // below anyone on phantom CSAT. No surveys → treated as no data.
  const ca = Number(a?.csat_total || 0) > 0 ? parseRaw(a?.csat_pct) : null;
  const cb = Number(b?.csat_total || 0) > 0 ? parseRaw(b?.csat_pct) : null;
  const cav = ca == null ? -Infinity : ca, cbv = cb == null ? -Infinity : cb;
  if (cav !== cbv) return cbv - cav;
  const va = Number(a?.csat_total || 0), vb = Number(b?.csat_total || 0);
  if (va !== vb) return vb - va;
  const da = Number(a?.dsat || 0), db = Number(b?.dsat || 0);
  if (da !== db) return da - db;
  return String(a?.qa_email || "").localeCompare(String(b?.qa_email || ""));
};
