-- Add CDO and Tabby Day to the allowed status values. The frontend
-- has shown both as picker options for a while, but the table-level
-- CHECK constraint silently rejected them — surfacing as a generic
-- "Something went wrong" toast for QAs who tried to use them.
ALTER TABLE qa_attendance
  DROP CONSTRAINT IF EXISTS qa_attendance_status_check;

ALTER TABLE qa_attendance
  ADD CONSTRAINT qa_attendance_status_check
  CHECK (status = ANY (ARRAY[
    'P', 'H', 'OT', 'L', 'PH', 'EL', 'AL',
    'Paid SL', 'ML', 'UL', 'NSNC', 'OFF', 'X',
    'CDO', 'Tabby Day'
  ]));
