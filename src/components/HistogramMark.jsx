import React from "react";

// Tabby Pulse logomark — four ascending bars with a green wave rolling
// left → right through them. Frameless (no background square), sharp
// corners. The wave only fires when `animated` is true; statics fill
// the tallest bar green so the silhouette has a focal point.
const BARS = [
  { x: 5.5, y: 22, h: 5,  begin: "0s" },
  { x: 11,  y: 17, h: 10, begin: "0.22s" },
  { x: 16.5,y: 12, h: 15, begin: "0.44s" },
  { x: 22,  y: 8,  h: 19, begin: "0.66s" },
];

export default function HistogramMark({ size = 24, animated = true, peakStatic = true, className, style, "aria-hidden": ariaHidden = true }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    >
      {BARS.map((b, i) => {
        const isPeak = i === BARS.length - 1;
        const fill = !animated && peakStatic && isPeak ? "#3BFF9D" : "#8B4D99";
        return (
          <rect key={i} x={b.x} y={b.y} width="5" height={b.h} fill={fill}>
            {animated && (
              <animate
                attributeName="fill"
                values="#8B4D99;#3BFF9D;#8B4D99;#8B4D99"
                dur="1.8s"
                begin={b.begin}
                repeatCount="indefinite"
                keyTimes="0;0.08;0.16;1"
              />
            )}
          </rect>
        );
      })}
    </svg>
  );
}
