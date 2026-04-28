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
  { val: "Below Expectations",    emoji: "📉",  bg: "var(--amber-bg)",   color: "var(--amber)" },
  { val: "Meets Expectations",    emoji: "✅",  bg: "var(--green-bg)",   color: "var(--green)" },
  { val: "Exceeds Expectations",  emoji: "⭐",  bg: "var(--accent-light)", color: "var(--accent-text)" },
  { val: "Outstanding",           emoji: "🏆",  bg: "var(--accent-light)", color: "var(--accent-text)" },
];

export const PERF_MESSAGES = {
  "Outstanding": "Your dedication and quality of work have set a commendable standard for the team. This level of performance is highly valued and acknowledged.",
  "Exceeds Expectations": "You have consistently gone beyond the required scope of your responsibilities, demonstrating strong professional commitment.",
  "Meets Expectations": "You are fulfilling your responsibilities in a satisfactory manner and are encouraged to continue building on this foundation.",
  "Below Expectations": "There are areas that require immediate attention and improvement. I am confident in your ability to address these with focus and commitment.",
  "Needs Attention": "I would like us to work closely together to identify the root causes and establish a clear action plan.",
};

export const INTRO_MAP = {
  "1:1 Meeting": "This is a formal summary of our weekly 1:1 meeting.",
  "MPR": "This is a formal summary of your MPR session.",
  "Coaching Session": "This is a formal summary of your Coaching Session.",
  "Weekly Check-in": "This is a formal summary of our Weekly Check-in.",
  "Action Plan Review": "This is a formal summary of your Action Plan Review. Please review your weekly targets and progress carefully.",
  "PIP Review": "This is a formal summary of your Performance Improvement Plan (PIP) Review. Please review your weekly targets and progress carefully.",
};

export const TEMPLATES = {
  "1:1 Meeting": { topics: "Weekly performance update\nTeam challenges and support needed\nCareer development discussion", strengths: "Consistent quality of work\nStrong communication with team members", weaknesses: "Time management on complex cases\nEscalation handling", goals: "Improve first response resolution rate\nComplete pending training module", actions: "Share weekly self-assessment by Thursday\nSchedule shadowing session with senior agent" },
  "Coaching Session": { topics: "Calibration score review\nSpecific case analysis\nScoring accuracy discussion", strengths: "Improvement noted in handling complex cases\nGood alignment with quality standards", weaknesses: "Soft skills in resolution communication\nAttribute scoring consistency", goals: "Reach calibration alignment score above 85%\nReduce scoring deviation", actions: "Review 5 calibration cases before next session\nComplete RTR self-practice twice this week" },
  "Weekly Check-in": { topics: "Weekly scorecard review\nCurrent challenges and blockers\nPriorities for the coming week", strengths: "Maintained consistent quality scores\nProactive communication", weaknesses: "Areas needing attention this week", goals: "Hit weekly targets across all KPIs", actions: "Focus on identified weak areas\nFlag any support needs by Wednesday" },
  "Action Plan Review": { topics: "Weekly target progress review\nCalibration score performance\nRTR session completion\nQuality consistency", strengths: "Commitment to improvement plan\nAttendance and engagement in sessions", weaknesses: "Areas where targets were not fully met\nSpecific attribute scoring gaps", goals: "Achieve agreed weekly targets\nImprove calibration alignment score", actions: "Complete weekly RTR sessions as agreed\nAttend all calibration sessions\nSubmit weekly self-review" },
  "PIP Review": { topics: "PIP target progress review\nDetailed performance metrics discussion\nSupport and resources assessment", strengths: "Positive steps taken during PIP period\nEngagement with coaching sessions", weaknesses: "Areas where PIP targets were not met\nRoot causes identified", goals: "Meet all PIP performance targets\nDemonstrate sustained improvement", actions: "Complete all agreed PIP actions\nMeet with HR for formal review\nSubmit weekly progress log" },
  "MPR": { topics: "Overall performance review for the period\nKey achievements and highlights\nAreas requiring development", strengths: "Demonstrated ownership of quality metrics\nPositive attitude and team collaboration", weaknesses: "Consistency across all ticket categories\nDocumentation quality", goals: "Achieve target KPI scores for next quarter\nComplete mandatory compliance training", actions: "Submit self-appraisal form by end of week\nAgree on development plan for next period" },
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
