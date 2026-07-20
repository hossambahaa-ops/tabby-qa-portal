import { sb, dataCache } from "../lib/supabase.js";

export const listEscalations = ({
  token,
  select = "*",
  filters = "order=created_at.desc",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("escalations", { select, filters, token });
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};
