-- MTD ABT + tickets handled, per QA, per month.
--
-- Parameterless on purpose: Metabase card 2792 ("ABT by Agent | Rowchart") is a
-- dashboard visualisation and cannot feed Pulse. It has no month column (one
-- aggregate over a rolling window), and its `limit {{top_n}}` silently
-- truncates at 100 agents. This is the same ABT definition, reshaped into the
-- month x qa_email grain that mtd_scores is keyed on.
--
-- ABT     = sum(basket_time_min_ONLINE_WOMT) / count(distinct ticket_id)
-- Tickets = count(distinct ticket_id)
--
-- MATCHING IS ON LOCAL PART, NOT FULL EMAIL. The warehouse holds several QAs
-- under a different domain than Pulse's canonical address -- as of 2026-09-03
-- that is ahmed.soliman.6, sameh.ahmed, mostafa.sami and mahmoud.hesham, all
-- @tabby.ai in BigQuery but @tabby.sa in Pulse. Joining on the full address
-- drops all four without erroring. Local part also merges a QA who appears
-- under both domains into one canonical row.
--
-- LOCAL-PART MATCHING IS NOT SAFE ON ITS OWN. Two roster local parts resolve
-- to more than one warehouse address, and they need OPPOSITE handling:
--   ahmed.soliman.6  -> @tabby.ai and @tabby.sa are the SAME QA. Merge.
--   ahmed.sami       -> @tabby.ai is the QA; @tabby.sa is a DIFFERENT PERSON,
--                       a KSA agent. Must NOT be merged.
-- Nothing in the data distinguishes those two cases, so the second is pinned
-- by hand in email_pins below. It is not a cosmetic fix: the KSA Ahmed Sami
-- runs an ABT around 10x the QA's (100-190 min vs 11-21), so merging them made
-- Jun-2026 read ABT 44.0 instead of 11.4 -- nearly 4x overstated on a metric
-- that feeds performance review.
--
-- Re-run the collision audit at the bottom of this file after any roster
-- change; a new same-name hire is silent otherwise.
--
-- The team-lead-log join from card 2792 is deliberately NOT reproduced: it
-- exists there only to attach team_lead_email and to bound the period, neither
-- of which this feed needs, and joining it risks double-counting basket time
-- where an agent has overlapping log ranges.

WITH qa_roster AS (
  SELECT * FROM UNNEST([
    STRUCT('mohammed.almasoudi' AS local_part, 'mohammed.almasoudi@tabby.sa' AS canonical_email),
    STRUCT('hossam.bahaa','hossam.bahaa@tabby.sa'),
    STRUCT('ahmed.mostafa','ahmed.mostafa@tabby.sa'),
    STRUCT('george.amir','george.amir@tabby.ai'),
    STRUCT('muhammad.ramadan','muhammad.ramadan@tabby.ai'),
    STRUCT('tarek.mostafa','tarek.mostafa@tabby.sa'),
    STRUCT('suhail.idriss','suhail.idriss@tabby.sa'),
    STRUCT('arwa.alzahrani','arwa.alzahrani.2@tabby.sa'),
    STRUCT('saud.alasiri','saud.alasiri@tabby.sa'),
    STRUCT('mohamed.mamdouh','mohamed.mamdouh@tabby.sa'),
    STRUCT('rahma.eskander','rahma.eskander@tabby.ai'),
    STRUCT('abdallah.ashraf','abdallah.ashraf@tabby.ai'),
    STRUCT('nourhan.hussien','nourhan.hussien@tabby.ai'),
    STRUCT('omar.mohammad','omar.mohammad@tabby.ai'),
    STRUCT('omar.fetouh','omar.fetouh@tabby.ai'),
    STRUCT('rana.salah','rana.salah@tabby.ai'),
    STRUCT('peter.mikhail','peter.mikhail@tabby.ai'),
    STRUCT('mohamed.salah','mohamed.salah@tabby.ai'),
    STRUCT('ahmed.soliman.6','ahmed.soliman.6@tabby.sa'),
    STRUCT('reem.mansour','reem.mansour@tabby.ai'),
    STRUCT('sohaila.adel','sohaila.adel@tabby.ai'),
    STRUCT('hagar.dawood','hagar.dawood@tabby.ai'),
    STRUCT('abdulrahman.hesham','abdulrahman.hesham@tabby.ai'),
    STRUCT('sameh.ahmed','sameh.ahmed@tabby.sa'),
    STRUCT('mariam.gad','mariam.gad@tabby.ai'),
    STRUCT('ahmed.sami','ahmed.sami@tabby.ai'),
    STRUCT('zainab.hasan','zainab.hasan@tabby.ai'),
    STRUCT('omar.abdelsamee','omar.abdelsamee@tabby.ai'),
    STRUCT('youssef.housh','youssef.housh@tabby.ai'),
    STRUCT('mohammed.mohsen','mohammed.mohsen@tabby.ai'),
    STRUCT('hesham.mostafa.39','hesham.mostafa.39@tabby.ai'),
    STRUCT('sara.abdeltwab','sara.abdeltwab@tabby.ai'),
    STRUCT('kyrillos.malak','kyrillos.malak@tabby.ai'),
    STRUCT('mohammed.faran','mohammed.faran@tabby.ai'),
    STRUCT('ahmed.elwany','ahmed.elwany@tabby.sa'),
    STRUCT('bushra.kaabi','bushra.kaabi@tabby.sa'),
    STRUCT('mohammed.aljandal.5','mohammed.aljandal.5@tabby.sa'),
    STRUCT('lama.alanezi.95','lama.alanezi.95@tabby.sa'),
    STRUCT('hussam.khaled','hussam.khaled@tabby.ai'),
    STRUCT('marwa.sobhy','marwa.sobhy@tabby.ai'),
    STRUCT('abdelrahman.osama','abdelrahman.osama@tabby.ai'),
    STRUCT('ahmed.hegazy','ahmed.hegazy@tabby.ai'),
    STRUCT('nardeen.wafaey','nardeen.wafaey@tabby.ai'),
    STRUCT('pola.emad','pola.emad@tabby.ai'),
    STRUCT('asmaa.mohamed','asmaa.mohamed@tabby.sa'),
    STRUCT('mostafa.sami','mostafa.sami@tabby.sa'),
    STRUCT('rahma.mohamed','rahma.mohamed@tabby.ai'),
    STRUCT('amr.salah','amr.salah@tabby.ai'),
    STRUCT('mahmoud.hesham','mahmoud.hesham@tabby.sa'),
    STRUCT('esraa.ibrahim','esraa.ibrahim@tabby.ai'),
    STRUCT('alaa.elhady','alaa.elhady@tabby.ai')
  ])
),

-- Local parts that are shared by two DIFFERENT people. Pinning one address
-- here restricts that QA to it; everyone not listed keeps local-part matching
-- and so still survives a domain change.
email_pins AS (
  SELECT * FROM UNNEST([
    STRUCT('ahmed.sami' AS local_part, 'ahmed.sami@tabby.ai' AS only_email)
  ])
),

scoped AS (
  SELECT
    r.canonical_email,
    b.report_dt,
    b.agent_email AS source_email,
    b.ticket_id,
    b.basket_time_min_ONLINE_WOMT AS basket_min
  FROM `customer_happiness_datamarts.helpdesk_agent_basket_time` b
  JOIN qa_roster r
    ON LOWER(SPLIT(b.agent_email, '@')[OFFSET(0)]) = r.local_part
  LEFT JOIN email_pins p
    ON p.local_part = r.local_part
  JOIN `customer_happiness_datamarts.helpdesk_tickets` t
    ON b.ticket_id = t.ticket_id
  WHERE b.report_dt >= DATE '2026-01-01'
    AND (p.only_email IS NULL OR LOWER(b.agent_email) = p.only_email)
)

SELECT
  FORMAT_DATE('%b-%Y', report_dt)                                   AS month,
  canonical_email                                                   AS qa_email,
  COUNT(DISTINCT ticket_id)                                         AS tickets_touched,
  ROUND(SUM(basket_min) / NULLIF(COUNT(DISTINCT ticket_id), 0), 2)  AS abt,
  -- Kept so a domain change shows up in the output instead of silently
  -- dropping the QA. Drop this column if the consumer wants a clean 4-col feed.
  STRING_AGG(DISTINCT source_email ORDER BY source_email)           AS matched_source_emails
FROM scoped
GROUP BY 1, 2
ORDER BY MIN(report_dt) DESC, tickets_touched DESC


-- ── Collision audit ──────────────────────────────────────────────────────
-- Run this after any roster change. Every local part it returns is either a
-- domain change (merge -- leave alone) or two different people (split -- add
-- to email_pins). The query cannot tell you which; a human has to.
--
-- SELECT r.local_part, COUNT(DISTINCT b.agent_email) AS variants,
--        STRING_AGG(DISTINCT b.agent_email ORDER BY b.agent_email) AS emails
-- FROM `customer_happiness_datamarts.helpdesk_agent_basket_time` b
-- JOIN qa_roster r ON LOWER(SPLIT(b.agent_email,'@')[OFFSET(0)]) = r.local_part
-- WHERE b.report_dt >= DATE '2026-01-01'
-- GROUP BY 1 HAVING COUNT(DISTINCT b.agent_email) > 1;
