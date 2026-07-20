import React, { useState, useEffect } from "react";
import { sb, SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { listTeamTargets } from "../../api/teamTargets.js";

const KPI_CONFIG = [
  { key: "occupancy_pct", label: "Occupancy", thresholds: [95, 98, 100], tip: "Focus on reducing idle time between evaluations" },
  { key: "ontime_coaching_pct", label: "Coaching on-time", thresholds: [90, 93, 95], tip: "Complete coaching sessions within the scheduled window" },
  { key: "avg_calibration_match_rate", label: "Phase Score", thresholds: [85, 90, 95], tip: "Review calibration guidelines before sessions" },
  { key: "avg_observation_score_pct", label: "Observation", thresholds: [82, 85, 88], tip: "Focus on structured feedback delivery" },
  { key: "avg_rtr_score", label: "RTR Score", thresholds: [80, 85, 90], tip: "Double-check evaluation accuracy before submission" },
];

function parseRaw(val) {
  if (!val && val !== 0) return null;
  const s = String(val).trim().replace(",", ".");
  if (s.includes("%")) return parseFloat(s.replace("%", ""));
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n >= 0 && n <= 2) return n * 100;
  return n;
}

function getSlab(rawPct, th) {
  if (rawPct === null) return -1;
  if (rawPct >= th[2]) return 3;
  if (rawPct >= th[1]) return 2;
  if (rawPct >= th[0]) return 1;
  return 0;
}

function resolveTarget(targets, teamName, domain, metricKey) {
  if (!targets || !targets.length) return null;
  const find = (team, dom) => targets.find(t => t.team_name === team && t.domain === dom && t.metric === metricKey);
  const dom = domain || "all";
  return find(teamName, dom) || find(teamName, "all") || find("Default", dom) || find("Default", "all");
}

function matchEmail(rowEmail, myEmail) {
  if (!rowEmail || !myEmail) return false;
  const a = rowEmail.toLowerCase();
  const b = myEmail.toLowerCase();
  if (a === b) return true;
  const localA = a.split("@")[0];
  const localB = b.split("@")[0];
  return localA === localB;
}

function isWorkday(date) {
  const d = date.getDay();
  return d !== 0 && d !== 6;
}

function QADailyProgress({ dailyScores, myData, myEmail, teamTargets, roster, months, mtd }) {
  const { token } = useApp();
  const [targets, setTargets] = useState(null);
  const [historicalDaily, setHistoricalDaily] = useState([]);
  const [streak, setStreak] = useState(0);

  // Fetch team_targets
  useEffect(() => {
    if (teamTargets) { setTargets(teamTargets); return; }
    // Targets drive this widget's denominators. If the fetch fails, fall
    // back to an empty set (the widget degrades to "no target set" rather
    // than vanishing) but don't let the rejection go unhandled.
    listTeamTargets({ token, cache: false })
      .then(t => setTargets(t || []))
      .catch(e => { console.error("QADailyProgress targets:", e); setTargets([]); });
  }, [token, teamTargets]);

  // Fetch historical daily_scores for streak
  useEffect(() => {
    if (!myEmail || !token) return;
    const fourteenAgo = new Date();
    fourteenAgo.setDate(fourteenAgo.getDate() - 14);
    const dateStr = fourteenAgo.toISOString().split("T")[0];
    sb.query("daily_scores", { select: "*", filters: `date=gte.${dateStr}&order=date.asc`, token }).catch(() => [])
      .then(rows => {
        const mine = (rows || []).filter(r => matchEmail(r.qa_email || r.email, myEmail));
        setHistoricalDaily(mine);
      });
  }, [myEmail, token]);

  // Calculate streak when we have targets and historical data
  useEffect(() => {
    if (!targets || !historicalDaily.length) { setStreak(0); return; }
    const myRoster = roster?.find(r => matchEmail(r.email, myEmail));
    const teamName = myRoster?.queue || "Default";
    const domain = myEmail?.includes("@tabby.sa") ? "tabby.sa" : myEmail?.includes("@tabby.ai") ? "tabby.ai" : "all";

    const sbsTgt = resolveTarget(targets, teamName, domain, "daily_sbs");
    const nonSbsTgt = resolveTarget(targets, teamName, domain, "daily_non_sbs");
    const sbsTarget = sbsTgt ? parseFloat(sbsTgt.target_value) : 0;
    const nonSbsTarget = nonSbsTgt ? parseFloat(nonSbsTgt.target_value) : 0;
    const combinedTarget = sbsTarget + nonSbsTarget;
    if (combinedTarget <= 0) { setStreak(0); return; }

    // Build a map of date -> row
    const dateMap = {};
    historicalDaily.forEach(r => { dateMap[r.date] = r; });

    // Count streak from today backwards through workdays
    let count = 0;
    const d = new Date();
    for (let i = 0; i < 14; i++) {
      if (!isWorkday(d)) { d.setDate(d.getDate() - 1); continue; }
      const ds = d.toISOString().split("T")[0];
      const row = dateMap[ds];
      if (!row) break;
      const sbs = parseFloat(row.sbs_count ?? row.sbs ?? 0) || 0;
      const nonSbs = parseFloat(row.non_sbs_count ?? row.non_sbs ?? 0) || 0;
      if (sbs + nonSbs >= combinedTarget) {
        count++;
      } else {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    setStreak(count);
  }, [targets, historicalDaily, roster, myEmail]);

  if (!targets) return null;

  // Resolve my team & domain
  const myRoster = roster?.find(r => matchEmail(r.email, myEmail));
  const teamName = myRoster?.queue || "Default";
  const domain = myEmail?.includes("@tabby.sa") ? "tabby.sa" : myEmail?.includes("@tabby.ai") ? "tabby.ai" : "all";

  // Resolve daily targets
  const sbsTgt = resolveTarget(targets, teamName, domain, "daily_sbs");
  const nonSbsTgt = resolveTarget(targets, teamName, domain, "daily_non_sbs");
  const sbsTarget = sbsTgt ? parseFloat(sbsTgt.target_value) : 0;
  const nonSbsTarget = nonSbsTgt ? parseFloat(nonSbsTgt.target_value) : 0;

  // Find today's row
  const todayRow = (dailyScores || []).find(r => matchEmail(r.qa_email || r.email, myEmail));
  const sbsDone = todayRow ? (parseFloat(todayRow.sbs_count ?? todayRow.sbs ?? 0) || 0) : 0;
  const nonSbsDone = todayRow ? (parseFloat(todayRow.non_sbs_count ?? todayRow.non_sbs ?? 0) || 0) : 0;
  const totalDone = sbsDone + nonSbsDone;
  const totalTarget = sbsTarget + nonSbsTarget;

  // Section 2: Improvement suggestions
  const weakKPIs = [];
  KPI_CONFIG.forEach(kpi => {
    if (!myData) return;
    const raw = parseRaw(myData[kpi.key]);
    if (raw === null) return;
    const slab = getSlab(raw, kpi.thresholds);
    if (slab <= 1) {
      const nextThreshold = slab === 0 ? kpi.thresholds[0] : kpi.thresholds[1];
      weakKPIs.push({ ...kpi, value: raw, slab, nextThreshold });
    }
  });
  weakKPIs.sort((a, b) => a.slab - b.slab);
  const topWeak = weakKPIs.slice(0, 3);

  const barStyle = (done, target) => {
    if (!target) return { width: "0%", background: "var(--bd2)" };
    const pct = Math.min((done / target) * 100, 100);
    const color = pct >= 100 ? "var(--green)" : pct >= 60 ? "var(--amber)" : "var(--red)";
    return { width: pct + "%", background: color };
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header" style={{ paddingBottom: 8 }}>
        <span className="card-title" style={{ fontSize: 14 }}>Daily Progress</span>
        {streak > 0 && <span style={{ fontSize: 13, fontWeight: 600 }}>{"\uD83D\uDD25"} {streak} day streak</span>}
      </div>

      {/* Section 1: Today's progress */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 14 }}>
        {sbsTarget > 0 && <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--tx2)" }}>SBS evals</span>
            <span style={{ fontWeight: 600 }}>{sbsDone} / {sbsTarget}</span>
          </div>
          <div style={{ height: 6, background: "var(--bd2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, transition: "width .4s", ...barStyle(sbsDone, sbsTarget) }} />
          </div>
        </div>}

        {nonSbsTarget > 0 && <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--tx2)" }}>Non-SBS evals</span>
            <span style={{ fontWeight: 600 }}>{nonSbsDone} / {nonSbsTarget}</span>
          </div>
          <div style={{ height: 6, background: "var(--bd2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, transition: "width .4s", ...barStyle(nonSbsDone, nonSbsTarget) }} />
          </div>
        </div>}

        {totalTarget > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: totalDone >= totalTarget ? "var(--green)" : "var(--tx2)" }}>
          <span>Total</span>
          <span>{totalDone} / {totalTarget} evals{totalDone >= totalTarget ? " \u2714" : ""}</span>
        </div>}

        {totalTarget === 0 && <div style={{ fontSize: 12, color: "var(--tx3)" }}>No daily targets configured for your team.</div>}
      </div>

      {/* Section 2: Improvement suggestions */}
      <div style={{ borderTop: "1px solid var(--bd2)", paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--tx1)" }}>Improvement Focus</div>
        {topWeak.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, padding: "8px 0" }}>
            All KPIs are on track -- great work! Keep it up.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topWeak.map(kpi => (
              <div key={kpi.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: kpi.slab === 0 ? "var(--red)" : "var(--amber)" }} />
                <div>
                  <div style={{ fontWeight: 600, color: "var(--tx1)" }}>
                    {kpi.label}: <span style={{ color: kpi.slab === 0 ? "var(--red)" : "var(--amber)" }}>{kpi.value.toFixed(1)}%</span>
                    <span style={{ fontWeight: 400, color: "var(--tx3)" }}> (need {kpi.nextThreshold}%)</span>
                  </div>
                  <div style={{ color: "var(--tx3)", marginTop: 2 }}>{kpi.tip}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default QADailyProgress;
