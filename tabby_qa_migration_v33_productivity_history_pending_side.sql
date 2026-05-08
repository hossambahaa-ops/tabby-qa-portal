
-- v33: Productivity_History feed gained a Pending_Side_Minutes column.
-- Approved minutes (already in occupancy) live in side_task_minutes;
-- pending minutes (logged but not yet approved, NOT in occupancy)
-- live here. Together they let us compute "what occupancy would be
-- if pending were approved" without double-counting.

ALTER TABLE public.productivity_history
  ADD COLUMN IF NOT EXISTS pending_side_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.productivity_history.pending_side_minutes IS
  'Side-task minutes logged but not yet approved. Distinct from side_task_minutes (which is approved-only and already counted in occupancy_pct).';
