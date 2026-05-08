import { sb } from "./supabase.js";
import { hasRole } from "./constants.js";

// Resolves "who counts as my team" for the lead-only Dashboard cards
// (PendingSideTasksCard, OwedCoachingsCard, TeamOccupancyCard, etc).
//
// Hierarchy in this codebase:
//   QA → manager_email = lead → teams.lead_id, teams.supervisor_id → sup
//
// Resolution per role:
//   qa_lead              direct reports only (qa_roster.manager_email = me)
//   qa_supervisor +      direct reports PLUS every QA whose lead reports
//                        to me via teams.supervisor_id
//   admin / super_admin  same as supervisor scope (whatever's wired through
//                        teams). Admins can use other pages for the all-org
//                        view; this helper stays role-scoped.
//
// Returns an array of qa_roster rows: { email, display_name, queue, manager_email }.
export async function loadTeamForViewer({ token, profile }) {
  const myEmail = (profile?.email || "").toLowerCase();
  if (!token || !myEmail) return [];

  // 1. Direct reports — works for everyone, base case for leads.
  const direct = await sb.query("qa_roster", {
    token,
    select: "email,display_name,queue,manager_email",
    filters: `manager_email=ilike.${myEmail}`,
  }).catch(() => []);

  // Lead with no further role: stop at direct reports.
  if (!hasRole(profile?.role, "qa_supervisor")) {
    return Array.isArray(direct) ? direct : [];
  }

  // 2. Supervisor+ — walk one level down through `teams`.
  //    a. Find my profile id.
  const myProfile = await sb.query("profiles", {
    token,
    select: "id",
    filters: `email=eq.${myEmail}`,
  }).catch(() => []);
  const myId = Array.isArray(myProfile) && myProfile[0]?.id;
  if (!myId) return Array.isArray(direct) ? direct : [];

  //    b. Find leads on teams where supervisor_id = me.
  const teams = await sb.query("teams", {
    token,
    select: "lead_id,supervisor_id",
    filters: `supervisor_id=eq.${myId}`,
  }).catch(() => []);
  const leadIds = [...new Set((Array.isArray(teams) ? teams : []).map(t => t.lead_id).filter(Boolean))];
  if (leadIds.length === 0) return Array.isArray(direct) ? direct : [];

  //    c. Resolve those lead ids back to emails.
  const leads = await sb.query("profiles", {
    token,
    select: "id,email",
    filters: `id=in.(${leadIds.join(",")})`,
  }).catch(() => []);
  const leadEmails = (Array.isArray(leads) ? leads : [])
    .map(l => (l.email || "").toLowerCase())
    .filter(Boolean);
  if (leadEmails.length === 0) return Array.isArray(direct) ? direct : [];

  //    d. QAs whose qa_roster.manager_email is one of those leads.
  const inList = leadEmails.map(e => `"${e}"`).join(",");
  const indirect = await sb.query("qa_roster", {
    token,
    select: "email,display_name,queue,manager_email",
    filters: `manager_email=in.(${inList})`,
  }).catch(() => []);

  // Merge direct + indirect, deduped by email. Direct takes precedence so
  // metadata (queue, manager_email) isn't lost when a QA appears in both.
  const merged = new Map();
  for (const r of (Array.isArray(direct) ? direct : [])) {
    if (r.email) merged.set(r.email.toLowerCase(), r);
  }
  for (const r of (Array.isArray(indirect) ? indirect : [])) {
    if (r.email && !merged.has(r.email.toLowerCase())) merged.set(r.email.toLowerCase(), r);
  }
  return [...merged.values()];
}
