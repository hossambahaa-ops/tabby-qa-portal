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
  <svg width={size * 4.5} height={size} viewBox="0 0 450 100" fill="none">
    <rect width="450" height="100" rx="16" fill="#1A1A1A"/>
    <text x="28" y="68" fontFamily="'DM Sans', sans-serif" fontSize="52" fontWeight="700" fill={color} letterSpacing="-1">tabby</text>
    <text x="222" y="68" fontFamily="'DM Sans', sans-serif" fontSize="52" fontWeight="700" fill="#FFF" letterSpacing="-1">RADAR</text>
  </svg>
);

const GoogleLogo=()=>(<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>);

/* ═══ PAGES ═══ */

function DashboardPage({profile,token}){
  const[mtd,setMtd]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);
  const[damCount,setDamCount]=useState(0);const[profileCount,setProfileCount]=useState({qas:0,leads:0,active:0});
  const[apPlans,setApPlans]=useState([]);const[apWeeks,setApWeeks]=useState([]);const[apDetections,setApDetections]=useState([]);
  const isLead=hasRole(profile?.role,"qa_lead");

  const nameFromEmail=(email)=>{if(!email)return"—";const local=email.split("@")[0];return local.split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};
  const fmt=(val)=>{if(val===null||val===undefined||val==="")return"—";const s=String(val).trim();if(s.includes("%"))return s;const n=parseFloat(s.replace(",","."));if(isNaN(n))return s;if(n>=0&&n<=2)return(n*100).toFixed(1)+"%";if(n>2&&!Number.isInteger(n))return n.toFixed(1)+"%";return String(val);};

  // Slab engine for dashboard
  const parseRawD=(val)=>{if(!val&&val!==0)return null;const s=String(val).trim().replace(",",".");if(s.includes("%"))return parseFloat(s.replace("%",""));const n=parseFloat(s);if(isNaN(n))return null;if(n>=0&&n<=2)return n*100;return n;};
  const KPI_SLABS_D={occupancy:{weight:15,thresholds:[95,98,100],rawKey:"occupancy_pct"},coaching:{weight:10,thresholds:[90,93,95],rawKey:"ontime_coaching_pct"},calibration:{weight:10,thresholds:[85,90,95],rawKey:"avg_calibration_match_rate"},observation:{weight:10,thresholds:[82,85,88],rawKey:"avg_observation_score_pct"},rtr:{weight:10,thresholds:[80,85,90],rawKey:"avg_rtr_score"}};
  const calcSlabD=(rawPct,th)=>{if(rawPct===null)return 0;if(rawPct>=th[2])return 100;if(rawPct>=th[1])return 75;if(rawPct>=th[0])return 50;return 0;};
  const getScore=(row)=>{return Object.values(KPI_SLABS_D).reduce((sum,def)=>{const raw=parseRawD(row[def.rawKey]);return sum+(def.weight*calcSlabD(raw,def.thresholds))/100;},0);};
  const maxScore=55;
  const scoreColor=(v)=>v>=maxScore*0.7?"var(--green)":v>=maxScore*0.4?"var(--amber)":"var(--red)";
  const scoreBg=(v)=>v>=maxScore*0.7?"var(--green-bg)":v>=maxScore*0.4?"var(--amber-bg)":"var(--red-bg)";

  useEffect(()=>{(async()=>{try{
    const[mtdRows,rosterRows,flags,profs,plans,planWeeks]=await Promise.all([
      sb.query("mtd_scores",{select:"*",filters:"order=month.desc",token}).catch(()=>[]),
      sb.query("qa_roster",{select:"*",token}).catch(()=>[]),
      sb.query("dam_flags",{select:"id,status",filters:"status=eq.pending",token}).catch(()=>[]),
      sb.query("profiles",{select:"id,role,status",filters:"status=eq.active",token}).catch(()=>[]),
      sb.query("action_plans",{select:"*",filters:"order=created_at.desc",token}).catch(()=>[]),
      sb.query("action_plan_weeks",{select:"*",filters:"order=plan_id.asc,week_number.asc",token}).catch(()=>[]),
    ]);
    setMtd(mtdRows);setRoster(rosterRows);setDamCount(flags.length);
    setProfileCount({qas:profs.filter(p=>p.role==="qa").length,leads:profs.filter(p=>p.role==="qa_lead").length,active:profs.length});
    setApPlans(plans);setApWeeks(planWeeks);

    // Auto-detection for TL dashboard alert
    if(hasRole(profile?.role,"qa_lead")){
      const mnths=[...new Set(mtdRows.map(r=>r.month))].sort().reverse();
      if(mnths.length>=2){
        const latest=mtdRows.filter(r=>r.month===mnths[0]);
        const prev=mtdRows.filter(r=>r.month===mnths[1]);
        const activePlanEmails=plans.filter(p=>p.status==="active"||p.status==="pending_review").map(p=>p.qa_email?.toLowerCase());
        // Only show TL's own team members
        const myTeam=rosterRows.filter(r=>r.manager_email&&r.manager_email.toLowerCase()===profile?.email?.toLowerCase()).map(r=>r.email.toLowerCase());
        const myTlRows=latest.filter(r=>r.qa_tl&&r.qa_tl.toLowerCase()===profile?.email?.toLowerCase()).map(r=>r.qa_email.toLowerCase());
        const teamEmails=[...new Set([...myTeam,...myTlRows])];
        const flagged=[];
        latest.forEach(row=>{
          const email=row.qa_email?.toLowerCase();
          if(activePlanEmails.includes(email))return;
          if(teamEmails.length>0&&!teamEmails.includes(email))return;
          const kpiDefs=Object.values({occupancy:{weight:15,thresholds:[95,98,100],rawKey:"occupancy_pct"},coaching:{weight:10,thresholds:[90,93,95],rawKey:"ontime_coaching_pct"},calibration:{weight:10,thresholds:[85,90,95],rawKey:"avg_calibration_match_rate"},observation:{weight:10,thresholds:[82,85,88],rawKey:"avg_observation_score_pct"},rtr:{weight:10,thresholds:[80,85,90],rawKey:"avg_rtr_score"}});
          const slab0Count=kpiDefs.filter(def=>{const raw=parseRawD(row[def.rawKey]);return raw!==null&&raw<def.thresholds[0];}).length;
          const totalScore=getScore(row);
          const prevRow=prev.find(r=>r.qa_email?.toLowerCase()===email);
          const prevScore=prevRow?getScore(prevRow):null;
          let reason=null;
          if(slab0Count>=2)reason=`${slab0Count} KPIs at Slab 0`;
          if(totalScore<20&&prevScore!==null&&prevScore<20)reason=(reason?reason+" + ":"")+"Score <20 for 2 months";
          if(reason)flagged.push({email:row.qa_email,name:nameFromEmail(row.qa_email),score:totalScore,reason,slab0Count});
        });
        flagged.sort((a,b)=>a.score-b.score);
        setApDetections(flagged);
      }
    }
  }catch(e){console.error("Dashboard:",e);}setLoading(false);})();},[token]);

  const months=[...new Set(mtd.map(r=>r.month))];
  const latestMonth=months[0]||"—";
  const prevMonth=months[1]||null;

  const current=mtd.filter(r=>r.month===latestMonth);
  const previous=prevMonth?mtd.filter(r=>r.month===prevMonth):[];

  const myEmail=profile?.email?.toLowerCase();
  const myData=current.find(r=>r.qa_email.toLowerCase()===myEmail);
  const myPrevData=previous.find(r=>r.qa_email.toLowerCase()===myEmail);

  // Rank by calculated score
  const ranked=[...current].sort((a,b)=>getScore(b)-getScore(a));
  const myRank=ranked.findIndex(r=>r.qa_email.toLowerCase()===myEmail)+1;

  const myRoster=roster.find(r=>r.email.toLowerCase()===myEmail);

  // Team members
  const myTeamEmails=roster.filter(r=>r.manager_email&&r.manager_email.toLowerCase()===myEmail).map(r=>r.email.toLowerCase());
  const myTlEmails=current.filter(r=>r.qa_tl&&r.qa_tl.toLowerCase()===myEmail).map(r=>r.qa_email.toLowerCase());
  const allTeamEmails=[...new Set([...myTeamEmails,...myTlEmails])];
  const teamCurrent=current.filter(r=>allTeamEmails.includes(r.qa_email.toLowerCase()));
  const teamPrevious=previous.filter(r=>allTeamEmails.includes(r.qa_email.toLowerCase()));
  const teamSorted=[...teamCurrent].sort((a,b)=>getScore(b)-getScore(a));

  // Team averages using calculated scores
  const teamAvgScore=teamCurrent.length?(teamCurrent.reduce((a,r)=>a+getScore(r),0)/teamCurrent.length):0;
  const teamAvgScorePrev=teamPrevious.length?(teamPrevious.reduce((a,r)=>a+getScore(r),0)/teamPrevious.length):0;
  const teamTrend=teamPrevious.length?(teamAvgScore-teamAvgScorePrev).toFixed(1):null;
  const teamDsat=teamCurrent.reduce((a,r)=>a+(r.dsat||0),0);

  // Performance trend sparkline using calculated scores
  const myHistory=months.slice(0,6).reverse().map(m=>{const row=mtd.find(r=>r.month===m&&r.qa_email.toLowerCase()===myEmail);return{month:m,score:row?getScore(row):null};}).filter(d=>d.score!==null);

  const nav=(page)=>window.dispatchEvent(new CustomEvent("navigate",{detail:page}));

  return(<div className="page">
    <div className="welcome-banner"><h2>Welcome back, {profile?.display_name?.split(" ")[0]||"there"}</h2><p>{isLead?"Here's your team overview for "+latestMonth+".":"Here's your performance overview for "+latestMonth+"."}</p><div className="welcome-role">{ROLE_LABELS[profile?.role]||"QA"} &middot; {profile?.domain}{myRoster?" · "+myRoster.queue:""}</div></div>
    {loading?<div className="loading-spinner"><div className="spinner"/></div>:<>

    {/* ── AP/PIP Detection Alerts for TLs ── */}
    {isLead&&apDetections.length>0&&<div className="card" style={{marginBottom:16,borderLeft:"4px solid var(--amber)"}}>
      <div className="card-header" style={{cursor:"pointer"}} onClick={()=>nav("plans")}>
        <span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>⚠️</span>
          {apDetections.length} QA{apDetections.length!==1?"s":""} flagged for Action Plan
        </span>
        <span style={{fontSize:12,fontWeight:600,color:"var(--amber)"}}>View all →</span>
      </div>
      {apDetections.slice(0,5).map(d=>(
        <div key={d.email} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--bd2)",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,flexShrink:0}}>{d.name.split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}</div>
            <div>
              <div style={{fontSize:13,fontWeight:500}}>{d.name}</div>
              <div style={{fontSize:11,color:"var(--tx3)"}}>{d.reason} · Score: <span style={{fontWeight:600,color:scoreColor(d.score)}}>{d.score.toFixed(1)}/55</span></div>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-primary btn-sm" style={{fontSize:11,padding:"3px 10px"}} onClick={(e)=>{e.stopPropagation();nav("plans");}}>Create AP</button>
            <button className="btn btn-outline btn-sm" style={{fontSize:11,padding:"3px 10px"}} onClick={(e)=>{e.stopPropagation();setApDetections(prev=>prev.filter(x=>x.email!==d.email));}}>Dismiss</button>
          </div>
        </div>
      ))}
      {apDetections.length>5&&<div style={{fontSize:12,color:"var(--tx3)",marginTop:8}}>+{apDetections.length-5} more — view all in AP/PIP page</div>}
    </div>}

    {/* ── QA Self-View: My Active Plan (visible only after first coaching meeting) ── */}
    {!isLead&&(()=>{
      const myPlan=apPlans.find(p=>(p.qa_email?.toLowerCase()===myEmail)&&(p.status==="active"||p.status==="pending_review"));
      if(!myPlan)return null;
      const myPlanWeeks=apWeeks.filter(w=>w.plan_id===myPlan.id).sort((a,b)=>a.week_number-b.week_number);
      const hasCoachingSession=myPlanWeeks.some(w=>w.coaching_session_id)||myPlanWeeks.some(w=>w.actual_data);
      if(!hasCoachingSession)return null; // Only show after first meeting/review
      const filledWeeks=myPlanWeeks.filter(w=>w.actual_data);
      const metWeeks=myPlanWeeks.filter(w=>w.met_targets===true);
      const totalW=myPlan.duration_weeks||myPlanWeeks.length;
      const elapsed=filledWeeks.length;
      const successRate=filledWeeks.length?(metWeeks.length/filledWeeks.length*100):0;
      const daysLeft=myPlan.end_date?Math.max(0,Math.ceil((new Date(myPlan.end_date)-Date.now())/(1000*60*60*24))):null;
      const targets=(() => { try { return JSON.parse(myPlan.targets||"[]"); } catch { return []; } })();
      const progressPct=totalW?(elapsed/totalW)*100:0;
      return <div className="card" style={{marginBottom:20,borderLeft:`4px solid ${myPlan.type==="pip"?"var(--red)":"var(--amber)"}`}}>
        <div className="card-header"><span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{padding:"2px 10px",borderRadius:10,fontSize:11,fontWeight:700,background:myPlan.type==="pip"?"var(--red-bg)":"var(--amber-bg)",color:myPlan.type==="pip"?"var(--red)":"var(--amber)"}}>{myPlan.type.toUpperCase()}</span>
          My {myPlan.type==="pip"?"Performance Improvement Plan":"Action Plan"}
        </span>
        {daysLeft!==null&&<span style={{fontSize:13,fontWeight:600,color:daysLeft<=7?"var(--red)":"var(--tx2)"}}>{daysLeft} days remaining</span>}
        </div>
        {/* Progress bar */}
        <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
          <div style={{width:`${progressPct}%`,height:"100%",borderRadius:3,background:successRate>=60?"var(--green)":"var(--amber)",transition:"width .4s"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--tx3)",marginBottom:14}}>
          <span>Week {elapsed} of {totalW}</span>
          <span>{metWeeks.length}/{elapsed} weeks met targets ({successRate.toFixed(0)}%)</span>
        </div>
        {/* Weekly breakdown */}
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

    {/* ── Lead+ team overview ── */}
    {isLead&&<>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--accent-light)",color:"var(--accent-text)",fontSize:18}}>👥</div><div className="stat-label">My team</div><div className="stat-value">{allTeamEmails.length}</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--green-bg)",color:"var(--green)",fontSize:18}}>📊</div><div className="stat-label">Team avg score</div><div className="stat-value" style={{color:scoreColor(teamAvgScore)}}>{teamAvgScore.toFixed(1)}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {maxScore}</span></div>{teamTrend&&<div style={{fontSize:12,marginTop:4,color:Number(teamTrend)>=0?"var(--green)":"var(--red)"}}>{Number(teamTrend)>=0?"↑":"↓"} {Math.abs(teamTrend)} pts vs {prevMonth}</div>}</div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--red-bg)",color:"var(--red)",fontSize:18}}>⚠️</div><div className="stat-label">Team DSAT</div><div className="stat-value" style={{color:"var(--tx)"}}>{teamDsat}</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>🚩</div><div className="stat-label">Pending DAM flags</div><div className="stat-value">{damCount}</div></div>
      </div>

      {/* Team members table */}
      {teamSorted.length>0&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My team — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{teamSorted.length} specialists</span></div>
        <div className="table-wrap"><table><thead><tr><th>#</th><th>Specialist</th><th style={{textAlign:"right"}}>Score</th><th style={{textAlign:"right"}}>Tickets/d</th><th style={{textAlign:"right"}}>DSAT</th><th style={{textAlign:"right"}}>Occupancy</th><th style={{textAlign:"right"}}>RTR</th><th style={{textAlign:"center"}}>JKQ</th></tr></thead><tbody>
          {teamSorted.map((r,i)=>(<tr key={r.id}>
            <td style={{fontWeight:500,color:i<3?"var(--amber)":"var(--tx3)"}}>{i+1}</td>
            <td style={{fontWeight:500}}>{nameFromEmail(r.qa_email)}</td>
            <td style={{textAlign:"right"}}><span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:scoreBg(getScore(r)),color:scoreColor(getScore(r))}}>{getScore(r).toFixed(1)} / {maxScore}</span></td>
            <td style={{textAlign:"right",color:"var(--teal)",fontWeight:500}}>{r.ticket_per_day??0}</td>
            <td style={{textAlign:"right"}}>{r.dsat??0}</td>
            <td style={{textAlign:"right"}}>{fmtPct(r.occupancy_pct)}</td>
            <td style={{textAlign:"right"}}>{fmtPct(r.avg_rtr_score)}</td>
            <td style={{textAlign:"center"}}>{r.jkq_result&&r.jkq_result!=="N/A"?<span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:r.jkq_result==="Pass"?"var(--green-bg)":"var(--red-bg)",color:r.jkq_result==="Pass"?"var(--green)":"var(--red)"}}>{r.jkq_result}</span>:<span style={{color:"var(--tx3)"}}>—</span>}</td>
          </tr>))}
        </tbody></table></div>
      </div>}
    </>}

    {/* ── Personal stats (everyone) ── */}
    {myData?<>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon" style={{background:scoreBg(myData?getScore(myData):0),color:scoreColor(myData?getScore(myData):0),fontSize:18}}>📊</div><div className="stat-label">My score</div><div className="stat-value" style={{color:scoreColor(myData?getScore(myData):0)}}>{myData?getScore(myData).toFixed(1):0}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {maxScore}</span></div>{myPrevData&&<div style={{fontSize:12,marginTop:4,color:(getScore(myData)-getScore(myPrevData))>=0?"var(--green)":"var(--red)"}}>{(getScore(myData)-getScore(myPrevData))>=0?"↑":"↓"} {Math.abs(getScore(myData)-getScore(myPrevData)).toFixed(1)} pts vs {prevMonth}</div>}</div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>🏆</div><div className="stat-label">Rank</div><div className="stat-value">{myRank>0?"#"+myRank:"—"}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {ranked.length}</span></div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--teal-bg)",color:"var(--teal)",fontSize:18}}>🎫</div><div className="stat-label">Tickets/day</div><div className="stat-value">{myData.ticket_per_day??0}</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--teal-bg)",color:"var(--teal)",fontSize:18}}>📋</div><div className="stat-label">DSAT</div><div className="stat-value">{myData.dsat??0}</div></div>
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
          const parseRawD = (val) => {
            if (!val && val !== 0) return null;
            const s = String(val).trim().replace(",",".");
            if (s.includes("%")) return parseFloat(s.replace("%",""));
            const n = parseFloat(s);
            if (isNaN(n)) return null;
            if (n >= 0 && n <= 2) return n * 100;
            return n;
          };
          const calcSlabD = (rawPct, th) => {
            if (rawPct === null) return {slab:0,pct:0,label:"No data"};
            if (rawPct >= th[2]) return {slab:3,pct:100,label:"Slab 3"};
            if (rawPct >= th[1]) return {slab:2,pct:75,label:"Slab 2"};
            if (rawPct >= th[0]) return {slab:1,pct:50,label:"Slab 1"};
            return {slab:0,pct:0,label:"Slab 0"};
          };
          const kpis = Object.entries(KPI_SLABS_DASH).map(([key,def])=>{
            const rawPct = parseRawD(myData[def.rawKey]);
            const slab = calcSlabD(rawPct, def.thresholds);
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
                    <span style={{fontSize:13,fontWeight:700,color:k.slab.pct>=75?"var(--green)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}>{k.score.toFixed(1)} / {k.weight}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--tx2)",marginBottom:4}}>
                    <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</span>
                    <span style={{padding:"1px 6px",borderRadius:8,fontSize:10,fontWeight:600,background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",color:k.slab.pct===100?"var(--green)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}>{k.slab.label}</span>
                  </div>
                  <div style={{height:5,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct>=75?"var(--green)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}/></div>
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

      {/* Sparkline trend */}
      {myHistory.length>1&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">Score trend</span></div>
        <svg width="100%" height="100" viewBox={`0 0 ${myHistory.length*100} 100`} style={{overflow:"visible"}}><polyline fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={myHistory.map((d,i)=>{const y=90-(d.score/maxScore)*70;return`${i*100+50},${Math.max(10,Math.min(90,y))}`;}).join(" ")}/>{myHistory.map((d,i)=>{const y=90-(d.score/maxScore)*70;const cy=Math.max(10,Math.min(90,y));return(<g key={i}><circle cx={i*100+50} cy={cy} r="4" fill="var(--accent-text)"/><text x={i*100+50} y={cy-12} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--tx)" fontFamily="var(--font)">{d.score.toFixed(1)}</text><text x={i*100+50} y={cy+18} textAnchor="middle" fontSize="10" fill="var(--tx3)" fontFamily="var(--font)">{d.month}</text></g>);})}</svg>
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
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--green-bg)",color:"var(--green)",fontSize:18}}>📊</div><div className="stat-label">Avg score ({latestMonth})</div><div className="stat-value" style={{color:scoreColor(ranked.length?ranked.reduce((a,r)=>a+getScore(r),0)/ranked.length:0)}}>{ranked.length?(ranked.reduce((a,r)=>a+getScore(r),0)/ranked.length).toFixed(1):"—"}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {maxScore}</span></div></div>
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--red-bg)",color:"var(--red)",fontSize:18}}>⚠️</div><div className="stat-label">Total DSAT ({latestMonth})</div><div className="stat-value">{current.reduce((a,r)=>a+(r.dsat||0),0)}</div></div>
    </div>}

    </>}
  </div>);
}

function TeamManagementPage({token}){
  const[teams,setTeams]=useState([]);const[users,setUsers]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);const[showForm,setShowForm]=useState(false);
  const[form,setForm]=useState({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});const[editId,setEditId]=useState(null);const{show,el}=useToast();
  const load=useCallback(async()=>{try{const[t,u,r]=await Promise.all([
    sb.query("teams",{select:"id,name,domain,lead_id,supervisor_id,profiles!fk_teams_lead(display_name,email),sup:profiles!fk_teams_supervisor(display_name,email)",token}),
    sb.query("profiles",{select:"id,display_name,email,role,domain",token}),
    sb.query("qa_roster",{select:"email,display_name,queue,manager_email",token}).catch(()=>[]),
  ]);setTeams(t);setUsers(u);setRoster(r);

  // Auto-create teams from roster queues that don't exist yet
  const existingNames=t.map(x=>x.name.toLowerCase());
  const rosterQueues=[...new Set(r.map(x=>x.queue).filter(Boolean))];
  const missing=rosterQueues.filter(q=>!existingNames.includes(q.toLowerCase()));
  if(missing.length>0){
    for(const q of missing){
      // Detect domain: if majority of members are @tabby.sa, set sa, else ai
      const members=r.filter(x=>x.queue===q);
      const saCount=members.filter(x=>x.email?.endsWith("@tabby.sa")).length;
      const domain=saCount>members.length/2?"tabby.sa":"tabby.ai";
      try{await sb.query("teams",{token,method:"POST",body:{name:q,domain}});}catch(e){console.log("Auto-create team:",q,e);}
    }
    // Reload teams after auto-creation
    const t2=await sb.query("teams",{select:"id,name,domain,lead_id,supervisor_id,profiles!fk_teams_lead(display_name,email),sup:profiles!fk_teams_supervisor(display_name,email)",token});
    setTeams(t2);
    show("success",`Auto-created ${missing.length} team(s) from roster`);
  }
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);

  const nameFromEmail=(email)=>{if(!email)return"—";return email.split("@")[0].split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};
  const leads=users.filter(u=>hasRole(u.role,"qa_lead")),supervisors=users.filter(u=>hasRole(u.role,"qa_supervisor"));
  const getMemberCount=(teamName)=>roster.filter(r=>r.queue===teamName).length;
  const getTeamMembers=(teamName)=>roster.filter(r=>r.queue===teamName);

  const save=async()=>{try{const b={name:form.name,domain:form.domain,lead_id:form.lead_id||null,supervisor_id:form.supervisor_id||null};if(editId){await sb.query("teams",{token,method:"PATCH",body:b,filters:`id=eq.${editId}`});show("success","Team updated");}else{await sb.query("teams",{token,method:"POST",body:b});show("success","Team created");}setShowForm(false);setEditId(null);setForm({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});load();}catch(e){show("error",e.message);}};
  const startEdit=(t)=>{setForm({name:t.name,domain:t.domain,lead_id:t.lead_id||"",supervisor_id:t.supervisor_id||""});setEditId(t.id);setShowForm(true);};
  const del=async(id)=>{if(!confirm("Delete this team?"))return;try{await sb.query("teams",{token,method:"DELETE",filters:`id=eq.${id}`});show("success","Deleted");load();}catch(e){show("error",e.message);}};

  const [expandedTeam, setExpandedTeam] = useState(null);

  return(<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div className="page-title">Team management</div><div className="page-subtitle">{teams.length} teams · {roster.length} roster members</div></div><button className="btn btn-primary" onClick={()=>{setShowForm(!showForm);setEditId(null);setForm({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});}}><Icon d={icons.plus} size={16}/>New team</button></div>
    {showForm&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">{editId?"Edit team":"Create team"}</span></div>
      <div className="form-grid"><div className="form-group"><label className="form-label">Team name</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Payments QA"/></div>
      <div className="form-group"><label className="form-label">Domain</label><select className="select form-input" value={form.domain} onChange={e=>setForm({...form,domain:e.target.value})}><option value="tabby.ai">tabby.ai</option><option value="tabby.sa">tabby.sa</option></select></div>
      <div className="form-group"><label className="form-label">Lead</label><select className="select form-input" value={form.lead_id} onChange={e=>setForm({...form,lead_id:e.target.value})}><option value="">— Select —</option>{leads.map(u=><option key={u.id} value={u.id}>{u.display_name||u.email}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Supervisor</label><select className="select form-input" value={form.supervisor_id} onChange={e=>setForm({...form,supervisor_id:e.target.value})}><option value="">— Select —</option>{supervisors.map(u=><option key={u.id} value={u.id}>{u.display_name||u.email}</option>)}</select></div></div>
      <div style={{display:"flex",gap:8,marginTop:16}}><button className="btn btn-primary" onClick={save}><Icon d={icons.check} size={16}/>{editId?"Update":"Create"}</button><button className="btn btn-outline" onClick={()=>{setShowForm(false);setEditId(null);}}>Cancel</button></div>
    </div>}
    <div className="card">{loading?<div className="loading-spinner"><div className="spinner"/></div>:teams.length===0?<div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No teams yet. Teams are auto-created from the roster.</p></div>:
      <div className="table-wrap"><table><thead><tr><th>Team</th><th>Domain</th><th>Members</th><th>Lead</th><th>Supervisor</th><th></th></tr></thead><tbody>
        {teams.sort((a,b)=>a.name.localeCompare(b.name)).map(t=>{
          const count=getMemberCount(t.name);
          const isExp=expandedTeam===t.id;
          const members=getTeamMembers(t.name);
          return(<React.Fragment key={t.id}>
            <tr onClick={()=>setExpandedTeam(isExp?null:t.id)} style={{cursor:"pointer"}}>
              <td style={{fontWeight:500}}>{t.name}</td>
              <td><span className={`domain-badge domain-${t.domain==="tabby.ai"?"ai":"sa"}`}>{t.domain}</span></td>
              <td><span style={{fontSize:12,padding:"2px 8px",borderRadius:12,background:"var(--accent-light)",color:"var(--accent-text)",fontWeight:600}}>{count}</span></td>
              <td style={{fontSize:13}}>{t.profiles?.display_name||<span style={{color:"var(--tx3)"}}>Not assigned</span>}</td>
              <td style={{fontSize:13}}>{t.sup?.display_name||<span style={{color:"var(--tx3)"}}>Not assigned</span>}</td>
              <td><div style={{display:"flex",gap:4}}><button className="btn btn-outline btn-sm" onClick={(e)=>{e.stopPropagation();startEdit(t);}}><Icon d={icons.edit} size={14}/></button><button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={(e)=>{e.stopPropagation();del(t.id);}}><Icon d={icons.trash} size={14}/></button></div></td>
            </tr>
            {isExp&&members.length>0&&<tr><td colSpan={6} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"12px 20px"}}>
              <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Team members ({members.length})</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:6}}>
                {members.sort((a,b)=>(a.display_name||a.email).localeCompare(b.display_name||b.email)).map(m=>(
                  <div key={m.email} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",background:"var(--bg3)",borderRadius:6,fontSize:12}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,flexShrink:0}}>{nameFromEmail(m.email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}</div>
                    <div style={{overflow:"hidden"}}><div style={{fontWeight:500,fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.display_name||nameFromEmail(m.email)}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{m.email}</div></div>
                  </div>
                ))}
              </div>
              {members.length>0&&<div style={{fontSize:11,color:"var(--tx3)",marginTop:8}}>Manager: {members[0].manager_email?nameFromEmail(members[0].manager_email):"—"}</div>}
            </div></td></tr>}
          </React.Fragment>);
        })}
      </tbody></table></div>}</div>{el}
  </div>);
}

function ScoreEntryPage({token,profile}){
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selQA, setSelQA] = useState("");
  const [selTL, setSelTL] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [selTeam, setSelTeam] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows] = await Promise.all([
          sb.query("mtd_scores", {select:"*",filters:"order=month.desc,qa_email.asc",token}),
          sb.query("qa_roster", {select:"email,queue",token}).catch(()=>[]),
        ]);
        setData(rows);
        setRoster(rosterRows);
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

  // Format percentage values — handles "94.46%", 0.9446, 1.345, "1", etc.
  const fmtPct = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    const s = String(val).trim();
    if (s.includes("%")) return s; // already formatted
    const n = parseFloat(s.replace(",", "."));
    if (isNaN(n)) return s;
    // If it looks like a 0-1 decimal, multiply by 100
    // If > 1 and < 2, it's likely a raw decimal like 1.345 meaning 134.5%
    // If > 2, it's already a percentage value like 94.46
    if (n >= 0 && n <= 2) return (n * 100).toFixed(1) + "%";
    return n.toFixed(1) + "%";
  };

  // Format general values
  const fmt = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "string" && val.includes("%")) return val;
    if (typeof val === "number" && !Number.isInteger(val)) return val.toFixed(2);
    return String(val);
  };

  const monthData = data.filter(r => r.month === selMonth);
  const qaEmails = [...new Set(monthData.map(r => r.qa_email))].sort();
  const tlEmails = [...new Set(monthData.map(r => r.qa_tl).filter(Boolean))].sort();
  const rosterMap = {};
  roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  const scoreTeams = [...new Set(roster.filter(r => r.queue && (!selDomain || r.email?.endsWith("@"+selDomain))).map(r => r.queue))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+selDomain));
  if (selTeam) filtered = filtered.filter(r => rosterMap[r.qa_email?.toLowerCase()]?.queue === selTeam);
  if (selTL) filtered = filtered.filter(r => r.qa_tl === selTL);
  if (selQA) filtered = filtered.filter(r => r.qa_email === selQA);
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
          <select className="select form-input" value={selMonth} onChange={e=>{setSelMonth(e.target.value);setSelQA("");setSelTL("");setSelDomain("");setSelTeam("");}}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Domain</label>
          <select className="select form-input" value={selDomain} onChange={e=>{setSelDomain(e.target.value);setSelQA("");setSelTL("");setSelTeam("");}}>
            <option value="">All domains</option>
            <option value="tabby.ai">tabby.ai</option>
            <option value="tabby.sa">tabby.sa</option>
          </select>
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Team</label>
          <select className="select form-input" value={selTeam} onChange={e=>{setSelTeam(e.target.value);setSelQA("");setSelTL("");}}>
            <option value="">All teams</option>
            {scoreTeams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">QA Lead</label>
          <select className="select form-input" value={selTL} onChange={e=>{setSelTL(e.target.value);setSelQA("");}}>
            <option value="">All leads ({tlEmails.length})</option>
            {tlEmails.map(e => <option key={e} value={e}>{nameFromEmail(e)}</option>)}
          </select>
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Specialist</label>
          <select className="select form-input" value={selQA} onChange={e=>setSelQA(e.target.value)}>
            <option value="">All ({filtered.length})</option>
            {[...new Set(filtered.map(r=>r.qa_email))].sort().map(e => <option key={e} value={e}>{nameFromEmail(e)}</option>)}
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
                  <td style={{textAlign:"right"}}>{r.dsat ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.late_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.never_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.valid_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.invalid_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.coaching_sessions ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.total_ontime_coachings ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.coaching_eligibility_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.not_coached ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.rtr_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_rtr_score)}</td>
                  <td style={{textAlign:"right"}}>{r.observed_coaching_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_observation_score_pct)}</td>
                  <td style={{textAlign:"right"}}>{r.calibration_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_calibration_match_rate)}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.coaching_completion_pct)}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.ontime_coaching_pct)}</td>
                  <td style={{textAlign:"center"}}>
                    {r.jkq_result && r.jkq_result !== "N/A" ? (
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:r.jkq_result==="Pass"?"var(--green-bg)":"var(--red-bg)",color:r.jkq_result==="Pass"?"var(--green)":"var(--red)"}}>{r.jkq_result}{r.jkq_score>0?` (${r.jkq_score})`:""}</span>
                    ) : <span style={{color:"var(--tx3)"}}>—</span>}
                  </td>
                  <td style={{textAlign:"right",color:"var(--teal)",fontWeight:500}}>{r.ticket_per_day ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.occupancy_pct)}</td>
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
  const[users,setUsers]=useState([]);const[memberships,setMemberships]=useState({});const[loading,setLoading]=useState(true);const[editingId,setEditingId]=useState(null);const[editRole,setEditRole]=useState("");const[editTeams,setEditTeams]=useState([]);const[editOpDomain,setEditOpDomain]=useState("");const{show,el}=useToast();
  const load=useCallback(async()=>{try{
    const[d,tm]=await Promise.all([
      sb.query("profiles",{select:"id,email,display_name,role,domain,operational_domain,status",token}),
      sb.query("team_members",{select:"id,profile_id,team_id,is_primary",token})
    ]);
    setUsers(d.sort((a,b)=>ROLE_LEVEL[b.role]-ROLE_LEVEL[a.role]));
    const map={};tm.forEach(m=>{if(!map[m.profile_id])map[m.profile_id]=[];map[m.profile_id].push(m);});
    setMemberships(map);
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);
  const getUserTeamNames=(uid)=>{const ms=memberships[uid]||[];return ms.map(m=>{const t=teams.find(t2=>t2.id===m.team_id);return t?t.name:null;}).filter(Boolean);};
  const getOpDomain=(u)=>u.operational_domain||u.domain||"tabby.ai";
  const save=async(uid)=>{try{
    await sb.query("profiles",{token,method:"PATCH",body:{role:editRole,operational_domain:editOpDomain},filters:`id=eq.${uid}`});
    await sb.query("team_members",{token,method:"DELETE",filters:`profile_id=eq.${uid}`});
    if(editTeams.length>0){
      const rows=editTeams.map((tid,i)=>({profile_id:uid,team_id:tid,is_primary:i===0}));
      await sb.query("team_members",{token,method:"POST",body:rows});
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
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Email domain</th><th>Op. domain</th><th>Teams</th><th>Status</th><th></th></tr></thead><tbody>
        {users.map(u=>{const uTeams=getUserTeamNames(u.id);const uTeamIds=(memberships[u.id]||[]).map(m=>m.team_id);return(<tr key={u.id}><td style={{fontWeight:500}}>{u.display_name||"—"}</td><td style={{color:"var(--tx2)",fontSize:13}}>{u.email}</td>
        <td>{editingId===u.id?<select className="select" value={editRole} onChange={e=>setEditRole(e.target.value)} style={{fontSize:12,padding:"4px 8px"}}>{Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>:<span className={`role-badge role-${u.role}`}>{ROLE_LABELS[u.role]}</span>}</td>
        <td><span className={`domain-badge domain-${u.domain==="tabby.ai"?"ai":"sa"}`}>{u.domain}</span></td>
        <td>{editingId===u.id?<select className="select" value={editOpDomain} onChange={e=>setEditOpDomain(e.target.value)} style={{fontSize:12,padding:"4px 8px"}}><option value="tabby.ai">tabby.ai</option><option value="tabby.sa">tabby.sa</option></select>:<span className={`domain-badge domain-${getOpDomain(u)==="tabby.ai"?"ai":"sa"}`}>{getOpDomain(u)}</span>}</td>
        <td>{editingId===u.id?<div className="team-checkboxes">{teams.map(t=><label key={t.id} className={`team-checkbox ${editTeams.includes(t.id)?"checked":""}`}><input type="checkbox" checked={editTeams.includes(t.id)} onChange={()=>toggleTeam(t.id)} style={{display:"none"}}/>{t.name}</label>)}{teams.length===0&&<span style={{fontSize:12,color:"var(--tx3)"}}>No teams created</span>}</div>:
          uTeams.length>0?<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{uTeams.map((n,i)=><span key={i} className="team-tag">{n}</span>)}</div>:<span style={{fontSize:13,color:"var(--tx3)"}}>Unassigned</span>}</td>
        <td><span className={`status-badge status-${u.status}`}>{u.status}</span></td>
        <td>{editingId===u.id?<div style={{display:"flex",gap:6}}><button className="btn btn-primary btn-sm" onClick={()=>save(u.id)}>Save</button><button className="btn btn-outline btn-sm" onClick={()=>setEditingId(null)}>Cancel</button></div>:<button className="btn btn-outline btn-sm" onClick={()=>{setEditingId(u.id);setEditRole(u.role);setEditOpDomain(getOpDomain(u));setEditTeams([...uTeamIds]);}}>Edit</button>}</td></tr>);})}
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
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selTeam, setSelTeam] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [view, setView] = useState("individual");
  const [expandedRow, setExpandedRow] = useState(null);
  const [search, setSearch] = useState("");
  const [selQuarter, setSelQuarter] = useState("");
  const [selYear, setSelYear] = useState("");
  const [selQaQuarterly, setSelQaQuarterly] = useState("");
  const {show, el} = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows, profRows] = await Promise.all([
          sb.query("mtd_scores", {select:"*",filters:"order=month.desc,final_performance.desc",token}),
          sb.query("qa_roster", {select:"email,queue",token}).catch(()=>[]),
          sb.query("profiles", {select:"id,email,role",filters:"status=eq.active",token}).catch(()=>[]),
        ]);
        setData(rows);
        setRoster(rosterRows);
        // Build set of non-QA emails to exclude from rankings
        const nonQaEmails = new Set(profRows.filter(p => p.role !== "qa").map(p => p.email?.toLowerCase()));
        // Filter out non-QA roles from mtd data
        const qaOnlyRows = rows.filter(r => !nonQaEmails.has(r.qa_email?.toLowerCase()));
        setData(qaOnlyRows);
        const uniqueMonths = [...new Set(qaOnlyRows.map(r => r.month))];
        setMonths(uniqueMonths);
        if (uniqueMonths.length > 0 && !selMonth) setSelMonth(uniqueMonths[0]);
      } catch (e) {
        console.error("Leaderboard:", e);
        show("error", "Failed to load leaderboard data");
      }
      setLoading(false);
    })();
  }, [token]);

  // ── Slab calculation engine ──
  // Parses raw value to a number (handles "94.46%", 0.944, 1.345, etc.)
  const parseRaw = (val) => {
    if (!val && val !== 0) return null;
    const s = String(val).trim().replace(",", ".");
    if (s.includes("%")) return parseFloat(s.replace("%", ""));
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    // If between 0 and 2, it's likely a decimal (0.944 = 94.4%)
    if (n >= 0 && n <= 2) return n * 100;
    return n;
  };

  // KPI slab definitions: { thresholds: [slab1, slab2, slab3], weight }
  // Slab 0 = below slab1 → 0%, Slab 1 = ≥slab1 → 50%, Slab 2 = ≥slab2 → 75%, Slab 3 = ≥slab3 → 100%
  const KPI_SLABS = {
    occupancy:    { label: "Occupancy",            weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
    coaching:     { label: "Coaching on-time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
    calibration:  { label: "Calibration",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
    observation:  { label: "Coaching observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
    rtr:          { label: "RTR score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
  };

  const calcSlab = (rawPct, thresholds) => {
    if (rawPct === null || rawPct === undefined) return { slab: 0, pct: 0, label: "No data" };
    if (rawPct >= thresholds[2]) return { slab: 3, pct: 100, label: "Slab 3" };
    if (rawPct >= thresholds[1]) return { slab: 2, pct: 75,  label: "Slab 2" };
    if (rawPct >= thresholds[0]) return { slab: 1, pct: 50,  label: "Slab 1" };
    return { slab: 0, pct: 0, label: "Slab 0" };
  };

  const getKpiScores = (row) => {
    return Object.entries(KPI_SLABS).map(([key, def]) => {
      const rawPct = parseRaw(row[def.rawKey]);
      const slab = calcSlab(rawPct, def.thresholds);
      const score = (def.weight * slab.pct) / 100; // weighted score
      return { key, label: def.label, weight: def.weight, rawPct, slab, score, thresholds: def.thresholds };
    });
  };

  const getTotalScore = (row) => {
    const kpis = getKpiScores(row);
    return kpis.reduce((sum, k) => sum + k.score, 0);
  };

  // Format raw percentage for display
  const fmtRaw = (val) => {
    if (val === null || val === undefined) return "—";
    return val.toFixed(1) + "%";
  };

  const monthData = data.filter(r => r.month === selMonth);
  const rosterMap = {};
  roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  const teams = [...new Set(roster.filter(r => r.queue && (!selDomain || r.email?.endsWith("@"+selDomain))).map(r => r.queue))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+selDomain));
  if (selTeam) filtered = filtered.filter(r => rosterMap[r.qa_email?.toLowerCase()]?.queue === selTeam);
  if (search.trim()) filtered = filtered.filter(r => r.qa_email.toLowerCase().includes(search.toLowerCase()));
  // Rank by calculated total score
  const ranked = [...filtered].sort((a, b) => getTotalScore(b) - getTotalScore(a));

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

  const teamData = (() => {
    const tlMap = {};
    ranked.forEach(r => {
      const tl = r.qa_tl || "Unassigned";
      if (!tlMap[tl]) tlMap[tl] = { tl, members: [], totalScore: 0 };
      tlMap[tl].members.push(r);
      tlMap[tl].totalScore += getTotalScore(r);
    });
    return Object.values(tlMap).map(t => ({
      ...t,
      avgScore: t.members.length ? (t.totalScore / t.members.length) : 0,
      highest: t.members.length ? Math.max(...t.members.map(m => getTotalScore(m))) : 0,
      lowest: t.members.length ? Math.min(...t.members.map(m => getTotalScore(m))) : 0,
      totalDsat: t.members.reduce((a, m) => a + (m.dsat || 0), 0),
    })).sort((a, b) => b.avgScore - a.avgScore);
  })();

  const maxScore = 55; // total weight of 5 non-CSAT KPIs
  const avgScore = ranked.length ? (ranked.reduce((a, r) => a + getTotalScore(r), 0) / ranked.length) : 0;
  const topPerson = ranked[0];
  const totalDsat = ranked.reduce((a, r) => a + (r.dsat || 0), 0);
  // Color based on score out of 55
  const scoreColor = (v) => v >= maxScore * 0.7 ? "var(--green)" : v >= maxScore * 0.4 ? "var(--amber)" : "var(--red)";
  const scoreBg = (v) => v >= maxScore * 0.7 ? "var(--green-bg)" : v >= maxScore * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Leaderboard</div>
          <div className="page-subtitle">Performance rankings — {selMonth || "All months"}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select className="select" value={selMonth} onChange={e=>{setSelMonth(e.target.value);setSelDomain("");setSelTeam("");}}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="select" value={selDomain} onChange={e=>{setSelDomain(e.target.value);setSelTeam("");}}>
            <option value="">All domains</option>
            <option value="tabby.ai">tabby.ai</option>
            <option value="tabby.sa">tabby.sa</option>
          </select>
        </div>
      </div>

      {loading ? <div className="loading-spinner"><div className="spinner"/></div> : <>

      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
        <div className="tabs">
          <button className={`tab ${view==="individual"?"active":""}`} onClick={()=>setView("individual")}>Individual</button>
          <button className={`tab ${view==="team"?"active":""}`} onClick={()=>setView("team")}>By team lead</button>
          <button className={`tab ${view==="quarterly"?"active":""}`} onClick={()=>setView("quarterly")}>Quarterly</button>
        </div>
        <select className="select" value={selTeam} onChange={e=>setSelTeam(e.target.value)}>
          <option value="">All teams ({teams.length})</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {view==="individual" && <input className="input" placeholder="Search by email..." value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:220,marginLeft:"auto"}}/>}
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--accent-light)",color:"var(--accent-text)",fontSize:18}}>🏆</div><div className="stat-label">{view==="individual"?"Ranked":"Teams"}</div><div className="stat-value">{view==="individual"?ranked.length:teamData.length}</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--green-bg)",color:"var(--green)",fontSize:18}}>📊</div><div className="stat-label">Avg score</div><div className="stat-value" style={{color:scoreColor(avgScore)}}>{avgScore.toFixed(1)}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {maxScore}</span></div></div>
        {topPerson && view==="individual" && <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>⭐</div><div className="stat-label">Top performer</div><div className="stat-value" style={{fontSize:16}}>{nameFromEmail(topPerson.qa_email)}</div></div>}
        <div className="stat-card"><div className="stat-icon" style={{background:"var(--red-bg)",color:"var(--red)",fontSize:18}}>⚠️</div><div className="stat-label">Total DSAT</div><div className="stat-value">{totalDsat}</div></div>
      </div>

      {view==="individual" && <>
        {/* Podium top 3 */}
        {ranked.length >= 3 && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:16,marginBottom:28,flexWrap:"wrap"}}>
          {[1,0,2].map(idx => {
            const r = ranked[idx]; const rank = idx + 1; const isGold = rank === 1;
            const medals = ["","🥇","🥈","🥉"];
            const total = getTotalScore(r);
            return (<div key={r.qa_email} className="card" style={{textAlign:"center",padding:isGold?"24px 28px":"18px 22px",minWidth:isGold?180:150,border:isGold?"2px solid var(--amber)":"1px solid var(--bd2)",transform:isGold?"translateY(-8px)":"none",transition:"transform .2s"}}>
              <div style={{fontSize:isGold?28:22,marginBottom:8}}>{medals[rank]}</div>
              <div style={{width:isGold?52:40,height:isGold?52:40,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600,fontSize:isGold?16:13,margin:"0 auto 8px"}}>{initialsFromEmail(r.qa_email)}</div>
              <div style={{fontWeight:600,fontSize:isGold?15:14}}>{nameFromEmail(r.qa_email)}</div>
              <div style={{fontSize:11,color:"var(--tx3)",marginBottom:8}}>{r.qa_email.split("@")[1]}</div>
              <div style={{fontSize:isGold?26:20,fontWeight:700,color:scoreColor(total)}}>{total.toFixed(1)}<span style={{fontSize:12,fontWeight:400,color:"var(--tx3)"}}> / {maxScore}</span></div>
              <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>JKQ: {r.jkq_result||"—"} · Tickets: {r.ticket_per_day}/day</div>
            </div>);
          })}
        </div>}

        {/* Full ranking table */}
        <div className="card">
          <div className="card-header"><span className="card-title">Full rankings — {selMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{ranked.length} specialists · Scored out of {maxScore}</span></div>
          {ranked.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {selMonth}.</p></div> :
          <div className="table-wrap"><table><thead><tr>
            <th style={{width:50}}>#</th>
            <th>Specialist</th>
            <th>TL</th>
            {Object.values(KPI_SLABS).map(k => <th key={k.label} style={{textAlign:"center",minWidth:100}}>{k.label}<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{k.weight}</span></th>)}
            <th style={{textAlign:"center",minWidth:80}}>Total<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{maxScore}</span></th>
            <th style={{width:40}}></th>
          </tr></thead><tbody>
            {ranked.map((r, i) => {
              const rank = i + 1; const isExp = expandedRow === r.id;
              const kpis = getKpiScores(r);
              const total = kpis.reduce((s, k) => s + k.score, 0);
              return (<React.Fragment key={r.id}>
                <tr onClick={() => setExpandedRow(isExp ? null : r.id)} style={{cursor:"pointer"}}>
                  <td>{rank <= 3 ? <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:"50%",fontWeight:600,fontSize:12,background:rank===1?"#FEF3C7":rank===2?"#F3F4F6":"#FED7AA",color:rank===1?"#92400E":rank===2?"#374151":"#9A3412"}}>{rank}</span> : <span style={{color:"var(--tx3)",fontWeight:500}}>{rank}</span>}</td>
                  <td><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600}}>{initialsFromEmail(r.qa_email)}</div><div><div style={{fontWeight:500,fontSize:14}}>{nameFromEmail(r.qa_email)}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{r.qa_email}</div></div></div></td>
                  <td style={{fontSize:13,color:"var(--tx2)"}}>{r.qa_tl ? nameFromEmail(r.qa_tl) : "—"}</td>
                  {kpis.map(k => (
                    <td key={k.key} style={{textAlign:"center",padding:"8px 6px"}}>
                      <div style={{fontSize:13,fontWeight:600,color:scoreColor(k.score/k.weight*maxScore)}}>{k.score.toFixed(1)}</div>
                      <div style={{fontSize:10,color:"var(--tx3)"}}>{k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</div>
                      <div style={{height:3,background:"var(--bd2)",borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:2,background:k.slab.pct>=75?"var(--green)":k.slab.pct>=50?"var(--amber)":"var(--red)",transition:"width .3s"}}/></div>
                    </td>
                  ))}
                  <td style={{textAlign:"center"}}>
                    <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:600,background:scoreBg(total),color:scoreColor(total)}}>{total.toFixed(1)}</span>
                  </td>
                  <td><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
                </tr>

                {/* Expanded KPI detail */}
                {isExp && <tr><td colSpan={9+Object.keys(KPI_SLABS).length} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px 16px 60px"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--tx2)",marginBottom:12,textTransform:"uppercase",letterSpacing:".5px"}}>KPI slab breakdown</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 24px"}}>
                    {kpis.map(k => (
                      <div key={k.key} style={{padding:"10px 12px",background:"var(--bg3)",borderRadius:8,border:"1px solid var(--bd2)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:13,fontWeight:600}}>{k.label}</span>
                          <span style={{fontSize:13,fontWeight:700,color:scoreColor(k.score/k.weight*maxScore)}}>{k.score.toFixed(1)} / {k.weight}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--tx2)",marginBottom:6}}>
                          <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "No data"}</span>
                          <span style={{padding:"1px 8px",borderRadius:10,fontSize:10,fontWeight:600,
                            background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",
                            color:k.slab.pct===100?"var(--green)":k.slab.pct>=50?"var(--amber)":"var(--red)"
                          }}>{k.slab.label} ({k.slab.pct}%)</span>
                        </div>
                        <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct>=75?"var(--green)":k.slab.pct>=50?"var(--amber)":"var(--red)",transition:"width .4s"}}/></div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--tx3)",marginTop:4}}>
                          <span>Slab 1: ≥{k.thresholds[0]}%</span>
                          <span>Slab 2: ≥{k.thresholds[1]}%</span>
                          <span>Slab 3: ≥{k.thresholds[2]}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:16,paddingTop:12,borderTop:"1px solid var(--bd2)"}}>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Tickets/day: </span><span style={{fontWeight:600}}>{r.ticket_per_day}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>JKQ: </span><span style={{fontWeight:600,color:r.jkq_result==="Pass"?"var(--green)":r.jkq_result==="Missed"?"var(--red)":"var(--tx2)"}}>{r.jkq_result||"—"} {r.jkq_score>0?`(${r.jkq_score})`:""}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>DSAT: </span><span style={{fontWeight:600}}>{r.dsat||0}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>SBS: </span><span style={{fontWeight:600}}>{r.sbs||0}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Working days: </span><span style={{fontWeight:600}}>{r.working_days||0}{r.ramadan_wds ? ` (${r.ramadan_wds} Ramadan)` : ""}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Total: </span><span style={{fontWeight:700,color:scoreColor(total)}}>{total.toFixed(1)} / {maxScore}</span></div>
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
              <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:700,color:scoreColor(team.avgScore)}}>{team.avgScore.toFixed(1)}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {maxScore}</span></div><div style={{fontSize:11,color:"var(--tx3)"}}>avg score</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,paddingTop:12,borderTop:"1px solid var(--bd2)",marginBottom:14}}>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Highest</div><div style={{fontSize:16,fontWeight:600,color:"var(--green)"}}>{team.highest.toFixed(1)} / {maxScore}</div></div>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Lowest</div><div style={{fontSize:16,fontWeight:600,color:scoreColor(team.lowest)}}>{team.lowest.toFixed(1)} / {maxScore}</div></div>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Total DSAT</div><div style={{fontSize:16,fontWeight:600,color:"var(--tx)"}}>{team.totalDsat}</div></div>
            </div>
            <div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Members</div>
            {team.members.sort((a,b)=>getTotalScore(b)-getTotalScore(a)).map((m,mi) => {
              const mScore = getTotalScore(m);
              return (
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:mi<team.members.length-1?"1px solid var(--bd2)":"none"}}>
                <span style={{fontSize:12,color:"var(--tx3)",width:20,textAlign:"right"}}>{mi+1}.</span>
                <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>{initialsFromEmail(m.qa_email)}</div>
                <span style={{fontSize:13,flex:1}}>{nameFromEmail(m.qa_email)}</span>
                <span style={{fontSize:13,fontWeight:600,color:scoreColor(mScore)}}>{mScore.toFixed(1)} / {maxScore}</span>
              </div>);
            })}
          </div>);
        })}
      </div>}

      {/* ═══ QUARTERLY VIEW ═══ */}
      {view==="quarterly" && (()=>{
        const parseMonth = (m) => {
          if (!m) return null;
          const parts = m.split("-");
          const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const mi = monthNames.indexOf(parts[0]);
          const yr = parseInt(parts[1]);
          if (mi === -1 || isNaN(yr)) return null;
          return { monthIndex: mi, year: yr, quarter: Math.floor(mi / 3) + 1 };
        };
        const allParsed = months.map(m => ({ raw: m, ...parseMonth(m) })).filter(p => p.monthIndex !== undefined);
        const quarterMap = {};
        allParsed.forEach(p => {
          const key = `Q${p.quarter}-${p.year}`;
          if (!quarterMap[key]) quarterMap[key] = { label: key, year: p.year, quarter: p.quarter, months: [] };
          quarterMap[key].months.push(p.raw);
        });
        const quarters = Object.values(quarterMap).sort((a, b) => b.year - a.year || b.quarter - a.quarter);
        const activeQ = selQuarter && quarters.find(q => q.label === selQuarter) ? selQuarter : (quarters[0]?.label || "");
        const qData = quarters.find(q => q.label === activeQ);
        const qMonths = qData ? qData.months : [];
        const qRows = data.filter(r => qMonths.includes(r.month));

        // Group by QA and SUM raw KPIs
        const qaMap = {};
        qRows.forEach(row => {
          const email = row.qa_email?.toLowerCase();
          if (!email) return;
          if (selDomain && !email.endsWith("@" + selDomain)) return;
          if (selTeam && rosterMap[email]?.queue !== selTeam) return;
          if (!qaMap[email]) qaMap[email] = { email: row.qa_email, months_present: 0, kpi_sums: {}, tl: row.qa_tl, totalDsat: 0, totalTickets: 0, totalWorkingDays: 0 };
          qaMap[email].months_present++;
          qaMap[email].totalDsat += (row.dsat || 0);
          qaMap[email].totalTickets += (row.ticket_per_day || 0);
          qaMap[email].totalWorkingDays += (row.working_days || 0);
          Object.entries(KPI_SLABS).forEach(([key, def]) => {
            const raw = parseRaw(row[def.rawKey]);
            if (raw !== null) {
              if (!qaMap[email].kpi_sums[key]) qaMap[email].kpi_sums[key] = 0;
              qaMap[email].kpi_sums[key] += raw;
            }
          });
        });

        // Slab on summed values (thresholds scaled by months present)
        const getQuarterlyKpis = (qa) => {
          return Object.entries(KPI_SLABS).map(([key, def]) => {
            const rawSum = qa.kpi_sums[key] || null;
            const mc = qa.months_present || 1;
            const scaledTh = def.thresholds.map(t => t * mc);
            const slab = (() => {
              if (rawSum === null) return { slab: 0, pct: 0, label: "No data" };
              if (rawSum >= scaledTh[2]) return { slab: 3, pct: 100, label: "Slab 3" };
              if (rawSum >= scaledTh[1]) return { slab: 2, pct: 75, label: "Slab 2" };
              if (rawSum >= scaledTh[0]) return { slab: 1, pct: 50, label: "Slab 1" };
              return { slab: 0, pct: 0, label: "Slab 0" };
            })();
            const score = (def.weight * slab.pct) / 100;
            return { key, label: def.label, weight: def.weight, rawSum, monthCount: mc, slab, score, scaledTh };
          });
        };
        const getQuarterlyTotal = (qa) => getQuarterlyKpis(qa).reduce((s, k) => s + k.score, 0);

        const allQas = Object.values(qaMap).map(qa => ({
          ...qa, kpis: getQuarterlyKpis(qa), totalScore: getQuarterlyTotal(qa),
        })).sort((a, b) => b.totalScore - a.totalScore);

        // Visibility
        const myEmailQ = profile?.email?.toLowerCase();
        const isQaQ = profile?.role === "qa";
        const isLeadQ = hasRole(profile?.role, "qa_lead");
        const isSupervisorQ = hasRole(profile?.role, "qa_supervisor");
        const isAdminQ = hasRole(profile?.role, "admin");
        const myDomainQ = profile?.operational_domain || profile?.domain || "tabby.ai";
        const rosterTeamQ = roster.filter(r => r.manager_email?.toLowerCase?.() === myEmailQ || qRows.some(row => row.qa_email?.toLowerCase() === r.email?.toLowerCase() && row.qa_tl?.toLowerCase() === myEmailQ)).map(r => r.email?.toLowerCase());
        const teamEmailsQ = [...new Set(rosterTeamQ)];

        let visibleQas;
        if (isAdminQ) { visibleQas = allQas; }
        else if (isSupervisorQ) { visibleQas = allQas.filter(qa => qa.email?.endsWith("@" + myDomainQ)); }
        else if (isLeadQ) { visibleQas = allQas.filter(qa => teamEmailsQ.includes(qa.email?.toLowerCase()) || qa.email?.toLowerCase() === myEmailQ); }
        else {
          const top3 = allQas.slice(0, 3);
          const myEntry = allQas.find(qa => qa.email?.toLowerCase() === myEmailQ);
          const myRankIdx = allQas.findIndex(qa => qa.email?.toLowerCase() === myEmailQ);
          visibleQas = [...top3];
          if (myEntry && myRankIdx >= 3) visibleQas.push({ ...myEntry, _myRank: myRankIdx + 1 });
          const seen = new Set();
          visibleQas = visibleQas.filter(qa => { const e = qa.email?.toLowerCase(); if (seen.has(e)) return false; seen.add(e); return true; });
        }

        // Apply search/email filter
        if (selQaQuarterly) {
          const isExactEmail = allQas.some(qa => qa.email?.toLowerCase() === selQaQuarterly.toLowerCase());
          if (isExactEmail) {
            visibleQas = visibleQas.filter(qa => qa.email?.toLowerCase() === selQaQuarterly.toLowerCase());
          } else {
            const q = selQaQuarterly.toLowerCase();
            visibleQas = visibleQas.filter(qa => {
              const name = qa.email?.split("@")[0]?.split(".").map(p=>p.replace(/[\d]+$/,"")).filter(Boolean).join(" ").toLowerCase() || "";
              return name.includes(q) || qa.email.toLowerCase().includes(q);
            });
          }
        }

        const qMaxScore = 55;

        return <div>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <select className="select" value={activeQ} onChange={e=>{setSelQuarter(e.target.value);setSelQaQuarterly("");}}>
              {quarters.map(q => <option key={q.label} value={q.label}>{q.label} ({q.months.length} month{q.months.length!==1?"s":""})</option>)}
            </select>
            <div style={{position:"relative",minWidth:220,flex:1,maxWidth:320}}>
              <input className="form-input" value={selQaQuarterly} onChange={e=>setSelQaQuarterly(e.target.value)} placeholder={`Search specialists (${allQas.length})...`} autoComplete="off" style={{fontSize:13}}/>
              {selQaQuarterly && !allQas.find(qa=>qa.email===selQaQuarterly) && (()=>{
                const q=selQaQuarterly.toLowerCase();
                const matches=allQas.filter(qa=>{
                  const name=qa.email?.split("@")[0]?.split(".").map(p=>p.replace(/[\d]+$/,"")).filter(Boolean).join(" ").toLowerCase()||"";
                  return name.includes(q)||qa.email.toLowerCase().includes(q);
                }).slice(0,8);
                if(!matches.length)return null;
                return <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:"0 0 var(--radius) var(--radius)",boxShadow:"var(--shadow-lg)",maxHeight:220,overflowY:"auto"}}>
                  {matches.map(qa=><div key={qa.email} onClick={()=>setSelQaQuarterly(qa.email)} style={{padding:"8px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontWeight:500}}>{nameFromEmail(qa.email)}</span>
                    <span style={{fontSize:12,fontWeight:600,color:scoreColor(qa.totalScore)}}>{qa.totalScore.toFixed(1)}</span>
                  </div>)}
                </div>;
              })()}
              {selQaQuarterly && <button onClick={()=>setSelQaQuarterly("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:16,lineHeight:1}}>×</button>}
            </div>
            {qData && <span style={{fontSize:12,color:"var(--tx3)"}}>Months: {qMonths.join(", ")}</span>}
          </div>

          <div className="stats-grid" style={{marginBottom:20}}>
            <div className="stat-card"><div className="stat-icon" style={{background:"var(--accent-light)",color:"var(--accent-text)",fontSize:18}}>📅</div><div className="stat-label">Quarter</div><div className="stat-value">{activeQ}</div></div>
            <div className="stat-card"><div className="stat-icon" style={{background:"var(--green-bg)",color:"var(--green)",fontSize:18}}>👥</div><div className="stat-label">QAs ranked</div><div className="stat-value">{allQas.length}</div></div>
            <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>📊</div><div className="stat-label">Avg score</div><div className="stat-value" style={{color:scoreColor(allQas.length?(allQas.reduce((a,q)=>a+q.totalScore,0)/allQas.length):0)}}>{allQas.length?(allQas.reduce((a,q)=>a+q.totalScore,0)/allQas.length).toFixed(1):"—"}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {qMaxScore}</span></div></div>
            {allQas[0] && <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>🏆</div><div className="stat-label">Top performer</div><div className="stat-value" style={{fontSize:16}}>{nameFromEmail(allQas[0].email)}</div></div>}
          </div>

          {allQas.length >= 3 && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:16,marginBottom:28,flexWrap:"wrap"}}>
            {[1,0,2].map(idx => {
              const qa = allQas[idx]; const rank = idx + 1; const isGold = rank === 1;
              const medals = ["","🥇","🥈","🥉"];
              return (<div key={qa.email} className="card" style={{textAlign:"center",padding:isGold?"24px 28px":"18px 22px",minWidth:isGold?180:150,border:isGold?"2px solid var(--amber)":"1px solid var(--bd2)",transform:isGold?"translateY(-8px)":"none"}}>
                <div style={{fontSize:isGold?28:22,marginBottom:8}}>{medals[rank]}</div>
                <div style={{width:isGold?52:40,height:isGold?52:40,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600,fontSize:isGold?16:13,margin:"0 auto 8px"}}>{initialsFromEmail(qa.email)}</div>
                <div style={{fontWeight:600,fontSize:isGold?15:14}}>{nameFromEmail(qa.email)}</div>
                <div style={{fontSize:11,color:"var(--tx3)",marginBottom:8}}>{activeQ}</div>
                <div style={{fontSize:isGold?26:20,fontWeight:700,color:scoreColor(qa.totalScore)}}>{qa.totalScore.toFixed(1)}<span style={{fontSize:12,fontWeight:400,color:"var(--tx3)"}}> / {qMaxScore}</span></div>
              </div>);
            })}
          </div>}

          {isQaQ && <div style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8,marginBottom:12,fontSize:12,color:"var(--tx3)"}}>
            Showing top 3 performers and your position. Full rankings are visible to team leads.
          </div>}

          <div className="card">
            <div className="card-header"><span className="card-title">Quarterly rankings — {activeQ}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{visibleQas.length} specialists</span></div>
            {visibleQas.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {activeQ}.</p></div> :
            <div className="table-wrap"><table><thead><tr>
              <th style={{width:50}}>#</th>
              <th>Specialist</th>
              {Object.values(KPI_SLABS).map(k => <th key={k.label} style={{textAlign:"center",minWidth:100}}>{k.label}<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{k.weight}</span></th>)}
              <th style={{textAlign:"center",minWidth:80}}>Total<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{qMaxScore}</span></th>
            </tr></thead><tbody>
              {visibleQas.map((qa, i) => {
                const actualRank = qa._myRank || (allQas.findIndex(q => q.email === qa.email) + 1);
                const isMe = qa.email?.toLowerCase() === myEmailQ;
                const showGap = isQaQ && qa._myRank && qa._myRank > 4;
                return (<React.Fragment key={qa.email}>
                  {showGap && <tr><td colSpan={3 + Object.keys(KPI_SLABS).length} style={{textAlign:"center",padding:"6px",color:"var(--tx3)",fontSize:12,background:"var(--bg)"}}>···</td></tr>}
                  <tr style={{background:isMe?"var(--accent-light)":"transparent"}}>
                    <td>{actualRank <= 3 ? <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:"50%",fontWeight:600,fontSize:12,background:actualRank===1?"#FEF3C7":actualRank===2?"#F3F4F6":"#FED7AA",color:actualRank===1?"#92400E":actualRank===2?"#374151":"#9A3412"}}>{actualRank}</span> : <span style={{color:"var(--tx3)",fontWeight:500}}>{actualRank}</span>}</td>
                    <td><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600}}>{initialsFromEmail(qa.email)}</div><div><div style={{fontWeight:500,fontSize:14}}>{nameFromEmail(qa.email)}{isMe?" (You)":""}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{qa.email}</div></div></div></td>
                    {qa.kpis.map(k => (
                      <td key={k.key} style={{textAlign:"center",padding:"8px 6px"}}>
                        <div style={{fontSize:13,fontWeight:600,color:scoreColor(k.score/k.weight*qMaxScore)}}>{k.score.toFixed(1)}</div>
                        <div style={{fontSize:10,color:"var(--tx3)"}}>{k.rawSum !== null ? k.rawSum.toFixed(1)+"%" : "—"}</div>
                        <div style={{height:3,background:"var(--bd2)",borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:2,background:k.slab.pct>=75?"var(--green)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}/></div>
                      </td>
                    ))}
                    <td style={{textAlign:"center"}}><span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:600,background:scoreBg(qa.totalScore),color:scoreColor(qa.totalScore)}}>{qa.totalScore.toFixed(1)}</span></td>
                  </tr>
                </React.Fragment>);
              })}
            </tbody></table></div>}
          </div>

        </div>;
      })()}

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
  const [activePlans, setActivePlans] = useState([]);
  const [planWeeks, setPlanWeeks] = useState([]);
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
        const [r, s, ap, apw] = await Promise.all([
          sb.query("qa_roster", {select:"email,display_name,manager_email,queue",token}).catch(()=>[]),
          sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch(()=>[]),
          sb.query("action_plans", {select:"*",filters:"status=eq.active",token}).catch(()=>[]),
          sb.query("action_plan_weeks", {select:"*",filters:"order=plan_id.asc,week_number.asc",token}).catch(()=>[]),
        ]);
        setRoster(r);
        setSessions(s);
        setActivePlans(ap);
        setPlanWeeks(apw);
      } catch (e) { console.error("Coaching load:", e); }
    })();
  }, [token]);

  // Get previous sessions for selected member
  const memberHistory = sessions.filter(s => s.member_email?.toLowerCase() === toEmail.toLowerCase()).slice(0, 5);

  // ── AP/PIP Integration: detect active plan for selected member ──
  const memberActivePlan = activePlans.find(p => p.qa_email?.toLowerCase() === toEmail.toLowerCase());
  const memberPlanWeeks = memberActivePlan ? planWeeks.filter(w => w.plan_id === memberActivePlan.id).sort((a, b) => a.week_number - b.week_number) : [];
  const nextUnfilledWeek = memberPlanWeeks.find(w => !w.actual_data);

  // Auto-fill target rows from active plan when meeting type is AP/PIP Review
  const autoFillFromPlan = () => {
    if (!memberActivePlan) return;
    const targets = (() => { try { return JSON.parse(memberActivePlan.targets || "[]"); } catch { return []; } })();
    if (targets.length === 0) return;
    const newRows = targets.map(t => {
      // Find current week's target
      const weekTargetData = nextUnfilledWeek ? (() => { try { return JSON.parse(nextUnfilledWeek.target_data || "{}"); } catch { return {}; } })() : {};
      const weekTarget = weekTargetData[t.kpi_key];
      return {
        metric: t.label,
        start: t.current_value !== null ? String(Math.round(t.current_value)) : "",
        w1: t.weekly_targets?.[0] ? String(t.weekly_targets[0]) : "",
        w2: t.weekly_targets?.[1] ? String(t.weekly_targets[1]) : "",
        w3: t.weekly_targets?.[2] ? String(t.weekly_targets[2]) : "",
        w4: t.weekly_targets?.[3] ? String(t.weekly_targets[3]) : "",
        a1: "", a2: "", a3: "", a4: "",
        _kpi_key: t.kpi_key, // internal ref for writing back
      };
    });
    setTargetRows(newRows);
    // Auto-switch to the right meeting type
    if (memberActivePlan.type === "pip" && meetingType !== "PIP Review") setMeetingType("PIP Review");
    else if (memberActivePlan.type === "ap" && meetingType !== "Action Plan Review") setMeetingType("Action Plan Review");
    show("success", `Targets auto-filled from active ${memberActivePlan.type.toUpperCase()} plan (Week ${nextUnfilledWeek?.week_number || "—"})`);
  };

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

      // ── AP/PIP Write-back: update action_plan_weeks with actuals from this coaching session ──
      if (isTargetType && memberActivePlan && nextUnfilledWeek) {
        try {
          // Parse actuals from target rows (a1-a4 columns)
          const KPI_RAW_KEYS = { "Occupancy": "occupancy", "Coaching On-Time": "coaching", "Calibration": "calibration", "Coaching Observation": "observation", "RTR Score": "rtr" };
          const actualData = {};
          targetRows.forEach(r => {
            const kpiKey = r._kpi_key || KPI_RAW_KEYS[r.metric];
            if (kpiKey) {
              // Use the latest filled actual value (a4 > a3 > a2 > a1)
              const val = [r.a4, r.a3, r.a2, r.a1].find(v => v !== "" && v !== undefined);
              if (val !== undefined && val !== "") actualData[kpiKey] = parseFloat(val);
            }
          });

          if (Object.keys(actualData).length > 0) {
            // Check if targets met
            const weekTargetData = (() => { try { return JSON.parse(nextUnfilledWeek.target_data || "{}"); } catch { return {}; } })();
            const metTargets = Object.keys(weekTargetData).every(key => {
              const actual = actualData[key];
              const target = weekTargetData[key];
              return actual !== null && actual !== undefined && target !== undefined && actual >= target;
            });

            // Get the coaching session ID we just created
            const latestSession = s.find(sess => sess.member_email?.toLowerCase() === toEmail.toLowerCase() && sess.session_date === sessionDate);

            await sb.query("action_plan_weeks", {
              token, method: "PATCH",
              body: {
                actual_data: JSON.stringify(actualData),
                met_targets: metTargets,
                coaching_session_id: latestSession?.id || null,
                updated_at: new Date().toISOString(),
              },
              filters: `id=eq.${nextUnfilledWeek.id}`,
            });
            show("success", `Email sent & Week ${nextUnfilledWeek.week_number} actuals written to ${memberActivePlan.type.toUpperCase()} plan${metTargets ? " ✅ Targets met!" : " ❌ Targets not met"}`);
          } else {
            show("success", "Email sent and session logged successfully!");
          }
        } catch (e) {
          console.error("AP/PIP write-back:", e);
          show("success", "Email sent! (Note: could not write back to AP/PIP plan)");
        }
      } else {
        show("success", "Email sent and session logged successfully!");
      }
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
              <div className="form-group" style={{position:"relative"}}><label className="form-label">Team member email (To)</label>
                <input className="form-input" value={toEmail} onChange={e=>{setToEmail(e.target.value);}} placeholder="Type name or email..." autoComplete="off"/>
                {toEmail && !roster.find(r=>r.email===toEmail) && (() => {
                  const q = toEmail.toLowerCase();
                  const matches = roster.filter(r => (r.email||"").toLowerCase().includes(q) || (r.display_name||"").toLowerCase().includes(q)).slice(0, 8);
                  if (!matches.length) return null;
                  return <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:"0 0 var(--radius) var(--radius)",boxShadow:"var(--shadow-lg)",maxHeight:200,overflowY:"auto"}}>
                    {matches.map(r => <div key={r.email} onClick={()=>{setToEmail(r.email);const mgr=r.manager_email;if(mgr)setCcEmail(mgr);}} style={{padding:"8px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontWeight:500}}>{r.display_name || nameFromEmail(r.email)}</span>
                      <span style={{color:"var(--tx3)",fontSize:12}}>{r.email}</span>
                    </div>)}
                  </div>;
                })()}
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

          {/* Active AP/PIP plan notice */}
          {toEmail && memberActivePlan && <div style={{padding:"12px 16px",background:memberActivePlan.type==="pip"?"var(--red-bg)":"var(--amber-bg)",borderRadius:8,border:`1px solid ${memberActivePlan.type==="pip"?"var(--red)":"var(--amber)"}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>{memberActivePlan.type==="pip"?"⚠️":"📋"}</span>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:memberActivePlan.type==="pip"?"var(--red)":"var(--amber)"}}>Active {memberActivePlan.type.toUpperCase()} plan</div>
                <div style={{fontSize:11,color:"var(--tx2)"}}>
                  Week {memberPlanWeeks.filter(w=>w.actual_data).length + 1} of {memberActivePlan.duration_weeks} · {nextUnfilledWeek ? "Next review due" : "All weeks filled"}
                </div>
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={autoFillFromPlan} style={{fontWeight:600}}>Auto-fill targets from plan</button>
          </div>}

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
          <thead><tr><th>Date</th><th>Type</th><th>Member</th><th>Sent by</th><th>Performance</th><th>Outcome</th>{hasRole(profile?.role,"super_admin")&&<th></th>}</tr></thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
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
                {hasRole(profile?.role,"super_admin")&&<td>
                  <button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={async(e)=>{
                    e.stopPropagation();
                    if(!confirm("Delete this coaching session log?"))return;
                    try{
                      await sb.query("coaching_sessions",{token,method:"DELETE",filters:`id=eq.${s.id}`});
                      setSessions(sessions.filter(x=>x.id!==s.id));
                      show("success","Session deleted");
                    }catch(err){show("error",err.message);}
                  }}><Icon d={icons.trash} size={14}/></button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table></div>}
      </div>}

      {el}
    </div>
  );
}


function ActionPlanPage({ token, profile }) {
  const [tab, setTab] = useState("active"); // active | create | detection | history
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [mtd, setMtd] = useState([]);
  const [roster, setRoster] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [detections, setDetections] = useState([]);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const { show, el } = useToast();

  // ── Create form state ──
  const [selQaEmail, setSelQaEmail] = useState("");
  const [planType, setPlanType] = useState("ap"); // ap | pip
  const [planDuration, setPlanDuration] = useState(4);
  const [planReason, setPlanReason] = useState("");
  const [planTargets, setPlanTargets] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // ── Conclusion modal state ──
  const [concludingPlan, setConcludingPlan] = useState(null);
  const [conclusionOutcome, setConclusionOutcome] = useState("");
  const [conclusionNotes, setConclusionNotes] = useState("");

  // ── Slab engine (same as dashboard/leaderboard) ──
  const KPI_SLABS = {
    occupancy:   { label: "Occupancy",           weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
    coaching:    { label: "Coaching On-Time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
    calibration: { label: "Calibration",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
    observation: { label: "Coaching Observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
    rtr:         { label: "RTR Score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
  };

  const parseRaw = (val) => {
    if (!val && val !== 0) return null;
    const s = String(val).trim().replace(",", ".");
    if (s.includes("%")) return parseFloat(s.replace("%", ""));
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    if (n >= 0 && n <= 2) return n * 100;
    return n;
  };

  const calcSlab = (rawPct, th) => {
    if (rawPct === null) return { slab: 0, pct: 0, label: "Slab 0" };
    if (rawPct >= th[2]) return { slab: 3, pct: 100, label: "Slab 3" };
    if (rawPct >= th[1]) return { slab: 2, pct: 75, label: "Slab 2" };
    if (rawPct >= th[0]) return { slab: 1, pct: 50, label: "Slab 1" };
    return { slab: 0, pct: 0, label: "Slab 0" };
  };

  const getKpiScores = (row) => {
    return Object.entries(KPI_SLABS).map(([key, def]) => {
      const rawPct = parseRaw(row[def.rawKey]);
      const slab = calcSlab(rawPct, def.thresholds);
      const score = (def.weight * slab.pct) / 100;
      return { key, label: def.label, weight: def.weight, rawPct, slab, score, thresholds: def.thresholds, rawKey: def.rawKey };
    });
  };

  const getTotalScore = (row) => getKpiScores(row).reduce((s, k) => s + k.score, 0);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const c = p.replace(/[\d]+$/, "");
      return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const initialsFromEmail = (email) => {
    const name = nameFromEmail(email);
    const parts = name.split(" ");
    return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
  };

  const scoreColor = (v) => v >= 55 * 0.7 ? "var(--green)" : v >= 55 * 0.4 ? "var(--amber)" : "var(--red)";
  const scoreBg = (v) => v >= 55 * 0.7 ? "var(--green-bg)" : v >= 55 * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";

  // ── Data loading ──
  const load = useCallback(async () => {
    try {
      const [planRows, weekRows, mtdRows, rosterRows, profRows] = await Promise.all([
        sb.query("action_plans", { select: "*", filters: "order=created_at.desc", token }).catch(() => []),
        sb.query("action_plan_weeks", { select: "*", filters: "order=plan_id.asc,week_number.asc", token }).catch(() => []),
        sb.query("mtd_scores", { select: "*", filters: "order=month.desc", token }).catch(() => []),
        sb.query("qa_roster", { select: "email,display_name,queue,manager_email", token }).catch(() => []),
        sb.query("profiles", { select: "id,email,display_name,role", filters: "status=eq.active", token }).catch(() => []),
      ]);
      setPlans(planRows);
      setWeeks(weekRows);
      setMtd(mtdRows);
      setRoster(rosterRows);
      setProfiles(profRows);

      // ── Auto-detection engine ──
      runDetection(mtdRows, planRows);
    } catch (e) { console.error("AP/PIP load:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // ── Auto-detection: find QAs who qualify for AP ──
  const runDetection = (mtdRows, existingPlans) => {
    const months = [...new Set(mtdRows.map(r => r.month))].sort().reverse();
    if (months.length < 2) { setDetections([]); return; }

    const latestMonth = months[0];
    const prevMonth = months[1];
    const latestData = mtdRows.filter(r => r.month === latestMonth);
    const prevData = mtdRows.filter(r => r.month === prevMonth);

    // Emails with active plans already
    const activePlanEmails = existingPlans
      .filter(p => p.status === "active" || p.status === "pending_review")
      .map(p => p.qa_email?.toLowerCase());

    const flagged = [];

    latestData.forEach(row => {
      const email = row.qa_email?.toLowerCase();
      if (activePlanEmails.includes(email)) return; // already on a plan

      const kpis = getKpiScores(row);
      const totalScore = getTotalScore(row);
      const slab0Count = kpis.filter(k => k.slab.slab === 0 && k.rawPct !== null).length;

      // Check previous month too
      const prevRow = prevData.find(r => r.qa_email?.toLowerCase() === email);
      const prevScore = prevRow ? getTotalScore(prevRow) : null;
      const prevSlab0 = prevRow ? getKpiScores(prevRow).filter(k => k.slab.slab === 0 && k.rawPct !== null).length : 0;

      let reason = null;
      let severity = "medium";

      // Condition 1: Slab 0 on 2+ KPIs in latest month
      if (slab0Count >= 2) {
        reason = `${slab0Count} KPIs at Slab 0 in ${latestMonth}`;
        severity = slab0Count >= 3 ? "high" : "medium";
      }

      // Condition 2: Total score < 20/55 for 2 consecutive months
      if (totalScore < 20 && prevScore !== null && prevScore < 20) {
        reason = (reason ? reason + " + " : "") + `Score below 20 for 2 consecutive months (${prevMonth}: ${prevScore.toFixed(1)}, ${latestMonth}: ${totalScore.toFixed(1)})`;
        severity = "high";
      }

      // Condition 3: Slab 0 on 2+ KPIs in both months
      if (slab0Count >= 2 && prevSlab0 >= 2) {
        severity = "critical";
      }

      if (reason) {
        flagged.push({
          email: row.qa_email,
          name: nameFromEmail(row.qa_email),
          reason,
          severity,
          totalScore,
          prevScore,
          slab0Count,
          kpis,
          latestMonth,
          prevMonth,
          tl: row.qa_tl,
        });
      }
    });

    // Sort by severity then score
    const sevOrder = { critical: 0, high: 1, medium: 2 };
    flagged.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) || a.totalScore - b.totalScore);
    setDetections(flagged);
  };

  // ── Generate suggested targets based on current scores ──
  const generateTargets = (qaEmail) => {
    const months = [...new Set(mtd.map(r => r.month))].sort().reverse();
    const latestMonth = months[0];
    const row = mtd.find(r => r.month === latestMonth && r.qa_email?.toLowerCase() === qaEmail.toLowerCase());
    if (!row) return [];

    return Object.entries(KPI_SLABS).map(([key, def]) => {
      const rawPct = parseRaw(row[def.rawKey]);
      const slab = calcSlab(rawPct, def.thresholds);

      // Suggest target: if at Slab 0, target Slab 1 threshold.
      // If at Slab 1, target Slab 2 threshold. etc.
      let targetPct;
      if (slab.slab === 0) targetPct = def.thresholds[0]; // aim for Slab 1
      else if (slab.slab === 1) targetPct = def.thresholds[1]; // aim for Slab 2
      else if (slab.slab === 2) targetPct = def.thresholds[2]; // aim for Slab 3
      else targetPct = def.thresholds[2]; // maintain Slab 3

      // Generate weekly progression targets (linear ramp from current to target)
      const current = rawPct !== null ? rawPct : 0;
      const weeklyTargets = [];
      const duration = planType === "pip" ? planDuration : 4;
      for (let w = 1; w <= duration; w++) {
        const progress = w / duration;
        const weekTarget = Math.round((current + (targetPct - current) * progress) * 10) / 10;
        weeklyTargets.push(Math.min(weekTarget, targetPct));
      }

      return {
        kpi_key: key,
        label: def.label,
        raw_key: def.rawKey,
        current_value: rawPct,
        current_slab: slab.label,
        target_value: targetPct,
        target_slab: slab.slab < 3 ? `Slab ${slab.slab + 1}` : "Slab 3",
        weekly_targets: weeklyTargets,
        weight: def.weight,
        thresholds: def.thresholds,
        needs_improvement: slab.slab <= 1,
      };
    });
  };

  // ── Start creating a plan (from detection or manually) ──
  const startCreate = (qaEmail, type) => {
    setSelQaEmail(qaEmail || "");
    setPlanType(type || "ap");
    setPlanDuration(type === "pip" ? 8 : 4);
    setPlanReason("");
    if (qaEmail) {
      const targets = generateTargets(qaEmail);
      setPlanTargets(targets);
    } else {
      setPlanTargets([]);
    }
    setShowCreateForm(true);
    setTab("create");
  };

  // When QA email changes in create form, regenerate targets
  const handleQaEmailChange = (email) => {
    setSelQaEmail(email);
    if (email && roster.find(r => r.email?.toLowerCase() === email.toLowerCase())) {
      setPlanTargets(generateTargets(email));
    }
  };

  // ── Save plan to Supabase ──
  const savePlan = async () => {
    if (!selQaEmail) { show("error", "Select a QA specialist"); return; }
    if (!planReason.trim()) { show("error", "Provide a reason for this plan"); return; }

    // Check for existing active plan
    const existing = plans.find(p =>
      p.qa_email?.toLowerCase() === selQaEmail.toLowerCase() &&
      (p.status === "active" || p.status === "pending_review")
    );
    if (existing) {
      show("error", `${nameFromEmail(selQaEmail)} already has an active ${existing.type.toUpperCase()} plan`);
      return;
    }

    setLoading(true);
    try {
      const startDate = new Date().toISOString().split("T")[0];
      const endDate = new Date(Date.now() + planDuration * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Serialize targets
      const targetsJson = planTargets.map(t => ({
        kpi_key: t.kpi_key,
        label: t.label,
        raw_key: t.raw_key,
        current_value: t.current_value,
        target_value: t.target_value,
        weekly_targets: t.weekly_targets,
        weight: t.weight,
        thresholds: t.thresholds,
      }));

      // Find QA's TL
      const qaRoster = roster.find(r => r.email?.toLowerCase() === selQaEmail.toLowerCase());

      const [planResult] = await sb.query("action_plans", {
        token, method: "POST",
        body: {
          qa_email: selQaEmail,
          type: planType,
          status: "active",
          reason: planReason,
          targets: JSON.stringify(targetsJson),
          start_date: startDate,
          end_date: endDate,
          duration_weeks: planDuration,
          created_by: profile?.email,
          tl_email: qaRoster?.manager_email || profile?.email,
          team: qaRoster?.queue || null,
        }
      });

      // Create week rows
      if (planResult?.id) {
        const weekBodies = [];
        for (let w = 1; w <= planDuration; w++) {
          const weekStart = new Date(Date.now() + (w - 1) * 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const targetData = {};
          planTargets.forEach(t => {
            targetData[t.kpi_key] = t.weekly_targets[w - 1] ?? t.target_value;
          });
          weekBodies.push({
            plan_id: planResult.id,
            week_number: w,
            week_start: weekStart,
            target_data: JSON.stringify(targetData),
            actual_data: null,
            met_targets: null,
            coaching_session_id: null,
            notes: null,
          });
        }
        await sb.query("action_plan_weeks", { token, method: "POST", body: weekBodies });
      }

      show("success", `${planType.toUpperCase()} created for ${nameFromEmail(selQaEmail)}`);
      setShowCreateForm(false);
      setTab("active");
      load();
    } catch (e) {
      show("error", e.message);
    }
    setLoading(false);
  };

  // ── Update week actuals ──
  const updateWeekActuals = async (weekId, qaEmail) => {
    // Pull latest MTD data for this QA
    const months = [...new Set(mtd.map(r => r.month))].sort().reverse();
    const latestMonth = months[0];
    const row = mtd.find(r => r.month === latestMonth && r.qa_email?.toLowerCase() === qaEmail.toLowerCase());
    if (!row) { show("error", "No MTD data found for " + nameFromEmail(qaEmail)); return; }

    const actualData = {};
    Object.entries(KPI_SLABS).forEach(([key, def]) => {
      actualData[key] = parseRaw(row[def.rawKey]);
    });

    // Check if targets met
    const week = weeks.find(w => w.id === weekId);
    let targetData = {};
    try { targetData = JSON.parse(week?.target_data || "{}"); } catch { }

    const metTargets = Object.keys(targetData).every(key => {
      const actual = actualData[key];
      const target = targetData[key];
      return actual !== null && actual >= target;
    });

    try {
      await sb.query("action_plan_weeks", {
        token, method: "PATCH",
        body: {
          actual_data: JSON.stringify(actualData),
          met_targets: metTargets,
          updated_at: new Date().toISOString(),
        },
        filters: `id=eq.${weekId}`,
      });
      show("success", "Week actuals updated from MTD data");
      load();
    } catch (e) { show("error", e.message); }
  };

  // ── Conclude plan ──
  const concludePlan = async () => {
    if (!concludingPlan || !conclusionOutcome) return;
    setLoading(true);
    try {
      await sb.query("action_plans", {
        token, method: "PATCH",
        body: {
          status: conclusionOutcome === "pass" ? "completed_pass" : "completed_fail",
          conclusion: conclusionOutcome,
          conclusion_notes: conclusionNotes,
          concluded_by: profile?.email,
          concluded_at: new Date().toISOString(),
        },
        filters: `id=eq.${concludingPlan.id}`,
      });

      // If PIP failed → auto-create DAM flag
      if (concludingPlan.type === "pip" && conclusionOutcome === "fail") {
        try {
          const qaProfile = profiles.find(p => p.email?.toLowerCase() === concludingPlan.qa_email?.toLowerCase());
          if (qaProfile) {
            await sb.query("dam_flags", {
              token, method: "POST",
              body: {
                profile_id: qaProfile.id,
                severity: "critical",
                recommended_action: "termination_review",
                notes: `PIP failed. Plan ID: ${concludingPlan.id}. ${conclusionNotes}`,
                status: "pending",
                occurrence_number: 1,
                trigger_data: JSON.stringify({ source: "pip_failure", plan_id: concludingPlan.id }),
              }
            });
            show("success", "PIP failed — DAM flag created for HR investigation");
          }
        } catch (e) { console.error("DAM flag creation:", e); }
      }

      // If AP failed → create DAM flag (performance_management) — DAM handles escalation
      if (concludingPlan.type === "ap" && conclusionOutcome === "fail") {
        try {
          const qaProfile = profiles.find(p => p.email?.toLowerCase() === concludingPlan.qa_email?.toLowerCase());
          if (qaProfile) {
            // Find the performance_management rule
            let pmRule = null;
            try {
              const rules = await sb.query("dam_rules", { select: "id,name,behavior_type", filters: "behavior_type=eq.performance_management&is_active=eq.true&limit=1", token });
              pmRule = rules[0] || null;
            } catch { }

            // Count existing occurrences for this person + rule
            let occurrence = 1;
            if (pmRule) {
              try {
                const existing = await sb.query("dam_flags", { select: "id", filters: `profile_id=eq.${qaProfile.id}&rule_id=eq.${pmRule.id}&status=neq.dismissed`, token });
                occurrence = (existing?.length || 0) + 1;
              } catch { }
            }

            // Get escalation step for this occurrence
            let step = null;
            if (pmRule) {
              try {
                const steps = await sb.query("dam_escalation_steps", { select: "*", filters: `rule_id=eq.${pmRule.id}&occurrence=eq.${occurrence}`, token });
                step = steps[0] || null;
              } catch { }
            }

            await sb.query("dam_flags", {
              token, method: "POST",
              body: {
                profile_id: qaProfile.id,
                rule_id: pmRule?.id || null,
                severity: "warning",
                recommended_action: step?.includes_pip ? "pip" : (step?.is_hr_investigation ? "termination_review" : "coaching"),
                notes: `Action Plan failed. Plan ID: ${concludingPlan.id}. ${conclusionNotes}`,
                status: "pending",
                occurrence_number: occurrence,
                escalation_step_id: step?.id || null,
                trigger_data: JSON.stringify({ source: "ap_failure", plan_id: concludingPlan.id, step_action: step?.action || "No step defined" }),
              }
            });
            show("success", `AP failed — DAM flag created (occurrence #${occurrence}${step ? ": " + step.action : ""})`);
          }
        } catch (e) {
          console.error("DAM flag creation:", e);
          show("error", "AP concluded as failed. Could not create DAM flag: " + e.message);
        }
      } else {
        show("success", `${concludingPlan.type.toUpperCase()} concluded as ${conclusionOutcome === "pass" ? "PASSED" : "FAILED"}`);
      }

      setConcludingPlan(null);
      setConclusionOutcome("");
      setConclusionNotes("");
      load();
    } catch (e) { show("error", e.message); }
    setLoading(false);
  };

  // ── Dismiss detection ──
  const dismissDetection = (email) => {
    setDetections(prev => prev.filter(d => d.email !== email));
    show("success", "Detection dismissed for " + nameFromEmail(email));
  };

  // ── Helper: parse JSON safely ──
  const safeJson = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
  const safeJsonArr = (str) => { try { return JSON.parse(str || "[]"); } catch { return []; } };

  // ── Filtered plans ──
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSupervisor = hasRole(profile?.role, "qa_supervisor");
  const isAdmin = hasRole(profile?.role, "admin");
  const myEmail = profile?.email?.toLowerCase();
  const myDomain = profile?.operational_domain || profile?.domain || "tabby.ai";

  // Leads see their team's plans; supervisors see their domain; admins see all
  const myTeamEmails = roster.filter(r => r.manager_email?.toLowerCase() === myEmail).map(r => r.email?.toLowerCase());
  const visiblePlans = isAdmin ? plans : isSupervisor ? plans.filter(p =>
    p.qa_email?.endsWith("@" + myDomain)
  ) : plans.filter(p =>
    p.created_by?.toLowerCase() === myEmail ||
    p.tl_email?.toLowerCase() === myEmail ||
    myTeamEmails.includes(p.qa_email?.toLowerCase())
  );

  const activePlans = visiblePlans.filter(p => p.status === "active" || p.status === "pending_review");
  const historyPlans = visiblePlans.filter(p => p.status !== "active" && p.status !== "pending_review");

  const getWeeksForPlan = (planId) => weeks.filter(w => w.plan_id === planId).sort((a, b) => a.week_number - b.week_number);

  // ── Calculate plan progress ──
  const getPlanProgress = (plan) => {
    const planWeeks = getWeeksForPlan(plan.id);
    const filledWeeks = planWeeks.filter(w => w.actual_data);
    const metWeeks = planWeeks.filter(w => w.met_targets === true);
    const totalWeeks = plan.duration_weeks || planWeeks.length;
    const elapsed = filledWeeks.length;
    const remaining = totalWeeks - elapsed;
    const successRate = filledWeeks.length ? (metWeeks.length / filledWeeks.length * 100) : 0;
    return { totalWeeks, elapsed, remaining, metWeeks: metWeeks.length, successRate, planWeeks, filledWeeks };
  };

  // ── Auto-calculate pass recommendation ──
  const getAutoRecommendation = (plan) => {
    const { planWeeks, metWeeks, filledWeeks } = getPlanProgress(plan);
    if (filledWeeks.length === 0) return null;
    // Pass if >= 60% of filled weeks met targets
    const rate = metWeeks / filledWeeks.length;
    if (rate >= 0.6) return "pass";
    return "fail";
  };

  if (loading && plans.length === 0) return <div className="page"><div className="loading-spinner"><div className="spinner" /></div></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title">Action Plans & PIPs</div>
          <div className="page-subtitle">
            {activePlans.length} active plan{activePlans.length !== 1 ? "s" : ""} · {detections.length} detected
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => startCreate("", "ap")}>
          <Icon d={icons.plus} size={16} />New plan
        </button>
      </div>

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>
          Active ({activePlans.length})
        </button>
        <button className={`tab-btn ${tab === "detection" ? "active" : ""}`} onClick={() => setTab("detection")}>
          Detection {detections.length > 0 && <span style={{ marginLeft: 4, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "var(--red-bg)", color: "var(--red)" }}>{detections.length}</span>}
        </button>
        {showCreateForm && <button className={`tab-btn ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>
          Create plan
        </button>}
        <button className={`tab-btn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          History ({historyPlans.length})
        </button>
      </div>

      {/* ═══ DETECTION TAB ═══ */}
      {tab === "detection" && <div>
        {detections.length === 0 ? (
          <div className="card"><div className="placeholder" style={{ padding: "40px" }}>
            <div className="placeholder-icon"><Icon d={icons.check} size={28} /></div>
            <h3>No auto-detections</h3>
            <p>No QAs currently meet the criteria for AP recommendation.<br />Detection runs on: Slab 0 on 2+ KPIs, or score &lt; 20/55 for 2 consecutive months.</p>
          </div></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: "10px 14px", background: "var(--amber-bg)", borderRadius: 8, fontSize: 13, color: "var(--amber)", fontWeight: 500 }}>
              ⚠️ {detections.length} QA specialist{detections.length !== 1 ? "s" : ""} flagged for potential Action Plan. Review and confirm below.
            </div>
            {detections.map(d => (
              <div key={d.email} className="card" style={{
                borderLeft: `4px solid ${d.severity === "critical" ? "var(--red)" : d.severity === "high" ? "var(--amber)" : "var(--teal)"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
                      {initialsFromEmail(d.email)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                      <div style={{ fontSize: 12, color: "var(--tx3)" }}>{d.email} · TL: {d.tl ? nameFromEmail(d.tl) : "—"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: d.severity === "critical" ? "var(--red-bg)" : d.severity === "high" ? "var(--amber-bg)" : "var(--green-bg)",
                      color: d.severity === "critical" ? "var(--red)" : d.severity === "high" ? "var(--amber)" : "var(--green)",
                    }}>{d.severity.toUpperCase()}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(d.totalScore) }}>
                      {d.totalScore.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--tx3)" }}> / 55</span>
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, color: "var(--tx2)" }}>
                  {d.reason}
                </div>

                {/* KPI breakdown mini */}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {d.kpis.map(k => (
                    <div key={k.key} style={{
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                      background: k.slab.slab === 0 ? "var(--red-bg)" : k.slab.slab === 1 ? "var(--amber-bg)" : "var(--green-bg)",
                      color: k.slab.slab === 0 ? "var(--red)" : k.slab.slab === 1 ? "var(--amber)" : "var(--green)",
                    }}>
                      {k.label}: {k.rawPct !== null ? k.rawPct.toFixed(1) + "%" : "—"} ({k.slab.label})
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => startCreate(d.email, "ap")}>
                    <Icon d={icons.plan} size={14} />Create AP
                  </button>
                  {d.severity === "critical" && (
                    <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={() => startCreate(d.email, "pip")}>
                      <Icon d={icons.dam} size={14} />Create PIP
                    </button>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={() => dismissDetection(d.email)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* ═══ CREATE TAB ═══ */}
      {tab === "create" && showCreateForm && <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Create {planType === "pip" ? "Performance Improvement Plan" : "Action Plan"}</span>
          </div>
          <div className="form-grid">
            <div className="form-group" style={{ position: "relative" }}>
              <label className="form-label">QA Specialist</label>
              <input className="form-input" value={selQaEmail} onChange={e => handleQaEmailChange(e.target.value)} placeholder="Type name or email..." autoComplete="off" />
              {selQaEmail && !roster.find(r => r.email === selQaEmail) && (() => {
                const q = selQaEmail.toLowerCase();
                const matches = roster.filter(r => (r.email || "").toLowerCase().includes(q) || (r.display_name || "").toLowerCase().includes(q)).slice(0, 8);
                if (!matches.length) return null;
                return <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: "0 0 var(--radius) var(--radius)", boxShadow: "var(--shadow-lg)", maxHeight: 200, overflowY: "auto" }}>
                  {matches.map(r => <div key={r.email} onClick={() => handleQaEmailChange(r.email)} style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--bd2)", display: "flex", justifyContent: "space-between" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontWeight: 500 }}>{r.display_name || nameFromEmail(r.email)}</span>
                    <span style={{ color: "var(--tx3)", fontSize: 12 }}>{r.email}</span>
                  </div>)}
                </div>;
              })()}
            </div>
            <div className="form-group">
              <label className="form-label">Plan type</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setPlanType("ap"); setPlanDuration(4); }} className={`btn ${planType === "ap" ? "btn-primary" : "btn-outline"}`} style={planType === "ap" ? { background: "var(--amber)" } : {}}>
                  📋 Action Plan
                </button>
                <button onClick={() => { setPlanType("pip"); setPlanDuration(8); }} className={`btn ${planType === "pip" ? "btn-primary" : "btn-outline"}`} style={planType === "pip" ? { background: "var(--red)", color: "#fff" } : {}}>
                  ⚠️ PIP
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Duration (weeks)</label>
              <select className="select form-input" value={planDuration} onChange={e => setPlanDuration(Number(e.target.value))}>
                {planType === "ap" ? (
                  <option value={4}>4 weeks</option>
                ) : (
                  <>
                    <option value={4}>4 weeks</option>
                    <option value={6}>6 weeks</option>
                    <option value={8}>8 weeks</option>
                  </>
                )}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Reason / justification</label>
              <textarea className="form-input" rows={2} value={planReason} onChange={e => setPlanReason(e.target.value)} placeholder="Why is this plan being created? Reference specific KPIs, months, patterns..." style={{ resize: "vertical" }} />
            </div>
          </div>
        </div>

        {/* Target configuration */}
        {planTargets.length > 0 && <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Weekly targets</span>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>Auto-populated from current scores — adjust as needed</span>
          </div>
          <div className="table-wrap">
            <table style={{ fontSize: 12 }}>
              <thead><tr>
                <th>KPI</th>
                <th style={{ textAlign: "center" }}>Current</th>
                <th style={{ textAlign: "center" }}>Current slab</th>
                <th style={{ textAlign: "center" }}>Target</th>
                <th style={{ textAlign: "center" }}>Target slab</th>
                {Array.from({ length: planDuration }, (_, i) => (
                  <th key={i} style={{ textAlign: "center" }}>W{i + 1}</th>
                ))}
                <th style={{ textAlign: "center" }}>Needs work</th>
              </tr></thead>
              <tbody>
                {planTargets.map((t, ti) => (
                  <tr key={t.kpi_key} style={{ background: t.needs_improvement ? "var(--red-bg)" : "transparent" }}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{t.label}</td>
                    <td style={{ textAlign: "center", fontWeight: 500, color: t.needs_improvement ? "var(--red)" : "var(--green)" }}>
                      {t.current_value !== null ? t.current_value.toFixed(1) + "%" : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        padding: "1px 6px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                        background: t.current_slab === "Slab 0" ? "var(--red-bg)" : t.current_slab === "Slab 1" ? "var(--amber-bg)" : "var(--green-bg)",
                        color: t.current_slab === "Slab 0" ? "var(--red)" : t.current_slab === "Slab 1" ? "var(--amber)" : "var(--green)",
                      }}>{t.current_slab}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input type="number" className="form-input" value={t.target_value} onChange={e => {
                        const newTargets = [...planTargets];
                        newTargets[ti] = { ...newTargets[ti], target_value: Number(e.target.value) };
                        // Recalculate weekly progression
                        const current = t.current_value || 0;
                        const target = Number(e.target.value);
                        newTargets[ti].weekly_targets = Array.from({ length: planDuration }, (_, w) => {
                          const progress = (w + 1) / planDuration;
                          return Math.round(Math.min(current + (target - current) * progress, target) * 10) / 10;
                        });
                        setPlanTargets(newTargets);
                      }} style={{ width: 60, textAlign: "center", padding: "2px 4px", fontSize: 12 }} />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ padding: "1px 6px", borderRadius: 8, fontSize: 10, fontWeight: 600, background: "var(--green-bg)", color: "var(--green)" }}>{t.target_slab}</span>
                    </td>
                    {t.weekly_targets.slice(0, planDuration).map((wt, wi) => (
                      <td key={wi} style={{ textAlign: "center" }}>
                        <input type="number" className="form-input" value={wt} onChange={e => {
                          const newTargets = [...planTargets];
                          const newWeekly = [...newTargets[ti].weekly_targets];
                          newWeekly[wi] = Number(e.target.value);
                          newTargets[ti] = { ...newTargets[ti], weekly_targets: newWeekly };
                          setPlanTargets(newTargets);
                        }} style={{ width: 50, textAlign: "center", padding: "2px 4px", fontSize: 12 }} />
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }}>
                      {t.needs_improvement ? <span style={{ color: "var(--red)", fontWeight: 700 }}>⚠️</span> : <span style={{ color: "var(--green)" }}>✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 8, fontStyle: "italic" }}>
            Weekly targets are linearly interpolated from current value to target. Adjust individual weeks as needed.
          </div>
        </div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={savePlan} disabled={loading}>
            {loading ? "Creating..." : <><Icon d={icons.check} size={16} />Create {planType === "pip" ? "PIP" : "Action Plan"}</>}
          </button>
          <button className="btn btn-outline" onClick={() => { setShowCreateForm(false); setTab("active"); }}>Cancel</button>
        </div>
      </div>}

      {/* ═══ ACTIVE PLANS TAB ═══ */}
      {tab === "active" && <div>
        {activePlans.length === 0 ? (
          <div className="card"><div className="placeholder" style={{ padding: "40px" }}>
            <div className="placeholder-icon"><Icon d={icons.plan} size={28} /></div>
            <h3>No active plans</h3>
            <p>Create a new Action Plan or PIP from the Detection tab or the button above.</p>
          </div></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {activePlans.map(plan => {
              const prog = getPlanProgress(plan);
              const isExp = expandedPlan === plan.id;
              const targets = safeJsonArr(plan.targets);
              const autoRec = getAutoRecommendation(plan);
              const progressPct = prog.totalWeeks ? (prog.elapsed / prog.totalWeeks) * 100 : 0;
              const daysLeft = plan.end_date ? Math.max(0, Math.ceil((new Date(plan.end_date) - Date.now()) / (1000 * 60 * 60 * 24))) : null;

              return (
                <div key={plan.id} className="card" style={{
                  borderLeft: `4px solid ${plan.type === "pip" ? "var(--red)" : "var(--amber)"}`,
                }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, cursor: "pointer" }} onClick={() => setExpandedPlan(isExp ? null : plan.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: plan.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                        color: plan.type === "pip" ? "var(--red)" : "var(--amber)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700,
                      }}>
                        {plan.type === "pip" ? "⚠️" : "📋"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{nameFromEmail(plan.qa_email)}</div>
                        <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                          <span style={{
                            padding: "1px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                            background: plan.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                            color: plan.type === "pip" ? "var(--red)" : "var(--amber)",
                            marginRight: 6,
                          }}>{plan.type.toUpperCase()}</span>
                          {plan.team || "—"} · Created by {nameFromEmail(plan.created_by)} · {new Date(plan.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })} — {new Date(plan.end_date).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Progress</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: prog.successRate >= 60 ? "var(--green)" : "var(--red)" }}>
                          {prog.metWeeks}/{prog.elapsed} weeks met
                        </div>
                      </div>
                      {daysLeft !== null && <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Remaining</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: daysLeft <= 7 ? "var(--red)" : "var(--tx)" }}>{daysLeft}d</div>
                      </div>}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform .2s", transform: isExp ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop: 12, height: 6, background: "var(--bd2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: 3, background: prog.successRate >= 60 ? "var(--green)" : "var(--amber)", transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--tx3)", marginTop: 4 }}>
                    <span>Week {prog.elapsed} of {prog.totalWeeks}</span>
                    <span>Success rate: {prog.successRate.toFixed(0)}%</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--bd2)" }}>

                    {/* Reason */}
                    {plan.reason && <div style={{ marginBottom: 14, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, color: "var(--tx2)" }}>
                      <span style={{ fontWeight: 600, color: "var(--tx)" }}>Reason: </span>{plan.reason}
                    </div>}

                    {/* Weekly tracking table */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>Weekly tracking</div>
                    <div className="table-wrap">
                      <table style={{ fontSize: 12 }}>
                        <thead><tr>
                          <th>Week</th>
                          <th>Date</th>
                          {targets.map(t => <th key={t.kpi_key} style={{ textAlign: "center" }}>{t.label}</th>)}
                          <th style={{ textAlign: "center" }}>Met?</th>
                          <th style={{ width: 80 }}></th>
                        </tr></thead>
                        <tbody>
                          {prog.planWeeks.map(week => {
                            const targetData = safeJson(week.target_data);
                            const actualData = safeJson(week.actual_data);
                            const hasActuals = week.actual_data && Object.keys(actualData).length > 0;

                            return (
                              <tr key={week.id} style={{ background: hasActuals ? (week.met_targets ? "var(--green-bg)" : "var(--red-bg)") : "transparent" }}>
                                <td style={{ fontWeight: 600 }}>W{week.week_number}</td>
                                <td style={{ fontSize: 11, color: "var(--tx3)" }}>
                                  {week.week_start ? new Date(week.week_start + "T00:00:00").toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"}
                                </td>
                                {targets.map(t => {
                                  const target = targetData[t.kpi_key];
                                  const actual = actualData?.[t.kpi_key];
                                  const met = actual !== null && actual !== undefined && target !== undefined && actual >= target;
                                  return (
                                    <td key={t.kpi_key} style={{ textAlign: "center" }}>
                                      <div style={{ fontSize: 11, color: "var(--tx3)" }}>T: {target !== undefined ? target + "%" : "—"}</div>
                                      {hasActuals && <div style={{ fontSize: 12, fontWeight: 600, color: met ? "var(--green)" : "var(--red)" }}>
                                        A: {actual !== null && actual !== undefined ? actual.toFixed(1) + "%" : "—"}
                                      </div>}
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: "center" }}>
                                  {hasActuals ? (
                                    week.met_targets ?
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>✅</span> :
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>❌</span>
                                  ) : <span style={{ color: "var(--tx3)" }}>—</span>}
                                </td>
                                <td>
                                  {!hasActuals && <button className="btn btn-outline btn-sm" onClick={() => updateWeekActuals(week.id, plan.qa_email)} style={{ fontSize: 10, padding: "2px 8px" }}>
                                    Pull MTD
                                  </button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      {/* Pull all remaining weeks */}
                      {prog.planWeeks.some(w => !w.actual_data) && <button className="btn btn-outline btn-sm" onClick={async () => {
                        for (const w of prog.planWeeks.filter(w => !w.actual_data)) {
                          await updateWeekActuals(w.id, plan.qa_email);
                        }
                      }}>
                        <Icon d={icons.upload} size={14} />Pull all actuals from MTD
                      </button>}

                      {/* Conclude */}
                      <button className="btn btn-primary btn-sm" onClick={() => {
                        setConcludingPlan(plan);
                        const rec = getAutoRecommendation(plan);
                        setConclusionOutcome(rec || "");
                      }}>
                        <Icon d={icons.check} size={14} />Conclude {plan.type.toUpperCase()}
                      </button>

                      {/* Failed AP → suggest PIP */}
                      {plan.type === "ap" && prog.successRate < 50 && prog.elapsed >= 2 && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={() => startCreate(plan.qa_email, "pip")}>
                        <Icon d={icons.dam} size={14} />Escalate to PIP
                      </button>}
                    </div>

                    {/* Audit trail */}
                    <div style={{ marginTop: 14, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 11, color: "var(--tx3)" }}>
                      Created by {nameFromEmail(plan.created_by)} on {new Date(plan.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                      {plan.tl_email && <span> · TL: {nameFromEmail(plan.tl_email)}</span>}
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === "history" && <div className="card">
        {historyPlans.length === 0 ? (
          <div className="placeholder" style={{ padding: "40px" }}>
            <p style={{ color: "var(--tx3)" }}>No completed plans in history.</p>
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>QA Specialist</th>
              <th>Type</th>
              <th>Duration</th>
              <th style={{ textAlign: "center" }}>Result</th>
              <th>Created by</th>
              <th>Date range</th>
              <th>Concluded by</th>
              <th>Notes</th>
            </tr></thead>
            <tbody>
              {historyPlans.map(p => {
                const prog = getPlanProgress(p);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{nameFromEmail(p.qa_email)}</td>
                    <td>
                      <span style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                        background: p.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                        color: p.type === "pip" ? "var(--red)" : "var(--amber)",
                      }}>{p.type.toUpperCase()}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{p.duration_weeks}w</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        padding: "3px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: p.conclusion === "pass" ? "var(--green-bg)" : "var(--red-bg)",
                        color: p.conclusion === "pass" ? "var(--green)" : "var(--red)",
                      }}>
                        {p.conclusion === "pass" ? "✅ Passed" : "❌ Failed"}
                      </span>
                      <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{prog.metWeeks}/{prog.elapsed} weeks met</div>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>{nameFromEmail(p.created_by)}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>
                      {p.start_date ? new Date(p.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"} — {p.end_date ? new Date(p.end_date).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>{nameFromEmail(p.concluded_by)}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.conclusion_notes || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>}

      {/* ═══ CONCLUSION MODAL ═══ */}
      {concludingPlan && <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }} onClick={(e) => { if (e.target === e.currentTarget) setConcludingPlan(null); }}>
        <div className="card" style={{ width: "100%", maxWidth: 520, margin: 20 }}>
          <div className="card-header">
            <span className="card-title">Conclude {concludingPlan.type.toUpperCase()} — {nameFromEmail(concludingPlan.qa_email)}</span>
          </div>

          {/* Auto-recommendation */}
          {(() => {
            const rec = getAutoRecommendation(concludingPlan);
            const prog = getPlanProgress(concludingPlan);
            return rec ? (
              <div style={{ padding: "10px 14px", background: rec === "pass" ? "var(--green-bg)" : "var(--red-bg)", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: rec === "pass" ? "var(--green)" : "var(--red)" }}>
                  Auto-recommendation: {rec === "pass" ? "✅ PASS" : "❌ FAIL"}
                </span>
                <span style={{ color: "var(--tx2)", marginLeft: 8 }}>({prog.metWeeks}/{prog.elapsed} weeks met targets — {prog.successRate.toFixed(0)}%)</span>
              </div>
            ) : null;
          })()}

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setConclusionOutcome("pass")} className={`btn ${conclusionOutcome === "pass" ? "btn-primary" : "btn-outline"}`} style={conclusionOutcome === "pass" ? { background: "var(--green)", color: "#fff" } : {}}>✅ Passed</button>
            <button onClick={() => setConclusionOutcome("fail")} className={`btn ${conclusionOutcome === "fail" ? "btn-primary" : "btn-outline"}`} style={conclusionOutcome === "fail" ? { background: "var(--red)", color: "#fff" } : {}}>❌ Failed</button>
          </div>

          <div className="form-group">
            <label className="form-label">Conclusion notes</label>
            <textarea className="form-input" rows={3} value={conclusionNotes} onChange={e => setConclusionNotes(e.target.value)} placeholder="Document the final assessment..." style={{ resize: "vertical" }} />
          </div>

          {conclusionOutcome === "fail" && concludingPlan.type === "ap" && (
            <div style={{ padding: "8px 12px", background: "var(--amber-bg)", borderRadius: 6, fontSize: 12, color: "var(--amber)", fontWeight: 500, marginTop: 8 }}>
              ⚠️ Failed AP will recommend escalation to PIP.
            </div>
          )}
          {conclusionOutcome === "fail" && concludingPlan.type === "pip" && (
            <div style={{ padding: "8px 12px", background: "var(--red-bg)", borderRadius: 6, fontSize: 12, color: "var(--red)", fontWeight: 500, marginTop: 8 }}>
              ⚠️ Failed PIP will automatically create a DAM flag for HR investigation.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={concludePlan} disabled={!conclusionOutcome || loading}>
              {loading ? "Processing..." : "Confirm conclusion"}
            </button>
            <button className="btn btn-outline" onClick={() => { setConcludingPlan(null); setConclusionOutcome(""); setConclusionNotes(""); }}>Cancel</button>
          </div>
        </div>
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
  useEffect(()=>{(async()=>{let s=await sb.auth.handleCallback();if(!s)s=await sb.auth.getSession();if(s){setSession(s);try{const p=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user?.id}`,token:s.access_token});if(p.length>0)setProfile(p[0]);}catch(e){console.error("Profile:",e);}}setLoading(false);})();},[]);
  if(loading)return<div className="loading-fullscreen"><div className="spinner"/><p style={{marginTop:16,color:"var(--tx2)",fontSize:14}}>Loading portal...</p></div>;
  if(!session)return(<div className="login-page"><div className="login-card"><div style={{marginBottom:8}}><TabbyLogo size={28}/></div><div className="login-subtitle">QA Performance & Analytics Dashboard<br/>Sign in with your Tabby Google account.</div><button className="login-btn" onClick={()=>sb.auth.signInWithGoogle()}><GoogleLogo/>Sign in with Google</button><div className="login-divider">Supported domains</div><div className="login-domains"><span className="login-domain">@tabby.ai</span><span className="login-domain">@tabby.sa</span></div><div className="login-footer">Internal tool &middot; Tabby RADAR</div></div></div>);
  const userRole=profile?.role||"qa";const visibleNav=NAV_ITEMS.filter(n=>!n.minRole||hasRole(userRole,n.minRole)||n.key==="escalations");let curSec=null;
  const renderPage=()=>{const t=session.access_token;switch(page){
    case"dashboard":return<DashboardPage profile={profile} token={t}/>;
    case"scores":return<ScoreEntryPage token={t} profile={profile}/>;
    case"admin":return hasRole(userRole,"admin")?<AdminPage token={t} profile={profile}/>:<PlaceholderPage title="Admin panel" icon={icons.settings} minRole="admin" userRole={userRole}/>;
    case"leaderboard":return<LeaderboardPage token={t} profile={profile}/>;
    case"dam":return hasRole(userRole,"qa_lead")?<DAMPage token={t} profile={profile}/>:<PlaceholderPage title="DAM flags" icon={icons.dam} minRole="qa_lead" userRole={userRole}/>;
    case"plans":return hasRole(userRole,"qa_lead")?<ActionPlanPage token={t} profile={profile}/>:<PlaceholderPage title="Action plans & PIPs" icon={icons.plan} minRole="qa_lead" userRole={userRole}/>;
    case"coaching":return hasRole(userRole,"qa_lead")?<CoachingPage token={t} profile={profile}/>:<PlaceholderPage title="Coaching sessions" icon={icons.coaching} minRole="qa_lead" userRole={userRole}/>;
    case"hr":return<PlaceholderPage title="HR cases" description="Disciplinary case tracking." icon={icons.hr} minRole="qa_supervisor" userRole={userRole}/>;
    case"escalations":return<PlaceholderPage title="Escalations" description="Flag concerns about leadership." icon={icons.escalation} userRole={userRole}/>;
    default:return<DashboardPage profile={profile} token={t}/>;
  }};
  return(<div className="app-layout">
    <div className={`mobile-overlay ${sidebarOpen?"open":""}`} onClick={()=>setSidebarOpen(false)}/>
    <aside className={`sidebar ${sidebarOpen?"open":""}`}>
      <div className="sidebar-header"><div className="sidebar-brand">tabby<span>RADAR</span></div></div>
      <nav className="sidebar-nav">{visibleNav.map(item=>{let sh=null;if(item.section&&item.section!==curSec){curSec=item.section;sh=<div className="sidebar-section" key={`s-${item.section}`}>{item.section}</div>;}return(<div key={item.key}>{sh}<button className={`nav-item ${page===item.key?"active":""}`} onClick={()=>{setPage(item.key);setSidebarOpen(false);}}><Icon d={item.icon} size={18}/>{item.label}</button></div>);})}</nav>
      <div className="sidebar-profile"><div className="sidebar-avatar">{profile?.avatar_url?<img src={profile.avatar_url} alt="" referrerPolicy="no-referrer"/>:(profile?.display_name||"?")[0].toUpperCase()}</div><div className="sidebar-user"><div className="sidebar-user-name">{profile?.display_name||profile?.email}</div><div className="sidebar-user-role">{ROLE_LABELS[userRole]} &middot; {profile?.domain}</div></div><button className="sidebar-logout" onClick={sb.auth.signOut} title="Sign out"><Icon d={icons.logout} size={16}/></button></div>
    </aside>
    <div className="main-content"><div className="topbar"><button className="topbar-menu" onClick={()=>setSidebarOpen(true)}><Icon d={icons.menu} size={22}/></button><span className="topbar-title">{NAV_ITEMS.find(n=>n.key===page)?.label||"Dashboard"}</span></div>{renderPage()}</div>
  </div>);
}
