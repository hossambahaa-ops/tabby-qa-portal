import { sb, dataCache } from "../lib/supabase.js";

export const listDamFlags = ({
  token,
  select = "id,qa_email,severity,status,triggered_at,occurrence_number,reviewed_by,reviewed_at,notes,dam_rules(name,behavior_type,recommended_action)",
  filters = "order=triggered_at.desc",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("dam_flags", { select, filters, token }).catch(() => []);
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};
