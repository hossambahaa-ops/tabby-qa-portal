import { sb, dataCache } from "../lib/supabase.js";

export const listTeamTargets = ({
  token,
  select = "team_name,domain,metric,target_value",
  filters = "",
  cacheKey = "team_targets",
  cache = true,
}) => {
  const run = () => sb.query("team_targets", { select, filters, token });
  return cache ? dataCache.fetch(cacheKey, run) : run();
};
