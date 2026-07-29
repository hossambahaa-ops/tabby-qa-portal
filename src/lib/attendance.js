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

// ── Colour semantics ────────────────────────────────────────────────
// Every code carries a `group`, and each group owns ONE hue family. A
// month should be scannable at a glance — "mostly green with a purple
// block and one red cell" — instead of read cell by cell.
//
// Before this, hue carried no meaning: 21 codes were spread across the
// wheel individually, so AL (#EF4444) and NSNC (#E11D48) were the same
// red and an annual leave looked exactly like a no-show; LD and PH were
// literally the same purple; Casual (amber) sat next to AL (red) despite
// both being ordinary approved leave.
//
//   work      green   — on the job, on site. Includes PH: a "PH" row means
//                       the QA WORKED the public holiday (it's approved and
//                       tracked next to OT). The day-off case is PH-Off.
//   remote    blue    — on the job, off site
//   partial   amber   — worked, but the day was short (late / early leave)
//   leave     rose    — approved absence, all flavours
//   holiday   violet  — entitled day off, nobody is expected in
//   off       grey    — not a working day, no expectation either way
//   incident  red     — the ONLY red. Something went wrong.
//
// Keeping red exclusive to `incident` is the point of the whole exercise:
// a lead scanning the grid should be able to trust that red means "act on
// this", and nothing else should compete for that signal.
export const ATT_GROUPS = {
  work:     { label: "Working",        color: "#16A34A" },
  remote:   { label: "Working (remote)", color: "#2563EB" },
  partial:  { label: "Short day",      color: "#D97706" },
  leave:    { label: "Approved leave", color: "#DB2777" },
  holiday:  { label: "Holiday",        color: "#7C3AED" },
  off:      { label: "Non-working",    color: "#9CA3AF" },
  incident: { label: "Needs action",   color: "#DC2626" },
};

export const ATT_GROUP_ORDER = ["work", "remote", "partial", "leave", "holiday", "off", "incident"];

export const ATTENDANCE_TYPES = [
  // ── work: green family ──
  // PH, CDO and OT are the "worked when you didn't have to" codes — all
  // three need lead approval and all three feed the monthly OT/PH tracker.
  // PH specifically means the QA WORKED the public holiday; the day-off
  // counterpart is the separate PH-Off code, which is why they sit in
  // different groups despite the near-identical names.
  { code: "P",       label: "Present",            group: "work",     color: "#16A34A", bg: "#16A34A20" },
  { code: "PH",      label: "Public Holiday (worked)", group: "work", color: "#4D7C0F", bg: "#4D7C0F20" },
  { code: "CDO",     label: "Cancel Day Off (worked)", group: "work", color: "#15803D", bg: "#15803D20" },
  { code: "OT",      label: "Overtime",           group: "work",     color: "#059669", bg: "#05966920" },
  // ── remote: blue family. Working, just not from the office. ──
  { code: "H",       label: "Work from Home",     group: "remote",   color: "#2563EB", bg: "#2563EB20" },
  // Login Day — the QA's designated come-online/office day. A planning
  // layer code leads assign ahead in the plan grid; treated as a working
  // day that expects a check-in (see attendancePlan.js). Kept out of the
  // actual-status pickers (it's a plan designation, not a check-in code).
  { code: "LD",      label: "Login Day",          group: "remote",   color: "#0EA5E9", bg: "#0EA5E920" },
  // ── partial: amber family. Worked, but short. ──
  { code: "L",       label: "Late Arrival",       group: "partial",  color: "#D97706", bg: "#D9770620" },
  { code: "EL",      label: "Early Leave",        group: "partial",  color: "#B45309", bg: "#B4530920" },
  // ── leave: rose/pink family. Approved absence — NOT red. ──
  // Every colour here has to stay legible as 10px bold text on its own
  // 12%-alpha tint. The first pass used pink-400/#F472B6 and a custom
  // #E879A9 for Casual/Lieu and both washed out against the card — they
  // read as disabled rather than distinct. Keep the family in the
  // rose→fuchsia band but stay in the 600–900 weight range.
  { code: "AL",      label: "Annual Leave",       group: "leave",    color: "#DB2777", bg: "#DB277720" },
  { code: "Paid SL", label: "Sick Leave",         group: "leave",    color: "#9F1239", bg: "#9F123920" },
  { code: "ML",      label: "Maternity Leave",    group: "leave",    color: "#EC4899", bg: "#EC489920" },
  { code: "UL",      label: "Unpaid Leave",       group: "leave",    color: "#831843", bg: "#83184320" },
  { code: "Casual",  label: "Casual Leave",       group: "leave",    color: "#BE185D", bg: "#BE185D20" },
  // Lieu is earned time off in exchange for a worked day — grouped with
  // leave (it's an absence the lead approves), pushed to the fuchsia end
  // so it doesn't collide with the four rose codes next to it.
  { code: "Lieu",    label: "Lieu Day",           group: "leave",    color: "#A21CAF", bg: "#A21CAF20" },
  // ── holiday: violet family. Entitled day off, nobody is expected in. ──
  { code: "PH-Off",  label: "Public Holiday (day off)", group: "holiday", color: "#7C3AED", bg: "#7C3AED20" },
  { code: "Tabby Day", label: "Tabby Day (annual perk)", group: "holiday", color: "#A855F7", bg: "#A855F720" },
  // ── off: grey. Not a working day; no expectation either way. ──
  { code: "OFF",     label: "Weekend / Holiday",  group: "off",      color: "#9CA3AF", bg: "#9CA3AF15" },
  // X marks a person who is no longer on the team (left / offboarded), or who
  // had not joined yet on that date. It is a statement of fact by a lead, not a
  // leave request, so it stays out of APPROVAL_CODES. Already treated as
  // "absent, do not count" by the dashboard + coaching-cadence logic.
  { code: "X",       label: "No longer on the team", group: "off",    color: "#6B7280", bg: "#6B728010" },
  // ── incident: red. Reserved. Nothing else in the grid is red. ──
  // Carries a heavier tint than every other code as well as the exclusive
  // hue: leave sits in the neighbouring rose band, and severity should
  // survive being glanced at, so it differs in weight and not only in hue.
  { code: "NSNC",    label: "No Show No Call",    group: "incident", color: "#DC2626", bg: "#DC26263D" },
  // Umbrella "Leave" code (2026-06-01 → 2026-07-13). Kept for historical
  // rows and admin flows, but no longer offered in the picker.
  { code: "Leave",   label: "Leave",              group: "leave",    color: "#DB2777", bg: "#DB277720" },
];

export const ATT_MAP = ATTENDANCE_TYPES.reduce((acc, t) => { acc[t.code] = t; return acc; }, {});

// Codes grouped for the legend, in ATT_GROUP_ORDER. Callers pass the
// subset of types they actually render (e.g. SIMPLIFIED_TYPES) so the
// legend never advertises a code the picker won't offer.
export function groupTypes(types = ATTENDANCE_TYPES) {
  return ATT_GROUP_ORDER
    .map(key => ({
      key,
      ...ATT_GROUPS[key],
      types: types.filter(t => (t.group || "off") === key),
    }))
    .filter(g => g.types.length > 0);
}

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
export const SIMPLIFIED_CODES = new Set(["P", "H", "PH", "OFF", "CDO", "AL", "Paid SL", "Casual", "PH-Off", "Tabby Day", "Lieu", "ML", "X"]);
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
