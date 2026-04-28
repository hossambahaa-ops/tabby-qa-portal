import { sb, dataCache } from "../lib/supabase.js";

// Fetch QA roster rows. Columns are opt-in per-caller to keep payloads small.
// `cacheKey` lets callers share the same cache entry across pages (default)
// or fetch a wider column set under a distinct key (e.g. "qa_roster_full").
export const listRoster = ({
  token,
  select = "email,display_name,queue,manager_email,role",
  cacheKey = "qa_roster",
  cache = true,
}) => {
  const run = () => sb.query("qa_roster", { select, token }).catch(() => []);
  return cache ? dataCache.fetch(cacheKey, run) : run();
};
