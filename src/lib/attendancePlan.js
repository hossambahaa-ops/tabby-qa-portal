// Attendance Plan helpers — flag derivation, Riyadh timezone, plan
// gating window. The frontend is the single source of truth for all
// flag logic (no triggers, no event log) — we just look at qa_attendance
// rows and decide.

// Plans only meaningful from May 2026 onward — earlier dates are
// not editable in the plan grid, and any pre-existing planned_code
// values (shouldn't exist, but defensive) are ignored.
export const PLAN_FEATURE_START = "2026-05-01";

// Riyadh is UTC+3 year-round (no DST). Cutoff for "missing check-in"
// flag converts at 7 PM Riyadh = 16:00 UTC.
export const CHECKIN_CUTOFF_HOUR_RIYADH = 19;
const CHECKIN_CUTOFF_HOUR_UTC = CHECKIN_CUTOFF_HOUR_RIYADH - 3; // 16

// True iff the row's planned vs. actual codes are both H/P and disagree,
// AND the lead hasn't approved the mismatch.
export function isMismatch(row) {
  if (!row || row.mismatch_approved) return false;
  const planned = row.planned_code;
  const actual = row.status;
  if (!planned || !actual) return false;
  if (planned !== "H" && planned !== "P") return false;
  if (actual !== "H" && actual !== "P") return false;
  return planned !== actual;
}

// True iff the row has a plan, no actual code yet, and we are past
// 7 PM Riyadh on the row's date.
export function isMissingCheckIn(row, now = new Date()) {
  if (!row || row.mismatch_approved) return false;
  const planned = row.planned_code;
  if (planned !== "H" && planned !== "P") return false;
  if (row.status) return false;
  if (!row.date) return false;
  if (row.date < PLAN_FEATURE_START) return false;
  // 7 PM Riyadh on row.date == 16:00 UTC on that date
  const cutoff = new Date(`${row.date}T${String(CHECKIN_CUTOFF_HOUR_UTC).padStart(2,"0")}:00:00Z`);
  return now.getTime() >= cutoff.getTime();
}

// Convenience: any flag (used to power the bell count + visual badges).
export function hasAnyFlag(row, now = new Date()) {
  return isMismatch(row) || isMissingCheckIn(row, now);
}

// Today's date as it would be in Riyadh. Used by the dashboard check-in
// widget so QAs in other timezones still see "today" in Riyadh terms.
export function riyadhTodayStr(now = new Date()) {
  const utcMillis = now.getTime();
  const riyadhMillis = utcMillis + 3 * 60 * 60 * 1000;
  return new Date(riyadhMillis).toISOString().split("T")[0];
}

// True iff the calendar day for that QA is a normal workday (not weekend
// and not a holiday code already set on the actual). Currently uses the
// project convention: Friday/Saturday weekend (Saudi week).
export function isWorkdayDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const wd = d.getDay(); // 0=Sun..6=Sat
  return wd !== 5 && wd !== 6;
}

// Returns true if the date is editable in the plan grid (≥ feature start
// AND not in the past relative to today's Riyadh date — leads can only
// plan today and forward).
export function isPlanEditableDate(dateStr, now = new Date()) {
  if (!dateStr || dateStr < PLAN_FEATURE_START) return false;
  if (dateStr < riyadhTodayStr(now)) return false;
  return true;
}

// LocalStorage key for "last seen plan publication" per user — used by
// the bell to decide whether to show the "your plan has been updated"
// notification.
export const seenPlanKey = (email) =>
  `plan_seen_v1_${(email || "").toLowerCase()}`;

// Compare a row's plan_updated_at against the user's last-seen marker.
// Returns true iff the row was updated AFTER what the user has acked.
export function isPlanUnseen(row, lastSeenIso) {
  if (!row?.plan_updated_at) return false;
  if (!lastSeenIso) return true;
  return new Date(row.plan_updated_at).getTime() > new Date(lastSeenIso).getTime();
}
