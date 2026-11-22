import { sb } from "../lib/supabase.js";

// ── WFM Report (ex. Attendance) ─────────────────────────────────────────
// Reads of `wfm_shift_days`, the Pulse copy of the warehouse table
// `customer_happiness_datamarts.agent_shifts_agg` behind the Metabase
// "WFM Report (ex. Attendance) (dubai time)" dashboard.
//
// Three source semantics the UI must respect — all verified against the
// full Nov-2026 load, do NOT re-derive them:
//
//  1. `missing_h` is time absent INSIDE the planned window. Working past
//     the shift end earns nothing back. It is NOT late_m + left_early_m
//     (15 of 350 Nov rows break that identity: some big-lateness days
//     carry missing_h 0, and some days carry missing_h > 0 with both
//     late and left-early at 0 — mid-shift absence). Always display the
//     stored value; never recompute it.
//  2. On a no-show the warehouse zeroes `missing_h` (30 of 32 Nov rows:
//     scheduled 9h, logged 0h, missing 0h). So no-shows and missing hours
//     are two independent signals and must never be summed into one
//     "total lost hours" figure — doing so reports a no-show month clean.
//  3. Day-offs have no row at all. An off is indistinguishable from a
//     data gap here, so offs stay sourced from qa_attendance.
//
// NULL is meaningful and is not zero: leave days arrive with scheduled /
// login / missing all NULL, and no-show days arrive with late / left-early
// NULL. Averaging or summing them as 0 understates real shortfall.

export const listWfmShiftDays = ({ token, from, to }) =>
  sb.query("wfm_shift_days", {
    select:
      "email,shift_date,plan_shift_start,plan_shift_end,scheduled_h,login_h,missing_h,late_m,left_early_m,no_show,nsnc_reported,nsnc_not_reported,absences,team_lead,country,synced_at,fact_start_time,fact_end_time,adjusted_start_time,adjusted_end_time",
    filters: `shift_date=gte.${from}&shift_date=lte.${to}&order=shift_date.asc`,
    token,
  });

// Pulse's own attendance for the same window, so the panel can show what
// the CRM currently says next to what WFM reports. A lead acts on the
// difference; Pulse never silently overwrites itself from WFM.
export const listPulseAttendance = ({ token, from, to }) =>
  sb.query("qa_attendance", {
    select: "email,date,status,planned_code,auto_nsnc",
    filters: `date=gte.${from}&date=lte.${to}`,
    token,
  });

// QAs on extended leave: on the roster, but expected to have no WFM rows.
// Without this the panel would flag maternity / long medical leave as a
// coverage gap every single day.
export const listLongLeave = ({ token }) =>
  sb.query("qa_long_leave", {
    select: "email,starts_on,ends_on,leave_type,note",
    token,
  });
