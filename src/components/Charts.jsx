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

// Mini Bar Chart — vertical bars for trend data. Latest bar is solid
// in the accent colour with a soft top glow; prior bars step up in
// opacity so the eye reads them as a progression toward "now".
export const MiniBarChart = ({ data, height = 48, color = "var(--tabby-green)", showLabels = false }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.min(12, (100 / data.length) - 2);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {data.map((d, i) => {
          const isLatest = i === data.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{
                width: "100%", maxWidth: barW, borderRadius: "3px 3px 2px 2px",
                height: `${Math.max((d.value / max) * height, 3)}px`,
                background: isLatest
                  ? `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 65%, transparent))`
                  : "currentColor",
                color: isLatest ? undefined : "var(--tx3)",
                opacity: isLatest ? 1 : 0.18 + (i / data.length) * 0.30,
                transition: "height .6s cubic-bezier(.4,0,.2,1), opacity .3s",
                boxShadow: isLatest ? `0 0 10px ${color}` : "none",
              }} title={`${d.label}: ${d.value}`} />
            </div>
          );
        })}
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

// Spark Line — inline trend line with a gradient area-fill under the
// curve, glow on the stroke, and a slightly larger end-point dot so
// the "latest value" reads at a glance. Matches the PerformanceTrend
// chart treatment.
export const SparkLine = ({ data, width = 100, height = 28, color = "var(--tabby-green)" }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const yFor = (v) => height - ((v - min) / range) * (height - pad * 2) - pad;
  const xFor = (i) => (i / (data.length - 1)) * width;
  const points = data.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
  const linePath = "M" + points.split(" ").join(" L");
  // Closed polygon for area fill — drops to baseline at start + end.
  const areaPath = `${linePath} L${width.toFixed(1)} ${height - pad} L0 ${height - pad} Z`;
  const lastX = xFor(data.length - 1);
  const lastY = yFor(data[data.length - 1]);
  // Unique gradient id so multiple sparklines on a page don't collide.
  const gid = `spark-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.40"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`}/>
      <path d={linePath} fill="none" stroke={color} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}/>
      <circle cx={lastX} cy={lastY} r="3.5" fill={color}
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}/>
    </svg>
  );
};

// Skeleton loader — shows a sweeping-highlight placeholder while data
// loads. Uses .skeleton-shimmer for the shine effect (defined in
// index.css). Each row staggers by 100ms so the page feels alive
// rather than blinking on/off in unison.
export const SkeletonLoader = ({ rows = 4 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 8 }}>
    <div className="stats-grid">
      {[1,2,3,4].map(i => (
        <div key={i} className="stat-card" style={{ minHeight: 100 }}>
          <div className="skeleton-shimmer" style={{ width: "40%", height: 10, borderRadius: 6, marginBottom: 16, animationDelay: `${i * 0.1}s` }} />
          <div className="skeleton-shimmer" style={{ width: "60%", height: 28, borderRadius: 8, animationDelay: `${i * 0.1}s` }} />
        </div>
      ))}
    </div>
    {[...Array(rows)].map((_, i) => (
      <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--bd2)" }}>
        <div className="skeleton-shimmer" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, animationDelay: `${i * 0.1}s` }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton-shimmer" style={{ width: `${60 + Math.random() * 30}%`, height: 12, borderRadius: 6, marginBottom: 6 }} />
          <div className="skeleton-shimmer" style={{ width: "40%", height: 10, borderRadius: 6 }} />
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
