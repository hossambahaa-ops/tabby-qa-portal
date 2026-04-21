import React, { useState, useEffect } from "react";
import { sb, dataCache } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { listTeamTargets } from "../../api/teamTargets.js";
import HelpTip from "../HelpTip.jsx";

const fmtPct = (v) => { const n = parseFloat(v); return isNaN(n) ? "—" : n.toFixed(1) + "%"; };

export default function QASelfServiceDashboard({ dailyScores, myData, myEmail, roster, ranked, myRank, maxScore, getScore, latestMonth }) {
  const { token } = useApp();
  const [teamTargets, setTeamTargets] = useState([]);

  useEffect(() => {
    listTeamTargets({ token, select: "team_name,domain,metric,target_value,qa_email" })
      .then(t => setTeamTargets(Array.isArray(t) ? t : []));
  }, [token]);

  // Daily score for today
  const d = dailyScores.find(x => {
    if (!x.qa_email || !myEmail) return false;
    const a = x.qa_email.toLowerCase(), b = myEmail.toLowerCase();
    return a === b || a.split("@")[0] === b.split("@")[0];
  });
  const sbs = parseFloat(d?.sbs_count || d?.sbs || 0);
  const nonSbs = parseFloat(d?.non_sbs_count || d?.non_sbs || 0);
  const totalEvals = sbs + nonSbs;
  const coaching = parseFloat(d?.coaching_count || d?.coaching_sessions || 0);
  const stMins = parseFloat(d?.side_task_minutes || 0);
  // Ticket handling day metrics — login_hours drives occupancy like side tasks
  const loginHrs = parseFloat(d?.login_hours || 0);
  const loginMins = loginHrs * 60;
  const csatScore = d?.csat_score !== null && d?.csat_score !== undefined ? parseFloat(d.csat_score) : null;
  const ticketsHandled = parseFloat(d?.tickets_handled || 0);
  const apt = d?.apt !== null && d?.apt !== undefined ? parseFloat(d.apt) : null;
  const agpt = d?.agpt !== null && d?.agpt !== undefined ? parseFloat(d.agpt) : null;
  const productivity = loginHrs > 0 ? ticketsHandled / loginHrs : 0;
  const isTicketDay = loginHrs > 0;

  // Resolve targets
  const qaEmail = myEmail?.toLowerCase() || "";
  const qaDomain = qaEmail.endsWith("@tabby.sa") ? "tabby.sa" : "tabby.ai";
  const qaQueue = roster.find(r => {
    const e = r.email?.toLowerCase();
    return e === qaEmail || e?.split("@")[0] === qaEmail.split("@")[0];
  })?.queue || "Default";

  const findTgt = (metric) => {
    const qaMatch = teamTargets.find(t => t.qa_email?.toLowerCase() === qaEmail && t.metric === metric);
    if (qaMatch) return qaMatch;
    const find = (team, dom) => teamTargets.find(t => !t.qa_email && t.team_name === team && t.domain === dom && t.metric === metric);
    return find(qaQueue, qaDomain) || find(qaQueue, "all") || find("Default", qaDomain) || find("Default", "all");
  };

  const sbsTarget = parseFloat(findTgt("daily_sbs")?.target_value) || 3;
  const nonSbsTarget = parseFloat(findTgt("daily_non_sbs")?.target_value) || 10;
  const occTarget = parseFloat(findTgt("occupancy_pct")?.target_value) || 95;
  const coachingTarget = parseFloat(findTgt("daily_coaching")?.target_value) || 1;
  const stTarget = parseFloat(findTgt("daily_side_task_mins")?.target_value) || 60;
  const whTarget = parseFloat(findTgt("daily_working_hours")?.target_value) || 8;
  const sbsDur = parseFloat(findTgt("sbs_duration_minutes")?.target_value) || 20;
  const nonSbsDur = parseFloat(findTgt("non_sbs_duration_minutes")?.target_value) || 15;
  const coachingDur = parseFloat(findTgt("coaching_duration_minutes")?.target_value) || 30;

  const shiftMins = whTarget * 60;
  const productiveMins = (sbs * sbsDur) + (nonSbs * nonSbsDur) + (coaching * coachingDur) + stMins + loginMins;
  const occPct = shiftMins > 0 ? (productiveMins / shiftMins) * 100 : 0;
  const workingHrs = productiveMins / 60;
  const totalTarget = sbsTarget + nonSbsTarget;
  const evalPct = totalTarget > 0 ? totalEvals / totalTarget : 0;

  // Motivational status — compare progress vs shift elapsed
  const now = new Date();
  const shiftStart = 9; // 9 AM default
  const hoursElapsed = Math.max(0, now.getHours() + now.getMinutes() / 60 - shiftStart);
  const shiftProgress = Math.min(1, hoursElapsed / whTarget);
  const hasStarted = d !== undefined;

  let statusMsg, statusColor, statusBg;
  if (!hasStarted) {
    statusMsg = "Start your day! Your targets are waiting.";
    statusColor = "var(--tx2)"; statusBg = "var(--bg3)";
  } else if (evalPct >= 1) {
    statusMsg = "Target reached! Great work today!";
    statusColor = "var(--green)"; statusBg = "var(--green-bg)";
  } else if (evalPct >= shiftProgress) {
    statusMsg = "On track! Keep up the pace.";
    statusColor = "var(--green)"; statusBg = "var(--green-bg)";
  } else if (evalPct >= shiftProgress * 0.7) {
    statusMsg = "Slightly behind — pick it up!";
    statusColor = "var(--amber)"; statusBg = "var(--amber-bg)";
  } else {
    statusMsg = "Behind pace — time to catch up!";
    statusColor = "var(--red)"; statusBg = "var(--red-bg)";
  }

  // Progress bar helper
  const bar = (val, max, color) => (
    <div style={{ height: 6, background: "var(--bd2)", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
      <div style={{ width: Math.min(100, max > 0 ? (val / max) * 100 : 0) + "%", height: "100%", borderRadius: 3, background: color, transition: "width .5s" }} />
    </div>
  );

  const pctColor = (val, target) => val >= target ? "var(--green)" : val >= target * 0.6 ? "var(--amber)" : "var(--red)";

  // Donut for evals
  const circumference = 2 * Math.PI * 28;
  const pct = totalTarget > 0 ? Math.min(100, Math.round((totalEvals / totalTarget) * 100)) : 0;
  const sbsFrac = totalEvals > 0 ? sbs / totalEvals : 0;
  const nsbsFrac = totalEvals > 0 ? nonSbs / totalEvals : 0;
  const sbsArc = sbsFrac * pct / 100 * circumference;
  const nsbsArc = nsbsFrac * pct / 100 * circumference;

  // Remaining work
  const remSbs = Math.max(0, sbsTarget - sbs);
  const remNsbs = Math.max(0, nonSbsTarget - nonSbs);
  const remCoaching = Math.max(0, coachingTarget - coaching);
  const remSt = Math.max(0, stTarget - stMins);
  const allMet = remSbs === 0 && remNsbs === 0 && remCoaching === 0 && remSt === 0;

  return (
    <div>
      {/* Daily Side Task reminder — shown until any minutes are logged today */}
      {stMins <= 0 && (
        <div style={{
          padding: "12px 16px", borderRadius: 12, marginBottom: 12,
          background: "var(--amber-bg)", border: "1px solid var(--amber)",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>📝</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--amber)" }}>
              Remember to submit your Side Tasks today
            </div>
            <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 3, lineHeight: 1.45 }}>
              Side Task minutes feed into your Occupancy. Log them daily, keep them accurate, and align with your QA Lead.
            </div>
          </div>
        </div>
      )}

      {/* Motivational banner */}
      <div style={{ padding: "14px 20px", borderRadius: 12, background: statusBg, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22 }}>{!hasStarted ? "☀️" : evalPct >= 1 ? "🎉" : evalPct >= shiftProgress ? "💪" : "⚡"}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: statusColor }}>{statusMsg}</div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>
            {hasStarted ? `${Math.round(shiftProgress * 100)}% of shift elapsed · ${Math.round(evalPct * 100)}% of eval target done` : `Shift starts at ${shiftStart}:00`}
          </div>
        </div>
      </div>

      {/* Hero stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        {/* Total Evals */}
        <div className="card" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>Today's Evals<HelpTip text="SBS (side-by-side) + Non-SBS evaluations completed today vs your daily target."/></div>
          <div style={{ position: "relative", width: 72, height: 72, margin: "0 auto 10px" }}>
            <svg width="72" height="72" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--bd2)" strokeWidth="5" />
              {sbs > 0 && <circle cx="32" cy="32" r="28" fill="none" stroke="var(--green)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${sbsArc} ${circumference - sbsArc}`} transform="rotate(-90 32 32)" />}
              {nonSbs > 0 && <circle cx="32" cy="32" r="28" fill="none" stroke="var(--blue)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${nsbsArc} ${circumference - nsbsArc}`} transform={`rotate(${-90 + sbsFrac * pct / 100 * 360} 32 32)`} />}
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: totalEvals > 0 ? "var(--tx)" : "var(--tx3)" }}>{totalEvals}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, fontSize: 11 }}>
            <span style={{ color: "var(--green)", fontWeight: 600 }}>{sbs} SBS</span>
            <span style={{ color: "var(--blue)", fontWeight: 600 }}>{nonSbs} Non</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>{totalEvals} / {totalTarget} target</div>
        </div>

        {/* Occupancy */}
        <div className="card" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>Occupancy<HelpTip text={`Productive time / shift hours. SBS=${sbsDur}min, Non-SBS=${nonSbsDur}min, Coaching=${coachingDur}min + side tasks + ticket login hours.`}/></div>
          <div style={{ fontSize: 36, fontWeight: 800, color: occPct > 0 ? pctColor(occPct, occTarget) : "var(--tx3)", lineHeight: 1.1 }}>
            {occPct > 0 ? occPct.toFixed(1) + "%" : "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Target: {occTarget}%</div>
          {bar(occPct, occTarget, pctColor(occPct, occTarget))}
        </div>

        {/* Working Hours */}
        <div className="card" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>Working Hours<HelpTip text="Total productive time in hours, calculated from your evaluations, coaching, and side tasks."/></div>
          <div style={{ fontSize: 36, fontWeight: 800, color: workingHrs > 0 ? pctColor(workingHrs, whTarget) : "var(--tx3)", lineHeight: 1.1 }}>
            {workingHrs > 0 ? workingHrs.toFixed(1) + "h" : "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>/ {whTarget}h shift</div>
          {bar(workingHrs, whTarget, pctColor(workingHrs, whTarget))}
        </div>
      </div>

      {/* Progress Breakdown */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12 }}>Progress Breakdown</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
          {[
            { label: "SBS", done: sbs, target: sbsTarget, unit: "" },
            { label: "Non-SBS", done: nonSbs, target: nonSbsTarget, unit: "" },
            { label: "Coaching", done: coaching, target: coachingTarget, unit: "" },
            { label: "Side Tasks", done: stMins, target: stTarget, unit: "m", fmtDone: stMins >= 60 ? Math.floor(stMins / 60) + "h " + Math.round(stMins % 60) + "m" : Math.round(stMins) + "m" },
          ].map(m => {
            const pctDone = m.target > 0 ? m.done / m.target : 0;
            const color = pctDone >= 1 ? "var(--green)" : pctDone >= 0.6 ? "var(--amber)" : "var(--red)";
            return (
              <div key={m.label} style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--tx2)" }}>{m.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color }}>
                    {m.fmtDone || m.done}<span style={{ fontSize: 11, fontWeight: 400, color: "var(--tx3)" }}> / {m.target}{m.unit}</span>
                  </span>
                </div>
                {bar(m.done, m.target, color)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Ticket handling — only shown when QA was logged in for tickets today */}
      {isTicketDay && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            Ticket Handling
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--primary-light)", color: "var(--primary-text)", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>Today</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { label: "Login Hours", val: loginHrs.toFixed(1) + "h", color: "var(--tx)" },
              { label: "Tickets Handled", val: Math.round(ticketsHandled), color: "var(--tx)" },
              { label: "Productivity", val: loginHrs > 0 ? productivity.toFixed(1) + "/h" : "—", color: "var(--accent-text)", hint: "Tickets per login hour" },
              { label: "CSAT", val: csatScore !== null ? csatScore.toFixed(1) + "%" : "—", color: csatScore !== null && csatScore >= 90 ? "var(--green)" : csatScore !== null && csatScore >= 75 ? "var(--amber)" : "var(--red)" },
              { label: "APT", val: apt !== null ? apt.toFixed(1) + "m" : "—", color: "var(--tx)", hint: "Average Basket Time" },
              { label: "AGPT", val: agpt !== null ? agpt.toFixed(1) + "m" : "—", color: "var(--tx)", hint: "Average Group Basket Time" },
            ].map(m => (
              <div key={m.label} style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  {m.label}
                  {m.hint && <HelpTip text={m.hint} />}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: m.color, marginTop: 2 }}>{m.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remaining work */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        {allMet ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--green)" }}>All daily targets met!</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>Still Needed Today</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {remSbs > 0 && <div style={{ padding: "8px 14px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{remSbs} more SBS</div>}
              {remNsbs > 0 && <div style={{ padding: "8px 14px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{remNsbs} more Non-SBS</div>}
              {remCoaching > 0 && <div style={{ padding: "8px 14px", borderRadius: 8, background: "var(--amber-bg)", color: "var(--amber)", fontSize: 13, fontWeight: 600 }}>{remCoaching} more Coaching</div>}
              {remSt > 0 && <div style={{ padding: "8px 14px", borderRadius: 8, background: "var(--amber-bg)", color: "var(--amber)", fontSize: 13, fontWeight: 600 }}>{Math.round(remSt)}m Side Tasks</div>}
            </div>
          </>
        )}
      </div>

      {/* Quick stats row */}
      {myData && <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>MTD Score</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: myData.final_performance >= 0.4 ? "var(--green)" : myData.final_performance >= 0.25 ? "var(--amber)" : "var(--red)", marginTop: 4 }}>
            {myData.final_performance ? (myData.final_performance * 100).toFixed(1) + "%" : "—"}
          </div>
          <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{latestMonth}</div>
        </div>
        <div className="card" style={{ padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>Rank</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent-text)", marginTop: 4 }}>
            {myRank > 0 ? "#" + myRank : "—"}<span style={{ fontSize: 13, fontWeight: 400, color: "var(--tx3)" }}> / {ranked.length}</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>of all QAs</div>
        </div>
        <div className="card" style={{ padding: "14px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>Coaching On-time</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: parseFloat(myData.ontime_coaching_pct) >= 85 ? "var(--green)" : "var(--amber)", marginTop: 4 }}>
            {fmtPct(myData.ontime_coaching_pct)}
          </div>
          <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{latestMonth}</div>
        </div>
      </div>}
    </div>
  );
}
