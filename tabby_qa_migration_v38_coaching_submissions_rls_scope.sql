-- v38: Tighten coaching_submissions read scope.
--
-- v34 shipped with USING (true) so every authenticated user could SELECT every
-- team's raw coaching feed (evaluator_email, agent_email, ticket_id,
-- recording_link). Mirror the coaching_violations.cv_select pattern so
-- submissions are only visible to:
--   - auditor (Rija)
--   - admin / super_admin / manager / hod (has_role_or_above admin)
--   - the evaluator themselves (evaluator_email = get_my_email)
--   - qa_lead+ for QAs they manage (qa_roster.manager_email match)
--   - qa_supervisor+ for QAs in their operational_domain

DROP POLICY IF EXISTS coaching_submissions_read ON coaching_submissions;

CREATE POLICY coaching_submissions_read
  ON coaching_submissions FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT profiles.role FROM profiles WHERE profiles.id = (SELECT auth.uid())) = 'auditor'::user_role
    )
    OR has_role_or_above('admin'::user_role)
    OR (evaluator_email = get_my_email())
    OR (
      has_role_or_above('qa_lead'::user_role) AND EXISTS (
        SELECT 1 FROM qa_roster r
        WHERE r.manager_email = get_my_email()
          AND lower(r.email) = lower(coaching_submissions.evaluator_email)
      )
    )
    OR (
      has_role_or_above('qa_supervisor'::user_role) AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = (SELECT auth.uid())
          AND lower(coaching_submissions.evaluator_email) LIKE ('%@' || p.operational_domain::text || '%')
      )
    )
  );
