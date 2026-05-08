
-- v29: initiatives — backing table for the new /tracker page (Phase 1).
-- Gated to senior_qa+ via RLS. Edit scope is creator + assignee + admin
-- (per Hossam's call); anyone in scope can create new ones.

CREATE TABLE IF NOT EXISTS public.initiatives (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'Not started'
              CHECK (status IN ('Not started', 'In progress', 'Done')),
  priority    text CHECK (priority IS NULL OR priority IN ('High', 'Medium', 'Low')),
  team        text[] NOT NULL DEFAULT ARRAY[]::text[],
  task_type   text[] NOT NULL DEFAULT ARRAY[]::text[],
  assigned_to text,
  created_by  text NOT NULL,
  start_date  date,
  eta_date    date,
  parent_id   uuid REFERENCES public.initiatives(id) ON DELETE SET NULL,
  links       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS initiatives_status_idx     ON public.initiatives (status);
CREATE INDEX IF NOT EXISTS initiatives_assigned_idx   ON public.initiatives (assigned_to);
CREATE INDEX IF NOT EXISTS initiatives_created_by_idx ON public.initiatives (created_by);
CREATE INDEX IF NOT EXISTS initiatives_parent_idx     ON public.initiatives (parent_id);
CREATE INDEX IF NOT EXISTS initiatives_eta_idx        ON public.initiatives (eta_date);

CREATE OR REPLACE FUNCTION public.initiatives_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'Done' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'Done') THEN
    NEW.completed_at = COALESCE(NEW.completed_at, now());
  ELSIF NEW.status <> 'Done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS initiatives_updated_at ON public.initiatives;
CREATE TRIGGER initiatives_updated_at
  BEFORE UPDATE ON public.initiatives
  FOR EACH ROW EXECUTE FUNCTION public.initiatives_set_updated_at();

DROP TRIGGER IF EXISTS initiatives_set_completed ON public.initiatives;
CREATE TRIGGER initiatives_set_completed
  BEFORE INSERT OR UPDATE OF status ON public.initiatives
  FOR EACH ROW EXECUTE FUNCTION public.initiatives_set_updated_at();

ALTER TABLE public.initiatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS initiatives_select ON public.initiatives;
CREATE POLICY initiatives_select ON public.initiatives
  FOR SELECT TO authenticated
  USING (has_role_or_above('senior_qa'::user_role));

DROP POLICY IF EXISTS initiatives_insert ON public.initiatives;
CREATE POLICY initiatives_insert ON public.initiatives
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role_or_above('senior_qa'::user_role)
    AND created_by = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- Update / delete: creator OR assignee OR admin+. Email check uses
-- profiles.email of the current auth user, matching how every other
-- policy in this codebase resolves "the calling user's email".
DROP POLICY IF EXISTS initiatives_update ON public.initiatives;
CREATE POLICY initiatives_update ON public.initiatives
  FOR UPDATE TO authenticated
  USING (
    has_role_or_above('admin'::user_role)
    OR created_by  = (SELECT email FROM public.profiles WHERE id = auth.uid())
    OR assigned_to = (SELECT email FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    has_role_or_above('admin'::user_role)
    OR created_by  = (SELECT email FROM public.profiles WHERE id = auth.uid())
    OR assigned_to = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS initiatives_delete ON public.initiatives;
CREATE POLICY initiatives_delete ON public.initiatives
  FOR DELETE TO authenticated
  USING (
    has_role_or_above('admin'::user_role)
    OR created_by = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.initiatives TO authenticated;

COMMENT ON TABLE public.initiatives IS 'Unit-level work-tracker items (Tracker page). Distinct from per-QA tasks. Visible to senior_qa+; edits scoped to creator+assignee+admin.';
