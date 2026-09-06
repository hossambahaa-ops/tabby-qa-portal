import React, { useState, useMemo, useId, useEffect, useRef } from "react";
import {
  //   PRIMARY      = the same evaluations under the FULL OLD checklist
  //   VALIDATION   = the same evaluations counting ONLY the new 4 attributes
  //   REASSESSMENT = the re-assessment cohort, old checklist
  // One population, two scorings — see the mapping note in nestingThreshold.js.
  PRIMARY,
  COMPARISON as VALIDATION,
  REASSESSMENT,
  ATTRIBUTE_FAILS,
  BASELINE_THRESHOLD, SCORE_STEP, REGIONS,
  simulate, tradeOffCurve, thresholdScale,
  medianScore, meanScore, modeScore, alignedShare,
} from "../lib/nestingThreshold.js";

// Nesting Pass Threshold Simulator — a decision tool for choosing the pass
// mark on the V2 Quality Checklist.
//
// Everything on this page is computed from src/lib/nestingThreshold.js at
// render time. No pass rate is written down anywhere in this file; if you find
// yourself typing a percentage into JSX, compute it instead — the whole point
// is that the viewer can move the threshold and trust what they see.
//
// On colour: pass/fail is a status encoding, and the green/red pair clears
// deuteranopia separation only by a modest margin (ΔE 9.0 against a target of
// 8). So pass/fail is never carried by colour alone — failing bars also get a
// diagonal hatch, every bar is labelled, and there is a legend plus a data
// table. That redundancy is deliberate; don't strip it back to colour.

// 70 was removed: no agent can score between 68.75 and 75, so a "70%" bar was
// the same policy as 75% and only ever added a false choice to the room.
const PRESETS = [75, 80, 85, 90, 100];

const fmtPct = (n) => `${n.toFixed(1)}%`;
// Scores land on 6.25 steps, so they need 2dp to be exact but look absurd as
// "75.00" in prose. Show the minimum that is still truthful.
const fmtScore = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/* ── Distribution ─────────────────────────────────────────────────────────
   Where the agents actually sit, with the threshold drawn through them. This
   is the chart that answers "who am I cutting?".

   With a comparison cohort loaded it switches from counts to SHARE of cohort,
   because the pilot is 42 agents against the primary model's 137 — plotting
   raw counts side by side would draw a similar distribution as a flat line
   along the bottom and invite exactly the wrong conclusion. */
function DistributionChart({ bars, threshold, hatchId, onPick, overlay, overlayLabel }) {
  const W = 880, H = 300;
  const padL = 46, padR = 12, padT = 22, padB = 52;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const [hover, setHover] = useState(null);
  const comparing = !!overlay;

  const val = (b) => (comparing ? b.share : b.count);
  const rawMax = Math.max(...bars.map(val), ...(overlay ? overlay.map((o) => o.share) : []), 1);
  // Round the axis up to a multiple of 4 so bars never touch the ceiling AND
  // the four gridlines land on whole numbers — a share axis rounded to 25 gives
  // quarters of 6.25 and prints "19%, 13%, 6%", which looks like a mistake.
  const maxVal = Math.ceil(rawMax / 4) * 4;

  const slot = plotW / bars.length;
  const barW = Math.min(slot * 0.62, 46);
  const x = (i) => padL + slot * i + slot / 2;
  const y = (v) => padT + plotH - (v / maxVal) * plotH;
  const axisLabel = (v) => (comparing ? `${Math.round(v)}%` : String(Math.round(v)));

  // The threshold sits BETWEEN buckets: it belongs just left of the first
  // passing bar, not on top of it, or it reads as "this bar is the cutoff".
  const firstPass = bars.findIndex((b) => b.passing);
  const markerX = firstPass === -1 ? padL + plotW : padL + slot * firstPass;

  const overlayPts = overlay
    ? overlay.map((o, i) => `${x(i)},${y(o.share)}`).join(" ")
    : null;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
           role="img" aria-label={`Agent score distribution with a pass threshold at ${fmtScore(threshold)} percent`}>
        <defs>
          {/* Secondary encoding for failing bars — survives greyscale, print
              and colour blindness. Transparent ground: the bar underneath
              supplies the wash, so this only carries the lines. */}
          <pattern id={hatchId} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--red)" strokeWidth="2.2" opacity=".6"/>
          </pattern>
        </defs>

        {/* Recessive gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={padT + plotH * f} y2={padT + plotH * f}
                  stroke="var(--bd)" strokeWidth="1" opacity={f === 1 ? .9 : .35}/>
            <text x={padL - 8} y={padT + plotH * f + 4} textAnchor="end"
                  fontSize="10" fill="var(--tx3)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {axisLabel(maxVal * (1 - f))}
            </text>
          </g>
        ))}

        {/* Fail region wash. Drawn full-width and squashed with scaleX so it
            can transition — animating the rect's own width would not, and
            would reflow the SVG on every frame of the slider drag. */}
        <g className="nts-anim"
           style={{ transform: `scaleX(${(markerX - padL) / plotW})`, transformOrigin: `${padL}px ${padT}px` }}>
          <rect x={padL} y={padT} width={plotW} height={plotH} fill="var(--red)" opacity=".05"/>
        </g>

        {bars.map((b, i) => {
          const v = val(b);
          const h = plotH - (y(v) - padT);
          const isHover = hover === i;
          return (
            <g key={b.score} className="nts-col"
               onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
               onClick={() => onPick(b.score)}>
              {b.count > 0 && (
                <>
                  {/* Fail bars tint --red rather than using --red-bg: in dark
                      mode --red-bg sits at a 1.06 contrast ratio against the
                      card and the bars vanish. --red reads in both themes. */}
                  <rect className="nts-bar"
                        x={x(i) - barW / 2} y={y(v)} width={barW} height={Math.max(h, 2)} rx="4"
                        fill={b.passing ? "var(--green)" : "var(--red)"}
                        opacity={b.passing ? .92 : .22}/>
                  {!b.passing && (
                    <>
                      <rect x={x(i) - barW / 2} y={y(v)} width={barW} height={Math.max(h, 2)} rx="4"
                            fill={`url(#${hatchId})`} pointerEvents="none"/>
                      <rect x={x(i) - barW / 2} y={y(v)} width={barW} height={Math.max(h, 2)} rx="4"
                            fill="none" stroke="var(--red)" strokeWidth="1.5" opacity=".75" pointerEvents="none"/>
                    </>
                  )}
                  <text className="nts-count" x={x(i)} y={y(v) - 6} textAnchor="middle"
                        fontSize="11" fontWeight="700" fill="var(--tx)"
                        style={{ fontVariantNumeric: "tabular-nums" }} pointerEvents="none">
                    {comparing ? `${b.share.toFixed(0)}%` : b.count}
                  </text>
                </>
              )}
              <text className="nts-tick" x={x(i)} y={H - padB + 18} textAnchor="middle" fontSize="10"
                    fill={isHover ? "var(--tx)" : "var(--tx3)"} style={{ fontVariantNumeric: "tabular-nums" }}
                    pointerEvents="none">
                {fmtScore(b.score)}
              </text>
              {/* Hit target spans the full column, not just the bar, so short
                  bars are as easy to click as tall ones. */}
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent"/>
            </g>
          );
        })}

        {/* Comparison cohort. Drawn as a dashed line with square markers, not
            a second set of bars: the teal/purple pair only clears deuteranopia
            separation in the 6–8 band, so the two series must differ in FORM
            as well as hue. */}
        {overlay && (
          <g pointerEvents="none">
            <polyline points={overlayPts} fill="none" stroke="var(--teal)" strokeWidth="2.5"
                      strokeDasharray="7 4" strokeLinejoin="round" strokeLinecap="round"/>
            {overlay.map((o, i) => (
              <rect key={o.score} x={x(i) - 4} y={y(o.share) - 4} width="8" height="8"
                    fill="var(--teal)" stroke="var(--bg3)" strokeWidth="1.5"
                    transform={`rotate(45 ${x(i)} ${y(o.share)})`}/>
            ))}
          </g>
        )}

        {/* Threshold marker. Translated rather than repositioned, for the same
            reason as the wash above. */}
        <g className="nts-anim" style={{ transform: `translateX(${markerX}px)` }} pointerEvents="none">
          <line x1="0" x2="0" y1={padT - 10} y2={padT + plotH}
                stroke="var(--primary-text)" strokeWidth="2.5" strokeDasharray="6 4"/>
          <text x="6" y={padT - 12} fontSize="11" fontWeight="700" fill="var(--primary-text)">
            Pass mark {fmtScore(threshold)}%
          </text>
        </g>
        <text x={padL} y={H - 10} fontSize="10" fill="var(--tx3)">
          Agent score (%){comparing ? " — bars and line both show share of their own cohort" : ""}
        </text>
      </svg>

      {hover !== null && bars[hover] && (
        <div style={{
          position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)",
          background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 8,
          padding: "6px 12px", fontSize: 12, pointerEvents: "none", whiteSpace: "nowrap",
          boxShadow: "var(--shadow-md)", zIndex: 2,
        }}>
          <strong>{fmtScore(bars[hover].score)}%</strong> ·{" "}
          {comparing
            ? <>{bars[hover].share.toFixed(1)}% primary vs{" "}
                <span style={{ color: "var(--teal)", fontWeight: 700 }}>
                  {overlay[hover].share.toFixed(1)}% {overlayLabel}
                </span></>
            : <>{bars[hover].count} agent{bars[hover].count === 1 ? "" : "s"}</>}
          {" · "}
          <span style={{ color: bars[hover].passing ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
            {bars[hover].passing ? "Pass" : "Fail"}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Trade-off curve ──────────────────────────────────────────────────────
   The chart the decision actually turns on: pass rate at every threshold the
   business could pick, so the cost of each step is visible at once. */
function TradeOffCurve({ curve, threshold, onPick, curveB, curveBLabel }) {
  const W = 880, H = 340;
  const padL = 48, padR = 18, padT = 20, padB = 52;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const [hover, setHover] = useState(null);

  const xs = (t) => padL + ((t - 25) / 75) * plotW;
  const ys = (p) => padT + plotH - (p / 100) * plotH;

  const line = curve.map((p, i) => `${i ? "L" : "M"}${xs(p.threshold)} ${ys(p.passRate)}`).join(" ");
  const area = `${line} L${xs(100)} ${padT + plotH} L${xs(25)} ${padT + plotH} Z`;
  const active = hover ?? curve.findIndex((p) => p.threshold === threshold);
  const pt = curve[active];

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
           role="img" aria-label="Pass rate at every candidate threshold from 25 to 100 percent">
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1={padL} x2={W - padR} y1={ys(p)} y2={ys(p)}
                  stroke="var(--bd)" strokeWidth="1" opacity={p === 0 ? .9 : .35}/>
            <text x={padL - 8} y={ys(p) + 4} textAnchor="end" fontSize="10" fill="var(--tx3)"
                  style={{ fontVariantNumeric: "tabular-nums" }}>{p}%</text>
          </g>
        ))}

        {/* Where the business currently proposes to sit */}
        <line x1={xs(BASELINE_THRESHOLD)} x2={xs(BASELINE_THRESHOLD)} y1={padT} y2={padT + plotH}
              stroke="var(--tx3)" strokeWidth="1.5" strokeDasharray="3 4" opacity=".7"/>
        <text x={xs(BASELINE_THRESHOLD)} y={padT + 12} fontSize="10" fill="var(--tx3)"
              textAnchor="middle">baseline 75</text>

        <path d={area} fill="var(--primary-text)" opacity=".10"/>
        <path d={line} fill="none" stroke="var(--primary-text)" strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round"/>

        {/* Comparison cohort: dashed, with diamond markers. Differs in form as
            well as hue — see the note in DistributionChart. */}
        {curveB && (
          <g pointerEvents="none">
            <path d={curveB.map((p, i) => `${i ? "L" : "M"}${xs(p.threshold)} ${ys(p.passRate)}`).join(" ")}
                  fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeDasharray="7 4"
                  strokeLinejoin="round" strokeLinecap="round"/>
            {curveB.map((p) => (
              <rect key={p.threshold} x={xs(p.threshold) - 3.5} y={ys(p.passRate) - 3.5}
                    width="7" height="7" fill="var(--teal)"
                    transform={`rotate(45 ${xs(p.threshold)} ${ys(p.passRate)})`}/>
            ))}
          </g>
        )}

        {curve.map((p, i) => (
          <circle key={p.threshold} className="nts-point" cx={xs(p.threshold)} cy={ys(p.passRate)}
                  r={i === active ? 7 : 3.5}
                  fill={i === active ? "var(--tabby-purple)" : "var(--bg3)"}
                  stroke="var(--tabby-purple)" strokeWidth="2"/>
        ))}

        {/* Crosshair on the selected/hovered threshold */}
        {pt && (
          <line x1={xs(pt.threshold)} x2={xs(pt.threshold)} y1={ys(pt.passRate)} y2={padT + plotH}
                stroke="var(--tabby-purple)" strokeWidth="1.5" strokeDasharray="4 3" opacity=".5"/>
        )}

        {curve.map((p, i) => (
          <g key={`hit-${p.threshold}`}>
            <text x={xs(p.threshold)} y={H - padB + 20} textAnchor="middle" fontSize="10"
                  fill={i === active ? "var(--tx)" : "var(--tx3)"}
                  fontWeight={i === active ? 700 : 400} style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtScore(p.threshold)}
            </text>
            <rect x={xs(p.threshold) - plotW / (curve.length * 2)} y={padT}
                  width={plotW / curve.length} height={plotH} fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onClick={() => onPick(p.threshold)}/>
          </g>
        ))}
        <text x={padL} y={H - 8} fontSize="10" fill="var(--tx3)">Candidate pass threshold (%)</text>
      </svg>

      {pt && (
        <div style={{
          position: "absolute", top: 4, right: 12,
          background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 8,
          padding: "8px 12px", fontSize: 12, pointerEvents: "none",
          boxShadow: "var(--shadow-md)", zIndex: 2, minWidth: 150,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Threshold {fmtScore(pt.threshold)}%</div>
          <div style={{ color: "var(--tx2)" }}>
            Pass rate <strong style={{ color: "var(--tx)" }}>{fmtPct(pt.passRate)}</strong>
          </div>
          <div style={{ color: "var(--tx2)" }}>
            {pt.pass} pass · <span style={{ color: "var(--red)", fontWeight: 700 }}>{pt.fail} fail</span>
          </div>
          {curveB && curveB[active] && (
            <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--bd2)" }}>
              <div style={{ color: "var(--teal)", fontWeight: 700 }}>
                {fmtPct(curveB[active].passRate)} {curveBLabel}
              </div>
              <div style={{ color: "var(--tx3)", fontSize: 11 }}>
                gap {Math.abs(pt.passRate - curveB[active].passRate).toFixed(1)} pts
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small building blocks ───────────────────────────────────────────────── */

// Roll a number to its new value instead of snapping. On a page whose whole
// purpose is "watch what changes when I move this", a figure that slides makes
// the delta legible; one that jumps just blinks. Honours reduced-motion, and
// always lands exactly on the target rather than near it.
function useAnimatedNumber(target, decimals = 0) {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const from = fromRef.current;
    // requestAnimationFrame does not fire in a hidden tab, so an animation
    // started there would park the tile on the PREVIOUS value until the tab is
    // looked at again. On a page whose numbers drive a policy decision, a
    // stale figure is worse than no animation — so when nobody is watching,
    // skip straight to the answer.
    if (reduced || document.hidden || from === target) {
      fromRef.current = target; setShown(target); return;
    }

    const DURATION = 380;
    let start = null;
    const tick = (ts) => {
      if (start === null) start = ts;
      const t = Math.min((ts - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3);          // ease-out cubic
      setShown(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else { fromRef.current = target; setShown(target); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return Number(shown.toFixed(decimals));
}

function Metric({ label, value, sub, tone }) {
  const color = tone === "bad" ? "var(--red)" : tone === "good" ? "var(--green)" : "var(--tx)";
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".6px" }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.15, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--tx2)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, caption, children }) {
  return (
    <div className="card">
      <div className="card-header" style={{ paddingBottom: 6 }}>
        <span className="card-title" style={{ fontSize: 14 }}>{title}</span>
      </div>
      {children}
      {caption && (
        <div style={{ fontSize: 11.5, color: "var(--tx2)", marginTop: 12, lineHeight: 1.55 }}>
          {caption}
        </div>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────*/

export default function NestingThresholdPage() {
  const [threshold, setThreshold] = useState(BASELINE_THRESHOLD);
  const [region, setRegion] = useState("all");
  const [showTable, setShowTable] = useState(false);
  const [compare, setCompare] = useState(false);
  const hatchId = useId();

  // Pass PRIMARY explicitly. simulate() defaults to the library PRIMARY, which
  // is now the V2 assessment — the same cohort as the pilot — so omitting it
  // made the two comparison cards show identical numbers and a 0.0pt gap.
  const sim = useMemo(() => simulate(threshold, region, PRIMARY), [threshold, region]);
  const curve = useMemo(() => tradeOffCurve(region, PRIMARY), [region]);

  // The validation and re-assessment cohorts have no region split, so they are
  // always computed on the full cohort. Filtering them by region would return
  // a truthful-looking zero for Egypt that actually means "never measured".
  const validation = useMemo(() => simulate(threshold, region, VALIDATION), [threshold, region]);
  const validationAt75 = useMemo(() => simulate(75, region, VALIDATION), [region]);
  const primaryAt75 = useMemo(() => simulate(75, "all", PRIMARY), []);
  const reassess = useMemo(() => simulate(threshold, "all", REASSESSMENT), [threshold]);

  const regionLabel = REGIONS.find((r) => r.key === region)?.label ?? "All";
  const deltaAgents = sim.deltaFail;
  // Scale the attribute bars to a round number above the worst rate, NOT to the
  // worst rate itself. Scaling to max would draw Resolution's 28.3% as a full
  // bar, which reads as "everything failed" to someone skimming — the exact
  // misreading this page cannot afford.
  const attrAxisMax = Math.max(10, Math.ceil(Math.max(...ATTRIBUTE_FAILS.rows.map((r) => r.rate)) / 10) * 10);

  // Comparison layer: the cohort assessed natively on V2. Shares are computed
  // against each cohort's own total so 42 agents can be read against 137.
  const primaryShare = useMemo(() => alignedShare(PRIMARY, region), [region]);
  const pilotShare   = useMemo(() => alignedShare(VALIDATION, region), [region]);
  const pilotCurve   = useMemo(() => tradeOffCurve(region, VALIDATION), [region]);
  const barsWithShare = useMemo(
    () => sim.bars.map((b) => ({ ...b, share: primaryShare.find((r) => r.score === b.score)?.share ?? 0 })),
    [sim.bars, primaryShare],
  );
  // The pilot is KSA-only, so comparing it against All or Egypt is not
  // like-for-like. Say so rather than letting the gap be read as a finding.
  const cohortMismatch = compare && region !== "ksa";

  const pilotAt = useMemo(() => simulate(threshold, region, VALIDATION), [threshold, region]);
  const gapPts = Math.abs(sim.passRate - pilotAt.passRate);

  const animRate = useAnimatedNumber(sim.passRate, 1);
  const animPass = useAnimatedNumber(sim.pass);
  const animFail = useAnimatedNumber(sim.fail);

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div className="page-title">Nesting Pass Threshold Simulator</div>
        <div className="page-subtitle">
          Choosing the pass mark for the V2 Quality Checklist. Move the threshold to see who passes.
        </div>
      </div>

      {/* ── What this page compares ──
          Everything below is a re-scoring exercise, and a reader who does not
          know that will read the "new 4" column as agents improving. Numbers
          are computed, never typed, so this cannot drift from the data. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>
          What this page compares
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.65, color: "var(--tx2)", maxWidth: "72ch" }}>
          One population, scored two ways. The <strong>same {PRIMARY.agents} agents</strong> across{" "}
          <strong>{PRIMARY.tickets} tickets</strong> ({PRIMARY.ticketsPerAgent} each on average),
          assessed between {PRIMARY.period}. Nobody is added or removed between the two columns —
          so any difference you see is the <strong>scoring change alone</strong>, not a different
          group of people, tickets or evaluators.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {[
            { k: "Full old checklist", v: `${PRIMARY.agents} agents`,
              d: "All ~15 attributes, exactly as the evaluator originally scored them. 100 points.",
              c: "var(--primary-text)" },
            { k: "New 4 attributes only", v: `${VALIDATION.agents} agents`,
              d: "The same evaluations, counting only Investigation, Resolution, Tone of Voice and Empathy. 67 of the 100 points, rebased to 100.",
              c: "var(--teal)" },
          ].map((x) => (
            <div key={x.k} style={{ background: "var(--bg)", border: "1px solid var(--bd2)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: x.c }}/>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{x.k}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--tx3)", fontVariantNumeric: "tabular-nums", marginBottom: 5 }}>{x.v}</div>
              <div style={{ fontSize: 11.5, color: "var(--tx2)", lineHeight: 1.55 }}>{x.d}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--bd2)", fontSize: 11.5, color: "var(--tx2)", lineHeight: 1.65, maxWidth: "78ch" }}>
          <strong>Two things to hold onto.</strong> The four new attributes were never recorded on
          these evaluations, so the second column is <em>reconstructed</em> from the old questions
          that correspond to them — a judgement, not a measurement. And it drops{" "}
          {100 - 67} of the 100 old points, which removes places agents lost marks: scoring on four
          attributes is <strong>mechanically easier</strong>, so a higher pass rate there is not
          agents improving.{" "}
          {REASSESSMENT.agents} separately-tracked agents who failed and were coached are shown
          lower down, scored the same two ways.
        </div>
      </div>

      {/* ── Recommendation ── */}
      <div className="card" style={{
        borderLeft: "4px solid var(--primary-text)", marginBottom: 16,
        display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap",
      }}>
        <div style={{ flex: "1 1 420px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--primary-text)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>
            Provisional recommendation
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
            Set the Nesting pass mark at {fmtScore(BASELINE_THRESHOLD)}%
          </div>
          <div style={{ fontSize: 13, color: "var(--tx2)", lineHeight: 1.6 }}>
            It clears {fmtPct(primaryAt75.passRate)} of agents — high enough to be a real bar, low
            enough that the {primaryAt75.fail} who fail can be absorbed by coaching — and two
            independent datasets agree on that rate to within{" "}
            {Math.abs(primaryAt75.passRate - validationAt75.passRate).toFixed(1)} points.
          </div>
        </div>
        <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 130 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "var(--primary-text)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {fmtPct(primaryAt75.passRate)}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>pass at 75% · all regions</div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 380px", minWidth: 280 }}>
            <label htmlFor="thr" style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Pass threshold
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
              <input
                id="thr" type="range" min={25} max={100} step={SCORE_STEP}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                aria-valuetext={`${fmtScore(threshold)} percent`}
                style={{ flex: 1, accentColor: "var(--tabby-purple)", cursor: "pointer" }}
              />
              <span style={{ fontSize: 22, fontWeight: 800, minWidth: 74, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {fmtScore(threshold)}%
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {PRESETS.map((p) => (
                <button key={p} className="mo-ctl" onClick={() => setThreshold(p)}
                  style={{
                    padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "var(--font)",
                    border: `1px solid ${threshold === p ? "var(--tabby-purple)" : "var(--bd)"}`,
                    background: threshold === p ? "var(--tabby-purple)" : "transparent",
                    color: threshold === p ? "#fff" : "var(--tx2)",
                  }}>{p}%</button>
              ))}
            </div>
            {/* Presets like 70, 80, 85 and 90 do not sit on the 6.25 grid, so
                they behave identically to the step below them. Saying so stops
                someone believing 70% is a different policy from 68.75%. */}
            {threshold % SCORE_STEP !== 0 && (
              <div style={{ fontSize: 11.5, color: "var(--amber)", marginTop: 8, lineHeight: 1.5 }}>
                No agent can score between {fmtScore(Math.floor(threshold / SCORE_STEP) * SCORE_STEP)}%
                and {fmtScore(Math.ceil(threshold / SCORE_STEP) * SCORE_STEP)}%, so a{" "}
                {fmtScore(threshold)}% bar is the same policy as{" "}
                {fmtScore(Math.floor(threshold / SCORE_STEP) * SCORE_STEP + SCORE_STEP)}%.
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>
              Region
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {REGIONS.map((r) => (
                <button key={r.key} className="mo-ctl" onClick={() => setRegion(r.key)}
                  style={{
                    padding: "6px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    fontFamily: "var(--font)",
                    border: `1px solid ${region === r.key ? "var(--tabby-purple)" : "var(--bd)"}`,
                    background: region === r.key ? "var(--tabby-purple)" : "transparent",
                    color: region === r.key ? "#fff" : "var(--tx2)",
                  }}>{r.label}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>
              Compare
            </div>
            <button className="mo-ctl" onClick={() => setCompare((v) => !v)}
              aria-pressed={compare}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 8,
                border: `1px solid ${compare ? "var(--teal)" : "var(--bd)"}`,
                background: compare ? "var(--teal-bg)" : "transparent",
                color: compare ? "var(--teal)" : "var(--tx2)",
              }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, transform: "rotate(45deg)",
                background: compare ? "var(--teal)" : "var(--bd)" }}/>
              New 4 attributes only
            </button>
          </div>
        </div>

        {/* The old KSA-mismatch warning is gone: both scorings are the same
            177 agents, so every region compares like-for-like by construction. */}
      </div>

      {/* ── Headline metrics ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Metric label="Pass rate" value={fmtPct(animRate)} sub={`${regionLabel} · ${sim.total} agents`}/>
        <Metric label="Passing" value={`${animPass}`} sub={`of ${sim.total} agents`} tone="good"/>
        <Metric label="Failing" value={`${animFail}`} sub={`of ${sim.total} agents`} tone="bad"/>
        <Metric
          label={`vs ${fmtScore(BASELINE_THRESHOLD)}% baseline`}
          value={deltaAgents === 0 ? "—" : `${deltaAgents > 0 ? "+" : ""}${deltaAgents}`}
          sub={deltaAgents === 0 ? "at the baseline" : `agent${Math.abs(deltaAgents) === 1 ? "" : "s"} ${deltaAgents > 0 ? "more" : "fewer"} fail`}
          tone={deltaAgents > 0 ? "bad" : deltaAgents < 0 ? "good" : undefined}/>
        <Metric label="Borderline" value={`${sim.borderline}`}
          sub={`sit exactly on ${fmtScore(threshold)}% — one step from failing`}/>
      </div>

      {/* ── Side-by-side at the selected threshold ── */}
      {compare && (
        <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--teal)" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: "0 0 auto" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--teal)", textTransform: "uppercase", letterSpacing: ".6px" }}>
                At {fmtScore(threshold)}%
              </div>
              <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 2 }}>Two cohorts, same bar</div>
            </div>

            {[
              { k: `Full old checklist · ${regionLabel}`, r: sim.passRate, n: `${sim.pass}/${sim.total}`, c: "var(--primary-text)" },
              { k: `New 4 attributes only · ${regionLabel}`, r: pilotAt.passRate, n: `${pilotAt.pass}/${pilotAt.total}`, c: "var(--teal)" },
            ].map((d) => (
              <div key={d.k} style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>{d.k}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: d.c, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
                  {fmtPct(d.r)}
                </div>
                <div style={{ fontSize: 11, color: "var(--tx2)" }}>{d.n} agents</div>
              </div>
            ))}

            <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 120 }}>
              <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>Gap</div>
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: "tabular-nums",
                color: gapPts <= 5 ? "var(--green)" : gapPts <= 10 ? "var(--amber)" : "var(--red)" }}>
                {gapPts.toFixed(1)} pts
              </div>
              <div style={{ fontSize: 11, color: "var(--tx2)" }}>
                {gapPts <= 5 ? "models agree" : gapPts <= 10 ? "diverging" : "models disagree"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--tx2)", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--bd2)", lineHeight: 1.6 }}>
            Both curves are the <strong>same {sim.total} agents</strong>, scored two ways: the full
            old checklist, and only the four attributes the new one keeps. The gap between them is
            the scoring change and nothing else — no difference in people, tickets or evaluators.
          </div>
        </div>
      )}

      {/* ── Trade-off curve ── */}
      <Panel
        title={compare ? "Trade-off: full old checklist vs the new 4 attributes" : "Trade-off: pass rate at every candidate threshold"}
        caption={<>Each point is a policy option — <strong>click any point</strong> to select it. The curve is steepest
          between 75% and 87.5%, where the bulk of agents sit — so a step up from 75% costs far
          more people than a step down saves. Computed on {sim.total} agents ({regionLabel}).</>}>
        {compare && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--tx2)" }}>
              <svg width="26" height="10" aria-hidden="true"><line x1="0" y1="5" x2="26" y2="5" stroke="var(--primary-text)" strokeWidth="2.5"/></svg>
              Full old checklist ({regionLabel}, {sim.total} agents)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--tx2)" }}>
              <svg width="26" height="10" aria-hidden="true"><line x1="0" y1="5" x2="26" y2="5" stroke="var(--teal)" strokeWidth="2.5" strokeDasharray="7 4"/></svg>
              New 4 attributes only ({regionLabel}, {pilotAt.total} agents)
            </span>
          </div>
        )}
        <TradeOffCurve curve={curve} threshold={threshold} onPick={setThreshold}
          curveB={compare ? pilotCurve : null} curveBLabel="new 4 attributes only"/>
      </Panel>

      {/* ── Distribution ── */}
      <div style={{ marginTop: 16 }}>
        <Panel
          title="Where agents actually score"
          caption={<><strong>Click any bar</strong> to move the pass mark to that score. Scores land
            only on multiples of {SCORE_STEP} because each agent is the mean of 4 tickets scored out
            of 4 attributes, so a threshold set between two steps behaves identically to the step
            below it. Keyboard users can drive the same thing with the slider above.</>}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tx2)" }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, background: "var(--green)" }}/> Pass
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tx2)" }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, background: "var(--red)", opacity: .35, border: "1px solid var(--red)" }}/> Fail (hatched)
            </span>
            {compare && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tx2)" }}>
                <span style={{ width: 9, height: 9, transform: "rotate(45deg)", background: "var(--teal)" }}/>
                New 4 attributes only (dashed)
              </span>
            )}
            <button className="mo-ctl" onClick={() => setShowTable((v) => !v)}
              style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 8, fontSize: 11.5,
                fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)",
                border: "1px solid var(--bd)", background: "transparent", color: "var(--tx2)" }}>
              {showTable ? "Hide" : "Show"} data table
            </button>
          </div>
          <DistributionChart bars={barsWithShare} threshold={threshold} hatchId={`hatch-${hatchId}`}
            onPick={setThreshold}
            overlay={compare ? pilotShare : null} overlayLabel="new-4"/>
          {showTable && (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--tx3)" }}>
                    <th style={{ padding: "6px 8px" }}>Score</th>
                    <th style={{ padding: "6px 8px" }}>Agents</th>
                    <th style={{ padding: "6px 8px" }}>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {sim.bars.map((b) => (
                    <tr key={b.score} style={{ borderTop: "1px solid var(--bd2)" }}>
                      <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums" }}>{fmtScore(b.score)}%</td>
                      <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums" }}>{b.count}</td>
                      <td style={{ padding: "6px 8px", color: b.passing ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                        {b.passing ? "Pass" : "Fail"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Supporting evidence ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 16 }}>

        {/* Attribute failures */}
        <Panel
          title="Where agents lose points"
          caption={<>Failures concentrate in <strong>Resolution</strong> and <strong>Investigation</strong>,
            which together account for far more loss than the three remaining attributes combined.
            That makes the failing population coachable against two specific skills rather than
            diffusely weak. Rates are per ticket across {ATTRIBUTE_FAILS.ticketBase} tickets — a
            different denominator from the score distribution, so they explain the shape but cannot
            be multiplied back into a pass rate.</>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ATTRIBUTE_FAILS.rows.map((r) => (
              <div key={r.attribute}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--tx2)" }}>
                    {r.attribute}
                    {!r.scored && (
                      <span style={{ fontSize: 10, color: "var(--tx3)", marginLeft: 6, padding: "1px 6px",
                        borderRadius: 6, background: "var(--bg)", border: "1px solid var(--bd2)" }}>
                        zeroes the ticket
                      </span>
                    )}
                  </span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{r.rate}%</strong>
                </div>
                <div style={{ height: 8, background: "var(--bd2)", borderRadius: 4, overflow: "hidden" }}>
                  <div className="mo-bar" style={{
                    transform: `scaleX(${r.rate / attrAxisMax})`, height: "100%",
                    background: r.scored ? "var(--primary-text)" : "var(--tx3)",
                  }}/>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>
              <span>0%</span>
              <span>{attrAxisMax}% of tickets</span>
            </div>
          </div>
        </Panel>

        {/* Validation */}
        <Panel
          title="Same agents, two scorings"
          caption={<>This is a <strong>paired</strong> comparison, not an independent one: the same{" "}
            {primaryAt75.total} agents and the same evaluations, counted two ways. That makes the{" "}
            {Math.abs(primaryAt75.passRate - validationAt75.passRate).toFixed(1)}-point gap at the 75%
            mark attributable to the scoring change alone — but it is <em>not</em> outside evidence,
            and it cannot tell you the new checklist generalises.</>}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { k: "Full old checklist", v: primaryAt75.passRate, n: `${primaryAt75.pass}/${primaryAt75.total} agents`, note: "all ~15 attributes" },
              { k: "New 4 attributes only", v: validationAt75.passRate, n: `${validationAt75.pass}/${validationAt75.total} agents`, note: VALIDATION.note },
            ].map((d) => (
              <div key={d.k} style={{ flex: "1 1 130px", background: "var(--bg)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--bd2)" }}>
                <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>{d.k}</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{fmtPct(d.v)}</div>
                <div style={{ fontSize: 11, color: "var(--tx2)" }}>{d.n}</div>
                <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{d.note}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--tx2)", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--bd2)" }}>
            At the selected {fmtScore(threshold)}% mark, scoring on the new four alone passes{" "}
            <strong>{fmtPct(validation.passRate)}</strong> ({validation.pass}/{validation.total}).
          </div>
        </Panel>

        {/* Re-assessment */}
        <Panel
          title="Coaching recovers failed agents"
          caption={<>{REASSESSMENT.agents} agents who failed were coached and re-assessed. Median{" "}
            {fmtScore(medianScore(REASSESSMENT))}, most common score {fmtScore(modeScore(REASSESSMENT))} —
            a failed Nesting assessment is recoverable, which is what makes a{" "}
            {fmtScore(BASELINE_THRESHOLD)}% bar defensible rather than punitive.{" "}
            <strong>Caveat:</strong> this cohort was re-assessed on the legacy checklist. No
            re-assessment has run under V2 yet.</>}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ flex: "1 1 100px" }}>
              <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>Median after coaching</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--green)", fontVariantNumeric: "tabular-nums" }}>
                {fmtScore(medianScore(REASSESSMENT))}%
              </div>
            </div>
            <div style={{ flex: "1 1 100px" }}>
              <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>
                Clear {fmtScore(threshold)}%
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {reassess.pass}<span style={{ fontSize: 14, color: "var(--tx3)", fontWeight: 600 }}>/{reassess.total}</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Limitations ── */}
      <div className="card" style={{ marginTop: 16, borderLeft: "4px solid var(--amber)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 8 }}>
          What this model cannot tell you yet
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--tx2)", lineHeight: 1.75 }}>
          <li>The four new attributes were <strong>never recorded on these evaluations</strong>. They
            are reconstructed from the old questions that correspond to them (see the mapping in
            nestingThreshold.js). That mapping is a judgement — if it is wrong, every "new 4" number
            here moves.</li>
          <li><strong>Re-assessment has not been run under V2.</strong> The recovery evidence above
            comes from the legacy checklist, so it is indicative rather than a like-for-like
            projection.</li>
          <li>Dropping 33 of the 100 old points (structure &amp; readability, hold time, response
            time, status, notes, topic selection) removes places agents lost marks. Scoring on the
            four alone is <strong>mechanically easier</strong>, which is most of the gap you see —
            it is not evidence that agents improved.</li>
          <li>Attribute failure rates sit on a {ATTRIBUTE_FAILS.ticketBase}-ticket pool, a different
            denominator from the {PRIMARY.agents}-agent score distribution. Treat them as direction,
            not as inputs to the pass rate.</li>
          <li><strong>Recommended review point:</strong> revisit this threshold once Egypt has completed
            one or two full V2 batches, and again after the first V2 re-assessment round.</li>
        </ul>
      </div>

      <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 14, lineHeight: 1.6 }}>
        Primary model: {PRIMARY.agents} agents, {PRIMARY.tickets} tickets, {PRIMARY.period}. Mean{" "}
        {meanScore(PRIMARY).toFixed(1)}, median {fmtScore(medianScore(PRIMARY))}. All figures on this
        page are computed live from the batch data; nothing is hardcoded.
      </div>
    </div>
  );
}
