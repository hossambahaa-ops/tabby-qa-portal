-- ═══════════════════════════════════════════════════════════════════
-- TICKET HANDLING METRICS
-- QAs handle tickets ~1 day per week. On those days the other KPIs
-- (SBS / Non-SBS / coaching / side tasks) are not logged — login hours
-- feeds into occupancy exactly like side_task_minutes.
--
-- Schema only. Data populated externally (Apps Script / manual entry).
-- Not yet included in MTD final_performance scoring.
-- ═══════════════════════════════════════════════════════════════════

-- ── Per-day columns ─────────────────────────────────────────────────
ALTER TABLE daily_scores
  ADD COLUMN IF NOT EXISTS login_hours      numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS csat_score       numeric(5,2),
  ADD COLUMN IF NOT EXISTS tickets_handled  integer      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apt              numeric(8,2),
  ADD COLUMN IF NOT EXISTS agpt             numeric(8,2);

COMMENT ON COLUMN daily_scores.login_hours     IS 'Hours logged in handling tickets that day. Treated like side_task_minutes in occupancy calc.';
COMMENT ON COLUMN daily_scores.csat_score      IS 'Customer satisfaction percentage for the day.';
COMMENT ON COLUMN daily_scores.tickets_handled IS 'Total tickets handled that day. Productivity is derived: tickets_handled / login_hours.';
COMMENT ON COLUMN daily_scores.apt             IS 'Average Basket Time, minutes per ticket.';
COMMENT ON COLUMN daily_scores.agpt            IS 'Average Group Basket Time, minutes per grouped session.';

-- ── Monthly rollup columns ──────────────────────────────────────────
ALTER TABLE mtd_scores
  ADD COLUMN IF NOT EXISTS total_login_hours      numeric(7,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_csat_score         numeric(5,2),
  ADD COLUMN IF NOT EXISTS total_tickets_handled  integer      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_apt                numeric(8,2),
  ADD COLUMN IF NOT EXISTS avg_agpt               numeric(8,2);

COMMENT ON COLUMN mtd_scores.total_login_hours     IS 'Sum of daily login_hours for the month.';
COMMENT ON COLUMN mtd_scores.avg_csat_score        IS 'Average of daily csat_score across ticket days.';
COMMENT ON COLUMN mtd_scores.total_tickets_handled IS 'Sum of daily tickets_handled.';
COMMENT ON COLUMN mtd_scores.avg_apt               IS 'Average of daily APT across ticket days.';
COMMENT ON COLUMN mtd_scores.avg_agpt              IS 'Average of daily AGPT across ticket days.';
