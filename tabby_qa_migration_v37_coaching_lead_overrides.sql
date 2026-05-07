-- v37: Lead-email overrides for coaching violations.
--
-- Background. The upstream coaching submissions CSV embeds qa_team_lead, but
-- it's stale for some QAs (e.g. mohamed.mamdouh@tabby.ai is tagged as
-- salma.badawy in the source even though he reports to abdelrahman.shahat).
-- qa_roster has the canonical TL via manager_email, but only covers QAs on
-- the active roster — so we need a third tier for QAs who fall outside it.
--
-- coaching-submissions-sync resolves the lead in this order:
--   1. coaching_lead_overrides (manual pin from admin / this table)
--   2. qa_roster.manager_email (canonical roster TL)
--   3. CSV qa_team_lead         (last resort, may be stale)

CREATE TABLE IF NOT EXISTS coaching_lead_overrides (
  qa_email   text PRIMARY KEY,
  lead_email text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coaching_lead_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY coaching_lead_overrides_read
  ON coaching_lead_overrides FOR SELECT
  TO authenticated
  USING (true);

-- Seed: Mohamed Mamdouh reports to Abdelrahman Shahat.
INSERT INTO coaching_lead_overrides (qa_email, lead_email, note)
VALUES ('mohamed.mamdouh@tabby.ai', 'abdelrahman.shahat@tabby.sa',
        'Source CSV is stale; correct TL per Hossam 2026-05-07')
ON CONFLICT (qa_email) DO UPDATE
  SET lead_email = EXCLUDED.lead_email,
      note       = EXCLUDED.note;
