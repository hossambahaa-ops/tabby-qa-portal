-- v36: Ingest the new BigQuery output column from the user's updated MTD SQL.
-- The legacy ontime_coaching_pct uses an eval-based denominator (which is 0
-- early in the month, producing a useless 0%). The new CRM-anchored on-time
-- column uses the coaching-creation-date denominator and gives a meaningful
-- current-month value when the eval-based one isn't yet populated.
ALTER TABLE mtd_scores
  ADD COLUMN IF NOT EXISTS crm_pct_coaching_on_time text;
