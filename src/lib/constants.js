/* ═══ ROLE SYSTEM ═══ */
// Role ladder. senior_qa sits between qa and qa_lead (seniority without
// team-lead privileges). auditor is a read-scope-wide viewer aligned
// with qa_supervisor so Quality Control and domain-scoped views open up
// without granting write/destructive abilities (enforced per-action UI).
// manager and hod are admin-tier org-chart labels (Amanda = manager,
// Imad = hod). All three share level 5 — every existing
// has_role_or_above('admin') check passes for any of them. Only
// super_admin (level 6) sits above.
export const ROLE_LEVEL={qa:1,senior_qa:2,auditor:4,qa_lead:3,qa_supervisor:4,manager:5,hod:5,admin:5,super_admin:6};
export const ROLE_LABELS={qa:"QA",senior_qa:"Senior QA",qa_lead:"QA Lead",auditor:"Auditor",qa_supervisor:"QA Supervisor",manager:"Manager",hod:"HOD",admin:"Admin",super_admin:"Super Admin"};
export const hasRole=(r,min)=>(ROLE_LEVEL[r]||0)>=(ROLE_LEVEL[min]||99);

// Chronological month sort (newest first): "Mar-2026" > "Feb-2026" > "Jan-2026"
export const MONTH_IDX={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
export const sortMonthsDesc=(months)=>[...months].sort((a,b)=>{const[am,ay]=a.split("-");const[bm,by]=b.split("-");return(parseInt(by)||0)-(parseInt(ay)||0)||(MONTH_IDX[bm]??0)-(MONTH_IDX[am]??0);});

// Slimmed to the two dimensions that actually mean something on every
// page: domain (org scope) and month (time scope). Teams + People used
// to live here but only a handful of pages consumed them, so they're
// now per-page filters via the new <PageFilters> strip.
export const defaultFilters = { domain: "", month: "" };

// ── Nesting Pass Threshold Simulator visibility ──────────────────────────
// OPENED UP 2026-09-06. It was an email allowlist (owner-only) while the pass
// threshold was still being chosen and the page showed unpublished batch data
// with a provisional recommendation. That reason has expired: the page now
// carries 24 months of history, states its own mapping as a judgement, and
// labels the recommendation provisional in the UI. Keeping it hidden was
// costing more than it protected — the people who need to argue with the
// threshold could not see the evidence for it.
//
// Kept as a function rather than deleting the call sites, so restricting it
// again is a one-line change here instead of an edit across App.jsx.
export const canSeeNestingSim = () => true;

// ── QA Profile page visibility ───────────────────────────────────────────
// HIDDEN FOR EVERYONE 2026-09-30 on Hossam's instruction. The page is not
// deleted — it is gated here so bringing it back is a one-line change rather
// than restoring a route, a nav entry and a prefetch across App.jsx.
//
// Context: the derived score columns it leans on (coaching_observation_score,
// occupancy_score, calibration_score, rtr_score, final_performance) are NULL
// for every Sep-2026 row, because the sheet that used to write them is gone
// and nothing computes them yet. The page therefore shows blanks that read as
// "zero" rather than "not calculated".
//
// Flip to true (and re-run the checks on those columns) to restore it.
export const canSeeQaProfile = () => false;

/* ═══ SUPERVISOR-ONLY QAs ═══ */
// A few QAs' numbers are visible only from qa_supervisor upward — QA leads
// (level 3) do not see their rows at all. This is a deliberate reporting
// restriction, not a data problem: the rows exist and are complete in
// mtd_scores, they are simply filtered out of lead-level views.
//
// Matched on the email LOCAL PART so a QA whose identity is split across
// @tabby.ai and @tabby.sa (which several are) can't leak through the domain
// they happen to be keyed under. See the alias handling in
// supabase/queries/mtd_login_hours_by_qa.sql for the same problem.
// Each inner array is ONE person whose identity is split across domains, so
// the two spellings must never be treated as two different restricted QAs.
const SUPERVISOR_ONLY_GROUPS = [["yara.ashraf.786", "yara.ashraf"]];
const SUPERVISOR_ONLY_LOCALPARTS = SUPERVISOR_ONLY_GROUPS.flat();
const localPartOf = (email) => String(email || "").toLowerCase().trim().split("@")[0];
const sameRestrictedPerson = (a, b) =>
  !!a && (a === b || SUPERVISOR_ONLY_GROUPS.some(g => g.includes(a) && g.includes(b)));

/**
 * True when `viewerRole` is allowed to see this QA's row.
 *
 * `viewerEmail` matters for exactly one case: a restricted QA looking at their
 * OWN row. The restriction above exists to keep these numbers away from QA
 * LEADS — it was never meant to hide a QA's figures from herself, but that is
 * what happened, because the rule tested role alone and a senior_qa sits below
 * qa_supervisor. Yara could not see her own MTD (Hossam, 2026-09-28). Callers
 * that omit `viewerEmail` keep the old strict behaviour.
 */
export const canSeeQaRow = (viewerRole, qaEmail, viewerEmail = null) => {
  const lp = localPartOf(qaEmail);
  if (!SUPERVISOR_ONLY_LOCALPARTS.includes(lp)) return true;
  if (hasRole(viewerRole, "qa_supervisor")) return true;
  return sameRestrictedPerson(localPartOf(viewerEmail), lp);
};

/** Filter a list of rows (each with a qa_email) down to what the viewer may see. */
export const visibleQaRows = (viewerRole, rows, key = "qa_email", viewerEmail = null) =>
  (rows || []).filter((r) => canSeeQaRow(viewerRole, r?.[key], viewerEmail));
