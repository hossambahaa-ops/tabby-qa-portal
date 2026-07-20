import { sb, dataCache } from "../lib/supabase.js";

export const listCoachingSessions = ({
  token,
  select = "*",
  filters = "order=created_at.desc&limit=100",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("coaching_sessions", { select, filters, token });
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};
