-- v40: User-feedback surveys (app rating + free-text feedback)
--
-- One-active-at-a-time mandatory survey blocking the UI until the
-- user submits their rating. Admins create surveys at /admin/surveys
-- and view per-survey results (avg rating, distribution, comments).
--
-- Schema:
--   surveys           — parent (admin writes only)
--   survey_responses  — one row per (survey, user); user writes own,
--                       admins read all
--
-- Trigger: activating a new survey auto-deactivates any other active
-- survey, so users never see stacked modals.

CREATE TABLE IF NOT EXISTS public.surveys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  intro_message text,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  is_active     boolean NOT NULL DEFAULT true,
  expires_at    timestamptz,
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS surveys_active_idx
  ON public.surveys(is_active, expires_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_email   text NOT NULL,
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback     text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(survey_id, user_email)
);

CREATE INDEX IF NOT EXISTS survey_responses_survey_idx
  ON public.survey_responses(survey_id);

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- ── surveys policies ──────────────────────────────────────────────
CREATE POLICY surveys_read_all
  ON public.surveys FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY surveys_admin_write
  ON public.surveys FOR ALL
  TO authenticated
  USING (public.has_role_or_above('admin'::user_role))
  WITH CHECK (public.has_role_or_above('admin'::user_role));

-- ── survey_responses policies ─────────────────────────────────────
CREATE POLICY survey_responses_insert_self
  ON public.survey_responses FOR INSERT
  TO authenticated
  WITH CHECK (lower(user_email) = lower(public.get_my_email()));

CREATE POLICY survey_responses_read_self
  ON public.survey_responses FOR SELECT
  TO authenticated
  USING (lower(user_email) = lower(public.get_my_email()));

CREATE POLICY survey_responses_admin_read
  ON public.survey_responses FOR SELECT
  TO authenticated
  USING (public.has_role_or_above('admin'::user_role));

-- ── trigger: one-active-survey-at-a-time ──────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_previous_active_surveys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.surveys
     SET is_active = false
   WHERE id <> NEW.id
     AND is_active = true
     AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deactivate_previous_active_surveys ON public.surveys;
CREATE TRIGGER trg_deactivate_previous_active_surveys
  BEFORE INSERT OR UPDATE OF is_active ON public.surveys
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.deactivate_previous_active_surveys();
