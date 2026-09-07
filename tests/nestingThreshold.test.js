import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_OLD, ASSESSMENT_NEW4,
  ATTRIBUTE_FAILS, HISTORY, BASELINE_THRESHOLD, SCORE_STEP, SCORE_SCALE,
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

// Re-assessment removed 2026-09-07 — it answered a different question (does
// coaching recover a failed agent) and did not belong on a page about setting
// the pass mark.
const COHORTS = [
  ["assessment · old",  ASSESSMENT_OLD,  177],
  ["assessment · new4", ASSESSMENT_NEW4, 177],
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
    for (const [a, b] of [[ASSESSMENT_OLD, ASSESSMENT_NEW4]]) {
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

  it("assessment on the new 4, all-or-nothing: 118 of 177 at 75% (66.7%)", () => {
    const r = simulate(75, "all", ASSESSMENT_NEW4);
    expect(r.pass).toBe(118);
    expect(r.total).toBe(177);
    expect(r.passRate).toBeCloseTo(66.7, 1);
  });

});

describe("all-or-nothing scoring is stricter than the old checklist", () => {
  // Replaces a block asserting the two scorings landed within a point. That
  // held under PROPORTIONAL attribute scoring. Hossam chose all-or-nothing —
  // any mistake costs the whole 25 — which is how V2 treats a miss, and it
  // moves the assessment at 75% from 81.4% to 66.7%.
  it("fails materially more agents at the working bar", () => {
    const oldR = simulate(75, "all", ASSESSMENT_OLD).passRate;
    const newR = simulate(75, "all", ASSESSMENT_NEW4).passRate;
    expect(oldR - newR).toBeGreaterThan(10);
  });

  it("is stricter than the natively-scored V2 cohort too", () => {
    // The 46 agents assessed natively on V2 passed 80.4% at this bar. This
    // model is harsher than both the old checklist AND real V2, which is worth
    // knowing before anyone treats it as "what V2 will do".
    const NATIVE_V2_PASS75 = 80.4;
    expect(simulate(75, "all", ASSESSMENT_NEW4).passRate).toBeLessThan(NATIVE_V2_PASS75);
  });

  it("offers no policy between three-of-four and all-four", () => {
    // A per-ticket score can only be 0/25/50/75/100, so thresholds inside a
    // step are the same policy. If these ever diverge, the scoring stopped
    // being all-or-nothing.
    const at75 = simulate(75, "all", ASSESSMENT_NEW4).passRate;
    const at8125 = simulate(81.25, "all", ASSESSMENT_NEW4).passRate;
    expect(at75).toBeGreaterThan(at8125);
    expect(simulate(87.5, "all", ASSESSMENT_NEW4).passRate).toBeLessThan(at8125);
  });

  it("keeps the agents the old checklist voided at zero", () => {
    expect(ASSESSMENT_NEW4.byScore.find((r) => r.score === 0).ksa).toBeGreaterThan(0);
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
    // Under all-or-nothing the median drops BELOW the old checklist's — the
    // median agent loses a whole attribute to a single mistake. It sat above
    // it under proportional scoring; the direction flipping is the point.
    expect(medianScore(ASSESSMENT_NEW4)).toBeLessThan(medianScore(ASSESSMENT_OLD));
  });

  it("sits below the warehouse mean by no more than one bucket", () => {
    // Floor-bucketing can only ever LOWER the mean, by at most SCORE_STEP.
    // Comparing the bucket mean directly against BigQuery's raw mean to 0dp
    // can never pass — the gap is ~3 points by construction, not an error.
    // Raw means from BigQuery on 2026-09-07: old 82.98, new-4 74.73
    // (all-or-nothing per attribute, voided tickets zeroed).
    const check = (ds, rawMean) => {
      const m = meanScore(ds);
      expect(m).toBeLessThanOrEqual(rawMean);
      expect(m).toBeGreaterThan(rawMean - SCORE_STEP);
    };
    check(ASSESSMENT_OLD, 82.98);
    check(ASSESSMENT_NEW4, 74.73);
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

describe("the long history series", () => {
  it("covers every month on record with no duplicates", () => {
    expect(HISTORY.rows.length).toBe(24);
    expect(new Set(HISTORY.rows.map((r) => r.ym)).size).toBe(24);
    expect(HISTORY.rows[0].ym).toBe("2024-07");
    expect(HISTORY.rows.at(-1).ym).toBe("2026-08");
  });

  it("stays sorted, so the chart cannot draw backwards", () => {
    const n = (ym) => { const [a, b] = ym.split("-").map(Number); return a * 12 + b; };
    for (let i = 1; i < HISTORY.rows.length; i++) {
      expect(n(HISTORY.rows[i].ym)).toBeGreaterThan(n(HISTORY.rows[i - 1].ym));
    }
  });

  it("leaves Apr–May 2026 as a real hole rather than interpolating", () => {
    // The AppSheet system stopped in March and the CRM started in June. Two
    // months of invented data would be indistinguishable from measured ones on
    // a line chart, so the gap is preserved and the chart breaks its line.
    const months = HISTORY.rows.map((r) => r.ym);
    expect(months).not.toContain("2026-04");
    expect(months).not.toContain("2026-05");
    expect(months).toContain("2026-03");
    expect(months).toContain("2026-06");
  });

  it("hands over cleanly between the two systems", () => {
    // The reason the series is trustworthy as one line: the last AppSheet month
    // and the first CRM month agree closely. If a migration had shifted the
    // measure, this is where it would show.
    const lastApp = HISTORY.rows.filter((r) => r.src === "AppSheet").at(-1);
    const firstCrm = HISTORY.rows.filter((r) => r.src === "CRM")[0];
    expect(lastApp.ym).toBe("2026-03");
    expect(firstCrm.ym).toBe("2026-06");
    expect(Math.abs(lastApp.pass75 - firstCrm.pass75)).toBeLessThan(5);
  });

  it("places the modelled cohort inside the historical band", () => {
    // If the 177-agent cohort were an outlier month, every conclusion drawn
    // from it would be suspect. It is not.
    const rate = simulate(75, "all", ASSESSMENT_OLD).passRate;
    const all = HISTORY.rows.map((r) => r.pass75);
    expect(rate).toBeGreaterThan(Math.min(...all));
    expect(rate).toBeLessThan(Math.max(...all));
  });
});

describe("pass rates are exact off the 6.25 grid", () => {
  // Added 2026-09-07 after finding the picker had been wrong for months.
  // The library used to store counts already bucketed to 6.25 and count
  // buckets, which is only lossless when the threshold is itself on the grid.
  // 80, 85 and 90 never were: at 85% the page reported 90 agents passing when
  // 121 did, and at 90% it reported 26 against 65. Scores are now stored per
  // agent and counted directly. These are BigQuery's own counts.
  const EXACT = {
    65:    { new4: 138, old: 158 },
    68.75: { new4: 133, old: 152 },
    70:    { new4: 121, old: 150 },
    75:    { new4: 118, old: 143 },
    80:    { new4:  85, old: 134 },
    85:    { new4:  57, old: 121 },
    87.5:  { new4:  56, old:  90 },
    90:    { new4:  31, old:  65 },
    100:   { new4:  14, old:   4 },
  };

  it.each(Object.entries(EXACT))("threshold %s matches BigQuery", (t, want) => {
    expect(simulate(Number(t), "all", ASSESSMENT_NEW4).pass).toBe(want.new4);
    expect(simulate(Number(t), "all", ASSESSMENT_OLD).pass).toBe(want.old);
  });

  it("distinguishes thresholds that sit between grid steps", () => {
    // The specific claim that justified deleting the 70% preset — "no agent
    // scores between 68.75 and 75" — was false. If these ever collapse to
    // equal, the library has gone back to counting buckets.
    expect(simulate(70, "all", ASSESSMENT_NEW4).pass)
      .not.toBe(simulate(75, "all", ASSESSMENT_NEW4).pass);
    expect(simulate(65, "all", ASSESSMENT_NEW4).pass)
      .not.toBe(simulate(68.75, "all", ASSESSMENT_NEW4).pass);
  });

  it("keeps the histogram consistent with the exact counts", () => {
    // Bars are still bucketed for drawing. Their total must equal the agent
    // count, or the chart and the headline are describing different cohorts.
    for (const ds of [ASSESSMENT_OLD, ASSESSMENT_NEW4]) {
      const r = simulate(75, "all", ds);
      expect(r.bars.reduce((n, b) => n + b.count, 0)).toBe(r.total);
    }
  });
});
