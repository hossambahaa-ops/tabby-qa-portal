// ── QA Scorecard (new 10-KPI weighted model) ──────────────────────────
// Parallel to the legacy mtd_scores.final_performance — this computes the
// weighted composite from the 2026 KPI model without touching the stored
// score. Pure functions; the component just renders the result.
//
// Data mapping (all from the QA's mtd_scores row unless noted):
//   Sample Size Completion — ticket_per_day ÷ 12 evals/day (95% target)
//   Coaching Completion    — coaching_completion_pct
//   Own CSAT               — csat_quartile (1 = top quartile of the month)
//   Own ABT                — abt, target band 5–15 min
//   Productivity on Queue  — queue LOGIN HOURS — NOT in Pulse yet (awaiting)
//   RTR Score              — avg_rtr_score
//   Calibration Score      — phase_1_score (raw rate; calibration_score is points)
//   Coaching Observation   — avg_observation_score_pct (needs observed_coaching_count>0)
//   CSAT of LOB/Channel    — csat_population aggregated by the QA's channel
//   CSAT Improvement MoM   — that channel's CSAT this month vs last

// Parse "85%", "95.2%", 0.85, or 85 → a 0–100 number.
export const pct = (v) => {
  if (v == null || v === "") return null;
  const s = String(v);
  if (s.includes("%")) { const n = parseFloat(s.replace("%", "").trim()); return isFinite(n) ? n : null; }
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return n <= 2 ? n * 100 : n; // fraction (0.85) → 85
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Each KPI: key, label, weight (%), target label, and a scorer that returns
// { score:0-100, value, valueLabel, sub? } or { na:true } when the QA has no
// data for it (na KPIs drop out of the weighted average, weight redistributed).
export const SCORECARD_KPIS = [
  {
    key: "sample_size", label: "Sample Size Completion", weight: 15, target: "95%", targetScore: 95,
    scorer: ({ row }) => {
      const tpd = row?.ticket_per_day == null ? null : Number(row.ticket_per_day);
      if (tpd == null || !isFinite(tpd)) return { na: true };
      const completion = clamp((tpd / 12) * 100, 0, 100);
      return { score: completion, value: completion, valueLabel: completion.toFixed(0) + "%", sub: `${tpd.toFixed(1)} of 12 evals/day` };
    },
  },
  {
    key: "coaching_completion", label: "Coaching Completion", weight: 15, target: "90%", targetScore: 90,
    scorer: ({ row }) => { const p = pct(row?.coaching_completion_pct); if (p == null) return { na: true }; return { score: clamp(p, 0, 100), value: p, valueLabel: p.toFixed(0) + "%" }; },
  },
  {
    key: "own_csat", label: "Own CSAT", weight: 15, target: "Top quartile",
    scorer: ({ row }) => {
      const q = row?.csat_quartile;
      if (q == null) return { na: true };
      const map = { 1: 100, 2: 75, 3: 50, 4: 25 };
      const c = pct(row?.csat_pct);
      return { score: map[q] ?? null, value: q, valueLabel: `Q${q}`, sub: c != null ? c.toFixed(1) + "% CSAT" : null };
    },
  },
  {
    key: "own_abt", label: "Own ABT", weight: 10, target: "5–15 min",
    scorer: ({ row }) => {
      const a = row?.abt == null ? null : Number(row.abt);
      if (a == null || !isFinite(a) || a <= 0) return { na: true };
      let score;
      if (a >= 5 && a <= 15) score = 100;
      else if (a < 5) score = clamp(100 - (5 - a) * 10, 0, 100);
      else score = clamp(100 - (a - 15) * 8, 0, 100);
      return { score, value: a, valueLabel: a.toFixed(2) + " min" };
    },
  },
  {
    key: "productivity", label: "Productivity on Queue", weight: 10, target: "8h/week", awaiting: true,
    scorer: () => ({ na: true, awaiting: true }),
  },
  {
    key: "rtr", label: "RTR Score", weight: 10, target: "85%", targetScore: 85,
    scorer: ({ row }) => { const p = pct(row?.avg_rtr_score); if (p == null) return { na: true }; return { score: clamp(p, 0, 100), value: p, valueLabel: p.toFixed(0) + "%" }; },
  },
  {
    key: "calibration", label: "Calibration Score", weight: 10, target: "85%", targetScore: 85,
    scorer: ({ row }) => { const p = pct(row?.phase_1_score); if (p == null) return { na: true }; return { score: clamp(p, 0, 100), value: p, valueLabel: p.toFixed(1) + "%" }; },
  },
  {
    key: "coaching_observation", label: "Coaching Observation", weight: 5, target: "85%", targetScore: 85,
    scorer: ({ row }) => {
      if (!(Number(row?.observed_coaching_count || 0) > 0)) return { na: true };
      const p = pct(row?.avg_observation_score_pct);
      if (p == null) return { na: true };
      return { score: clamp(p, 0, 100), value: p, valueLabel: p.toFixed(0) + "%" };
    },
  },
  {
    key: "lob_csat", label: "CSAT of LOB/Channel", weight: 5, target: "—",
    scorer: ({ lobCsat }) => { if (lobCsat?.pct == null) return { na: true }; return { score: clamp(lobCsat.pct, 0, 100), value: lobCsat.pct, valueLabel: lobCsat.pct.toFixed(1) + "%", sub: lobCsat.lob }; },
  },
  {
    key: "lob_csat_mom", label: "CSAT Improvement (MoM)", weight: 5, target: "↑ vs last month",
    scorer: ({ lobCsat, lobCsatPrev }) => {
      if (lobCsat?.pct == null || lobCsatPrev?.pct == null) return { na: true };
      const delta = lobCsat.pct - lobCsatPrev.pct;
      // Neutral at 0 (50), +10pp → 100, −10pp → 0. Tunable.
      return { score: clamp(50 + delta * 5, 0, 100), value: delta, valueLabel: (delta >= 0 ? "+" : "") + delta.toFixed(1) + "pp" };
    },
  },
];

// ctx = { row, lobCsat, lobCsatPrev }
export function computeScorecard(ctx) {
  const kpis = SCORECARD_KPIS.map((def) => {
    const r = def.scorer(ctx) || {};
    return { key: def.key, label: def.label, weight: def.weight, target: def.target, targetScore: def.targetScore, awaiting: !!def.awaiting, ...r };
  });
  const live = kpis.filter((k) => !k.na && typeof k.score === "number");
  const liveWeight = live.reduce((s, k) => s + k.weight, 0);
  const composite = liveWeight > 0 ? live.reduce((s, k) => s + k.score * k.weight, 0) / liveWeight : null;
  return { kpis, composite, liveWeight, totalWeight: SCORECARD_KPIS.reduce((s, k) => s + k.weight, 0) };
}

// Normalize a LOB/channel label so the QA's queue can match a csat_population.lob.
export const normLob = (s) => String(s || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
