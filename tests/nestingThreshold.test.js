import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_OLD, ASSESSMENT_NEW4, REASSESSMENT_OLD, REASSESSMENT_NEW4,
  ATTRIBUTE_FAILS, BASELINE_THRESHOLD, SCORE_STEP, SCORE_SCALE,
  simulate, tradeOffCurve, thresholdScale, alignedShare,
  medianScore, meanScore,
} from "../src/lib/nestingThreshold.js";

// These figures came out of BigQuery (`qa_crm_qa_tasks`, database tabby-dp) on
// 2026-09-06 and are pinned here because the page drives a policy decision at
// C-level. If one changes, either the warehouse was re-queried on purpose or
// the transcription is wrong — there is no third case.
//
// The V2-scored cohorts were removed on 2026-09-06. The page now compares ONE
// population (the legacy cohort) under TWO scorings: the full old checklist,
// and only the four attributes the new checklist keeps.

const COHORTS = [
  ["assessment · old",  ASSESSMENT_OLD,    177],
  ["assessment · new4", ASSESSMENT_NEW4,   177],
  ["re-assessment · old",  REASSESSMENT_OLD,  33],
  ["re-assessment · new4", REASSESSMENT_NEW4, 33],
];

describe("cohort totals match the warehouse", () => {
  it.each(COHORTS)("%s has the agent count it claims", (_name, ds, expected) => {
    const counted = ds.byScore.reduce((n, r) => n + r.ksa + r.other, 0);
    expect(counted).toBe(expected);
    expect(counted).toBe(ds.agents);
  });

  // The load-bearing property of the whole page: both scorings describe the
  // SAME people. If these ever diverge the comparison stops being paired and
  // every "the gap is the scoring change" claim on the page becomes false.
  it("scores the identical population under both scorings", () => {
    for (const [a, b] of [[ASSESSMENT_OLD, ASSESSMENT_NEW4],
                          [REASSESSMENT_OLD, REASSESSMENT_NEW4]]) {
      expect(b.agents).toBe(a.agents);
      expect(b.byScore.reduce((n, r) => n + r.ksa, 0))
        .toBe(a.byScore.reduce((n, r) => n + r.ksa, 0));
      expect(b.byScore.reduce((n, r) => n + r.other, 0))
        .toBe(a.byScore.reduce((n, r) => n + r.other, 0));
    }
  });

  it("splits the assessment 96 KSA / 81 non-KSA", () => {
    expect(ASSESSMENT_OLD.byScore.reduce((n, r) => n + r.ksa, 0)).toBe(96);
    expect(ASSESSMENT_OLD.byScore.reduce((n, r) => n + r.other, 0)).toBe(81);
  });

  it("keeps every bucket on the 6.25 grid, starting at 0", () => {
    expect(SCORE_SCALE[0]).toBe(0);
    expect(SCORE_SCALE.at(-1)).toBe(100);
    for (const [, ds] of COHORTS.map((c) => [c[0], c[1]])) {
      for (const row of ds.byScore) {
        expect(Number.isInteger(row.score / SCORE_STEP)).toBe(true);
      }
    }
  });

  it("keeps the agent who averaged zero on the old checklist", () => {
    // A real agent with a compliance violation on every ticket. Truncating the
    // axis at 25 would have silently dropped them.
    expect(ASSESSMENT_OLD.byScore.find((r) => r.score === 0).ksa).toBe(1);
  });
});

describe("pass rates reproduce BigQuery exactly", () => {
  // Floor-bucketing is lossless at grid thresholds; these assertions are what
  // prove it, because BigQuery computed the same numbers from raw scores.
  it("assessment on the old checklist: 143 of 177 at 75% (80.8%)", () => {
    const r = simulate(75, "all", ASSESSMENT_OLD);
    expect(r.pass).toBe(143);
    expect(r.total).toBe(177);
    expect(r.passRate).toBeCloseTo(80.79, 1);
  });

  it("assessment on the new 4 only: 168 of 177 at 75% (94.9%)", () => {
    const r = simulate(75, "all", ASSESSMENT_NEW4);
    expect(r.pass).toBe(168);
    expect(r.passRate).toBeCloseTo(94.9, 1);
  });

  it("re-assessment on the old checklist: 28 of 33 at 75% (84.8%)", () => {
    const r = simulate(75, "all", REASSESSMENT_OLD);
    expect(r.pass).toBe(28);
    expect(r.passRate).toBeCloseTo(84.85, 1);
  });

  it("re-assessment on the new 4 only: 31 of 33 at 75% (93.9%)", () => {
    const r = simulate(75, "all", REASSESSMENT_NEW4);
    expect(r.pass).toBe(31);
    expect(r.passRate).toBeCloseTo(93.94, 1);
  });
});

describe("scoring on the new four alone is easier", () => {
  // The finding the page exists to show. Dropping 33 of the 100 old points
  // removes places agents lost marks, so the same work scores higher. If this
  // ever inverts, the mapping has been changed and the page's conclusion with
  // it — that should fail loudly rather than quietly redraw.
  it("passes more agents at every candidate threshold", () => {
    for (const t of thresholdScale().filter((t) => t >= 50 && t <= 93.75)) {
      expect(simulate(t, "all", ASSESSMENT_NEW4).passRate)
        .toBeGreaterThanOrEqual(simulate(t, "all", ASSESSMENT_OLD).passRate);
    }
  });

  it("lifts the mean by roughly 6 points", () => {
    const lift = meanScore(ASSESSMENT_NEW4) - meanScore(ASSESSMENT_OLD);
    expect(lift).toBeGreaterThan(3);
    expect(lift).toBeLessThan(10);
  });

  it("does not narrow as the bar rises", () => {
    // Worth pinning, because the intuition is wrong. The gap is 14.1pts at 75%
    // and WIDENS to 16.9 at 87.5 and 20.3 at 93.75 — the new-4 scoring is most
    // generous exactly where a stricter bar would be set. An earlier reading of
    // this data claimed the gap narrowed above 85%; it does not, and the
    // difference matters because it kills "just raise the bar to compensate".
    const gap = (t) => simulate(t, "all", ASSESSMENT_NEW4).passRate
                     - simulate(t, "all", ASSESSMENT_OLD).passRate;
    expect(gap(75)).toBeCloseTo(14.1, 0);
    expect(gap(87.5)).toBeGreaterThan(gap(75));
    expect(gap(93.75)).toBeGreaterThan(gap(87.5));
  });

  it("has no threshold where the new-4 bar matches the old one at 75%", () => {
    // The obvious fix — "keep the same pass rate, just move the bar" — has no
    // solution on the grid. Old at 75% passes 80.8%. The new-4 scoring passes
    // 87.0% at 81.25 and 67.8% at 87.5: it steps straight over the target.
    const target = simulate(75, "all", ASSESSMENT_OLD).passRate;
    const matches = thresholdScale().filter((t) =>
      Math.abs(simulate(t, "all", ASSESSMENT_NEW4).passRate - target) < 2);
    expect(matches).toHaveLength(0);
  });
});

describe("region decomposition", () => {
  it("KSA + non-KSA equals the combined figure at every threshold", () => {
    for (const [, ds] of COHORTS.map((c) => [c[0], c[1]])) {
      for (const t of thresholdScale()) {
        const all = simulate(t, "all", ds);
        const ksa = simulate(t, "ksa", ds);
        const other = simulate(t, "other", ds);
        expect(ksa.pass + other.pass).toBe(all.pass);
        expect(ksa.total + other.total).toBe(all.total);
      }
    }
  });
});

describe("change versus the 75% baseline", () => {
  it("is zero at the baseline and never negative above it", () => {
    expect(simulate(BASELINE_THRESHOLD, "all").deltaFail).toBe(0);
    for (const t of thresholdScale().filter((t) => t > BASELINE_THRESHOLD)) {
      expect(simulate(t, "all").deltaFail).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("borderline population", () => {
  it("is exactly the group that fails when the threshold moves up one step", () => {
    for (const [, ds] of COHORTS.map((c) => [c[0], c[1]])) {
      for (const t of thresholdScale().filter((t) => t < 100)) {
        const here = simulate(t, "all", ds);
        const next = simulate(t + SCORE_STEP, "all", ds);
        expect(here.pass - next.pass).toBe(here.borderline);
      }
    }
  });
});

describe("the trade-off curve", () => {
  it("is monotonically non-increasing for every cohort", () => {
    for (const [, ds] of COHORTS.map((c) => [c[0], c[1]])) {
      const curve = tradeOffCurve("all", ds);
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].passRate).toBeLessThanOrEqual(curve[i - 1].passRate);
      }
    }
  });
});

describe("aligning cohorts for comparison", () => {
  it("puts both scorings on one axis as shares of their own total", () => {
    const a = alignedShare(ASSESSMENT_OLD);
    const b = alignedShare(ASSESSMENT_NEW4);
    expect(b.map((r) => r.score)).toEqual(SCORE_SCALE);
    expect(a.reduce((n, r) => n + r.share, 0)).toBeCloseTo(100, 6);
    expect(b.reduce((n, r) => n + r.share, 0)).toBeCloseTo(100, 6);
    expect(b.reduce((n, r) => n + r.count, 0)).toBe(177);
  });
});

describe("summary statistics", () => {
  it("reports the bucket median, which floors the true median", () => {
    expect(medianScore(ASSESSMENT_OLD)).toBe(87.5);
    expect(medianScore(ASSESSMENT_NEW4)).toBeGreaterThanOrEqual(medianScore(ASSESSMENT_OLD));
  });

  it("sits below the warehouse mean by no more than one bucket", () => {
    // Floor-bucketing can only ever LOWER the mean, by at most SCORE_STEP.
    // Comparing the bucket mean directly against BigQuery's raw mean to 0dp
    // can never pass — the gap is ~3 points by construction, not an error.
    // Raw means from BigQuery on 2026-09-06: old 82.98, new-4 89.43.
    const check = (ds, rawMean) => {
      const m = meanScore(ds);
      expect(m).toBeLessThanOrEqual(rawMean);
      expect(m).toBeGreaterThan(rawMean - SCORE_STEP);
    };
    check(ASSESSMENT_OLD, 82.98);
    check(ASSESSMENT_NEW4, 89.43);
  });
});

describe("attribute failure rates", () => {
  it("are flagged as carried over rather than re-queried", () => {
    expect(ATTRIBUTE_FAILS.provisional).toBe(true);
  });

  it("name Resolution and Investigation as the top two", () => {
    expect(ATTRIBUTE_FAILS.rows.slice(0, 2).map((r) => r.attribute))
      .toEqual(["Resolution", "Investigation"]);
  });
});
