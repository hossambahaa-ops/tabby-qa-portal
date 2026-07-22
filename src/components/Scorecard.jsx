import React, { useMemo } from "react";
import { computeScorecard } from "../lib/scorecard.js";

// New 10-KPI weighted scorecard, shown in PARALLEL with the legacy
// final_performance so the two can be compared before any switch.
// Productivity on Queue (login hours) has no source yet → rendered as
// "awaiting data" and excluded from the composite (weight redistributed).

const scoreColor = (s) => (s == null ? "var(--tx3)" : s >= 85 ? "var(--green)" : s >= 70 ? "var(--amber)" : "var(--red)");
const scoreBg = (s) => (s == null ? "var(--bd)" : s >= 85 ? "var(--green-bg)" : s >= 70 ? "var(--amber-bg)" : "var(--red-bg)");

export default function Scorecard({ row, lobCsat, lobCsatPrev, month }) {
  const { kpis, composite, zeroWeight, awaitingWeight, noTargetWeight } = useMemo(
    () => computeScorecard({ row, lobCsat, lobCsatPrev }),
    [row, lobCsat, lobCsatPrev]
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
          return (
            <div key={k.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 12px", alignItems: "center", opacity: na ? 0.6 : 1 }}>
              <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>{k.label}</span>
                <span style={{ fontSize: 10.5, color: "var(--tx3)", fontWeight: 600, background: "var(--bg2, rgba(0,0,0,.04))", border: "1px solid var(--bd2)", borderRadius: 10, padding: "0 6px" }}>{k.weight}%</span>
                <span style={{ fontSize: 11, color: "var(--tx3)" }}>target {k.target}</span>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {k.awaiting ? (
                  <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>awaiting data</span>
                ) : k.noTarget ? (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tx2)" }}>{k.valueLabel || "—"}</span>
                ) : na ? (
                  <span style={{ fontSize: 12.5, color: "var(--tx3)" }}>N/A</span>
                ) : (
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: scoreColor(k.score) }}>{k.valueLabel}</span>
                )}
              </div>

              {/* score bar + sublabel spanning both columns */}
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--bd)", overflow: "hidden" }}>
                  {!na && (
                    <div style={{ width: `${Math.max(0, Math.min(100, k.score))}%`, height: "100%", background: scoreColor(k.score), borderRadius: 3 }} />
                  )}
                </div>
                <span style={{ fontSize: 10.5, color: "var(--tx3)", minWidth: 96, textAlign: "right" }}>
                  {k.awaiting ? "login-hours feed" : k.noTarget ? `no target set${k.sub ? " · " + k.sub : ""}` : na ? "0/100 · no data" : `${Math.round(k.score)}/100${k.sub ? " · " + k.sub : ""}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
