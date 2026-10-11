-- SAMA tickets, one JSON object per ticket, for LLM / JSON analysis.
--
-- There is NO existing CX report for SAMA complaint tickets. Everything that
-- Metabase surfaces under "SAMA" belongs to Risk/Fraud (risks_imported.*,
-- risks_datamarts.sama_reg_pmt_details) and is a regulatory payments extract,
-- not a complaint. The anchor for complaints is:
--
--     customer_happiness_datamarts.helpdesk_tickets.sama_ticket_id   (STRING)
--
-- Volume as of 2026-10-11: 3,693 tickets / 3,681 distinct SAMA ids, spanning
-- 2026-04-12 .. 2026-10-10; 1,135 of them created since 1 Sep. Almost all are
-- channel = phone, owned by customer_care_unit_regulatory, country KSA.
--
-- ── THE CONVERSATION TEXT IS NOT AVAILABLE ──────────────────────────────────
-- helpdesk_comments.text is SHA-256 hashed in the warehouse. Checked over all
-- 2,184,420 October comments: 2,184,420 hashed, 0 readable, across every
-- channel (chat, email, phone, cx_internal_consultation, internal-chat). This
-- is warehouse-level masking, not a permission we can widen from here.
--
-- The other free-text candidates are dead ends for SAMA too:
--   • description            — constant "Manual call ticket" (542 of 543)
--   • csat_note              — 0 populated on SAMA tickets
--   • csat_agent_review      — 0 populated
--   • csat_issue_resolved_review — 0 populated
--     (SAMA complaints don't go through the CSAT survey at all)
--
-- So "context" here means STRUCTURED context: the full topic taxonomy, the
-- GPT-derived topic/sentiment (which WAS computed from the conversation, and
-- is present on ~51% of rows), the routing and group-handoff shape, and the
-- SLA / escalation / reopen timeline. That is genuinely analyzable. Verbatim
-- customer wording needs the helpdesk source system or a data-privacy
-- exception from the data team — it cannot come from BigQuery.
--
-- Run against Metabase database_id = 1 (BigQuery, tabby-dp).
-- Change the date in `sama` to widen the window.

WITH sama AS (
  SELECT * FROM `customer_happiness_datamarts.helpdesk_tickets`
  WHERE sama_ticket_id IS NOT NULL AND TRIM(sama_ticket_id) NOT IN ('', '-')
    AND date_created_dubai >= '2026-09-01'
),
comment_shape AS (
  -- The thread's SHAPE, since its words are hashed: who touched it, how many
  -- times, how the topic was tagged turn by turn, and the first/last touch.
  SELECT c.ticket_id,
         COUNT(*) AS comment_count,
         COUNT(DISTINCT c.comment_responsible_group) AS groups_involved,
         ARRAY_AGG(DISTINCT c.comment_responsible_group IGNORE NULLS) AS handling_groups,
         ARRAY_AGG(DISTINCT c.comment_topic_1 IGNORE NULLS) AS comment_topics,
         MIN(c.comment_created_at) AS first_comment_at,
         MAX(c.comment_created_at) AS last_comment_at
  FROM `customer_happiness_datamarts.helpdesk_comments` c
  JOIN (SELECT DISTINCT ticket_id FROM sama) s USING (ticket_id)
  GROUP BY c.ticket_id
)
SELECT TO_JSON_STRING(STRUCT(
  s.sama_ticket_id AS sama_id,
  s.ticket_id,
  STRUCT(CAST(s.date_created_dubai AS STRING) AS created,
         CAST(s.date_resolved_dubai AS STRING) AS resolved,
         CAST(s.escalated_at AS STRING) AS escalated_at,
         CAST(cs.first_comment_at AS STRING) AS first_touch,
         CAST(cs.last_comment_at AS STRING) AS last_touch,
         s.grt_escalated_hrs AS hrs_to_escalate,
         s.amount_of_status_escalated AS times_escalated,
         s.amount_of_status_reopens AS times_reopened) AS timeline,
  STRUCT(s.channel, s.status, s.ticket_country AS country,
         s.customer_country, s.responsible_group AS owning_group,
         s.escalated_from, s.resolver, s.resolver_group, s.resolver_country,
         cs.handling_groups, cs.groups_involved) AS routing,
  STRUCT(s.topic_1, s.topic_2, s.topic_3, s.topic_4, s.topic_priority,
         s.gpt_topic_1, s.gpt_topic_2, s.gpt_sentiment,
         cs.comment_topics) AS classification,
  STRUCT(COALESCE(cs.comment_count, 0) AS comment_count,
         s.support_comments_count,
         s.update_requests_from_internal_notes AS internal_update_requests,
         -- Carried in the payload on purpose: an LLM reading these objects
         -- must not infer "no complaint detail" from the absence of text.
         'redacted_sha256_in_warehouse' AS comment_text_note) AS interaction
)) AS ticket_json
FROM sama s
LEFT JOIN comment_shape cs USING (ticket_id)
ORDER BY s.date_created_dubai DESC
