// Constants + recipient-resolution helpers for the coaching compose UI.
// Kept here so the page file stays focused on form state + handlers.

export const MEETING_TYPES = [
  "1:1 Meeting",
  "MPR",
  "Coaching Session",
  "Weekly Check-in",
  "Action Plan Review",
  "PIP Review",
];

// Maps the human-friendly meeting type onto the enum value the
// coaching_sessions table expects.
export const MEETING_TYPE_ENUM = {
  "1:1 Meeting": "weekly_1on1",
  "MPR": "performance_review",
  "Coaching Session": "ad_hoc",
  "Weekly Check-in": "weekly_1on1",
  "Action Plan Review": "ap_checkin",
  "PIP Review": "pip_checkin",
};

// Meeting types that show the per-week target table (AP / PIP reviews).
export const TARGET_TYPES = ["Action Plan Review", "PIP Review"];

// Always-cc'd recipient (QA Manager). The lead is the sender so they
// are deliberately NOT in the CC list — only the supervisor and Amanda.
export const AMANDA_EMAIL = "amanda.souza@tabby.ai";

export const PERF_OPTIONS = [
  { val: "Needs Attention",       emoji: "⚠️",  bg: "var(--red-bg)",     color: "var(--red)" },
  { val: "Improvement Needed",    emoji: "📉",  bg: "var(--amber-bg)",   color: "var(--amber)" },
  { val: "Meets Expectations",    emoji: "✅",  bg: "var(--green-bg)",   color: "var(--green)" },
  { val: "Exceeds Expectations",  emoji: "⭐",  bg: "var(--accent-light)", color: "var(--accent-text)" },
  { val: "Outstanding",           emoji: "🏆",  bg: "var(--accent-light)", color: "var(--accent-text)" },
];

export const PERF_MESSAGES = {
  "Outstanding": "Your dedication and quality of work have set a commendable standard for the team. This level of performance is highly valued and acknowledged.",
  "Exceeds Expectations": "You have consistently gone beyond the required scope of your responsibilities, demonstrating strong professional commitment.",
  "Meets Expectations": "You are fulfilling your responsibilities in a satisfactory manner and are encouraged to continue building on this foundation.",
  "Improvement Needed": "There are areas that would benefit from focused attention. I'm confident you can address these with continued effort and the right support.",
  "Needs Attention": "I would like us to work closely together to identify the root causes and establish a clear action plan.",
};

// Map historical rating strings to their current label so old coaching rows
// still aggregate under the new value. Add to this map any time we rename
// a rating going forward.
export const PERF_LEGACY_REMAP = {
  "Below Expectations": "Improvement Needed",
};
export const normalizePerfRating = (val) =>
  PERF_LEGACY_REMAP[val] || val;

export const INTRO_MAP = {
  "1:1 Meeting": "This is a formal summary of our weekly 1:1 meeting.",
  "MPR": "This is a formal summary of your MPR session.",
  "Coaching Session": "This is a formal summary of your Coaching Session.",
  "Weekly Check-in": "This is a formal summary of our Weekly Check-in.",
  "Action Plan Review": "This is a formal summary of your Action Plan Review. Please review your weekly targets and progress carefully.",
  "PIP Review": "This is a formal summary of your Performance Improvement Plan (PIP) Review. Please review your weekly targets and progress carefully.",
};

// Pre-fill templates removed per Amanda 2026-05-07. The structure is kept
// (intentionally empty) so any leftover "Apply template" code paths fall
// through to no-ops without runtime errors.
export const TEMPLATES = {};

// Map a profile.role to a human-readable signature title. Used to seed the
// signature line automatically from the logged-in user instead of asking
// them to type it every time.
export const SIG_TITLE_BY_ROLE = {
  qa: "Quality Specialist",
  senior_qa: "Senior Quality Specialist",
  qa_lead: "QA Lead",
  qa_supervisor: "QA Supervisor",
  manager: "Quality Manager",
  hod: "Head of Quality",
  admin: "QA Lead",
  super_admin: "QA Lead",
};

// Resolve the supervisor for a QA. Primary source: the `teams` table,
// which has supervisor_id explicitly. Fallback: walk roster (QA →
// manager_email → manager_email) when the team lookup misses.
//
// `teamSvMap` is keyed `<queue>|<domain>` → supervisor email.
export const findSv = (toEmail, roster, teamSvMap) => {
  if (!toEmail) return null;
  const lower = toEmail.toLowerCase();
  const qa = roster.find(r => (r.email || "").toLowerCase() === lower);
  if (qa?.queue) {
    const domain = lower.split("@")[1] || "";
    const sv = teamSvMap[`${qa.queue}|${domain}`];
    if (sv) return sv;
  }
  const lead = qa?.manager_email?.toLowerCase();
  if (lead) {
    return roster.find(r => (r.email || "").toLowerCase() === lead)?.manager_email?.toLowerCase() || null;
  }
  return null;
};

// CC line for an outgoing coaching email: SV (resolved via findSv) +
// Amanda. Sender is excluded from CC.
export const buildAutoCc = (toEmail, roster, senderEmail, teamSvMap) => {
  if (!toEmail) return "";
  const sender = (senderEmail || "").toLowerCase();
  const sv = findSv(toEmail, roster, teamSvMap || {});
  const out = new Set();
  if (sv && sv !== sender) out.add(sv);
  if (AMANDA_EMAIL !== sender) out.add(AMANDA_EMAIL);
  return [...out].join(", ");
};
