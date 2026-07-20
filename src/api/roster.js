import { sb, dataCache } from "../lib/supabase.js";

// NOTE (applies to every module in src/api): these helpers deliberately
// do NOT swallow errors. They used to end in `.catch(() => [])`, which
// meant a failure was indistinguishable from a successful empty result —
// the caller got `[]` either way and rendered a confident empty state.
//
// That is what turned an RLS statement timeout into a silent org-wide
// outage on 2026-07-20: `attendance_select` started returning HTTP 500 /
// SQLSTATE 57014 for every QA Lead, each 500 became `[]`, and the
// schedule grid told ten leads their teams had nothing scheduled.
// dataCache.fetch already falls back to the last good value on failure,
// so a blip during a background refresh still doesn't blank a view —
// but a first load that genuinely fails now reaches the caller as an
// error, where <AsyncSection> can say so and offer a retry.
//
// Callers must therefore handle rejection: a try/catch, an explicit
// `.catch`, or Promise.allSettled when one slice failing shouldn't
// discard the others.

// Fetch QA roster rows. Columns are opt-in per-caller to keep payloads small.
// `cacheKey` lets callers share the same cache entry across pages (default)
// or fetch a wider column set under a distinct key (e.g. "qa_roster_full").
export const listRoster = ({
  token,
  select = "email,display_name,queue,manager_email,role",
  cacheKey = "qa_roster",
  cache = true,
}) => {
  const run = () => sb.query("qa_roster", { select, token });
  return cache ? dataCache.fetch(cacheKey, run) : run();
};
