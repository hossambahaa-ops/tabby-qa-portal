
-- v28: qa_badges_v previously used ROW_NUMBER() to assign rank within
-- a month. With many QAs scoring identical final_performance values
-- (e.g. May-2026 has 47 QAs tied at 0.300), ROW_NUMBER picks 3 of them
-- ARBITRARILY and stamps them with top_3 — even though no one is
-- meaningfully in the top 3.
--
-- The fix:
--   1. Use RANK() so ties share a rank.
--   2. Only award top_1 / top_3 / top_10 when the cohort at that rank
--      tier is small enough to be meaningful (≤1 / ≤3 / ≤10).
--   3. Require score > 0 so a "0 across the board" month doesn't trigger
--      anything (already in the old definition; preserved).

CREATE OR REPLACE VIEW public.qa_badges_v AS
WITH cleaned AS (
  SELECT
    mtd_scores.qa_email,
    mtd_scores.month,
    COALESCE(mtd_scores.final_performance, 0::numeric) AS score,
    COALESCE(mtd_scores.dsat, 0) AS dsat,
    COALESCE(mtd_scores.csat_total, 0) AS csat_total,
    NULLIF(regexp_replace(COALESCE(mtd_scores.csat_pct, ''::text), '[^0-9.]'::text, ''::text, 'g'::text), ''::text)::numeric AS csat_pct_n,
    COALESCE(mtd_scores.jkq_score, 0) AS jkq_score,
    COALESCE(mtd_scores.ticket_per_day, 0::numeric) AS tpd,
    mtd_scores.synced_at
  FROM mtd_scores
  WHERE mtd_scores.qa_email IS NOT NULL AND mtd_scores.month IS NOT NULL
),
ranked AS (
  SELECT
    cleaned.qa_email,
    cleaned.month,
    cleaned.score,
    cleaned.dsat,
    cleaned.csat_total,
    cleaned.csat_pct_n,
    cleaned.jkq_score,
    cleaned.tpd,
    cleaned.synced_at,
    -- RANK() shares ranks across ties: a 47-way tie gets rank=1 for all 47.
    RANK() OVER (PARTITION BY cleaned.month ORDER BY cleaned.score DESC) AS rank_in_month,
    PERCENT_RANK() OVER (PARTITION BY cleaned.month ORDER BY cleaned.tpd) AS tpd_pctile,
    LAG(cleaned.score) OVER (PARTITION BY cleaned.qa_email ORDER BY cleaned.month) AS prev_score,
    MAX(cleaned.score) OVER (PARTITION BY cleaned.qa_email) AS personal_best,
    ROW_NUMBER() OVER (PARTITION BY cleaned.qa_email ORDER BY cleaned.month) - 1 AS prior_months,
    -- Cohort sizes per month → used to suppress badges when too many
    -- QAs share the leaderboard's top tiers (i.e. the leaderboard is
    -- effectively flat and "top 3" / "top 10" would be meaningless).
    COUNT(*) FILTER (WHERE cleaned.score > 0) OVER (PARTITION BY cleaned.month) AS positive_scorers
  FROM cleaned
),
tier_counts AS (
  SELECT
    ranked.*,
    COUNT(*) FILTER (WHERE rank_in_month = 1) OVER (PARTITION BY month) AS top1_cohort,
    COUNT(*) FILTER (WHERE rank_in_month <= 3) OVER (PARTITION BY month) AS top3_cohort,
    COUNT(*) FILTER (WHERE rank_in_month <= 10) OVER (PARTITION BY month) AS top10_cohort
  FROM ranked
)
SELECT qa_email, month, 'top_1'::text AS badge_key, 'gold'::text AS tier
  FROM tier_counts
  WHERE rank_in_month = 1 AND score > 0::numeric AND top1_cohort = 1
UNION ALL
SELECT qa_email, month, 'top_3'::text AS badge_key, 'gold'::text AS tier
  FROM tier_counts
  WHERE rank_in_month >= 2 AND rank_in_month <= 3 AND score > 0::numeric AND top3_cohort <= 3
UNION ALL
SELECT qa_email, month, 'top_10'::text AS badge_key, 'silver'::text AS tier
  FROM tier_counts
  WHERE rank_in_month >= 4 AND rank_in_month <= 10 AND score > 0::numeric AND top10_cohort <= 10
UNION ALL
SELECT qa_email, month, 'on_target'::text AS badge_key, 'silver'::text AS tier
  FROM tier_counts
  WHERE score >= 0.40
UNION ALL
SELECT qa_email, month, 'csat_hero'::text AS badge_key, 'gold'::text AS tier
  FROM tier_counts
  WHERE csat_pct_n >= 95::numeric AND csat_total >= 10
UNION ALL
SELECT qa_email, month, 'zero_dsat'::text AS badge_key, 'silver'::text AS tier
  FROM tier_counts
  WHERE dsat = 0 AND csat_total >= 10
UNION ALL
SELECT qa_email, month, 'jkq_perfect'::text AS badge_key, 'silver'::text AS tier
  FROM tier_counts
  WHERE jkq_score = 100
UNION ALL
SELECT qa_email, month, 'personal_best'::text AS badge_key, 'gold'::text AS tier
  FROM tier_counts
  WHERE score = personal_best AND score > 0::numeric AND prior_months >= 3
UNION ALL
SELECT qa_email, month, 'comeback'::text AS badge_key, 'silver'::text AS tier
  FROM tier_counts
  WHERE prev_score IS NOT NULL AND (score - prev_score) >= 0.05
UNION ALL
SELECT qa_email, month, 'volume_hero'::text AS badge_key, 'silver'::text AS tier
  FROM tier_counts
  WHERE tpd_pctile >= 0.95::double precision AND tpd > 0::numeric;
