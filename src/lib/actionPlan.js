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

// Per-row KPI scores using the slab engine.
export const getKpiScores = (row) => {
  return Object.entries(KPI_SLABS).map(([key, def]) => {
    const rawPct = parseRaw(row[def.rawKey]);
    const slab = calcSlab(rawPct, def.thresholds);
    const score = (def.weight * slab.pct) / 100;
    return { key, label: def.label, weight: def.weight, rawPct, slab, score, thresholds: def.thresholds, rawKey: def.rawKey };
  });
};

export const getTotalScore = (row) => getKpiScores(row).reduce((s, k) => s + k.score, 0);

// Build default target rows for a QA based on their latest MTD snapshot.
export const generateTargets = ({ qaEmail, kpiKeys, mtd, duration, sortMonthsDesc, nameFromEmail }) => {
  const months = sortMonthsDesc([...new Set(mtd.map(r => r.month))]);
  const latestMonth = months[0];
  const row = mtd.find(r => r.month === latestMonth && r.qa_email?.toLowerCase() === qaEmail.toLowerCase());

  return (kpiKeys || []).map(key => {
    const def = KPI_SLABS[key];
    if (!def) return null;
    const rawPct = row ? parseRaw(row[def.rawKey]) : null;
    const slab = rawPct !== null ? calcSlab(rawPct, def.thresholds) : { slab: 0, label: "No data" };
    return {
      kpi_key: key,
      label: def.label,
      raw_key: def.rawKey,
      current_value: rawPct,
      current_slab: slab.label,
      target_value: "",
      weekly_targets: Array(duration).fill(""),
      weight: def.weight,
      thresholds: def.thresholds,
    };
  }).filter(Boolean);
};

// DAM-driven auto-detection. Pure — returns a sorted array of flagged QAs.
export const computeDetections = ({ mtdRows, existingPlans, dismissalRows, damFlagRows, damStepRows, sortMonthsDesc, nameFromEmail }) => {
  const activePlanEmails = existingPlans
    .filter(p => p.status === "active" || p.status === "pending_review")
    .map(p => p.qa_email?.toLowerCase());
  const dismissedEmails = new Set((dismissalRows || []).map(d => d.qa_email?.toLowerCase()));
  const months = sortMonthsDesc([...new Set(mtdRows.map(r => r.month))]);
  const latestMonth = months[0] || "—";
  const activeFlags = (damFlagRows || []).filter(f => f.status === "pending" || f.status === "acknowledged");
  const flagged = [];

  activeFlags.forEach(flag => {
    const email = flag.profiles?.email || flag.qa_email?.toLowerCase();
    if (!email) return;
    if (activePlanEmails.includes(email)) return;
    if (dismissedEmails.has(email)) return;
    if (flagged.find(f => f.email?.toLowerCase() === email)) return;

    const step = (damStepRows || []).find(s => s.rule_id === flag.rule_id && s.occurrence === flag.occurrence_number);
    if (!step || !step.includes_pip) return;

    const row = mtdRows.find(r => r.qa_email?.toLowerCase() === email && r.month === latestMonth);
    const totalScore = row ? getTotalScore(row) : 0;
    const kpis = row ? getKpiScores(row) : [];
    const ruleName = flag.dam_rules?.name || "Unknown";
    const behaviorType = flag.dam_rules?.behavior_type?.replace(/_/g, " ") || "";
    const pipAction = step.pip_action || step.action || "Action Plan required";

    flagged.push({
      email: flag.profiles?.email || flag.qa_email || email,
      name: nameFromEmail(flag.profiles?.email || email),
      reason: `DAM: ${ruleName} (${behaviorType}) — Occurrence #${flag.occurrence_number}: ${pipAction}`,
      severity: flag.occurrence_number >= 3 ? "critical" : flag.occurrence_number >= 2 ? "warning" : "notice",
      totalScore, kpis, latestMonth,
      tl: row?.qa_tl,
      damFlagId: flag.id,
      planType: step.includes_pip ? "pip" : "ap",
      pipActionType: step.pip_action || "new",
    });
  });

  const sevOrder = { critical: 0, warning: 1, notice: 2 };
  flagged.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) || a.totalScore - b.totalScore);
  return flagged;
};
