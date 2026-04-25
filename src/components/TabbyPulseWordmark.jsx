import React from "react";

// "tabbyPulse" wordmark — "tabby" inherits currentColor, "Pulse" uses
// the brand green→violet gradient, and the lowercase "l" in "Pulse"
// is the heartbeat EKG. When animated, a soft violet pulse travels
// across the EKG on a slow, smooth loop.
//
// Sizing: pass `height` (px). Width is computed from the 4:1 aspect.
const FONT =
  "'Inter','SF Pro Display','SF Pro Text',-apple-system,BlinkMacSystemFont,system-ui,sans-serif";
const EKG =
  "M298 72 L304 72 L310 62 L316 72 L323 38 L332 110 L340 62 L346 72 L352 72";

export default function TabbyPulseWordmark({
  height = 40,
  animated = true,
  uid = "tpw",
  className,
  style,
  "aria-label": ariaLabel = "tabbyPulse",
}) {
  const width = height * 4;
  const gradId = `${uid}-grad`;
  const glowId = `${uid}-glow`;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 560 140"
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel}
      fill="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3BFF9D" />
          <stop offset="100%" stopColor="#6A2C79" />
        </linearGradient>
        {animated && (
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <text x="20" y="100" fontFamily={FONT} fontSize="78" fontWeight="600"
            fill="currentColor" letterSpacing="-3">tabby</text>
      <text x="208" y="100" fontFamily={FONT} fontSize="78" fontWeight="600"
            fill={`url(#${gradId})`} letterSpacing="-3">Pu</text>
      <text x="356" y="100" fontFamily={FONT} fontSize="78" fontWeight="600"
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
