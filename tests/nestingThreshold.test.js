import { describe, it, expect } from "vitest";
import {
  PRIMARY, VALIDATION, REASSESSMENT, ATTRIBUTE_FAILS,
  BASELINE_THRESHOLD, SCORE_STEP,
  simulate, tradeOffCurve, thresholdScale,
  medianScore, meanScore, modeScore,
  alignedShare, PRIMARY_SCALE,
} from "../src/lib/nestingThreshold.js";

// This page is shown to C-level to pick a policy threshold, so the arithmetic
// is pinned against the source batch figures. If a number here changes, either
// the data was replaced on purpose or something is wrong -- there is no third
// case, and "the test looks stale" is not a reason to edit an expectation.

describe("the transcribed data matches the source totals", () => {
  it("primary model is 80 KSA + 57 Egypt = 137 agents", () => {
    const ksa = PRIMARY.byScore.reduce((n, r) => n + r.ksa, 0);
    const egypt = PRIMARY.byScore.reduce((n, r) => n + r.egypt, 0);
    expect(ksa).toBe(80);
    expect(egypt).toBe(57);
    expect(ksa + egypt).toBe(PRIMARY.agents);
  });

  it("validation pilot is 42 agents, all KSA", () => {
    expect(VALIDATION.byScore.reduce((n, r) => n + r.ksa, 0)).toBe(42);
    expect(VALIDATION.byScore.reduce((n, r) => n + r.egypt, 0)).toBe(0);
  });

  it("re-assessment cohort is 16 agents", () => {
    expect(REASSESSMENT.byScore.reduce((n, r) => n + r.ksa + r.egypt, 0)).toBe(16);
  });

  it("every score sits on the 6.25 grid the model can actually produce", () => {
    for (const ds of [PRIMARY, VALIDATION, REASSESSMENT]) {
      for (const row of ds.byScore) {
        expect(Number.isInteger(row.score / SCORE_STEP), `${ds.id} ${row.score}`).toBe(true);
      }
    }
  });

  it("reproduces the reported mean of 81.6 and median of 87.5", () => {
    expect(meanScore(PRIMARY)).toBeCloseTo(81.57, 2);
    expect(medianScore(PRIMARY)).toBe(87.5);
  });
});

describe("headline pass rates", () => {
  it("primary model passes 110 of 137 at the 75% baseline (80.3%)", () => {
    const r = simulate(75, "all");
    expect(r.pass).toBe(110);
    expect(r.fail).toBe(27);
    expect(r.total).toBe(137);
    expect(r.passRate).toBeCloseTo(80.29, 2);
  });

  it("native V2 pilot passes 33 of 42 at 75% (78.6%) -- within 2pts of primary", () => {
    const v = simulate(75, "all", VALIDATION);
    expect(v.pass).toBe(33);
    expect(v.passRate).toBeCloseTo(78.57, 2);
    // The claim the validation panel makes, asserted rather than asserted-at.
    expect(Math.abs(v.passRate - simulate(75, "all").passRate)).toBeLessThan(2);
  });

  it("regions decompose exactly into the combined figure", () => {
    for (const t of thresholdScale()) {
      const all = simulate(t, "all"), ksa = simulate(t, "ksa"), eg = simulate(t, "egypt");
      expect(ksa.pass + eg.pass, `pass @${t}`).toBe(all.pass);
      expect(ksa.total + eg.total, `total @${t}`).toBe(all.total);
    }
  });
});

describe("change versus the 75% baseline", () => {
  it("raising the bar to 81.25 puts 13 more agents into fail", () => {
    // The worked example from the brief.
    expect(simulate(81.25, "all").deltaFail).toBe(13);
  });

  it("is zero at the baseline itself, and never negative above it", () => {
    expect(simulate(BASELINE_THRESHOLD, "all").deltaFail).toBe(0);
    for (const t of thresholdScale().filter((t) => t > BASELINE_THRESHOLD)) {
      expect(simulate(t, "all").deltaFail, `@${t}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("relaxing the bar below the baseline saves agents", () => {
    expect(simulate(68.75, "all").deltaFail).toBeLessThan(0);
  });
});

describe("borderline population", () => {
  it("counts agents sitting exactly on the threshold", () => {
    // 13 agents score exactly 75.00 (8 KSA + 5 Egypt) -- these are the ones a
    // one-step move would flip.
    expect(simulate(75, "all").borderline).toBe(13);
    expect(simulate(75, "ksa").borderline).toBe(8);
    expect(simulate(75, "egypt").borderline).toBe(5);
  });

  it("is exactly the group that fails when the threshold moves up one step", () => {
    for (const t of thresholdScale().filter((t) => t < 100)) {
      const here = simulate(t, "all");
      const next = simulate(t + SCORE_STEP, "all");
      expect(here.pass - next.pass, `@${t}`).toBe(here.borderline);
    }
  });
});

describe("the trade-off curve", () => {
  const curve = tradeOffCurve("all");

  it("spans the whole scale and is monotonically non-increasing", () => {
    expect(curve[0].threshold).toBe(25);
    expect(curve[curve.length - 1].threshold).toBe(100);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].passRate, `@${curve[i].threshold}`)
        .toBeLessThanOrEqual(curve[i - 1].passRate);
    }
  });

  it("passes everyone at the bottom of the scale", () => {
    expect(curve[0].passRate).toBe(100);
  });

  it("agrees with simulate() at every point", () => {
    for (const p of curve) {
      expect(p.passRate).toBeCloseTo(simulate(p.threshold, "all").passRate, 10);
    }
  });
});

describe("re-assessment cohort", () => {
  // The brief quoted a median of 93.75. With n=16 the median is the mean of
  // the 8th (87.5) and 9th (93.75) values, so it is 90.625 -- 93.75 is the
  // MODE. The panel reports both; this test stops the wrong one being shown.
  it("has median 90.625, not 93.75", () => {
    expect(medianScore(REASSESSMENT)).toBe(90.625);
  });

  it("has mode 93.75", () => {
    expect(modeScore(REASSESSMENT)).toBe(93.75);
  });

  it("recovers almost everyone past the 75% bar", () => {
    const r = simulate(75, "all", REASSESSMENT);
    expect(r.pass).toBe(15);
    expect(r.total).toBe(16);
  });
});

describe("attribute failure rates", () => {
  it("are ordered worst-first so the panel can render them as given", () => {
    const rates = ATTRIBUTE_FAILS.rows.map((r) => r.rate);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
  });

  it("names Resolution and Investigation as the top two", () => {
    expect(ATTRIBUTE_FAILS.rows.slice(0, 2).map((r) => r.attribute))
      .toEqual(["Resolution", "Investigation"]);
  });

  it("flags Compliance as unscored, since it zeroes a ticket rather than losing points", () => {
    expect(ATTRIBUTE_FAILS.rows.find((r) => r.attribute === "Compliance").scored).toBe(false);
  });
});

describe("aligning two cohorts for comparison", () => {
  it("puts the V2 pilot on the same 13-point scale as the primary model", () => {
    const rows = alignedShare(VALIDATION);
    expect(rows.map((r) => r.score)).toEqual(PRIMARY_SCALE);
  });

  it("fills the buckets the pilot never produced with a real zero", () => {
    const rows = alignedShare(VALIDATION);
    // 42 agents, none of whom scored 25, 31.25, 43.75 or 56.25.
    for (const s of [25, 31.25, 43.75, 56.25]) {
      const row = rows.find((r) => r.score === s);
      expect(row.count, `score ${s}`).toBe(0);
      expect(row.share, `score ${s}`).toBe(0);
    }
  });

  it("preserves the underlying counts while normalising", () => {
    const rows = alignedShare(VALIDATION);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(VALIDATION.agents);
    expect(rows.reduce((n, r) => n + r.share, 0)).toBeCloseTo(100, 6);
  });

  it("normalises cohorts of very different size onto a comparable axis", () => {
    // The whole point: 42 vs 137 agents must not make the pilot look tiny.
    const pilot = alignedShare(VALIDATION);
    const primary = alignedShare(PRIMARY);
    expect(primary.reduce((n, r) => n + r.share, 0)).toBeCloseTo(100, 6);
    // 10 of 42 pilot agents scored 87.5 -> 23.8%, vs 21 of 137 -> 15.3%.
    expect(pilot.find((r) => r.score === 87.5).share).toBeCloseTo(23.81, 2);
    expect(primary.find((r) => r.score === 87.5).share).toBeCloseTo(15.33, 2);
  });

  it("respects the region filter on the primary model", () => {
    const ksa = alignedShare(PRIMARY, "ksa");
    expect(ksa.reduce((n, r) => n + r.count, 0)).toBe(80);
    expect(ksa.reduce((n, r) => n + r.share, 0)).toBeCloseTo(100, 6);
  });
});
