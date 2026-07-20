import { sb } from "../lib/supabase.js";

// Heartbeat / "what page is this user on right now" lookups. Writes
// happen via App.jsx's heartbeat loop (still inline today — see todo
// for slimming App.jsx). Kept as separate read + write helpers so the
// upsert payload shape stays explicit.

export const fetchActivity = ({ token, userEmail }) =>
  sb.query("user_activity", {
    select: "*",
    filters: `user_email=eq.${userEmail}`,
    token,
  });

export const upsertActivity = ({ token, body }) =>
  sb.query("user_activity", {
    token,
    method: "POST",
    body,
    headers: { Prefer: "resolution=merge-duplicates" },
  });
