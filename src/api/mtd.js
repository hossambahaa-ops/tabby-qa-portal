import { sb, dataCache } from "../lib/supabase.js";

export const listMtd = ({
  token,
  select = "*",
  filters = "order=month.desc",
  cacheKey = "mtd_scores",
  cache = true,
}) => {
  const run = () => sb.query("mtd_scores", { select, filters, token }).catch(() => []);
  return cache ? dataCache.fetch(cacheKey, run) : run();
};
