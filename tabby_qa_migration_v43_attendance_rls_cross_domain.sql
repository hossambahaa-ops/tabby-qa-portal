-- ── v43_attendance_rls_cross_domain ───────────────────────────────
-- Leads and supervisors could not SEE some of their team's attendance
-- on the calendar, even though the data exists. Root cause: the
-- qa_attendance SELECT policy scoped leads/supervisors with EXACT email
-- matches, which break for QAs referenced by both @tabby.ai and
-- @tabby.sa aliases:
--
--   * Lead branch matched `qa_roster.email = qa_attendance.email`. When a
--     QA's roster row uses one alias (e.g. ahmed.soliman.6@tabby.ai) but
--     their attendance rows carry the other (…@tabby.sa), the lead's read
--     was blocked. Admins read everything, so the rows were visible to
--     admins only — exactly the reported symptom.
--   * Supervisor branch matched `email LIKE '%@'||operational_domain`,
--     which fails for a QA whose attendance email domain differs from the
--     supervisor's domain (e.g. ahmed.mostafa@tabby.sa under an
--     @tabby.ai lead/supervisor).
--
-- Fix: bridge the aliases with public.same_tabby_user() (the same helper
-- the dam_flags / coaching_violations policies use). The lead branch now
-- matches a team QA across either alias; the supervisor branch keeps its
-- original domain check AND additionally grants read when the QA (matched
-- cross-domain in the roster) reports to a lead in the supervisor's
-- domain. Own-attendance and admin branches are unchanged. Purely
-- widens read scope within the existing team/domain intent — no one
-- loses access.

DROP POLICY IF EXISTS attendance_select ON public.qa_attendance;

CREATE POLICY attendance_select ON public.qa_attendance
  FOR SELECT TO authenticated
  USING (
    email = (SELECT public.get_my_email())
    OR (SELECT public.has_role_or_above('admin'::user_role))
    OR (
      (SELECT public.has_role_or_above('qa_lead'::user_role))
      AND EXISTS (
        SELECT 1 FROM public.qa_roster r
        WHERE public.same_tabby_user(r.email, qa_attendance.email)
          AND public.same_tabby_user(r.manager_email, (SELECT public.get_my_email()))
      )
    )
    OR (
      (SELECT public.has_role_or_above('qa_supervisor'::user_role))
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND (
            qa_attendance.email LIKE ('%@' || p.operational_domain::text)
            OR EXISTS (
              SELECT 1 FROM public.qa_roster r2
              WHERE public.same_tabby_user(r2.email, qa_attendance.email)
                AND r2.manager_email LIKE ('%@' || p.operational_domain::text)
            )
          )
      )
    )
  );
