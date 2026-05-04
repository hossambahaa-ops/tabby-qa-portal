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

// True iff plan and actual disagree in a way that's worth flagging.
//   plan H/P + actual is the OTHER of H/P → mismatch (worked the wrong location)
//   plan OFF + actual is H or P            → mismatch (worked when planned off)
//   plan H/P + actual is OFF/leave/holiday → no flag (legit absence)
//   plan OFF + actual is OFF/leave/holiday → no flag (consistent)
// A null actual is "not checked in yet" and handled by isMissingCheckIn.
//
// IMPORTANT: only fires for dates that have already happened (today
// or earlier in Riyadh). Leads sometimes pre-fill future days with a
// default status before the QA actually attends — those provisional
// rows shouldn't surface as bell flags until the day arrives and the
// "mismatch" is real.
export function isMismatch(row, now = new Date()) {
  if (!row || row.mismatch_approved) return false;
  if (!row.date || row.date > riyadhTodayStr(now)) return false;
  const planned = row.planned_code;
  const actual = row.status;
  if (!planned || !actual) return false;
  if (planned === "H" || planned === "P") {
    if (actual !== "H" && actual !== "P") return false;
    return planned !== actual;
  }
  if (planned === "OFF") {
    return actual === "H" || actual === "P";
  }
  return false;
}

// True iff the row has a plan that EXPECTS a check-in (H or P), no
// actual code yet, and we are past 7 PM Riyadh. OFF days never trigger
// a missing-check-in flag — the QA wasn't supposed to work.
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

// True iff the row was auto-converted to NSNC by the 7 PM cron and the
// lead hasn't reviewed/changed it yet. Surfaces in the bell so the
// lead can adjust if the QA has a legitimate reason.
export function isAutoNsnc(row) {
  if (!row || !row.auto_nsnc) return false;
  // If the lead later changed status to something else, the auto_nsnc
  // flag is still true historically — but the current status no longer
  // reflects an "auto-set" state. Only show the bell entry while the
  // status is still NSNC.
  return row.status === "NSNC";
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
