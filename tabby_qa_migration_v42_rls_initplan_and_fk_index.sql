-- ── v42_rls_initplan_and_fk_index ─────────────────────────────────
-- Performance-advisor follow-ups, verified against the LIVE database.
--
-- Context: the indexes and the dam_flags / coaching_violations RLS
-- re-wrapping that an offline read of the repo migrations suggested were
-- "missing" already exist in production (daily_scores.date,
-- coaching_sessions.qa_email, mtd_scores.month/qa_email, and the live
-- dam_flags_select / cv_select policies already wrap auth.uid() in a
-- sub-select). Those are intentionally left untouched here.
--
-- What the live advisor actually flags:
--   1. auth_rls_initplan — csat_population (2 policies) and
--      csat_quartile_cutoffs (1 policy) call auth.uid() raw, so Postgres
--      re-evaluates it per row. csat_population is ~3k rows, so this is a
--      genuine scan-time win. Fix = wrap as (select auth.uid()); the
--      boolean result is identical, it's just evaluated once per query.
--   2. unindexed_foreign_keys — coaching_violations.dam_flag_id had no
--      covering index.

-- 1a. csat_population — admin write (FOR ALL)
DROP POLICY IF EXISTS "csat_population admin write" ON public.csat_population;
CREATE POLICY "csat_population admin write" ON public.csat_population
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = ANY (ARRAY['admin'::user_role,'super_admin'::user_role,'manager'::user_role,'hod'::user_role])
    )
  );

-- 1b. csat_population — read for staff (FOR SELECT)
DROP POLICY IF EXISTS "csat_population read for staff" ON public.csat_population;
CREATE POLICY "csat_population read for staff" ON public.csat_population
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = ANY (ARRAY['qa'::user_role,'qa_lead'::user_role,'qa_supervisor'::user_role,'senior_qa'::user_role,'auditor'::user_role,'admin'::user_role,'super_admin'::user_role,'manager'::user_role,'hod'::user_role])
    )
  );

-- 1c. csat_quartile_cutoffs — read staff (FOR SELECT)
DROP POLICY IF EXISTS "cutoffs read staff" ON public.csat_quartile_cutoffs;
CREATE POLICY "cutoffs read staff" ON public.csat_quartile_cutoffs
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = ANY (ARRAY['qa'::user_role,'qa_lead'::user_role,'qa_supervisor'::user_role,'senior_qa'::user_role,'auditor'::user_role,'admin'::user_role,'super_admin'::user_role,'manager'::user_role,'hod'::user_role])
    )
  );

-- 2. Covering index for the coaching_violations.dam_flag_id foreign key.
CREATE INDEX IF NOT EXISTS idx_coaching_violations_dam_flag_id
  ON public.coaching_violations (dam_flag_id);
