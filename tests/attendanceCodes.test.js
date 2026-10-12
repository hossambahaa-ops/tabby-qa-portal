import { describe, it, expect } from "vitest";
import {
  ATT_MAP, PLAN_CODES, PLAN_TYPES, SIMPLIFIED_CODES,
  pickerCodesForDate, ATT_SIMPLIFIED_START,
} from "../src/lib/attendance.js";
import { isMissingCheckIn, computeAttendanceHealth } from "../src/lib/attendancePlan.js";
import { hasRole } from "../src/lib/constants.js";

const codes = (list) => list.map(t => t.code);

// ── NSNC is a permission, not a preference ──────────────────────────────
// It is the only status that counts against Attendance Health, so it must
// never appear for the person it would be recorded against. Hossam,
// 2026-10-12: "give the option only to the roles above Seniors ... so
// starting leader can mark someone NSNC."
describe("NSNC is only offered to qa_lead and above", () => {
  it("is absent by default — callers must opt in explicitly", () => {
    expect(codes(pickerCodesForDate("2026-10-12"))).not.toContain("NSNC");
    expect(codes(pickerCodesForDate("2026-10-12", {}))).not.toContain("NSNC");
  });

  it("appears once canMarkNsnc is set", () => {
    expect(codes(pickerCodesForDate("2026-10-12", { canMarkNsnc: true }))).toContain("NSNC");
  });

  it("tracks the role ladder: qa_lead and up yes, senior_qa and below no", () => {
    const offered = (role) =>
      codes(pickerCodesForDate("2026-10-12", { canMarkNsnc: hasRole(role, "qa_lead") }));
    for (const role of ["qa_lead", "auditor", "qa_supervisor", "manager", "hod", "admin", "super_admin"]) {
      expect(offered(role), `${role} should be able to mark NSNC`).toContain("NSNC");
    }
    for (const role of ["qa", "senior_qa"]) {
      expect(offered(role), `${role} must NOT be able to mark NSNC`).not.toContain("NSNC");
    }
  });

  // The legacy pre-cutover list used to include NSNC for anyone who could
  // edit the cell. The gate has to cover that path too, or a lead-only
  // control is bypassable by editing a May date.
  it("is stripped from the legacy pre-June-2026 list as well", () => {
    const legacy = pickerCodesForDate("2026-05-20");
    expect(codes(legacy)).not.toContain("NSNC");
    expect(codes(pickerCodesForDate("2026-05-20", { canMarkNsnc: true }))).toContain("NSNC");
  });

  it("never duplicates NSNC when the base list already carries it", () => {
    const got = codes(pickerCodesForDate("2026-05-20", { canMarkNsnc: true }));
    expect(got.filter(c => c === "NSNC")).toHaveLength(1);
  });

  it("still returns the normal codes either way", () => {
    for (const opts of [{}, { canMarkNsnc: true }]) {
      const got = codes(pickerCodesForDate(ATT_SIMPLIFIED_START, opts));
      expect(got).toContain("P");
      expect(got).toContain("H");
      expect(got).toContain("OFF");
    }
  });
});

// ── LD retired 2026-10-12 ───────────────────────────────────────────────
describe("Login Day is retired but not erased", () => {
  it("cannot be planned any more", () => {
    expect(PLAN_CODES.has("LD")).toBe(false);
    expect(codes(PLAN_TYPES)).toEqual(expect.arrayContaining(["P", "H", "OFF"]));
    expect(codes(PLAN_TYPES)).not.toContain("LD");
  });

  // 465 rows were planned LD between Jun and Oct 2026. Dropping the code
  // from ATTENDANCE_TYPES would render every one of those cells blank.
  it("keeps its definition so historical cells still render", () => {
    expect(ATT_MAP.LD).toBeTruthy();
    expect(ATT_MAP.LD.label).toBe("Login Day");
  });

  it("is not an actual-status option either", () => {
    expect(SIMPLIFIED_CODES.has("LD")).toBe(false);
  });
});

describe("a Login Day no longer expects a check-in", () => {
  const unchecked = (planned) => ({
    planned_code: planned, status: null, checked_in_at: null,
    date: "2026-09-10", shift_end: "17:00",
  });
  // Well after any cutoff, so only the plan code decides.
  const later = new Date("2026-09-11T12:00:00Z");

  it("does not flag LD, the way it does P and H", () => {
    expect(isMissingCheckIn(unchecked("P"), later)).toBe(true);
    expect(isMissingCheckIn(unchecked("H"), later)).toBe(true);
    expect(isMissingCheckIn(unchecked("LD"), later)).toBe(false);
  });

  it("still never flags OFF", () => {
    expect(isMissingCheckIn(unchecked("OFF"), later)).toBe(false);
  });
});

describe("Attendance Health ignores Login Days", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const row = (date, planned, status) => ({ date, planned_code: planned, status, checked_in_at: status ? `${date}T09:00:00Z` : null });

  it("leaves LD out of the denominator entirely", () => {
    // Two real scheduled days, both attended, plus three unchecked LD days.
    // Health is 100% — the LD days neither help nor hurt.
    const rows = [
      row("2026-09-01", "P", "P"),
      row("2026-09-02", "H", "H"),
      row("2026-09-03", "LD", null),
      row("2026-09-04", "LD", null),
      row("2026-09-07", "LD", null),
    ];
    const h = computeAttendanceHealth(rows, "2026-09", now);
    expect(h.scheduledDays).toBe(2);
    expect(h.absentDays).toBe(0);
    expect(h.healthPct).toBe(100);
  });

  it("a month of nothing but Login Days has no health to report", () => {
    const rows = [row("2026-09-03", "LD", null), row("2026-09-04", "LD", null)];
    const h = computeAttendanceHealth(rows, "2026-09", now);
    expect(h.scheduledDays).toBe(0);
    expect(h.healthPct).toBeNull();  // "—", not 0% — 0% reads as "never showed up"
  });

  it("still counts a genuine no-show on a scheduled day", () => {
    const rows = [row("2026-09-01", "P", "P"), row("2026-09-02", "P", "NSNC")];
    const h = computeAttendanceHealth(rows, "2026-09", now);
    expect(h.scheduledDays).toBe(2);
    expect(h.absentDays).toBe(1);
    expect(h.healthPct).toBe(50);
  });
});
