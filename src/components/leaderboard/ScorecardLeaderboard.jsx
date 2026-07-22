import React, { useMemo, useState } from "react";
import { nameFromEmail, initialsFromEmail } from "../../lib/utils.js";
import { computeScorecard, scoreColor, lobChannelKey } from "../../lib/scorecard.js";

// Leaderboard view of the new 10-KPI Scorecard: every QA for the selected
// month, ranked by the weighted composite. Compact rows (rank · name ·
// composite) that EXPAND on click into the full per-KPI breakdown — same feel
// as the old leaderboard. Parallel to the legacy score; super-admin only.

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const priorMonth = (mm) => { const [m0, y0] = String(mm || "").split("-"); let i = MO.indexOf(m0), y = +y0; i--; if (i < 0) { i = 11; y--; } return (i >= 0 && isFinite(y)) ? `${MO[i]}-${y}` : null; };
const scoreBg = (s) => (s == null ? "var(--bd)" : s >= 85 ? "var(--green-bg)" : s >= 70 ? "var(--amber-bg)" : "var(--red-bg)");
const rankStyle = (rank) => rank > 3
  ? { color: "var(--tx3)", fontWeight: 600, fontSize: 13 }
  : { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", fontWeight: 700, fontSize: 12,
      background: rank === 1 ? "linear-gradient(135deg,#FEF3C7,#FDE68A)" : rank === 2 ? "linear-gradient(135deg,#F3F4F6,#E5E7EB)" : "linear-gradient(135deg,#FED7AA,#FDBA74)",
      color: rank === 1 ? "#92400E" : rank === 2 ? "#374151" : "#9A3412" };

export default function ScorecardLeaderboard({ rows, rosterMap, lobCsatByMonth, month, onSelectQa }) {
  const [expanded, setExpanded] = useState(null);

  const ranked = useMemo(() => {
    const prev = priorMonth(month);
    const out = (rows || []).map((r) => {
      const email = r.qa_email;
      const lob = r.lob || rosterMap?.[email?.toLowerCase()]?.queue;
      const lobKey = lobChannelKey(lob);
      const lobCsat = lobKey ? lobCsatByMonth?.[month]?.[lobKey] : null;
      const lobCsatPrev = lobKey ? lobCsatByMonth?.[prev]?.[lobKey] : null;
      const sc = computeScorecard({ row: r, lobCsat, lobCsatPrev });
      return { email, name: nameFromEmail(email), sc };
    });
    out.sort((a, b) => (b.sc.composite ?? -1) - (a.sc.composite ?? -1));
    return out;
  }, [rows, rosterMap, lobCsatByMonth, month]);

  if (!ranked.length) return <div style={{ padding: 24, textAlign: "center", color: "var(--tx3)" }}>No QAs for {month}.</div>;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span className="card-title">Scorecard leaderboard</span>
        <span style={{ fontSize: 11.5, color: "var(--tx3)" }}>new KPI model · {month} · ranked by weighted composite · click a row for the KPI breakdown · Productivity awaits login-hours</span>
      </div>

      <div>
        {ranked.map((row, i) => {
          const rank = i + 1;
          const isExp = expanded === row.email;
          const comp = row.sc.composite;
          return (
            <div key={row.email} style={{ borderTop: "1px solid var(--bd)" }}>
              {/* Collapsed row */}
              <div
                onClick={() => setExpanded(isExp ? null : row.email)}
                style={{ display: "grid", gridTemplateColumns: "40px 1fr auto 26px", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", background: isExp ? "var(--primary-light)" : "transparent" }}
              >
                <span style={{ ...rankStyle(rank), justifySelf: "center" }}>{rank}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: "var(--primary-light)", color: "var(--tabby-purple-light, var(--tx2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, border: "2px solid var(--bd2)" }}>{initialsFromEmail(row.email)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</div>
                    <div style={{ fontSize: 11, color: "var(--tx3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.email}</div>
                  </div>
                </div>
                <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 14, fontWeight: 800, background: scoreBg(comp), color: scoreColor(comp) }}>
                  {comp != null ? comp.toFixed(1) + "%" : "—"}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{ justifySelf: "center", transition: "transform .2s", transform: isExp ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
              </div>

              {/* Expanded KPI breakdown */}
              {isExp && (
                <div style={{ padding: "6px 16px 16px 60px", background: "var(--bg)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", margin: "6px 0 10px" }}>
                    KPI breakdown · pass/fail vs target · composite {comp != null ? comp.toFixed(1) + "%" : "—"}{row.sc.zeroWeight > 0 ? ` · ${row.sc.zeroWeight}% below target / no data → 0` : ""}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px 16px" }}>
                    {row.sc.kpis.map((k) => {
                      const na = k.na || typeof k.score !== "number";
                      return (
                        <div key={k.key} style={{ padding: "9px 12px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--bd2)", opacity: na ? 0.7 : 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                              {k.label} <span style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600 }}>{k.weight}%</span>
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: k.noTarget ? "var(--tx2)" : na ? "var(--tx3)" : scoreColor(k.score) }}>
                              {k.awaiting ? "awaiting" : k.noTarget ? (k.valueLabel || "—") : na ? "N/A" : k.valueLabel}
                            </span>
                          </div>
                          <div style={{ height: 5, background: "var(--bd)", borderRadius: 3, overflow: "hidden" }}>
                            {!na && <div style={{ width: `${Math.max(0, Math.min(100, k.score))}%`, height: "100%", background: scoreColor(k.score), borderRadius: 3 }} />}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--tx3)", marginTop: 4 }}>
                            <span>target {k.target}</span>
                            <span>{k.awaiting ? "login-hours feed" : k.noTarget ? `no target${k.sub ? " · " + k.sub : ""}` : na ? "0/100 · no data" : `${Math.round(k.score)}/100${k.sub ? " · " + k.sub : ""}`}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {onSelectQa && (
                    <button onClick={() => onSelectQa(row.email)} style={{ marginTop: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--bd2)", background: "var(--bg3)", color: "var(--tabby-purple)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      View full profile →
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
