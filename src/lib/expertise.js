// Shared helpers for the QA Expertise feature.
//
// The data model is in qa_expertise (one row per qa, month):
//   star_level: 0..3
//   expertise_score: numeric
//   champion_topics[], solid_topics[]
//   bnpl_score, card_score, universal_score
//   topic_breakdown: jsonb [{ topic, surveys_count, csat_score, percentile,
//                             strength: champion|solid|none, tier: 1|2|3,
//                             contribution }]
//
// Calculation lives in the recalculate_qa_expertise(text) Postgres function.

import { sb } from "./supabase.js";

export const STAR_THRESHOLDS = [0, 0.20, 1.00, 1.70];

export const renderStars = (level) => "⭐".repeat(Math.max(0, Math.min(3, Number(level) || 0)));

export const starColor = (level) => {
  const n = Number(level) || 0;
  if (n >= 3) return "var(--tabby-purple)";
  if (n >= 2) return "var(--blue)";
  if (n >= 1) return "var(--green)";
  return "var(--tx3)";
};

export const starLabel = (level) => {
  const n = Number(level) || 0;
  if (n >= 3) return "Triple-domain expert";
  if (n >= 2) return "Cross-domain expert";
  if (n >= 1) return "Specialist";
  return "Building expertise";
};

// Maps a topic name to its product family. Falls back to null for niche topics.
export const productOf = (topic) => {
  const t = (topic || "").trim();
  if (["Order Management", "Billing & Repayment", "Rejection"].includes(t)) return "BNPL";
  if (["Card Status", "Tabby Card"].includes(t)) return "Card";
  if (["Account & Profile", "General & Info", "Fraud & Security"].includes(t)) return "Universal";
  return null;
};

export const productColor = (product) => ({
  BNPL: "var(--tabby-purple)",
  Card: "var(--blue)",
  Universal: "var(--green)",
}[product] || "var(--tx3)");

// Single-month read: hits the persisted qa_expertise table (cheap, indexed).
// For 2+ months, use fetchExpertiseForMonths — that re-pools raw CSAT
// instead of averaging the per-month scores (which would be lossy).
export const fetchExpertise = async ({ token, month, qaEmail }) => {
  const filters = [];
  if (month) filters.push(`month=eq.${encodeURIComponent(month)}`);
  if (qaEmail) filters.push(`qa_email=eq.${encodeURIComponent(qaEmail.toLowerCase())}`);
  filters.push("order=star_level.desc,expertise_score.desc");
  return await sb.query("qa_expertise", {
    select: "qa_email,month,expertise_score,star_level,champion_topics,solid_topics,bnpl_score,card_score,universal_score,total_qualified_topics,topic_breakdown,calculated_at",
    filters: filters.join("&"),
    token,
  }).catch(() => []);
};

// Multi-month rollup. Calls compute_qa_expertise_for_months(text[], int)
// which pools raw csat_by_topic across the listed months BEFORE running
// the same star/tier/score math. Returns the same shape as fetchExpertise
// (minus calculated_at — the rollup has no persisted timestamp).
export const fetchExpertiseForMonths = async ({ token, months, override }) => {
  const list = Array.isArray(months) ? months.filter(Boolean) : [];
  if (list.length === 0) return [];
  // Tag every row with the months window so the consumer can render a
  // composite label (e.g. "Mar–May 2026") without re-deriving it.
  const monthsLabel = list.slice().sort().join(",");
  const rows = await sb.rpc("compute_qa_expertise_for_months", {
    months: list,
    min_surveys_override: override ?? null,
  }, token).catch(() => []);
  return (rows || []).map(r => ({ ...r, month: monthsLabel }));
};

// Returns the list of months that have any expertise data, newest first.
export const fetchExpertiseMonths = async ({ token }) => {
  const rows = await sb.query("qa_expertise", { select: "month", filters: "order=month.desc", token }).catch(() => []);
  return [...new Set((rows || []).map(r => r.month).filter(Boolean))];
};

// Read the active min-surveys threshold (single-row config table).
export const fetchExpertiseConfig = async ({ token }) => {
  const rows = await sb.query("qa_expertise_config", {
    select: "min_surveys,updated_at,updated_by",
    filters: "id=eq.1",
    token,
  }).catch(() => []);
  return rows && rows[0] ? rows[0] : { min_surveys: 5 };
};

// Persist a new threshold and recompute every month using it. Admin-only
// at the RLS layer (the PATCH will fail with 401/403 for non-admins, which
// surfaces as an error toast in the UI).
export const saveExpertiseThreshold = async ({ token, minSurveys, actorEmail }) => {
  await sb.query("qa_expertise_config", {
    method: "PATCH",
    body: { min_surveys: minSurveys, updated_at: new Date().toISOString(), updated_by: actorEmail || null },
    filters: "id=eq.1",
    token,
  });
  // Recompute every month so the leaderboard reflects the new threshold.
  return await sb.rpc("recalculate_qa_expertise", { target_month: null }, token);
};

// Recompute without persisting a threshold change — useful after a CSAT
// re-sync or for admins to refresh stars without changing the config.
export const recomputeExpertise = async ({ token, month, override }) =>
  sb.rpc("recalculate_qa_expertise", {
    target_month: month || null,
    min_surveys_override: override ?? null,
  }, token);

// ── Combined expertise (QAs + Agents pool, admin-only view) ──
// Same shape as fetchExpertise but reads from combined_expertise.
// Stars/percentiles are computed against the merged pool with a
// hardcoded 5-survey-per-topic threshold.
export const fetchCombinedExpertise = async ({ token, month, qaEmail }) => {
  const filters = [];
  if (month) filters.push(`month=eq.${encodeURIComponent(month)}`);
  if (qaEmail) filters.push(`qa_email=eq.${encodeURIComponent(qaEmail.toLowerCase())}`);
  filters.push("order=star_level.desc,expertise_score.desc");
  return await sb.query("combined_expertise", {
    select: "qa_email,month,expertise_score,star_level,champion_topics,solid_topics,bnpl_score,card_score,universal_score,total_qualified_topics,topic_breakdown,combined_rank,combined_pool_size,calculated_at",
    filters: filters.join("&"),
    token,
  }).catch(() => []);
};

// Multi-month combined-pool rollup. Same shape as fetchCombinedExpertise
// (incl. combined_rank / combined_pool_size, re-ranked across the pooled
// window).
export const fetchCombinedExpertiseForMonths = async ({ token, months, override }) => {
  const list = Array.isArray(months) ? months.filter(Boolean) : [];
  if (list.length === 0) return [];
  const monthsLabel = list.slice().sort().join(",");
  const rows = await sb.rpc("compute_combined_expertise_for_months", {
    months: list,
    min_surveys_override: override ?? null,
  }, token).catch(() => []);
  return (rows || []).map(r => ({ ...r, month: monthsLabel }));
};

export const fetchCombinedExpertiseMonths = async ({ token }) => {
  const rows = await sb.query("combined_expertise", { select: "month", filters: "order=month.desc", token }).catch(() => []);
  return [...new Set((rows || []).map(r => r.month).filter(Boolean))];
};

// Population counts for a given month — used by the Combined tab
// header to show "N QAs + M Agents = N+M scorers". Threshold defaults
// to 5 but can be overridden so the numbers track whatever the admin
// has set on the Combined view.
// Pool population for the Combined view header. Calls
// combined_expertise_pool_population(text[], int) which applies the
// EXACT same threshold + topic-exclusion logic as the rank pool, so
// the header card "X QAs + Y Agents = N scorers" sums to the same N
// that appears in each row's "Ranked #r of N" tooltip.
//
// Previous client-side version queried csat_by_topic / agents_csat
// with surveys_count >= threshold per row. That over-counted people
// whose only qualifying rows were on excluded topics ('-', '--',
// 'Uncategorized'), causing a ~0.4% mismatch.
export const fetchCombinedPopulationCounts = async ({ token, month, months, threshold }) => {
  const list = Array.isArray(months) && months.length > 0
    ? months.filter(Boolean)
    : (month ? [month] : []);
  if (list.length === 0) return { qaCount: 0, agentCount: 0 };
  const rows = await sb.rpc("combined_expertise_pool_population", {
    months: list,
    min_surveys_override: typeof threshold === "number" ? threshold : null,
  }, token).catch(() => []);
  const r = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return r ? { qaCount: Number(r.qa_count) || 0, agentCount: Number(r.agent_count) || 0 } : { qaCount: 0, agentCount: 0 };
};

// Read the active combined threshold (single-row config table).
// Combined and QA each have their own column on qa_expertise_config so
// the two views can be tuned independently.
export const fetchCombinedThreshold = async ({ token }) => {
  const rows = await sb.query("qa_expertise_config", {
    select: "combined_min_surveys,updated_at,updated_by",
    filters: "id=eq.1",
    token,
  }).catch(() => []);
  return rows && rows[0] ? rows[0] : { combined_min_surveys: 5 };
};

// Persist a new combined threshold and trigger a full recompute. Admin
// only at the RLS / function-guard layer.
export const saveCombinedThreshold = async ({ token, minSurveys, actorEmail }) => {
  await sb.query("qa_expertise_config", {
    method: "PATCH",
    body: { combined_min_surveys: minSurveys, updated_at: new Date().toISOString(), updated_by: actorEmail || null },
    filters: "id=eq.1",
    token,
  });
  return await sb.rpc("recalculate_combined_expertise", { target_month: null, min_surveys_override: null }, token);
};

// Recompute combined expertise without changing the threshold.
export const recomputeCombinedExpertise = async ({ token, month, override }) =>
  sb.rpc("recalculate_combined_expertise", {
    target_month: month || null,
    min_surveys_override: override ?? null,
  }, token);
