import React, { useMemo } from "react";
import { nameFromEmail } from "../../lib/utils.js";
import { computeScorecard, SCORECARD_KPIS, KPI_SHORT, scoreColor, lobChannelKey } from "../../lib/scorecard.js";

// Leaderboard view of the new 10-KPI Scorecard: every QA for the selected
// month, ranked by the weighted composite (normalized over whatever has data).
// Parallel to the legacy score — this does not touch final_performance.
// Super-admin only (the whole Leaderboard page is already super_admin-gated).

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const priorMonth = (mm) => { const [m0, y0] = String(mm || "").split("-"); let i = MO.indexOf(m0), y = +y0; i--; if (i < 0) { i = 11; y--; } return (i >= 0 && isFinite(y)) ? `${MO[i]}-${y}` : null; };

export default function ScorecardLeaderboard({ rows, rosterMap, lobCsatByMonth, month, onSelectQa }) {
  const ranked = useMemo(() => {
    const prev = priorMonth(month);
    const out = (rows || []).map((r) => {
      const email = r.qa_email;
      const lob = r.lob || rosterMap?.[email?.toLowerCase()]?.queue;
      const lobKey = lobChannelKey(lob);
      const lobCsat = lobKey ? lobCsatByMonth?.[month]?.[lobKey] : null;
      const lobCsatPrev = lobKey ? lobCsatByMonth?.[prev]?.[lobKey] : null;
      const sc = computeScorecard({ row: r, lobCsat, lobCsatPrev });
      return { email, name: nameFromEmail(email), sc, byKey: Object.fromEntries(sc.kpis.map((k) => [k.key, k])) };
    });
    // composite desc; QAs with no scorable data sink to the bottom
    out.sort((a, b) => (b.sc.composite ?? -1) - (a.sc.composite ?? -1));
    return out;
  }, [rows, rosterMap, lobCsatByMonth, month]);

  if (!ranked.length) return <div style={{ padding: 24, textAlign: "center", color: "var(--tx3)" }}>No QAs for {month}.</div>;

  const th = { padding: "8px 8px", fontSize: 10.5, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px", borderBottom: "1px solid var(--bd2)", whiteSpace: "nowrap", textAlign: "center", fontWeight: 700 };
  const td = { padding: "8px 8px", borderBottom: "1px solid var(--bd)", fontSize: 13, textAlign: "center", whiteSpace: "nowrap" };

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 16px 6px", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span className="card-title">Scorecard leaderboard</span>
        <span style={{ fontSize: 11.5, color: "var(--tx3)" }}>new KPI model · {month} · ranked by weighted composite (normalized over available KPIs) · Productivity awaits login-hours</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>#</th>
              <th style={{ ...th, textAlign: "left" }}>QA</th>
              <th style={{ ...th }}>Composite</th>
              {SCORECARD_KPIS.map((k) => (
                <th key={k.key} style={th} title={`${k.label} · weight ${k.weight}% · target ${k.target}`}>
                  {KPI_SHORT[k.key] || k.label}<br /><span style={{ fontWeight: 500, color: "var(--tx3)" }}>{k.weight}%</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map((row, i) => (
              <tr key={row.email} style={{ cursor: onSelectQa ? "pointer" : "default" }} onClick={() => onSelectQa?.(row.email)}>
                <td style={{ ...td, textAlign: "left", color: "var(--tx3)", fontWeight: 700 }}>{i + 1}</td>
                <td style={{ ...td, textAlign: "left", fontWeight: 600, color: "var(--tx)" }}>{row.name}</td>
                <td style={{ ...td, fontWeight: 800, fontSize: 15, color: scoreColor(row.sc.composite) }}>
                  {row.sc.composite != null ? row.sc.composite.toFixed(1) + "%" : "—"}
                </td>
                {SCORECARD_KPIS.map((k) => {
                  const cell = row.byKey[k.key];
                  const na = !cell || cell.na || typeof cell.score !== "number";
                  return (
                    <td key={k.key} style={{ ...td, color: na ? "var(--tx3)" : scoreColor(cell.score), fontWeight: na ? 400 : 700 }}
                        title={cell ? `${k.label}: ${cell.awaiting ? "awaiting data" : na ? "N/A" : cell.valueLabel + " (score " + Math.round(cell.score) + "/100)"}` : ""}>
                      {cell?.awaiting ? "⏳" : na ? "—" : cell.valueLabel}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
