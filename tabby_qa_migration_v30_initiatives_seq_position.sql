
-- v30: per-row monotonic sequence for human-readable IDs (TRK-42), plus
-- a `position` column so users can reorder cards inside a column on
-- the Tracker board (manual sort opt-in; default still ETA asc).

CREATE SEQUENCE IF NOT EXISTS public.initiatives_seq_seq;

ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS seq INTEGER,
  ADD COLUMN IF NOT EXISTS position NUMERIC;

-- Backfill seq for existing rows in created_at order so the IDs feel
-- chronological. Then make seq NOT NULL with the sequence as default.
UPDATE public.initiatives
SET seq = ranked.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.initiatives
  WHERE seq IS NULL
) ranked
WHERE public.initiatives.id = ranked.id;

-- Advance the sequence past whatever max we just backfilled.
SELECT setval(
  'public.initiatives_seq_seq',
  GREATEST(COALESCE((SELECT MAX(seq) FROM public.initiatives), 0), 1),
  true
);

ALTER TABLE public.initiatives
  ALTER COLUMN seq SET DEFAULT nextval('public.initiatives_seq_seq'),
  ALTER COLUMN seq SET NOT NULL;

-- Backfill `position` so existing rows keep their current ETA-based
-- order under the new manual-sort mode. Position is a sparse numeric
-- (gap = 1024) so we can insert between two neighbours without
-- renumbering the whole column.
UPDATE public.initiatives
SET position = ranked.pos
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY status
    ORDER BY eta_date NULLS LAST, created_at
  ) * 1024 AS pos
  FROM public.initiatives
  WHERE position IS NULL
) ranked
WHERE public.initiatives.id = ranked.id;

CREATE INDEX IF NOT EXISTS initiatives_seq_idx      ON public.initiatives (seq);
CREATE INDEX IF NOT EXISTS initiatives_position_idx ON public.initiatives (status, position);

COMMENT ON COLUMN public.initiatives.seq      IS 'Monotonic per-row sequence used for the public TRK-{n} reference.';
COMMENT ON COLUMN public.initiatives.position IS 'Sparse numeric used by the Board manual-sort mode. Lower = closer to the top of the column.';
