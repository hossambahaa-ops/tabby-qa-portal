-- ═══════════════════════════════════════════════════════════════════
-- v12: CSAT SURVEY COUNT + PER-TOPIC BREAKDOWN
-- Current CSAT pipeline stores only the monthly average (avg_csat_score)
-- and a daily score (csat_score). This migration adds:
--   1. Survey counts (daily + monthly rollup) so "CSAT% (N surveys)" can
--      be shown without divining it.
--   2. csat_by_topic — one row per QA / month / topic. Imported from the
--      external survey system (same path that already writes avg_csat_score).
--
-- Schema only. Data populated externally.
-- Not folded into MTD final_performance scoring.
-- ═══════════════════════════════════════════════════════════════════

-- ── Daily survey count ──────────────────────────────────────────────
ALTER TABLE daily_scores
  ADD COLUMN IF NOT EXISTS surveys_count integer DEFAULT 0;

COMMENT ON COLUMN daily_scores.surveys_count IS 'Number of CSAT surveys received that day.';

-- ── Monthly survey total ────────────────────────────────────────────
ALTER TABLE mtd_scores
  ADD COLUMN IF NOT EXISTS total_surveys integer DEFAULT 0;

COMMENT ON COLUMN mtd_scores.total_surveys IS 'Total CSAT surveys received across the month.';

-- ── Per-topic breakdown ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS csat_by_topic (
  id             bigserial PRIMARY KEY,
  qa_email       text      NOT NULL,
  month          date      NOT NULL,
  topic          text      NOT NULL,
  csat_score     numeric(5,2),
  surveys_count  integer   DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qa_email, month, topic)
);

COMMENT ON TABLE  csat_by_topic IS 'Per-topic CSAT breakdown for a QA within a month. Drives the expandable rows in the MTD CSAT table.';
COMMENT ON COLUMN csat_by_topic.month IS 'First day of the month (YYYY-MM-01).';
COMMENT ON COLUMN csat_by_topic.topic IS 'Free-form topic label sent by the import (e.g. "Refunds", "Shipping").';

CREATE INDEX IF NOT EXISTS csat_by_topic_qa_month_idx ON csat_by_topic (qa_email, month);
CREATE INDEX IF NOT EXISTS csat_by_topic_month_idx    ON csat_by_topic (month);

CREATE TRIGGER csat_by_topic_set_updated_at
  BEFORE UPDATE ON csat_by_topic
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- ── RLS ─────────────────────────────────────────────────────────────
-- Read scoping mirrors mtd_scores / dam_flags: self, lead-over-team via
-- qa_roster.manager_email, supervisor-over-domain, admin+ everywhere.
-- Writes are admin-only; the external import uses the service_role key
-- which bypasses RLS.

ALTER TABLE csat_by_topic ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csat_by_topic_select ON csat_by_topic;
CREATE POLICY csat_by_topic_select ON csat_by_topic
  FOR SELECT TO authenticated
  USING (
    qa_email = get_my_email()
    OR has_role_or_above('admin'::user_role)
    OR (
      has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM qa_roster r
        WHERE r.email = csat_by_topic.qa_email
          AND r.manager_email = get_my_email()
      )
    )
    OR (
      has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND csat_by_topic.qa_email LIKE '%@' || p.operational_domain::text
      )
    )
  );

DROP POLICY IF EXISTS csat_by_topic_insert ON csat_by_topic;
CREATE POLICY csat_by_topic_insert ON csat_by_topic
  FOR INSERT TO authenticated
  WITH CHECK (has_role_or_above('admin'::user_role));

DROP POLICY IF EXISTS csat_by_topic_update ON csat_by_topic;
CREATE POLICY csat_by_topic_update ON csat_by_topic
  FOR UPDATE TO authenticated
  USING (has_role_or_above('admin'::user_role))
  WITH CHECK (has_role_or_above('admin'::user_role));

DROP POLICY IF EXISTS csat_by_topic_delete ON csat_by_topic;
CREATE POLICY csat_by_topic_delete ON csat_by_topic
  FOR DELETE TO authenticated
  USING (has_role_or_above('admin'::user_role));
