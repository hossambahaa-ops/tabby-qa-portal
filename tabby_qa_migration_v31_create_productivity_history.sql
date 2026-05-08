
-- v31: per-day productivity history feeding QA Profile → Monthly
-- performance daily breakdown. Source is the new "Productivity_History"
-- Google Sheet (gid=985341354). Today's snapshot stays in daily_scores
-- (replaces today's row each day); this table accumulates day by day.

CREATE TABLE IF NOT EXISTS public.productivity_history (
  date              date    NOT NULL,
  qa_email          text    NOT NULL,
  sbs               integer NOT NULL DEFAULT 0,
  non_sbs           integer NOT NULL DEFAULT 0,
  coaching_sessions integer NOT NULL DEFAULT 0,
  side_task_minutes integer NOT NULL DEFAULT 0,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, qa_email)
);

CREATE INDEX IF NOT EXISTS productivity_history_email_date_idx
  ON public.productivity_history (qa_email, date DESC);
CREATE INDEX IF NOT EXISTS productivity_history_date_idx
  ON public.productivity_history (date);

ALTER TABLE public.productivity_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS productivity_history_select ON public.productivity_history;
CREATE POLICY productivity_history_select ON public.productivity_history
  FOR SELECT TO authenticated
  USING (
    -- Same scoping as daily_scores: a QA can see their own; lead+ can
    -- see their team's; supervisor+ can see their domain; admin sees all.
    qa_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    OR has_role_or_above('admin'::user_role)
    OR (
      has_role_or_above('qa_supervisor'::user_role)
      AND qa_email LIKE '%@' || (
        SELECT operational_domain::text FROM public.profiles WHERE id = auth.uid()
      )
    )
    OR (
      has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM public.qa_roster r
        WHERE r.email = qa_email
          AND r.manager_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

-- Writes only via service role (the edge function uses it).
DROP POLICY IF EXISTS productivity_history_no_user_writes ON public.productivity_history;
CREATE POLICY productivity_history_no_user_writes ON public.productivity_history
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

GRANT SELECT ON public.productivity_history TO authenticated;

COMMENT ON TABLE public.productivity_history IS
  'Daily SBS / Non-SBS / Coaching / Side-task history per QA. Sourced from the Productivity_History Google Sheet (gid=985341354). Drives the QA Profile Monthly performance daily breakdown.';
