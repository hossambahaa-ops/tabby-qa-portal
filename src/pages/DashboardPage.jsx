import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache, SUPABASE_URL, SUPABASE_ANON } from "../lib/supabase.js";
import { nameFromEmail, initialsFromEmail, safeError, logActivity, csatPctValue, csatColor, emailsMatchLoose } from "../lib/utils.js";
import { parseRawD, KPI_SLABS_D, calcSlabD, getScore, MAX_SCORE, scoreColor, scoreBg } from "../lib/dashboardScore.js";
import { useConfirm } from "../lib/hooks.jsx";
import { useDashboardData } from "../lib/useDashboardData.jsx";
import { riyadhTodayStr } from "../lib/attendancePlan.js";
import { useFreshness } from "../lib/useFreshness.js";
import { callEdgeFunction } from "../lib/edgeSync.js";
import FreshnessBadge from "../components/FreshnessBadge.jsx";
import HelpTip from "../components/HelpTip.jsx";
import { helpFor } from "../lib/metricHelp.js";
import { Icon, icons } from "../components/Icons.jsx";
import QualityPrinciple from "../components/QualityPrinciple.jsx";
import { ProgressRing, MiniBarChart, SparkLine } from "../components/Charts.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import { LoadErrorBanner } from "../components/AsyncSection.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";
import DashboardTasks from "../components/dashboard/DashboardTasks.jsx";
import MyResponsibilities from "../components/dashboard/MyResponsibilities.jsx";
import APDetectionAlerts from "../components/dashboard/APDetectionAlerts.jsx";
// TeamHealth removed in the dashboard simplification pass — its KPI
// grid duplicated the per-QA Team members table further down the page.
// import TeamHealth from "../components/dashboard/TeamHealth.jsx";
import AttendanceHealthCard from "../components/attendance/AttendanceHealthCard.jsx";
// TeamChampions moved off the dashboard — admin-only widget lives on the Expertise page now.
import PerformanceTrendChart from "../components/dashboard/PerformanceTrendChart.jsx";
import QADailyProgress from "../components/dashboard/QADailyProgress.jsx";
import PendingSideTasksCard from "../components/dashboard/PendingSideTasksCard.jsx";
// OwedCoachingsCard replaced by the cadence-aware CoachingCadenceCard
// (WPR-this-week + MPR-this-month with leave exclusion + owed list).
// import OwedCoachingsCard from "../components/dashboard/OwedCoachingsCard.jsx";
import CoachingCadenceCard from "../components/dashboard/CoachingCadenceCard.jsx";
import TeamOccupancyCard from "../components/dashboard/TeamOccupancyCard.jsx";
import QASelfServiceDashboard from "../components/dashboard/QASelfServiceDashboard.jsx";
import DailyCheckInWidget from "../components/dashboard/DailyCheckInWidget.jsx";
import MyTrackerWidget from "../components/dashboard/MyTrackerWidget.jsx";
// AttendanceQuickSet removed in the dashboard simplification pass —
// DailyCheckInWidget below already provides attendance check-in with
// more context (planned vs actual, mismatch warnings).
// import AttendanceQuickSet from "../components/dashboard/AttendanceQuickSet.jsx";

function DashboardPage(){
  const{profile,token,gf,globalToast}=useApp();
  // Bulk dashboard data load + AP-detection alerts live in useDashboardData.
  const {
    mtd, roster, appProfiles, damCount, profileCount,
    todayAttendance, monthAttendance, apPlans, apWeeks, apDetections, apDismissals,
    dailyScores, loading, loadError, refresh: loadDashboard,
    setApDetections, setApDismissals,
  } = useDashboardData(token, profile);
  const isLead=hasRole(profile?.role,"qa_lead");
  const isAdmin=hasRole(profile?.role,"admin");
  const isSupervisor=hasRole(profile?.role,"qa_supervisor");
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  const fmt=(val)=>{if(val===null||val===undefined||val==="")return"—";const s=String(val).trim();if(s.includes("%"))return s;const n=parseFloat(s.replace(",","."));if(isNaN(n))return s;if(n>=0&&n<=2)return(n*100).toFixed(1)+"%";if(n>2&&!Number.isInteger(n))return n.toFixed(1)+"%";return String(val);};

  const maxScore = MAX_SCORE;

  const months=sortMonthsDesc([...new Set(mtd.map(r=>r.month))]);
  const latestMonth=months[0]||"—";
  const prevMonth=months[1]||null;

  const current=mtd.filter(r=>r.month===latestMonth);
  const previous=prevMonth?mtd.filter(r=>r.month===prevMonth):[];

  const myEmail=profile?.email?.toLowerCase();
  // Cross-domain tolerant: a QA logged in as @tabby.ai whose MTD row
  // was written under @tabby.sa (or vice versa) used to see no
  // personal data on the dashboard. emailsMatchLoose strips the local
  // part so both variants resolve to the same person.
  const myData=current.find(r=>emailsMatchLoose(r.qa_email,myEmail));
  const myPrevData=previous.find(r=>emailsMatchLoose(r.qa_email,myEmail));

  const ranked=[...current].sort((a,b)=>getScore(b)-getScore(a));
  const myRank=ranked.findIndex(r=>emailsMatchLoose(r.qa_email,myEmail))+1;

  const myRoster=roster.find(r=>r.email.toLowerCase()===myEmail);

  const myEmailLocal=myEmail?myEmail.split("@")[0]:"";
  const myEmailAlt=myEmail?(myEmail.endsWith("@tabby.ai")?myEmailLocal+"@tabby.sa":myEmailLocal+"@tabby.ai"):"";
  const myTeamEmails=roster.filter(r=>{
    const mgr=r.manager_email?.toLowerCase();
    return mgr&&(mgr===myEmail||mgr===myEmailAlt||mgr===myEmailLocal);
  }).map(r=>r.email.toLowerCase());
  const myTlEmails=current.filter(r=>{
    const tl=r.qa_tl?.toLowerCase();
    return tl&&(tl===myEmail||tl===myEmailAlt||tl===myEmailLocal);
  }).map(r=>r.qa_email?.toLowerCase());
  const allTeamEmails=[...new Set([...myTeamEmails,...myTlEmails])];
  const teamCurrent=current.filter(r=>allTeamEmails.includes(r.qa_email?.toLowerCase()));
  const teamPrevious=previous.filter(r=>allTeamEmails.includes(r.qa_email?.toLowerCase()));
  const teamSorted=[...teamCurrent].sort((a,b)=>getScore(b)-getScore(a));

  const teamAvgScore=teamCurrent.length?(teamCurrent.reduce((a,r)=>a+getScore(r),0)/teamCurrent.length):0;
  const teamAvgScorePrev=teamPrevious.length?(teamPrevious.reduce((a,r)=>a+getScore(r),0)/teamPrevious.length):0;
  const teamTrend=teamPrevious.length?(teamAvgScore-teamAvgScorePrev).toFixed(1):null;
  const teamDsat=teamCurrent.reduce((a,r)=>a+(r.dsat||0),0);

  const myHistory=months.slice(0,6).reverse().map(m=>{const row=mtd.find(r=>r.month===m&&emailsMatchLoose(r.qa_email,myEmail));return{month:m,score:row?getScore(row):null};}).filter(d=>d.score!==null);

  const nav=(page)=>window.dispatchEvent(new CustomEvent("navigate",{detail:page}));

  const[syncing,setSyncing]=useState(false);
  const[freshnessKey,setFreshnessKey]=useState(0);
  const[syncPulse,setSyncPulse]=useState(0);
  const freshness=useFreshness(token,freshnessKey);

  return(<div className="page">
    <QualityPrinciple variant="strip"/>
    {/* Admin/Supervisor action bar — "Send announcement" moved to the
        topbar so every page can reach it. Only the super-admin "Refresh
        live" button remains here. */}
    {hasRole(profile?.role,"super_admin")&&<div className="dashboard-action-bar" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
      <FreshnessBadge ts={freshness} pulseKey={syncPulse} />
      <div style={{display:"flex",gap:8}}>
      {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" disabled={syncing} onClick={async()=>{
        // Pulls all three live CSVs (Today_Productivity, MTD,
        // Q_Support_Performance) through the Supabase edge functions
        // — same path as the QA Profile "Refresh live" button. Cron
        // already fires every 5 min; this is the manual trigger.
        if (syncing) return;
        setSyncing(true);
        try {
          const [daily, mtdRes, csat] = await Promise.all([
            callEdgeFunction("daily-scores-sync", { token }),
            callEdgeFunction("mtd-sync", { token }),
            callEdgeFunction("csat-topic-sync", { token }),
          ]);
          dataCache?.invalidate?.();
          await loadDashboard?.();
          const syncErr = (name, res) => {
            if (res.ok && res.data?.success) return null;
            const d = res.data || {};
            const msg = d.error || d.message || d.details || (res.ok ? "unexpected response" : `HTTP ${res.status || "?"}`);
            const step = d.step ? ` [${d.step}]` : "";
            console.warn(`[sync/${name}] failed:`, d);
            return `${name}${step}: ${msg}`;
          };
          const fail = [
            syncErr("daily", daily),
            syncErr("mtd",   mtdRes),
            syncErr("csat",  csat),
          ].filter(Boolean);
          if (fail.length === 0) {
            const parts = [];
            if (daily.data.rows_upserted) parts.push(`${daily.data.rows_upserted} daily`);
            if (mtdRes.data.rows_upserted) parts.push(`${mtdRes.data.rows_upserted} MTD`);
            if (csat.data.rows_aggregated) parts.push(`${csat.data.rows_aggregated} CSAT topics`);
            globalToast("success", `Live sync — ${parts.join(" · ")}`);
            setSyncPulse(p => p + 1);
            logActivity(token, profile?.email, "live_sync_triggered", "edge_functions", null, parts.join(" · "));
          } else {
            console.error("[sync] failures:", fail);
            globalToast("error", `Sync issue — ${fail[0]}${fail.length > 1 ? ` (+${fail.length - 1} more, see console)` : ""}`);
            logActivity(token, profile?.email, "live_sync_failed", "edge_functions", null, fail.join(" | "));
          }
        } catch (e) {
          console.error("[sync] unexpected:", e);
          globalToast("error", "Sync failed: " + safeError(e));
        }
        setSyncing(false);
        setFreshnessKey(k=>k+1);
      }} style={{fontSize:12}}>
        {syncing?<><div className="spinner" style={{width:14,height:14,borderWidth:2,marginRight:6}}/>Syncing...</>:<><Icon d={icons.upload} size={14}/>Refresh live</>}
      </button>}
      </div>
    </div>}

    {/* Announcement form was moved to the topbar (see App.jsx). */}

    <div className="welcome-banner">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:48,height:48,borderRadius:"50%",overflow:"hidden",flexShrink:0,border:"2px solid rgba(255,255,255,.2)"}}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" style={{width:48,height:48,objectFit:"cover"}}/> :
            <div style={{width:48,height:48,background:"linear-gradient(135deg, var(--tabby-purple), var(--tabby-purple-light))",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700}}>{initialsFromEmail(profile?.email)||"U"}</div>}
          </div>
          <div>
            <h2>Welcome back, {nameFromEmail(profile?.email).split(" ")[0]||"there"}</h2>
            <p>{isLead?"Here's your team overview for "+latestMonth+".":"Here's your performance overview for "+latestMonth+"."}</p>
            {/* Role/domain badge removed — the topbar already shows
                the user's identity. */}
          </div>
        </div>
        {/* Welcome banner trimmed: the Leaderboard / Profile / MTD /
            Log Coaching buttons that used to live here duplicated the
            sidebar navigation exactly. Removed in the dashboard
            simplification pass. AttendanceQuickSet for QAs also
            removed — DailyCheckInWidget below already covers it with
            more context. */}
      </div>
      {/* KPI strip — at-a-glance personal metrics. Each value carries
          a one-sentence narrative so the number tells a story instead
          of standing alone. Deltas are computed against the same QA's
          previous-month row when available. */}
      {myData && (() => {
        const myScore = getScore(myData);
        const myCsat = csatPctValue(myData.csat_pct);
        const prevCsat = myPrevData ? csatPctValue(myPrevData.csat_pct) : null;
        const prevDsat = myPrevData ? Number(myPrevData.dsat || 0) : null;
        const myDsat = Number(myData.dsat || 0);
        const delta = myPrevData ? myScore - getScore(myPrevData) : null;
        const dCls = delta == null ? "" : delta >= 0.05 ? "kpi-strip-delta-up" : delta <= -0.05 ? "kpi-strip-delta-down" : "kpi-strip-delta-flat";
        const dArrow = delta == null ? "" : delta >= 0.05 ? "↑" : delta <= -0.05 ? "↓" : "·";
        // ── Narrative helpers ───────────────────────────────────────
        // Storytelling sub-lines: combine the bare descriptor with a
        // human-readable comparison vs the previous month. Each picks
        // a short phrase based on the size and direction of the
        // change so the user gets immediate context.
        const csatStory = (() => {
          const surveys = Number(myData.csat_total || 0);
          const prevSurveys = Number(myPrevData?.csat_total || 0);
          if (surveys === 0 && prevSurveys === 0) return "no surveys yet";
          if (surveys === 0 && prevCsat != null) return `no surveys this month · ${prevCsat.toFixed(1)}% in ${prevMonth}`;
          if (surveys > 0 && prevSurveys === 0) return `${surveys} surveys · first ones this year`;
          // Guard against NaN when prevSurveys > 0 but csat_pct
          // wasn't populated on the prior row — previously rendered
          // "↑ NaN pts from <month>".
          if (myCsat == null || prevCsat == null) return `${surveys} surveys`;
          const d = myCsat - prevCsat;
          const dir = d >= 0.5 ? "↑" : d <= -0.5 ? "↓" : "·";
          const phrase = Math.abs(d) < 0.5 ? "holding steady" : `${dir} ${Math.abs(d).toFixed(1)} pts from ${prevMonth}`;
          return `${surveys} surveys · ${phrase}`;
        })();
        const dsatStory = (() => {
          if (myDsat === 0 && prevDsat === 0) return "clean two months in a row";
          if (myDsat === 0 && prevDsat > 0) return `clean month · ${prevDsat} in ${prevMonth}`;
          if (myDsat > 0 && prevDsat === 0) return `up from zero last month`;
          if (prevDsat == null) return "this month";
          const d = myDsat - prevDsat;
          if (d === 0) return `same as ${prevMonth}`;
          return d > 0 ? `↑ ${d} vs ${prevMonth}` : `↓ ${Math.abs(d)} vs ${prevMonth}`;
        })();
        return (
          <div className="kpi-strip">
            <div className="kpi-strip-item">
              <span className="kpi-strip-label">My MTD score<HelpTip text={helpFor("score")}/></span>
              <span className="kpi-strip-value">{myScore.toFixed(1)}<span style={{fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:500}}> / {maxScore}</span></span>
              {delta != null && <span className={`kpi-strip-delta ${dCls}`}>{dArrow} {Math.abs(delta).toFixed(1)} pts vs {prevMonth}</span>}
            </div>
            <div className="kpi-strip-item">
              <span className="kpi-strip-label">My CSAT<HelpTip text={helpFor("csat")}/></span>
              <span className="kpi-strip-value">{myCsat != null ? myCsat.toFixed(1) + "%" : "—"}</span>
              <span className="kpi-strip-sub">{csatStory}</span>
            </div>
            <div className="kpi-strip-item">
              <span className="kpi-strip-label">Rank<HelpTip text={helpFor("rank")}/></span>
              <span className="kpi-strip-value">{myRank > 0 ? "#" + myRank : "—"}<span style={{fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:500}}> / {ranked.length}</span></span>
              <span className="kpi-strip-sub">{(() => {
                if (myRank <= 0) return `in ${latestMonth}`;
                if (myRank <= 3) return `top 3 in ${latestMonth}`;
                // Skip the "top 10%" tier when the population is so
                // small that ceil(N*0.1) <= 3 — the rank 1-3 check
                // above already swallows everyone who'd qualify, and
                // labeling "top 10%" stops being meaningful for tiny
                // teams. (Previously rank 4 with 6 QAs got mislabeled
                // "in <month>" instead of "top quartile".)
                const top10Cut = Math.ceil(ranked.length * 0.1);
                if (top10Cut > 3 && myRank <= top10Cut) return `top 10% in ${latestMonth}`;
                if (myRank <= Math.ceil(ranked.length * 0.25)) return `top quartile in ${latestMonth}`;
                return `in ${latestMonth}`;
              })()}</span>
            </div>
            <div className="kpi-strip-item">
              <span className="kpi-strip-label">DSATs<HelpTip text={helpFor("dsat")}/></span>
              <span className="kpi-strip-value">{myDsat}</span>
              <span className="kpi-strip-sub">{dsatStory}</span>
            </div>
          </div>
        );
      })()}
      {/* Lead-fallback KPI strip removed — duplicated the Team stats
          grid below (Team avg score / Team size / Team DSATs), which
          uses the ProgressRing + sparkline treatment and is more
          visual. One source of those numbers, not two. */}
    </div>

    {/* Daily H/P check-in tile — pinned to the top of the Dashboard so
        it's the first call-to-action QAs see. Self-hides on weekends
        without a plan, on approved-leave days, and before May 2026
        feature start, so leads/supervisors with no personal plan won't
        see anything. Rendered outside the loading gate so it appears
        immediately, independent of team-data fetches. */}
    <DailyCheckInWidget/>

    {/* If the bulk load failed, say so once at the top rather than letting
        a dozen widgets each render "nothing to show". The widgets below
        keep whatever they last had — a failed refresh is not new data. */}
    {!loading && loadError && <LoadErrorBanner error={loadError} onRetry={loadDashboard}/>}

    {loading?<SkeletonPage/>:<>

    {/* What needs the lead's attention — deep-links to detail pages */}
    <MyResponsibilities roster={roster} onNavigate={nav}/>

    {/* QA Lead alerts: side-task approvals + overdue coachings + team
        occupancy. All three cards self-render only when the viewer is
        a lead+ and there's actually something to act on. */}
    <PendingSideTasksCard/>
    <CoachingCadenceCard/>
    <TeamOccupancyCard/>

    {/* User Task Management */}
    <DashboardTasks roster={roster} appProfiles={appProfiles} todayAttendance={todayAttendance} dailyScores={dailyScores}/>

    {/* AP/PIP Detection Alerts */}
    <APDetectionAlerts apDetections={apDetections} setApDetections={setApDetections} apDismissals={apDismissals} setApDismissals={setApDismissals} months={months}/>

    {/* QA Self-View: My Active Plan */}
    {!isLead&&(()=>{
      const myPlan=apPlans.find(p=>(p.qa_email?.toLowerCase()===myEmail)&&(p.status==="active"||p.status==="pending_review"));
      if(!myPlan)return null;
      const myPlanWeeks=apWeeks.filter(w=>w.plan_id===myPlan.id).sort((a,b)=>a.week_number-b.week_number);
      const hasCoachingSession=myPlanWeeks.some(w=>w.coaching_session_id)||myPlanWeeks.some(w=>w.actual_data);
      if(!hasCoachingSession)return null;
      const filledWeeks=myPlanWeeks.filter(w=>w.actual_data);
      const metWeeks=myPlanWeeks.filter(w=>w.met_targets===true);
      const totalW=myPlan.duration_weeks||myPlanWeeks.length;
      const elapsed=filledWeeks.length;
      const successRate=filledWeeks.length?(metWeeks.length/filledWeeks.length*100):0;
      const daysLeft=myPlan.end_date?Math.max(0,Math.ceil((new Date(myPlan.end_date)-Date.now())/(1000*60*60*24))):null;
      const targets=(() => { try { const p=JSON.parse(myPlan.targets||"[]"); return Array.isArray(p)?p:p.metrics||[]; } catch { return []; } })();
      const progressPct=totalW?(elapsed/totalW)*100:0;
      return <div className="card" style={{marginBottom:20,borderLeft:`4px solid ${myPlan.type==="pip"?"var(--red)":"var(--amber)"}`}}>
        <div className="card-header"><span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{padding:"2px 10px",borderRadius:10,fontSize:11,fontWeight:700,background:myPlan.type==="pip"?"var(--red-bg)":"var(--amber-bg)",color:myPlan.type==="pip"?"var(--red)":"var(--amber)"}}>{myPlan.type.toUpperCase()}</span>
          My {myPlan.type==="pip"?"Performance Improvement Plan":"Action Plan"}
        </span>
        {daysLeft!==null&&<span style={{fontSize:13,fontWeight:600,color:daysLeft<=7?"var(--red)":"var(--tx2)"}}>{daysLeft} days remaining</span>}
        </div>
        <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
          <div className="mo-bar" style={{transform:`scaleX(${progressPct/100})`,height:"100%",background:successRate>=60?"var(--green)":"var(--amber)"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--tx3)",marginBottom:14}}>
          <span>Week {elapsed} of {totalW}</span>
          <span>{metWeeks.length}/{elapsed} weeks met targets ({successRate.toFixed(0)}%)</span>
        </div>
        {myPlanWeeks.length>0&&<div className="table-wrap"><table style={{fontSize:12}}><thead><tr><th>Week</th>{targets.map(t=><th key={t.kpi_key} style={{textAlign:"center"}}>{t.label}</th>)}<th style={{textAlign:"center"}}>Met?</th></tr></thead><tbody>
          {myPlanWeeks.map(week=>{
            const td=(()=>{try{return JSON.parse(week.target_data||"{}");}catch{return{};}})();
            const ad=(()=>{try{return JSON.parse(week.actual_data||"{}");}catch{return{};}})();
            const hasA=week.actual_data&&Object.keys(ad).length>0;
            return <tr key={week.id} style={{background:hasA?(week.met_targets?"var(--green-bg)":"var(--red-bg)"):"transparent"}}>
              <td style={{fontWeight:600}}>W{week.week_number}</td>
              {targets.map(t=>{const target=td[t.kpi_key];const actual=ad?.[t.kpi_key];const met=actual!==null&&actual!==undefined&&target!==undefined&&actual>=target;return <td key={t.kpi_key} style={{textAlign:"center"}}>
                <div style={{fontSize:11,color:"var(--tx3)"}}>T: {target!==undefined?target+"%":"—"}</div>
                {hasA&&<div style={{fontSize:12,fontWeight:600,color:met?"var(--green)":"var(--red)"}}>A: {actual!==null&&actual!==undefined?actual.toFixed(1)+"%":"—"}</div>}
              </td>;})}
              <td style={{textAlign:"center"}}>{hasA?(week.met_targets?<span style={{color:"var(--green)",fontWeight:700}}>✅</span>:<span style={{color:"var(--red)",fontWeight:700}}>❌</span>):<span style={{color:"var(--tx3)"}}>—</span>}</td>
            </tr>;
          })}
        </tbody></table></div>}
        <div style={{marginTop:10,fontSize:11,color:"var(--tx3)"}}>Started {myPlan.start_date?new Date(myPlan.start_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"}):"—"} · Ends {myPlan.end_date?new Date(myPlan.end_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"}):"—"}</div>
      </div>;
    })()}

    {/* Lead+ team overview */}
    {isLead&&<>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">My team<HelpTip text="Active QAs whose manager_email matches your email — pulled live from the roster."/></div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{allTeamEmails.length}</div>
            <div style={{width:40,height:40,borderRadius:12,background:"var(--primary-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👥</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Team avg score<HelpTip text={`Average MTD score across your active team for ${latestMonth||"the latest month"}. Out of ${maxScore} pts. Green ≥ 80%, amber 50–80%, red < 50%.`}/></div>
          <ProgressRing value={teamAvgScore} max={maxScore} size={56} stroke={5}
            color={scoreColor(teamAvgScore)}
            label={teamAvgScore.toFixed(1)}
            sublabel={`of ${maxScore} pts`}
          />
          {teamTrend&&<div style={{fontSize:12,marginTop:8,color:Number(teamTrend)>=0?"var(--green)":"var(--red)",fontWeight:600}}>{Number(teamTrend)>=0?"↑":"↓"} {Math.abs(teamTrend)} pts vs {prevMonth}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Team DSAT<HelpTip text="Sum of dissatisfied (DSAT) survey responses across the team this month. Lower is better. Bars show the last 4 months for trend."/></div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{teamDsat}</div>
            <MiniBarChart data={months.slice(0,4).reverse().map(m=>{
              const mData=mtd.filter(r=>r.month===m&&allTeamEmails.includes(r.qa_email?.toLowerCase()));
              return {label:m.slice(0,3),value:mData.reduce((a,r)=>a+(r.dsat||0),0)};
            })} height={36} color="var(--red)" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending DAM flags<HelpTip text="DAM (Direct Action Monitoring) flags raised by you or peers that are still awaiting a lead's review. Click Review to triage them in the Quality page."/></div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value" style={{color:damCount>0?"var(--amber)":"var(--tx)"}}>{damCount}</div>
            {damCount>0&&<button className="btn btn-outline btn-sm" onClick={()=>nav("quality")} style={{fontSize:11}}>Review →</button>}
          </div>
        </div>
      </div>

      {/* TeamHealth removed — its KPI grid duplicated the per-QA Team
          members table further down. The team stats grid above and the
          team members table together cover the same ground better. */}

      {/* Team Attendance Health — MTD show-up rate vs scheduled days */}
      {allTeamEmails.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <AttendanceHealthCard attendance={monthAttendance} emails={allTeamEmails} monthYM={riyadhTodayStr().slice(0,7)} mode="team" />
        </div>
      )}

      {/* Removed:
          - Team Champions (admin-only) → lives on the Expertise page,
            so dashboard stays focused on what every lead/admin needs.
          - Today's live activity strip → numbers (SBS / Non-SBS /
            Coaching / Side Tasks / Occupancy) all surface in the team
            table below + the stat cards above; the strip was a third
            spot for the same data.
          - Today's availability card → AttendanceHealthCard renders
            the same Present / Absent / Off counts in a richer panel
            higher up the page. */}

      {/* Score Trend Chart */}
      {months.length>=2&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">Performance trend</span><span style={{fontSize:12,color:"var(--tx3)"}}>{months.length} months</span></div>
        <div style={{padding:"8px 16px 8px"}}>
          <PerformanceTrendChart mtd={mtd} months={months} teamEmails={allTeamEmails} monthsShown={6}/>
        </div>
      </div>}

      {/* Team members table */}
      {teamSorted.length>0&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My team — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{teamSorted.length} specialists</span></div>
        <div className="table-wrap"><table><thead><tr>
          <th>#</th>
          <th>Specialist</th>
          <th style={{textAlign:"right"}}>Score<HelpTip text={helpFor("score")}/></th>
          <th style={{textAlign:"right"}}>Occupancy<HelpTip text={helpFor("occupancy")}/></th>
          <th style={{textAlign:"right"}}>Avg T/D<HelpTip text={helpFor("ticket_per_day")}/></th>
          <th style={{textAlign:"right"}}>Coaching %<HelpTip text={helpFor("coaching_pct")}/></th>
          <th style={{textAlign:"right"}}>SBS<HelpTip text={helpFor("sbs")}/></th>
          <th style={{textAlign:"right"}}>RTR<HelpTip text={helpFor("rtr")}/></th>
          <th style={{textAlign:"right"}}>CO %<HelpTip text={helpFor("observation")}/></th>
          <th style={{textAlign:"right"}}>ST/Hr<HelpTip text={helpFor("side_tasks")}/></th>
          <th style={{textAlign:"right"}}>WD<HelpTip text={helpFor("working_days")}/></th>
        </tr></thead><tbody>
          {teamSorted.map((r,i)=>{
            const stHours = r.side_tasks_duration_mins ? (r.side_tasks_duration_mins / 60).toFixed(1) : "—";
            return (<tr key={r.id}>
            <td style={{fontWeight:500,color:i<3?"var(--amber)":"var(--tx3)"}}>{i+1}</td>
            <td style={{fontWeight:500}}>{nameFromEmail(r.qa_email)}</td>
            <td style={{textAlign:"right"}}><span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:scoreBg(getScore(r)),color:scoreColor(getScore(r))}}>{getScore(r).toFixed(1)} / {maxScore}</span></td>
            <td style={{textAlign:"right"}}>{fmt(r.occupancy_pct)}</td>
            <td style={{textAlign:"right",color:"var(--blue)",fontWeight:500}}>{r.ticket_per_day??0}</td>
            <td style={{textAlign:"right"}}>{fmt(r.coaching_completion_pct)}</td>
            <td style={{textAlign:"right"}}>{r.sbs??0}</td>
            <td style={{textAlign:"right"}}>{fmt(r.avg_rtr_score)}</td>
            <td style={{textAlign:"right"}}>{fmt(r.avg_observation_score_pct)}</td>
            <td style={{textAlign:"right"}}>{stHours}</td>
            <td style={{textAlign:"right"}}>{r.working_days??0}</td>
          </tr>);})}
        </tbody></table></div>
      </div>}
    </>}

    {/* My Tracker tasks — senior_qa+ only. Self-hides when there are
        no open tasks assigned to me. */}
    {hasRole(profile?.role, "senior_qa") && <MyTrackerWidget/>}

    {/* Personal Attendance Health (MTD) — for QAs and senior QAs viewing
        their own dashboard. Skipped for leads/supervisors who already see
        the team Health card above. */}
    {!isLead && !isSupervisor && myEmail && (
      <div style={{ marginBottom: 16 }}>
        <AttendanceHealthCard attendance={monthAttendance} emails={[myEmail]} monthYM={riyadhTodayStr().slice(0,7)} mode="personal" compact />
      </div>
    )}

    {/* QA Self-Service Dashboard for QA/Senior QA roles */}
    {!isLead&&!hasRole(profile?.role,"qa_supervisor")&&<QASelfServiceDashboard dailyScores={dailyScores} myData={myData} myEmail={myEmail} roster={roster} ranked={ranked} myRank={myRank} maxScore={maxScore} getScore={getScore} latestMonth={latestMonth}/>}

    {/* QA Daily Progress (for leads viewing their own data) */}
    {isLead&&myData&&<QADailyProgress dailyScores={dailyScores} myData={myData} myEmail={myEmail} roster={roster} months={months} mtd={mtd}/>}

    {/* Personal stats (leads/supervisors only — QAs see the self-service dashboard above)
        The personal stats grid that used to live here (My score / Rank /
        Tickets-per-day / DSAT / CSAT) was removed in the simplification
        pass — the same numbers (Score, Rank, DSATs, CSAT) are already
        in the KPI strip at the top of the page, and the My KPIs detail
        card below shows the per-slab breakdown. Tickets/day is visible
        in the team members table. No information lost. */}
    {myData&&(isLead||hasRole(profile?.role,"qa_supervisor"))?<>

      {/* My KPI detail with slab calculation */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My KPIs — {latestMonth}</span></div>
        {(()=>{
          const KPI_SLABS_DASH = {
            occupancy:{label:"Occupancy",weight:15,thresholds:[95,98,100],rawKey:"occupancy_pct"},
            coaching:{label:"Coaching on-time",weight:10,thresholds:[90,93,95],rawKey:"ontime_coaching_pct"},
            calibration:{label:"Phase Score",weight:10,thresholds:[85,90,95],rawKey:"avg_calibration_match_rate"},
            observation:{label:"Coaching observation",weight:10,thresholds:[82,85,88],rawKey:"avg_observation_score_pct"},
            rtr:{label:"RTR score",weight:10,thresholds:[80,85,90],rawKey:"avg_rtr_score"},
          };
          const parseRawLocal = (val) => {
            if (!val && val !== 0) return null;
            const s = String(val).trim().replace(",",".");
            if (s.includes("%")) return parseFloat(s.replace("%",""));
            const n = parseFloat(s);
            if (isNaN(n)) return null;
            if (n >= 0 && n <= 2) return n * 100;
            return n;
          };
          const calcSlabLocal = (rawPct, th) => {
            if (rawPct === null) return {slab:0,pct:0,label:"No data"};
            if (rawPct >= th[2]) return {slab:3,pct:100,label:"Slab 3"};
            if (rawPct >= th[1]) return {slab:2,pct:75,label:"Slab 2"};
            if (rawPct >= th[0]) return {slab:1,pct:50,label:"Slab 1"};
            return {slab:0,pct:0,label:"Slab 0"};
          };
          const kpis = Object.entries(KPI_SLABS_DASH).map(([key,def])=>{
            const rawPct = parseRawLocal(myData[def.rawKey]);
            const slab = calcSlabLocal(rawPct, def.thresholds);
            const score = (def.weight * slab.pct) / 100;
            return {key,label:def.label,weight:def.weight,rawPct,slab,score,thresholds:def.thresholds};
          });
          const total = kpis.reduce((s,k)=>s+k.score,0);
          const scColor = (v) => v >= 55*0.7 ? "var(--green)" : v >= 55*0.4 ? "var(--amber)" : "var(--red)";
          return <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 20px"}}>
              {kpis.map(k=>(
                <div key={k.key} style={{padding:"10px 12px",background:"var(--bg)",borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600}}>{k.label}</span>
                    <span style={{fontSize:13,fontWeight:700,color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}>{k.score.toFixed(1)} / {k.weight}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--tx2)",marginBottom:4}}>
                    <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</span>
                    <span style={{padding:"1px 6px",borderRadius:8,fontSize:10,fontWeight:600,background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=75?"var(--blue-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}>{k.slab.label} ({k.slab.pct}%)</span>
                  </div>
                  <div style={{height:5,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}/></div>
                </div>
              ))}
            </div>
            <div style={{marginTop:14,padding:"10px 14px",background:"var(--bg)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:600}}>Total (non-CSAT)</span>
              <span style={{fontSize:18,fontWeight:700,color:scColor(total)}}>{total.toFixed(1)} / 55</span>
            </div>
            <div style={{marginTop:12}}>
              <div className="table-wrap"><table><thead><tr><th>Other metrics</th><th style={{textAlign:"right"}}>Value</th></tr></thead><tbody>
                {[
                  {label:"Coaching completion",value:fmt(myData.coaching_completion_pct)},
                  {label:"Tickets/day",value:myData.ticket_per_day??0},
                  {label:"Working days",value:(myData.working_days||0)+(myData.ramadan_wds?" ("+myData.ramadan_wds+" Ramadan)":"")},
                  {label:"DSAT evaluated",value:myData.dsat??0},
                  {label:"JKQ",value:myData.jkq_result&&myData.jkq_result!=="N/A"?myData.jkq_result+(myData.jkq_score>0?" ("+myData.jkq_score+")":""):"—"},
                ].map(row=>(<tr key={row.label}><td style={{color:"var(--tx2)"}}>{row.label}</td><td style={{textAlign:"right",fontWeight:500}}>{row.value}</td></tr>))}
              </tbody></table></div>
            </div>
          </>;
        })()}
      </div>

      {/* Peer Comparison */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">Peer comparison — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>How you compare (anonymous)</span></div>
        {(()=>{
          const pctNum = (v)=>{const n=parseFloat(String(v||0).replace("%",""))||0;return n>0&&n<=2?n*100:n;};
          const metrics = [
            {key:"score",label:"Overall score",getValue:r=>getScore(r)},
            {key:"occupancy",label:"Occupancy",getValue:r=>pctNum(r.occupancy_pct)},
            {key:"coaching",label:"Coaching on-time",getValue:r=>pctNum(r.ontime_coaching_pct)},
            {key:"calibration",label:"Phase Score",getValue:r=>pctNum(r.avg_calibration_match_rate)},
            {key:"observation",label:"Coaching observation",getValue:r=>pctNum(r.avg_observation_score_pct)},
            {key:"rtr",label:"RTR score",getValue:r=>pctNum(r.avg_rtr_score)},
            {key:"tpd",label:"Tickets/day",getValue:r=>parseFloat(r.ticket_per_day||0)||0},
          ];
          return <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {metrics.map(m=>{
              const allVals=current.map(r=>m.getValue(r)).filter(v=>v>0).sort((a,b)=>a-b);
              const myVal=m.getValue(myData);
              if(allVals.length<15||myVal<=0) return null;
              const belowMe=allVals.filter(v=>v<myVal).length;
              const pct=Math.round((belowMe/allVals.length)*100);
              const pctLabel=pct>=90?"Outstanding":pct>=75?"Above average":pct>=50?"Average":pct>=25?"Below average":"Needs improvement";
              const pctColor=pct>=75?"var(--green)":pct>=50?"var(--blue)":pct>=25?"var(--amber)":"var(--red)";
              return <div key={m.key} style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:13,fontWeight:500}}>{m.label}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:"var(--tx3)"}}>Top {100-pct}%</span>
                    <span style={{fontSize:12,fontWeight:600,color:pctColor,padding:"2px 8px",borderRadius:10,background:pct>=75?"var(--green-bg)":pct>=50?"rgba(59,130,246,.1)":pct>=25?"var(--amber-bg)":"var(--red-bg)"}}>{pctLabel}</span>
                  </div>
                </div>
                <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden",position:"relative"}}>
                  <div className="mo-bar" style={{transform:`scaleX(${pct/100})`,height:"100%",background:pctColor}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,color:"var(--tx3)"}}>
                  <span>Your value: {m.key==="score"?myVal.toFixed(1):m.key==="tpd"?myVal.toFixed(1):myVal.toFixed(1)+"%"}</span>
                  <span>Better than {pct}% of peers</span>
                </div>
              </div>;
            }).filter(Boolean)}
          </div>;
        })()}
      </div>

      {/* Sparkline trend */}
      {myHistory.length>1&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">Score trend</span></div>
        <svg width="100%" height="100" viewBox={`0 0 ${myHistory.length*100} 100`} style={{overflow:"visible"}}><polyline fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={myHistory.map((d,i)=>{const y=90-(d.score/maxScore)*70;return`${i*100+50},${Math.max(10,Math.min(90,y))}`;}).join(" ")}/>{myHistory.map((d,i)=>{const y=90-(d.score/maxScore)*70;const cy=Math.max(10,Math.min(90,y));return(<g key={i}><circle cx={i*100+50} cy={cy} r="4" fill="var(--accent-text)"/><text x={i*100+50} y={cy-12} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--tx)" fontFamily="var(--font)">{d.score.toFixed(1)}</text><text x={i*100+50} y={cy+18} textAnchor="middle" fontSize="10" fill="var(--tx3)" fontFamily="var(--font)">{d.month}</text></g>);})}</svg>
      </div>}
    </>:
    /* No personal MTD data for leads/supervisors */
    (isLead||hasRole(profile?.role,"qa_supervisor"))?<div style={{padding:"16px 0",marginBottom:20,color:"var(--tx3)",fontSize:13}}>No performance data found for your email ({profile?.email}). Data syncs from Metabase hourly.</div>:null}

    {/* Global stats (for admins/supervisors) */}
    {hasRole(profile?.role,"qa_supervisor")&&(()=>{
      const svDomain=profile?.operational_domain||profile?.domain||"tabby.ai";
      const isAdminRole=hasRole(profile?.role,"admin");
      const svRoster=isAdminRole?roster:roster.filter(r=>r.email?.endsWith("@"+svDomain));
      // Filter MTD by roster local-part membership (not raw domain
      // suffix) so a supervisor in tabby.sa still sees their team
      // member whose mtd_scores row happens to be keyed under
      // @tabby.ai (cross-domain split). Previously these QAs vanished
      // from the supervisor's team average + DSAT count entirely.
      const svRosterLocals = new Set(svRoster.map(r => (r.email || "").toLowerCase().split("@")[0]).filter(Boolean));
      const svCurrent=isAdminRole?current:current.filter(r=>svRosterLocals.has((r.qa_email || "").toLowerCase().split("@")[0]));
      const svRanked=isAdminRole?ranked:[...svCurrent].sort((a,b)=>getScore(b)-getScore(a));
      const svAvg=svRanked.length?svRanked.reduce((a,r)=>a+getScore(r),0)/svRanked.length:0;
      const svTotalDsat=svCurrent.reduce((a,r)=>a+(r.dsat||0),0);
      return <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total QAs ({isAdminRole?"all":svDomain})</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{svRoster.length}</div>
            <div style={{width:40,height:40,borderRadius:12,background:"var(--primary-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👥</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Team leads</div>
          <div className="stat-value">{[...new Set(svRoster.map(r=>r.manager_email).filter(Boolean))].length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg score ({latestMonth})</div>
          <ProgressRing value={svAvg} max={maxScore} size={56} stroke={5}
            color={scoreColor(svAvg)}
            label={svAvg.toFixed(1)}
            sublabel={`of ${maxScore} pts`}
          />
        </div>
        <div className="stat-card">
          <div className="stat-label">Total DSAT ({latestMonth})</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{svTotalDsat}</div>
            <MiniBarChart data={months.slice(0,4).reverse().map(m=>{
              const md=mtd.filter(r=>r.month===m);
              const scoped=isAdminRole?md:md.filter(r=>r.qa_email?.endsWith("@"+svDomain));
              return {label:m.slice(0,3),value:scoped.reduce((a,r)=>a+(r.dsat||0),0)};
            })} height={36} color="var(--red)" />
          </div>
        </div>
      </div>;
    })()}

    </>}
    {confirmEl}
  </div>);
}
export default DashboardPage;
