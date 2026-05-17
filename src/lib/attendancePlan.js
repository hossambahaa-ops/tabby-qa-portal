// Attendance Plan helpers — flag derivation, Riyadh timezone, plan
// gating window. The frontend is the single source of truth for all
// flag logic (no triggers, no event log) — we just look at qa_attendance
// rows and decide.

// Plans only meaningful from May 2026 onward — earlier dates are
// not editable in the plan grid, and any pre-existing planned_code
// values (shouldn't exist, but defensive) are ignored.
export const PLAN_FEATURE_START = "2026-05-01";

// Riyadh is UTC+3 year-round (no DST). Default cutoff for "missing
// check-in" flag (7 PM Riyadh = 16:00 UTC) — used as a fallback when
// a row has no shift_end. Per-row cutoffs are now shift_end + 1h so
// late-shift QAs (e.g. 14–23) aren't flagged at 19:00 while still mid
// shift. Same 1h grace the auto-NSNC cron uses.
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
  // status NULL is the new "not yet checked in" sentinel (NOT NULL was
  // dropped 2026-05-17). A row with status set to a real outcome (P/H
  // self-check-in, AL/SL/PH leave, NSNC) is already resolved.
  if (row.status) return false;
  if (row.checked_in_at) return false;
  if (!row.date) return false;
  if (row.date < PLAN_FEATURE_START) return false;
  // Per-row cutoff = shift_end + 1h Riyadh (the same grace the auto-
  // NSNC cron uses). Falls back to 19:00 Riyadh (16:00 UTC) when the
  // row has no shift_end set — late-shift folks then aren't flagged
  // mid-shift, and early-shift folks still get a flag at 7 PM.
  const cutoffMs = (() => {
    const se = row.shift_end;
    if (typeof se === "string" && /^\d{2}:\d{2}/.test(se)) {
      const [hh, mm = "00"] = se.split(":");
      const h = Number(hh);
      const m = Number(mm) || 0;
      // shift_end is stored as Riyadh local time; +1h grace, then -3h
      // to convert to the UTC moment on row.date.
      const utcHour = (h + 1) - 3;
      // If the grace pushes past midnight Riyadh, the cutoff lands on
      // the NEXT calendar day. Compute via epoch arithmetic to avoid
      // hand-rolling day rollover.
      const baseUtc = Date.parse(`${row.date}T00:00:00Z`);
      if (Number.isNaN(baseUtc)) return null;
      return baseUtc + (utcHour * 60 + m) * 60 * 1000;
    }
    return Date.parse(`${row.date}T${String(CHECKIN_CUTOFF_HOUR_UTC).padStart(2,"0")}:00:00Z`);
  })();
  if (cutoffMs == null) return false;
  return now.getTime() >= cutoffMs;
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

// Attendance Health (MTD show-up rate). Higher = healthier.
//
// Definition (per QA):
//   numerator   = scheduled days where the actual was set AND wasn't NSNC
//   denominator = scheduled days (planned_code in {H, P}) up to today
//   health %    = numerator / denominator * 100
//
// Days after today are excluded so the metric doesn't dilute with future
// plan rows that haven't happened yet. A QA with zero scheduled days
// returns healthPct = null so callers can show "—".
export function computeAttendanceHealth(rows, monthYM, now = new Date()) {
  const todayStr = riyadhTodayStr(now);
  const monthStart = `${monthYM}-01`;
  const scheduled = (rows || []).filter(r =>
    r.date && r.date >= monthStart && r.date <= todayStr &&
    (r.planned_code === "H" || r.planned_code === "P")
  );
  // Today's planned-P rows are "pending" if the QA hasn't checked in
  // yet AND the cron hasn't auto-flipped them to NSNC. They shouldn't
  // count as healthy OR absent — they're in flight. Exclude them from
  // both numerator and denominator so the percentage doesn't whiplash
  // as the QA checks in or the auto-NSNC cron fires.
  //
  // Post 2026-05-17 the plan-grid no longer auto-syncs status, so the
  // canonical "not yet" sentinel is status === null. The earlier
  // status === "P" check is kept for the few rows leads pre-filled
  // before the cleanup ran.
  const isPendingToday = (r) =>
    r.date === todayStr &&
    r.planned_code === "P" &&
    !r.checked_in_at &&
    r.status !== "NSNC" &&
    !["AL","SL","PH"].includes(r.status);
  const resolved = scheduled.filter(r => !isPendingToday(r));
  const scheduledDays = resolved.length;
  if (scheduledDays === 0) return { healthPct: null, healthyDays: 0, absentDays: 0, scheduledDays: 0 };
  // A past scheduled day with no check-in and no resolution counts as
  // absent — auto-NSNC may not have fired (cron paused, edge case),
  // but the QA still didn't show. Treats status NULL and "NSNC" the
  // same way; both indicate no successful check-in.
  const absentDays = resolved.filter(r => !r.status || r.status === "NSNC" || (!r.checked_in_at && r.date < todayStr)).length;
  const healthyDays = scheduledDays - absentDays;
  return {
    healthPct: (healthyDays / scheduledDays) * 100,
    healthyDays,
    absentDays,
    scheduledDays,
  };
}

// Team roll-up: computes health for each member, returns the per-member
// list plus an aggregate. The aggregate uses TOTAL scheduled days and
// TOTAL healthy days (not the average of per-QA percentages) so a QA
// with 1 scheduled day doesn't equal a QA with 22.
export function computeTeamAttendanceHealth(rows, emails, monthYM, now = new Date()) {
  const lower = (emails || []).map(e => e?.toLowerCase()).filter(Boolean);
  const byEmail = new Map();
  lower.forEach(e => byEmail.set(e, []));
  (rows || []).forEach(r => {
    const e = r.email?.toLowerCase();
    if (e && byEmail.has(e)) byEmail.get(e).push(r);
  });
  const members = lower.map(e => {
    const m = computeAttendanceHealth(byEmail.get(e) || [], monthYM, now);
    return { email: e, ...m };
  });
  const totals = members.reduce((acc, m) => {
    acc.scheduledDays += m.scheduledDays;
    acc.healthyDays += m.healthyDays;
    acc.absentDays += m.absentDays;
    return acc;
  }, { scheduledDays: 0, healthyDays: 0, absentDays: 0 });
  const teamHealthPct = totals.scheduledDays > 0
    ? (totals.healthyDays / totals.scheduledDays) * 100
    : null;
  return { members, teamHealthPct, ...totals };
}

// Color hint for a health percentage. Healthier = green; mid = amber;
// poor = red. null returns the muted "no data" colour.
export function healthColor(pct) {
  if (pct === null || pct === undefined) return "var(--tx3)";
  if (pct >= 95) return "var(--green)";
  if (pct >= 85) return "var(--amber)";
  return "var(--red)";
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
