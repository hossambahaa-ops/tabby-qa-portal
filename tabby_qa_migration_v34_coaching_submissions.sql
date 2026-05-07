-- v34: Raw coaching submissions feed.
--
-- Replaces the old GAS-fed coaching_violations sheet. The portal now ingests
-- the raw coaching submissions CSV and derives Multiple Days / Multiple Agents /
-- > 3 Uses / > 4 Uses violations server-side via the coaching-submissions-sync
-- edge function. Existing reviewed (valid / invalid / dam_created) rows in
-- coaching_violations are preserved across resyncs; only pending detections
-- are recomputed.

CREATE TABLE IF NOT EXISTS coaching_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL,
  evaluator_email    text NOT NULL,
  qa_team_lead       text,
  agent_email        text,
  ticket_id          text,
  recording_link     text NOT NULL,
  recording_file_id  text NOT NULL,
  team               text,
  coaching_source    text,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluator_email, ticket_id, agent_email, recording_file_id, created_at)
);

CREATE INDEX IF NOT EXISTS coaching_submissions_link_idx
  ON coaching_submissions (evaluator_email, recording_file_id);
CREATE INDEX IF NOT EXISTS coaching_submissions_created_at_idx
  ON coaching_submissions (created_at DESC);

ALTER TABLE coaching_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY coaching_submissions_read
  ON coaching_submissions FOR SELECT
  TO authenticated
  USING (true);
