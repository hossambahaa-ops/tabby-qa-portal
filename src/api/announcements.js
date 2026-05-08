import { sb, dataCache } from "../lib/supabase.js";

export const listAnnouncements = ({
  token,
  select = "*",
  filters = "order=created_at.desc",
  cacheKey = null,
  cache = false,
}) => {
  const run = () => sb.query("announcements", { select, filters, token }).catch(() => []);
  return cache && cacheKey ? dataCache.fetch(cacheKey, run) : run();
};

export const createAnnouncement = ({ token, body }) =>
  sb.query("announcements", { token, method: "POST", body });
