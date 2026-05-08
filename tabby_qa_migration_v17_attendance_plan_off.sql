-- Allow 'OFF' as a third planned_code value so leads can explicitly
-- mark planned off-days (distinct from "no plan set" / NULL).
ALTER TABLE qa_attendance
  DROP CONSTRAINT IF EXISTS qa_attendance_planned_code_check;

ALTER TABLE qa_attendance
  ADD CONSTRAINT qa_attendance_planned_code_check
  CHECK (planned_code IS NULL OR planned_code IN ('H', 'P', 'OFF'));
