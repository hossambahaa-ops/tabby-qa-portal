-- ═══════════════════════════════════════════════════════════════════
-- Convert profiles.operational_domain from text to domain_enum
-- Verified live data: only "tabby.ai" / "tabby.sa" values exist — no
-- blanks, no typos, no cleanup needed before conversion.
--
-- The domain_enum type already exists in the DB (used by profiles.domain
-- and teams.domain). This just tightens the supervisor-scope column so
-- blank strings and typos become impossible at the schema level.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ALTER COLUMN operational_domain TYPE domain_enum
  USING operational_domain::domain_enum;

-- Supervisor scope relies on this column; make it NOT NULL so future
-- inserts can't silently orphan supervisor queries.
-- (Set a default equal to profile's own domain for safety.)
UPDATE profiles SET operational_domain = domain WHERE operational_domain IS NULL;
ALTER TABLE profiles ALTER COLUMN operational_domain SET NOT NULL;

COMMENT ON COLUMN profiles.operational_domain IS 'Supervisor reporting scope (tabby.ai | tabby.sa). Used by qa_supervisor role for domain-wide visibility.';
