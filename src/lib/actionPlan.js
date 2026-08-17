// Pure helpers for Action Plans / PIPs.
// Extracted from ActionPlanPage.jsx verbatim — no behavior change.

export const KPI_SLABS = {
  occupancy:   { label: "Occupancy",           weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
  coaching:    { label: "Coaching On-Time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
  calibration: { label: "Phase Score",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
  observation: { label: "Coaching Observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
  rtr:         { label: "RTR Score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
  // Selectable plan targets that don't feed the weighted detection score
  // (weight 0). CSAT is a percentage, higher-is-better, so it fits the
  // slab/target engine as-is.
  csat:             { label: "CSAT",             weight: 0, thresholds: [70, 80, 90], rawKey: "csat_pct",          unit: "%" },
  abt:              { label: "ABT",              weight: 0, thresholds: null,         rawKey: "abt",               unit: "min", lowerBetter: true, isRaw: true },
  survey_count:     { label: "Survey Count",     weight: 0, thresholds: null,         rawKey: "csat_total",        unit: "",    isRaw: true },
  login_count:      { label: "Handled Tickets",   weight: 0, thresholds: null,         rawKey: "tickets_touched",   unit: "",    isRaw: true },
  total_monitoring: { label: "Total Monitoring", weight: 0, thresholds: null,         rawKey: "total_monitoring",  unit: "",    isRaw: true },
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

// Parse an MTD cell for a plan metric. Count/raw metrics (isRaw) are taken
// at face value; percentage metrics keep parseRaw's %/fraction handling
// (which would wrongly ×100 a small count — e.g. 2 surveys → 200).
export const parseRawMetric = (val, isRaw) => {
  if (!isRaw) return parseRaw(val);
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val).replace(",", ".").replace(/[%\s]/g, ""));
  return isNaN(n) ? null : n;
};

// Whether an actual hits the target, honouring lower-is-better metrics
// (e.g. ABT minutes — the target is the max acceptable value). Missing
// actual/target counts as met, matching the original behaviour.
export const targetMet = (actual, target, lowerBetter) => {
  if (actual === null || actual === undefined) return true;
  if (target === null || target === undefined || target === "") return true;
  return lowerBetter ? Number(actual) <= Number(target) : Number(actual) >= Number(target);
};

// Display a metric value with its unit: "%" → "97.2%", "min" → "45.9 min",
// "" (a count) → "204".
export const fmtMetricVal = (v, unit) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (unit === "%") return n.toFixed(1) + "%";
  if (unit === "min") return n.toFixed(1) + " min";
  return Math.round(n).toLocaleString();
};

export const calcSlab = (rawPct, th) => {
  if (rawPct === null) return { slab: 0, pct: 0, label: "Slab 0" };
  if (rawPct >= th[2]) return { slab: 3, pct: 100, label: "Slab 3" };
  if (rawPct >= th[1]) return { slab: 2, pct: 75, label: "Slab 2" };
  if (rawPct >= th[0]) return { slab: 1, pct: 50, label: "Slab 1" };
  return { slab: 0, pct: 0, label: "Slab 0" };
};

export const scoreColor = (v) => v >= 55 * 0.7 ? "var(--green)" : v >= 55 * 0.4 ? "var(--amber)" : "var(--red)";

// Build the candidate list for the create-plan picker. Always includes
// the front-line QA roster. For supervisors and above, also includes the
// in-scope leads (and, for admins, supervisors too) — they aren't in
// qa_roster (they're management, with no MTD row) so they were impossible
// to put on a PIP/AP. A supervisor gets leads in their own domain; an
// admin gets all leads/supervisors. Management rows are shaped like
// roster rows (with a roleLabel) so the picker treats them uniformly;
// their plan targets are entered manually, which the form already
// supports (the save path falls back to the creator for tl_email).
export function buildPlanCandidates({
  roster = [], profiles = [], isSupervisor = false, isAdmin = false,
  myEmail = "", myDomain = "", nameFromEmail = (e) => e,
} = {}) {
  if (!isSupervisor) return roster;
  const allowRoles = isAdmin ? ["qa_lead", "qa_supervisor"] : ["qa_lead"];
  const me = (myEmail || "").toLowerCase();
  const rosterEmails = new Set(roster.map(r => (r.email || "").toLowerCase()).filter(Boolean));
  const mgmt = (profiles || []).filter(p => {
    const em = (p.email || "").toLowerCase();
    if (!em || em === me || rosterEmails.has(em)) return false;
    if (!allowRoles.includes(p.role)) return false;
    if (isAdmin) return true;
    const pd = p.operational_domain || p.domain;
    return pd ? pd === myDomain : em.endsWith("@" + myDomain);
  }).map(p => ({
    email: p.email,
    display_name: p.display_name || nameFromEmail(p.email),
    manager_email: null,
    queue: null,
    country: null,
    roleLabel: p.role === "qa_supervisor" ? "Supervisor" : "Lead",
  }));
  return [...roster, ...mgmt];
}
export const scoreBg = (v) => v >= 55 * 0.7 ? "var(--green-bg)" : v >= 55 * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";

// `targets` and `target_data` are jsonb columns, but the client writes
// JSON.stringify(...) into them — which Postgres stores as a jsonb STRING
// scalar, so it reads back as a string and JSON.parse works. A writer that
// stores a real jsonb OBJECT (the auto-draft RPC does) reads back as an
// object, and JSON.parse(object) stringifies it to "[object Object]" and
// throws — silently yielding empty metrics, which blanked the targets table
// and the "raised for" summary on every auto-raised draft.
// Both encodings are now valid on the wire, so decode defensively.
const decode = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v === "object") return v;           // already-parsed jsonb
  try { return JSON.parse(v); } catch { return fallback; }
};

export const safeJson = (v) => { const d = decode(v, {}); return (d && typeof d === "object" && !Array.isArray(d)) ? d : {}; };
export const safeJsonArr = (v) => { const d = decode(v, []); return Array.isArray(d) ? d : []; };

// Parse targets — handles old format (array) and new format ({follow_up_mode, metrics})
export const parseTargets = (v) => {
  const parsed = decode(v, []);
  if (Array.isArray(parsed)) return { follow_up_mode: "weekly", metrics: parsed };
  if (parsed?.metrics) return parsed;
  return { follow_up_mode: "weekly", metrics: [] };
};

// Per-row KPI scores using the slab engine.
export const getKpiScores = (row) => {
  // Only the weighted KPIs feed the detection score/display. The extra
  // selectable plan metrics (CSAT, ABT, counts…) are weight 0 — they're
  // pickable as plan targets but must not pollute the DAM scoring.
  return Object.entries(KPI_SLABS).filter(([, def]) => (def.weight ?? 0) > 0).map(([key, def]) => {
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
    const isRaw = def.isRaw ?? false;
    const rawPct = row ? parseRawMetric(row[def.rawKey], isRaw) : null;
    const slab = (def.thresholds && rawPct !== null) ? calcSlab(rawPct, def.thresholds) : { slab: 0, label: "—" };
    return {
      kpi_key: key,
      label: def.label,
      raw_key: def.rawKey,
      current_value: rawPct,
      current_slab: def.thresholds ? slab.label : "—",
      target_value: "",
      weekly_targets: Array(duration).fill(""),
      weight: def.weight,
      thresholds: def.thresholds,
      unit: def.unit ?? "%",
      lower_better: def.lowerBetter ?? false,
      is_raw: isRaw,
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
