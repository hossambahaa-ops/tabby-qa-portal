-- ── v13_lead_scope_cross_domain_emails ────────────────────────────
-- Tabby users are mirrored across @tabby.ai and @tabby.sa; the same
-- person can be referenced by either alias. The lead-scoped RLS
-- policies on dam_flags and coaching_violations were doing exact
-- email matches against qa_roster, which fails when a violation
-- references @tabby.ai but the roster row uses @tabby.sa (or vice
-- versa). The INSERT into dam_flags succeeds, but the read-back via
-- Prefer: return=representation fails the SELECT policy and the
-- client surfaces it as "You don't have permission for this action".

-- Helper: matches if two emails are the same user, treating the
-- @tabby.ai / @tabby.sa pair as equivalent (local-part comparison).
CREATE OR REPLACE FUNCTION public.same_tabby_user(a text, b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    a IS NOT NULL AND b IS NOT NULL AND (
      lower(a) = lower(b)
      OR (
        lower(split_part(a, '@', 1)) = lower(split_part(b, '@', 1))
        AND lower(split_part(a, '@', 2)) IN ('tabby.ai', 'tabby.sa')
        AND lower(split_part(b, '@', 2)) IN ('tabby.ai', 'tabby.sa')
      )
    );
$$;

-- ── dam_flags_select ──
DROP POLICY IF EXISTS dam_flags_select ON dam_flags;

CREATE POLICY dam_flags_select ON dam_flags
  FOR SELECT TO authenticated
  USING (
    public.same_tabby_user(qa_email, public.get_my_email())
    OR public.has_role_or_above('admin'::user_role)
    OR (
      public.has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM public.qa_roster r
        WHERE public.same_tabby_user(r.email, dam_flags.qa_email)
          AND r.manager_email = public.get_my_email()
      )
    )
    OR (
      public.has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND dam_flags.qa_email LIKE '%@' || p.operational_domain::text
      )
    )
  );

-- ── coaching_violations_select ──
-- Widen the qa_lead branch the same way: a lead should match a
-- violation whose qa_emails references their reportee via either
-- domain alias. The exact-email ILIKE branch is kept for back-compat;
-- the two split_part branches catch cross-domain references.
DROP POLICY IF EXISTS cv_select ON coaching_violations;

CREATE POLICY cv_select ON coaching_violations
  FOR SELECT TO authenticated
  USING (
    public.has_role_or_above('admin'::user_role)
    OR lead_email = public.get_my_email()
    OR (
      public.has_role_or_above('qa_lead'::user_role)
      AND EXISTS (
        SELECT 1 FROM public.qa_roster r
        WHERE r.manager_email = public.get_my_email()
          AND (
            coaching_violations.qa_emails ILIKE '%' || r.email || '%'
            OR coaching_violations.qa_emails ILIKE
                 '%' || split_part(r.email, '@', 1) || '@tabby.ai%'
            OR coaching_violations.qa_emails ILIKE
                 '%' || split_part(r.email, '@', 1) || '@tabby.sa%'
          )
      )
    )
    OR (
      public.has_role_or_above('qa_supervisor'::user_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND coaching_violations.qa_emails ILIKE '%@' || p.operational_domain::text || '%'
      )
    )
  );
