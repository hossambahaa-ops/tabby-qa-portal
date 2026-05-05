// API helpers for the Tracker page (initiatives table). Thin wrappers
// over sb.query so the page doesn't repeat REST plumbing. RLS does the
// real authorization — these helpers don't try to second-guess it.

import { sb } from "../lib/supabase.js";

const SELECT_FULL =
  "id,title,description,status,priority,team,task_type,assigned_to,created_by," +
  "start_date,eta_date,parent_id,links,created_at,updated_at,completed_at";

// Fetch every initiative the caller has read access to. RLS already
// scopes to senior_qa+, so leads/admin get everything. Order recent
// first so the table view defaults to newest at the top.
export const listInitiatives = async ({ token } = {}) => {
  return sb
    .query("initiatives", {
      select: SELECT_FULL,
      filters: "order=updated_at.desc",
      token,
    })
    .catch(() => []);
};

// Insert. Server fills id, timestamps, completed_at via trigger.
// Caller MUST set created_by — the RLS policy checks it equals the
// auth user's email; otherwise insert fails with 401/403.
export const createInitiative = async ({ token, row }) => {
  return sb.query("initiatives", {
    method: "POST",
    select: SELECT_FULL,
    body: row,
    token,
  });
};

// Patch a single row. Pass only the columns that changed; the
// updated_at + completed_at triggers handle the rest.
export const updateInitiative = async ({ token, id, patch }) => {
  return sb.query("initiatives", {
    method: "PATCH",
    select: SELECT_FULL,
    filters: `id=eq.${id}`,
    body: patch,
    token,
  });
};

export const deleteInitiative = async ({ token, id }) => {
  return sb.query("initiatives", {
    method: "DELETE",
    filters: `id=eq.${id}`,
    token,
  });
};
