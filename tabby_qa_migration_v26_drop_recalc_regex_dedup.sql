
-- v26: now that csat-topic-sync and agents-csat-sync delete orphaned
-- "Topic -" / "Topic " variants on every run, the recalc no longer needs
-- to defensively strip trailing dashes/whitespace from topic names. The
-- regex was a workaround for the orphan bug; with that fixed (and an
-- audit confirming 0/256 QA + 0/11140 agent rows still need it), we
-- can let topics flow through verbatim. Just keep a defensive TRIM().

CREATE OR REPLACE FUNCTION public.recalculate_qa_expertise(target_month text DEFAULT NULL::text, min_surveys_override integer DEFAULT NULL::integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m text; total_rows int := 0; per_month_rows int;
  months_processed text[] := ARRAY[]::text[]; threshold int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT has_role_or_above('admin'::user_role) THEN
    RAISE EXCEPTION 'permission denied: admin role required to recompute expertise' USING ERRCODE = '42501';
  END IF;

  threshold := COALESCE(min_surveys_override,
    (SELECT min_surveys FROM qa_expertise_config WHERE id = 1), 5);

  FOR m IN
    SELECT DISTINCT cbt.month FROM csat_by_topic cbt
    WHERE (target_month IS NULL OR cbt.month = target_month)
  LOOP
    WITH
    cleaned AS (
      SELECT LOWER(TRIM(qa_email)) AS qa_email,
             TRIM(COALESCE(topic,'')) AS topic,
             COALESCE(good,0)::int AS good, COALESCE(bad,0)::int AS bad,
             COALESCE(surveys_count,0)::int AS surveys_count, csat_score
      FROM csat_by_topic WHERE month = m
    ),
    cleaned_filtered AS (
      SELECT * FROM cleaned
      WHERE topic IS NOT NULL AND LENGTH(topic) > 0
        AND topic NOT IN ('-', '--', 'Uncategorized', 'uncategorized')
        AND qa_email LIKE '%@%'
    ),
    aggregated AS (
      SELECT qa_email, topic,
        SUM(good)::int AS good, SUM(bad)::int AS bad,
        SUM(surveys_count)::int AS surveys_count,
        CASE WHEN SUM(good)+SUM(bad) > 0
          THEN ROUND(SUM(good)::numeric / (SUM(good)+SUM(bad)) * 100, 2)
          ELSE NULL END AS csat_score
      FROM cleaned_filtered GROUP BY qa_email, topic
    ),
    qualified AS (
      SELECT * FROM aggregated WHERE surveys_count >= threshold AND csat_score IS NOT NULL
    ),
    ranked AS (
      SELECT q.*,
        ROUND(((CUME_DIST() OVER (PARTITION BY topic ORDER BY csat_score))::numeric) * 100, 1) AS percentile,
        CASE
          WHEN ((CUME_DIST() OVER (PARTITION BY topic ORDER BY csat_score))::numeric) >= 0.90 THEN 'champion'
          WHEN ((CUME_DIST() OVER (PARTITION BY topic ORDER BY csat_score))::numeric) >= 0.70 THEN 'solid'
          ELSE 'none'
        END AS strength
      FROM qualified q
    ),
    topic_totals AS (SELECT topic, SUM(surveys_count)::int AS topic_total FROM aggregated GROUP BY topic),
    grand_total AS (SELECT NULLIF(SUM(topic_total),0)::numeric AS gt FROM topic_totals),
    topic_share AS (
      SELECT t.topic, t.topic_total,
        ROUND(t.topic_total::numeric / COALESCE(g.gt, 1::numeric), 4) AS share
      FROM topic_totals t CROSS JOIN grand_total g
    ),
    product_topics(product, topic) AS (VALUES
      ('BNPL','Order Management'),('BNPL','Billing & Repayment'),('BNPL','Rejection'),
      ('Card','Card Status'),('Card','Tabby Card'),
      ('Universal','Account & Profile'),('Universal','General & Info'),('Universal','Fraud & Security')
    ),
    product_top3 AS (
      SELECT product, topic FROM (
        SELECT pt.product, pt.topic,
               ROW_NUMBER() OVER (PARTITION BY pt.product ORDER BY COALESCE(ts.topic_total,0) DESC) AS rn
        FROM product_topics pt LEFT JOIN topic_share ts USING (topic)
        WHERE COALESCE(ts.topic_total,0) > 0
      ) sub WHERE rn <= 3
    ),
    topic_tiers AS (
      SELECT ts.topic, ts.share,
        CASE
          WHEN EXISTS(SELECT 1 FROM product_top3 p WHERE p.topic = ts.topic) THEN 1
          WHEN ts.share >= 0.05 THEN 1
          WHEN ts.share >= 0.01 THEN 2
          ELSE 3
        END AS tier
      FROM topic_share ts
    ),
    scored AS (
      SELECT r.qa_email, r.topic, r.csat_score, r.surveys_count, r.percentile, r.strength,
        COALESCE(tt.tier, 3) AS tier,
        CASE r.strength WHEN 'champion' THEN 1.0::numeric WHEN 'solid' THEN 0.7::numeric ELSE 0::numeric END *
        CASE COALESCE(tt.tier,3) WHEN 1 THEN 1.0::numeric WHEN 2 THEN 0.5::numeric ELSE 0.2::numeric END AS contribution
      FROM ranked r LEFT JOIN topic_tiers tt USING (topic)
    ),
    per_qa AS (
      SELECT qa_email, ROUND(SUM(contribution), 3) AS expertise_score,
        ARRAY_AGG(topic ORDER BY contribution DESC, csat_score DESC) FILTER (WHERE strength = 'champion') AS champion_topics,
        ARRAY_AGG(topic ORDER BY contribution DESC, csat_score DESC) FILTER (WHERE strength = 'solid') AS solid_topics,
        COUNT(*) FILTER (WHERE strength IN ('champion','solid'))::int AS total_qualified,
        ROUND(COALESCE(SUM(contribution) FILTER (WHERE topic IN (SELECT topic FROM product_topics WHERE product='BNPL')),0), 3) AS bnpl_score,
        ROUND(COALESCE(SUM(contribution) FILTER (WHERE topic IN (SELECT topic FROM product_topics WHERE product='Card')),0), 3) AS card_score,
        ROUND(COALESCE(SUM(contribution) FILTER (WHERE topic IN (SELECT topic FROM product_topics WHERE product='Universal')),0), 3) AS universal_score,
        jsonb_agg(jsonb_build_object(
          'topic', topic, 'surveys_count', surveys_count, 'csat_score', csat_score,
          'percentile', percentile, 'strength', strength, 'tier', tier, 'contribution', contribution
        ) ORDER BY contribution DESC, csat_score DESC) AS topic_breakdown
      FROM scored GROUP BY qa_email
    ),
    all_qas AS (
      SELECT DISTINCT LOWER(TRIM(qa_email)) AS qa_email
      FROM csat_by_topic WHERE month = m AND qa_email IS NOT NULL AND TRIM(qa_email) <> ''
    ),
    final AS (
      SELECT a.qa_email, m AS month,
        COALESCE(p.expertise_score, 0) AS expertise_score,
        CASE
          WHEN COALESCE(p.expertise_score,0) >= 1.7 THEN 3
          WHEN COALESCE(p.expertise_score,0) >= 1.0 THEN 2
          WHEN COALESCE(p.expertise_score,0) >= 0.2 THEN 1
          ELSE 0
        END AS star_level,
        COALESCE(p.champion_topics, ARRAY[]::text[]) AS champion_topics,
        COALESCE(p.solid_topics, ARRAY[]::text[]) AS solid_topics,
        COALESCE(p.bnpl_score, 0) AS bnpl_score,
        COALESCE(p.card_score, 0) AS card_score,
        COALESCE(p.universal_score, 0) AS universal_score,
        COALESCE(p.total_qualified, 0) AS total_qualified_topics,
        COALESCE(p.topic_breakdown, '[]'::jsonb) AS topic_breakdown,
        NOW() AS calculated_at
      FROM all_qas a LEFT JOIN per_qa p USING (qa_email)
    )
    INSERT INTO qa_expertise (
      qa_email, month, expertise_score, star_level, champion_topics, solid_topics,
      bnpl_score, card_score, universal_score, total_qualified_topics, topic_breakdown, calculated_at
    )
    SELECT * FROM final
    ON CONFLICT (qa_email, month) DO UPDATE SET
      expertise_score = EXCLUDED.expertise_score, star_level = EXCLUDED.star_level,
      champion_topics = EXCLUDED.champion_topics, solid_topics = EXCLUDED.solid_topics,
      bnpl_score = EXCLUDED.bnpl_score, card_score = EXCLUDED.card_score,
      universal_score = EXCLUDED.universal_score, total_qualified_topics = EXCLUDED.total_qualified_topics,
      topic_breakdown = EXCLUDED.topic_breakdown, calculated_at = EXCLUDED.calculated_at;

    GET DIAGNOSTICS per_month_rows = ROW_COUNT;
    total_rows := total_rows + per_month_rows;
    months_processed := array_append(months_processed, m);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'rows_upserted', total_rows,
    'months_processed', months_processed, 'threshold_used', threshold);
END
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_combined_expertise(target_month text DEFAULT NULL::text, min_surveys_override integer DEFAULT NULL::integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m text; total_rows int := 0; per_month_rows int;
  months_processed text[] := ARRAY[]::text[]; threshold int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT has_role_or_above('admin'::user_role) THEN
    RAISE EXCEPTION 'permission denied: admin role required to recompute combined expertise' USING ERRCODE = '42501';
  END IF;

  threshold := COALESCE(min_surveys_override,
    (SELECT combined_min_surveys FROM qa_expertise_config WHERE id = 1), 5);

  FOR m IN
    SELECT DISTINCT month FROM (
      SELECT month FROM csat_by_topic WHERE (target_month IS NULL OR month = target_month)
      UNION
      SELECT month FROM agents_csat   WHERE (target_month IS NULL OR month = target_month)
    ) months
  LOOP
    WITH
    pool AS (
      SELECT 'qa'::text AS source, LOWER(TRIM(qa_email)) AS qa_email,
             TRIM(COALESCE(topic,'')) AS topic,
             COALESCE(good,0)::int AS good, COALESCE(bad,0)::int AS bad,
             COALESCE(surveys_count,0)::int AS surveys_count
      FROM csat_by_topic WHERE month = m
      UNION ALL
      SELECT 'agent'::text, LOWER(TRIM(qa_email)),
             TRIM(COALESCE(topic,'')),
             COALESCE(good,0)::int, COALESCE(bad,0)::int, COALESCE(surveys_count,0)::int
      FROM agents_csat WHERE month = m
    ),
    cleaned_filtered AS (
      SELECT * FROM pool
      WHERE topic IS NOT NULL AND LENGTH(topic) > 0
        AND topic NOT IN ('-', '--', 'Uncategorized', 'uncategorized')
        AND qa_email LIKE '%@%'
    ),
    aggregated AS (
      SELECT source, qa_email, topic,
        SUM(good)::int AS good, SUM(bad)::int AS bad, SUM(surveys_count)::int AS surveys_count,
        CASE WHEN SUM(good)+SUM(bad) > 0
          THEN ROUND(SUM(good)::numeric / (SUM(good)+SUM(bad)) * 100, 2)
          ELSE NULL END AS csat_score
      FROM cleaned_filtered GROUP BY source, qa_email, topic
    ),
    qualified AS (
      SELECT * FROM aggregated WHERE surveys_count >= threshold AND csat_score IS NOT NULL
    ),
    ranked AS (
      SELECT q.*,
        ROUND(((CUME_DIST() OVER (PARTITION BY topic ORDER BY csat_score))::numeric) * 100, 1) AS percentile,
        CASE
          WHEN ((CUME_DIST() OVER (PARTITION BY topic ORDER BY csat_score))::numeric) >= 0.90 THEN 'champion'
          WHEN ((CUME_DIST() OVER (PARTITION BY topic ORDER BY csat_score))::numeric) >= 0.70 THEN 'solid'
          ELSE 'none'
        END AS strength
      FROM qualified q
    ),
    topic_totals AS (SELECT topic, SUM(surveys_count)::int AS topic_total FROM aggregated GROUP BY topic),
    grand_total AS (SELECT NULLIF(SUM(topic_total),0)::numeric AS gt FROM topic_totals),
    topic_share AS (
      SELECT t.topic, t.topic_total, ROUND(t.topic_total::numeric / COALESCE(g.gt, 1::numeric), 4) AS share
      FROM topic_totals t CROSS JOIN grand_total g
    ),
    product_topics(product, topic) AS (VALUES
      ('BNPL','Order Management'),('BNPL','Billing & Repayment'),('BNPL','Rejection'),
      ('Card','Card Status'),('Card','Tabby Card'),
      ('Universal','Account & Profile'),('Universal','General & Info'),('Universal','Fraud & Security')
    ),
    product_top3 AS (
      SELECT product, topic FROM (
        SELECT pt.product, pt.topic, ROW_NUMBER() OVER (PARTITION BY pt.product ORDER BY COALESCE(ts.topic_total,0) DESC) rn
        FROM product_topics pt LEFT JOIN topic_share ts USING (topic) WHERE COALESCE(ts.topic_total,0) > 0
      ) sub WHERE rn <= 3
    ),
    topic_tiers AS (
      SELECT ts.topic, ts.share,
        CASE WHEN EXISTS(SELECT 1 FROM product_top3 p WHERE p.topic = ts.topic) THEN 1
             WHEN ts.share >= 0.05 THEN 1
             WHEN ts.share >= 0.01 THEN 2
             ELSE 3 END AS tier
      FROM topic_share ts
    ),
    scored AS (
      SELECT r.source, r.qa_email, r.topic, r.csat_score, r.surveys_count,
        r.percentile, r.strength, COALESCE(tt.tier, 3) AS tier,
        CASE r.strength WHEN 'champion' THEN 1.0::numeric WHEN 'solid' THEN 0.7::numeric ELSE 0::numeric END *
        CASE COALESCE(tt.tier,3) WHEN 1 THEN 1.0::numeric WHEN 2 THEN 0.5::numeric ELSE 0.2::numeric END AS contribution
      FROM ranked r LEFT JOIN topic_tiers tt USING (topic)
    ),
    all_scores AS (
      SELECT source, qa_email, ROUND(SUM(contribution), 3) AS expertise_score,
        COUNT(*) FILTER (WHERE strength IN ('champion','solid'))::int AS qualified_topic_count,
        SUM(surveys_count)::int AS total_surveys
      FROM scored GROUP BY source, qa_email
    ),
    ranked_pool AS (
      SELECT source, qa_email, expertise_score,
        ROW_NUMBER() OVER (
          ORDER BY expertise_score DESC, qualified_topic_count DESC, total_surveys DESC, qa_email ASC
        ) AS combined_rank,
        COUNT(*) OVER () AS combined_pool_size
      FROM all_scores
    ),
    per_qa AS (
      SELECT qa_email, ROUND(SUM(contribution), 3) AS expertise_score,
        ARRAY_AGG(topic ORDER BY contribution DESC, csat_score DESC) FILTER (WHERE strength = 'champion') AS champion_topics,
        ARRAY_AGG(topic ORDER BY contribution DESC, csat_score DESC) FILTER (WHERE strength = 'solid') AS solid_topics,
        COUNT(*) FILTER (WHERE strength IN ('champion','solid'))::int AS total_qualified,
        ROUND(COALESCE(SUM(contribution) FILTER (WHERE topic IN (SELECT topic FROM product_topics WHERE product='BNPL')),0), 3) AS bnpl_score,
        ROUND(COALESCE(SUM(contribution) FILTER (WHERE topic IN (SELECT topic FROM product_topics WHERE product='Card')),0), 3) AS card_score,
        ROUND(COALESCE(SUM(contribution) FILTER (WHERE topic IN (SELECT topic FROM product_topics WHERE product='Universal')),0), 3) AS universal_score,
        jsonb_agg(jsonb_build_object(
          'topic', topic, 'surveys_count', surveys_count, 'csat_score', csat_score,
          'percentile', percentile, 'strength', strength, 'tier', tier, 'contribution', contribution
        ) ORDER BY contribution DESC, csat_score DESC) AS topic_breakdown
      FROM scored WHERE source = 'qa' GROUP BY qa_email
    ),
    all_qas AS (
      SELECT DISTINCT LOWER(TRIM(qa_email)) AS qa_email FROM csat_by_topic
      WHERE month = m AND qa_email IS NOT NULL AND TRIM(qa_email) <> ''
    ),
    final AS (
      SELECT a.qa_email, m AS month, COALESCE(p.expertise_score, 0) AS expertise_score,
        CASE
          WHEN COALESCE(p.expertise_score,0) >= 1.7 THEN 3
          WHEN COALESCE(p.expertise_score,0) >= 1.0 THEN 2
          WHEN COALESCE(p.expertise_score,0) >= 0.2 THEN 1
          ELSE 0
        END AS star_level,
        COALESCE(p.champion_topics, ARRAY[]::text[]) AS champion_topics,
        COALESCE(p.solid_topics, ARRAY[]::text[]) AS solid_topics,
        COALESCE(p.bnpl_score, 0) AS bnpl_score,
        COALESCE(p.card_score, 0) AS card_score,
        COALESCE(p.universal_score, 0) AS universal_score,
        COALESCE(p.total_qualified, 0) AS total_qualified_topics,
        COALESCE(p.topic_breakdown, '[]'::jsonb) AS topic_breakdown,
        rp.combined_rank, rp.combined_pool_size,
        NOW() AS calculated_at
      FROM all_qas a LEFT JOIN per_qa p USING (qa_email)
      LEFT JOIN ranked_pool rp ON rp.source = 'qa' AND rp.qa_email = a.qa_email
    )
    INSERT INTO combined_expertise (
      qa_email, month, expertise_score, star_level, champion_topics, solid_topics,
      bnpl_score, card_score, universal_score, total_qualified_topics, topic_breakdown,
      combined_rank, combined_pool_size, calculated_at
    )
    SELECT * FROM final
    ON CONFLICT (qa_email, month) DO UPDATE SET
      expertise_score = EXCLUDED.expertise_score, star_level = EXCLUDED.star_level,
      champion_topics = EXCLUDED.champion_topics, solid_topics = EXCLUDED.solid_topics,
      bnpl_score = EXCLUDED.bnpl_score, card_score = EXCLUDED.card_score,
      universal_score = EXCLUDED.universal_score, total_qualified_topics = EXCLUDED.total_qualified_topics,
      topic_breakdown = EXCLUDED.topic_breakdown,
      combined_rank = EXCLUDED.combined_rank, combined_pool_size = EXCLUDED.combined_pool_size,
      calculated_at = EXCLUDED.calculated_at;

    GET DIAGNOSTICS per_month_rows = ROW_COUNT;
    total_rows := total_rows + per_month_rows;
    months_processed := array_append(months_processed, m);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'rows_upserted', total_rows,
    'months_processed', months_processed, 'threshold_used', threshold,
    'pool', 'qas + agents');
END
$function$;
