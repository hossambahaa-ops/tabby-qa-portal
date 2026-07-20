import { sb, dataCache } from "../lib/supabase.js";

export const listViolations = ({
  token,
  select = "*",
  filters = "order=created_at.desc",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("coaching_violations", { select, filters, token });
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};
