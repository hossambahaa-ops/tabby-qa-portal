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
