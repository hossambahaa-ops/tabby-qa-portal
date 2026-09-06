-- Login Hours per QA per month  →  mtd_scores.login_hours
--
-- DEFINITION (agreed with Hossam, 2026-09-03):
--   Login hours = time a QA spent with CRM status = 'online' WHILE their ACTIVE
--   persona was an AGENT persona — i.e. any persona whose name contains
--   "agent": customer_agent, customer_agent_crm_view, dispute_agent,
--   customer_agent_training, collection_agent, cx_agent, and the various
--   misspellings the free-text field contains. Online time under a non-agent
--   persona (quality_specialist, cx_team_lead, quality_manager, wfm, …) is
--   EXCLUDED.
--
--   WIDENED 2026-09-06 (Hossam): "any role that has agent should be counted".
--   The original rule was customer_agent-only, which zeroed mahmoud.hesham —
--   all 19 of his August online sessions were under dispute_agent, i.e. real
--   ticket work misread as "not working". Widening recovered +50.6h across the
--   roster: mahmoud.hesham 0→26.82 (Aug) and 0→7.60 (Sep),
--   esraa.ibrahim.786 16.97→27.95, asmaa.mohamed 30.50→31.77, plus five small
--   September gains. Use the substring test, NOT an IN-list — new personas and
--   typos appear in this free-text field regularly.
--
-- WHY NOT persona_agent_activity_daily.hours_logged: that rollup is not online
-- time. It credits hours on days with zero online events and over-attributes to
-- managers (muhammad.ramadan showed 35.6h there vs 10.2h of real agent-online
-- time; asmaa.mohamed showed 0 there despite 30.5h genuinely online). The raw
-- status log is authoritative; the rollup is not.
--
-- METHOD
--   1. Pull status + current_persona change events from crm_changes_view.
--   2. Carry the active persona forward per agent (seeded from history), so every
--      status event knows which persona was active at that instant.
--   3. Build online intervals = [online event, NEXT STATUS CHANGE OF ANY KIND).
--      (Using the next *status* change, NOT the next online event — otherwise
--      breaks/lunch/offline get counted as online.)
--   4. Cap each interval at 12h so a forgotten "online" cannot inflate a day.
--   5. Keep only intervals whose active persona is an agent persona.
--   6. CLIP each interval to the target month before summing, so a session that
--      straddles a month boundary contributes only its in-month portion and the
--      stored value does not depend on how far the query window extends.
--
-- IDENTITY
--   Scoped to qa_roster by email local part. ahmed.sami collides with a KSA agent
--   of the same name — pinned to ahmed.sami@tabby.ai only.
--
--   ALIASES (added 2026-09-06 after a real miss): Esraa and Alaa are on the
--   roster as esraa.ibrahim.786 / alaa.elhady.786, but their CRM status events
--   are logged under the NON-.786 identity. Matching on the roster local part
--   alone silently returned zero for both — Esraa lost 16.97h (Aug) and 9.28h
--   (Sep), Alaa lost 32.05h. Any roster local part whose CRM identity differs
--   MUST be listed here. This is the same class of bug that the qa_email_map
--   patch fixes in mtd_consolidated.sql; keep the two in step.
--
--   Genuine zeros (verified, do not "fix"): zainab.hasan, mohamed.mamdouh,
--   ahmed.mostafa and tarek.mostafa have no CRM status events at all;
--   mahmoud.hesham went online 19 times in Aug but never under an agent
--   persona; omar.abdelsamee logged 28 status events and zero online.
--
-- Parameterise by editing the `months` CTE (label + [m0, m1) bounds). Persona is
-- normalised by stripping to letters, which folds the ~200 free-text spellings of
-- current_persona ("Customer Agent", "customer_agent", "Cusotmer_Agent_View", …)
-- onto customeragent / customeragentcrmview.
--
-- Validated against Pulse's existing Aug-2026 rows and against a hand-paired
-- reconstruction of the raw event log (equal or within rounding on every day).

-- CRM local part -> roster identity. Every entry here is a case where the CRM
-- email differs from the roster email; unlisted local parts map to themselves.
WITH alias AS (
  SELECT * FROM UNNEST([
    STRUCT('esraa.ibrahim'     AS crm_lp, 'esraa.ibrahim.786' AS roster_lp),
    STRUCT('esraa.ibrahim.786', 'esraa.ibrahim.786'),
    STRUCT('alaa.elhady',       'alaa.elhady.786'),
    STRUCT('alaa.elhady.786',   'alaa.elhady.786')
  ])
),
roster AS (
  SELECT LOWER(local_part) lp, only_email
  FROM (
    -- Materialised from Pulse qa_roster + email_pins at push time. Kept inline
    -- here so the query runs standalone in BigQuery/Metabase.
    SELECT lp AS local_part,
           IF(lp = 'ahmed.sami', 'ahmed.sami@tabby.ai', NULL) AS only_email
    FROM UNNEST([
     'abdallah.ashraf','abdelrahman.osama','abdulrahman.hesham','ahmed.hegazy','ahmed.mostafa','ahmed.sami','ahmed.soliman.6','alaa.elhady.786','amr.salah','arwa.alzahrani.2','asmaa.mohamed','bushra.kaabi','esraa.ibrahim.786','george.amir','hagar.dawood','hesham.mostafa.39','hossam.bahaa','hussam.khaled','kyrillos.malak','lama.alanezi.95','mahmoud.hesham','mariam.gad','marwa.sobhy','mohamed.mamdouh','mohamed.salah','mohammed.aljandal.5','mohammed.faran','mohammed.mohsen','mostafa.sami','muhammad.ramadan','nardeen.wafaey','nourhan.hussien','omar.abdelsamee','omar.fetouh','omar.mohammad','peter.mikhail','pola.emad','rahma.mohamed','rana.salah','reem.mansour','sameh.ahmed','sara.abdeltwab','saud.alasiri','sohaila.adel','tarek.mostafa','youssef.housh','zainab.hasan'
    ]) lp
  )
),
months AS (
  -- Edit this to the month(s) being pushed.
  SELECT 'Aug-2026' mth, DATETIME '2026-08-01' m0, DATETIME '2026-09-01' m1 UNION ALL
  SELECT 'Sep-2026', DATETIME '2026-09-01', DATETIME '2026-10-01'
),
src AS (
  -- Resolve the CRM identity to the roster identity BEFORE joining the roster,
  -- so a QA whose CRM email differs (see `alias`) is still counted.
  SELECT COALESCE(al.roster_lp, LOWER(SPLIT(c.email,'@')[OFFSET(0)])) lp,
         c.email, c.created_at_dubai ts, c.field_name, c.new_value
  FROM `tabby-dp.customer_happiness_datamarts.crm_changes_view` c
  LEFT JOIN alias al ON al.crm_lp = LOWER(SPLIT(c.email,'@')[OFFSET(0)])
  JOIN roster r ON r.lp = COALESCE(al.roster_lp, LOWER(SPLIT(c.email,'@')[OFFSET(0)]))
  WHERE c.field_name IN ('status','current_persona')
    AND c.created_at_dubai < (SELECT MAX(m1) FROM months)
    AND (r.only_email IS NULL OR LOWER(c.email) = r.only_email)
),
evt AS (
  SELECT lp, ts,
    IF(field_name='status', new_value, NULL) status,
    IF(field_name='current_persona', REGEXP_REPLACE(LOWER(TRIM(new_value)), r'[^a-z]',''), NULL) pn
  FROM src
),
carry AS (
  SELECT lp, ts, status,
    LAST_VALUE(pn IGNORE NULLS) OVER (
      PARTITION BY lp ORDER BY ts, IF(pn IS NOT NULL,0,1)
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) active_pn
  FROM evt
),
status_iv AS (
  SELECT lp, ts, status, active_pn,
    LEAD(ts) OVER (PARTITION BY lp ORDER BY ts) nxt
  FROM carry WHERE status IS NOT NULL
),
iv AS (
  SELECT lp, ts AS iv_start, LEAST(nxt, DATETIME_ADD(ts, INTERVAL 720 MINUTE)) AS iv_end
  FROM status_iv
  WHERE status='online' AND nxt IS NOT NULL
    AND REGEXP_CONTAINS(active_pn, 'agent')   -- ANY agent-bearing persona
),
clipped AS (
  SELECT i.lp, m.mth,
    DATETIME_DIFF(LEAST(i.iv_end, m.m1), GREATEST(i.iv_start, m.m0), MINUTE) AS mins
  FROM iv i JOIN months m ON i.iv_start < m.m1 AND i.iv_end > m.m0
)
SELECT lp, mth, ROUND(SUM(GREATEST(mins,0))/60, 2) AS login_hours
FROM clipped
GROUP BY 1,2
ORDER BY mth, login_hours DESC;
