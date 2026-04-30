-- ── v16_saved_views ───────────────────────────────────────────────
-- Per-user "starred" filter combinations for the data-heavy pages
-- (MTD, Leaderboard, CSAT, Utilization, Expertise). One row per
-- (user, page_key, name); the JSONB blob captures the page's full
-- filter state so each page owns its own serialise/deserialise.
--
-- is_default = the view auto-applied when the user lands on the page
-- with no URL params. Only one default per (user, page_key) — enforced
-- by a partial unique index, not the application — so a stale client
-- can't end up with two defaults silently.
--
-- RLS: every user sees / writes only their own rows. No cross-user
-- visibility — saved views are private bookmarks, not shared dashboards.

CREATE TABLE IF NOT EXISTS public.saved_views (
  id          bigserial   PRIMARY KEY,
  user_email  text        NOT NULL,
  page_key    text        NOT NULL,
  name        text        NOT NULL,
  filters     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, page_key, name)
);

COMMENT ON TABLE  public.saved_views IS 'Per-user named filter snapshots for the analytics pages. Each user reads/writes only their own.';
COMMENT ON COLUMN public.saved_views.page_key  IS 'Identifies the page: mtd | leaderboard | csat | utilization | expertise.';
COMMENT ON COLUMN public.saved_views.filters   IS 'Opaque JSON blob — shape is owned by the page that wrote it.';
COMMENT ON COLUMN public.saved_views.is_default IS 'When true, the view is auto-applied on page load if no URL params override it.';

-- One default per (user, page) — partial unique index (PG can't express
-- this as a table-level constraint).
CREATE UNIQUE INDEX IF NOT EXISTS saved_views_one_default_per_page
  ON public.saved_views (user_email, page_key)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS saved_views_user_page_idx
  ON public.saved_views (user_email, page_key);

CREATE TRIGGER saved_views_set_updated_at
  BEFORE UPDATE ON public.saved_views
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sv_select ON public.saved_views;
CREATE POLICY sv_select ON public.saved_views
  FOR SELECT TO authenticated
  USING (user_email = public.get_my_email());

DROP POLICY IF EXISTS sv_insert ON public.saved_views;
CREATE POLICY sv_insert ON public.saved_views
  FOR INSERT TO authenticated
  WITH CHECK (user_email = public.get_my_email());

DROP POLICY IF EXISTS sv_update ON public.saved_views;
CREATE POLICY sv_update ON public.saved_views
  FOR UPDATE TO authenticated
  USING (user_email = public.get_my_email())
  WITH CHECK (user_email = public.get_my_email());

DROP POLICY IF EXISTS sv_delete ON public.saved_views;
CREATE POLICY sv_delete ON public.saved_views
  FOR DELETE TO authenticated
  USING (user_email = public.get_my_email());
