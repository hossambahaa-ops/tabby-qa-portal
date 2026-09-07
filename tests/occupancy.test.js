import { describe, it, expect } from "vitest";
import {
  OCCUPANCY_RATES, ratesFrom, productiveMinutes, occupancyPct, dailyOccupancyPct,
} from "../src/lib/occupancy.js";

// The figures below are Aug-2026, taken from Mahmoud's "QA Duration Summary"
// tab in Quality Team Performance.xlsx — the sheet the business actually runs
// on. Its formula is `=(C*15)+(D*20)` where C is ALL evaluations and D is the
// SBS subset, so an SBS evaluation is charged both. Every input (eval counts,
// SBS counts, working days, side-task minutes, coaching) was verified to match
// Pulse exactly; only the arithmetic differed.
//
// If one of these expectations changes, either the sheet's formula changed on
// purpose or someone has reintroduced the `sbs * 20` bug. There is no third case.
const AUG = [
  // qa,                 sbs, nonSbs, dsat, coaching, sideTaskMin, wd,  sheet %
  ["abdulrahman.hesham",   0,      0,   83,        0,        5585, 14,  101.64],
  ["hagar.dawood",         0,      0,    2,        0,       10175, 19,  111.90],
  ["mohamed.salah",        0,      3,   48,        0,        5917, 16,   87.01],
  ["omar.mohammad",        0,      5,   72,        0,        6110, 15,  100.90],
  ["peter.mikhail",        0,      9,   84,        0,        7692, 19,   99.64],
  ["rana.salah",           0,      8,   85,        0,        8855, 21,  101.69],
  ["reem.mansour",         0,      0,   46,        0,        4098, 10,   99.75],
  ["hussam.khaled",       27,     14,  111,        3,        4120, 15,   97.64],
  ["amr.salah",          182,     71,   95,       14,        2655, 22,  113.02],
  ["pola.emad",          177,      1,   32,       45,        4845, 18,  149.13],
  ["youssef.housh",       89,    298,   34,       12,        3935, 22,  117.33],
  ["omar.abdelsamee",    156,     24,  108,       46,        4425, 22,  125.43],
  ["kyrillos.malak",     111,    151,   13,        2,        4380, 19,  118.26],
  ["zainab.hasan",        71,      0,  114,       16,        4310, 16,  116.99],
];

const parts = ([, sbs, nonSbs, dsat, coaching, sideTaskMin]) =>
  ({ sbs, nonSbs, dsat, coaching, sideTaskMin });

describe("occupancy reproduces the business sheet", () => {
  it.each(AUG)("%s matches the sheet to 2dp", (...row) => {
    const [, , , , , , wd, expected] = row;
    expect(occupancyPct(parts(row), wd)).toBeCloseTo(expected, 2);
  });

  // The seven zero-SBS QAs are the control group: with no side-by-side work the
  // surcharge cancels out, so they agreed with the OLD buggy code too. They are
  // what proved the rest of the constants (15 / 30 / side-task minutes) were
  // already right and isolated the bug to the SBS term alone.
  it("agrees with the old formula exactly when a QA does no SBS", () => {
    for (const row of AUG.filter((r) => r[1] === 0)) {
      const [, sbs, nonSbs, dsat, coaching, side] = row;
      const wd = row[6];
      const buggy = (sbs * 20 + (nonSbs + dsat) * 15 + coaching * 30 + side) / (wd * 480) * 100;
      expect(occupancyPct(parts(row), wd)).toBeCloseTo(buggy, 10);
    }
  });
});

describe("the SBS surcharge is additive, not a replacement", () => {
  it("charges a side-by-side 35 minutes: the 15 base plus the 20 surcharge", () => {
    expect(productiveMinutes({ sbs: 1 })).toBe(35);
  });

  it("charges an ordinary evaluation and a DSAT 15 each", () => {
    expect(productiveMinutes({ nonSbs: 1 })).toBe(15);
    expect(productiveMinutes({ dsat: 1 })).toBe(15);
  });

  it("makes a side-by-side cost 20 minutes MORE than a desk evaluation", () => {
    // Under the old `sbs * 20` bug the difference was only 5 minutes, which is
    // implausibly cheap for sitting with an agent — the tell that it was wrong.
    expect(productiveMinutes({ sbs: 1 }) - productiveMinutes({ nonSbs: 1 })).toBe(20);
  });

  it("differs from the old buggy formula by exactly sbs × 15", () => {
    for (const row of AUG) {
      const [, sbs, nonSbs, dsat, coaching, side] = row;
      const wd = row[6];
      const buggyMin = sbs * 20 + (nonSbs + dsat) * 15 + coaching * 30 + side;
      expect(productiveMinutes(parts(row)) - buggyMin).toBe(sbs * 15);
    }
  });
});

describe("components", () => {
  it("charges coaching 30 minutes and passes side-task minutes straight through", () => {
    expect(productiveMinutes({ coaching: 2 })).toBe(60);
    expect(productiveMinutes({ sideTaskMin: 137 })).toBe(137);
  });

  it("adds opt-in extra minutes (ABT, login) without touching the eval maths", () => {
    const base = productiveMinutes({ sbs: 3, nonSbs: 4 });
    expect(productiveMinutes({ sbs: 3, nonSbs: 4, extraMin: 380 })).toBe(base + 380);
  });

  it("treats missing, null and non-numeric inputs as zero", () => {
    expect(productiveMinutes()).toBe(0);
    expect(productiveMinutes({ sbs: null, nonSbs: undefined, dsat: "x" })).toBe(0);
  });
});

describe("the denominator", () => {
  it("is null — not 0% — when working days are unknown", () => {
    // 0% reads as "did nothing"; null renders as "—" meaning "we don't know".
    for (const wd of [0, null, undefined, NaN, -3]) {
      expect(occupancyPct({ sbs: 10 }, wd)).toBeNull();
    }
  });

  it("does not cap above 100%", () => {
    expect(occupancyPct({ sideTaskMin: 960 }, 1)).toBeCloseTo(200, 10);
  });

  it("uses one shift for a single day", () => {
    expect(dailyOccupancyPct({ sbs: 1, sideTaskMin: 445 })).toBeCloseTo(100, 10);
  });
});

describe("team_targets overrides", () => {
  it("falls back to the defaults when nothing is configured", () => {
    expect(ratesFrom(() => null)).toEqual(OCCUPANCY_RATES);
    expect(ratesFrom(undefined)).toEqual(OCCUPANCY_RATES);
  });

  it("reads overrides, and treats sbs_duration_minutes as the SURCHARGE", () => {
    const r = ratesFrom((k) => ({
      sbs_duration_minutes: { target_value: "25" },
      daily_working_hours: { target_value: "7" },
    })[k]);
    expect(r.sbsSurchargeMin).toBe(25);
    expect(r.shiftMin).toBe(420);
    expect(productiveMinutes({ sbs: 1 }, r)).toBe(40); // 15 base + 25 surcharge
  });

  it("ignores unparseable target values rather than producing NaN", () => {
    const r = ratesFrom(() => ({ target_value: "" }));
    expect(r).toEqual(OCCUPANCY_RATES);
    expect(Number.isFinite(productiveMinutes({ sbs: 2 }, r))).toBe(true);
  });
});
