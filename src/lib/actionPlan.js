// Pure helpers for Action Plans / PIPs.
// Extracted from ActionPlanPage.jsx verbatim — no behavior change.

export const KPI_SLABS = {
  occupancy:   { label: "Occupancy",           weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
  coaching:    { label: "Coaching On-Time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
  calibration: { label: "Calibration",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
  observation: { label: "Coaching Observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
  rtr:         { label: "RTR Score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
};

export const parseRaw = (val) => {
  if (!val && val !== 0) return null;
  const s = String(val).trim().replace(",", ".");
  if (s.includes("%")) return parseFloat(s.replace("%", ""));
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n >= 0 && n <= 2) return n * 100;
  return n;
};

export const calcSlab = (rawPct, th) => {
  if (rawPct === null) return { slab: 0, pct: 0, label: "Slab 0" };
  if (rawPct >= th[2]) return { slab: 3, pct: 100, label: "Slab 3" };
  if (rawPct >= th[1]) return { slab: 2, pct: 75, label: "Slab 2" };
  if (rawPct >= th[0]) return { slab: 1, pct: 50, label: "Slab 1" };
  return { slab: 0, pct: 0, label: "Slab 0" };
};

export const scoreColor = (v) => v >= 55 * 0.7 ? "var(--green)" : v >= 55 * 0.4 ? "var(--amber)" : "var(--red)";
export const scoreBg = (v) => v >= 55 * 0.7 ? "var(--green-bg)" : v >= 55 * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";

export const safeJson = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
export const safeJsonArr = (str) => { try { return JSON.parse(str || "[]"); } catch { return []; } };

// Parse targets — handles old format (array) and new format ({follow_up_mode, metrics})
export const parseTargets = (str) => {
  try {
    const parsed = JSON.parse(str || "[]");
    if (Array.isArray(parsed)) return { follow_up_mode: "weekly", metrics: parsed };
    if (parsed.metrics) return parsed;
    return { follow_up_mode: "weekly", metrics: [] };
  } catch { return { follow_up_mode: "weekly", metrics: [] }; }
};
