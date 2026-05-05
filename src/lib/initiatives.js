// Tracker page constants. Mirrors the Notion "Amer's unit Task tracker"
// schema verbatim — extend the option lists here when the unit needs
// new categories. Status values match the DB CHECK constraint.

export const STATUSES = ["Not started", "In progress", "Done"];

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
