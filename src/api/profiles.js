import { sb, dataCache } from "../lib/supabase.js";

export const listProfiles = ({
  token,
  select = "id,email,display_name,role",
  filters = "status=eq.active",
  cacheKey = "profiles",
  cache = true,
}) => {
  const run = () => sb.query("profiles", { select, filters, token });
  return cache ? dataCache.fetch(cacheKey, run) : run();
};
