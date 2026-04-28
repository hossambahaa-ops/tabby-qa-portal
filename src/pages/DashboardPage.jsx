import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { hasRole, ROLE_LABELS, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity, csatPctValue, csatColor } from "../lib/utils.js";
import { parseRawD, KPI_SLABS_D, calcSlabD, getScore, MAX_SCORE, scoreColor, scoreBg } from "../lib/dashboardScore.js";
import { useConfirm } from "../lib/hooks.jsx";
import { useDashboardData } from "../lib/useDashboardData.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { ProgressRing, MiniBarChart, SparkLine } from "../components/Charts.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";
import DashboardTasks from "../components/dashboard/DashboardTasks.jsx";
import MyResponsibilities from "../components/dashboard/MyResponsibilities.jsx";
import AnnouncementForm from "../components/dashboard/AnnouncementForm.jsx";
import APDetectionAlerts from "../components/dashboard/APDetectionAlerts.jsx";
import TeamHealth from "../components/dashboard/TeamHealth.jsx";
import QADailyProgress from "../components/dashboard/QADailyProgress.jsx";
import QASelfServiceDashboard from "../components/dashboard/QASelfServiceDashboard.jsx";

function DashboardPage(){
  const{profile,token,gf,globalToast}=useApp();
  // Bulk dashboard data load + AP-detection alerts live in useDashboardData.
  const {
    mtd, roster, appProfiles, damCount, profileCount,
    todayAttendance, apPlans, apWeeks, apDetections, apDismissals,
    dailyScores, loading, refresh: loadDashboard,
    setApDetections, setApDismissals,
  } = useDashboardData(token, profile);
  const[showAnnForm,setShowAnnForm]=useState(false);
  const isLead=hasRole(profile?.role,"qa_lead");
  const isAdmin=hasRole(profile?.role,"admin");
  const isSupervisor=hasRole(profile?.role,"qa_supervisor");
  const canAnnounce=hasRole(profile?.role,"senior_qa");
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  const nameFromEmailLocal=(email)=>{if(!email)return"—";const local=email.split("@")[0];return local.split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};
  const fmt=(val)=>{if(val===null||val===undefined||val==="")return"—";const s=String(val).trim();if(s.includes("%"))return s;const n=parseFloat(s.replace(",","."));if(isNaN(n))return s;if(n>=0&&n<=2)return(n*100).toFixed(1)+"%";if(n>2&&!Number.isInteger(n))return n.toFixed(1)+"%";return String(val);};

  const maxScore = MAX_SCORE;

  const months=sortMonthsDesc([...new Set(mtd.map(r=>r.month))]);
  const latestMonth=months[0]||"—";
  const prevMonth=months[1]||null;

  const current=mtd.filter(r=>r.month===latestMonth);
  const previous=prevMonth?mtd.filter(r=>r.month===prevMonth):[];

  const myEmail=profile?.email?.toLowerCase();
  const myData=current.find(r=>r.qa_email?.toLowerCase()===myEmail);
  const myPrevData=previous.find(r=>r.qa_email?.toLowerCase()===myEmail);

  const ranked=[...current].sort((a,b)=>getScore(b)-getScore(a));
  const myRank=ranked.findIndex(r=>r.qa_email?.toLowerCase()===myEmail)+1;

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

  const myHistory=months.slice(0,6).reverse().map(m=>{const row=mtd.find(r=>r.month===m&&r.qa_email?.toLowerCase()===myEmail);return{month:m,score:row?getScore(row):null};}).filter(d=>d.score!==null);

  const nav=(page)=>window.dispatchEvent(new CustomEvent("navigate",{detail:page}));

  const[syncing,setSyncing]=useState(false);

  return(<div className="page">
    {/* Admin/Supervisor action bar */}
    {(hasRole(profile?.role,"super_admin")||canAnnounce)&&<div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8}}>
      {canAnnounce&&<button className="btn btn-outline btn-sm" onClick={()=>setShowAnnForm(!showAnnForm)} style={{fontSize:12}}>
        <Icon d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" size={14}/>Send announcement
      </button>}
      {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" disabled={syncing} onClick={async()=>{
        setSyncing(true);
        try{
          const r=await fetch("https://script.google.com/macros/s/AKfycbwpQjACvkSQBkbJok5L00-jXNMJm9x8b5-cdd4c5imZXeXCD5eHu8_zCsRNgWIegzvZ/exec",{method:"POST",mode:"no-cors"});
          globalToast("success","Sync triggered — data will update in ~30 seconds");
          logActivity(token, profile?.email, "mtd_sync_triggered", "mtd_scores", null, "Manual sync from dashboard");
        }catch(e){
          globalToast("error","Sync request failed: "+e.message);
        }
        setSyncing(false);
      }} style={{fontSize:12}}>
        {syncing?<><div className="spinner" style={{width:14,height:14,borderWidth:2,marginRight:6}}/>Syncing...</>:<><Icon d={icons.upload} size={14}/>Sync MTD data</>}
      </button>}
    </div>}

    {/* Announcement form */}
    {showAnnForm&&<AnnouncementForm roster={roster} onClose={()=>setShowAnnForm(false)}/>}

    <div className="welcome-banner">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:48,height:48,borderRadius:"50%",overflow:"hidden",flexShrink:0,border:"2px solid rgba(255,255,255,.2)"}}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{width:48,height:48,objectFit:"cover"}}/> :
            <div style={{width:48,height:48,background:"linear-gradient(135deg, var(--tabby-purple), var(--tabby-purple-light))",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700}}>{(profile?.display_name||"U").split(" ").map(p=>p[0]).join("").slice(0,2).toUpperCase()}</div>}
          </div>
          <div>
            <h2>Welcome back, {profile?.display_name?.split(" ")[0]||"there"}</h2>
            <p>{isLead?"Here's your team overview for "+latestMonth+".":"Here's your performance overview for "+latestMonth+"."}</p>
            <div className="welcome-role">{ROLE_LABELS[profile?.role]||"QA"} &middot; {profile?.domain}{myRoster?" · "+myRoster.queue:""}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",position:"relative",zIndex:1}}>
          <button onClick={()=>nav("leaderboard")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor="rgba(59,255,157,.3)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
          >Leaderboard →</button>
          <button onClick={()=>nav("profile")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(59,255,157,.25)",background:"rgba(59,255,157,.08)",color:"#3BFF9D",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(59,255,157,.16)";e.currentTarget.style.borderColor="rgba(59,255,157,.4)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(59,255,157,.08)";e.currentTarget.style.borderColor="rgba(59,255,157,.25)";}}
          >{isLead?"Team Profiles →":"My Profile →"}</button>
          {isLead&&<button onClick={()=>nav("scores")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor="rgba(59,255,157,.3)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
          >MTD →</button>}
          {isLead&&<button onClick={()=>{nav("quality");setTimeout(()=>window.dispatchEvent(new CustomEvent("qc-tab",{detail:"coaching"})),100);}} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor="rgba(59,255,157,.3)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
          >Log Coaching →</button>}
        </div>
      </div>
    </div>
    {loading?<SkeletonPage/>:<>

    {/* What needs the lead's attention — deep-links to detail pages */}
    <MyResponsibilities roster={roster} onNavigate={nav}/>

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
          <div style={{width:`${progressPct}%`,height:"100%",borderRadius:3,background:successRate>=60?"var(--green)":"var(--amber)",transition:"width .4s"}}/>
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
          <div className="stat-label">My team</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{allTeamEmails.length}</div>
            <div style={{width:40,height:40,borderRadius:12,background:"var(--primary-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👥</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Team avg score</div>
          <ProgressRing value={teamAvgScore} max={maxScore} size={56} stroke={5}
            color={scoreColor(teamAvgScore)}
            label={teamAvgScore.toFixed(1)}
            sublabel={`of ${maxScore} pts`}
          />
          {teamTrend&&<div style={{fontSize:12,marginTop:8,color:Number(teamTrend)>=0?"var(--green)":"var(--red)",fontWeight:600}}>{Number(teamTrend)>=0?"↑":"↓"} {Math.abs(teamTrend)} pts vs {prevMonth}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Team DSAT</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{teamDsat}</div>
            <MiniBarChart data={months.slice(0,4).reverse().map(m=>{
              const mData=mtd.filter(r=>r.month===m&&allTeamEmails.includes(r.qa_email?.toLowerCase()));
              return {label:m.slice(0,3),value:mData.reduce((a,r)=>a+(r.dsat||0),0)};
            })} height={36} color="var(--red)" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending DAM flags</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value" style={{color:damCount>0?"var(--amber)":"var(--tx)"}}>{damCount}</div>
            {damCount>0&&<button className="btn btn-outline btn-sm" onClick={()=>nav("quality")} style={{fontSize:11}}>Review →</button>}
          </div>
        </div>
      </div>

      {/* Team Health — KPI vs targets */}
      <TeamHealth teamData={teamCurrent} allTeamEmails={allTeamEmails} qaQueue={roster.find(r=>r.email?.toLowerCase()===myEmail)?.queue||""} qaDomain={myEmail?.endsWith("@tabby.sa")?"tabby.sa":"tabby.ai"} />

      {/* Today's live activity */}
      {dailyScores.length>0&&<div className="card" style={{marginBottom:16}}>
        <div className="card-header"><span className="card-title">Today's activity</span><span style={{fontSize:11,color:"var(--tx3)"}}>{dailyScores.length} active · {new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,padding:"12px 16px"}}>
          {(()=>{
            const teamDs=dailyScores.filter(d=>allTeamEmails.includes(d.qa_email?.toLowerCase()));
            const totSbs=teamDs.reduce((a,d)=>a+(d.sbs||0),0);
            const totNon=teamDs.reduce((a,d)=>a+(d.non_sbs||0),0);
            const totCoach=teamDs.reduce((a,d)=>a+(d.coaching_sessions||0),0);
            const totST=teamDs.reduce((a,d)=>a+(parseFloat(d.side_task_minutes)||0),0);
            const avgOcc=teamDs.length?teamDs.reduce((a,d)=>a+(parseFloat(d.occupancy_pct)||0),0)/teamDs.length:0;
            const occPct=avgOcc>2?avgOcc:avgOcc*100;
            return [
              {label:"SBS",value:totSbs,color:"var(--green)",icon:"📋"},
              {label:"Non-SBS",value:totNon,color:"var(--blue)",icon:"📝"},
              {label:"Coaching",value:totCoach,color:"var(--amber)",icon:"🎯"},
              {label:"Side Tasks",value:totST>0?`${Math.floor(totST/60)}h ${Math.round(totST%60)}m`:"0",color:"var(--tx2)",icon:"⏱"},
              {label:"Avg Occ",value:occPct>0?occPct.toFixed(1)+"%":"—",color:"var(--tx2)",icon:"📊"},
            ].map((s,i)=><div key={i} style={{textAlign:"center"}}>
              <div style={{fontSize:18,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:"var(--tx3)",fontWeight:500}}>{s.label}</div>
            </div>);
          })()}
        </div>
      </div>}

      {/* Team availability today */}
      {(()=>{
        const presentStatuses=new Set(["P","H","L","EL","PH"]);
        const absentStatuses=new Set(["AL","Paid SL","ML","UL","NSNC"]);
        const teamAtt=todayAttendance.filter(a=>allTeamEmails.includes(a.email?.toLowerCase()));
        const present=teamAtt.filter(a=>presentStatuses.has(a.status)).length;
        const absent=teamAtt.filter(a=>absentStatuses.has(a.status)).length;
        const off=teamAtt.filter(a=>a.status==="OFF").length;
        const noData=allTeamEmails.length-teamAtt.length;
        if(allTeamEmails.length===0)return null;
        return <div className="card" style={{padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>Today's availability</div>
            <span style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:"var(--green-bg)",color:"var(--green)",fontWeight:700}}>{present} Present</span>
            {absent>0&&<span style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:"var(--red-bg)",color:"var(--red)",fontWeight:700}}>{absent} On leave</span>}
            {off>0&&<span style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:"var(--bg3)",color:"var(--tx3)",fontWeight:700}}>{off} Off</span>}
            {noData>0&&<span style={{fontSize:11,color:"var(--tx3)"}}>{noData} no schedule</span>}
          </div>
          <button className="btn btn-outline btn-sm" onClick={()=>nav("schedule")} style={{fontSize:11}}>Schedule →</button>
        </div>;
      })()}

      {/* Score Trend Chart */}
      {months.length>=2&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">Performance trend</span><span style={{fontSize:12,color:"var(--tx3)"}}>{months.length} months</span></div>
        <div style={{padding:"16px 16px 8px"}}>
          {(()=>{
            const trendMonths=months.slice(0,6).reverse();
            const teamData=trendMonths.map(mo=>{
              const monthRows=mtd.filter(r=>r.month===mo&&allTeamEmails.includes(r.qa_email?.toLowerCase()));
              const perfs=monthRows.map(r=>parseFloat(r.final_performance)||0).filter(v=>v>0);
              const avgPerf=perfs.length?perfs.reduce((a,b)=>a+b,0)/perfs.length:0;
              const totalDsat=monthRows.reduce((a,r)=>a+(r.dsat||0),0);
              const avgOcc=monthRows.map(r=>parseFloat(r.occupancy_pct)||0).filter(v=>v>0);
              return{month:mo,label:mo.split("-")[0].slice(0,3),avgPerf:avgPerf*100,dsat:totalDsat,avgOcc:avgOcc.length?avgOcc.reduce((a,b)=>a+b,0)/avgOcc.length:0,count:monthRows.length};
            });
            const maxPerf=Math.max(...teamData.map(d=>d.avgPerf),1);
            const maxDsat=Math.max(...teamData.map(d=>d.dsat),1);
            const chartH=120;const chartW=Math.max(400,trendMonths.length*80);
            const perfPoints=teamData.map((d,i)=>{const x=40+i*(chartW-60)/(trendMonths.length-1||1);const y=chartH-10-(d.avgPerf/maxPerf)*(chartH-30);return{x,y,...d};});
            const dsatPoints=teamData.map((d,i)=>{const x=40+i*(chartW-60)/(trendMonths.length-1||1);const y=chartH-10-(d.dsat/maxDsat)*(chartH-30);return{x,y,...d};});
            const perfLine=perfPoints.map((p,i)=>`${i===0?"M":"L"}${p.x} ${p.y}`).join(" ");
            const dsatLine=dsatPoints.map((p,i)=>`${i===0?"M":"L"}${p.x} ${p.y}`).join(" ");
            return <div style={{overflowX:"auto"}}>
              <svg width={chartW} height={chartH+30} viewBox={`0 0 ${chartW} ${chartH+30}`}>
                {[0,25,50,75,100].map(v=>{const y=chartH-10-(v/maxPerf)*(chartH-30);return <g key={v}><line x1="35" y1={y} x2={chartW-10} y2={y} stroke="var(--bd)" strokeWidth="0.5" strokeDasharray="4"/><text x="30" y={y+4} textAnchor="end" fill="var(--tx3)" fontSize="9">{v}%</text></g>})}
                <path d={perfLine} fill="none" stroke="#3BFF9D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                {perfPoints.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="4" fill="#3BFF9D" stroke="var(--bg3)" strokeWidth="2"/><text x={p.x} y={p.y-10} textAnchor="middle" fill="#3BFF9D" fontSize="10" fontWeight="700">{p.avgPerf.toFixed(1)}%</text></g>)}
                <path d={dsatLine} fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4"/>
                {dsatPoints.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="3" fill="var(--amber)" stroke="var(--bg3)" strokeWidth="1.5"/></g>)}
                {perfPoints.map((p,i)=><text key={i} x={p.x} y={chartH+18} textAnchor="middle" fill="var(--tx3)" fontSize="10" fontWeight="500">{p.label}</text>)}
              </svg>
              <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:4,fontSize:11}}>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:3,borderRadius:2,background:"#3BFF9D",display:"inline-block"}}/>Avg Performance</span>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:3,borderRadius:2,background:"var(--amber)",display:"inline-block",borderTop:"1px dashed var(--amber)"}}/>Total DSAT</span>
              </div>
            </div>;
          })()}
        </div>
      </div>}

      {/* Team members table */}
      {teamSorted.length>0&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My team — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{teamSorted.length} specialists</span></div>
        <div className="table-wrap"><table><thead><tr>
          <th>#</th>
          <th>Specialist</th>
          <th style={{textAlign:"right"}}>Score</th>
          <th style={{textAlign:"right"}}>Occupancy</th>
          <th style={{textAlign:"right"}}>Avg T/D</th>
          <th style={{textAlign:"right"}}>Coaching %</th>
          <th style={{textAlign:"right"}}>SBS</th>
          <th style={{textAlign:"right"}}>RTR</th>
          <th style={{textAlign:"right"}}>CO %</th>
          <th style={{textAlign:"right"}}>ST/Hr</th>
          <th style={{textAlign:"right"}}>WD</th>
        </tr></thead><tbody>
          {teamSorted.map((r,i)=>{
            const stHours = r.side_tasks_duration_mins ? (r.side_tasks_duration_mins / 60).toFixed(1) : "—";
            return (<tr key={r.id}>
            <td style={{fontWeight:500,color:i<3?"var(--amber)":"var(--tx3)"}}>{i+1}</td>
            <td style={{fontWeight:500}}>{nameFromEmailLocal(r.qa_email)}</td>
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

    {/* QA Self-Service Dashboard for QA/Senior QA roles */}
    {!isLead&&!hasRole(profile?.role,"qa_supervisor")&&<QASelfServiceDashboard dailyScores={dailyScores} myData={myData} myEmail={myEmail} roster={roster} ranked={ranked} myRank={myRank} maxScore={maxScore} getScore={getScore} latestMonth={latestMonth}/>}

    {/* QA Daily Progress (for leads viewing their own data) */}
    {isLead&&myData&&<QADailyProgress dailyScores={dailyScores} myData={myData} myEmail={myEmail} roster={roster} months={months} mtd={mtd}/>}

    {/* Personal stats (leads/supervisors only — QAs see the self-service dashboard above) */}
    {myData&&(isLead||hasRole(profile?.role,"qa_supervisor"))?<>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">My score</div>
          <ProgressRing value={myData?getScore(myData):0} max={maxScore} size={56} stroke={5}
            color={scoreColor(myData?getScore(myData):0)}
            label={myData?getScore(myData).toFixed(1):"0"}
            sublabel={`of ${maxScore} pts`}
          />
          {myPrevData&&<div style={{fontSize:12,marginTop:8,color:(getScore(myData)-getScore(myPrevData))>=0?"var(--green)":"var(--red)",fontWeight:600}}>{(getScore(myData)-getScore(myPrevData))>=0?"↑":"↓"} {Math.abs(getScore(myData)-getScore(myPrevData)).toFixed(1)} pts vs {prevMonth}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Rank</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{myRank>0?"#"+myRank:"—"}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {ranked.length}</span></div>
            {myHistory.length>=2&&<SparkLine data={myHistory.map(h=>h.score)} width={80} height={32} color={scoreColor(myData?getScore(myData):0)} />}
          </div>
          <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>Performance trend</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tickets / day</div>
          <div className="stat-value">{myData.ticket_per_day??0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">DSAT</div>
          <div className="stat-value">{myData.dsat??0}</div>
        </div>
        {(()=>{const v=csatPctValue(myData.csat_pct);const s=Number(myData.csat_total||0);const show=v!=null&&s>0;return (
        <div className="stat-card" onClick={()=>nav("csat")} style={{cursor:"pointer"}} title="View CSAT breakdown">
          <div className="stat-label">CSAT %</div>
          <div className="stat-value" style={{color:csatColor(v,s)}}>
            {show?v.toFixed(1)+"%":"—"}
          </div>
          <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>{s>0?`${myData.csat_total} surveys`:"No surveys"} · view breakdown →</div>
        </div>);})()}
      </div>

      {/* My KPI detail with slab calculation */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My KPIs — {latestMonth}</span></div>
        {(()=>{
          const KPI_SLABS_DASH = {
            occupancy:{label:"Occupancy",weight:15,thresholds:[95,98,100],rawKey:"occupancy_pct"},
            coaching:{label:"Coaching on-time",weight:10,thresholds:[90,93,95],rawKey:"ontime_coaching_pct"},
            calibration:{label:"Calibration",weight:10,thresholds:[85,90,95],rawKey:"avg_calibration_match_rate"},
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
            {key:"calibration",label:"Calibration",getValue:r=>pctNum(r.avg_calibration_match_rate)},
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
                  <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:pctColor,transition:"width .5s"}}/>
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
      const svCurrent=isAdminRole?current:current.filter(r=>r.qa_email?.endsWith("@"+svDomain));
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
