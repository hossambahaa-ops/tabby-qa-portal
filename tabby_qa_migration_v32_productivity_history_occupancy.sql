
-- v32: source CSV gained an Occupancy column on the history feed.
-- Stored as numeric percent (e.g. 51.16 means 51.16 %). NULL means
-- the row predates the column or the source left it blank.
ALTER TABLE public.productivity_history
  ADD COLUMN IF NOT EXISTS occupancy_pct numeric;

COMMENT ON COLUMN public.productivity_history.occupancy_pct IS
  'Occupancy percent for that day, taken from the source CSV (raw, not capped).';
