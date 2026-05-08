import { sb, dataCache } from "../lib/supabase.js";

export const listDailyScores = ({
  token,
  select = "*",
  filters = "",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("daily_scores", { select, filters, token }).catch(() => []);
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};
