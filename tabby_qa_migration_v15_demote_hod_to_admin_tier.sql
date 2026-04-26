-- ── v15_demote_hod_to_admin_tier ──────────────────────────────────
-- HOD (Imad) was placed at the super_admin tier (level 5) in v14b.
-- Per org direction it should sit at the admin tier (level 4) — same
-- numeric level as admin / manager. Imad keeps full admin powers but
-- no longer passes has_role_or_above('super_admin').
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
    WHEN 'hod'            THEN 4
    WHEN 'super_admin'    THEN 5
    ELSE 0
  END;
$$;
