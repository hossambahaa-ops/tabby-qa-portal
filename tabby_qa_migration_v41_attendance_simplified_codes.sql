-- v41: Simplified attendance picker
--
-- From 2026-06-01, the QA-facing picker shows only 6 options:
--   P, H, CDO, PH, OFF, Leave
--
-- Legacy codes (AL, Paid SL, ML, UL, EL, L, Tabby Day, NSNC, X)
-- remain valid in the table so historical data stays intact and
-- the auto-NSNC cron + payroll exports keep working. The frontend
-- just stops offering them in the dropdown after June 1.
--
-- This migration adds the new umbrella code "Leave" to the CHECK
-- constraint and is the only DB change needed for the rollout.

ALTER TABLE public.qa_attendance
  DROP CONSTRAINT IF EXISTS qa_attendance_status_check;

ALTER TABLE public.qa_attendance
  ADD CONSTRAINT qa_attendance_status_check
  CHECK (status IS NULL OR status = ANY (ARRAY[
    -- New simplified set (used from 2026-06-01 onwards)
    'Leave',
    -- Existing codes — still allowed so legacy rows + auto-NSNC keep working
    'P', 'H', 'OT', 'L', 'PH', 'EL', 'AL',
    'Paid SL', 'ML', 'UL', 'NSNC', 'OFF', 'X',
    'CDO', 'Tabby Day'
  ]));
