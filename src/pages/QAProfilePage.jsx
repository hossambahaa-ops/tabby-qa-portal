import React, { useState, useEffect, useRef } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail } from "../lib/utils.js";
import { PulseLoader } from "../components/Charts.jsx";
import { useApp } from "../lib/AppContext.jsx";

function QAProfilePage() {
  const{token,profile,gf}=useApp();
  const [roster, setRoster] = useState([]);
  const [mtd, setMtd] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [flags, setFlags] = useState([]);
  const [qaAttendance, setQaAttendance] = useState([]);
  const [dailyScores, setDailyScores] = useState([]);
  const [teamTargets, setTeamTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQA, setSelectedQA] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSession, setExpandedSession] = useState(null);
  const [expandedFlag, setExpandedFlag] = useState(null);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const [selMonth, setSelMonth] = useState(null);

  const isQA = profile?.role === "qa" || profile?.role === "senior_qa";
  const isLead = hasRole(profile?.role, "qa_lead");
  const myEmail = profile?.email?.toLowerCase() || "";

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
  };

  useEffect(() => {
    (async () => {
      try {
        const curMonth = new Date().toISOString().slice(0,7);
        const [r, m, s, ap, t, f, profs, att, ds, tgt] = await Promise.all([
          dataCache.fetch("qa_roster_full",()=>sb.query("qa_roster", {select:"email,display_name,manager_email,queue,country,hiring_date",token}).catch(()=>[])),
          dataCache.fetch("mtd_scores",()=>sb.query("mtd_scores", {select:"*",filters:"order=month.desc",token}).catch(()=>[])),
          sb.query("coaching_sessions", {select:"id,member_email,sender_email,cc_email,meeting_type,session_date,performance_rating,outcome,topics,strengths,weaknesses,goals,action_items,notes,agenda,follow_up,next_steps,email_subject,conclusion,ap_week_pass",filters:"order=session_date.desc",token}).catch(()=>[]),
          dataCache.fetch("action_plans_full",()=>sb.query("action_plans", {select:"id,qa_email,type,status,start_date,end_date,conclusion,created_by,team,reason,action_plan_weeks(id,week_number,week_start,target_data,actual_data,met_targets,notes)",token}).catch(()=>[])),
          sb.query("tasks", {select:"*",filters:"order=created_at.desc",token}).catch(()=>[]),
          sb.query("dam_flags", {select:"id,qa_email,severity,status,triggered_at,occurrence_number,reviewed_by,reviewed_at,notes,dam_rules(name,behavior_type,recommended_action)",filters:"order=triggered_at.desc",token}).catch(()=>[]),
          dataCache.fetch("profiles_email_role",()=>sb.query("profiles", {select:"email,role",token}).catch(()=>[])),
          sb.query("qa_attendance", {select:"email,date,status",filters:`date=gte.${curMonth}-01&order=date.asc`,token}).catch(()=>[]),
          sb.query("daily_scores", {select:"*",filters:`date=eq.${new Date().toISOString().split("T")[0]}`,token}).catch(()=>[]),
          dataCache.fetch("team_targets",()=>sb.query("team_targets", {select:"team_name,domain,metric,target_value",token}).catch(()=>[])),
        ]);
        setRoster(Array.isArray(r) ? r : []);
        setMtd(Array.isArray(m) ? m : []);
        setSessions(Array.isArray(s) ? s : []);
        setPlans(Array.isArray(ap) ? ap : []);
        setTasks(Array.isArray(t) ? t : []);
        setFlags(Array.isArray(f) ? f : []);
        setQaAttendance(Array.isArray(att) ? att : []);
        setDailyScores(Array.isArray(ds) ? ds : []);
        setTeamTargets(Array.isArray(tgt) ? tgt : []);
        // Store qa_lead emails and all profiles for filtering
        const allProfs = Array.isArray(profs)?profs:[];
        const leads = allProfs.filter(p=>p.role==="qa_lead").map(p=>p.email?.toLowerCase());
        window.__qaLeadEmails = new Set(leads);
        window.__allProfiles = allProfs;
        if (isQA) setSelectedQA(myEmail);
      } catch(e) { console.error("QA Profile load:", e); }
      setLoading(false);
    })();
  }, [token]);

  // Build QA lead set for filtering
  const qaLeadSet = window.__qaLeadEmails || new Set();

  // Build full list: roster + anyone in MTD not in roster — only QAs under the 9 leads
  const allQAs = (() => {
    const map = new Map();
    // Exclude anyone with a profile role above QA/senior_qa
    const nonQaEmails = new Set();
    (window.__qaLeadEmails || new Set()).forEach(em => { nonQaEmails.add(em); });
    // Also exclude admins, super_admins, supervisors by checking profiles
    const excludeRoles = new Set(["qa_lead","qa_supervisor","admin","super_admin"]);
    (window.__allProfiles || []).filter(p => excludeRoles.has(p.role)).forEach(p => {
      if (p.email) {
        nonQaEmails.add(p.email.toLowerCase());
        nonQaEmails.add(p.email.toLowerCase().split("@")[0]);
      }
    });
    roster.forEach(r => {
      const em = r.email?.toLowerCase();
      if (!em || nonQaEmails.has(em) || nonQaEmails.has(em.split("@")[0])) return;
      const mgr = r.manager_email?.toLowerCase();
      if (!mgr) return;
      if (qaLeadSet.has(mgr) || qaLeadSet.has(mgr.split("@")[0])) {
        map.set(em, r);
      }
    });
    mtd.forEach(m => {
      const em = m.qa_email?.toLowerCase();
      if (!em || map.has(em) || nonQaEmails.has(em) || nonQaEmails.has(em.split("@")[0])) return;
      const tl = m.qa_tl?.toLowerCase();
      if (tl && (qaLeadSet.has(tl) || qaLeadSet.has(tl.split("@")[0]))) {
        map.set(em, { email: em, manager_email: m.qa_tl, queue: null, country: null });
      }
    });
    return [...map.values()];
  })();

  // Scope: QAs see only themselves, leads see their team, supervisors+ see all
  const visibleQAs = (() => {
    if (isQA) return allQAs.filter(r => r.email?.toLowerCase() === myEmail);
    if (hasRole(profile?.role, "qa_lead") && !hasRole(profile?.role, "qa_supervisor")) {
      return allQAs.filter(r => r.manager_email?.toLowerCase() === myEmail);
    }
    return allQAs;
  })();

  const filteredQAs = searchQuery
    ? visibleQAs.filter(r => r.email?.toLowerCase().includes(searchQuery.toLowerCase()) || nameFromEmail(r.email).toLowerCase().includes(searchQuery.toLowerCase()))
    : visibleQAs;

  const qa = allQAs.find(r => r.email?.toLowerCase() === selectedQA?.toLowerCase());
  // Cross-domain match helper: "name@tabby.ai" should also match "name@tabby.sa"
  const matchQA = (email) => {
    if (!email || !selectedQA) return false;
    const em = email.toLowerCase();
    const sel = selectedQA.toLowerCase();
    if (em === sel) return true;
    const emLocal = em.split("@")[0];
    const selLocal = sel.split("@")[0];
    return emLocal === selLocal;
  };

  const qaMtd = (() => {
    const raw = mtd.filter(m => matchQA(m.qa_email));
    const months = sortMonthsDesc([...new Set(raw.map(m=>m.month))]);
    return months.map(mo => raw.find(m=>m.month===mo)).filter(Boolean);
  })();
  // Use the latest month that has data (first in chronologically sorted array)
  const latestMtd = qaMtd.length > 0 ? qaMtd[0] : null;
  const qaSessions = sessions.filter(s => matchQA(s.member_email)).slice(0, 10);
  const qaPlans = plans.filter(p => matchQA(p.qa_email));
  const qaTasks = tasks.filter(t => matchQA(t.assigned_to) || (matchQA(t.created_by) && !t.assigned_to));
  const qaFlags = flags.filter(f => matchQA(f.qa_email));

  const fmtPct = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    const s = String(val).trim();
    if (s.includes("%")) return s;
    const n = parseFloat(s.replace(",", "."));
    if (isNaN(n)) return s;
    if (n >= 0 && n <= 2) return (n * 100).toFixed(1) + "%";
    return n.toFixed(1) + "%";
  };

  if (loading) return <div className="page"><PulseLoader/></div>;

  // ═══ LIST VIEW (no QA selected, or QA role sees own profile directly) ═══
  if (!selectedQA && !isQA) return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">QA Profiles</div>
        <div className="page-subtitle">{visibleQAs.length} team members</div>
      </div>
      <div className="card" style={{padding:16}}>
        <div style={{position:"relative",marginBottom:16}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input className="form-input" placeholder="Search by name or email..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{paddingLeft:34,fontSize:13}}/>
        </div>
        <div style={{maxHeight:"calc(100vh - 260px)",overflowY:"auto"}}>
          <table><thead><tr><th>QA</th><th>Email</th><th>Team</th><th>Lead</th><th>Country</th></tr></thead>
          <tbody>{filteredQAs.sort((a,b)=>(a.email||"").localeCompare(b.email||"")).map(r => {
            const em = r.email?.toLowerCase();
            return <tr key={em} onClick={()=>setSelectedQA(em)} style={{cursor:"pointer"}}>
              <td style={{fontWeight:500}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:"var(--accent-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"var(--accent-text)",flexShrink:0}}>
                    {nameFromEmail(em).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  {nameFromEmail(em)}
                </div>
              </td>
              <td style={{fontSize:12,color:"var(--tx2)"}}>{em}</td>
              <td style={{fontSize:12}}>{r.queue || "—"}</td>
              <td style={{fontSize:12}}>{r.manager_email ? nameFromEmail(r.manager_email) : "—"}</td>
              <td style={{fontSize:12}}>{r.country || "—"}</td>
            </tr>;
          })}</tbody></table>
        </div>
      </div>
    </div>
  );

  // ═══ PROFILE VIEW (QA selected) ═══
  return (
    <div className="page">
      {/* Back button for non-QA roles */}
      {!isQA && <button className="btn btn-outline" onClick={()=>{setSelectedQA("");setSearchQuery("");}} style={{marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Back to list
      </button>}

      {/* Header card */}
      <div className="card" style={{marginBottom:16,padding:20}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:"var(--accent-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"var(--accent-text)"}}>
            {nameFromEmail(selectedQA).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style={{fontSize:20,fontWeight:700}}>{nameFromEmail(selectedQA)}</div>
            <div style={{fontSize:13,color:"var(--tx2)"}}>{selectedQA}</div>
            <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
              {qa?.queue && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--accent-light)",color:"var(--accent-text)",fontWeight:600}}>{qa.queue}</span>}
              {qa?.country && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--bg3)",color:"var(--tx3)",fontWeight:600}}>{qa.country}</span>}
              {qa?.manager_email && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--green-bg)",color:"var(--green)",fontWeight:600}}>Lead: {nameFromEmail(qa.manager_email)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        {/* Today's evaluations */}
        <div className="card" style={{padding:16,textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Today's evals</div>
          {(()=>{
            const d = dailyScores.find(x => matchQA(x.qa_email));
            const sbs = d?.sbs || 0;
            const nonSbs = d?.non_sbs || 0;
            const totalEvals = sbs + nonSbs;
            const coaching = d?.coaching_sessions || 0;
            const stMins = d?.side_task_minutes || 0;
            const occ = d?.occupancy_pct || 0;
            const occPct = occ > 2 ? occ : occ * 100;
            // Get daily target from team_targets (with inheritance: team+domain → team+all → Default+domain → Default+all)
            const qaQueue = qa?.queue || "";
            const qaEmail = selectedQA?.toLowerCase() || "";
            const qaDomain = qaEmail.endsWith("@tabby.sa") ? "tabby.sa" : "tabby.ai";
            const findTgt = (metric) => {
              const find = (team, dom) => teamTargets.find(t => t.team_name === team && t.domain === dom && t.metric === metric);
              return find(qaQueue, qaDomain) || find(qaQueue, "all") || find("Default", qaDomain) || find("Default", "all");
            };
            const sbsTarget = parseFloat(findTgt("daily_sbs")?.target_value) || 3;
            const nonSbsTarget = parseFloat(findTgt("daily_non_sbs")?.target_value) || 10;
            const target = sbsTarget + nonSbsTarget;
            const pct = target > 0 ? Math.min(100, Math.round((totalEvals / target) * 100)) : 0;
            const circumference = 2 * Math.PI * 28;
            const dashArray = `${(pct / 100) * circumference} ${circumference}`;
            const ringColor = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
            return <>
              <div style={{position:"relative",width:64,height:64,margin:"0 auto 8px"}}>
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="var(--bd2)" strokeWidth="5"/>
                  <circle cx="32" cy="32" r="28" fill="none" stroke={ringColor} strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={dashArray} transform="rotate(-90 32 32)"/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:totalEvals>0?ringColor:"var(--tx3)"}}>{totalEvals>0?totalEvals:"—"}</div>
              </div>
              <div style={{display:"flex",justifyContent:"center",gap:10,fontSize:10}}>
                <span style={{color:"var(--green)",fontWeight:600}}>{sbs} SBS</span>
                <span style={{color:"var(--blue)",fontWeight:600}}>{nonSbs} Non</span>
                {coaching>0&&<span style={{color:"var(--amber)",fontWeight:600}}>{coaching} C</span>}
              </div>
              {stMins>0&&<div style={{fontSize:10,color:"var(--tx3)",marginTop:2}}>ST: {Math.floor(stMins/60)}h {Math.round(stMins%60)}m</div>}
              {occPct>0&&<div style={{fontSize:10,color:"var(--tx3)",marginTop:1}}>Occ: {occPct.toFixed(1)}%</div>}
            </>;
          })()}
        </div>

        {/* Occupancy */}
        <div className="card" style={{padding:16,textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Occupancy</div>
          <div style={{fontSize:28,fontWeight:800,color:latestMtd?.occupancy_pct?"var(--tx)":"var(--tx3)"}}>{latestMtd ? fmtPct(latestMtd.occupancy_pct) : "—"}</div>
          <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>{latestMtd?.month || "No data"}</div>
        </div>

        {/* Final Performance */}
        <div className="card" style={{padding:16,textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Final score</div>
          <div style={{fontSize:28,fontWeight:800,color:latestMtd?((latestMtd.final_performance||0)>=0.4?"var(--green)":(latestMtd.final_performance||0)>=0.25?"var(--amber)":"var(--red)"):"var(--tx3)"}}>
            {latestMtd ? ((latestMtd.final_performance||0)*100).toFixed(1)+"%" : "—"}
          </div>
          <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>{latestMtd?.month || "No data"}</div>
        </div>

        {/* Tasks */}
        <div className="card" style={{padding:16,textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Tasks</div>
          <div style={{display:"flex",justifyContent:"center",gap:16}}>
            <div><div style={{fontSize:22,fontWeight:800,color:"var(--amber)"}}>{qaTasks.filter(t=>t.status==="pending"||t.status==="in_progress").length}</div><div style={{fontSize:10,color:"var(--tx3)"}}>Open</div></div>
            <div><div style={{fontSize:22,fontWeight:800,color:"var(--green)"}}>{qaTasks.filter(t=>t.status==="done").length}</div><div style={{fontSize:10,color:"var(--tx3)"}}>Done</div></div>
          </div>
        </div>
      </div>

      {/* Two-column layout: Performance + Coaching */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        {/* Performance metrics with month selector */}
        <div className="card">
          <div className="card-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span className="card-title">Performance</span>
            {qaMtd.length > 0 && <select className="select form-input" style={{width:"auto",fontSize:12,padding:"4px 8px"}} value={selMonth||latestMtd?.month||""} onChange={e=>setSelMonth(e.target.value)}>
              {qaMtd.map(m=><option key={m.month} value={m.month}>{m.month}</option>)}
            </select>}
          </div>
          {(()=>{const m = selMonth ? qaMtd.find(x=>x.month===selMonth) : latestMtd; if(!m) return <div style={{padding:24,textAlign:"center",color:"var(--tx3)",fontSize:13}}>No MTD data available</div>; return <div style={{padding:"0 16px 16px"}}>
            {[
              ["SBS", m.sbs],["Non-SBS", m.non_sbs],["DSAT", m.dsat],
              ["RTR Score", fmtPct(m.avg_rtr_score)],["Calibration", fmtPct(m.avg_calibration_match_rate)],
              ["CO Score", fmtPct(m.avg_observation_score_pct)],["Coaching on-time", fmtPct(m.ontime_coaching_pct)],
              ["Tickets/day", m.ticket_per_day ? Number(m.ticket_per_day).toFixed(1) : "—"],
              ["Occupancy", fmtPct(m.occupancy_pct)],["JKQ", m.jkq_score || "—"],
            ].map(([label, val], i) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<9?"1px solid var(--bd)":"none"}}>
                <span style={{fontSize:13,color:"var(--tx2)"}}>{label}</span>
                <span style={{fontSize:13,fontWeight:600,color:"var(--tx)"}}>{val ?? "—"}</span>
              </div>
            ))}
          </div>;})()}
        </div>

        {/* Individual Performance Trend */}
        {qaMtd.length >= 2 && <div className="card" style={{marginBottom:16}}>
          <div className="card-header"><span className="card-title">Performance trend</span></div>
          <div style={{padding:"12px 16px 8px"}}>
            {(()=>{
              const trendData = [...qaMtd].reverse().slice(-6);
              if(trendData.length < 2) return null;
              const chartH = 100; const chartW = Math.max(300, trendData.length * 70);
              const maxPerf = Math.max(...trendData.map(d=>(parseFloat(d.final_performance)||0)*100), 1);
              const points = trendData.map((d, i) => {
                const x = 35 + i * (chartW - 50) / (trendData.length - 1 || 1);
                const perf = (parseFloat(d.final_performance) || 0) * 100;
                const y = chartH - 8 - (perf / Math.max(maxPerf, 50)) * (chartH - 25);
                return { x, y, perf, month: d.month?.split("-")[0]?.slice(0,3) || "", dsat: d.dsat || 0, occ: parseFloat(d.occupancy_pct) || 0 };
              });
              const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
              const areaPath = line + ` L${points[points.length-1].x} ${chartH-8} L${points[0].x} ${chartH-8} Z`;
              return <div style={{overflowX:"auto"}}>
                <svg width={chartW} height={chartH + 25} viewBox={`0 0 ${chartW} ${chartH + 25}`}>
                  {[0, 25, 50].map(v => { const y = chartH - 8 - (v / Math.max(maxPerf, 50)) * (chartH - 25); return <g key={v}><line x1="30" y1={y} x2={chartW - 5} y2={y} stroke="var(--bd)" strokeWidth="0.5" strokeDasharray="3" /><text x="25" y={y + 3} textAnchor="end" fill="var(--tx3)" fontSize="8">{v}%</text></g>; })}
                  <path d={areaPath} fill="url(#perfGradArea)" opacity="0.15" />
                  <path d={line} fill="none" stroke="#3BFF9D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {points.map((p, i) => <g key={i}>
                    <circle cx={p.x} cy={p.y} r="4" fill="#3BFF9D" stroke="var(--bg3)" strokeWidth="2" />
                    <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#3BFF9D" fontSize="10" fontWeight="700">{p.perf.toFixed(1)}%</text>
                    <text x={p.x} y={chartH + 15} textAnchor="middle" fill="var(--tx3)" fontSize="9">{p.month}</text>
                  </g>)}
                  <defs><linearGradient id="perfGradArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3BFF9D" /><stop offset="100%" stopColor="transparent" /></linearGradient></defs>
                </svg>
                <div style={{display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap",marginTop:4}}>
                  {trendData.map((d, i) => <div key={i} style={{textAlign:"center",fontSize:10,color:"var(--tx3)"}}>
                    <div style={{fontWeight:600,color:"var(--tx2)"}}>{d.month?.split("-")[0]?.slice(0,3)}</div>
                    <div>Occ: {d.occupancy_pct ? (parseFloat(d.occupancy_pct) > 2 ? parseFloat(d.occupancy_pct).toFixed(1) : (parseFloat(d.occupancy_pct)*100).toFixed(1)) : "—"}%</div>
                    <div style={{color:"var(--tx3)"}}>DSAT: {d.dsat||0}</div>
                  </div>)}
                </div>
              </div>;
            })()}
          </div>
        </div>}

        {/* Coaching history — expandable */}
        <div className="card">
          <div className="card-header"><span className="card-title">Coaching sessions ({qaSessions.length})</span></div>
          {qaSessions.length > 0 ? <div style={{padding:"0 16px 16px",maxHeight:expandedSession?500:300,overflowY:"auto"}}>
            {qaSessions.map(s => {
              const isExpanded = expandedSession === s.id;
              return <div key={s.id}>
                <div onClick={()=>setExpandedSession(isExpanded?null:s.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--bd)",cursor:"pointer"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--tx)"}}>{new Date(s.session_date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
                    <div style={{fontSize:11,color:"var(--tx3)"}}>{s.meeting_type?.replace(/_/g," ")} — by {nameFromEmail(s.sender_email)}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    {s.performance_rating && <span style={{fontSize:10,padding:"2px 6px",borderRadius:6,fontWeight:600,
                      background:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green-bg)":"var(--amber-bg)",
                      color:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green)":"var(--amber)"
                    }}>{s.performance_rating}</span>}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" style={{transform:isExpanded?"rotate(180deg)":"rotate(0)",transition:"transform .2s"}}><path d="M6 9l6 6 6-6"/></svg>
                  </div>
                </div>
                {isExpanded && <div style={{padding:"12px 0",borderBottom:"1px solid var(--bd)",background:"var(--bg)",borderRadius:8,padding:12,margin:"8px 0"}}>
                  {s.email_subject && <div style={{fontSize:12,fontWeight:600,color:"var(--tx)",marginBottom:8}}>Subject: {s.email_subject}</div>}
                  {[["Topics",s.topics],["Strengths",s.strengths],["Areas for improvement",s.weaknesses],["Goals",s.goals],["Action items",s.action_items],["Notes",s.notes||s.agenda],["Next steps",s.next_steps]].map(([label,val])=>
                    val ? <div key={label} style={{marginBottom:8}}>
                      <div style={{fontSize:10,fontWeight:600,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>{label}</div>
                      <div style={{fontSize:12,color:"var(--tx2)",whiteSpace:"pre-wrap",lineHeight:1.5}}>{val}</div>
                    </div> : null
                  )}
                  {s.outcome && <div style={{marginTop:4}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:6,fontWeight:600,background:s.outcome==="pass"?"var(--green-bg)":"var(--red-bg)",color:s.outcome==="pass"?"var(--green)":"var(--red)"}}>Outcome: {s.outcome}</span></div>}
                  {s.conclusion && <div style={{marginTop:4}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:6,fontWeight:600,background:"var(--blue-bg)",color:"var(--blue)"}}>Conclusion: {s.conclusion}</span></div>}
                </div>}
              </div>;
            })}
          </div> : <div style={{padding:24,textAlign:"center",color:"var(--tx3)",fontSize:13}}>No coaching sessions yet</div>}
        </div>
      </div>

      {/* Bottom row: Tasks + AP/PIP + DAM — all expandable */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
        {/* Tasks — expandable */}
        <div className="card">
          <div className="card-header"><span className="card-title">Tasks ({qaTasks.length})</span></div>
          {qaTasks.length > 0 ? <div style={{padding:"0 16px 16px",maxHeight:280,overflowY:"auto"}}>
            {qaTasks.slice(0, 15).map(t => {
              const isExp = expandedTask === t.id;
              return <div key={t.id}>
                <div onClick={()=>setExpandedTask(isExp?null:t.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--bd)",cursor:"pointer"}}>
                  <div style={{fontSize:12,color:t.status==="done"?"var(--tx3)":"var(--tx)",textDecoration:t.status==="done"?"line-through":"none",fontWeight:500}}>{t.title}</div>
                  <span style={{fontSize:9,padding:"2px 6px",borderRadius:6,fontWeight:600,flexShrink:0,
                    background:t.status==="done"?"var(--green-bg)":t.status==="pending"?"var(--amber-bg)":"var(--blue-bg)",
                    color:t.status==="done"?"var(--green)":t.status==="pending"?"var(--amber)":"var(--blue)"
                  }}>{t.status}</span>
                </div>
                {isExp && <div style={{padding:10,margin:"4px 0 8px",background:"var(--bg)",borderRadius:8,fontSize:12}}>
                  {t.description && <div style={{color:"var(--tx2)",marginBottom:6,whiteSpace:"pre-wrap"}}>{t.description}</div>}
                  <div style={{display:"flex",gap:12,flexWrap:"wrap",color:"var(--tx3)",fontSize:11}}>
                    {t.priority && <span>Priority: <strong style={{color:t.priority==="high"?"var(--red)":t.priority==="medium"?"var(--amber)":"var(--tx3)"}}>{t.priority}</strong></span>}
                    {t.due_date && <span>Due: {new Date(t.due_date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>}
                    {t.created_by && <span>By: {nameFromEmail(t.created_by)}</span>}
                    {t.assigned_to && <span>Assigned: {nameFromEmail(t.assigned_to)}</span>}
                  </div>
                  {t.template_id && <div style={{fontSize:10,color:"var(--accent-text)",marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16v16H4z"/><path d="M4 9h16"/><path d="M9 4v16"/></svg>
                    Auto-generated from template
                  </div>}
                  {t.target_metric && t.target_value && (()=>{
                    const assignee = (t.assigned_to||t.created_by||"").toLowerCase();
                    const local = assignee.split("@")[0];
                    const ds = dailyScores.find(d => {
                      const em = d.qa_email?.toLowerCase();
                      return em === assignee || em?.split("@")[0] === local;
                    });
                    const actual = ds ? (parseFloat(ds[t.target_metric]) || 0) : 0;
                    const target = parseFloat(t.target_value) || 0;
                    const pct = target > 0 ? Math.min(100, Math.round((actual/target)*100)) : 0;
                    const done = actual >= target;
                    return <div style={{marginTop:6,padding:"6px 10px",background:done?"var(--green-bg)":"var(--amber-bg)",borderRadius:6,fontSize:11}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:done?"var(--green)":"var(--amber)",fontWeight:600}}>{actual}/{target} {t.target_metric.replace(/_/g," ")}</span>
                        <span style={{color:done?"var(--green)":"var(--tx3)",fontWeight:600}}>{pct}%</span>
                      </div>
                      <div style={{marginTop:4,height:4,borderRadius:2,background:"var(--bd2)",overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,borderRadius:2,background:done?"var(--green)":"var(--amber)",transition:"width .3s"}}/>
                      </div>
                      {t.auto_close && <div style={{fontSize:10,color:"var(--tx3)",marginTop:2}}>{done?"✓ Auto-completed":"Auto-closes when target is met"}</div>}
                    </div>;
                  })()}
                  {t.completed_at && <div style={{fontSize:11,color:"var(--green)",marginTop:4}}>Completed: {new Date(t.completed_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>}
                </div>}
              </div>;
            })}
          </div> : <div style={{padding:24,textAlign:"center",color:"var(--tx3)",fontSize:13}}>No tasks</div>}
        </div>

        {/* AP/PIP — expandable with weekly targets */}
        <div className="card">
          <div className="card-header"><span className="card-title">Action Plans ({qaPlans.length})</span></div>
          {qaPlans.length > 0 ? <div style={{padding:"0 16px 16px",maxHeight:280,overflowY:"auto"}}>
            {qaPlans.map(p => {
              const isExp = expandedPlan === p.id;
              const weeks = (p.action_plan_weeks || []).sort((a,b)=>a.week_number-b.week_number);
              return <div key={p.id}>
                <div onClick={()=>setExpandedPlan(isExp?null:p.id)} style={{padding:"8px 0",borderBottom:"1px solid var(--bd)",cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:600,color:p.type==="pip"?"var(--red)":"var(--amber)"}}>{p.type.toUpperCase()}</span>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:10,padding:"2px 6px",borderRadius:6,fontWeight:600,
                        background:p.status==="active"?"var(--blue-bg)":p.status.includes("pass")?"var(--green-bg)":"var(--red-bg)",
                        color:p.status==="active"?"var(--blue)":p.status.includes("pass")?"var(--green)":"var(--red)"
                      }}>{p.status}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" style={{transform:isExp?"rotate(180deg)":"rotate(0)",transition:"transform .2s"}}><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"var(--tx3)",marginTop:2}}>{new Date(p.start_date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})} — {new Date(p.end_date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
                </div>
                {isExp && <div style={{padding:10,margin:"4px 0 8px",background:"var(--bg)",borderRadius:8,fontSize:12}}>
                  {p.created_by && <div style={{fontSize:11,color:"var(--tx3)",marginBottom:6}}>Created by: {nameFromEmail(p.created_by)}</div>}
                  {p.reason && <div style={{fontSize:11,color:"var(--tx3)",marginBottom:6}}>Reason: {p.reason}</div>}
                  {p.conclusion && <div style={{fontSize:11,color:p.conclusion.includes("pass")?"var(--green)":"var(--red)",marginBottom:8,fontWeight:600}}>Conclusion: {p.conclusion}</div>}
                  {weeks.length > 0 && <div>
                    <div style={{fontSize:10,fontWeight:600,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>Weekly progress</div>
                    {weeks.map(w => (
                      <div key={w.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid var(--bd2)",fontSize:11}}>
                        <span style={{color:"var(--tx2)"}}>Week {w.week_number}</span>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          {w.target_data && <span style={{color:"var(--tx3)"}}>T: {typeof w.target_data==="object"?JSON.stringify(w.target_data):w.target_data}</span>}
                          {w.actual_data && <span style={{color:"var(--tx2)"}}>A: {typeof w.actual_data==="object"?JSON.stringify(w.actual_data):w.actual_data}</span>}
                          {w.met_targets !== null && <span style={{fontSize:9,padding:"1px 5px",borderRadius:4,fontWeight:600,background:w.met_targets?"var(--green-bg)":"var(--red-bg)",color:w.met_targets?"var(--green)":"var(--red)"}}>{w.met_targets?"Pass":"Fail"}</span>}
                        </div>
                      </div>
                    ))}
                  </div>}
                  {weeks.length === 0 && <div style={{fontSize:11,color:"var(--tx3)"}}>No weekly data yet</div>}
                </div>}
              </div>;
            })}
          </div> : <div style={{padding:24,textAlign:"center",color:"var(--tx3)",fontSize:13}}>No plans</div>}
        </div>

        {/* DAM Flags — expandable */}
        <div className="card">
          <div className="card-header"><span className="card-title">DAM Flags ({qaFlags.length})</span></div>
          {qaFlags.length > 0 ? <div style={{padding:"0 16px 16px",maxHeight:280,overflowY:"auto"}}>
            {qaFlags.slice(0, 10).map(f => {
              const isExp = expandedFlag === f.id;
              return <div key={f.id}>
                <div onClick={()=>setExpandedFlag(isExp?null:f.id)} style={{padding:"8px 0",borderBottom:"1px solid var(--bd)",cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:500,color:"var(--tx)"}}>{f.dam_rules?.name || "—"}</span>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:9,padding:"2px 6px",borderRadius:6,fontWeight:600,
                        background:f.severity==="critical"?"var(--red-bg)":f.severity==="warning"?"var(--amber-bg)":"var(--blue-bg)",
                        color:f.severity==="critical"?"var(--red)":f.severity==="warning"?"var(--amber)":"var(--blue)"
                      }}>{f.severity}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" style={{transform:isExp?"rotate(180deg)":"rotate(0)",transition:"transform .2s"}}><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"var(--tx3)",marginTop:2}}>{f.status} — {new Date(f.triggered_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
                </div>
                {isExp && <div style={{padding:10,margin:"4px 0 8px",background:"var(--bg)",borderRadius:8,fontSize:12}}>
                  <div style={{display:"flex",gap:12,flexWrap:"wrap",color:"var(--tx3)",fontSize:11,marginBottom:6}}>
                    {f.occurrence_number && <span>Occurrence: <strong style={{color:"var(--tx)"}}>#{f.occurrence_number}</strong></span>}
                    {f.dam_rules?.behavior_type && <span>Type: {f.dam_rules.behavior_type.replace(/_/g," ")}</span>}
                    {f.dam_rules?.recommended_action && <span>Action: <strong style={{color:"var(--amber)"}}>{f.dam_rules.recommended_action.replace(/_/g," ")}</strong></span>}
                  </div>
                  {f.reviewed_by && <div style={{fontSize:11,color:"var(--tx3)"}}>Reviewed by: {nameFromEmail(f.reviewed_by)} {f.reviewed_at ? "on " + new Date(f.reviewed_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}) : ""}</div>}
                  {f.notes && <div style={{fontSize:11,color:"var(--tx2)",marginTop:4,whiteSpace:"pre-wrap"}}>{f.notes}</div>}
                </div>}
              </div>;
            })}
          </div> : <div style={{padding:24,textAlign:"center",color:"var(--tx3)",fontSize:13}}>No flags</div>}
        </div>
      </div>

      {/* Score history */}
      {qaMtd.length > 1 && <div className="card" style={{marginTop:16}}>
        <div className="card-header"><span className="card-title">Score trend</span></div>
        <div style={{padding:"0 16px 16px"}}>
          <div style={{display:"flex",gap:12,overflowX:"auto",padding:"8px 0"}}>
            {qaMtd.slice(0,6).reverse().map(m => {
              const score = (m.final_performance||0)*100;
              const color = score >= 40 ? "var(--green)" : score >= 25 ? "var(--amber)" : "var(--red)";
              return (
                <div key={m.month} style={{textAlign:"center",minWidth:60,cursor:"pointer"}} onClick={()=>setSelMonth(m.month)}>
                  <div style={{height:80,display:"flex",alignItems:"flex-end",justifyContent:"center",marginBottom:4}}>
                    <div style={{width:32,borderRadius:"4px 4px 0 0",background:color,height:`${Math.max(8,score*1.5)}px`,transition:"height .3s",border:selMonth===m.month?"2px solid var(--tx)":"none"}}/>
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color}}>{score.toFixed(1)}%</div>
                  <div style={{fontSize:10,color:"var(--tx3)"}}>{m.month}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>}
    </div>
  );
}

export default QAProfilePage;
