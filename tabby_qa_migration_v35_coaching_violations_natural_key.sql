-- v35: Natural-key uniqueness for coaching_violations so the new
-- coaching-submissions-sync edge function can ON CONFLICT-style upsert detected
-- violations without duplicating rows.
--
-- (qa_emails, violation_type, coaching_link) is the natural key because the
-- detection logic emits at most one row per (QA, type, link).

ALTER TABLE coaching_violations
  ADD CONSTRAINT coaching_violations_qa_type_link_key
  UNIQUE (qa_emails, violation_type, coaching_link);
