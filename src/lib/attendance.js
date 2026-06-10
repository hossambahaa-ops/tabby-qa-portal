// Single source of truth for attendance status codes — used by the
// Schedule page (cell picker, calendar grid, bulk-set, CSV upload, OT
// modal) and by anywhere else that has to render or validate a code.

import { emailsMatchLoose } from "./utils.js";

// Remap each attendance row's email onto the matching roster QA's
// canonical email, bridging the @tabby.ai / @tabby.sa alias split. The
// calendar matches each cell to attendance by EXACT email, so a QA whose
// roster row uses one alias while their attendance rows carry the other
// renders blank. Row ids and every other field are preserved, so edits
// still PATCH the original DB row by id. No-op for rows whose email
// already matches a roster entry exactly (the common case) and for rows
// with no roster match at all.
export function reconcileAttendanceEmails(attendance = [], roster = []) {
  if (!Array.isArray(attendance) || !attendance.length) return attendance;
  if (!Array.isArray(roster) || !roster.length) return attendance;
  const exact = new Set(roster.map(r => r.email?.toLowerCase()).filter(Boolean));
  return attendance.map(a => {
    const em = a?.email?.toLowerCase();
    if (!em || exact.has(em)) return a;
    const match = roster.find(r => emailsMatchLoose(r.email, a.email));
    return match ? { ...a, email: match.email } : a;
  });
}

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
  // Umbrella "Leave" code introduced for the simplified picker from
  // 2026-06-01. Replaces AL / Paid SL / ML / UL / EL in the QA-facing
  // dropdown. Legacy granular codes stay valid for historical rows
  // and admin-only flows (CSV upload, MtdAdjust, etc.).
  { code: "Leave",   label: "Leave",                color: "#EF4444", bg: "#EF444420" },
];

export const ATT_MAP = ATTENDANCE_TYPES.reduce((acc, t) => { acc[t.code] = t; return acc; }, {});

// Codes that need lead approval when set by a QA themselves. Leads
// setting these for their team approve them implicitly.
export const APPROVAL_CODES = new Set(["OT", "PH", "CDO", "Tabby Day", "Leave"]);

// Codes shown in the cell picker. OT is intentionally excluded — it's a
// separate request flow behind the "Request OT" header button so it
// can't be set by casually clicking around.
//
// `PICKER_TYPES` is the LEGACY full list — kept as the default export
// so historical/admin call sites keep working. The simplified picker
// (used in the cell + bulk + check-in flows from 2026-06-01) goes
// through `pickerCodesForDate()` instead.
export const PICKER_TYPES = ATTENDANCE_TYPES.filter(t => t.code !== "OT");

// Simplification rollout — agreed cutover date. Picker switches to the
// 6-code set on this date (and forward). Editing a row whose date is
// before this still shows the legacy full list so leads can clean up
// May with full granularity.
export const ATT_SIMPLIFIED_START = "2026-06-01";
export const SIMPLIFIED_CODES = new Set(["P", "H", "PH", "OFF", "CDO", "Leave"]);
export const SIMPLIFIED_TYPES = ATTENDANCE_TYPES.filter(t => SIMPLIFIED_CODES.has(t.code));

// Pick which dropdown list to use given the target date. Accepts:
//   - "YYYY-MM-DD" string  (preferred — what every cell + bulk modal has)
//   - Date object
//   - anything falsy → returns simplified (forward-looking default)
// On/after ATT_SIMPLIFIED_START → simplified 6-code list.
// Before → legacy full list (excludes OT, same as before).
export function pickerCodesForDate(date) {
  let iso;
  if (!date) iso = ATT_SIMPLIFIED_START;
  else if (typeof date === "string") iso = date.slice(0, 10);
  else if (date instanceof Date) iso = date.toISOString().slice(0, 10);
  else iso = String(date).slice(0, 10);
  return iso >= ATT_SIMPLIFIED_START ? SIMPLIFIED_TYPES : PICKER_TYPES;
}

// Approved-leave codes that should be excluded from auto-NSNC,
// mismatch flags, "not yet checked in" lists, and adherence math.
// Centralized here because the literal "Paid SL" (with the space)
// diverged from many call sites that wrote ["AL","SL","PH"] — silently
// letting sick-leave rows fall through every filter.
//
// The new umbrella "Leave" code is included so it gets the same
// "approved, no check-in needed" treatment as the legacy granular
// codes it replaces.
export const LEAVE_CODES = new Set(["AL", "Paid SL", "PH", "ML", "UL", "Leave"]);

// Convenience helper — leave + NSNC together cover every "resolved
// without a check-in" state. Useful for callers that want one set
// to test against.
export const RESOLVED_NO_CHECKIN = new Set([...LEAVE_CODES, "NSNC"]);
