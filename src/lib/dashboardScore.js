// Pure scoring helpers for DashboardPage.
// Extracted verbatim — distinct from actionPlan.js because calcSlab
// here returns the pct directly (not an object) and KPI_SLABS has no label.

export const parseRawD = (val) => {
  if (!val && val !== 0) return null;
  const s = String(val).trim().replace(",", ".");
  if (s.includes("%")) return parseFloat(s.replace("%", ""));
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n >= 0 && n <= 2) return n * 100;
  return n;
};

export const KPI_SLABS_D = {
  occupancy:   { weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
  coaching:    { weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
  calibration: { weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
  observation: { weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
  rtr:         { weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
};

export const calcSlabD = (rawPct, th) => {
  if (rawPct === null) return 0;
  if (rawPct >= th[2]) return 100;
  if (rawPct >= th[1]) return 75;
  if (rawPct >= th[0]) return 50;
  return 0;
};

export const getScore = (row) =>
  Object.values(KPI_SLABS_D).reduce(
    (sum, def) => sum + (def.weight * calcSlabD(parseRawD(row[def.rawKey]), def.thresholds)) / 100,
    0,
  );

export const MAX_SCORE = 55;

export const scoreColor = (v) =>
  v >= MAX_SCORE * 0.7 ? "var(--green)" : v >= MAX_SCORE * 0.4 ? "var(--amber)" : "var(--red)";

export const scoreBg = (v) =>
  v >= MAX_SCORE * 0.7 ? "var(--green-bg)" : v >= MAX_SCORE * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";
