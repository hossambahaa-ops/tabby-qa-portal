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
//   Productivity on Queue  — login_hours (monthly queue login hours; 32h/mo target)
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

// BINARY (pass/fail) scoring: each KPI is worth its full weight (score 100) only
// if it MEETS its target, else 0. Below-target AND missing both = 0. Each scorer
// returns { score:0|100, value, valueLabel, sub? } or { na:true } (no value).
// `noTarget:true` KPIs have no target defined → excluded from the composite until
// one is set (still displayed). `awaiting:true` → no data source yet (excluded).
export const SCORECARD_KPIS = [
  {
    key: "sample_size", label: "Sample Size Completion", weight: 15, target: "95%", targetScore: 95,
    scorer: ({ row, sessionDeductEvals }) => {
      const tpd = row?.ticket_per_day == null ? null : Number(row.ticket_per_day);
      if (tpd == null || !isFinite(tpd)) return { na: true };
      // Quality-session credit: delivering >4h of sessions/week lowers the
      // expected sample size (1 eval per 15 min over the allowance, summed over
      // the month by quality_session_deductions_v). Applied as a smaller target.
      const wds = Number(row?.working_days) || 0;
      const ded = Math.max(0, Number(sessionDeductEvals) || 0);
      if (wds > 0 && ded > 0) {
        const actual = tpd * wds;                        // ~ evals done this month
        const adjTarget = Math.max(1, 12 * wds - ded);   // sessions lower the bar
        const completion = clamp((actual / adjTarget) * 100, 0, 100);
        return { score: completion >= 95 ? 100 : 0, value: completion, valueLabel: completion.toFixed(0) + "%", sub: `${tpd.toFixed(1)}/day · target −${ded} for sessions` };
      }
      const completion = clamp((tpd / 12) * 100, 0, 100);
      return { score: completion >= 95 ? 100 : 0, value: completion, valueLabel: completion.toFixed(0) + "%", sub: `${tpd.toFixed(1)} of 12 evals/day` };
    },
  },
  {
    key: "coaching_completion", label: "Coaching Completion", weight: 15, target: "90%", targetScore: 90,
    scorer: ({ row }) => { const p = pct(row?.coaching_completion_pct); if (p == null) return { na: true }; return { score: p >= 90 ? 100 : 0, value: p, valueLabel: p.toFixed(0) + "%" }; },
  },
  {
    key: "own_csat", label: "Own CSAT", weight: 15, target: "Top quartile",
    scorer: ({ row }) => {
      const q = row?.csat_quartile;
      if (q == null) return { na: true };
      const c = pct(row?.csat_pct);
      return { score: q === 1 ? 100 : 0, value: q, valueLabel: `Q${q}`, sub: c != null ? c.toFixed(1) + "% CSAT" : null };
    },
  },
  {
    key: "own_abt", label: "Own ABT", weight: 10, target: "5–15 min",
    scorer: ({ row }) => {
      const a = row?.abt == null ? null : Number(row.abt);
      if (a == null || !isFinite(a) || a <= 0) return { na: true };
      return { score: a >= 5 && a <= 15 ? 100 : 0, value: a, valueLabel: a.toFixed(2) + " min" };
    },
  },
  {
    key: "productivity", label: "Productivity on Queue", weight: 10, target: "32h/month", targetScore: 32,
    scorer: ({ row }) => {
      const h = row?.login_hours == null ? null : Number(row.login_hours);
      if (h == null || !isFinite(h)) return { na: true };
      const TARGET = 32;
      const unlocked = h >= TARGET;
      const gap = Math.max(0, TARGET - h);        // hours still needed to complete the KPI
      return {
        score: unlocked ? 100 : 0,
        value: h,
        valueLabel: h.toFixed(1) + "h",
        unlocked,
        gap,
        targetHours: TARGET,
        progress: Math.max(0, Math.min(100, (h / TARGET) * 100)), // % toward unlock
        sub: unlocked ? "unlocked 🏆" : `login ${gap.toFixed(1)}h more to unlock`,
      };
    },
  },
  {
    key: "rtr", label: "RTR Score", weight: 10, target: "85%", targetScore: 85,
    scorer: ({ row }) => { const p = pct(row?.avg_rtr_score); if (p == null) return { na: true }; return { score: p >= 85 ? 100 : 0, value: p, valueLabel: p.toFixed(0) + "%" }; },
  },
  {
    key: "calibration", label: "Calibration Score", weight: 10, target: "85%", targetScore: 85,
    scorer: ({ row }) => {
      // Use Phase 2 (the recovery/retake) when it exists, else Phase 1 — the
      // effective calibration outcome, matching the Performance card.
      const p2 = pct(row?.phase_2_score);
      const p1 = pct(row?.phase_1_score);
      const p = p2 != null ? p2 : p1;
      if (p == null) return { na: true };
      return { score: p >= 85 ? 100 : 0, value: p, valueLabel: p.toFixed(1) + "%", sub: p2 != null ? "Phase 2" : "Phase 1" };
    },
  },
  {
    key: "coaching_observation", label: "Coaching Observation", weight: 5, target: "85%", targetScore: 85,
    scorer: ({ row }) => {
      if (!(Number(row?.observed_coaching_count || 0) > 0)) return { na: true };
      const p = pct(row?.avg_observation_score_pct);
      if (p == null) return { na: true };
      return { score: p >= 85 ? 100 : 0, value: p, valueLabel: p.toFixed(0) + "%" };
    },
  },
  {
    // LOB = the QA's line of business (Front Line, Partners, Disputes…), the
    // only CSAT breakdown Pulse has. NOT the contact "channel" (Chat/Email/Phone).
    // No target defined yet → excluded from the composite (displayed for info).
    key: "lob_csat", label: "CSAT of LOB", weight: 5, target: "— (no target)", noTarget: true,
    scorer: ({ lobCsat }) => { if (lobCsat?.pct == null) return { na: true, noTarget: true }; return { na: true, noTarget: true, value: lobCsat.pct, valueLabel: lobCsat.pct.toFixed(1) + "%", sub: lobCsat.lob }; },
  },
  {
    key: "lob_csat_mom", label: "CSAT of LOB (MoM)", weight: 5, target: "— (no target)", noTarget: true,
    scorer: ({ lobCsat, lobCsatPrev }) => {
      if (lobCsat?.pct == null || lobCsatPrev?.pct == null) return { na: true, noTarget: true };
      const delta = lobCsat.pct - lobCsatPrev.pct;
      return { na: true, noTarget: true, value: delta, valueLabel: (delta >= 0 ? "+" : "") + delta.toFixed(1) + "pp" };
    },
  },
];

// ctx = { row, lobCsat, lobCsatPrev }
export function computeScorecard(ctx) {
  const kpis = SCORECARD_KPIS.map((def) => {
    const r = def.scorer(ctx) || {};
    return { key: def.key, label: def.label, weight: def.weight, target: def.target, targetScore: def.targetScore, awaiting: !!def.awaiting, noTarget: !!def.noTarget, ...r };
  });
  // Binary composite: each in-model KPI contributes its full weight if it met
  // its target (score 100), else 0. Denominator (modelWeight) = every KPI EXCEPT
  // ones with no data SOURCE yet (awaiting — none now that Productivity/login_hours
  // is live) and ones with no TARGET defined (noTarget — LOB CSAT / MoM); those
  // are left out until sourced/targeted so they don't drag everyone. So today
  // modelWeight = 90 (100 − LOB 5 − MoM 5). Below-target or missing (na) count as
  // 0 within the denominator (missing data costs the score).
  const inModel = kpis.filter((k) => !k.awaiting && !k.noTarget);
  const modelWeight = inModel.reduce((s, k) => s + k.weight, 0);
  const scored = inModel.filter((k) => !k.na && typeof k.score === "number");
  const scoredWeight = scored.reduce((s, k) => s + k.weight, 0);
  const composite = modelWeight > 0 ? scored.reduce((s, k) => s + k.score * k.weight, 0) / modelWeight : null;
  const awaitingWeight = kpis.filter((k) => k.awaiting).reduce((s, k) => s + k.weight, 0);
  const noTargetWeight = kpis.filter((k) => k.noTarget).reduce((s, k) => s + k.weight, 0);
  return { kpis, composite, modelWeight, scoredWeight, zeroWeight: modelWeight - scoredWeight, awaitingWeight, noTargetWeight };
}

// Normalize a LOB/channel label so the QA's queue can match a csat_population.lob.
export const normLob = (s) => String(s || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

// Some QA team LOBs don't share a name with the customer CSAT channel in
// csat_population. Map them here. (Front Line QAs cover the "general" channel;
// the rest are naming/plural differences to the same channel.)
const LOB_CHANNEL_ALIAS = {
  front_line: "general",
  ccu: "customer_care_unit",
  dispute: "disputes",
  escalation: "escalations",
};
export const lobChannelKey = (lob) => { const k = normLob(lob); return LOB_CHANNEL_ALIAS[k] || k; };

// Shared score→colour used by the Scorecard card and the leaderboard view.
export const scoreColor = (s) => (s == null ? "var(--tx3)" : s >= 85 ? "var(--green)" : s >= 70 ? "var(--amber)" : "var(--red)");

// Compact per-KPI column labels for the leaderboard table (keyed by KPI key).
export const KPI_SHORT = {
  sample_size: "Sample", coaching_completion: "Coaching", own_csat: "CSAT", own_abt: "ABT",
  productivity: "Prod", rtr: "RTR", calibration: "Calib", coaching_observation: "Obs",
  lob_csat: "LOB", lob_csat_mom: "LOB MoM",
};
