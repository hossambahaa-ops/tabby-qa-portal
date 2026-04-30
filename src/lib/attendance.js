// Single source of truth for attendance status codes — used by the
// Schedule page (cell picker, calendar grid, bulk-set, CSV upload, OT
// modal) and by anywhere else that has to render or validate a code.

export const ATTENDANCE_TYPES = [
  { code: "P",       label: "Present",            color: "#22C55E", bg: "#22C55E20" },
  { code: "H",       label: "Work from Home",     color: "#3B82F6", bg: "#3B82F620" },
  { code: "OT",      label: "Overtime",           color: "#0D9488", bg: "#0D948820" },
  { code: "L",       label: "Late Arrival",       color: "#F97316", bg: "#F9731620" },
  { code: "PH",      label: "Public Holiday",     color: "#8B5CF6", bg: "#8B5CF620" },
  { code: "EL",      label: "Early Leave",        color: "#EAB308", bg: "#EAB30820" },
  { code: "AL",      label: "Annual Leave",       color: "#EF4444", bg: "#EF444420" },
  { code: "Paid SL", label: "Sick Leave",         color: "#B91C1C", bg: "#B91C1C20" },
  { code: "ML",      label: "Maternity Leave",    color: "#EC4899", bg: "#EC489920" },
  { code: "UL",      label: "Unpaid Leave",       color: "#6B7280", bg: "#6B728020" },
  { code: "NSNC",      label: "No Show No Call",          color: "#E11D48", bg: "#E11D4825" },
  { code: "OFF",       label: "Weekend / Holiday",        color: "#9CA3AF", bg: "#9CA3AF15" },
  { code: "X",         label: "Not Employed",             color: "#6B7280", bg: "#6B728010" },
  { code: "CDO",       label: "Cancel Day Off (worked)",  color: "#14B8A6", bg: "#14B8A620" },
  { code: "Tabby Day", label: "Tabby Day (annual perk)",  color: "#A855F7", bg: "#A855F720" },
];

export const ATT_MAP = ATTENDANCE_TYPES.reduce((acc, t) => { acc[t.code] = t; return acc; }, {});

// Codes that need lead approval when set by a QA themselves. Leads
// setting these for their team approve them implicitly.
export const APPROVAL_CODES = new Set(["OT", "PH", "CDO", "Tabby Day"]);

// Codes shown in the cell picker. OT is intentionally excluded — it's a
// separate request flow behind the "Request OT" header button so it
// can't be set by casually clicking around.
export const PICKER_TYPES = ATTENDANCE_TYPES.filter(t => t.code !== "OT");
