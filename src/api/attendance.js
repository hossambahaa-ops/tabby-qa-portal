import { sb, dataCache } from "../lib/supabase.js";

export const listAttendance = ({
  token,
  select = "email,date,status,planned_code",
  filters = "",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("qa_attendance", { select, filters, token }).catch(() => []);
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};
