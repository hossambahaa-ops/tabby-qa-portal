import React, { useMemo } from "react";
import { computeScorecard } from "../lib/scorecard.js";

// New 10-KPI weighted scorecard, shown in PARALLEL with the legacy
// final_performance so the two can be compared before any switch.
// Productivity on Queue is now sourced from mtd_scores.login_hours
// (target 32h/month, binary), so the only composite exclusions left are
// the two no-target LOB CSAT KPIs → modelWeight = 90. The `awaiting`
// rendering path is kept generic in case a future KPI loses its source.

const scoreColor = (s) => (s == null ? "var(--tx3)" : s >= 85 ? "var(--green)" : s >= 70 ? "var(--amber)" : "var(--red)");
const scoreBg = (s) => (s == null ? "var(--bd)" : s >= 85 ? "var(--green-bg)" : s >= 70 ? "var(--amber-bg)" : "var(--red-bg)");

export default function Scorecard({ row, lobCsat, lobCsatPrev, month, sessionDeductEvals = 0 }) {
  const { kpis, composite, zeroWeight, awaitingWeight, noTargetWeight } = useMemo(
    () => computeScorecard({ row, lobCsat, lobCsatPrev, sessionDeductEvals }),
    [row, lobCsat, lobCsatPrev, sessionDeductEvals]
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="card-title">Scorecard <span style={{ fontSize: 11, fontWeight: 500, color: "var(--tx3)" }}>· new KPI model{month ? ` · ${month}` : ""}</span></span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.5px", color: scoreColor(composite) }}>
            {composite != null ? composite.toFixed(1) + "%" : "—"}
          </span>
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>composite</span>
        </div>
      </div>

      <div style={{ margin: "0 16px 12px", fontSize: 11.5, background: "var(--amber-bg)", color: "var(--amber)", padding: "6px 10px", borderRadius: 8 }}>
        Pass/fail vs target: each KPI is its full weight or 0. {zeroWeight > 0 && <>{zeroWeight}% below‑target or no data this month → 0. </>}
        {awaitingWeight > 0 && <>Productivity ({awaitingWeight}%) excluded — no feed. </>}
        {noTargetWeight > 0 && <>LOB CSAT + MoM ({noTargetWeight}%) excluded — no target set.</>}
      </div>

      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {kpis.map((k) => {
          const na = k.na || typeof k.score !== "number";
          // Productivity is gamified: a login-hours "achievement" you unlock at
          // 32h. Its bar shows PROGRESS toward 32h (not the binary 0/100), and
          // when locked we surface exactly how many more hours are needed.
          const isProd = k.key === "productivity";
          const prodUnlocked = isProd && !na && k.unlocked;
          const prodLocked = isProd && !na && !k.unlocked;
          const barWidth = na ? 0 : (isProd ? (k.progress ?? 0) : k.score);
          const barColor = isProd && !na ? (k.unlocked ? "var(--green)" : "var(--amber)") : scoreColor(k.score);
          return (
            <div key={k.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 12px", alignItems: "center", opacity: na ? 0.6 : 1 }}>
              <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>{k.label}</span>
                <span style={{ fontSize: 10.5, color: "var(--tx3)", fontWeight: 600, background: "var(--bg2, rgba(0,0,0,.04))", border: "1px solid var(--bd2)", borderRadius: 10, padding: "0 6px" }}>{k.weight}%</span>
                <span style={{ fontSize: 11, color: "var(--tx3)" }}>target {k.target}</span>
                {prodUnlocked && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green)", background: "var(--green-bg)", borderRadius: 10, padding: "1px 8px" }}>🏆 Unlocked</span>}
                {prodLocked && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--amber)", background: "var(--amber-bg)", borderRadius: 10, padding: "1px 8px" }}>🔒 +{k.gap.toFixed(1)}h to unlock</span>}
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {k.awaiting ? (
                  <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>awaiting data</span>
                ) : k.noTarget ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tx2)" }}>{k.valueLabel || "—"}</span>
                ) : na ? (
                  <span style={{ fontSize: 12.5, color: "var(--tx3)" }}>N/A</span>
                ) : isProd ? (
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: k.unlocked ? "var(--green)" : "var(--amber)" }}>{k.value.toFixed(1)}<span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 500 }}> / {k.targetHours}h</span></span>
                ) : (
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: scoreColor(k.score) }}>{k.valueLabel}</span>
                )}
              </div>

              {/* score bar + sublabel spanning both columns */}
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--bd)", overflow: "hidden" }}>
                  {!na && (
                    <div style={{ width: `${Math.max(0, Math.min(100, barWidth))}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                  )}
                </div>
                <span style={{ fontSize: 10.5, color: "var(--tx3)", minWidth: 96, textAlign: "right" }}>
                  {k.awaiting ? "login-hours feed"
                    : k.noTarget ? `no target set${k.sub ? " · " + k.sub : ""}`
                    : na ? "0/100 · no data"
                    : isProd ? (k.unlocked ? `${k.value.toFixed(1)}h · unlocked 🏆` : `${k.value.toFixed(1)}/${k.targetHours}h · +${k.gap.toFixed(1)}h`)
                    : `${Math.round(k.score)}/100${k.sub ? " · " + k.sub : ""}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
