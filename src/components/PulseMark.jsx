import React from "react";

// Tabby Pulse logomark — heartbeat / EKG line. When `animated` is on, a
// short bright-green segment travels along a dim purple baseline, looping
// seamlessly (no jump at the wrap because the dash cycle equals the
// path's normalized length plus the dash itself).
//
// Static (animated=false) renders the full line in green for the favicon.
const PATH = "M2 16 L9 16 L12 6 L16 26 L20 10 L23 16 L30 16";

export default function PulseMark({
  size = 24,
  animated = true,
  className,
  style,
  "aria-hidden": ariaHidden = true,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
      fill="none"
    >
      {animated ? (
        <>
          <path
            d={PATH}
            stroke="#8B4D99"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.4"
          />
          <path
            d={PATH}
            pathLength="100"
            stroke="#3BFF9D"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="22 100"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-122"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </path>
        </>
      ) : (
        <path
          d={PATH}
          stroke="#3BFF9D"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
