import React from "react";
import tabbyWord from "../assets/tabby-word.png";

/* "tabbyPulse" wordmark — same lockup as before, but "tabby" is now the real
 * brand letterforms instead of type.
 *
 * "tabby" is the official 2026 wordmark, extracted from the brand badge and
 * recoloured white on transparent. It MUST stay artwork: the letterforms are
 * custom — the t carries TWO crossbars and the y tail is drawn — so no font at
 * any weight reproduces them. It was previously set in Inter, which was
 * visibly not the logo. Do not swap this back to a <text> element.
 *
 * "Pulse" is ours, so it stays type, in the brand green→violet gradient, with
 * the lowercase "l" as the heartbeat EKG. When animated a violet pulse travels
 * across it.
 *
 * Every placement (login, sidebar, loading, desktop-only) sits on
 * --sidebar-bg / a dark backdrop, so a white mark is safe throughout.
 *
 * Sizing: pass `height` (px). Width follows the 4.4:1 aspect.
 */

// Sampled from the badge artwork, so the gradient starts in the true brand
// green rather than the app's older --accent (#3BFF9D).
export const TABBY_GREEN = "#6CFF93";

const FONT =
  "'Inter','SF Pro Display','SF Pro Text',-apple-system,BlinkMacSystemFont,system-ui,sans-serif";

// Artwork is 1319x359 (cropped to the ink, so it includes the y descender).
const WORD_ASPECT = 1319 / 359;
// Baseline sits 85.5% down the artwork; the rest is that descender.
const WORD_BASELINE_FRAC = 0.855;

// Layout, in a 140-tall box to match the original wordmark's proportions.
const BASELINE = 100;
const WORD_ASCENDER = 57;                                  // ink above baseline
const WORD_H = WORD_ASCENDER / WORD_BASELINE_FRAC;         // ≈ 66.7
const WORD_W = WORD_H * WORD_ASPECT;                       // ≈ 245
const WORD_X = 16;
const WORD_Y = BASELINE - WORD_ASCENDER;
const PULSE_X = WORD_X + WORD_W + 6;                       // ≈ 267
// The EKG stands in for the "l". It is drawn 54 units wide — the same span the
// original wordmark used — and deliberately overlaps the tail of "Pu" a little.
// A narrower trace squeezed into the bare "l" advance reads as a dagger rather
// than a heartbeat.
// Offsets are the ORIGINAL wordmark's, measured from the start of "Pu":
// trace 90→144, "se" at 148. They only centre correctly against "Pu" at
// weight 600 — bumping the weight widens "Pu" and pushes the trace off-centre,
// so "Pulse" stays exactly as it was. Only "tabby" changed.
const EKG_X = PULSE_X + 90;
const EKG = `M${EKG_X} 78 L${EKG_X + 6} 78 L${EKG_X + 12} 70 L${EKG_X + 18} 78 `
          + `L${EKG_X + 25} 46 L${EKG_X + 34} 104 L${EKG_X + 42} 70 `
          + `L${EKG_X + 48} 78 L${EKG_X + 54} 78`;
const SE_X = EKG_X + 58;
const VB_W = SE_X + 96;

/* The brand word on its own, sized to sit inline in a sentence — e.g. the
 * login headline "Where tabby measures…". Everything is in `em` so it tracks
 * whatever font-size it lands in, including the mobile breakpoint.
 *
 * height 0.84em puts the artwork's ascender (85.5% of it) on ~0.72em, which is
 * Inter's cap height, so it optically matches the words around it. It is then
 * nudged down 0.12em because `vertical-align: baseline` aligns the image's
 * BOTTOM edge, while the artwork carries the y descender below its own
 * baseline. The brand word is lowercase by design.
 */
export function TabbyWord({ className, style, alt = "tabby" }) {
  return (
    <img
      src={tabbyWord}
      alt={alt}
      className={className}
      style={{
        height: "0.84em", width: "auto", display: "inline-block",
        verticalAlign: "baseline", position: "relative", top: "0.12em",
        ...style,
      }}
    />
  );
}

export default function TabbyPulseWordmark({
  height = 40,
  animated = true,
  uid = "tpw",
  className,
  style,
  "aria-label": ariaLabel = "tabbyPulse",
}) {
  const gradId = `${uid}-grad`;
  const glowId = `${uid}-glow`;
  const width = height * (VB_W / 140);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} 140`}
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel}
      fill="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          {/* Deep violet end, as before — a brighter one washes the whole word
              out to pale lilac and loses the green entirely. */}
          <stop offset="0%" stopColor={TABBY_GREEN} />
          <stop offset="100%" stopColor="#6A2C79" />
        </linearGradient>
        {animated && (
          <filter id={glowId} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <image href={tabbyWord} x={WORD_X} y={WORD_Y} width={WORD_W} height={WORD_H}
             preserveAspectRatio="xMinYMin meet" />

      <text x={PULSE_X} y={BASELINE} fontFamily={FONT} fontSize="78" fontWeight="600"
            fill={`url(#${gradId})`} letterSpacing="-3">Pu</text>
      <text x={SE_X} y={BASELINE} fontFamily={FONT} fontSize="78" fontWeight="600"
            fill={`url(#${gradId})`} letterSpacing="-3">se</text>

      <path d={EKG} stroke="#6A2C79" strokeWidth="7" strokeLinecap="round"
            strokeLinejoin="round" opacity="0.55" />
      {animated ? (
        <path d={EKG} pathLength="100" stroke="#C084FC" strokeWidth="7"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="26 100" filter={`url(#${glowId})`}>
          <animate attributeName="stroke-dashoffset" from="26" to="-100"
                   dur="2.4s" repeatCount="indefinite" />
        </path>
      ) : (
        <path d={EKG} stroke="#C084FC" strokeWidth="7"
              strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
