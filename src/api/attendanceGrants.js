import { sb, dataCache } from "../lib/supabase.js";

// Individual attendance-visibility grants for the CURRENT user.
//
// `attendance_view_grants` is the single source of truth for "this person may
// also see that person's schedule", replacing what used to be a hardcoded
// email list in SchedulePage plus a matching hardcoded clause in the
// attendance_select RLS policy. The policy and this fetch read the same rows,
// so a grant is an INSERT rather than a deploy.
//
// RLS on the table already restricts SELECT to the caller's own grants, so
// there is no viewer filter here — asking for everything returns only yours.
//
// Like every module in src/api this deliberately does NOT swallow errors; see
// the note in roster.js for why an empty array must not be able to mean
// "the request failed". A failure here should leave the grid as it was, not
// silently narrow someone's view back down.
export const listMyAttendanceGrants = ({ token, cache = true }) => {
  const run = () => sb.query("attendance_view_grants", { select: "viewer_email,qa_email", token });
  return cache ? dataCache.fetch("my_attendance_grants", run) : run();
};

// Grants are keyed on the email LOCAL PART, never the full address. The same
// QA is @tabby.ai in one table and @tabby.sa in another all over this system
// (see same_tabby_user in the DB, emailsMatchLoose here), and matching on the
// full address is the single most repeated way people get silently dropped.
// These two helpers exist so that rule lives in one place instead of being
// re-typed as `.toLowerCase().split("@")[0]` at every call site.
export const localPartOf = (email) => (email || "").toLowerCase().trim().split("@")[0];

/** Set of granted local parts from `listMyAttendanceGrants` rows. */
export const grantedLocalPartsFrom = (rows) =>
  new Set((Array.isArray(rows) ? rows : []).map(r => localPartOf(r?.qa_email)).filter(Boolean));

/** Is this person covered by a grant? Empty/garbage email is never a match. */
export const isGranted = (email, grantedLocalParts) => {
  const lp = localPartOf(email);
  return !!lp && !!grantedLocalParts?.has?.(lp);
};
