// QA recognition badges — derived from qa_badges_v in the database.
// Each entry maps the badge_key emitted by the view to its UI metadata.
// Tier ranks gold > silver > bronze for sorting and visual emphasis.

export const BADGE_CATALOG = {
  top_1: {
    label: "#1 of the month",
    emoji: "🥇",
    tier: "gold",
    color: "#F59E0B",
    desc: "Finished first on the leaderboard.",
  },
  top_3: {
    label: "Top 3",
    emoji: "🏆",
    tier: "gold",
    color: "#D97706",
    desc: "Finished in the top three on the leaderboard.",
  },
  top_10: {
    label: "Top 10",
    emoji: "🎯",
    tier: "silver",
    color: "#3B82F6",
    desc: "Finished in the top ten on the leaderboard.",
  },
  on_target: {
    label: "On target",
    emoji: "✅",
    tier: "silver",
    color: "#10B981",
    desc: "Hit the monthly performance target.",
  },
  csat_hero: {
    label: "CSAT hero",
    emoji: "💚",
    tier: "gold",
    color: "#22C55E",
    desc: "≥ 95% CSAT with at least 10 surveys.",
  },
  zero_dsat: {
    label: "Zero DSAT",
    emoji: "🛡️",
    tier: "silver",
    color: "#06B6D4",
    desc: "Zero DSAT responses with 10+ surveys.",
  },
  jkq_perfect: {
    label: "JKQ perfect",
    emoji: "🎓",
    tier: "silver",
    color: "#8B5CF6",
    desc: "Scored 100% on the JKQ assessment.",
  },
  personal_best: {
    label: "Personal best",
    emoji: "📈",
    tier: "gold",
    color: "#EC4899",
    desc: "Your highest performance score so far.",
  },
  comeback: {
    label: "Comeback",
    emoji: "🚀",
    tier: "silver",
    color: "#F97316",
    desc: "Improved by 5+ points vs the previous month.",
  },
  volume_hero: {
    label: "Volume hero",
    emoji: "🔥",
    tier: "silver",
    color: "#EA580C",
    desc: "Top 5% on tickets/day this month.",
  },
};

// Helper — sort earned badges so gold tiles show first, then silver,
// then by most recent month within tier.
export const sortBadges = (list) => {
  const tierRank = { gold: 0, silver: 1, bronze: 2 };
  return [...list].sort((a, b) => {
    const ta = tierRank[BADGE_CATALOG[a.badge_key]?.tier ?? "silver"] ?? 9;
    const tb = tierRank[BADGE_CATALOG[b.badge_key]?.tier ?? "silver"] ?? 9;
    if (ta !== tb) return ta - tb;
    return (b.month || "").localeCompare(a.month || "");
  });
};

// Per-QA cache key for "what badges has this person already seen at least
// once?" — used by the Badges component to fire a celebratory toast only
// the first time a freshly-earned badge appears in their view.
export const seenKey = (email) => `qa_badges_seen_${(email || "").toLowerCase()}`;
