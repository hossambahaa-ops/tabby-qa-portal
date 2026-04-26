// ═══════════════════════════════════════════════════════════════════
// Scope helpers — single source of truth for "who's in my team" logic
// Previously duplicated across ActionPlan, Coaching, Dashboard, Tasks,
// Leaderboard with subtle drift. All scope questions should go through
// teamEmailsFor / domainEmailsFor / scopeEmailsFor.
//
// Membership authority model:
//   • qa_roster.manager_email → the ONLY source of truth for team
//     membership. A QA "reports to" whoever's email is in that column.
//   • teams.lead_id / teams.supervisor_id → display metadata for the
//     Team Management page (who leads team X). NOT used to resolve
//     membership or scope — those questions always go through
//     qa_roster.manager_email.
//   • profiles.team_id / user_teams → legacy assignment data
//     maintained by the admin UI but not consulted for runtime scope.
//
// Consequence: if admin sets teams.lead_id but forgets to update
// qa_roster.manager_email for that team's members, scope queries will
// still reflect the old lead. That's by design — the roster sync is
// the authoritative path.
// ═══════════════════════════════════════════════════════════════════

// Tabby QAs sometimes have email addresses on both tabby.ai and tabby.sa
// domains. Return the "other" domain variant so roster lookups tolerate it.
export const altDomainEmail = (email) => {
  if (!email) return "";
  const lower = String(email).toLowerCase();
  if (lower.endsWith("@tabby.ai")) return lower.replace("@tabby.ai", "@tabby.sa");
  if (lower.endsWith("@tabby.sa")) return lower.replace("@tabby.sa", "@tabby.ai");
  return lower;
};

// Set of emails that report to the given profile via qa_roster.manager_email.
// Tolerates email/local-part and domain-swap drift.
export const teamEmailsFor = (profile, roster) => {
  const myEmail = profile?.email?.toLowerCase();
  if (!myEmail) return new Set();
  const myLocal = myEmail.split("@")[0];
  const myAlt = altDomainEmail(myEmail);
  const out = new Set();
  (roster || []).forEach(r => {
    const m = r?.manager_email?.toLowerCase();
    if (!m) return;
    if (m === myEmail || m === myAlt || m === myLocal) {
      const em = r?.email?.toLowerCase();
      if (em) out.add(em);
    }
  });
  return out;
};

// Set of emails in a given operational domain ("tabby.ai" or "tabby.sa").
export const domainEmailsFor = (domain, roster) => {
  if (!domain) return new Set();
  const dom = String(domain).toLowerCase();
  const out = new Set();
  (roster || []).forEach(r => {
    const em = r?.email?.toLowerCase();
    if (em && em.endsWith("@" + dom)) out.add(em);
  });
  return out;
};

// Full "what emails is this user allowed to see" resolver.
//  qa / senior_qa / auditor → just themselves (+ all for auditor read-only)
//  qa_lead                   → direct reports (via roster.manager_email)
//  qa_supervisor             → operational domain
//  admin / super_admin       → everyone in roster
export const scopeEmailsFor = (profile, roster) => {
  const myEmail = profile?.email?.toLowerCase();
  const role = profile?.role;
  const all = () => new Set((roster || []).map(r => r?.email?.toLowerCase()).filter(Boolean));
  if (!myEmail) return new Set();
  // admin / manager / hod / super_admin — all admin-tier, see everyone
  if (role === "super_admin" || role === "hod" || role === "admin" || role === "manager") return all();
  if (role === "auditor") return all(); // read-only viewer — sees all for observation
  if (role === "qa_supervisor") {
    const dom = profile?.operational_domain || profile?.domain;
    const s = domainEmailsFor(dom, roster);
    s.add(myEmail);
    return s;
  }
  if (role === "qa_lead") {
    const s = teamEmailsFor(profile, roster);
    s.add(myEmail);
    return s;
  }
  return new Set([myEmail]);
};
