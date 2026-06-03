import React from "react";

// Renders a Q1/Q2/Q3/Q4 pill from a numeric quartile (1..4) or NULL.
// Source: mtd_scores.csat_quartile — computed by recalculate_csat_quartiles
// which ranks each QA against the FULL population (agents + QAs) inside
// their domain (tabby.ai or tabby.sa) and primary LOB for the month,
// sourced from the csat_population staging table (Ops "agent CSAT" sheet).
//
// Color language:
//   Q1 — mint  (top 25% of all resolvers in their primary LOB this month)
//   Q2 — blue  (next 25%)
//   Q3 — amber (next 25%)
//   Q4 — grey  (bottom 25%)
//   null — slim "not enough data" pill so the column never looks empty
//
// `size = "sm" | "md"` for sizing. `lob` (optional) shows up in the
// tooltip so the QA sees which cohort they're being compared against.
export default function QuartilePill({ quartile, size = "sm", lob = null }) {
  const isSm = size === "sm";
  const baseStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: isSm ? "1px 7px" : "2px 9px",
    borderRadius: 6,
    fontSize: isSm ? 10 : 11,
    fontWeight: 700,
    letterSpacing: ".4px",
    textTransform: "uppercase",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    fontFamily: "var(--font)",
  };

  const cohortLabel = lob
    ? `the full ${lob} population in your domain (agents + QAs, same @tabby.ai or @tabby.sa)`
    : "the full population in your domain + primary LOB";

  if (quartile == null) {
    return (
      <span
        title={`No quartile — the QA needs ≥5 CSAT surveys this month to be ranked (or ${cohortLabel} has < 4 resolvers in the pool).`}
        style={{
          ...baseStyle,
          background: "rgba(156,163,175,0.12)",
          color: "var(--tx3)",
          textTransform: "none",
          fontWeight: 500,
          fontStyle: "italic",
        }}
      >
        — n/a
      </span>
    );
  }

  const q = Number(quartile);
  const colors = {
    1: { bg: "rgba(60,255,165,.18)",  fg: "#3CFFA5", label: "Top 25%" },
    2: { bg: "rgba(96,165,250,.18)",  fg: "#60A5FA", label: "Upper-mid" },
    3: { bg: "rgba(245,158,11,.18)",  fg: "#F59E0B", label: "Lower-mid" },
    4: { bg: "rgba(156,163,175,.20)", fg: "#9CA3AF", label: "Bottom 25%" },
  };
  const c = colors[q] || colors[4];
  return (
    <span
      title={`Q${q} (${c.label}) — CSAT ranked against ${cohortLabel} for the selected month.`}
      style={{ ...baseStyle, background: c.bg, color: c.fg }}
    >
      Q{q}
    </span>
  );
}
