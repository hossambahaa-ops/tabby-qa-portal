import React, { useState, useEffect } from "react";
import { useApp } from "../../lib/AppContext.jsx";
import { fetchExpertise, renderStars, starColor } from "../../lib/expertise.js";

/**
 * <TeamChampions teamEmails={[...]} month="Apr-2026" onOpen={() => navigate("expertise")} />
 *
 * Compact lead-view widget showing the count of QAs at each star level
 * for the lead's team. Click → jump to the full Expertise page.
 */
export default function TeamChampions({ teamEmails, month, onOpen }) {
  const { token } = useApp();
  const [counts, setCounts] = useState({ 3: 0, 2: 0, 1: 0, 0: 0 });
  const [topNames, setTopNames] = useState({ 3: [], 2: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !month || !teamEmails || teamEmails.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchExpertise({ token, month }).then(rows => {
      if (cancelled) return;
      const team = new Set(teamEmails.map(e => (e || "").toLowerCase()));
      const myTeam = (rows || []).filter(r => team.has((r.qa_email || "").toLowerCase()));
      const c = { 3: 0, 2: 0, 1: 0, 0: 0 };
      const names = { 3: [], 2: [] };
      myTeam.forEach(r => {
        const lvl = Number(r.star_level) || 0;
        c[lvl]++;
        if (lvl === 3 && names[3].length < 3) names[3].push(r.qa_email);
        if (lvl === 2 && names[2].length < 3) names[2].push(r.qa_email);
      });
      setCounts(c);
      setTopNames(names);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token, month, teamEmails]);

  const total = counts[3] + counts[2] + counts[1] + counts[0];

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16, cursor: onOpen ? "pointer" : "default" }} onClick={onOpen}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>🏆</span>
        <span className="card-title" style={{ fontSize: 14 }}>Team Champions</span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: "var(--amber-bg)", color: "var(--amber)", letterSpacing: ".5px" }}>PILOT</span>
        {onOpen && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--tabby-purple)", fontWeight: 600 }}>View all →</span>}
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>Loading…</div>
      ) : total === 0 ? (
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>No expertise data for {month} yet.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[3, 2, 1, 0].map(lv => (
              <div key={lv} style={{
                padding: "10px 12px", borderRadius: 10,
                background: "var(--bg)", border: "1px solid var(--bd2)",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: starColor(lv), marginBottom: 2 }}>
                  {lv > 0 ? renderStars(lv) : <span style={{ fontSize: 11, color: "var(--tx3)" }}>0★</span>}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.5px", color: starColor(lv), fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{counts[lv]}</div>
                <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 3 }}>
                  {lv === 3 ? "Triple-domain" : lv === 2 ? "Cross-domain" : lv === 1 ? "Specialist" : "Building"}
                </div>
              </div>
            ))}
          </div>
          {(topNames[3].length > 0 || topNames[2].length > 0) && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--bd2)", fontSize: 11, color: "var(--tx2)" }}>
              {topNames[3].length > 0 && (
                <div style={{ marginBottom: 3 }}>
                  <span style={{ color: starColor(3), fontWeight: 700 }}>⭐⭐⭐</span>{" "}
                  {topNames[3].map(e => e.split("@")[0].split(".").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")).join(", ")}
                </div>
              )}
              {topNames[2].length > 0 && (
                <div>
                  <span style={{ color: starColor(2), fontWeight: 700 }}>⭐⭐</span>{" "}
                  {topNames[2].map(e => e.split("@")[0].split(".").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")).join(", ")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
