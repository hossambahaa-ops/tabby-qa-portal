import React from "react";
import { useCountUp } from "../lib/useCountUp.jsx";

// Progress Ring — circular progress indicator with number count-up on
// the label. If `label` is a numeric string ("32.5"), it animates from
// 0 to the value on first paint, matching the ring's stroke fill.
// Pass `animateLabel={false}` to disable for non-numeric labels like
// "#3 / 25" if auto-detection fails.
export const ProgressRing = ({ value, max, size = 64, stroke = 5, color = "var(--tabby-green)", label, sublabel, animateLabel }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circ * (1 - pct);

  // Decide whether to count-up the label
  const labelStr = label != null ? String(label) : "";
  const numericMatch = labelStr.match(/^-?\d+(\.\d+)?$/);
  const shouldAnimate = animateLabel !== false && !!numericMatch;
  const targetNum = shouldAnimate ? Number(labelStr) : 0;
  const decimals = shouldAnimate && numericMatch[1] ? numericMatch[1].length - 1 : 0;
  const animated = useCountUp(shouldAnimate ? targetNum : 0, { decimals, durationMs: 700 });
  const renderedLabel = shouldAnimate ? animated.toFixed(decimals) : label;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" className="progress-ring-track" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      {(label || sublabel) && <div>
        {label && <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" }}>{renderedLabel}</div>}
        {sublabel && <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 500 }}>{sublabel}</div>}
      </div>}
    </div>
  );
};

// Mini Bar Chart — simple vertical bars for trend data
export const MiniBarChart = ({ data, height = 48, color = "var(--tabby-green)", showLabels = false }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.min(12, (100 / data.length) - 2);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{
              width: "100%", maxWidth: barW, borderRadius: 3,
              height: `${Math.max((d.value / max) * height, 3)}px`,
              background: i === data.length - 1 ? color : "var(--bd)",
              transition: "height .6s cubic-bezier(.4,0,.2,1)",
              opacity: 0.4 + (i / data.length) * 0.6,
            }} title={`${d.label}: ${d.value}`} />
          </div>
        ))}
      </div>
      {showLabels && <div style={{ display: "flex", gap: 3 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "var(--tx3)", fontWeight: 500 }}>
            {d.label?.slice(0, 3)}
          </div>
        ))}
      </div>}
    </div>
  );
};

// Spark Line — inline trend line
export const SparkLine = ({ data, width = 100, height = 28, color = "var(--tabby-green)" }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
      <circle cx={(data.length - 1) / (data.length - 1) * width} cy={height - ((data[data.length-1] - min) / range) * (height - 4) - 2} r="3" fill={color} />
    </svg>
  );
};

// Skeleton loader — shows pulsing placeholder while data loads
export const SkeletonLoader = ({ rows = 4 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 8 }}>
    <div className="stats-grid">
      {[1,2,3,4].map(i => (
        <div key={i} className="stat-card" style={{ minHeight: 100 }}>
          <div style={{ width: "40%", height: 10, borderRadius: 6, background: "var(--bd2)", marginBottom: 16, animation: "pulse 1.5s ease infinite" }} />
          <div style={{ width: "60%", height: 28, borderRadius: 8, background: "var(--bd2)", animation: "pulse 1.5s ease infinite", animationDelay: `${i * 0.1}s` }} />
        </div>
      ))}
    </div>
    {[...Array(rows)].map((_, i) => (
      <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--bd2)" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bd2)", flexShrink: 0, animation: "pulse 1.5s ease infinite", animationDelay: `${i * 0.1}s` }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: `${60 + Math.random() * 30}%`, height: 12, borderRadius: 6, background: "var(--bd2)", marginBottom: 6, animation: "pulse 1.5s ease infinite" }} />
          <div style={{ width: "40%", height: 10, borderRadius: 6, background: "var(--bd2)", animation: "pulse 1.5s ease infinite" }} />
        </div>
      </div>
    ))}
  </div>
);

export const PulseLoader = () => (
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 20px",gap:12}}>
    <svg width="120" height="40" viewBox="0 0 200 60" fill="none" className="pulse-line-anim">
      <path d="M0 30 L40 30 L55 8 L75 52 L95 20 L110 30 L200 30" stroke="url(#plGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <defs><linearGradient id="plGrad" x1="0" y1="0" x2="200" y2="0"><stop offset="0%" stopColor="#3BFF9D"/><stop offset="100%" stopColor="#6A2C79"/></linearGradient></defs>
    </svg>
    <div style={{fontSize:12,color:"var(--tx3)",letterSpacing:"1px"}}>Loading...</div>
  </div>
);
