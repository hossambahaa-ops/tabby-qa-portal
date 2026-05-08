-- Auto-convert "planned to work but never checked in" rows to NSNC at
-- 7 PM Riyadh each evening. Lead can change it back via the normal
-- picker; auto_nsnc flag stays as a record so the bell can surface
-- "auto-NSNC applied" entries.

ALTER TABLE qa_attendance
  ADD COLUMN IF NOT EXISTS auto_nsnc boolean NOT NULL DEFAULT false;

-- Function: convert today's missing check-ins (Riyadh today) where the
-- QA was planned H or P but never checked in, into status='NSNC' with
-- auto_nsnc=true. Only operates on today's row so a re-run won't
-- back-rewrite history.
CREATE OR REPLACE FUNCTION auto_nsnc_missing_checkins()
RETURNS integer AS $$
DECLARE
  affected integer := 0;
  riyadh_today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  UPDATE qa_attendance
  SET status     = 'NSNC',
      auto_nsnc  = true,
      updated_at = now()
  WHERE date = riyadh_today
    AND planned_code IN ('H', 'P')
    AND status IS NULL
    AND date >= '2026-05-01'::date;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: daily at 16:00 UTC = 19:00 (7 PM) Riyadh.
SELECT cron.schedule(
  'auto-nsnc-missing-checkins',
  '0 16 * * *',
  $$ SELECT auto_nsnc_missing_checkins(); $$
);
