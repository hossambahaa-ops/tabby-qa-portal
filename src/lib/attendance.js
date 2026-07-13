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

// Compact label + colour for a shift, used by the calendar shift pills.
// Input is the HH:MM[:SS] shift_start / shift_end stored on qa_attendance.
//
// One STABLE, DISTINCT colour per distinct shift. The colour is a pure
// function of the start–end, so the same shift always renders the same
// colour everywhere (team grid AND single-person month view), and two
// different shifts don't collapse to the same colour. The previous
// start-hour buckets caused exactly that discrepancy — 09–18 and 10–19
// were both green, and the near-identical 13–22 / 14–22 were split across
// amber and purple. A polynomial hash of the start–end spreads the few
// real shifts around the hue wheel; fixed S/L keeps every colour legible
// on the neutral pill chip. Minutes drop when :00 ("10:00"→"10").
export function shiftBadge(shiftStart, shiftEnd) {
  if (!shiftStart || !shiftEnd) return null;
  const hhmm = (t) => {
    const s = String(t).slice(0, 5);
    return s.endsWith(":00") ? s.slice(0, 2) : s;
  };
  const key = `${String(shiftStart).slice(0, 5)}${String(shiftEnd).slice(0, 5)}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 131 + key.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return { label: `${hhmm(shiftStart)}–${hhmm(shiftEnd)}`, color: `hsl(${hue} 70% 60%)`, key };
}

export const ATTENDANCE_TYPES = [
  { code: "P",       label: "Present",            color: "#22C55E", bg: "#22C55E20" },
  { code: "H",       label: "Work from Home",     color: "#3B82F6", bg: "#3B82F620" },
  // Login Day — the QA's designated come-online/office day. A planning
  // layer code leads assign ahead in the plan grid; treated as a working
  // day that expects a check-in (see attendancePlan.js). Kept out of the
  // actual-status pickers (it's a plan designation, not a check-in code).
  { code: "LD",      label: "Login Day",          color: "#8B5CF6", bg: "#8B5CF620" },
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
  // Granular leave set (re-expanded 2026-07-13 per Ops — replaced the
  // umbrella "Leave" in the picker). Casual / PH-Off / Lieu are new;
  // AL / Paid SL / ML already existed above and are reused.
  { code: "Casual",  label: "Casual Leave",             color: "#F59E0B", bg: "#F59E0B20" },
  { code: "PH-Off",  label: "Public Holiday (day off)", color: "#7C3AED", bg: "#7C3AED20" },
  { code: "Lieu",    label: "Lieu Day",                 color: "#0EA5E9", bg: "#0EA5E920" },
  // Umbrella "Leave" code (2026-06-01 → 2026-07-13). Kept for historical
  // rows and admin flows, but no longer offered in the picker.
  { code: "Leave",   label: "Leave",                color: "#EF4444", bg: "#EF444420" },
];

export const ATT_MAP = ATTENDANCE_TYPES.reduce((acc, t) => { acc[t.code] = t; return acc; }, {});

// Codes that need lead approval when set by a QA themselves. Leads
// setting these for their team approve them implicitly.
export const APPROVAL_CODES = new Set(["OT", "PH", "CDO", "Tabby Day", "Leave", "AL", "Paid SL", "ML", "UL", "Casual", "PH-Off", "Lieu"]);

// Codes shown in the cell picker. OT is intentionally excluded — it's a
// separate request flow behind the "Request OT" header button so it
// can't be set by casually clicking around.
//
// `PICKER_TYPES` is the LEGACY full list — kept as the default export
// so historical/admin call sites keep working. The simplified picker
// (used in the cell + bulk + check-in flows from 2026-06-01) goes
// through `pickerCodesForDate()` instead.
export const PICKER_TYPES = ATTENDANCE_TYPES.filter(t => t.code !== "OT" && t.code !== "LD");

// Simplification rollout — agreed cutover date. Picker switches to the
// 6-code set on this date (and forward). Editing a row whose date is
// before this still shows the legacy full list so leads can clean up
// May with full granularity.
export const ATT_SIMPLIFIED_START = "2026-06-01";
// Actual-attendance picker (calendar cell / bulk / check-in). 2026-07-13:
// the umbrella "Leave" was replaced by the granular leave set Ops asked for
// (AL, SL, Casual, PH-Off, Tabby Day, Lieu, Maternity Leave), alongside the
// work/holiday codes. These are OUTCOMES — the plan grid uses PLAN_TYPES
// (work codes only) so leads can't "plan" a leave.
export const SIMPLIFIED_CODES = new Set(["P", "H", "PH", "OFF", "CDO", "AL", "Paid SL", "Casual", "PH-Off", "Tabby Day", "Lieu", "ML"]);
export const SIMPLIFIED_TYPES = ATTENDANCE_TYPES.filter(t => SIMPLIFIED_CODES.has(t.code));

// Plan grid picker — schedule/work codes only. Leaves are actual outcomes,
// not something a lead schedules ahead, so they're intentionally excluded.
export const PLAN_CODES = new Set(["P", "H", "OFF", "LD"]);
export const PLAN_TYPES = ATTENDANCE_TYPES.filter(t => PLAN_CODES.has(t.code));

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
export const LEAVE_CODES = new Set(["AL", "Paid SL", "PH", "ML", "UL", "Leave", "Casual", "PH-Off", "Lieu", "Tabby Day"]);

// Convenience helper — leave + NSNC together cover every "resolved
// without a check-in" state. Useful for callers that want one set
// to test against.
export const RESOLVED_NO_CHECKIN = new Set([...LEAVE_CODES, "NSNC"]);
