-- ── v14b_role_level_for_manager_hod_and_assignments ───────────────
-- Updates role_level() to include the new roles introduced in v14
-- and assigns the two real users.
-- Done in a separate migration because the new enum values added in
-- v14 are not visible inside the same transaction.
CREATE OR REPLACE FUNCTION public.role_level(r user_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE r
    WHEN 'qa'             THEN 1
    WHEN 'senior_qa'      THEN 1
    WHEN 'qa_lead'        THEN 2
    WHEN 'auditor'        THEN 2
    WHEN 'qa_supervisor'  THEN 3
    WHEN 'manager'        THEN 4
    WHEN 'admin'          THEN 4
    WHEN 'hod'            THEN 5
    WHEN 'super_admin'    THEN 5
    ELSE 0
  END;
$$;

UPDATE public.profiles SET role = 'manager'::user_role
  WHERE LOWER(email) = 'amanda.souza@tabby.ai';

UPDATE public.profiles SET role = 'hod'::user_role
  WHERE LOWER(email) = 'imad.moussa@tabby.ai';
