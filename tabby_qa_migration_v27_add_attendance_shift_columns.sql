
-- Per-day shift assignment on qa_attendance. Set by a lead (currently
-- gated to super_admin in the UI for preview/QA), shown inline on the
-- schedule cell. Times are stored as TIME (no timezone) and are
-- interpreted as Riyadh local time, matching every other time field
-- in the QA portal.
ALTER TABLE qa_attendance
  ADD COLUMN IF NOT EXISTS shift_start TIME,
  ADD COLUMN IF NOT EXISTS shift_end   TIME;

COMMENT ON COLUMN qa_attendance.shift_start IS 'Lead-assigned shift start time (Riyadh, HH:MM). Optional.';
COMMENT ON COLUMN qa_attendance.shift_end   IS 'Lead-assigned shift end time (Riyadh, HH:MM). Optional.';
