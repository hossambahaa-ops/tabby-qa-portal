import { sb } from "../lib/supabase.js";

export const listFeedback = ({
  token,
  select = "*",
  filters = "order=created_at.desc",
}) =>
  sb.query("feedback", { select, filters, token }).catch(() => []);

export const submitFeedback = ({ token, body }) =>
  sb.query("feedback", { token, method: "POST", body });
