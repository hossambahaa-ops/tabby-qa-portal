-- Per-QA CSAT per month  →  mtd_scores.csat_good / csat_bad / csat_total / csat_pct
--
-- SOURCE: Metabase card 4426 "New Agent's Karma CSATs" (dashboard 166,
-- "Karma CSAT: Agent Level"). This query reproduces that card's logic exactly,
-- scoped to the QA roster. Do not hand-roll a CSAT definition — use this.
--
-- THE RULES, and why each one matters (every one of these was got wrong first):
--
--  1. VERDICT = COALESCE(csat, ziwo_csat, h.csat) — classic first, then
--     Ziwo/Genesys, then the 5-star feed.
--     `csat_attr` / `dsat_attr` are NOT the verdict. They are an attribution
--     WEIGHT (csat_attr can be 2 = "Resolved compromised ticket → double CSAT").
--     Reading them as good/bad inverts the metric: Jul-2026 came out 38.2%
--     against a true 73.3%.
--
--  2. ROW FILTER = (csat_attr != 0 AND csat='good') OR (dsat_attr != 0 AND
--     csat='bad') OR ziwo_csat IS NOT NULL OR h.csat_rating IS NOT NULL.
--     The attr must be non-zero for the classic surveys; the verdict still
--     comes from `csat`.
--
--  3. is_resolver = 1 means `resolver = assignee` — a DERIVED flag, not a
--     column. This is Hossam's "count CSAT only if resolver equals 1".
--     (Note: card 4426's {{resolver}} parameter actually filters on `assignee`,
--     not `resolver`. With is_resolver=1 the two are equal so it is moot here,
--     but the parameter is misleadingly named.)
--
--  4. h.csat_rating != 3 — neutral (3-star) excluded. The card does this itself.
--
--  5. is_csat_to_remove IS NULL OR = FALSE — the real exclusion flag, and it
--     lives in card 4426's OUTER select, not the `final` CTE. Omitting it left
--     146 five-star rows in August that should have been 1, which read as a
--     ramping 5-star feed. It was a bug, not a trend. DO NOT DROP THIS LINE.
--     (`remove_csat` on the base table is deliberately NOT filtered — the card
--     only labels it 'REMOVED'.)
--
--  6. DISTINCT on ticket_id — the star join can otherwise double-count.
--
-- STARS: Hossam's rule is 4–5 good, 1–2 bad, 3 excluded. The stored h.csat label
-- contradicts that on 319 rows (137 at 1*, 160 at 2* labelled 'good'; 22 at 3*).
-- Moot in practice: after is_csat_to_remove almost no star rows survive for this
-- roster, and both readings give identical monthly percentages.
--
-- VALIDATION — Jul-2026 = 73.3% (363 good / 132 bad) against Pulse's trusted
-- 73.8%. Aug-2026 = 69.1% (195/87, 32 QAs). Sep-2026 to the 6th = 66.7% (42/21).
-- Spot-check: sara.abdeltwab Aug = 85.7% (6 good / 1 bad, 7 surveys), confirmed
-- by Hossam. Beware sara.abdelraheem@tabby.ai — a different person, not rostered.

WITH roster AS (
  SELECT lp FROM UNNEST([
   'abdallah.ashraf','abdelrahman.osama','abdulrahman.hesham','ahmed.hegazy','ahmed.mostafa','ahmed.sami','ahmed.soliman.6','alaa.elhady.786','amr.salah','arwa.alzahrani.2','asmaa.mohamed','bushra.kaabi','esraa.ibrahim.786','george.amir','hagar.dawood','hesham.mostafa.39','hossam.bahaa','hussam.khaled','kyrillos.malak','lama.alanezi.95','mahmoud.hesham','mariam.gad','marwa.sobhy','mohamed.mamdouh','mohamed.salah','mohammed.aljandal.5','mohammed.faran','mohammed.mohsen','mostafa.sami','muhammad.ramadan','nardeen.wafaey','nourhan.hussien','omar.abdelsamee','omar.fetouh','omar.mohammad','peter.mikhail','pola.emad','rahma.mohamed','rana.salah','reem.mansour','sameh.ahmed','sara.abdeltwab','saud.alasiri','sohaila.adel','tarek.mostafa','youssef.housh','zainab.hasan'
  ]) lp
),
f AS (
  SELECT DISTINCT
    s.ticket_id,
    FORMAT_DATE('%b-%Y', s.resolved_date)              AS mth,
    LOWER(SPLIT(s.assignee,'@')[OFFSET(0)])            AS lp,
    COALESCE(s.csat, s.ziwo_csat, h.csat)              AS csat
  FROM `customer_happiness_datamarts.productivity_karma_csat_rules` s
  LEFT JOIN `customer_happiness_datamarts.helpdesk_refiner_ziwo_tickets_csat` h
         ON s.ticket_id = h.ticket_id
  WHERE s.resolved_date BETWEEN '2026-08-01' AND '2026-09-30'   -- edit window
    AND s.resolver = s.assignee                                  -- is_resolver = 1
    AND LOWER(SPLIT(s.assignee,'@')[OFFSET(0)]) IN (SELECT lp FROM roster)
    AND ((s.csat_attr != 0 AND s.csat = 'good')
      OR (s.dsat_attr != 0 AND s.csat = 'bad')
      OR s.ziwo_csat IS NOT NULL
      OR h.csat_rating IS NOT NULL)
    AND (h.csat_rating IS NULL OR h.csat_rating != 3)
    AND (h.is_csat_to_remove IS NULL OR h.is_csat_to_remove = FALSE)
)
SELECT
  mth, lp,
  COUNTIF(csat = 'good')                                              AS csat_good,
  COUNTIF(csat = 'bad')                                               AS csat_bad,
  COUNTIF(csat IN ('good','bad'))                                     AS csat_total,
  ROUND(SAFE_DIVIDE(COUNTIF(csat='good'), COUNTIF(csat IN ('good','bad')))*100, 1) AS csat_pct
FROM f
GROUP BY 1,2
HAVING csat_total > 0
ORDER BY mth, csat_pct DESC;
