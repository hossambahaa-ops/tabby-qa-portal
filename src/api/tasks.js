import { sb, dataCache } from "../lib/supabase.js";

export const listTasks = ({
  token,
  select = "*",
  filters = "order=created_at.desc",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("tasks", { select, filters, token }).catch(() => []);
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};
