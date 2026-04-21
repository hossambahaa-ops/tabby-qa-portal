-- ═══════════════════════════════════════════════════════════════════
-- LEAD-SCOPED SELECT POLICIES
-- Over-permissive reads surfaced by the RLS audit. Before: any qa_lead+
-- could read every team's coaching sessions / DAM flags / violations /
-- AP dismissals / attendance, not just their own. After: a lead sees
-- only records about their direct reports (resolved via
-- qa_roster.manager_email — the runtime source of truth per scope.js).
-- Supervisors see their operational_domain. Admin/super_admin keep
-- their all-access fallback.
--
-- Auditor-specific policies (*_select_auditor) are left untouched — an
-- auditor role is a deliberate read-everything observer.
-- ═══════════════════════════════════════════════════════════════════

-- ── coaching_sessions ──────────────────────────────────────────────
DROP POLICY IF EXISTS cs_select ON coaching_sessions;

CREATE POLICY cs_select ON coaching_sessions
  FOR SELECT TO authenticated
  USING (
    sender_email = get_my_email()
    OR member_email = get_my_email()
    OR has_role_or_above('admin'::user_role)
    OR (
      has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM qa_roster r
        WHERE r.email = coaching_sessions.member_email
          AND r.manager_email = get_my_email()
      )
    )
    OR (
      has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND coaching_sessions.member_email LIKE '%@' || p.operational_domain::text
      )
    )
  );

-- ── dam_flags ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS dam_flags_select ON dam_flags;

CREATE POLICY dam_flags_select ON dam_flags
  FOR SELECT TO authenticated
  USING (
    qa_email = get_my_email()
    OR has_role_or_above('admin'::user_role)
    OR (
      has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM qa_roster r
        WHERE r.email = dam_flags.qa_email
          AND r.manager_email = get_my_email()
      )
    )
    OR (
      has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND dam_flags.qa_email LIKE '%@' || p.operational_domain::text
      )
    )
  );

-- ── coaching_violations ────────────────────────────────────────────
-- qa_emails is a (regrettable) plural text column — multiple emails
-- concatenated. Has to be string-matched. Row count is small so the
-- ILIKE scan is acceptable; revisit if the column is ever normalized.
DROP POLICY IF EXISTS cv_select ON coaching_violations;

CREATE POLICY cv_select ON coaching_violations
  FOR SELECT TO authenticated
  USING (
    has_role_or_above('admin'::user_role)
    OR lead_email = get_my_email()
    OR (
      has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM qa_roster r
        WHERE coaching_violations.qa_emails ILIKE '%' || r.email || '%'
          AND r.manager_email = get_my_email()
      )
    )
    OR (
      has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND coaching_violations.qa_emails ILIKE '%@' || p.operational_domain::text || '%'
      )
    )
  );

-- ── ap_dismissals ──────────────────────────────────────────────────
DROP POLICY IF EXISTS apd_select ON ap_dismissals;

CREATE POLICY apd_select ON ap_dismissals
  FOR SELECT TO authenticated
  USING (
    has_role_or_above('admin'::user_role)
    OR (
      has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM qa_roster r
        WHERE r.email = ap_dismissals.qa_email
          AND r.manager_email = get_my_email()
      )
    )
    OR (
      has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND ap_dismissals.qa_email LIKE '%@' || p.operational_domain::text
      )
    )
  );

-- ── qa_attendance ──────────────────────────────────────────────────
-- Was fully open to every authenticated user — tightened to own /
-- direct reports / domain / admin+. QAs can still see their own leave
-- history via the email match.
DROP POLICY IF EXISTS attendance_select ON qa_attendance;

CREATE POLICY attendance_select ON qa_attendance
  FOR SELECT TO authenticated
  USING (
    email = get_my_email()
    OR has_role_or_above('admin'::user_role)
    OR (
      has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM qa_roster r
        WHERE r.email = qa_attendance.email
          AND r.manager_email = get_my_email()
      )
    )
    OR (
      has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND qa_attendance.email LIKE '%@' || p.operational_domain::text
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- Known deferred: escalations.submitted_by leaks even when
-- is_anonymous = true. Fixing at the RLS layer requires a view-based
-- approach (PostgreSQL policies filter rows, not columns). Frontend
-- already masks it at render. Acceptable short-term; revisit when we
-- introduce a masked-escalations view.
-- ═══════════════════════════════════════════════════════════════════
