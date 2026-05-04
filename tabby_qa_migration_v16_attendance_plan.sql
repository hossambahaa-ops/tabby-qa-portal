-- Tabby Pulse — Migration v16
-- Attendance plan + mismatch flagging.
--
-- Adds a planning layer on top of qa_attendance:
--   planned_code        'H' or 'P' — set by qa_lead+ ahead of time
--   justification       optional QA explanation when actual ≠ planned
--   mismatch_approved   lead clicks Approve → suppresses the flag
--   plan_updated_at     bumped automatically when planned_code changes
--
-- Existing `status` column remains the actual attendance code (what
-- the QA checked in as, or what an admin set retroactively).
--
-- Plan flagging is purely a derived/UI concern — no triggers fire
-- alerts; the frontend computes mismatches from these fields.
--
-- Plans only meaningful from May 2026 onward (frontend gates the editor).

BEGIN;

ALTER TABLE qa_attendance
  ADD COLUMN IF NOT EXISTS planned_code text
    CHECK (planned_code IS NULL OR planned_code IN ('H','P')),
  ADD COLUMN IF NOT EXISTS justification text,
  ADD COLUMN IF NOT EXISTS mismatch_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;

-- Trigger: stamp plan_updated_at whenever planned_code is mutated, so
-- the frontend can derive "QA has unseen plan changes" without an
-- event log.
CREATE OR REPLACE FUNCTION qa_attendance_set_plan_updated_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.planned_code IS DISTINCT FROM OLD.planned_code THEN
    NEW.plan_updated_at = now();
    -- Re-open any prior approval since the plan has changed
    NEW.mismatch_approved = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS qa_attendance_plan_updated_at ON qa_attendance;
CREATE TRIGGER qa_attendance_plan_updated_at
BEFORE UPDATE ON qa_attendance
FOR EACH ROW
EXECUTE FUNCTION qa_attendance_set_plan_updated_at();

-- For freshly-inserted rows, also seed plan_updated_at so the QA
-- gets the "plan published" notification on initial save.
CREATE OR REPLACE FUNCTION qa_attendance_seed_plan_updated_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.planned_code IS NOT NULL AND NEW.plan_updated_at IS NULL THEN
    NEW.plan_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS qa_attendance_plan_seed ON qa_attendance;
CREATE TRIGGER qa_attendance_plan_seed
BEFORE INSERT ON qa_attendance
FOR EACH ROW
EXECUTE FUNCTION qa_attendance_seed_plan_updated_at();

-- Partial index supports "show me all planned days for date X" type
-- queries used by the lead-team view and notification bell.
CREATE INDEX IF NOT EXISTS qa_attendance_planned_idx
  ON qa_attendance (date, email)
  WHERE planned_code IS NOT NULL;

COMMIT;
