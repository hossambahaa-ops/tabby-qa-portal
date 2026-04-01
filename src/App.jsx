import React, { useState, useEffect, useCallback, useRef } from "react";
import "./index.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://shuenqmzbrthiiokfzio.supabase.co";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNodWVucW16YnJ0aGlpb2tmemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mzc4MjAsImV4cCI6MjA5MDUxMzgyMH0.WjbpCt33uJ_hGXucKEHn0q5_daaRnGzwRDVbTxs7lG4";

const sb = {
  headers: (token) => ({ apikey: SUPABASE_ANON, Authorization: `Bearer ${token || SUPABASE_ANON}`, "Content-Type": "application/json", Prefer: "return=representation" }),
  async query(table, { select = "*", filters = "", token, method = "GET", body, headers: extra } = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters ? "&" + filters : ""}`;
    const opts = { method, headers: { ...this.headers(token), ...extra } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || e.details || r.statusText); }
    if (r.status === 204) return [];
    return r.json();
  },
  async rpc(fn, params, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: this.headers(token), body: JSON.stringify(params) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  },
  auth: {
    async getSession() { const s = localStorage.getItem("sb_session"); if (!s) return null; try { const p = JSON.parse(s); if (p.expires_at && Date.now()/1000 > p.expires_at-60) return sb.auth.refresh(p.refresh_token); return p; } catch { localStorage.removeItem("sb_session"); return null; } },
    async refresh(rt) { try { const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method:"POST", headers:{apikey:SUPABASE_ANON,"Content-Type":"application/json"}, body:JSON.stringify({refresh_token:rt}) }); if(!r.ok){localStorage.removeItem("sb_session");return null;} const d=await r.json(); const s={access_token:d.access_token,refresh_token:d.refresh_token,expires_at:d.expires_at,user:d.user}; localStorage.setItem("sb_session",JSON.stringify(s)); return s; } catch{localStorage.removeItem("sb_session");return null;} },
    signInWithGoogle(){window.location.href=`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.origin)}`;},
    async handleCallback(){const h=window.location.hash;if(h&&h.includes("access_token")){const p=new URLSearchParams(h.substring(1));const s={access_token:p.get("access_token"),refresh_token:p.get("refresh_token"),expires_at:Number(p.get("expires_at")),user:null};try{const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${s.access_token}`}});if(r.ok)s.user=await r.json();}catch{}localStorage.setItem("sb_session",JSON.stringify(s));window.history.replaceState(null,"",window.location.pathname);return s;}const c=new URLSearchParams(window.location.search).get("code");if(c){try{const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`,{method:"POST",headers:{apikey:SUPABASE_ANON,"Content-Type":"application/json"},body:JSON.stringify({auth_code:c,code_verifier:sessionStorage.getItem("code_verifier")||""})});if(r.ok){const d=await r.json();const s={access_token:d.access_token,refresh_token:d.refresh_token,expires_at:d.expires_at,user:d.user};localStorage.setItem("sb_session",JSON.stringify(s));window.history.replaceState(null,"",window.location.pathname);return s;}}catch{}}return null;},
    signOut(){localStorage.removeItem("sb_session");sessionStorage.clear();window.location.href=window.location.origin;},
  },
};

const ROLE_LEVEL={qa:1,qa_lead:2,qa_supervisor:3,admin:4,super_admin:5};
const ROLE_LABELS={qa:"QA",qa_lead:"QA Lead",qa_supervisor:"QA Supervisor",admin:"Admin",super_admin:"Super Admin"};
const hasRole=(r,min)=>(ROLE_LEVEL[r]||0)>=(ROLE_LEVEL[min]||99);
const monday=(d)=>{const dt=new Date(d);const day=dt.getDay();const diff=dt.getDate()-day+(day===0?-6:1);dt.setDate(diff);return dt.toISOString().split("T")[0];};
const fmtWeek=(d)=>{if(!d)return"—";const dt=new Date(d+"T00:00:00");return`Week of ${dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;};

function useToast(){const[t,setT]=useState(null);const show=(type,msg)=>{setT({type,msg});setTimeout(()=>setT(null),3500);};const el=t?<div className={`toast toast-${t.type}`}>{t.msg}</div>:null;return{show,el};}

const Icon=({d,size=20,color="currentColor"})=>(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>);
const icons={
  dashboard:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  leaderboard:"M16 8v8m-8-4v4m4-12v12M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  dam:"M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97L13.75 4a2 2 0 00-3.5 0L3.32 16.03A2 2 0 005.07 19z",
  plan:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  coaching:"M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  hr:"M17 20h5v-2a3 3 0 00-5.36-1.81M17 20H7m10 0v-2c0-.66-.13-1.29-.36-1.86M7 20H2v-2a3 3 0 015.36-1.81M7 20v-2c0-.66.13-1.29.36-1.86m0 0A5.97 5.97 0 0112 14c1.66 0 3.18.68 4.28 1.78M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  escalation:"M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm0 0h12",
  settings:"M10.33 3.94c.09-.56.6-.94 1.17-.94h1c.57 0 1.08.38 1.17.94l.14.84c.08.49.4.88.84 1.1.13.07.26.14.38.22.44.28.97.34 1.44.12l.8-.28c.54-.19 1.13.02 1.41.5l.5.87c.29.48.18 1.1-.25 1.45l-.66.56c-.38.32-.56.8-.52 1.28.01.15.01.3 0 .44-.04.49.14.96.52 1.28l.66.56c.43.36.54.97.25 1.45l-.5.87c-.28.48-.87.69-1.41.5l-.8-.28c-.47-.17-1-.1-1.44.12-.12.08-.25.15-.38.22-.44.22-.76.61-.84 1.1l-.14.84c-.09.56-.6.94-1.17.94h-1c-.57 0-1.08-.38-1.17-.94l-.14-.84c-.08-.49-.4-.88-.84-1.1-.13-.07-.26-.14-.38-.22-.44-.28-.97-.34-1.44-.12l-.8.28c-.54.19-1.13-.02-1.41-.5l-.5-.87c-.29-.48-.18-1.1.25-1.45l.66-.56c.38-.32.56-.8.52-1.28-.01-.15-.01-.3 0-.44.04-.49-.14-.96-.52-1.28l-.66-.56c-.43-.36-.54-.97-.25-1.45l.5-.87c.28-.48.87-.69 1.41-.5l.8.28c.47.17 1 .1 1.44-.12.12-.08.25-.15.38-.22.44-.22.76-.61.84-1.1l.14-.84zM14 12a2 2 0 11-4 0 2 2 0 014 0z",
  logout:"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  menu:"M4 6h16M4 12h16M4 18h16",
  upload:"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  plus:"M12 4v16m8-8H4",
  scores:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  check:"M5 13l4 4L19 7",
  edit:"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
};
const TabbyLogo = ({size=24, color="#3CFFA5"}) => (
  <svg width={size * 3.2} height={size} viewBox="0 0 320 100" fill="none">
    <rect width="320" height="100" rx="16" fill="#1A1A1A"/>
    <text x="28" y="68" fontFamily="'DM Sans', sans-serif" fontSize="52" fontWeight="700" fill={color} letterSpacing="-1">tabby</text>
    <text x="222" y="68" fontFamily="'DM Sans', sans-serif" fontSize="52" fontWeight="700" fill="#FFF" letterSpacing="-1">QA</text>
  </svg>
);

const GoogleLogo=()=>(<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>);

/* ═══ PAGES ═══ */

function DashboardPage({profile,token}){
  const[mtd,setMtd]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);
  const[damCount,setDamCount]=useState(0);const[profileCount,setProfileCount]=useState({qas:0,leads:0,active:0});
  const isLead=hasRole(profile?.role,"qa_lead");

  const nameFromEmail=(email)=>{if(!email)return"—";const local=email.split("@")[0];return local.split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};
  const fmt=(val)=>{if(val===null||val===undefined||val==="")return"—";if(typeof val==="string"&&val.includes("%"))return val;if(typeof val==="number"&&val>0&&val<1)return(val*100).toFixed(1)+"%";if(typeof val==="number"&&!Number.isInteger(val))return val.toFixed(2);return String(val);};
  const fpColor=(v)=>v>=0.4?"var(--green)":v>=0.25?"var(--amber)":"var(--red)";
  const fpBg=(v)=>v>=0.4?"var(--green-bg)":v>=0.25?"var(--amber-bg)":"var(--red-bg)";

  useEffect(()=>{(async()=>{try{
    const[mtdRows,rosterRows,flags,profs]=await Promise.all([
      sb.query("mtd_scores",{select:"*",filters:"order=month.desc,final_performance.desc",token}).catch(()=>[]),
      sb.query("qa_roster",{select:"*",token}).catch(()=>[]),
      sb.query("dam_flags",{select:"id,status",filters:"status=eq.pending",token}).catch(()=>[]),
      sb.query("profiles",{select:"id,role,status",filters:"status=eq.active",token}).catch(()=>[]),
    ]);
    setMtd(mtdRows);setRoster(rosterRows);setDamCount(flags.length);
    setProfileCount({qas:profs.filter(p=>p.role==="qa").length,leads:profs.filter(p=>p.role==="qa_lead").length,active:profs.length});
  }catch(e){console.error("Dashboard:",e);}setLoading(false);})();},[token]);

  // Get unique months sorted desc
  const months=[...new Set(mtd.map(r=>r.month))];
  const latestMonth=months[0]||"—";
  const prevMonth=months[1]||null;

  // Current month data
  const current=mtd.filter(r=>r.month===latestMonth);
  const previous=prevMonth?mtd.filter(r=>r.month===prevMonth):[];

  // Find this user's own data
  const myEmail=profile?.email?.toLowerCase();
  const myData=current.find(r=>r.qa_email.toLowerCase()===myEmail);
  const myPrevData=previous.find(r=>r.qa_email.toLowerCase()===myEmail);

  // My rank
  const ranked=[...current].sort((a,b)=>(b.final_performance||0)-(a.final_performance||0));
  const myRank=ranked.findIndex(r=>r.qa_email.toLowerCase()===myEmail)+1;

  // My roster info
  const myRoster=roster.find(r=>r.email.toLowerCase()===myEmail);

  // For leads: find team members (people whose manager_email matches this user)
  const myTeamEmails=roster.filter(r=>r.manager_email&&r.manager_email.toLowerCase()===myEmail).map(r=>r.email.toLowerCase());
  // Also check mtd qa_tl field
  const myTlEmails=current.filter(r=>r.qa_tl&&r.qa_tl.toLowerCase()===myEmail).map(r=>r.qa_email.toLowerCase());
  const allTeamEmails=[...new Set([...myTeamEmails,...myTlEmails])];
  const teamCurrent=current.filter(r=>allTeamEmails.includes(r.qa_email.toLowerCase()));
  const teamPrevious=previous.filter(r=>allTeamEmails.includes(r.qa_email.toLowerCase()));
  const teamSorted=[...teamCurrent].sort((a,b)=>(b.final_performance||0)-(a.final_performance||0));

  // Team averages
  const teamAvgFP=teamCurrent.length?(teamCurrent.reduce((a,r)=>a+(r.final_performance||0),0)/teamCurrent.length):0;
  const teamAvgFPPrev=teamPrevious.length?(teamPrevious.reduce((a,r)=>a+(r.final_performance||0),0)/teamPrevious.length):0;
  const teamTrend=teamPrevious.length?((teamAvgFP-teamAvgFPPrev)*100).toFixed(1):null;
  const teamDsat=teamCurrent.reduce((a,r)=>a+(r.dsat||0),0);

  // Performance trend for sparkline (my data across months)
  const myHistory=months.slice(0,6).reverse().map(m=>{const row=mtd.find(r=>r.month===m&&r.qa_email.toLowerCase()===myEmail);return{month:m,fp:row?row.final_performance||0:null};}).filter(d=>d.fp!==null);

  const nav=(page)=>window.dispatchEvent(new CustomEvent("navigate",{detail:page}));

  return(<div className="page">
    <div className="welcome-banner"><h2>Welcome back, {profile?.display_name?.split(" ")[0]||"there"}</h2><p>{isLead?"Here's your team overview for "+latestMonth+".":"Here's your performance overview for "+latestMonth+"."}</p><div className="welcome-role">{ROLE_LABELS[profile?.role]||"QA"} &middot; {profile?.domain}{myRoster?" · "+myRoster.queue:""}</div></div>
    {loading?<div className="loading-spinner"><div className="spinner"/></div>:<>

    {/* ── Lead+ team overview ── */}
    {isLead&&<>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--accent-light)",color:"var(--accent-text)",fontSize:18}}>👥</div><div className="stat-label">My team</div><div className="stat-value">{allTeamEmails.length}</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--green-bg)",color:"var(--green)",fontSize:18}}>📊</div><div className="stat-label">Team avg performance</div><div className="stat-value" style={{color:fpColor(teamAvgFP)}}>{(teamAvgFP*100).toFixed(1)}%</div>{teamTrend&&<div style={{fontSize:12,marginTop:4,color:Number(teamTrend)>=0?"var(--green)":"var(--red)"}}>{Number(teamTrend)>=0?"↑":"↓"} {Math.abs(teamTrend)}% vs {prevMonth}</div>}</div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--red-bg)",color:"var(--red)",fontSize:18}}>⚠️</div><div className="stat-label">Team DSAT</div><div className="stat-value" style={{color:teamDsat>30?"var(--red)":"var(--tx)"}}>{teamDsat}</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>🚩</div><div className="stat-label">Pending DAM flags</div><div className="stat-value">{damCount}</div></div>
      </div>

      {/* Team members table */}
      {teamSorted.length>0&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My team — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{teamSorted.length} specialists</span></div>
        <div className="table-wrap"><table><thead><tr><th>#</th><th>Specialist</th><th style={{textAlign:"right"}}>Performance</th><th style={{textAlign:"right"}}>Tickets/d</th><th style={{textAlign:"right"}}>DSAT</th><th style={{textAlign:"right"}}>Occupancy</th><th style={{textAlign:"right"}}>RTR</th><th style={{textAlign:"center"}}>JKQ</th></tr></thead><tbody>
          {teamSorted.map((r,i)=>(<tr key={r.id}>
            <td style={{fontWeight:500,color:i<3?"var(--amber)":"var(--tx3)"}}>{i+1}</td>
            <td style={{fontWeight:500}}>{nameFromEmail(r.qa_email)}</td>
            <td style={{textAlign:"right"}}><span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:fpBg(r.final_performance),color:fpColor(r.final_performance)}}>{((r.final_performance||0)*100).toFixed(1)}%</span></td>
            <td style={{textAlign:"right",color:"var(--teal)",fontWeight:500}}>{r.ticket_per_day??0}</td>
            <td style={{textAlign:"right",color:(r.dsat||0)>20?"var(--red)":"inherit",fontWeight:(r.dsat||0)>20?600:400}}>{r.dsat??0}</td>
            <td style={{textAlign:"right"}}>{fmt(r.occupancy_pct)}</td>
            <td style={{textAlign:"right"}}>{fmt(r.avg_rtr_score)}</td>
            <td style={{textAlign:"center"}}>{r.jkq_result&&r.jkq_result!=="N/A"?<span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:r.jkq_result==="Pass"?"var(--green-bg)":"var(--red-bg)",color:r.jkq_result==="Pass"?"var(--green)":"var(--red)"}}>{r.jkq_result}</span>:<span style={{color:"var(--tx3)"}}>—</span>}</td>
          </tr>))}
        </tbody></table></div>
      </div>}
    </>}

    {/* ── Personal stats (everyone) ── */}
    {myData?<>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon" style={{background:fpBg(myData.final_performance),color:fpColor(myData.final_performance),fontSize:18}}>📊</div><div className="stat-label">My performance</div><div className="stat-value" style={{color:fpColor(myData.final_performance)}}>{((myData.final_performance||0)*100).toFixed(1)}%</div>{myPrevData&&<div style={{fontSize:12,marginTop:4,color:((myData.final_performance||0)-(myPrevData.final_performance||0))>=0?"var(--green)":"var(--red)"}}>{((myData.final_performance||0)-(myPrevData.final_performance||0))>=0?"↑":"↓"} {(Math.abs((myData.final_performance||0)-(myPrevData.final_performance||0))*100).toFixed(1)}% vs {prevMonth}</div>}</div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>🏆</div><div className="stat-label">Rank</div><div className="stat-value">{myRank>0?"#"+myRank:"—"}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {ranked.length}</span></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--teal-bg)",color:"var(--teal)",fontSize:18}}>🎫</div><div className="stat-label">Tickets/day</div><div className="stat-value">{myData.ticket_per_day??0}</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:(myData.dsat||0)>20?"var(--red-bg)":"var(--green-bg)",color:(myData.dsat||0)>20?"var(--red)":"var(--green)",fontSize:18}}>📋</div><div className="stat-label">DSAT</div><div className="stat-value">{myData.dsat??0}</div></div>
      </div>

      {/* My KPI detail */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My KPIs — {latestMonth}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Metric</th><th style={{textAlign:"right"}}>Value</th></tr></thead><tbody>
          {[
            {label:"Occupancy",value:fmt(myData.occupancy_pct)},
            {label:"Coaching on-time",value:fmt(myData.coaching_ontime_score)},
            {label:"Calibration",value:fmt(myData.calibration_score)},
            {label:"Coaching observation",value:fmt(myData.coaching_observation_score)},
            {label:"RTR score",value:fmt(myData.avg_rtr_score)},
            {label:"Coaching completion",value:fmt(myData.coaching_completion_pct)},
            {label:"Tickets/day",value:myData.ticket_per_day??0},
            {label:"Working days",value:(myData.working_days||0)+(myData.ramadan_wds?" ("+myData.ramadan_wds+" Ramadan)":"")},
            {label:"JKQ",value:myData.jkq_result&&myData.jkq_result!=="N/A"?myData.jkq_result+(myData.jkq_score>0?" ("+myData.jkq_score+")":""):"—"},
          ].map(row=>(<tr key={row.label}><td style={{color:"var(--tx2)"}}>{row.label}</td><td style={{textAlign:"right",fontWeight:500}}>{row.value}</td></tr>))}
        </tbody></table></div>
      </div>

      {/* Sparkline trend */}
      {myHistory.length>1&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">Performance trend</span></div>
        <svg width="100%" height="100" viewBox={`0 0 ${myHistory.length*100} 100`} style={{overflow:"visible"}}><polyline fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={myHistory.map((d,i)=>{const y=90-(d.fp/0.6)*70;return`${i*100+50},${Math.max(10,Math.min(90,y))}`;}).join(" ")}/>{myHistory.map((d,i)=>{const y=90-(d.fp/0.6)*70;const cy=Math.max(10,Math.min(90,y));return(<g key={i}><circle cx={i*100+50} cy={cy} r="4" fill="var(--accent-text)"/><text x={i*100+50} y={cy-12} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--tx)" fontFamily="var(--font)">{(d.fp*100).toFixed(0)}%</text><text x={i*100+50} y={cy+18} textAnchor="middle" fontSize="10" fill="var(--tx3)" fontFamily="var(--font)">{d.month}</text></g>);})}</svg>
      </div>}
    </>:
    /* No personal MTD data — show quick actions */
    <div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">Quick actions</span></div>
      <div className="placeholder" style={{padding:"30px 20px"}}>
        {isLead?<div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
          <button className="btn btn-primary" onClick={()=>nav("scores")} style={{cursor:"pointer"}}>View Scores</button>
          <button className="btn btn-outline" onClick={()=>nav("leaderboard")} style={{cursor:"pointer"}}>Leaderboard</button>
          <button className="btn btn-outline" onClick={()=>nav("dam")} style={{cursor:"pointer"}}>DAM Flags</button>
        </div>:<p style={{color:"var(--tx3)"}}>No performance data found for your email ({profile?.email}). Data syncs from Metabase hourly.</p>}
      </div>
    </div>}

    {/* ── Global stats (for admins/supervisors) ── */}
    {hasRole(profile?.role,"qa_supervisor")&&<div className="stats-grid">
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--accent-light)",color:"var(--accent-text)",fontSize:18}}>👥</div><div className="stat-label">Total QAs (roster)</div><div className="stat-value">{roster.length}</div></div>
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>👔</div><div className="stat-label">Team leads</div><div className="stat-value">{[...new Set(roster.map(r=>r.manager_email).filter(Boolean))].length}</div></div>
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--green-bg)",color:"var(--green)",fontSize:18}}>📊</div><div className="stat-label">Avg performance ({latestMonth})</div><div className="stat-value" style={{color:fpColor(ranked.length?ranked.reduce((a,r)=>a+(r.final_performance||0),0)/ranked.length:0)}}>{ranked.length?((ranked.reduce((a,r)=>a+(r.final_performance||0),0)/ranked.length)*100).toFixed(1)+"%":"—"}</div></div>
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--red-bg)",color:"var(--red)",fontSize:18}}>⚠️</div><div className="stat-label">Total DSAT ({latestMonth})</div><div className="stat-value">{current.reduce((a,r)=>a+(r.dsat||0),0)}</div></div>
    </div>}

    </>}
  </div>);
}

function TeamManagementPage({token}){
  const[teams,setTeams]=useState([]);const[users,setUsers]=useState([]);const[loading,setLoading]=useState(true);const[showForm,setShowForm]=useState(false);
  const[form,setForm]=useState({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});const[editId,setEditId]=useState(null);const{show,el}=useToast();
  const load=useCallback(async()=>{try{const[t,u]=await Promise.all([sb.query("teams",{select:"id,name,domain,lead_id,supervisor_id,profiles!fk_teams_lead(display_name,email),sup:profiles!fk_teams_supervisor(display_name,email)",token}),sb.query("profiles",{select:"id,display_name,email,role,domain",token})]);setTeams(t);setUsers(u);}catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);
  const leads=users.filter(u=>hasRole(u.role,"qa_lead")),supervisors=users.filter(u=>hasRole(u.role,"qa_supervisor"));
  const save=async()=>{try{const b={name:form.name,domain:form.domain,lead_id:form.lead_id||null,supervisor_id:form.supervisor_id||null};if(editId){await sb.query("teams",{token,method:"PATCH",body:b,filters:`id=eq.${editId}`});show("success","Team updated");}else{await sb.query("teams",{token,method:"POST",body:b});show("success","Team created");}setShowForm(false);setEditId(null);setForm({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});load();}catch(e){show("error",e.message);}};
  const startEdit=(t)=>{setForm({name:t.name,domain:t.domain,lead_id:t.lead_id||"",supervisor_id:t.supervisor_id||""});setEditId(t.id);setShowForm(true);};
  const del=async(id)=>{if(!confirm("Delete this team?"))return;try{await sb.query("teams",{token,method:"DELETE",filters:`id=eq.${id}`});show("success","Deleted");load();}catch(e){show("error",e.message);}};
  return(<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div className="page-title">Team management</div><div className="page-subtitle">{teams.length} teams</div></div><button className="btn btn-primary" onClick={()=>{setShowForm(!showForm);setEditId(null);setForm({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});}}><Icon d={icons.plus} size={16}/>New team</button></div>
    {showForm&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">{editId?"Edit team":"Create team"}</span></div>
      <div className="form-grid"><div className="form-group"><label className="form-label">Team name</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Payments QA"/></div>
      <div className="form-group"><label className="form-label">Domain</label><select className="select form-input" value={form.domain} onChange={e=>setForm({...form,domain:e.target.value})}><option value="tabby.ai">tabby.ai</option><option value="tabby.sa">tabby.sa</option></select></div>
      <div className="form-group"><label className="form-label">Lead</label><select className="select form-input" value={form.lead_id} onChange={e=>setForm({...form,lead_id:e.target.value})}><option value="">— Select —</option>{leads.map(u=><option key={u.id} value={u.id}>{u.display_name||u.email}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Supervisor</label><select className="select form-input" value={form.supervisor_id} onChange={e=>setForm({...form,supervisor_id:e.target.value})}><option value="">— Select —</option>{supervisors.map(u=><option key={u.id} value={u.id}>{u.display_name||u.email}</option>)}</select></div></div>
      <div style={{display:"flex",gap:8,marginTop:16}}><button className="btn btn-primary" onClick={save}><Icon d={icons.check} size={16}/>{editId?"Update":"Create"}</button><button className="btn btn-outline" onClick={()=>{setShowForm(false);setEditId(null);}}>Cancel</button></div>
    </div>}
    <div className="card">{loading?<div className="loading-spinner"><div className="spinner"/></div>:teams.length===0?<div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No teams yet.</p></div>:
      <div className="table-wrap"><table><thead><tr><th>Team</th><th>Domain</th><th>Lead</th><th>Supervisor</th><th></th></tr></thead><tbody>
        {teams.map(t=>(<tr key={t.id}><td style={{fontWeight:500}}>{t.name}</td><td><span className={`domain-badge domain-${t.domain==="tabby.ai"?"ai":"sa"}`}>{t.domain}</span></td><td style={{fontSize:13}}>{t.profiles?.display_name||"—"}</td><td style={{fontSize:13}}>{t.sup?.display_name||"—"}</td><td><div style={{display:"flex",gap:4}}><button className="btn btn-outline btn-sm" onClick={()=>startEdit(t)}><Icon d={icons.edit} size={14}/></button><button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={()=>del(t.id)}><Icon d={icons.trash} size={14}/></button></div></td></tr>))}
      </tbody></table></div>}</div>{el}
  </div>);
}

function ScoreEntryPage({token,profile}){
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selQA, setSelQA] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const rows = await sb.query("mtd_scores", {
          select: "*",
          filters: "order=month.desc,qa_email.asc",
          token
        });
        setData(rows);
        const uniqueMonths = [...new Set(rows.map(r => r.month))];
        setMonths(uniqueMonths);
        if (uniqueMonths.length > 0) setSelMonth(uniqueMonths[0]);
      } catch (e) { console.error("MTD Scores:", e); }
      setLoading(false);
    })();
  }, [token]);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  // Format values: percentages, decimals, etc.
  const fmt = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    // Already a string with % sign
    if (typeof val === "string" && val.includes("%")) return val;
    // Decimal that looks like a percentage (0.886 → 88.6%)
    if (typeof val === "number" && val > 0 && val < 1) return (val * 100).toFixed(1) + "%";
    // Long decimal number — round it
    if (typeof val === "number" && !Number.isInteger(val)) return val.toFixed(2);
    return String(val);
  };

  const monthData = data.filter(r => r.month === selMonth);
  const qaEmails = [...new Set(monthData.map(r => r.qa_email))].sort();
  const filtered = selQA ? monthData.filter(r => r.qa_email === selQA) : monthData;
  const sorted = [...filtered].sort((a, b) => (b.final_performance || 0) - (a.final_performance || 0));

  const fpColor = (v) => v >= 0.4 ? "var(--green)" : v >= 0.25 ? "var(--amber)" : "var(--red)";
  const fpBg = (v) => v >= 0.4 ? "var(--green-bg)" : v >= 0.25 ? "var(--amber-bg)" : "var(--red-bg)";

  if (loading) return <div className="page"><div className="loading-spinner"><div className="spinner"/></div></div>;

  return (<div className="page">
    <div className="page-header">
      <div className="page-title">Score entry</div>
      <div className="page-subtitle">MTD performance data — synced from Metabase hourly</div>
    </div>

    <div className="card" style={{marginBottom:16}}>
      <div className="controls-row">
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Month</label>
          <select className="select form-input" value={selMonth} onChange={e=>{setSelMonth(e.target.value);setSelQA("");}}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group" style={{flex:2}}>
          <label className="form-label">Filter by QA</label>
          <select className="select form-input" value={selQA} onChange={e=>setSelQA(e.target.value)}>
            <option value="">All specialists ({qaEmails.length})</option>
            {qaEmails.map(e => <option key={e} value={e}>{nameFromEmail(e)} ({e})</option>)}
          </select>
        </div>
      </div>
    </div>

    {sorted.length === 0 ? (
      <div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No MTD data for {selMonth}. Check that the Google Sheet sync is running.</p></div></div>
    ) : (
      <div className="card">
        <div className="card-header">
          <span className="card-title">{selMonth} — {sorted.length} specialists</span>
          <span style={{fontSize:12,color:"var(--tx3)"}}>Synced: {sorted[0]?.synced_at ? new Date(sorted[0].synced_at).toLocaleString() : "—"}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{minWidth:160}}>Specialist</th>
                <th>TL</th>
                <th style={{textAlign:"right"}}>SBS</th>
                <th style={{textAlign:"right"}}>Non-SBS</th>
                <th style={{textAlign:"right"}}>DSAT</th>
                <th style={{textAlign:"right"}}>Late</th>
                <th style={{textAlign:"right"}}>Never</th>
                <th style={{textAlign:"right"}}>Valid</th>
                <th style={{textAlign:"right"}}>Invalid</th>
                <th style={{textAlign:"right"}}>Sessions</th>
                <th style={{textAlign:"right"}}>On-time</th>
                <th style={{textAlign:"right"}}>Eligible</th>
                <th style={{textAlign:"right"}}>Not coached</th>
                <th style={{textAlign:"right"}}>RTR</th>
                <th style={{textAlign:"right"}}>RTR score</th>
                <th style={{textAlign:"right"}}>Obs.</th>
                <th style={{textAlign:"right"}}>Obs. %</th>
                <th style={{textAlign:"right"}}>Calib.</th>
                <th style={{textAlign:"right"}}>Calib. %</th>
                <th style={{textAlign:"right"}}>Completion</th>
                <th style={{textAlign:"right"}}>On-time %</th>
                <th style={{textAlign:"center"}}>JKQ</th>
                <th style={{textAlign:"right"}}>Tickets/d</th>
                <th style={{textAlign:"right"}}>Occupancy</th>
                <th style={{textAlign:"right"}}>Days</th>
                <th style={{textAlign:"right"}}>Performance</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>
                        {nameFromEmail(r.qa_email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                      </div>
                      <div>
                        <div style={{fontWeight:500,fontSize:13,whiteSpace:"nowrap"}}>{nameFromEmail(r.qa_email)}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{fontSize:12,color:"var(--tx2)",whiteSpace:"nowrap"}}>{r.qa_tl ? nameFromEmail(r.qa_tl) : "—"}</td>
                  <td style={{textAlign:"right"}}>{r.sbs ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.non_sbs ?? "—"}</td>
                  <td style={{textAlign:"right",color:(r.dsat||0)>20?"var(--red)":"inherit",fontWeight:(r.dsat||0)>20?600:400}}>{r.dsat ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.late_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.never_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.valid_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.invalid_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.coaching_sessions ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.total_ontime_coachings ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.coaching_eligibility_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.not_coached ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.rtr_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmt(r.avg_rtr_score)}</td>
                  <td style={{textAlign:"right"}}>{r.observed_coaching_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmt(r.avg_observation_score_pct)}</td>
                  <td style={{textAlign:"right"}}>{r.calibration_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmt(r.avg_calibration_match_rate)}</td>
                  <td style={{textAlign:"right"}}>{fmt(r.coaching_completion_pct)}</td>
                  <td style={{textAlign:"right"}}>{fmt(r.ontime_coaching_pct)}</td>
                  <td style={{textAlign:"center"}}>
                    {r.jkq_result && r.jkq_result !== "N/A" ? (
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:r.jkq_result==="Pass"?"var(--green-bg)":"var(--red-bg)",color:r.jkq_result==="Pass"?"var(--green)":"var(--red)"}}>{r.jkq_result}{r.jkq_score>0?` (${r.jkq_score})`:""}</span>
                    ) : <span style={{color:"var(--tx3)"}}>—</span>}
                  </td>
                  <td style={{textAlign:"right",color:"var(--teal)",fontWeight:500}}>{r.ticket_per_day ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmt(r.occupancy_pct)}</td>
                  <td style={{textAlign:"right"}}>{r.working_days||"—"}{r.ramadan_wds?<span style={{fontSize:10,color:"var(--tx3)"}}> ({r.ramadan_wds}R)</span>:""}</td>
                  <td style={{textAlign:"right"}}>
                    <span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:fpBg(r.final_performance),color:fpColor(r.final_performance)}}>
                      {((r.final_performance||0)*100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>);
}

function AdminUsersPage({token,teams}){
  const[users,setUsers]=useState([]);const[memberships,setMemberships]=useState({});const[loading,setLoading]=useState(true);const[editingId,setEditingId]=useState(null);const[editRole,setEditRole]=useState("");const[editTeams,setEditTeams]=useState([]);const{show,el}=useToast();
  const load=useCallback(async()=>{try{
    const[d,tm]=await Promise.all([
      sb.query("profiles",{select:"id,email,display_name,role,domain,status",token}),
      sb.query("team_members",{select:"id,profile_id,team_id,is_primary",token})
    ]);
    setUsers(d.sort((a,b)=>ROLE_LEVEL[b.role]-ROLE_LEVEL[a.role]));
    const map={};tm.forEach(m=>{if(!map[m.profile_id])map[m.profile_id]=[];map[m.profile_id].push(m);});
    setMemberships(map);
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);
  const getUserTeamNames=(uid)=>{const ms=memberships[uid]||[];return ms.map(m=>{const t=teams.find(t2=>t2.id===m.team_id);return t?t.name:null;}).filter(Boolean);};
  const save=async(uid)=>{try{
    await sb.query("profiles",{token,method:"PATCH",body:{role:editRole},filters:`id=eq.${uid}`});
    // Delete existing memberships and re-create
    await sb.query("team_members",{token,method:"DELETE",filters:`profile_id=eq.${uid}`});
    if(editTeams.length>0){
      const rows=editTeams.map((tid,i)=>({profile_id:uid,team_id:tid,is_primary:i===0}));
      await sb.query("team_members",{token,method:"POST",body:rows});
      // Also update profiles.team_id to primary team for backward compat
      await sb.query("profiles",{token,method:"PATCH",body:{team_id:editTeams[0]},filters:`id=eq.${uid}`});
    } else {
      await sb.query("profiles",{token,method:"PATCH",body:{team_id:null},filters:`id=eq.${uid}`});
    }
    setEditingId(null);show("success","Updated");load();
  }catch(e){show("error",e.message);}};
  const toggleTeam=(tid)=>{setEditTeams(prev=>prev.includes(tid)?prev.filter(t=>t!==tid):[...prev,tid]);};
  return(<div className="page">
    <div className="page-header"><div className="page-title">User management</div><div className="page-subtitle">{users.length} users</div></div>
    <div className="card">{loading?<div className="loading-spinner"><div className="spinner"/></div>:
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Domain</th><th>Teams</th><th>Status</th><th></th></tr></thead><tbody>
        {users.map(u=>{const uTeams=getUserTeamNames(u.id);const uTeamIds=(memberships[u.id]||[]).map(m=>m.team_id);return(<tr key={u.id}><td style={{fontWeight:500}}>{u.display_name||"—"}</td><td style={{color:"var(--tx2)",fontSize:13}}>{u.email}</td>
        <td>{editingId===u.id?<select className="select" value={editRole} onChange={e=>setEditRole(e.target.value)} style={{fontSize:12,padding:"4px 8px"}}>{Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>:<span className={`role-badge role-${u.role}`}>{ROLE_LABELS[u.role]}</span>}</td>
        <td><span className={`domain-badge domain-${u.domain==="tabby.ai"?"ai":"sa"}`}>{u.domain}</span></td>
        <td>{editingId===u.id?<div className="team-checkboxes">{teams.map(t=><label key={t.id} className={`team-checkbox ${editTeams.includes(t.id)?"checked":""}`}><input type="checkbox" checked={editTeams.includes(t.id)} onChange={()=>toggleTeam(t.id)} style={{display:"none"}}/>{t.name}</label>)}{teams.length===0&&<span style={{fontSize:12,color:"var(--tx3)"}}>No teams created</span>}</div>:
          uTeams.length>0?<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{uTeams.map((n,i)=><span key={i} className="team-tag">{n}</span>)}</div>:<span style={{fontSize:13,color:"var(--tx3)"}}>Unassigned</span>}</td>
        <td><span className={`status-badge status-${u.status}`}>{u.status}</span></td>
        <td>{editingId===u.id?<div style={{display:"flex",gap:6}}><button className="btn btn-primary btn-sm" onClick={()=>save(u.id)}>Save</button><button className="btn btn-outline btn-sm" onClick={()=>setEditingId(null)}>Cancel</button></div>:<button className="btn btn-outline btn-sm" onClick={()=>{setEditingId(u.id);setEditRole(u.role);setEditTeams([...uTeamIds]);}}>Edit</button>}</td></tr>);})}
      </tbody></table></div>}</div>{el}
  </div>);
}

function AdminPage({token,profile}){
  const[tab,setTab]=useState("users");const[teams,setTeams]=useState([]);
  useEffect(()=>{sb.query("teams",{select:"id,name,domain",token}).then(setTeams).catch(()=>{});},[token]);
  return(<div><div className="page" style={{paddingBottom:0}}><div className="page-header" style={{marginBottom:16}}><div className="page-title">Admin panel</div></div>
    <div className="tab-bar" style={{marginBottom:0}}><button className={`tab-btn ${tab==="users"?"active":""}`} onClick={()=>setTab("users")}>Users</button><button className={`tab-btn ${tab==="teams"?"active":""}`} onClick={()=>setTab("teams")}>Teams</button></div></div>
    {tab==="users"&&<AdminUsersPage token={token} teams={teams}/>}{tab==="teams"&&<TeamManagementPage token={token}/>}</div>);
}

/* ═══ DAM ENGINE ═══ */
function DAMPage({token,profile}){
  const[tab,setTab]=useState("flags");const[rules,setRules]=useState([]);const[flags,setFlags]=useState([]);const[steps,setSteps]=useState([]);
  const[loading,setLoading]=useState(true);const[showCreate,setShowCreate]=useState(false);
  const[selRule,setSelRule]=useState("");const[selProfile,setSelProfile]=useState("");const[flagNotes,setFlagNotes]=useState("");
  const[profiles,setProfiles]=useState([]);const{show,el}=useToast();

  const load=useCallback(async()=>{try{
    const[r,f,s,p]=await Promise.all([
      sb.query("dam_rules",{select:"id,name,description,behavior_type,dam_reference,severity,auditing_flow,executor_role,auditor_role,goal,compliant_action",filters:"is_active=eq.true&order=behavior_type.asc,name.asc",token}),
      sb.query("dam_flags",{select:"id,profile_id,rule_id,severity,recommended_action,triggered_at,status,notes,occurrence_number,reviewed_by,reviewed_at,profiles!dam_flags_profile_id_fkey(display_name,email),dam_rules(name,behavior_type,dam_reference)",filters:"order=triggered_at.desc&limit=100",token}).catch(()=>[]),
      sb.query("dam_escalation_steps",{select:"id,rule_id,occurrence,action,includes_pip,pip_action,deduction_days,is_hr_investigation",filters:"order=rule_id.asc,occurrence.asc",token}),
      sb.query("profiles",{select:"id,display_name,email,role",filters:"status=eq.active",token}),
    ]);
    setRules(r);setFlags(f);setSteps(s);setProfiles(p);
  }catch(e){console.error(e);}setLoading(false);},[token]);

  useEffect(()=>{load();},[load]);

  const getStepsForRule=(ruleId)=>steps.filter(s=>s.rule_id===ruleId).sort((a,b)=>a.occurrence-b.occurrence);
  const getOccurrenceCount=(profileId,ruleId)=>flags.filter(f=>f.profile_id===profileId&&f.rule_id===ruleId&&f.status!=="dismissed").length;

  const createFlag=async()=>{
    if(!selRule||!selProfile){show("error","Select a behavior and a person");return;}
    const occ=getOccurrenceCount(selProfile,selRule)+1;
    const rule=rules.find(r=>r.id===selRule);
    const step=getStepsForRule(selRule).find(s=>s.occurrence===occ);
    try{
      await sb.query("dam_flags",{token,method:"POST",body:{
        profile_id:selProfile,rule_id:selRule,severity:rule?.severity||"warning",
        recommended_action:step?.includes_pip?"pip":(step?.is_hr_investigation?"termination_review":"coaching"),
        occurrence_number:occ,escalation_step_id:step?.id||null,
        notes:flagNotes,trigger_data:{created_by:profile.id,step_action:step?.action||"No step defined"},
      }});
      show("success",`Flag created — occurrence #${occ}${step?": "+step.action:""}`);
      setShowCreate(false);setSelRule("");setSelProfile("");setFlagNotes("");load();
    }catch(e){show("error",e.message);}
  };

  const updateFlagStatus=async(flagId,status)=>{
    try{
      await sb.query("dam_flags",{token,method:"PATCH",body:{status,reviewed_by:profile.id,reviewed_at:new Date().toISOString()},filters:`id=eq.${flagId}`});
      show("success","Flag updated");load();
    }catch(e){show("error",e.message);}
  };

  const behaviorTypes=[{key:"manipulation",label:"Manipulation",color:"var(--red)"},{key:"performance_management",label:"Performance management",color:"var(--amber)"},{key:"completion_attainment",label:"Completion & attainment",color:"var(--accent-text)"}];
  const statusColors={pending:"var(--amber)",acknowledged:"var(--accent-text)",action_created:"var(--teal)",resolved:"var(--green)",dismissed:"var(--tx3)"};

  if(loading)return<div className="page"><div className="loading-spinner"><div className="spinner"/></div></div>;

  return(<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div><div className="page-title">DAM engine</div><div className="page-subtitle">Disciplinary Actions Matrix — {flags.filter(f=>f.status==="pending").length} pending flags</div></div>
      <button className="btn btn-primary" onClick={()=>setShowCreate(!showCreate)}><Icon d={icons.plus} size={16}/>Create flag</button>
    </div>

    <div className="tab-bar">
      <button className={`tab-btn ${tab==="flags"?"active":""}`} onClick={()=>setTab("flags")}>Active flags ({flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").length})</button>
      <button className={`tab-btn ${tab==="rules"?"active":""}`} onClick={()=>setTab("rules")}>Behavior rules ({rules.length})</button>
      <button className={`tab-btn ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}>All history ({flags.length})</button>
    </div>

    {showCreate&&<div className="card" style={{marginBottom:16}}>
      <div className="card-header"><span className="card-title">Create DAM flag</span></div>
      <div className="form-grid">
        <div className="form-group"><label className="form-label">Person</label>
          <select className="select form-input" value={selProfile} onChange={e=>setSelProfile(e.target.value)}>
            <option value="">— Select person —</option>
            {profiles.filter(p=>p.role==="qa"||p.role==="qa_lead").map(p=><option key={p.id} value={p.id}>{p.display_name||p.email} ({ROLE_LABELS[p.role]})</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Behavior</label>
          <select className="select form-input" value={selRule} onChange={e=>setSelRule(e.target.value)}>
            <option value="">— Select behavior —</option>
            {behaviorTypes.map(bt=><optgroup key={bt.key} label={bt.label}>
              {rules.filter(r=>r.behavior_type===bt.key).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
            </optgroup>)}
          </select>
        </div>
        <div className="form-group" style={{gridColumn:"1/-1"}}><label className="form-label">Notes</label>
          <textarea className="form-input" rows={2} value={flagNotes} onChange={e=>setFlagNotes(e.target.value)} placeholder="Context, evidence, audit findings..." style={{resize:"vertical"}}/>
        </div>
      </div>
      {selRule&&selProfile&&<div style={{marginTop:12,padding:"10px 14px",background:"var(--bg)",borderRadius:8,fontSize:13}}>
        <strong>Next occurrence:</strong> #{getOccurrenceCount(selProfile,selRule)+1}
        {(()=>{const step=getStepsForRule(selRule).find(s=>s.occurrence===getOccurrenceCount(selProfile,selRule)+1);return step?<span> → <span style={{color:step.is_hr_investigation?"var(--red)":"var(--amber)",fontWeight:600}}>{step.action}</span></span>:<span style={{color:"var(--tx3)"}}> — No escalation step defined for this occurrence</span>;})()}
      </div>}
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button className="btn btn-primary" onClick={createFlag}><Icon d={icons.dam} size={16}/>Create flag</button>
        <button className="btn btn-outline" onClick={()=>setShowCreate(false)}>Cancel</button>
      </div>
    </div>}

    {tab==="flags"&&<div className="card">
      {flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").length===0?
        <div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No active flags. Create one above or wait for auto-detection.</p></div>:
        <div className="table-wrap"><table><thead><tr><th>Person</th><th>Behavior</th><th>Category</th><th>Occurrence</th><th>Escalation</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
          {flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").map(f=>{
            const step=f.escalation_step_id?steps.find(s=>s.id===f.escalation_step_id):getStepsForRule(f.rule_id).find(s=>s.occurrence===f.occurrence_number);
            return(<tr key={f.id}>
              <td style={{fontWeight:500}}>{f.profiles?.display_name||f.profiles?.email||"—"}</td>
              <td style={{fontSize:13}}>{f.dam_rules?.name||"—"}</td>
              <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:f.dam_rules?.behavior_type==="manipulation"?"var(--red-bg)":f.dam_rules?.behavior_type==="performance_management"?"var(--amber-bg)":"var(--accent-light)",color:f.dam_rules?.behavior_type==="manipulation"?"var(--red)":f.dam_rules?.behavior_type==="performance_management"?"var(--amber)":"var(--accent-text)",fontWeight:500}}>{f.dam_rules?.behavior_type?.replace(/_/g," ")||"—"}</span></td>
              <td style={{fontWeight:600}}>#{f.occurrence_number}</td>
              <td style={{fontSize:13,color:step?.is_hr_investigation?"var(--red)":"var(--tx)"}}>{step?.action||"—"}{step?.deduction_days>0&&<span style={{color:"var(--red)",marginLeft:4}}>(-{step.deduction_days}d)</span>}</td>
              <td><span style={{fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:600,background:f.status==="pending"?"var(--amber-bg)":"var(--green-bg)",color:statusColors[f.status]||"var(--tx3)"}}>{f.status}</span></td>
              <td style={{fontSize:12,color:"var(--tx2)"}}>{new Date(f.triggered_at).toLocaleDateString()}</td>
              <td><div style={{display:"flex",gap:4}}>
                {f.status==="pending"&&<button className="btn btn-outline btn-sm" onClick={()=>updateFlagStatus(f.id,"acknowledged")}>Acknowledge</button>}
                {(f.status==="pending"||f.status==="acknowledged")&&<button className="btn btn-outline btn-sm" onClick={()=>updateFlagStatus(f.id,"resolved")} style={{color:"var(--green)"}}>Resolve</button>}
                {f.status==="pending"&&<button className="btn btn-outline btn-sm" onClick={()=>updateFlagStatus(f.id,"dismissed")} style={{color:"var(--tx3)"}}>Dismiss</button>}
              </div></td>
            </tr>);})}
        </tbody></table></div>}
    </div>}

    {tab==="rules"&&<div>{behaviorTypes.map(bt=><div key={bt.key} className="card" style={{marginBottom:16}}>
      <div className="card-header"><span className="card-title" style={{color:bt.color}}>{bt.label}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{rules.filter(r=>r.behavior_type===bt.key).length} behaviors</span></div>
      {rules.filter(r=>r.behavior_type===bt.key).map(r=><div key={r.id} style={{padding:"12px 0",borderBottom:"1px solid var(--bd2)"}}>
        <div style={{fontWeight:500,fontSize:14,marginBottom:4}}>{r.name}</div>
        {r.description&&<div style={{fontSize:13,color:"var(--tx2)",marginBottom:6}}>{r.description}</div>}
        <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:"var(--tx3)"}}>
          {r.auditing_flow&&<span>Audit: {r.auditing_flow}</span>}
          {r.executor_role&&<span>Executor: {ROLE_LABELS[r.executor_role]}</span>}
          {r.auditor_role&&<span>Auditor: {ROLE_LABELS[r.auditor_role]}</span>}
        </div>
        <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
          {getStepsForRule(r.id).map(s=><span key={s.id} style={{fontSize:11,padding:"3px 10px",borderRadius:12,background:s.is_hr_investigation?"var(--red-bg)":"var(--bg2)",color:s.is_hr_investigation?"var(--red)":"var(--tx2)",fontWeight:500}}>
            {s.occurrence}{s.occurrence===1?"st":s.occurrence===2?"nd":s.occurrence===3?"rd":"th"}: {s.action}
          </span>)}
        </div>
      </div>)}
    </div>)}</div>}

    {tab==="history"&&<div className="card">
      {flags.length===0?<div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No flags in history yet.</p></div>:
      <div className="table-wrap"><table><thead><tr><th>Person</th><th>Behavior</th><th>Occ.</th><th>Status</th><th>Date</th><th>Notes</th></tr></thead><tbody>
        {flags.map(f=>(<tr key={f.id}>
          <td style={{fontWeight:500}}>{f.profiles?.display_name||"—"}</td>
          <td style={{fontSize:13}}>{f.dam_rules?.name||"—"}</td>
          <td>#{f.occurrence_number}</td>
          <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:f.status==="resolved"?"var(--green-bg)":f.status==="dismissed"?"var(--bg2)":"var(--amber-bg)",color:statusColors[f.status]||"var(--tx3)"}}>{f.status}</span></td>
          <td style={{fontSize:12,color:"var(--tx2)"}}>{new Date(f.triggered_at).toLocaleDateString()}</td>
          <td style={{fontSize:12,color:"var(--tx2)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.notes||"—"}</td>
        </tr>))}
      </tbody></table></div>}
    </div>}
    {el}
  </div>);
}

/* ═══ LEADERBOARD ═══ */
function LeaderboardPage({token, profile}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [view, setView] = useState("individual");
  const [expandedRow, setExpandedRow] = useState(null);
  const [search, setSearch] = useState("");
  const {show, el} = useToast();

  useEffect(() => {
    (async () => {
      try {
        const rows = await sb.query("mtd_scores", {
          select: "*",
          filters: "order=month.desc,final_performance.desc",
          token
        });
        setData(rows);
        const uniqueMonths = [...new Set(rows.map(r => r.month))];
        setMonths(uniqueMonths);
        if (uniqueMonths.length > 0 && !selMonth) setSelMonth(uniqueMonths[0]);
      } catch (e) {
        console.error("Leaderboard:", e);
        show("error", "Failed to load leaderboard data");
      }
      setLoading(false);
    })();
  }, [token]);

  const parsePct = (val) => {
    if (!val) return 0;
    const n = parseFloat(String(val).replace("%", "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  };

  const monthData = data.filter(r => r.month === selMonth);
  const filtered = search.trim()
    ? monthData.filter(r => r.qa_email.toLowerCase().includes(search.toLowerCase()))
    : monthData;
  const ranked = [...filtered].sort((a, b) => (b.final_performance || 0) - (a.final_performance || 0));

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const initialsFromEmail = (email) => {
    const name = nameFromEmail(email);
    const parts = name.split(" ");
    return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
  };

  const kpiBreakdown = (row) => [
    { label: "Occupancy", raw: row.occupancy_pct, score: parsePct(row.occupancy_score), weight: 15 },
    { label: "Coaching on-time", raw: row.ontime_coaching_pct, score: parsePct(row.coaching_ontime_score), weight: 10 },
    { label: "Calibration", raw: row.avg_calibration_match_rate, score: parsePct(row.calibration_score), weight: 10 },
    { label: "Coaching observation", raw: row.avg_observation_score_pct, score: parsePct(row.coaching_observation_score), weight: 10 },
    { label: "RTR", raw: row.avg_rtr_score, score: parsePct(row.rtr_score), weight: 10 },
  ];

  const teamData = (() => {
    const tlMap = {};
    ranked.forEach(r => {
      const tl = r.qa_tl || "Unassigned";
      if (!tlMap[tl]) tlMap[tl] = { tl, members: [], totalFP: 0 };
      tlMap[tl].members.push(r);
      tlMap[tl].totalFP += (r.final_performance || 0);
    });
    return Object.values(tlMap).map(t => ({
      ...t,
      avgFP: t.members.length ? (t.totalFP / t.members.length) : 0,
      highest: t.members.length ? Math.max(...t.members.map(m => m.final_performance || 0)) : 0,
      lowest: t.members.length ? Math.min(...t.members.map(m => m.final_performance || 0)) : 0,
      totalDsat: t.members.reduce((a, m) => a + (m.dsat || 0), 0),
    })).sort((a, b) => b.avgFP - a.avgFP);
  })();

  const avgFP = ranked.length ? (ranked.reduce((a, r) => a + (r.final_performance || 0), 0) / ranked.length) : 0;
  const topPerson = ranked[0];
  const totalDsat = ranked.reduce((a, r) => a + (r.dsat || 0), 0);
  const fpColor = (v) => v >= 0.4 ? "var(--green)" : v >= 0.25 ? "var(--amber)" : "var(--red)";
  const fpBg = (v) => v >= 0.4 ? "var(--green-bg)" : v >= 0.25 ? "var(--amber-bg)" : "var(--red-bg)";

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Leaderboard</div>
          <div className="page-subtitle">Performance rankings — {selMonth || "All months"}</div>
        </div>
        <select className="select" value={selMonth} onChange={e => setSelMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? <div className="loading-spinner"><div className="spinner"/></div> : <>

      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
        <div className="tabs">
          <button className={`tab ${view==="individual"?"active":""}`} onClick={()=>setView("individual")}>Individual</button>
          <button className={`tab ${view==="team"?"active":""}`} onClick={()=>setView("team")}>By team lead</button>
        </div>
        {view==="individual" && <input className="input" placeholder="Search by email..." value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:220,marginLeft:"auto"}}/>}
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--accent-light)",color:"var(--accent-text)",fontSize:18}}>🏆</div><div className="stat-label">{view==="individual"?"Ranked":"Teams"}</div><div className="stat-value">{view==="individual"?ranked.length:teamData.length}</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--green-bg)",color:"var(--green)",fontSize:18}}>📊</div><div className="stat-label">Avg performance</div><div className="stat-value" style={{color:fpColor(avgFP)}}>{(avgFP*100).toFixed(1)}%</div></div>
        {topPerson && view==="individual" && <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>⭐</div><div className="stat-label">Top performer</div><div className="stat-value" style={{fontSize:16}}>{nameFromEmail(topPerson.qa_email)}</div></div>}
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--red-bg)",color:"var(--red)",fontSize:18}}>⚠️</div><div className="stat-label">Total DSAT</div><div className="stat-value">{totalDsat}</div></div>
      </div>

      {view==="individual" && <>
        {ranked.length >= 3 && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:16,marginBottom:28,flexWrap:"wrap"}}>
          {[1,0,2].map(idx => {
            const r = ranked[idx]; const rank = idx + 1; const isGold = rank === 1;
            const medals = ["","🥇","🥈","🥉"];
            return (<div key={r.qa_email} className="card" style={{textAlign:"center",padding:isGold?"24px 28px":"18px 22px",minWidth:isGold?180:150,border:isGold?"2px solid var(--amber)":"1px solid var(--bd2)",transform:isGold?"translateY(-8px)":"none",transition:"transform .2s"}}>
              <div style={{fontSize:isGold?28:22,marginBottom:8}}>{medals[rank]}</div>
              <div style={{width:isGold?52:40,height:isGold?52:40,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600,fontSize:isGold?16:13,margin:"0 auto 8px"}}>{initialsFromEmail(r.qa_email)}</div>
              <div style={{fontWeight:600,fontSize:isGold?15:14}}>{nameFromEmail(r.qa_email)}</div>
              <div style={{fontSize:11,color:"var(--tx3)",marginBottom:8}}>{r.qa_email.split("@")[1]}</div>
              <div style={{fontSize:isGold?26:20,fontWeight:700,color:fpColor(r.final_performance)}}>{((r.final_performance||0)*100).toFixed(1)}%</div>
              <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>JKQ: {r.jkq_result||"—"} · Tickets: {r.ticket_per_day}/day</div>
            </div>);
          })}
        </div>}

        <div className="card">
          <div className="card-header"><span className="card-title">Full rankings — {selMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{ranked.length} specialists</span></div>
          {ranked.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {selMonth}. Check that the sheet sync is running.</p></div> :
          <div className="table-wrap"><table><thead><tr><th style={{width:50}}>#</th><th>Specialist</th><th>Team lead</th><th>Occupancy</th><th>Coaching</th><th>Calibration</th><th>RTR</th><th>Performance</th><th style={{width:40}}></th></tr></thead><tbody>
            {ranked.map((r, i) => {
              const rank = i + 1; const isExp = expandedRow === r.id;
              return (<React.Fragment key={r.id}>
                <tr onClick={() => setExpandedRow(isExp ? null : r.id)} style={{cursor:"pointer"}}>
                  <td>{rank <= 3 ? <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:"50%",fontWeight:600,fontSize:12,background:rank===1?"#FEF3C7":rank===2?"#F3F4F6":"#FED7AA",color:rank===1?"#92400E":rank===2?"#374151":"#9A3412"}}>{rank}</span> : <span style={{color:"var(--tx3)",fontWeight:500}}>{rank}</span>}</td>
                  <td><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600}}>{initialsFromEmail(r.qa_email)}</div><div><div style={{fontWeight:500,fontSize:14}}>{nameFromEmail(r.qa_email)}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{r.qa_email}</div></div></div></td>
                  <td style={{fontSize:13,color:"var(--tx2)"}}>{r.qa_tl ? nameFromEmail(r.qa_tl) : "—"}</td>
                  <td style={{fontSize:13}}>{r.occupancy_pct || "—"}</td>
                  <td style={{fontSize:13}}>{r.coaching_ontime_score || "—"}</td>
                  <td style={{fontSize:13}}>{r.calibration_score || "—"}</td>
                  <td style={{fontSize:13}}>{r.rtr_score || "—"}</td>
                  <td><span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:600,background:fpBg(r.final_performance),color:fpColor(r.final_performance)}}>{((r.final_performance||0)*100).toFixed(1)}%</span></td>
                  <td><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
                </tr>
                {isExp && <tr><td colSpan={9} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px 16px 60px"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--tx2)",marginBottom:12,textTransform:"uppercase",letterSpacing:".5px"}}>KPI breakdown</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 24px"}}>
                    {kpiBreakdown(r).map(kpi => (<div key={kpi.label}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:"var(--tx2)"}}>{kpi.label} ({kpi.weight}%)</span><span style={{fontSize:12,fontWeight:600,color:fpColor(kpi.score/15)}}>{kpi.score.toFixed(1)}%</span></div>
                      <div style={{height:5,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${Math.min((kpi.score / kpi.weight) * 100, 100)}%`,height:"100%",borderRadius:3,background:kpi.score >= kpi.weight * 0.7 ? "var(--green)" : kpi.score >= kpi.weight * 0.4 ? "var(--amber)" : "var(--red)",transition:"width .4s ease"}}/></div>
                      {kpi.raw && <div style={{fontSize:11,color:"var(--tx3)",marginTop:2}}>Raw: {kpi.raw}</div>}
                    </div>))}
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:16,paddingTop:12,borderTop:"1px solid var(--bd2)"}}>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Tickets/day: </span><span style={{fontWeight:600}}>{r.ticket_per_day}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>JKQ: </span><span style={{fontWeight:600,color:r.jkq_result==="Pass"?"var(--green)":r.jkq_result==="Missed"?"var(--red)":"var(--tx2)"}}>{r.jkq_result||"—"} {r.jkq_score>0?`(${r.jkq_score})`:""}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>DSAT: </span><span style={{fontWeight:600,color:(r.dsat||0)>20?"var(--red)":"var(--tx)"}}>{r.dsat||0}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>SBS: </span><span style={{fontWeight:600}}>{r.sbs||0}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Working days: </span><span style={{fontWeight:600}}>{r.working_days||0}{r.ramadan_wds ? ` (${r.ramadan_wds} Ramadan)` : ""}</span></div>
                  </div>
                </div></td></tr>}
              </React.Fragment>);
            })}
          </tbody></table></div>}
        </div>
      </>}

      {view==="team" && <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {teamData.length === 0 ? <div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {selMonth}.</p></div></div> :
        teamData.map((team, ti) => {
          const rank = ti + 1; const isGold = rank === 1;
          return (<div key={team.tl} className="card" style={{border:isGold?"2px solid var(--amber)":"1px solid var(--bd2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:isGold?"var(--amber-bg)":"var(--bg2)",color:isGold?"var(--amber)":"var(--tx2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16}}>#{rank}</div>
                <div><div style={{fontWeight:600,fontSize:15}}>{nameFromEmail(team.tl)}</div><div style={{fontSize:12,color:"var(--tx3)"}}>{team.tl} · {team.members.length} member{team.members.length!==1?"s":""}</div></div>
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:700,color:fpColor(team.avgFP)}}>{(team.avgFP*100).toFixed(1)}%</div><div style={{fontSize:11,color:"var(--tx3)"}}>avg performance</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,paddingTop:12,borderTop:"1px solid var(--bd2)",marginBottom:14}}>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Highest</div><div style={{fontSize:16,fontWeight:600,color:"var(--green)"}}>{(team.highest*100).toFixed(1)}%</div></div>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Lowest</div><div style={{fontSize:16,fontWeight:600,color:team.lowest<0.25?"var(--red)":"var(--tx)"}}>{(team.lowest*100).toFixed(1)}%</div></div>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Total DSAT</div><div style={{fontSize:16,fontWeight:600,color:team.totalDsat>50?"var(--red)":"var(--tx)"}}>{team.totalDsat}</div></div>
            </div>
            <div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Members</div>
            {team.members.sort((a,b)=>(b.final_performance||0)-(a.final_performance||0)).map((m,mi) => (
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:mi<team.members.length-1?"1px solid var(--bd2)":"none"}}>
                <span style={{fontSize:12,color:"var(--tx3)",width:20,textAlign:"right"}}>{mi+1}.</span>
                <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>{initialsFromEmail(m.qa_email)}</div>
                <span style={{fontSize:13,flex:1}}>{nameFromEmail(m.qa_email)}</span>
                <span style={{fontSize:13,fontWeight:600,color:fpColor(m.final_performance)}}>{((m.final_performance||0)*100).toFixed(1)}%</span>
              </div>
            ))}
          </div>);
        })}
      </div>}

      </>}
      {el}
    </div>
  );
}

/* ═══ COACHING MODULE ═══ */
function CoachingPage({token, profile}) {
  const [tab, setTab] = useState("compose"); // compose | history
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [roster, setRoster] = useState([]);
  const {show, el} = useToast();

  // Form state
  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [meetingType, setMeetingType] = useState("1:1 Meeting");
  const [topics, setTopics] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [goals, setGoals] = useState("");
  const [actions, setActions] = useState("");
  const [perfRating, setPerfRating] = useState("");
  const [sigName, setSigName] = useState(profile?.display_name || "");
  const [sigTitle, setSigTitle] = useState("QA Lead");

  // Target table state (for AP/PIP reviews)
  const [targetRows, setTargetRows] = useState([{metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);

  // Conclusion state
  const [outcome, setOutcome] = useState("");
  const [nextSteps, setNextSteps] = useState("");

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);

  const MEETING_TYPES = ["1:1 Meeting","Appraisal Review","Coaching Session","Weekly Check-in","Action Plan Review","PIP Review"];
  const MEETING_TYPE_ENUM = {"1:1 Meeting":"weekly_1on1","Appraisal Review":"performance_review","Coaching Session":"ad_hoc","Weekly Check-in":"weekly_1on1","Action Plan Review":"ap_checkin","PIP Review":"pip_checkin"};
  const ENUM_TO_LABEL = {"weekly_1on1":"1:1 Meeting","performance_review":"Appraisal Review","ad_hoc":"Coaching Session","ap_checkin":"Action Plan Review","pip_checkin":"PIP Review","return_from_leave":"Return from Leave"};
  const TARGET_TYPES = ["Action Plan Review","PIP Review"];
  const isTargetType = TARGET_TYPES.includes(meetingType);

  const PERF_OPTIONS = [
    {val:"Needs Attention",emoji:"⚠️",bg:"var(--red-bg)",color:"var(--red)"},
    {val:"Below Expectations",emoji:"📉",bg:"var(--amber-bg)",color:"var(--amber)"},
    {val:"Meets Expectations",emoji:"✅",bg:"var(--green-bg)",color:"var(--green)"},
    {val:"Exceeds Expectations",emoji:"⭐",bg:"var(--accent-light)",color:"var(--accent-text)"},
    {val:"Outstanding",emoji:"🏆",bg:"var(--accent-light)",color:"var(--accent-text)"},
  ];

  const PERF_MESSAGES = {
    "Outstanding":"Your dedication and quality of work have set a commendable standard for the team. This level of performance is highly valued and acknowledged.",
    "Exceeds Expectations":"You have consistently gone beyond the required scope of your responsibilities, demonstrating strong professional commitment.",
    "Meets Expectations":"You are fulfilling your responsibilities in a satisfactory manner and are encouraged to continue building on this foundation.",
    "Below Expectations":"There are areas that require immediate attention and improvement. I am confident in your ability to address these with focus and commitment.",
    "Needs Attention":"I would like us to work closely together to identify the root causes and establish a clear action plan."
  };

  const INTRO_MAP = {
    "1:1 Meeting":"This is a formal summary of our weekly 1:1 meeting.",
    "Appraisal Review":"This is a formal summary of your Appraisal Review session.",
    "Coaching Session":"This is a formal summary of your Coaching Session.",
    "Weekly Check-in":"This is a formal summary of our Weekly Check-in.",
    "Action Plan Review":"This is a formal summary of your Action Plan Review. Please review your weekly targets and progress carefully.",
    "PIP Review":"This is a formal summary of your Performance Improvement Plan (PIP) Review. Please review your weekly targets and progress carefully."
  };

  const TEMPLATES = {
    "1:1 Meeting":{topics:"Weekly performance update\nTeam challenges and support needed\nCareer development discussion",strengths:"Consistent quality of work\nStrong communication with team members",weaknesses:"Time management on complex cases\nEscalation handling",goals:"Improve first response resolution rate\nComplete pending training module",actions:"Share weekly self-assessment by Thursday\nSchedule shadowing session with senior agent"},
    "Coaching Session":{topics:"Calibration score review\nSpecific case analysis\nScoring accuracy discussion",strengths:"Improvement noted in handling complex cases\nGood alignment with quality standards",weaknesses:"Soft skills in resolution communication\nAttribute scoring consistency",goals:"Reach calibration alignment score above 85%\nReduce scoring deviation",actions:"Review 5 calibration cases before next session\nComplete RTR self-practice twice this week"},
    "Weekly Check-in":{topics:"Weekly scorecard review\nCurrent challenges and blockers\nPriorities for the coming week",strengths:"Maintained consistent quality scores\nProactive communication",weaknesses:"Areas needing attention this week",goals:"Hit weekly targets across all KPIs",actions:"Focus on identified weak areas\nFlag any support needs by Wednesday"},
    "Action Plan Review":{topics:"Weekly target progress review\nCalibration score performance\nRTR session completion\nQuality consistency",strengths:"Commitment to improvement plan\nAttendance and engagement in sessions",weaknesses:"Areas where targets were not fully met\nSpecific attribute scoring gaps",goals:"Achieve agreed weekly targets\nImprove calibration alignment score",actions:"Complete weekly RTR sessions as agreed\nAttend all calibration sessions\nSubmit weekly self-review"},
    "PIP Review":{topics:"PIP target progress review\nDetailed performance metrics discussion\nSupport and resources assessment",strengths:"Positive steps taken during PIP period\nEngagement with coaching sessions",weaknesses:"Areas where PIP targets were not met\nRoot causes identified",goals:"Meet all PIP performance targets\nDemonstrate sustained improvement",actions:"Complete all agreed PIP actions\nMeet with HR for formal review\nSubmit weekly progress log"},
    "Appraisal Review":{topics:"Overall performance review for the period\nKey achievements and highlights\nAreas requiring development",strengths:"Demonstrated ownership of quality metrics\nPositive attitude and team collaboration",weaknesses:"Consistency across all ticket categories\nDocumentation quality",goals:"Achieve target KPI scores for next quarter\nComplete mandatory compliance training",actions:"Submit self-appraisal form by end of week\nAgree on development plan for next period"},
  };

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const firstNameFromEmail = (email) => {
    if (!email) return "Team Member";
    const f = email.split("@")[0].split(/[.\-_]/)[0];
    return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
  };

  const fmtDate = (s) => {
    if (!s) return "";
    try { return new Date(s+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"}); }
    catch { return s; }
  };

  // Load roster + history
  useEffect(() => {
    (async () => {
      try {
        const [r, s] = await Promise.all([
          sb.query("qa_roster", {select:"email,display_name,manager_email,queue",token}).catch(()=>[]),
          sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch(()=>[]),
        ]);
        setRoster(r);
        setSessions(s);
      } catch (e) { console.error("Coaching load:", e); }
    })();
  }, [token]);

  // Get previous sessions for selected member
  const memberHistory = sessions.filter(s => s.member_email?.toLowerCase() === toEmail.toLowerCase()).slice(0, 5);

  // Apply template
  const applyTemplate = () => {
    const t = TEMPLATES[meetingType];
    if (!t) return;
    if (!topics) setTopics(t.topics || "");
    if (!strengths) setStrengths(t.strengths || "");
    if (!weaknesses) setWeaknesses(t.weaknesses || "");
    if (!goals) setGoals(t.goals || "");
    if (!actions) setActions(t.actions || "");
    show("success", "Template applied");
  };

  // Target row helpers
  const addTargetRow = () => setTargetRows([...targetRows, {metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
  const removeTargetRow = (i) => setTargetRows(targetRows.filter((_,idx) => idx !== i));
  const updateTarget = (i, key, val) => {
    const rows = [...targetRows];
    rows[i] = {...rows[i], [key]: val};
    setTargetRows(rows);
  };

  const calcEom = (vals) => {
    const nums = vals.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    return nums.length ? Math.round(nums.reduce((a,b) => a+b, 0) / nums.length) : null;
  };

  const calcDiff = (target, actual) => {
    const t = parseFloat(target), a = parseFloat(actual);
    if (isNaN(t) || isNaN(a) || !actual) return null;
    return Math.round((a - t) * 10) / 10;
  };

  // Serialize target rows
  const serializeTargets = () => targetRows.filter(r => r.metric.trim()).map(r => [r.metric,r.start,r.w1,r.w2,r.w3,r.w4,r.a1,r.a2,r.a3,r.a4].join("|")).join(";;");

  // Build email HTML
  const buildEmailBody = () => {
    const fn = firstNameFromEmail(toEmail);
    const isConclusion = isTargetType && outcome;
    const planName = meetingType === "PIP Review" ? "Performance Improvement Plan" : "Action Plan";
    let html = "";

    // Greeting
    html += `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;max-width:680px;">`;
    html += `<p style="margin:0 0 16px;"><span style="background:#E8F5E8;color:#1A3D2B;padding:5px 16px;border-radius:20px;font-weight:700;font-size:12px;letter-spacing:.03em;">${meetingType}</span></p>`;
    html += `<p style="margin:0 0 16px;">Dear ${fn},</p>`;

    // Conclusion or intro
    if (isConclusion && outcome === "pass") {
      html += `<p style="margin:0 0 20px;">I am pleased to formally confirm that you have successfully completed your ${planName}. Your commitment, consistency, and improvement throughout this period have been genuinely noted and are greatly appreciated. This concludes the formal ${planName} process, and your performance will continue to be monitored through our regular 1:1 sessions.</p>`;
    } else if (isConclusion && outcome === "fail") {
      html += `<p style="margin:0 0 12px;">Following a full review of your ${planName}, I regret to formally notify you that the required performance targets were not met within the agreed timeframe. This outcome has been documented and will be shared with the relevant stakeholders, including Human Resources.</p>`;
      if (nextSteps) html += `<p style="margin:0 0 6px;font-weight:700;">Agreed Next Steps:</p><p style="margin:0 0 20px;">${nextSteps.replace(/\n/g,"<br>")}</p>`;
    } else {
      html += `<p style="margin:0 0 20px;">${INTRO_MAP[meetingType] || "This is a formal summary of our session."}</p>`;
    }

    const mkList = (text) => {
      if (!text?.trim()) return "";
      return `<ul style="margin:8px 0;padding-left:22px;">${text.split("\n").filter(l=>l.trim()).map(l => `<li style="margin-bottom:6px;">${l.replace(/^[-•]\s*/,"").trim()}</li>`).join("")}</ul>`;
    };
    const mkSection = (title, body) => `<div style="margin-top:24px;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1A3D2B;border-bottom:1px solid #E8F5E8;padding-bottom:4px;">${title}</p>${body}</div>`;

    if (topics?.trim()) html += mkSection("Topics Discussed", mkList(topics));

    if (perfRating) {
      const pillStyles = {"Outstanding":"background:#C5F5C5;color:#1A3D2B;","Exceeds Expectations":"background:#A0E8A0;color:#1A3D2B;","Meets Expectations":"background:#E8F5E8;color:#2A5A2A;","Below Expectations":"background:#FEF9F0;color:#854F0B;","Needs Attention":"background:#FCEBEB;color:#A32D2D;"};
      html += mkSection("Overall Performance Rating", `<p style="margin:8px 0 6px;"><span style="${pillStyles[perfRating]||""}padding:4px 16px;border-radius:20px;font-weight:700;font-size:13px;">${perfRating}</span></p><p style="margin:0 0 4px;">${PERF_MESSAGES[perfRating]||""}</p>`);
    }

    if (strengths?.trim()) html += mkSection("Strengths & Recognized Contributions", mkList(strengths));
    if (weaknesses?.trim()) html += mkSection("Areas for Development", mkList(weaknesses));
    if (goals?.trim()) html += mkSection("Goals & Progress Update", mkList(goals));
    if (actions?.trim()) html += mkSection("Action Items & Agreed Next Steps", mkList(actions));

    // Target table
    if (isTargetType && targetRows.some(r => r.metric.trim())) {
      const s = "padding:9px 11px;font-size:13px;text-align:center;border:1px solid #C8E8C8;";
      html += `<div style="margin-top:24px;"><p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#1A3D2B;">Weekly QA Review — Score Tracking</p>`;
      html += `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">`;
      html += `<tr>${["Metric","Row","Start","W1","W2","W3","W4","EOM"].map((c,i) => `<th style="${s}font-weight:700;color:#C5F5C5;background:#1A3D2B;${i<=1?"text-align:left;":""}">${c}</th>`).join("")}</tr>`;

      targetRows.filter(r => r.metric.trim()).forEach((r, ri) => {
        const bg = ri % 2 === 0 ? "#fff" : "#F0FCF0";
        const tEom = calcEom([r.w1,r.w2,r.w3,r.w4]);
        const aEom = calcEom([r.a1,r.a2,r.a3,r.a4]);
        // Target row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:700;" rowspan="3">${r.metric}</td>`;
        html += `<td style="${s}text-align:left;font-weight:600;background:#E8F5E8;color:#1A3D2B;font-size:10px;">Target</td>`;
        html += `<td style="${s}">${r.start ? r.start+"%" : "--"}</td>`;
        ["w1","w2","w3","w4"].forEach(k => { html += `<td style="${s}">${r[k] ? r[k]+"%" : "--"}</td>`; });
        html += `<td style="${s}background:#C5F5C5;color:#1A3D2B;font-weight:700;">${tEom !== null ? tEom+"%" : "--"}</td></tr>`;
        // Actual row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:600;background:#FEF9F0;color:#854F0B;font-size:10px;">Actual</td>`;
        html += `<td style="${s}color:#aaa;">--</td>`;
        ["a1","a2","a3","a4"].forEach(k => { html += `<td style="${s}">${r[k] ? r[k]+"%" : "--"}</td>`; });
        const eAbg = aEom !== null && tEom !== null ? (aEom >= tEom ? "#E0F8E0" : "#FCEBEB") : "#FEF9F0";
        const eAc = aEom !== null && tEom !== null ? (aEom >= tEom ? "#1A6B2A" : "#A32D2D") : "#854F0B";
        html += `<td style="${s}background:${eAbg};color:${eAc};font-weight:700;">${aEom !== null ? aEom+"%" : "--"}</td></tr>`;
        // Diff row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:600;background:#F5F5F5;color:#555;font-size:10px;">Difference</td>`;
        html += `<td style="${s}color:#aaa;">--</td>`;
        ["w1","w2","w3","w4"].forEach((wk,i) => {
          const d = calcDiff(r[wk], r["a"+(i+1)]);
          if (d !== null) {
            const dc = d > 0 ? "#1A6B2A" : d < 0 ? "#A32D2D" : "#555";
            const dbg = d > 0 ? "#E0F8E0" : d < 0 ? "#FCEBEB" : "#F5F5F5";
            html += `<td style="${s}background:${dbg};color:${dc};font-weight:700;">${d > 0 ? "+" : ""}${d}%</td>`;
          } else html += `<td style="${s}color:#ccc;">--</td>`;
        });
        // EOM diff
        if (aEom !== null && tEom !== null) {
          const ed = Math.round((aEom - tEom) * 10) / 10;
          const ec = ed > 0 ? "#1A6B2A" : ed < 0 ? "#A32D2D" : "#555";
          const eb = ed > 0 ? "#E0F8E0" : ed < 0 ? "#FCEBEB" : "#F5F5F5";
          html += `<td style="${s}background:${eb};color:${ec};font-weight:700;">${ed > 0 ? "+" : ""}${ed}%</td></tr>`;
        } else html += `<td style="${s}color:#ccc;">--</td></tr>`;
      });
      html += `</table></div>`;
    }

    // Closing
    html += `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #E8F5E8;">`;
    html += `<p style="margin:0 0 10px;">Should you have any questions, please do not hesitate to reach out.</p>`;
    html += `<p style="margin:0 0 16px;">I appreciate your continued commitment and professionalism.</p>`;
    html += `<p style="margin:0;">Best regards,<br><strong>${sigName || "QA Leader"}</strong><br>${sigTitle || "QA Lead"} | Tabby</p>`;
    html += `</div></div>`;
    return html;
  };

  const emailSubject = `Session Summary: ${meetingType} - ${fmtDate(sessionDate)}`;

  // Build plain text version for Gmail compose URL
  const buildPlainText = () => {
    const fn = firstNameFromEmail(toEmail);
    const isConclusion = isTargetType && outcome;
    const planName = meetingType === "PIP Review" ? "Performance Improvement Plan" : "Action Plan";
    const bullet = (text) => text ? text.split("\n").filter(l=>l.trim()).map(l => " - " + l.replace(/^[-•]\s*/,"").trim()).join("\n") : "";
    let lines = [];

    lines.push(`[${meetingType}]`);
    lines.push("");
    lines.push(`Dear ${fn},`);
    lines.push("");

    if (isConclusion && outcome === "pass") {
      lines.push(`I am pleased to formally confirm that you have successfully completed your ${planName}. Your commitment, consistency, and improvement throughout this period have been genuinely noted and are greatly appreciated. This concludes the formal ${planName} process.`);
    } else if (isConclusion && outcome === "fail") {
      lines.push(`Following a full review of your ${planName}, I regret to formally notify you that the required performance targets were not met within the agreed timeframe. This outcome has been documented and will be shared with the relevant stakeholders, including Human Resources.`);
      if (nextSteps) { lines.push(""); lines.push("Agreed Next Steps:"); lines.push(nextSteps); }
    } else {
      lines.push(INTRO_MAP[meetingType] || "This is a formal summary of our session.");
    }
    lines.push("");

    if (topics?.trim()) { lines.push("TOPICS DISCUSSED"); lines.push(bullet(topics)); lines.push(""); }
    if (perfRating) { lines.push("OVERALL PERFORMANCE RATING"); lines.push(` - ${perfRating}`); lines.push(` ${PERF_MESSAGES[perfRating]||""}`); lines.push(""); }
    if (strengths?.trim()) { lines.push("STRENGTHS & RECOGNIZED CONTRIBUTIONS"); lines.push(bullet(strengths)); lines.push(""); }
    if (weaknesses?.trim()) { lines.push("AREAS FOR DEVELOPMENT"); lines.push(bullet(weaknesses)); lines.push(""); }
    if (goals?.trim()) { lines.push("GOALS & PROGRESS UPDATE"); lines.push(bullet(goals)); lines.push(""); }
    if (actions?.trim()) { lines.push("ACTION ITEMS & AGREED NEXT STEPS"); lines.push(bullet(actions)); lines.push(""); }

    if (isTargetType && targetRows.some(r => r.metric.trim())) {
      lines.push("WEEKLY QA REVIEW — SCORE TRACKING");
      lines.push("");
      targetRows.filter(r => r.metric.trim()).forEach(r => {
        lines.push(`  ${r.metric}`);
        lines.push(`  Target: Start=${r.start||"--"}% W1=${r.w1||"--"}% W2=${r.w2||"--"}% W3=${r.w3||"--"}% W4=${r.w4||"--"}%`);
        lines.push(`  Actual: W1=${r.a1||"--"} W2=${r.a2||"--"} W3=${r.a3||"--"} W4=${r.a4||"--"}`);
        lines.push("");
      });
    }

    lines.push("---");
    lines.push("Should you have any questions, please do not hesitate to reach out.");
    lines.push("I appreciate your continued commitment and professionalism.");
    lines.push("");
    lines.push("Best regards,");
    lines.push(`${sigName || "QA Leader"}`);
    lines.push(`${sigTitle || "QA Lead"} | Tabby`);

    return lines.join("\n");
  };

  // Save session and send via Apps Script
  const APPS_SCRIPT_URL = "https://script.google.com/a/macros/tabby.sa/s/AKfycbwF9PtLxBMtCObQwWDPJg9aTueCCRbSd-jvVLjwMcKvGgoiCyeTJlg9oNkPEsNbhcs/exec";

  const generateAndSend = async () => {
    if (!toEmail) { show("error", "Enter the team member's email"); return; }
    setLoading(true);
    try {
      // Save to Supabase
      await sb.query("coaching_sessions", {
        token, method: "POST",
        body: {
          sender_email: profile?.email || "",
          member_email: toEmail,
          cc_email: ccEmail,
          session_date: sessionDate,
          meeting_type: MEETING_TYPE_ENUM[meetingType] || "ad_hoc",
          topics, strengths, weaknesses, goals,
          action_items: actions,
          performance_rating: perfRating,
          target_data: isTargetType ? serializeTargets() : null,
          follow_up: false,
          outcome: outcome || null,
          next_steps: nextSteps || null,
          sig_name: sigName,
          sig_title: sigTitle,
          email_subject: emailSubject,
        }
      });

      // Send formatted HTML email via Apps Script
      const params = new URLSearchParams({
        action: "sendAndLog",
        to: toEmail,
        cc: ccEmail,
        replyTo: profile?.email || "",
        subject: emailSubject,
        senderEmail: profile?.email || "",
        memberEmail: toEmail,
        sessionDate: sessionDate,
        meetingType: meetingType,
        topics: topics,
        strengths: strengths,
        weaknesses: weaknesses,
        goals: goals,
        actions: actions,
        performance: perfRating,
        sigName: sigName,
        sigTitle: sigTitle,
        targetRows: isTargetType ? serializeTargets() : "",
        followUp: "false",
        threadId: "",
        conclude: outcome ? "true" : "false",
        outcome: outcome || "",
        nextSteps: nextSteps || "",
      });

      const scriptResp = await fetch(APPS_SCRIPT_URL + "?" + params.toString());
      const scriptData = await scriptResp.json();

      if (scriptData.status !== "success") {
        throw new Error(scriptData.message || "Apps Script error");
      }

      // Refresh history
      const s = await sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch(()=>[]);
      setSessions(s);
      show("success", "Email sent and session logged successfully!");
      setShowPreview(false);
    } catch (e) {
      show("error", e.message);
    }
    setLoading(false);
  };

  // Clear form
  const clearForm = () => {
    setToEmail("");setCcEmail("");setSessionDate(new Date().toISOString().split("T")[0]);
    setMeetingType("1:1 Meeting");setTopics("");setStrengths("");setWeaknesses("");
    setGoals("");setActions("");setPerfRating("");setOutcome("");setNextSteps("");
    setTargetRows([{metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
    setShowPreview(false);
  };

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><div className="page-title">Coaching sessions</div><div className="page-subtitle">1:1 coaching email generator — {sessions.length} sessions logged</div></div>
      </div>

      <div className="tab-bar" style={{marginBottom:16}}>
        <button className={`tab-btn ${tab==="compose"?"active":""}`} onClick={()=>setTab("compose")}><Icon d={icons.coaching} size={16}/>Compose</button>
        <button className={`tab-btn ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}><Icon d={icons.scores} size={16}/>History ({sessions.length})</button>
      </div>

      {/* ═══ COMPOSE TAB ═══ */}
      {tab==="compose" && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* LEFT — Form */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Signature block */}
          <div className="card">
            <div className="card-header"><span className="card-title">Your signature</span></div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Full name</label><input className="form-input" value={sigName} onChange={e=>setSigName(e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={sigTitle} onChange={e=>setSigTitle(e.target.value)}/></div>
            </div>
          </div>

          {/* Session details */}
          <div className="card">
            <div className="card-header"><span className="card-title">Session details</span></div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Team member email (To)</label>
                <select className="select form-input" value={toEmail} onChange={e=>setToEmail(e.target.value)}>
                  <option value="">— Select —</option>
                  {roster.map(r => <option key={r.email} value={r.email}>{r.display_name || nameFromEmail(r.email)} ({r.email})</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Manager email (CC)</label>
                {toEmail && roster.find(r=>r.email===toEmail)?.manager_email ? (
                  <input className="form-input" value={ccEmail || roster.find(r=>r.email===toEmail)?.manager_email || ""} onChange={e=>setCcEmail(e.target.value)} onFocus={()=>{if(!ccEmail){const m=roster.find(r=>r.email===toEmail)?.manager_email;if(m)setCcEmail(m);}}}/>
                ) : <input className="form-input" value={ccEmail} onChange={e=>setCcEmail(e.target.value)} placeholder="manager@tabby.ai"/>}
              </div>
              <div className="form-group"><label className="form-label">Session date</label><input type="date" className="form-input" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Meeting type</label>
                <select className="select form-input" value={meetingType} onChange={e=>setMeetingType(e.target.value)}>
                  {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Previous sessions for this member */}
            {toEmail && memberHistory.length > 0 && <div style={{marginTop:16,padding:"12px 14px",background:"var(--bg)",borderRadius:8}}>
              <div style={{fontSize:12,fontWeight:600,color:"var(--tx2)",marginBottom:8}}>Previous sessions ({memberHistory.length})</div>
              {memberHistory.map(s => (
                <div key={s.id} style={{fontSize:12,padding:"4px 0",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between"}}>
                  <span>{new Date(s.session_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"})}</span>
                  <span style={{padding:"1px 8px",borderRadius:10,fontSize:10,fontWeight:600,background:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red-bg)":"var(--green-bg)",color:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red)":"var(--green)"}}>{ENUM_TO_LABEL[s.meeting_type]||s.meeting_type}</span>
                  {s.performance_rating && <span style={{color:"var(--tx2)"}}>{s.performance_rating}</span>}
                </div>
              ))}
            </div>}
          </div>

          {/* Template bar */}
          {TEMPLATES[meetingType] && <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"var(--accent-light)",borderRadius:8,fontSize:13}}>
            <span style={{color:"var(--accent-text)",fontWeight:500}}>Template available for {meetingType}</span>
            <button className="btn btn-outline btn-sm" onClick={applyTemplate}>Apply template</button>
          </div>}

          {/* Content fields */}
          <div className="card">
            <div className="card-header"><span className="card-title">Session content</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[["topics","Topics discussed",topics,setTopics],["strengths","Strengths observed",strengths,setStrengths],["weaknesses","Areas for improvement",weaknesses,setWeaknesses],["goals","Goals & progress update",goals,setGoals],["actions","Action items / next steps",actions,setActions]].map(([id,label,val,setter]) => (
                <div className="form-group" key={id}><label className="form-label">{label}</label>
                  <textarea className="form-input" rows={3} value={val} onChange={e=>setter(e.target.value)} placeholder="One point per line" style={{resize:"vertical"}}/>
                  <div style={{fontSize:10,color:val.length>1800?"var(--red)":"var(--tx3)",textAlign:"right"}}>{val.length} / 2000</div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance rating */}
          <div className="card">
            <div className="card-header"><span className="card-title">Performance rating</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5, 1fr)",gap:6}}>
              {PERF_OPTIONS.map(p => (
                <button key={p.val} onClick={()=>setPerfRating(perfRating===p.val?"":p.val)} style={{
                  padding:"12px 4px",border:perfRating===p.val?`2px solid ${p.color}`:"1.5px solid var(--bd)",
                  borderRadius:8,background:perfRating===p.val?p.bg:"var(--bg)",cursor:"pointer",textAlign:"center",
                  fontSize:11,fontWeight:perfRating===p.val?700:500,color:perfRating===p.val?p.color:"var(--tx2)",
                  fontFamily:"var(--font)",transition:"all .15s",lineHeight:1.3
                }}>
                  <div style={{fontSize:18,marginBottom:4}}>{p.emoji}</div>{p.val}
                </button>
              ))}
            </div>
          </div>

          {/* Target table (AP/PIP only) */}
          {isTargetType && <div className="card" style={{border:"1.5px solid var(--red)",borderColor:"var(--red)"}}>
            <div className="card-header"><span className="card-title" style={{color:"var(--red)"}}>Weekly QA Review — Score Tracking</span>
              <button className="btn btn-outline btn-sm" onClick={addTargetRow}><Icon d={icons.plus} size={14}/>Add metric</button>
            </div>
            <div className="table-wrap">
              <table style={{fontSize:12}}>
                <thead><tr>
                  <th>Metric</th><th>Row</th><th>Start</th><th>W1</th><th>W2</th><th>W3</th><th>W4</th><th>EOM</th><th style={{width:30}}></th>
                </tr></thead>
                <tbody>
                  {targetRows.map((r, ri) => {
                    const tEom = calcEom([r.w1,r.w2,r.w3,r.w4]);
                    const aEom = calcEom([r.a1,r.a2,r.a3,r.a4]);
                    return (<React.Fragment key={ri}>
                      {/* Target row */}
                      <tr style={{background:ri%2===0?"#fff":"var(--bg)"}}>
                        <td rowSpan={3} style={{fontWeight:600,fontSize:12,verticalAlign:"middle",minWidth:100}}>
                          <input className="form-input" value={r.metric} onChange={e=>updateTarget(ri,"metric",e.target.value)} placeholder="Metric name" style={{padding:"4px 6px",fontSize:12,fontWeight:600,border:"none",background:"transparent"}}/>
                        </td>
                        <td style={{fontSize:10,fontWeight:600,background:"var(--green-bg)",color:"var(--green)",padding:"2px 6px"}}>Target</td>
                        <td><input className="form-input" type="number" value={r.start} onChange={e=>updateTarget(ri,"start",e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent"}}/></td>
                        {["w1","w2","w3","w4"].map(k => <td key={k}><input className="form-input" type="number" value={r[k]} onChange={e=>updateTarget(ri,k,e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent"}}/></td>)}
                        <td style={{fontWeight:700,textAlign:"center",background:"var(--green-bg)",color:"var(--green)",fontSize:12}}>{tEom !== null ? tEom+"%" : "—"}</td>
                        <td rowSpan={3} style={{textAlign:"center",verticalAlign:"middle"}}>
                          <button onClick={()=>removeTargetRow(ri)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:14,padding:2}}>✕</button>
                        </td>
                      </tr>
                      {/* Actual row */}
                      <tr style={{background:ri%2===0?"#fff":"var(--bg)"}}>
                        <td style={{fontSize:10,fontWeight:600,background:"var(--amber-bg)",color:"var(--amber)",padding:"2px 6px"}}>Actual</td>
                        <td style={{color:"var(--tx3)",textAlign:"center",fontSize:11}}>—</td>
                        {["a1","a2","a3","a4"].map(k => <td key={k}><input className="form-input" type="number" value={r[k]} onChange={e=>updateTarget(ri,k,e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent"}}/></td>)}
                        <td style={{fontWeight:700,textAlign:"center",fontSize:12,
                          background:aEom!==null&&tEom!==null?(aEom>=tEom?"var(--green-bg)":"var(--red-bg)"):"var(--amber-bg)",
                          color:aEom!==null&&tEom!==null?(aEom>=tEom?"var(--green)":"var(--red)"):"var(--amber)"
                        }}>{aEom !== null ? aEom+"%" : "—"}</td>
                      </tr>
                      {/* Diff row */}
                      <tr style={{background:ri%2===0?"#fff":"var(--bg)"}}>
                        <td style={{fontSize:10,fontWeight:600,background:"var(--bg2)",color:"var(--tx3)",padding:"2px 6px"}}>Diff</td>
                        <td style={{color:"var(--tx3)",textAlign:"center",fontSize:11}}>—</td>
                        {["w1","w2","w3","w4"].map((wk,wi) => {
                          const d = calcDiff(r[wk], r["a"+(wi+1)]);
                          return <td key={wk} style={{textAlign:"center",fontSize:12,fontWeight:d!==null?700:400,
                            color:d!==null?(d>0?"var(--green)":d<0?"var(--red)":"var(--tx3)"):"var(--tx3)",
                            background:d!==null?(d>0?"var(--green-bg)":d<0?"var(--red-bg)":"var(--bg2)"):"transparent"
                          }}>{d !== null ? (d>0?"+":"")+d+"%" : "—"}</td>;
                        })}
                        {(() => {
                          if (aEom !== null && tEom !== null) {
                            const ed = Math.round((aEom - tEom) * 10) / 10;
                            return <td style={{textAlign:"center",fontSize:12,fontWeight:700,
                              color:ed>0?"var(--green)":ed<0?"var(--red)":"var(--tx3)",
                              background:ed>0?"var(--green-bg)":ed<0?"var(--red-bg)":"var(--bg2)"
                            }}>{ed>0?"+":""}{ed}%</td>;
                          }
                          return <td style={{textAlign:"center",color:"var(--tx3)"}}>—</td>;
                        })()}
                      </tr>
                    </React.Fragment>);
                  })}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:10,color:"var(--red)",marginTop:6,fontStyle:"italic"}}>EOM = average of filled weekly values. Difference = Actual minus Target.</div>

            {/* Conclusion */}
            <div style={{marginTop:16,padding:"14px",background:"var(--bg)",borderRadius:8,border:"1px solid var(--bd2)"}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--tx2)",marginBottom:10}}>Conclude {meetingType === "PIP Review" ? "PIP" : "Action Plan"}</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <button onClick={()=>setOutcome(outcome==="pass"?"":"pass")} className={`btn ${outcome==="pass"?"btn-primary":"btn-outline"}`} style={outcome==="pass"?{background:"var(--green)",color:"#fff"}:{}}>✅ Passed</button>
                <button onClick={()=>setOutcome(outcome==="fail"?"":"fail")} className={`btn ${outcome==="fail"?"btn-primary":"btn-outline"}`} style={outcome==="fail"?{background:"var(--red)",color:"#fff"}:{}}>❌ Did Not Pass</button>
              </div>
              {outcome==="fail" && <div className="form-group" style={{marginTop:8}}>
                <label className="form-label">Agreed next steps / consequence</label>
                <textarea className="form-input" rows={2} value={nextSteps} onChange={e=>setNextSteps(e.target.value)} placeholder="Describe the formal next steps..." style={{resize:"vertical"}}/>
                <div style={{marginTop:8,padding:"8px 12px",background:"var(--red-bg)",borderRadius:6,fontSize:12,color:"var(--red)",fontWeight:500}}>⚠️ Please add HR to the CC field before sending.</div>
              </div>}
            </div>
          </div>}

          {/* Action buttons */}
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" onClick={()=>setShowPreview(true)} style={{flex:1}}><Icon d={icons.check} size={16}/>Preview email</button>
            <button className="btn btn-outline" onClick={clearForm}>Clear all</button>
          </div>
        </div>

        {/* RIGHT — Preview */}
        <div>
          <div className="card" style={{position:"sticky",top:20}}>
            <div className="card-header"><span className="card-title">Email preview</span>
              <span style={{fontSize:12,color:"var(--tx3)"}}>{showPreview ? "Ready to send" : "Waiting for input"}</span>
            </div>
            {!showPreview ? (
              <div className="placeholder" style={{padding:"60px 20px"}}>
                <div className="placeholder-icon"><Icon d={icons.coaching} size={28}/></div>
                <p style={{color:"var(--tx3)"}}>Fill in the session details, then click<br/><strong>Preview Email</strong></p>
              </div>
            ) : (<div>
              <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>TO:</span> {toEmail}</div>
              {ccEmail && <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>CC:</span> {ccEmail}</div>}
              <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>FROM:</span> {profile?.email}</div>
              <div style={{fontWeight:700,fontSize:15,padding:"12px 0",borderTop:"1px solid var(--bd2)",borderBottom:"1px solid var(--bd2)",margin:"10px 0 14px"}}>{emailSubject}</div>
              <div style={{fontSize:13,lineHeight:1.85,maxHeight:500,overflowY:"auto"}} dangerouslySetInnerHTML={{__html: buildEmailBody()}}/>

              <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--bd2)"}}>
                <button className="btn btn-primary" onClick={generateAndSend} disabled={loading} style={{width:"100%",justifyContent:"center",padding:"12px"}}>
                  {loading ? "Sending..." : <><Icon d={icons.coaching} size={16}/>Send email & log session</>}
                </button>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>{
                    const body = buildEmailBody();
                    navigator.clipboard.writeText("Subject: "+emailSubject+"\n\n"+document.createElement("div").innerHTML);
                    show("success","Copied to clipboard");
                  }}>Copy text</button>
                  <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>setShowPreview(false)}>Edit</button>
                </div>
              </div>
            </div>)}
          </div>
        </div>
      </div>}

      {/* ═══ HISTORY TAB ═══ */}
      {tab==="history" && <div className="card">
        {sessions.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No coaching sessions logged yet.</p></div> :
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Type</th><th>Member</th><th>Sent by</th><th>Performance</th><th>Outcome</th></tr></thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id} onClick={()=>setExpandedSession(expandedSession===s.id?null:s.id)} style={{cursor:"pointer"}}>
                <td style={{fontSize:13,whiteSpace:"nowrap"}}>{new Date(s.session_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"})}</td>
                <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red-bg)":"var(--green-bg)",color:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red)":"var(--green)"}}>{ENUM_TO_LABEL[s.meeting_type]||s.meeting_type}</span></td>
                <td style={{fontWeight:500}}>{nameFromEmail(s.member_email)}</td>
                <td style={{fontSize:13,color:"var(--tx2)"}}>{nameFromEmail(s.sender_email)}</td>
                <td>{s.performance_rating ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,
                  background:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green-bg)":s.performance_rating==="Meets Expectations"?"var(--accent-light)":"var(--amber-bg)",
                  color:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green)":s.performance_rating==="Meets Expectations"?"var(--accent-text)":"var(--amber)"
                }}>{s.performance_rating}</span> : "—"}</td>
                <td>{s.outcome ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:600,
                  background:s.outcome==="pass"?"var(--green-bg)":"var(--red-bg)",
                  color:s.outcome==="pass"?"var(--green)":"var(--red)"
                }}>{s.outcome==="pass"?"Passed":"Failed"}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></div>}
      </div>}

      {el}
    </div>
  );
}


function PlaceholderPage({title,description,icon,minRole,userRole}){const locked=minRole&&!hasRole(userRole,minRole);
  return(<div className="page"><div className="page-header"><div className="page-title">{title}</div></div><div className="card"><div className="placeholder"><div className="placeholder-icon"><Icon d={icon} size={28}/></div><h3>{title}</h3><p>{locked?`Requires ${ROLE_LABELS[minRole]} access or above.`:description}</p><div className="placeholder-badge">{locked?"Access restricted":"Coming soon"}</div></div></div></div>);}

const NAV_ITEMS=[
  {key:"dashboard",label:"Dashboard",icon:icons.dashboard,section:"Overview"},
  {key:"leaderboard",label:"Leaderboard",icon:icons.leaderboard},
  {key:"scores",label:"Score entry",icon:icons.scores,section:"Performance"},
  {key:"dam",label:"DAM flags",icon:icons.dam,minRole:"qa_lead"},
  {key:"plans",label:"AP / PIP",icon:icons.plan,minRole:"qa_lead"},
  {key:"coaching",label:"Coaching",icon:icons.coaching,minRole:"qa_lead",section:"Management"},
  {key:"hr",label:"HR cases",icon:icons.hr,minRole:"qa_supervisor"},
  {key:"escalations",label:"Escalations",icon:icons.escalation},
  {key:"admin",label:"Admin panel",icon:icons.settings,minRole:"admin",section:"System"},
];

/* ═══ APP ═══ */
export default function App(){
  const[session,setSession]=useState(null);const[profile,setProfile]=useState(null);const[loading,setLoading]=useState(true);const[page,setPage]=useState("dashboard");const[sidebarOpen,setSidebarOpen]=useState(false);
  useEffect(()=>{const handler=(e)=>setPage(e.detail);window.addEventListener("navigate",handler);return()=>window.removeEventListener("navigate",handler);},[]);
  useEffect(()=>{(async()=>{let s=await sb.auth.handleCallback();if(!s)s=await sb.auth.getSession();if(s){setSession(s);try{const p=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,team_id,status",filters:`id=eq.${s.user?.id}`,token:s.access_token});if(p.length>0)setProfile(p[0]);}catch(e){console.error("Profile:",e);}}setLoading(false);})();},[]);
  if(loading)return<div className="loading-fullscreen"><div className="spinner"/><p style={{marginTop:16,color:"var(--tx2)",fontSize:14}}>Loading portal...</p></div>;
  if(!session)return(<div className="login-page"><div className="login-card"><div style={{marginBottom:8}}><TabbyLogo size={28}/></div><div className="login-subtitle">Quality Assurance Performance Portal<br/>Sign in with your Tabby Google account.</div><button className="login-btn" onClick={()=>sb.auth.signInWithGoogle()}><GoogleLogo/>Sign in with Google</button><div className="login-divider">Supported domains</div><div className="login-domains"><span className="login-domain">@tabby.ai</span><span className="login-domain">@tabby.sa</span></div><div className="login-footer">Internal tool &middot; Tabby QA Assurance</div></div></div>);
  const userRole=profile?.role||"qa";const visibleNav=NAV_ITEMS.filter(n=>!n.minRole||hasRole(userRole,n.minRole)||n.key==="escalations");let curSec=null;
  const renderPage=()=>{const t=session.access_token;switch(page){
    case"dashboard":return<DashboardPage profile={profile} token={t}/>;
    case"scores":return<ScoreEntryPage token={t} profile={profile}/>;
    case"admin":return hasRole(userRole,"admin")?<AdminPage token={t} profile={profile}/>:<PlaceholderPage title="Admin panel" icon={icons.settings} minRole="admin" userRole={userRole}/>;
    case"leaderboard":return<LeaderboardPage token={t} profile={profile}/>;
    case"dam":return hasRole(userRole,"qa_lead")?<DAMPage token={t} profile={profile}/>:<PlaceholderPage title="DAM flags" icon={icons.dam} minRole="qa_lead" userRole={userRole}/>;
    case"plans":return<PlaceholderPage title="Action plans & PIPs" description="Performance improvement plans." icon={icons.plan} minRole="qa_lead" userRole={userRole}/>;
    case"coaching":return hasRole(userRole,"qa_lead")?<CoachingPage token={t} profile={profile}/>:<PlaceholderPage title="Coaching sessions" icon={icons.coaching} minRole="qa_lead" userRole={userRole}/>;
    case"hr":return<PlaceholderPage title="HR cases" description="Disciplinary case tracking." icon={icons.hr} minRole="qa_supervisor" userRole={userRole}/>;
    case"escalations":return<PlaceholderPage title="Escalations" description="Flag concerns about leadership." icon={icons.escalation} userRole={userRole}/>;
    default:return<DashboardPage profile={profile} token={t}/>;
  }};
  return(<div className="app-layout">
    <div className={`mobile-overlay ${sidebarOpen?"open":""}`} onClick={()=>setSidebarOpen(false)}/>
    <aside className={`sidebar ${sidebarOpen?"open":""}`}>
      <div className="sidebar-header"><div className="sidebar-brand">tabby<span>QA</span> <span className="sidebar-tag">PORTAL</span></div></div>
      <nav className="sidebar-nav">{visibleNav.map(item=>{let sh=null;if(item.section&&item.section!==curSec){curSec=item.section;sh=<div className="sidebar-section" key={`s-${item.section}`}>{item.section}</div>;}return(<div key={item.key}>{sh}<button className={`nav-item ${page===item.key?"active":""}`} onClick={()=>{setPage(item.key);setSidebarOpen(false);}}><Icon d={item.icon} size={18}/>{item.label}</button></div>);})}</nav>
      <div className="sidebar-profile"><div className="sidebar-avatar">{profile?.avatar_url?<img src={profile.avatar_url} alt="" referrerPolicy="no-referrer"/>:(profile?.display_name||"?")[0].toUpperCase()}</div><div className="sidebar-user"><div className="sidebar-user-name">{profile?.display_name||profile?.email}</div><div className="sidebar-user-role">{ROLE_LABELS[userRole]} &middot; {profile?.domain}</div></div><button className="sidebar-logout" onClick={sb.auth.signOut} title="Sign out"><Icon d={icons.logout} size={16}/></button></div>
    </aside>
    <div className="main-content"><div className="topbar"><button className="topbar-menu" onClick={()=>setSidebarOpen(true)}><Icon d={icons.menu} size={22}/></button><span className="topbar-title">{NAV_ITEMS.find(n=>n.key===page)?.label||"Dashboard"}</span></div>{renderPage()}</div>
  </div>);
}
