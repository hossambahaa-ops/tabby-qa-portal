// Tracker page constants. Mirrors the Notion "Amer's unit Task tracker"
// schema verbatim — extend the option lists here when the unit needs
// new categories. Status values match the DB CHECK constraint.

export const STATUSES = ["Not started", "In progress", "Done"];

// Public reference for a card. Used in the UI label (`TRK-42`) and as
// a copyable handle for Slack/email/standup notes. The numeric seq
// comes from the DB sequence; we just dress it up here.
export const TRK_PREFIX = "TRK";
export const trkRef = (row) => row?.seq ? `${TRK_PREFIX}-${row.seq}` : "";

// Soft WIP limits per column. Going over → header chip turns amber and
// shows "12 / 8". Doesn't block the lead from doing anything; it's
// just a visual nudge that the column is overcommitted. Tune later if
// the unit's volume changes; admin-editable is a Phase-3 follow-up.
export const WIP_LIMITS = {
  "Not started": null, // backlog has no cap
  "In progress": 8,    // soft cap
  "Done":        null, // archive has no cap
};

export const STATUS_COLORS = {
  "Not started": { bg: "rgba(156,163,175,0.15)", color: "var(--tx2)", border: "var(--bd)" },
  "In progress": { bg: "rgba(59,130,246,0.15)",  color: "#3B82F6",   border: "#3B82F6" },
  "Done":        { bg: "rgba(34,197,94,0.15)",   color: "#16A34A",   border: "#16A34A" },
};

export const PRIORITIES = ["High", "Medium", "Low"];

export const PRIORITY_COLORS = {
  High:   { bg: "rgba(239,68,68,0.15)",   color: "#DC2626" },
  Medium: { bg: "rgba(234,179,8,0.18)",   color: "#CA8A04" },
  Low:    { bg: "rgba(34,197,94,0.15)",   color: "#16A34A" },
};

// Verbatim from the Notion db's Team multi-select.
export const TEAMS = [
  "Content/KM",
  "TQC",
  "Analysts",
  "Process",
  "Quality",
  "Training Delivery",
  "Change",
];

export const TEAM_COLORS = {
  "Content/KM":        "#F97316",
  "TQC":               "#92400E",
  "Analysts":          "#8B5CF6",
  "Process":           "#6B7280",
  "Quality":           "#EAB308",
  "Training Delivery": "#22C55E",
  "Change":            "#EC4899",
};

// Verbatim from the Notion db's Task type multi-select.
export const TASK_TYPES = [
  "Tool Upgrade",
  "Reporting/Analysis",
  "Team related request",
  "Content Request",
  "Training Delivery",
  "Action item",
];

export const TASK_TYPE_COLORS = {
  "Tool Upgrade":         "#6B7280",
  "Reporting/Analysis":   "#92400E",
  "Team related request": "#EAB308",
  "Content Request":      "#F97316",
  "Training Delivery":    "#22C55E",
  "Action item":          "#EC4899",
};

// Permission helper — true iff the current viewer can edit this row.
// Mirrors the RLS policy: creator OR assignee OR admin+. The actual
// guard lives on the DB; this is for UI affordance only (hide edit
// buttons, disable inputs) so users don't see actions that would 403.
export const canEdit = (row, userEmail, isAdmin) => {
  if (!row || !userEmail) return false;
  if (isAdmin) return true;
  const me = userEmail.toLowerCase();
  return (row.created_by || "").toLowerCase() === me
      || (row.assigned_to || "").toLowerCase() === me;
};

export const canDelete = (row, userEmail, isAdmin) => {
  if (!row || !userEmail) return false;
  if (isAdmin) return true;
  return (row.created_by || "").toLowerCase() === userEmail.toLowerCase();
};
