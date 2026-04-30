import { sb, dataCache } from "../lib/supabase.js";

// Reads from mtd_scores_v — the resolved view that overrides
// avg_calibration_match_rate using (in priority order):
//   1. raw value from MTD if non-zero
//   2. AVG of calibration_responses for (qa_email, month_abbrev)
//   3. new_calibration helper column if non-zero
//   4. NULL — distinguishes "not done" from "real zero"
// View shape is identical to the table for every other column, so this
// is a transparent swap for every caller.
export const listMtd = ({
  token,
  select = "*",
  filters = "order=month.desc",
  cacheKey = "mtd_scores",
  cache = true,
}) => {
  const run = () => sb.query("mtd_scores_v", { select, filters, token }).catch(() => []);
  return cache ? dataCache.fetch(cacheKey, run) : run();
};
