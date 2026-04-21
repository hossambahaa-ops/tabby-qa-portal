-- ═══════════════════════════════════════════════════════════════════
-- RLS HARDENING
-- Audit found three classes of problem. This migration closes them.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. daily_scores: was writable by any authenticated user ─────────
--    Apps Script syncs these rows via the service_role key (bypasses
--    RLS entirely), so restricting the UI-facing policy to admin+ is
--    safe — no legitimate client path loses access.

DROP POLICY IF EXISTS daily_scores_write ON daily_scores;

CREATE POLICY daily_scores_insert ON daily_scores
  FOR INSERT TO authenticated
  WITH CHECK (has_role_or_above('admin'::user_role));

CREATE POLICY daily_scores_update ON daily_scores
  FOR UPDATE TO authenticated
  USING (has_role_or_above('admin'::user_role))
  WITH CHECK (has_role_or_above('admin'::user_role));

CREATE POLICY daily_scores_delete ON daily_scores
  FOR DELETE TO authenticated
  USING (has_role_or_above('admin'::user_role));

-- ── 2. eval_time_config: global setting, was writable by anyone ─────

DROP POLICY IF EXISTS eval_time_config_write ON eval_time_config;

CREATE POLICY eval_time_config_insert ON eval_time_config
  FOR INSERT TO authenticated
  WITH CHECK (has_role_or_above('admin'::user_role));

CREATE POLICY eval_time_config_update ON eval_time_config
  FOR UPDATE TO authenticated
  USING (has_role_or_above('admin'::user_role))
  WITH CHECK (has_role_or_above('admin'::user_role));

CREATE POLICY eval_time_config_delete ON eval_time_config
  FOR DELETE TO authenticated
  USING (has_role_or_above('admin'::user_role));

-- ── 3. tasks_select: leads couldn't see tasks assigned to their team ──
--    Old policy blocked the new Mine/Team tab for non-admin leads. Expand
--    it: a lead sees tasks whose assignee or creator reports to them
--    (qa_roster.manager_email matches). Supervisors see their whole
--    operational_domain; admins keep the all-access fallback.

DROP POLICY IF EXISTS tasks_select ON tasks;

CREATE POLICY tasks_select ON tasks
  FOR SELECT TO authenticated
  USING (
    created_by = get_my_email()
    OR assigned_to = get_my_email()
    OR has_role_or_above('admin'::user_role)
    -- qa_lead sees tasks for their direct reports
    OR (
      has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM qa_roster r
        WHERE r.email = tasks.assigned_to
          AND r.manager_email = get_my_email()
      )
    )
    -- qa_supervisor sees tasks for their whole operational domain
    OR (
      has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND (
            tasks.assigned_to LIKE '%@' || p.operational_domain::text
            OR tasks.created_by LIKE '%@' || p.operational_domain::text
          )
      )
    )
  );
