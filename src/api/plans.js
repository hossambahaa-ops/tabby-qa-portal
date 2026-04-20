import { sb, dataCache } from "../lib/supabase.js";

export const listPlans = ({
  token,
  select = "*",
  filters = "order=created_at.desc",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("action_plans", { select, filters, token }).catch(() => []);
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};

export const listPlanWeeks = ({
  token,
  select = "*",
  filters = "order=plan_id.asc,week_number.asc",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("action_plan_weeks", { select, filters, token }).catch(() => []);
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};
