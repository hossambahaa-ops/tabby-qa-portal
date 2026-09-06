-- CONSOLIDATED MTD QUERY  →  mtd_scores
--
-- Source: Metabase card 4481 "TEST MTDDD", recovered 2026-09-06, WITH TWO PATCHES.
-- Committed here because the patched copy previously lived in /tmp, was wiped, and
-- the raw card silently reverted both fixes.
--
-- PATCH 1 — email map. Esraa and Alaa each hold TWO live identities and switched
--   domain around 2026-08-24 (esraa.ibrahim.786@tabby.sa + esraa.ibrahim@tabby.ai;
--   alaa.elhady.786@tabby.sa + alaa.elhady@tabby.ai). Both local parts now map onto
--   the roster identity (.786@tabby.sa). Unpatched, they were dropped entirely
--   despite 152 and 16 COMPLETED evaluations in August.
--
-- PATCH 2 — removed `business_role = 'QA'` from both calibration branches. It does
--   NOT recover the external KSA QAs (verified); it only suppresses valid rows.
--   Recovers Aug Phase 1 from 28 → 35 QAs.
--
-- TASK FILTER (unchanged, and confirmed correct by Hossam 2026-09-06):
--   stage = 'completed' OR (stage = 'archived' AND date_completed_at IS NOT NULL).
--   This is why mariam.gad (4,034 archived, 0 completed) and george.amir correctly
--   produce no row — absence of completed work, not a join bug.
--
-- VALIDATED against Pulse's trusted Jul-2026: 44 QAs both sides, SBS 2,402 vs 2,386
--   (-0.7%), evaluations 7,103 vs 7,225 (+1.7%), 32 of 42 QAs exact on SBS/Non-SBS/
--   DSAT. For August the pull is a strict superset (29 higher, 10 equal, 0 lower) —
--   Pulse's August was a truncated partial push.
--
-- Companion queries: mtd_login_hours_by_qa.sql, mtd_abt_tickets_by_qa.sql,
--   mtd_csat_by_qa.sql. Not produced here: WDs, Occupancy, Tickets/Day, Q Sessions,
--   ABT SBS/Validation — those are Pulse-owned pipelines.
--
-- KNOWN OPEN: Phase 2 is empty for every QA (no re-calibration rows exist at all);
--   suhail.idriss returns a row but is not on qa_roster.

WITH
-- ============================================================
-- STEP 0: CANONICAL EMAIL MAP
-- ============================================================
qa_email_map AS (
  SELECT * FROM UNNEST([
    STRUCT('mohammed.almasoudi'    AS local_part, 'mohammed.almasoudi@tabby.sa'    AS canonical_email),
    STRUCT('hossam.bahaa'          AS local_part, 'hossam.bahaa@tabby.sa'          AS canonical_email),
    STRUCT('ahmed.mostafa'         AS local_part, 'ahmed.mostafa@tabby.sa'         AS canonical_email),
    STRUCT('george.amir'           AS local_part, 'george.amir@tabby.ai'           AS canonical_email),
    STRUCT('muhammad.ramadan'      AS local_part, 'muhammad.ramadan@tabby.ai'      AS canonical_email),
    STRUCT('tarek.mostafa'         AS local_part, 'tarek.mostafa@tabby.sa'         AS canonical_email),
    STRUCT('suhail.idriss'         AS local_part, 'suhail.idriss@tabby.sa'         AS canonical_email),
    STRUCT('arwa.alzahrani'        AS local_part, 'arwa.alzahrani.2@tabby.sa'      AS canonical_email),
    STRUCT('saud.alasiri'          AS local_part, 'saud.alasiri@tabby.sa'          AS canonical_email),
    STRUCT('mohamed.mamdouh'       AS local_part, 'mohamed.mamdouh@tabby.sa'       AS canonical_email),
    STRUCT('rahma.eskander'        AS local_part, 'rahma.eskander@tabby.ai'        AS canonical_email),
    STRUCT('abdallah.ashraf'       AS local_part, 'abdallah.ashraf@tabby.ai'       AS canonical_email),
    STRUCT('nourhan.hussien'       AS local_part, 'nourhan.hussien@tabby.ai'       AS canonical_email),
    STRUCT('omar.mohammad'         AS local_part, 'omar.mohammad@tabby.ai'         AS canonical_email),
    STRUCT('omar.fetouh'           AS local_part, 'omar.fetouh@tabby.ai'           AS canonical_email),
    STRUCT('rana.salah'            AS local_part, 'rana.salah@tabby.ai'            AS canonical_email),
    STRUCT('peter.mikhail'         AS local_part, 'peter.mikhail@tabby.ai'         AS canonical_email),
    STRUCT('mohamed.salah'         AS local_part, 'mohamed.salah@tabby.ai'         AS canonical_email),
    STRUCT('ahmed.soliman.6'       AS local_part, 'ahmed.soliman.6@tabby.sa'       AS canonical_email),
    STRUCT('reem.mansour'          AS local_part, 'reem.mansour@tabby.ai'          AS canonical_email),
    STRUCT('sohaila.adel'          AS local_part, 'sohaila.adel@tabby.ai'          AS canonical_email),
    STRUCT('hagar.dawood'          AS local_part, 'hagar.dawood@tabby.ai'          AS canonical_email),
    STRUCT('abdulrahman.hesham'    AS local_part, 'abdulrahman.hesham@tabby.ai'    AS canonical_email),
    STRUCT('sameh.ahmed'           AS local_part, 'sameh.ahmed@tabby.sa'           AS canonical_email),
    STRUCT('mariam.gad'            AS local_part, 'mariam.gad@tabby.ai'            AS canonical_email),
    STRUCT('ahmed.sami'            AS local_part, 'ahmed.sami@tabby.ai'            AS canonical_email),
    STRUCT('zainab.hasan'          AS local_part, 'zainab.hasan@tabby.ai'          AS canonical_email),
    STRUCT('omar.abdelsamee'       AS local_part, 'omar.abdelsamee@tabby.ai'       AS canonical_email),
    STRUCT('youssef.housh'         AS local_part, 'youssef.housh@tabby.ai'         AS canonical_email),
    STRUCT('mohammed.mohsen'       AS local_part, 'mohammed.mohsen@tabby.ai'       AS canonical_email),
    STRUCT('hesham.mostafa.39'     AS local_part, 'hesham.mostafa.39@tabby.ai'     AS canonical_email),
    STRUCT('sara.abdeltwab'        AS local_part, 'sara.abdeltwab@tabby.ai'        AS canonical_email),
    STRUCT('kyrillos.malak'        AS local_part, 'kyrillos.malak@tabby.ai'        AS canonical_email),
    STRUCT('mohammed.faran'        AS local_part, 'mohammed.faran@tabby.ai'        AS canonical_email),
    STRUCT('ahmed.elwany'          AS local_part, 'ahmed.elwany@tabby.sa'          AS canonical_email),
    STRUCT('bushra.kaabi'          AS local_part, 'bushra.kaabi@tabby.sa'          AS canonical_email),
    STRUCT('mohammed.aljandal.5'   AS local_part, 'mohammed.aljandal.5@tabby.sa'   AS canonical_email),
    STRUCT('lama.alanezi.95'       AS local_part, 'lama.alanezi.95@tabby.sa'       AS canonical_email),
    STRUCT('hussam.khaled'         AS local_part, 'hussam.khaled@tabby.ai'         AS canonical_email),
    STRUCT('marwa.sobhy'           AS local_part, 'marwa.sobhy@tabby.ai'           AS canonical_email),
    STRUCT('abdelrahman.osama'     AS local_part, 'abdelrahman.osama@tabby.ai'     AS canonical_email),
    STRUCT('ahmed.hegazy'          AS local_part, 'ahmed.hegazy@tabby.ai'          AS canonical_email),
    STRUCT('nardeen.wafaey'        AS local_part, 'nardeen.wafaey@tabby.ai'        AS canonical_email),
    STRUCT('pola.emad'             AS local_part, 'pola.emad@tabby.ai'             AS canonical_email),
    STRUCT('asmaa.mohamed'         AS local_part, 'asmaa.mohamed@tabby.sa'         AS canonical_email),
    STRUCT('mostafa.sami'          AS local_part, 'mostafa.sami@tabby.sa'          AS canonical_email),
    STRUCT('rahma.mohamed'         AS local_part, 'rahma.mohamed@tabby.ai'         AS canonical_email),
    STRUCT('amr.salah'             AS local_part, 'amr.salah@tabby.ai'             AS canonical_email),
    STRUCT('mahmoud.hesham'        AS local_part, 'mahmoud.hesham@tabby.sa'        AS canonical_email),
    STRUCT('esraa.ibrahim'         AS local_part, 'esraa.ibrahim.786@tabby.sa'     AS canonical_email),
    STRUCT('esraa.ibrahim.786'     AS local_part, 'esraa.ibrahim.786@tabby.sa'     AS canonical_email),
    STRUCT('alaa.elhady'           AS local_part, 'alaa.elhady.786@tabby.sa'       AS canonical_email),
    STRUCT('alaa.elhady.786'       AS local_part, 'alaa.elhady.786@tabby.sa'       AS canonical_email)
  ])
),

-- ============================================================
-- STEP 1: RAW EVALUATION DATA
-- ============================================================
eval_data AS (
  SELECT
    DATE_TRUNC(DATE(e.created_at), MONTH) AS month_date,
    COALESCE(m.canonical_email, LOWER(e.qa_agent_email)) AS qa_email,
    LOWER(e.agent_email) AS agent_email,
    e.ticket_call_id     AS ticket_id,
    e.created_at         AS eval_created_at,
    e.final_score,
    e.good_soft_skills,
    e.understood_customer_issue,
    e.resolved_effectively_in_timely_manner,
    e.late_never,
    e.monitoring_category,
    e.evaluation_type,
    CASE WHEN e.monitoring_category = 'DSAT analysis'  THEN 1 ELSE 0 END                          AS dsat,
    CASE WHEN e.monitoring_category != 'DSAT analysis'
              AND e.evaluation_type IN ('Side-by-side', 'Side-by-side | In-person')
              AND LOWER(TRIM(e.agent_email)) NOT LIKE 'brixi_agent@tabby%' THEN 1 ELSE 0 END AS sbs,
    CASE WHEN e.monitoring_category != 'DSAT analysis'
              AND (e.evaluation_type NOT IN ('Side-by-side', 'Side-by-side | In-person')
                   OR LOWER(TRIM(e.agent_email)) LIKE 'brixi_agent@tabby%') THEN 1 ELSE 0 END AS non_sbs,
    'AppSheet' AS source
  FROM customer_happiness_datamarts.qa_manual_assessment e
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(e.qa_agent_email), '@')[OFFSET(0)] = m.local_part
  WHERE DATE(e.created_at) >= '2026-01-01'

  UNION ALL

  SELECT
    DATE_TRUNC(DATE(e.created_at), MONTH) AS month_date,
    COALESCE(m.canonical_email, LOWER(e.qa_agent_email)) AS qa_email,
    LOWER(e.agent_email) AS agent_email,
    e.ticket_call_id     AS ticket_id,
    e.created_at         AS eval_created_at,
    e.final_score,
    e.good_soft_skills,
    e.understood_customer_issue,
    e.resolved_effectively_in_timely_manner,
    e.late_never,
    e.monitoring_category,
    e.evaluation_type,
    CASE WHEN e.monitoring_category = 'DSAT analysis'  THEN 1 ELSE 0 END                          AS dsat,
    CASE WHEN e.monitoring_category != 'DSAT analysis'
              AND e.evaluation_type IN ('Side-by-side', 'Side-by-side | In-person')
              AND LOWER(TRIM(e.agent_email)) NOT LIKE 'brixi_agent@tabby%' THEN 1 ELSE 0 END AS sbs,
    CASE WHEN e.monitoring_category != 'DSAT analysis'
              AND (e.evaluation_type NOT IN ('Side-by-side', 'Side-by-side | In-person')
                   OR LOWER(TRIM(e.agent_email)) LIKE 'brixi_agent@tabby%') THEN 1 ELSE 0 END AS non_sbs,
    'AppSheet' AS source
  FROM customer_happiness_rawdata.gs_qa_manual_assessment_ext e
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(e.qa_agent_email), '@')[OFFSET(0)] = m.local_part
  WHERE DATE(e.created_at) >= '2026-01-01'
    AND e.team = 'QA Team'

  UNION ALL

  SELECT
    DATE_TRUNC(COALESCE(t.date_completed_at, DATE(t.qa_task_updated_at)), MONTH) AS month_date,
    COALESCE(
      m.canonical_email,
      TRIM(LOWER(REGEXP_REPLACE(t.evaluator_email, r'\.+@', '@')))
    ) AS qa_email,
    LOWER(t.agent_email) AS agent_email,
    t.ticket_id          AS ticket_id,
    CAST(COALESCE(TIMESTAMP(t.date_completed_at), t.qa_task_updated_at) AS DATETIME) AS eval_created_at,
    t.general_evaluation_score AS final_score,
    CASE
      WHEN t.professionalism = 'no' OR t.empathy_personalization = 'no' THEN 'No'
      ELSE 'Yes'
    END AS good_soft_skills,
    CASE
      WHEN t.structure_readability = 'no' THEN 'No'
      WHEN t.structure_readability = 'yes' THEN 'Yes'
      ELSE t.structure_readability
    END AS understood_customer_issue,
    CASE
      WHEN t.issue_handling = 'no' OR t.guidance = 'no' THEN 'No'
      ELSE 'Yes'
    END AS resolved_effectively_in_timely_manner,
    NULL AS late_never,
    CASE
      WHEN t.monitoring_source = 'dsat_analysis'                             THEN 'DSAT analysis'
      WHEN t.monitoring_source IN ('side_by_side', 'side_by_side_in_person') THEN 'Side-by-side'
      WHEN t.monitoring_source IS NOT NULL                                   THEN t.monitoring_source
      ELSE 'Random'
    END AS monitoring_category,
    NULL AS evaluation_type,
    CASE WHEN t.monitoring_source = 'dsat_analysis' THEN 1 ELSE 0 END AS dsat,
    CASE
      WHEN t.monitoring_source = 'dsat_analysis' THEN 0
      WHEN LOWER(TRIM(t.agent_email)) LIKE 'brixi_agent@tabby%' THEN 0
      WHEN t.monitoring_source IN ('side_by_side', 'side_by_side_in_person')
        OR t.qa_task_source = 'manually_created' THEN 1
      ELSE 0
    END AS sbs,
    CASE
      WHEN t.monitoring_source = 'dsat_analysis' THEN 0
      WHEN LOWER(TRIM(t.agent_email)) LIKE 'brixi_agent@tabby%' THEN 1
      WHEN t.monitoring_source IN ('side_by_side', 'side_by_side_in_person')
        OR t.qa_task_source = 'manually_created' THEN 0
      ELSE 1
    END AS non_sbs,
    'CRM' AS source
  FROM `customer_happiness_quality_datamarts.qa_crm_qa_tasks` t
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(REGEXP_REPLACE(t.evaluator_email, r'\.+@', '@')), '@')[OFFSET(0)] = m.local_part
  WHERE COALESCE(t.date_completed_at, DATE(t.qa_task_updated_at)) >= '2026-04-01'
    AND (t.stage = 'completed' OR (t.stage = 'archived' AND t.date_completed_at IS NOT NULL))
),

-- ============================================================
-- STEP 2: COACHING ELIGIBILITY
-- ============================================================
dismissed_crm_coachings AS (
  SELECT DISTINCT
    LOWER(CAST(ticket_id AS STRING)) AS ticket_id,
    LOWER(agent_email)               AS agent_email
  FROM `customer_happiness_quality_datamarts.qa_crm_coaching_sessions`
  WHERE stage = 'archived'
    AND coaching_session_created_at >= '2026-04-01'
),

calibration_lookup AS (
  SELECT DISTINCT
    LOWER(agent_email) AS agent_email,
    ticket_id
  FROM `customer_happiness_datamarts.gs_new_calibration_tickets`
),

coaching_elig AS (
  SELECT
    e.qa_email,
    e.month_date,
    e.agent_email,
    e.ticket_id,
    e.eval_created_at,
    e.final_score,
    e.good_soft_skills,
    e.understood_customer_issue,
    e.resolved_effectively_in_timely_manner,
    e.monitoring_category,
    e.evaluation_type,
    e.late_never,
    CASE
      WHEN LOWER(TRIM(e.agent_email)) LIKE 'brixi_agent@tabby%'          THEN 0
      WHEN e.monitoring_category = 'Assessment'                          THEN 0
      WHEN DATE(e.eval_created_at) < '2026-04-10'
        AND e.evaluation_type = 'Side-by-side'                           THEN 0
      WHEN DATE(e.eval_created_at) < '2026-04-10'
        AND e.monitoring_category = 'Side-by-side'                       THEN 0
      WHEN cal.ticket_id IS NOT NULL                                     THEN 0
      WHEN dc.ticket_id IS NOT NULL                                      THEN 0
      WHEN e.late_never = 'Never'                                        THEN 0
      WHEN e.final_score = 0
        OR e.good_soft_skills = 'No'
        OR e.understood_customer_issue = 'No'
        OR e.resolved_effectively_in_timely_manner = 'No'                THEN 1
      ELSE 0
    END AS is_eligible,
    CASE
      WHEN e.final_score = 0                                              THEN 24
      WHEN e.good_soft_skills = 'No'
        OR e.understood_customer_issue = 'No'
        OR e.resolved_effectively_in_timely_manner = 'No'                THEN 72
      WHEN e.monitoring_category = 'DSAT analysis'                       THEN 48
      ELSE NULL
    END AS coaching_time_window_hours
  FROM eval_data e
  LEFT JOIN calibration_lookup cal
    ON cal.agent_email = LOWER(e.agent_email)
   AND cal.ticket_id   = e.ticket_id
  LEFT JOIN dismissed_crm_coachings dc
    ON dc.ticket_id    = LOWER(e.ticket_id)
   AND dc.agent_email  = LOWER(e.agent_email)
),

-- ============================================================
-- STEP 3: COACHING RECORDS
-- ============================================================
coaching_sources AS (
  SELECT
    DATE_TRUNC(DATE(c.created_at), MONTH) AS month_date,
    COALESCE(m.canonical_email, LOWER(c.email_address)) AS qa_email,
    LOWER(c.ticket_ids) AS ticket_ids,
    SUBSTR(LOWER(c.agent_email), 1, GREATEST(LENGTH(LOWER(c.agent_email)) - 3, 0)) AS agent_email_minus_3,
    CAST(c.created_at AS DATETIME) AS coaching_created_at,
    DATE(c.created_at) || c.agent_email AS coaching_session_key
  FROM customer_happiness_quality_datamarts.qa_coaching_quality_enriched c
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(c.email_address), '@')[OFFSET(0)] = m.local_part
  WHERE DATE(c.created_at) >= '2026-01-01'

  UNION ALL

  SELECT
    DATE_TRUNC(DATE(c.created_at), MONTH) AS month_date,
    COALESCE(m.canonical_email, LOWER(c.email_address)) AS qa_email,
    LOWER(c.ticket_ids) AS ticket_ids,
    SUBSTR(LOWER(c.agent_email), 1, GREATEST(LENGTH(LOWER(c.agent_email)) - 3, 0)) AS agent_email_minus_3,
    CAST(c.created_at AS DATETIME) AS coaching_created_at,
    DATE(c.created_at) || c.agent_email AS coaching_session_key
  FROM customer_happiness_datamarts.quality_coaching_hist c
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(c.email_address), '@')[OFFSET(0)] = m.local_part
  WHERE DATE(c.created_at) >= '2026-01-01'

  UNION ALL

  SELECT
    DATE_TRUNC(COALESCE(c.date_completed_at, DATE(c.coaching_session_created_at)), MONTH) AS month_date,
    COALESCE(
      m.canonical_email,
      TRIM(LOWER(REGEXP_REPLACE(c.evaluator_email, r'\.+@', '@')))
    ) AS qa_email,
    LOWER(CAST(c.ticket_id AS STRING)) AS ticket_ids,
    SUBSTR(LOWER(c.agent_email), 1, GREATEST(LENGTH(LOWER(c.agent_email)) - 3, 0)) AS agent_email_minus_3,
    CAST(TIMESTAMP(COALESCE(c.date_completed_at, DATE(c.coaching_session_created_at))) AS DATETIME) AS coaching_created_at,
    REGEXP_REPLACE(c.coaching_session_recording_link, r'\?.*$', '') AS coaching_session_key
  FROM `customer_happiness_quality_datamarts.qa_crm_coaching_sessions` c
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(REGEXP_REPLACE(c.evaluator_email, r'\.+@', '@')), '@')[OFFSET(0)] = m.local_part
  WHERE COALESCE(c.date_completed_at, DATE(c.coaching_session_created_at)) >= '2026-04-01'
    AND c.evaluator_email IS NOT NULL
    AND c.coaching_session_recording_link IS NOT NULL
    AND c.stage = 'completed'
),

-- ============================================================
-- STEP 4: MATCH EVALS TO COACHING RECORDS
-- ============================================================
eval_with_elig AS (
  SELECT
    e.*,
    ce.is_eligible,
    ce.coaching_time_window_hours
  FROM eval_data e
  LEFT JOIN coaching_elig ce
    ON  e.qa_email        = ce.qa_email
    AND e.ticket_id       = ce.ticket_id
    AND e.eval_created_at = ce.eval_created_at
),
primary_match AS (
  SELECT
    e.qa_email,
    e.ticket_id,
    e.eval_created_at,
    MAX(1) AS matched,
    MAX(CASE WHEN DATETIME_DIFF(ac.coaching_created_at, e.eval_created_at, HOUR)
                  <= e.coaching_time_window_hours THEN 1 ELSE 0 END) AS matched_on_time
  FROM eval_with_elig e
  JOIN coaching_sources ac
    ON  ac.qa_email           = e.qa_email
    AND ac.ticket_ids         = LOWER(e.ticket_id)
    AND ac.agent_email_minus_3 = SUBSTR(LOWER(e.agent_email), 1, GREATEST(LENGTH(LOWER(e.agent_email)) - 3, 0))
  GROUP BY e.qa_email, e.ticket_id, e.eval_created_at
),
eval_with_coaching AS (
  SELECT
    e.*,
    CASE WHEN COALESCE(pm.matched, 0) = 1 THEN 1 ELSE 0 END AS was_coached,
    CASE WHEN COALESCE(pm.matched_on_time, 0) = 1 THEN 1 ELSE 0 END AS was_coached_on_time,
    CASE
      WHEN COALESCE(pm.matched, 0) = 1
       AND COALESCE(pm.matched_on_time, 0) = 0
      THEN 1 ELSE 0
    END AS was_coached_late
  FROM eval_with_elig e
  LEFT JOIN primary_match pm
    ON  pm.qa_email        = e.qa_email
    AND pm.ticket_id       = e.ticket_id
    AND pm.eval_created_at = e.eval_created_at
),

-- ============================================================
-- STEP 5: AGGREGATE EVAL + COACHING METRICS PER QA PER MONTH
-- ============================================================
agg_data AS (
  SELECT
    e.month_date,
    e.qa_email,
    SUM(e.sbs)           AS sbs,
    SUM(e.non_sbs)       AS non_sbs,
    SUM(e.dsat)          AS dsat,
    SUM(e.is_eligible)   AS coaching_eligibility_count,
    SUM(CASE WHEN e.is_eligible = 1 AND e.was_coached         = 1 THEN 1 ELSE 0 END) AS total_coachings_by_eval_created_date,
    SUM(CASE WHEN e.is_eligible = 1 AND e.was_coached_on_time = 1 THEN 1 ELSE 0 END) AS total_ontime_coachings_by_eval_created_date,
    SUM(CASE WHEN e.is_eligible = 1 AND e.was_coached_late    = 1 THEN 1 ELSE 0 END) AS actual_late_coachings,
    SUM(CASE WHEN e.source = 'AppSheet' AND e.is_eligible = 1 THEN 1 ELSE 0 END) AS appsheet_eligibility_count,
    SUM(CASE WHEN e.source = 'AppSheet' AND e.is_eligible = 1 AND e.was_coached = 1 THEN 1 ELSE 0 END) AS appsheet_total_coached
  FROM eval_with_coaching e
  GROUP BY e.month_date, e.qa_email
),

-- ============================================================
-- STEP 6: COACHING SESSION COUNTS (BY COACHING DATE)
-- ============================================================
coaching_data_agg AS (
  SELECT
    month_date,
    qa_email,
    COUNT(DISTINCT coaching_session_key)                    AS coaching_sessions,
    COUNT(DISTINCT CONCAT(ticket_ids, agent_email_minus_3)) AS total_coachings_by_coaching_created_date
  FROM coaching_sources
  GROUP BY month_date, qa_email
),

-- ============================================================
-- STEP 6b: PENDING COACHINGS (CRM stage = 'new')
-- ============================================================
pending_coachings AS (
  SELECT
    DATE_TRUNC(DATE(c.coaching_session_created_at), MONTH) AS month_date,
    COALESCE(
      m.canonical_email,
      TRIM(LOWER(REGEXP_REPLACE(c.evaluator_email, r'\.+@', '@')))
    ) AS qa_email,
    COUNT(DISTINCT CONCAT(CAST(c.ticket_id AS STRING), c.agent_email)) AS pending_count
  FROM `customer_happiness_quality_datamarts.qa_crm_coaching_sessions` c
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(REGEXP_REPLACE(c.evaluator_email, r'\.+@', '@')), '@')[OFFSET(0)] = m.local_part
  WHERE c.stage = 'new'
    AND DATE(c.coaching_session_created_at) >= '2026-04-01'
    AND LOWER(TRIM(c.agent_email)) NOT LIKE 'brixi_agent@tabby%'
  GROUP BY month_date, qa_email
),

-- ============================================================
-- STEP 7: SIDE TASK DURATIONS
-- ============================================================
side_tasks AS (
  SELECT
    DATE_TRUNC(DATE(s.task_date), MONTH) AS month_date,
    COALESCE(m.canonical_email, LOWER(s.qa_email)) AS qa_email,
    SUM(TIMESTAMP_DIFF(s.end_time, s.start_time, SECOND) / 60.0) AS side_task_minutes
  FROM customer_happiness_datamarts.qa_side_tasks s
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(s.qa_email), '@')[OFFSET(0)] = m.local_part
  WHERE s.task_status IN ('Approved', 'Adjusted')
    AND DATE(s.task_date) >= '2026-01-01'
  GROUP BY month_date, qa_email
),

-- ============================================================
-- STEP 8: RTR SCORES
-- ============================================================
rtr_data AS (
  SELECT
    month_date,
    qa_email,
    COUNT(*)        AS rtr_count,
    AVG(rtr_score)  AS avg_rtr_score
  FROM (
    SELECT
      DATE_TRUNC(DATE(r.created_at), MONTH) AS month_date,
      COALESCE(m.canonical_email, TRIM(LOWER(r.auditee_email))) AS qa_email,
      r.rtr_score
    FROM customer_happiness_datamarts.gs_qa_rtr_data r
    LEFT JOIN qa_email_map m
      ON SPLIT(TRIM(LOWER(r.auditee_email)), '@')[OFFSET(0)] = m.local_part
    WHERE DATE(r.created_at) >= '2026-01-01'

    UNION ALL

    SELECT
      DATE_TRUNC(COALESCE(r.date_resolved_dubai, DATE(r.rtr_updated_at), DATE(r.rtr_created_at)), MONTH) AS month_date,
      COALESCE(m.canonical_email, TRIM(LOWER(r.auditee_email))) AS qa_email,
      r.rtr_score / 100 AS rtr_score
    FROM `tabby-dp.customer_happiness_quality_datamarts.qa_crm_rtr` r
    LEFT JOIN qa_email_map m
      ON SPLIT(TRIM(LOWER(r.auditee_email)), '@')[OFFSET(0)] = m.local_part
    WHERE r.stage = 'completed'
      AND COALESCE(r.date_resolved_dubai, DATE(r.rtr_updated_at), DATE(r.rtr_created_at)) >= '2026-04-01'
  )
  GROUP BY month_date, qa_email
),

-- ============================================================
-- STEP 9: COACHING OBSERVATION SCORES (AppSheet + CRM)
-- ============================================================
obs_coaching AS (
  SELECT
    month_date,
    qa_email,
    COUNT(*)   AS observed_coaching_count,
    AVG(score) AS avg_observation_score
  FROM (
    SELECT
      DATE_TRUNC(DATE(o.created_at), MONTH) AS month_date,
      COALESCE(m.canonical_email, LOWER(o.coach_email)) AS qa_email,
      o.score
    FROM customer_happiness_datamarts.gs_qa_coaching_obs_data o
    LEFT JOIN qa_email_map m
      ON SPLIT(LOWER(o.coach_email), '@')[OFFSET(0)] = m.local_part
    WHERE o.submission_type = 'Observation'
      AND o.created_at >= '2026-01-01'

    UNION ALL

    SELECT
      DATE_TRUNC(COALESCE(DATE(o.coaching_created_at), o.date_resolved_dubai), MONTH) AS month_date,
      COALESCE(m.canonical_email, LOWER(o.coach_email)) AS qa_email,
      o.coaching_observation_score / 100 AS score
    FROM `customer_happiness_quality_datamarts.qa_crm_coaching_observation` o
    LEFT JOIN qa_email_map m
      ON SPLIT(LOWER(o.coach_email), '@')[OFFSET(0)] = m.local_part
    WHERE o.submission_type = 'observation'
      AND COALESCE(DATE(o.coaching_created_at), o.date_resolved_dubai) >= '2026-04-01'
  )
  GROUP BY month_date, qa_email
),

-- ============================================================
-- STEP 10: CALIBRATION MATCH RATES (AppSheet + CRM) — WITH PHASE PIVOT
-- ============================================================
calibration_raw AS (
  SELECT
    DATE_TRUNC(PARSE_DATE('%b %Y', c.process_month), MONTH) AS month_date,
    COALESCE(m.canonical_email, LOWER(c.assignee_email)) AS qa_email,
    LOWER(c.phase)  AS phase,
    LOWER(c.status) AS status,
    c.match_rate
  FROM `customer_happiness_quality_datamarts.new_calibration_tickets_for_qa_queue` c
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(c.assignee_email), '@')[OFFSET(0)] = m.local_part
  WHERE PARSE_DATE('%b %Y', c.process_month) >= '2026-01-01'
    -- business_role filter removed: suppresses valid calibration rows

  UNION ALL

  SELECT
    DATE_TRUNC(PARSE_DATE('%b %Y', c.process_month), MONTH),
    COALESCE(m.canonical_email, LOWER(c.assignee_email)),
    LOWER(c.phase),
    LOWER(c.status),
    c.match_rate
  FROM `tabby-dp.customer_happiness_quality_datamarts.crm_calibration_for_meta_dashboard` c
  LEFT JOIN qa_email_map m
    ON SPLIT(LOWER(c.assignee_email), '@')[OFFSET(0)] = m.local_part
  WHERE PARSE_DATE('%b %Y', c.process_month) >= '2026-04-01'
    -- business_role filter removed: suppresses valid calibration rows
),
calibration_per_phase AS (
  SELECT
    month_date,
    qa_email,
    phase,
    MAX(match_rate) AS match_rate,
    COALESCE(
      MAX(CASE WHEN status IN ('passed','failed') THEN status END),
      MAX(CASE WHEN status = 'missed'     THEN status END),
      MAX(CASE WHEN status = 'not_pushed' THEN status END),
      MAX(status)
    ) AS status
  FROM calibration_raw
  GROUP BY month_date, qa_email, phase
),
calibration_pivoted AS (
  SELECT
    month_date,
    qa_email,
    MAX(CASE WHEN phase = 'phase1' THEN match_rate END) AS phase1_score,
    MAX(CASE WHEN phase = 'phase1' THEN status     END) AS phase1_status,
    MAX(CASE WHEN phase = 'phase2' THEN match_rate END) AS phase2_score,
    MAX(CASE WHEN phase = 'phase2' THEN status     END) AS phase2_status,
    COUNT(*) AS calibration_count,
    COALESCE(
      MAX(CASE WHEN phase = 'phase2' THEN match_rate END),
      MAX(CASE WHEN phase = 'phase1' THEN match_rate END),
      MAX(match_rate)
    ) AS avg_calibration_match_rate,
    COALESCE(
      MAX(CASE WHEN phase = 'phase2' THEN status END),
      MAX(CASE WHEN phase = 'phase1' THEN status END),
      MAX(status)
    ) AS calibration_status
  FROM calibration_per_phase
  GROUP BY month_date, qa_email
),

-- ============================================================
-- STEP 11: JKQ QUIZ SCORES
-- ============================================================
jkq_data AS (
  SELECT
    COALESCE(m.canonical_email, TRIM(LOWER(j.user_email))) AS qa_email,
    SAFE_CAST(j.score AS FLOAT64) AS score,
    j.result,
    j.jKQ_episode,
    SAFE_CAST(REGEXP_EXTRACT(CAST(j.jKQ_episode AS STRING), r'(\d+)') AS INT64) AS ep_no,
    DATE_TRUNC(j.date, MONTH) AS completion_dt
  FROM `tabby-dp.customer_happiness_datamarts.dm_jkq_final_score` j
  LEFT JOIN qa_email_map m
    ON SPLIT(TRIM(LOWER(j.user_email)), '@')[OFFSET(0)] = m.local_part
  WHERE j.date >= '2026-01-01'
),
jkq_ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY qa_email, completion_dt ORDER BY score DESC) AS rn
  FROM jkq_data
),
jkq_latest AS (
  SELECT qa_email, score, result, jKQ_episode, ep_no, completion_dt
  FROM jkq_ranked
  WHERE rn = 1
)

-- ============================================================
-- FINAL OUTPUT
-- ============================================================
SELECT
  month,
  qa_email,
  SUM(sbs)                                                                  AS sbs,
  SUM(non_sbs)                                                              AS non_sbs,
  SUM(dsat)                                                                 AS dsat,
  ROUND(SUM(side_tasks_duration_mins), 2)                                   AS side_tasks_duration_mins,
  SUM(coaching_sessions)                                                    AS coaching_sessions,
  SUM(appsheet_not_coached) + SUM(pending_coachings)                        AS not_coached,
  CONCAT(
    COALESCE(
      ROUND(
        SAFE_DIVIDE(
          SUM(completed_coachings),
          NULLIF(SUM(completed_coachings) + SUM(appsheet_not_coached) + SUM(pending_coachings), 0)
        ) * 100, 1),
      0),
    '%'
  )                                                                          AS coaching_completion_pct,
  SUM(rtr_count)                                                            AS rtr_count,
  CONCAT(
    ROUND(SAFE_DIVIDE(SUM(rtr_score_sum), NULLIF(SUM(rtr_count), 0)) * 100, 1),
    '%'
  )                                                                          AS avg_rtr_score,
  SUM(observed_coaching_count)                                              AS observed_coaching_count,
  CONCAT(
    ROUND(SAFE_DIVIDE(SUM(obs_score_sum), NULLIF(SUM(observed_coaching_count), 0)) * 100, 1),
    '%'
  )                                                                          AS avg_observation_score_pct,
  SUM(calibration_count)                                                    AS calibration_count,
  CASE
    WHEN MAX(calibration_status) = 'missed'     THEN 'Missed'
    WHEN MAX(calibration_status) = 'not_pushed' THEN 'Not Pushed'
    WHEN SUM(calibration_count) = 0             THEN '-'
    ELSE CONCAT(
      ROUND(SAFE_DIVIDE(SUM(cal_score_sum), NULLIF(SUM(calibration_count), 0)) * 100, 1),
      '%'
    )
  END                                                                        AS avg_calibration_match_rate,
  CASE WHEN MAX(phase1_score) IS NULL THEN '-'
       ELSE CONCAT(ROUND(MAX(phase1_score) * 100, 1), '%')
  END                                                                        AS phase1_score,
  COALESCE(MAX(phase1_status), '-')                                          AS phase1_status,
  CASE WHEN MAX(phase2_score) IS NULL THEN '-'
       ELSE CONCAT(ROUND(MAX(phase2_score) * 100, 1), '%')
  END                                                                        AS phase2_score,
  COALESCE(MAX(phase2_status), '-')                                          AS phase2_status,
  COALESCE(ROUND(MAX(jkq_score_raw), 1), 0)                                 AS jkq_score,
  COALESCE(MAX(jkq_result_raw), 'N/A')                                      AS jkq_result,
  COALESCE(CAST(MAX(jkq_episode_raw) AS STRING), '--')                      AS jKQ_episode
FROM (
  SELECT
    FORMAT_DATE('%b-%Y', a.month_date)                                       AS month,
    a.month_date,
    SPLIT(a.qa_email, '@')[OFFSET(0)]                                        AS qa_email,
    a.sbs,
    a.non_sbs,
    a.dsat,
    COALESCE(s.side_task_minutes, 0.0)                                       AS side_tasks_duration_mins,
    COALESCE(cd.coaching_sessions, 0)                                        AS coaching_sessions,
    COALESCE(a.appsheet_eligibility_count - a.appsheet_total_coached, 0) AS appsheet_not_coached,
    COALESCE(cd.total_coachings_by_coaching_created_date, 0)                 AS completed_coachings,
    COALESCE(pc.pending_count, 0)                                            AS pending_coachings,
    COALESCE(r.rtr_count, 0)                                                 AS rtr_count,
    COALESCE(r.avg_rtr_score, 0) * COALESCE(r.rtr_count, 0)                  AS rtr_score_sum,
    COALESCE(o.observed_coaching_count, 0)                                   AS observed_coaching_count,
    COALESCE(o.avg_observation_score, 0) * COALESCE(o.observed_coaching_count, 0) AS obs_score_sum,
    COALESCE(cal.calibration_count, 0)                                       AS calibration_count,
    COALESCE(cal.avg_calibration_match_rate, 0) * COALESCE(cal.calibration_count, 0) AS cal_score_sum,
    cal.calibration_status                                                   AS calibration_status,
    cal.phase1_score                                                         AS phase1_score,
    cal.phase1_status                                                        AS phase1_status,
    cal.phase2_score                                                         AS phase2_score,
    cal.phase2_status                                                        AS phase2_status,
    jkq.score                                                                AS jkq_score_raw,
    jkq.result                                                               AS jkq_result_raw,
    jkq.jKQ_episode                                                          AS jkq_episode_raw
  FROM agg_data a
  LEFT JOIN side_tasks         s   ON a.qa_email = s.qa_email   AND a.month_date = s.month_date
  LEFT JOIN coaching_data_agg  cd  ON a.qa_email = cd.qa_email  AND a.month_date = cd.month_date
  LEFT JOIN pending_coachings  pc  ON a.qa_email = pc.qa_email  AND a.month_date = pc.month_date
  LEFT JOIN rtr_data           r   ON a.qa_email = r.qa_email   AND a.month_date = r.month_date
  LEFT JOIN obs_coaching       o   ON a.qa_email = o.qa_email   AND a.month_date = o.month_date
  LEFT JOIN calibration_pivoted cal ON a.qa_email = cal.qa_email AND a.month_date = cal.month_date
  LEFT JOIN jkq_latest         jkq ON a.qa_email = jkq.qa_email AND a.month_date = jkq.completion_dt
  WHERE a.qa_email IN (SELECT canonical_email FROM qa_email_map)
)
GROUP BY month, month_date, qa_email
ORDER BY (sbs + non_sbs) DESC, qa_email DESC, month_date ASC;
