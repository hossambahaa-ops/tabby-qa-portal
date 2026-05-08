-- v39: Coaching session acknowledgements + supervisor observation columns.
--
-- Closes the loop on outgoing coaching emails: the QA receiving the
-- email clicks an ack link, opens the portal, the route writes a row
-- here. CoachingHistory then renders ✓ / ⏳ per session.
--
-- Also adds the columns the supervisor observation cycle uses to rate
-- the lead's coaching quality from the QA's perspective: Empathy,
-- Clarity, Specificity (1–5 each) plus a free-text note. Stored on
-- coaching_sessions directly because there's at most one observation
-- per session.

CREATE TABLE IF NOT EXISTS coaching_session_acks (
  session_id   uuid PRIMARY KEY REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  member_email text NOT NULL,
  acked_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coaching_session_acks ENABLE ROW LEVEL SECURITY;

CREATE POLICY coaching_session_acks_read
  ON coaching_session_acks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY coaching_session_acks_insert_self
  ON coaching_session_acks FOR INSERT
  TO authenticated
  WITH CHECK (lower(member_email) = lower(get_my_email()));

ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS observation_empathy     smallint,
  ADD COLUMN IF NOT EXISTS observation_clarity     smallint,
  ADD COLUMN IF NOT EXISTS observation_specificity smallint,
  ADD COLUMN IF NOT EXISTS observation_note        text,
  ADD COLUMN IF NOT EXISTS observed_by             text,
  ADD COLUMN IF NOT EXISTS observed_at             timestamptz;
