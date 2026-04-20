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
