import React, { useMemo, useState } from "react";

// Performance trend chart — replaces the older inline IIFE.
// Adds a gradient area-fill under the perf line, larger animated
// data points, an interactive hover crosshair, and a floating
// tooltip showing month / perf / DSAT for the focused point.
//
// Props
//   mtd          : full mtd_scores rows
//   months       : sorted-desc month labels
//   teamEmails   : lowercased emails of the QAs to aggregate over
//   monthsShown  : how many trailing months to plot (default 6)
export default function PerformanceTrendChart({ mtd, months, teamEmails, monthsShown = 6 }) {
  // Aggregate into one data point per month. Done in useMemo so the
  // chart doesn't re-compute on every hover state change.
  //
  // The old chart layered a DSAT line on top, but mtd.dsat is the
  // QA's monitored-DSAT count (i.e. how many DSATs the QA was the
  // resolver on) — not a "team health" signal that pairs cleanly
  // with avg perf. Dropped it. CSAT % is a more meaningful second
  // line; included alongside perf so leads can read both trends at
  // once.
  const teamData = useMemo(() => {
    const trendMonths = (months || []).slice(0, monthsShown).reverse();
    const setEmails = new Set((teamEmails || []).map(e => (e || "").toLowerCase()));
    return trendMonths.map(mo => {
      const monthRows = (mtd || []).filter(r => r.month === mo && setEmails.has((r.qa_email || "").toLowerCase()));
      const perfs = monthRows.map(r => parseFloat(r.final_performance) || 0).filter(v => v > 0);
      const avgPerf = perfs.length ? perfs.reduce((a, b) => a + b, 0) / perfs.length : 0;
      // Survey-weighted CSAT % across the team's MTD rows.
      let csatWeightSum = 0, csatWeight = 0;
      for (const r of monthRows) {
        const surveys = Number(r.csat_total) || 0;
        if (surveys <= 0) continue;
        const pctRaw = String(r.csat_pct || "").replace("%", "").trim();
        const pct = parseFloat(pctRaw);
        if (!isFinite(pct)) continue;
        csatWeightSum += pct * surveys;
        csatWeight += surveys;
      }
      const teamCsat = csatWeight > 0 ? csatWeightSum / csatWeight : null;
      return {
        month: mo,
        label: mo.split("-")[0].slice(0, 3),
        avgPerf: avgPerf * 100,
        csat: teamCsat,                 // null when no surveys this month
        count: monthRows.length,
      };
    });
  }, [mtd, months, teamEmails, monthsShown]);

  const [hover, setHover] = useState(null); // index of hovered point

  if (teamData.length < 2) return null;

  const chartH = 160;
  const chartW = Math.max(420, teamData.length * 90);
  const padL = 44, padR = 12, padT = 14, padB = 28;

  const maxPerf = Math.max(...teamData.map(d => d.avgPerf), 1);
  // CSAT axis is anchored to 100% — easier to read "we sit at X%".
  // Skip months with null CSAT (no surveys) when drawing the CSAT line.
  const xFor = (i) => padL + i * (chartW - padL - padR) / (teamData.length - 1);
  const yPerf = (v) => padT + (chartH - padT - padB) * (1 - v / maxPerf);
  const yCsat = (v) => padT + (chartH - padT - padB) * (1 - v / 100);

  const perfPoints = teamData.map((d, i) => ({ x: xFor(i), y: yPerf(d.avgPerf), ...d }));
  const csatPoints = teamData
    .map((d, i) => d.csat == null ? null : ({ x: xFor(i), y: yCsat(d.csat), ...d }))
    .filter(Boolean);

  // Smooth path via simple monotonic-cubic-ish approximation: alternate
  // L commands with slight midpoint nudge. Plain L is fine for 6 points
  // visually; saves the bezier complexity here.
  const linePath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const perfLine = linePath(perfPoints);
  const csatLine = csatPoints.length >= 2 ? linePath(csatPoints) : null;
  // Closed polygon for the area fill under the perf line.
  const perfArea = `${perfLine} L${perfPoints[perfPoints.length - 1].x.toFixed(1)} ${chartH - padB} L${perfPoints[0].x.toFixed(1)} ${chartH - padB} Z`;

  // Hover hit-areas — invisible rects spanning the column for each point
  // so the user doesn't have to land on the tiny circle.
  const colWidth = (chartW - padL - padR) / Math.max(teamData.length - 1, 1);

  const focused = hover != null ? perfPoints[hover] : null;
  const focusedCsat = hover != null && teamData[hover]?.csat != null ? teamData[hover].csat : null;

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg width={chartW} height={chartH + 8} viewBox={`0 0 ${chartW} ${chartH + 8}`}
           style={{ display: "block" }}
           onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="perf-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-perf)" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="var(--chart-perf)" stopOpacity="0"/>
          </linearGradient>
          <filter id="perf-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Gridlines at 0/25/50/75/100 of maxPerf */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = yPerf(v);
          return (
            <g key={v}>
              <line x1={padL - 6} y1={y} x2={chartW - padR} y2={y}
                stroke="currentColor" strokeOpacity={v === 0 ? 0.15 : 0.08} strokeWidth="0.5"
                strokeDasharray={v === 0 ? "0" : "4 4"}/>
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="9.5"
                fill="currentColor" opacity="0.5">{v}%</text>
            </g>
          );
        })}

        {/* Gradient area under the performance curve */}
        <path d={perfArea} fill="url(#perf-area-fill)">
          <animate attributeName="opacity" from="0" to="1" dur="0.6s" fill="freeze"/>
        </path>

        {/* CSAT % (dashed) — drawn before perf so perf reads on top */}
        {csatLine && (
          <path d={csatLine} fill="none" stroke="var(--blue)" strokeOpacity="0.8"
                strokeWidth="1.75" strokeDasharray="4 4" strokeLinecap="round"/>
        )}

        {/* Performance line */}
        <path d={perfLine} fill="none" stroke="var(--chart-perf)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" filter="url(#perf-glow)">
          <animate attributeName="stroke-dasharray" from={`0 ${chartW * 2}`} to={`${chartW * 2} 0`} dur="0.7s" fill="freeze"/>
        </path>

        {/* Performance points */}
        {perfPoints.map((p, i) => (
          <g key={`pp-${i}`} style={{ transition: "transform .15s" }}>
            <circle cx={p.x} cy={p.y} r={hover === i ? 7 : 4.5}
              fill="var(--chart-perf)" stroke="var(--bg)" strokeWidth="2"
              style={{ filter: hover === i ? "drop-shadow(0 0 8px var(--chart-perf))" : "none", transition: "r .15s, filter .15s" }}/>
          </g>
        ))}

        {/* CSAT points (smaller) */}
        {csatPoints.map((p, i) => (
          <circle key={`cp-${i}`} cx={p.x} cy={p.y} r={3}
            fill="var(--blue)" stroke="var(--bg)" strokeWidth="1.5"
            style={{ transition: "r .15s" }}/>
        ))}

        {/* Month labels on x-axis */}
        {perfPoints.map((p, i) => (
          <text key={`lbl-${i}`} x={p.x} y={chartH - 8} textAnchor="middle"
            fontSize="10.5" fontWeight="500"
            fill="currentColor" opacity={hover === i ? 1 : 0.55}>
            {p.label}
          </text>
        ))}

        {/* Vertical hover crosshair */}
        {focused && (
          <line x1={focused.x} y1={padT} x2={focused.x} y2={chartH - padB}
            stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="3 3"/>
        )}

        {/* Hover hit-areas — invisible columns covering each data point */}
        {perfPoints.map((p, i) => (
          <rect key={`hit-${i}`}
            x={p.x - colWidth / 2} y={0}
            width={colWidth} height={chartH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseMove={() => setHover(i)}
            style={{ cursor: "pointer" }}/>
        ))}
      </svg>

      {/* Floating tooltip — positioned absolutely over the hovered point */}
      {focused && (
        <div style={{
          position: "absolute",
          left: Math.min(Math.max(focused.x - 60, 4), chartW - 124),
          top: Math.max(focused.y - 78, 4),
          width: 120,
          padding: "8px 10px",
          background: "var(--bg3)",
          border: "1px solid var(--bd)",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,.25)",
          fontSize: 11,
          backdropFilter: "blur(16px) saturate(160%)",
          WebkitBackdropFilter: "blur(16px) saturate(160%)",
          pointerEvents: "none",
          transition: "left .12s, top .12s",
          color: "var(--tx)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{focused.month}</div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--chart-perf)", fontWeight: 600 }}>
            <span>Avg perf</span><span>{focused.avgPerf.toFixed(1)}%</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--blue)", fontWeight: 600 }}>
            <span>Team CSAT</span><span>{focusedCsat != null ? focusedCsat.toFixed(1) + "%" : "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--tx3)", marginTop: 2 }}>
            <span>QAs</span><span>{focused.count}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 6, fontSize: 11, color: "var(--tx2)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--chart-perf)", display: "inline-block", boxShadow: "0 0 8px var(--chart-perf)" }}/>
          Avg Performance
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 0, borderTop: "2px dashed var(--blue)", display: "inline-block" }}/>
          Team CSAT %
        </span>
      </div>
    </div>
  );
}
