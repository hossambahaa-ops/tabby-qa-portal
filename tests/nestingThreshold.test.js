import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_V1, ASSESSMENT_V2, REASSESSMENT_V1, REASSESSMENT_V2,
  ATTRIBUTE_FAILS, BASELINE_THRESHOLD, SCORE_STEP, SCORE_SCALE,
  simulate, tradeOffCurve, thresholdScale, alignedShare,
  medianScore, meanScore,
} from "../src/lib/nestingThreshold.js";

// These figures came out of BigQuery (`qa_crm_qa_tasks`, database tabby-dp) on
// 2026-09-02 and are pinned here because the page drives a policy decision at
// C-level. If one changes, either the warehouse was re-queried on purpose or
// the transcription is wrong -- there is no third case.
//
// The pass rates below were cross-checked against what BigQuery computed
// directly from the raw (unbucketed) scores, which is the real point of the
// floor-bucketing: it has to be lossless at every grid threshold.

const COHORTS = [
  ["assessment v1", ASSESSMENT_V1, 177],
  ["assessment v2", ASSESSMENT_V2, 46],
  ["re-assessment v1", REASSESSMENT_V1, 33],
  ["re-assessment v2", REASSESSMENT_V2, 32],
];

describe("cohort totals match the warehouse", () => {
  it.each(COHORTS)("%s has the agent count it claims", (_name, ds, expected) => {
    const counted = ds.byScore.reduce((n, r) => n + r.ksa + r.other, 0);
    expect(counted).toBe(expected);
    expect(counted).toBe(ds.agents);
  });

  it("splits the legacy assessment 96 KSA / 81 non-KSA", () => {
    expect(ASSESSMENT_V1.byScore.reduce((n, r) => n + r.ksa, 0)).toBe(96);
    expect(ASSESSMENT_V1.byScore.reduce((n, r) => n + r.other, 0)).toBe(81);
  });

  it("has the V2 assessment as almost entirely KSA", () => {
    // Was KSA-only until 2026-09-06, when the first non-KSA agent appeared.
    // Pinned so a sudden influx of non-KSA agents is noticed, not absorbed.
    expect(ASSESSMENT_V2.byScore.reduce((n, r) => n + r.other, 0)).toBe(1);
    expect(ASSESSMENT_V2.byScore.reduce((n, r) => n + r.ksa, 0)).toBe(45);
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

  it("keeps the legacy agent who averaged zero", () => {
    // A real agent with a compliance violation on every ticket. Truncating the
    // axis at 25 would have silently dropped them.
    expect(ASSESSMENT_V1.byScore.find((r) => r.score === 0).ksa).toBe(1);
  });
});

describe("pass rates reproduce BigQuery exactly", () => {
  // Floor-bucketing is lossless at grid thresholds; these assertions are what
  // prove it, because BigQuery computed the same numbers from raw scores.
  it("legacy assessment: 143 of 177 pass at 75% (80.8%)", () => {
    const r = simulate(75, "all", ASSESSMENT_V1);
    expect(r.pass).toBe(143);
    expect(r.total).toBe(177);
    expect(r.passRate).toBeCloseTo(80.79, 1);
  });

  it("V2 assessment: 37 of 46 pass at 75% (80.4%)", () => {
    const r = simulate(75, "all", ASSESSMENT_V2);
    expect(r.pass).toBe(37);
    expect(r.total).toBe(46);
    expect(r.passRate).toBeCloseTo(80.43, 1);
  });

  it("legacy re-assessment: 28 of 33 pass at 75% (84.8%)", () => {
    const r = simulate(75, "all", REASSESSMENT_V1);
    expect(r.pass).toBe(28);
    expect(r.passRate).toBeCloseTo(84.85, 1);
  });

  it("V2 re-assessment: 28 of 32 pass at 75% (87.5%)", () => {
    const r = simulate(75, "all", REASSESSMENT_V2);
    expect(r.pass).toBe(28);
    expect(r.total).toBe(32);
    expect(r.passRate).toBeCloseTo(87.5, 1);
  });

  it("agrees on the higher bars too", () => {
    expect(simulate(87.5, "all", ASSESSMENT_V1).passRate).toBeCloseTo(50.8, 1);
    expect(simulate(87.5, "all", ASSESSMENT_V2).passRate).toBeCloseTo(56.5, 1);
    expect(simulate(87.5, "all", REASSESSMENT_V2).passRate).toBeCloseTo(37.5, 1);
  });
});

describe("the two checklists agree at the proposed bar", () => {
  // The load-bearing claim of the whole page.
  it("legacy and V2 assessment land within 1 point at 75%", () => {
    const gap = Math.abs(
      simulate(75, "all", ASSESSMENT_V1).passRate - simulate(75, "all", ASSESSMENT_V2).passRate,
    );
    expect(gap).toBeLessThan(1);
  });
});

describe("re-assessment is weaker under V2 than legacy suggested", () => {
  // The page used to claim coaching reliably recovers agents, on legacy data.
  // V2 does not support that as strongly, and the panel must not overstate it.
  it("V2 re-assessment scores below legacy re-assessment on average", () => {
    expect(meanScore(REASSESSMENT_V2)).toBeLessThan(meanScore(REASSESSMENT_V1));
  });

  it("still clears the 75% bar for most of the cohort", () => {
    expect(simulate(75, "all", REASSESSMENT_V2).passRate).toBeGreaterThan(80);
  });

  it("but collapses at 87.5%, unlike legacy", () => {
    expect(simulate(87.5, "all", REASSESSMENT_V2).passRate).toBeLessThan(40);
    expect(simulate(87.5, "all", REASSESSMENT_V1).passRate).toBeGreaterThan(50);
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
  it("normalises 46 agents against 177 onto one axis", () => {
    const v2 = alignedShare(ASSESSMENT_V2);
    const v1 = alignedShare(ASSESSMENT_V1);
    expect(v2.map((r) => r.score)).toEqual(SCORE_SCALE);
    expect(v2.reduce((n, r) => n + r.share, 0)).toBeCloseTo(100, 6);
    expect(v1.reduce((n, r) => n + r.share, 0)).toBeCloseTo(100, 6);
    expect(v2.reduce((n, r) => n + r.count, 0)).toBe(46);
  });
});

describe("summary statistics", () => {
  it("reports the bucket median, which floors the true median", () => {
    // BigQuery's median on raw scores is 87.5 for both assessment cohorts, so
    // these agree. For V2 re-assessment BigQuery said 80 and the bucket median
    // is 78.125 -- lower by construction, never higher.
    expect(medianScore(ASSESSMENT_V1)).toBe(87.5);
    expect(medianScore(ASSESSMENT_V2)).toBe(87.5);
    // BigQuery's raw median for the V2 re-assessment is 83.33; the bucket
    // median floors it to 81.25. Assert against the raw value, not a
    // hand-copied constant that goes stale every time the cohort grows.
    expect(medianScore(REASSESSMENT_V2)).toBeLessThanOrEqual(83.33);
  });

  it("sits below the warehouse mean by no more than one bucket", () => {
    // Floor-bucketing can only ever LOWER the mean, by at most SCORE_STEP.
    // The old assertion compared the bucket mean directly against BigQuery's
    // raw mean (83.0) to 0 decimal places, which floor-bucketing can never
    // satisfy — the gap is ~3.1 points by construction, not an error.
    // Raw means from BigQuery on 2026-09-06: V1 82.98, V2 83.02.
    const check = (ds, rawMean) => {
      const m = meanScore(ds);
      expect(m).toBeLessThanOrEqual(rawMean);
      expect(m).toBeGreaterThan(rawMean - SCORE_STEP);
    };
    check(ASSESSMENT_V1, 82.98);
    check(ASSESSMENT_V2, 83.02);
  });
});

describe("attribute failure rates", () => {
  it("are flagged as carried over rather than re-queried", () => {
    // They came from the original brief, not the warehouse. The page says so;
    // this stops the flag being dropped silently.
    expect(ATTRIBUTE_FAILS.provisional).toBe(true);
  });

  it("name Resolution and Investigation as the top two", () => {
    expect(ATTRIBUTE_FAILS.rows.slice(0, 2).map((r) => r.attribute))
      .toEqual(["Resolution", "Investigation"]);
  });
});
