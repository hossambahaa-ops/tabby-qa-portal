import { describe, it, expect } from "vitest";
import {
  OCCUPANCY_RATES, ratesFrom, productiveMinutes, occupancyPct, dailyOccupancyPct,
} from "../src/lib/occupancy.js";

// THE RULE (Hossam, 2026-10-01): a side-by-side takes 20 minutes, an ordinary
// evaluation 15. So the surcharge is the 5-minute DIFFERENCE, and an SBS costs
// 15 + 5 = 20 in total.
//
// This file previously asserted the opposite — that an SBS cost 35 — because it
// was pinned to Mahmoud's "QA Duration Summary" formula `=(C*15)+(D*20)`, read
// as charging the SBS subset twice on purpose. Hossam has confirmed 20 is the
// real figure, so that sheet over-credits side-by-sides and Pulse no longer
// agrees with it. A mismatch against the QA Duration Summary is now EXPECTED;
// it is not evidence that this code is wrong.
//
// The inputs below are real Aug-2026 figures and were verified against Pulse
// exactly; only the expected percentages moved when the rate changed.
const AUG = [
  // qa,                 sbs, nonSbs, dsat, coaching, sideTaskMin, wd,  expected %
  ["abdulrahman.hesham",   0,      0,   83,        0,        5585, 14,  101.64],
  ["hagar.dawood",         0,      0,    2,        0,       10175, 19,  111.90],
  ["mohamed.salah",        0,      3,   48,        0,        5917, 16,   87.01],
  ["omar.mohammad",        0,      5,   72,        0,        6110, 15,  100.90],
  ["peter.mikhail",        0,      9,   84,        0,        7692, 19,   99.64],
  ["rana.salah",           0,      8,   85,        0,        8855, 21,  101.69],
  ["reem.mansour",         0,      0,   46,        0,        4098, 10,   99.75],
  ["hussam.khaled",       27,     14,  111,        3,        4120, 15,   92.01],
  ["amr.salah",          182,     71,   95,       14,        2655, 22,   87.17],
  ["pola.emad",          177,      1,   32,       45,        4845, 18,  118.40],
  ["youssef.housh",       89,    298,   34,       12,        3935, 22,  104.69],
  ["omar.abdelsamee",    156,     24,  108,       46,        4425, 22,  103.27],
  ["kyrillos.malak",     111,    151,   13,        2,        4380, 19,  100.00],
  ["zainab.hasan",        71,      0,  114,       16,        4310, 16,  103.13],
];

const parts = ([, sbs, nonSbs, dsat, coaching, sideTaskMin]) =>
  ({ sbs, nonSbs, dsat, coaching, sideTaskMin });

describe("occupancy on the agreed 15 / 20 rates", () => {
  it.each(AUG)("%s matches the agreed rule to 2dp", (...row) => {
    const [, , , , , , wd, expected] = row;
    expect(occupancyPct(parts(row), wd)).toBeCloseTo(expected, 2);
  });

  // The seven zero-SBS QAs are unaffected by the rate change in either
  // direction — the surcharge has nothing to apply to. They are the control
  // that the other constants (15 / 30 / side-task minutes) are untouched.
  it("leaves QAs who do no SBS completely unchanged", () => {
    for (const row of AUG.filter((r) => r[1] === 0)) {
      const [, sbs, nonSbs, dsat, coaching, side] = row;
      const wd = row[6];
      const noSurcharge = ((nonSbs + dsat + sbs) * 15 + coaching * 30 + side) / (wd * 480) * 100;
      expect(occupancyPct(parts(row), wd)).toBeCloseTo(noSurcharge, 10);
    }
  });
});

describe("an SBS is 20 minutes, 5 more than an ordinary evaluation", () => {
  it("charges a side-by-side 20 minutes: the 15 base plus the 5 surcharge", () => {
    expect(productiveMinutes({ sbs: 1 })).toBe(20);
  });

  it("charges an ordinary evaluation and a DSAT 15 each", () => {
    expect(productiveMinutes({ nonSbs: 1 })).toBe(15);
    expect(productiveMinutes({ dsat: 1 })).toBe(15);
  });

  it("makes a side-by-side cost exactly 5 minutes more than a desk evaluation", () => {
    expect(productiveMinutes({ sbs: 1 }) - productiveMinutes({ nonSbs: 1 })).toBe(5);
  });

  it("keeps the surcharge additive — never a replacement for the base", () => {
    // Writing `sbs * 20 + nonSbs * 15` happens to land on the same number here,
    // but only because the surcharge is 5. Guard the STRUCTURE, so that changing
    // the rate later cannot silently drop the base on SBS rows.
    const r = { ...OCCUPANCY_RATES, sbsSurchargeMin: 25 };
    expect(productiveMinutes({ sbs: 1 }, r)).toBe(40); // 15 base + 25, not 25
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
    expect(dailyOccupancyPct({ sbs: 1, sideTaskMin: 460 })).toBeCloseTo(100, 10);
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
