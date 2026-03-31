import { useState, useEffect, useCallback, useRef } from "react";
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
  const[scores,setScores]=useState([]);const[composite,setComposite]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{try{const[s,c]=await Promise.all([sb.query("scores",{select:"id,score_value,target_value,week_start,kpi_definitions(name,slug,unit)",filters:`profile_id=eq.${profile.id}&order=week_start.desc&limit=20`,token}),sb.query("composite_scores",{select:"*",filters:`profile_id=eq.${profile.id}&order=week_start.desc&limit=12`,token})]);setScores(s);setComposite(c);}catch(e){console.error(e);}setLoading(false);})();},[profile.id,token]);
  const lc=composite[0],pc=composite[1];const trend=lc&&pc?(lc.composite_value-pc.composite_value).toFixed(1):null;
  const spark=composite.slice(0,8).reverse();const sMax=Math.max(...spark.map(d=>d.composite_value),1);const sMin=Math.min(...spark.map(d=>d.composite_value),0);const sR=sMax-sMin||1;
  return(<div className="page">
    <div className="welcome-banner"><h2>Welcome back, {profile?.display_name?.split(" ")[0]||"there"}</h2><p>Here's your performance overview.</p><div className="welcome-role">{ROLE_LABELS[profile?.role]||"QA"} &middot; {profile?.domain}</div></div>
    {loading?<div className="loading-spinner"><div className="spinner"/></div>:<>
    <div className="stats-grid">
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--accent-light)",color:"var(--accent)",fontSize:18}}>📊</div><div className="stat-label">Composite score</div><div className="stat-value">{lc?lc.composite_value:"—"}</div>{trend&&<div className={`stat-change ${Number(trend)>=0?"up":"down"}`}>{Number(trend)>=0?"↑":"↓"} {Math.abs(trend)} vs last week</div>}</div>
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--amber-bg)",color:"var(--amber)",fontSize:18}}>🏆</div><div className="stat-label">Team rank</div><div className="stat-value">{lc?.rank_in_team?`#${lc.rank_in_team}`:"—"}</div></div>
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--teal-bg)",color:"var(--teal)",fontSize:18}}>🌐</div><div className="stat-label">Domain rank</div><div className="stat-value">{lc?.rank_in_domain?`#${lc.rank_in_domain}`:"—"}</div></div>
      <div className="stat-card"><div className="stat-icon" style={{background:"var(--green-bg)",color:"var(--green)",fontSize:18}}>📅</div><div className="stat-label">Weeks tracked</div><div className="stat-value">{composite.length}</div></div>
    </div>
    {spark.length>1&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">Composite trend</span></div>
      <svg width="100%" height="80" viewBox={`0 0 ${spark.length*60} 80`} style={{overflow:"visible"}}><polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={spark.map((d,i)=>`${i*60+30},${70-((d.composite_value-sMin)/sR)*60}`).join(" ")}/>{spark.map((d,i)=>(<g key={i}><circle cx={i*60+30} cy={70-((d.composite_value-sMin)/sR)*60} r="4" fill="var(--accent)"/><text x={i*60+30} y={70-((d.composite_value-sMin)/sR)*60-10} textAnchor="middle" fontSize="11" fill="var(--tx2)" fontFamily="var(--font)">{d.composite_value}</text></g>))}</svg>
    </div>}
    <div className="card"><div className="card-header"><span className="card-title">Recent scores</span></div>
      {scores.length===0?<div className="placeholder" style={{padding:"30px 20px"}}><p style={{color:"var(--tx3)"}}>{hasRole(profile.role,"qa_lead")?"Go to Score Entry to start entering scores.":"Your lead will enter scores weekly."}</p></div>:
      <div className="table-wrap"><table><thead><tr><th>Week</th><th>KPI</th><th>Score</th><th>Target</th><th>Status</th></tr></thead><tbody>
        {scores.slice(0,10).map(s=>{const pass=s.target_value?s.score_value>=s.target_value:null;return(<tr key={s.id}><td>{fmtWeek(s.week_start)}</td><td style={{fontWeight:500}}>{s.kpi_definitions?.name||"—"}</td><td style={{fontWeight:600}}>{s.score_value}{s.kpi_definitions?.unit==="%"?"%":""}</td><td style={{color:"var(--tx2)"}}>{s.target_value||"—"}{s.target_value&&s.kpi_definitions?.unit==="%"?"%":""}</td><td>{pass!==null&&<span className={`status-badge ${pass?"status-active":"status-on_leave"}`} style={!pass?{background:"var(--red-bg)",color:"var(--red)"}:{}}>{pass?"Pass":"Below"}</span>}</td></tr>);})}
      </tbody></table></div>}
    </div></>}
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
  const[teams,setTeams]=useState([]);const[members,setMembers]=useState([]);const[kpis,setKpis]=useState([]);const[allKpis,setAllKpis]=useState([]);
  const[selTeam,setSelTeam]=useState("");const[period,setPeriod]=useState("monthly");
  const[weekStart,setWeekStart]=useState(monday(new Date()));const[monthVal,setMonthVal]=useState(new Date().toISOString().slice(0,7));
  const[entries,setEntries]=useState({});const[saving,setSaving]=useState(false);const[loading,setLoading]=useState(true);const[tab,setTab]=useState("manual");
  const[roleTier,setRoleTier]=useState("qa");
  const[csvData,setCsvData]=useState(null);const[csvHeaders,setCsvHeaders]=useState([]);const[csvMapping,setCsvMapping]=useState({});const[csvPreview,setCsvPreview]=useState([]);
  const fileRef=useRef();const{show,el}=useToast();

  useEffect(()=>{(async()=>{try{const[t,k]=await Promise.all([sb.query("teams",{select:"id,name,domain",token}),sb.query("kpi_definitions",{select:"id,name,slug,unit,target_value,min_value,max_value,weight,role_tier,frequency",filters:"is_active=eq.true&order=sort_order.asc",token})]);setTeams(t);setAllKpis(k);setKpis(k.filter(x=>x.role_tier===roleTier));if(t.length>0)setSelTeam(t[0].id);}catch(e){console.error(e);}setLoading(false);})();},[token]);

  // Update KPIs when role tier changes
  useEffect(()=>{setKpis(allKpis.filter(x=>x.role_tier===roleTier));},[roleTier,allKpis]);

  useEffect(()=>{if(!selTeam||kpis.length===0)return;const effectiveWs=period==="weekly"?weekStart:monthVal+"-01";(async()=>{try{
    const tm=await sb.query("team_members",{select:"profile_id,profiles(id,display_name,email,domain,status,role)",filters:`team_id=eq.${selTeam}`,token});
    const m=tm.map(t=>t.profiles).filter(p=>p&&p.status==="active"&&(roleTier==="qa"?p.role==="qa":roleTier==="qa_lead"?p.role==="qa_lead":p.role==="qa_supervisor")).sort((a,b)=>(a.display_name||"").localeCompare(b.display_name||""));
    setMembers(m);
    const init={};m.forEach(u=>{kpis.forEach(k=>{init[`${u.id}_${k.id}`]="";});});
    const existing=await sb.query("scores",{select:"profile_id,kpi_id,score_value",filters:`team_id=eq.${selTeam}&week_start=eq.${effectiveWs}`,token});
    if(existing.length>0){m.forEach(u=>{kpis.forEach(k=>{const found=existing.find(s=>s.profile_id===u.id&&s.kpi_id===k.id);if(found)init[`${u.id}_${k.id}`]=String(found.score_value);});});}
    setEntries(init);
  }catch(e){console.error(e);}})();},[selTeam,kpis,token,weekStart,monthVal,period,roleTier]);

  const ws=period==="weekly"?weekStart:monthVal+"-01";const team=teams.find(t=>t.id===selTeam);

  const saveScores=async()=>{setSaving(true);try{const rows=[];members.forEach(u=>{kpis.forEach(k=>{const v=entries[`${u.id}_${k.id}`];if(v!==""&&v!==undefined)rows.push({profile_id:u.id,kpi_id:k.id,score_value:Number(v),target_value:k.target_value,week_start:ws,domain:u.domain,team_id:selTeam,entered_by:profile.id,source:"manual"});});});
    if(rows.length===0){show("error","No scores entered");setSaving(false);return;}
    // Delete existing scores for this team+week first, then insert fresh
    const profileIds=members.map(m=>m.id);
    for(const pid of profileIds){await sb.query("scores",{token,method:"DELETE",filters:`profile_id=eq.${pid}&week_start=eq.${ws}&team_id=eq.${selTeam}`}).catch(()=>{});}
    await sb.query("scores",{token,method:"POST",body:rows});
    try{await sb.rpc("calculate_composite_scores",{p_week_start:ws},token);}catch(e){console.warn("Composite:",e);}
    show("success",`${rows.length} scores saved`);
  }catch(e){show("error",e.message);}setSaving(false);};

  const handleFile=(e)=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=(ev)=>{const lines=ev.target.result.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2){show("error","Empty file");return;}const hdrs=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,""));const rows=lines.slice(1).map(l=>{const vals=l.split(",").map(v=>v.trim().replace(/^"|"$/g,""));const obj={};hdrs.forEach((h,i)=>{obj[h]=vals[i]||"";});return obj;});setCsvHeaders(hdrs);setCsvData(rows);setCsvPreview(rows.slice(0,5));setCsvMapping({});};reader.readAsText(f);};

  const importCsv=async()=>{if(!csvData||!csvMapping.email){show("error","Map the email column");return;}setSaving(true);try{
    const allP=await sb.query("profiles",{select:"id,email,domain,team_id",token});const eMap={};allP.forEach(p=>{eMap[p.email.toLowerCase()]=p;});
    const rows=[];let skip=0;csvData.forEach(row=>{const email=(row[csvMapping.email]||"").toLowerCase().trim();const p=eMap[email];if(!p){skip++;return;}
    kpis.forEach(k=>{const col=csvMapping[k.slug];if(!col||!row[col])return;const v=parseFloat(row[col]);if(isNaN(v))return;let w=ws;if(csvMapping.week_start&&row[csvMapping.week_start]){const d=new Date(row[csvMapping.week_start]);if(!isNaN(d))w=d.toISOString().split("T")[0];}
    rows.push({profile_id:p.id,kpi_id:k.id,score_value:v,target_value:k.target_value,week_start:w,domain:p.domain,team_id:p.team_id,entered_by:profile.id,source:"csv_import"});});});
    if(rows.length===0){show("error",`No valid scores. ${skip} emails not matched.`);setSaving(false);return;}
    for(let i=0;i<rows.length;i+=50)await sb.query("scores",{token,method:"POST",body:rows.slice(i,i+50)});
    const weeks=[...new Set(rows.map(r=>r.week_start))];for(const w2 of weeks){try{await sb.rpc("calculate_composite_scores",{p_week_start:w2},token);}catch{}}
    show("success",`${rows.length} scores imported${skip>0?` (${skip} skipped)`:""}`);setCsvData(null);setCsvHeaders([]);setCsvMapping({});setCsvPreview([]);
  }catch(e){show("error",e.message);}setSaving(false);};

  if(loading)return<div className="page"><div className="loading-spinner"><div className="spinner"/></div></div>;
  return(<div className="page">
    <div className="page-header"><div className="page-title">Score entry</div><div className="page-subtitle">Enter weekly or monthly scores for your team</div></div>
    <div className="tab-bar"><button className={`tab-btn ${tab==="manual"?"active":""}`} onClick={()=>setTab("manual")}><Icon d={icons.edit} size={16}/>Manual entry</button><button className={`tab-btn ${tab==="csv"?"active":""}`} onClick={()=>setTab("csv")}><Icon d={icons.upload} size={16}/>CSV import</button></div>
    {tab==="manual"?<>
      <div className="card" style={{marginBottom:16}}><div className="controls-row">
        <div className="form-group" style={{flex:1}}><label className="form-label">Team</label><select className="select form-input" value={selTeam} onChange={e=>setSelTeam(e.target.value)}>{teams.map(t=><option key={t.id} value={t.id}>{t.name} ({t.domain})</option>)}</select></div>
        <div className="form-group" style={{flex:1}}><label className="form-label">Role tier</label><select className="select form-input" value={roleTier} onChange={e=>setRoleTier(e.target.value)}><option value="qa">Quality Specialist</option><option value="qa_lead">Quality Leader</option><option value="qa_supervisor">Quality Supervisor</option></select></div>
        <div className="form-group" style={{flex:1}}><label className="form-label">Period</label><select className="select form-input" value={period} onChange={e=>setPeriod(e.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
        <div className="form-group" style={{flex:1}}><label className="form-label">{period==="weekly"?"Week starting":"Month"}</label>{period==="weekly"?<input type="date" className="form-input" value={weekStart} onChange={e=>setWeekStart(monday(e.target.value))}/>:<input type="month" className="form-input" value={monthVal} onChange={e=>setMonthVal(e.target.value)}/>}</div>
      </div></div>
      <div className="card"><div className="card-header"><span className="card-title">{team?.name||"Select team"} — {period==="weekly"?fmtWeek(weekStart):monthVal}</span><button className="btn btn-primary" onClick={saveScores} disabled={saving}>{saving?"Saving...":<><Icon d={icons.check} size={16}/>Save all</>}</button></div>
        {members.length===0?<div className="placeholder" style={{padding:"30px"}}><p style={{color:"var(--tx3)"}}>No active members. Assign users to this team in Admin → Users.</p></div>:
        <div className="table-wrap"><table><thead><tr><th style={{minWidth:180}}>QA Agent</th>{kpis.map(k=><th key={k.id} style={{minWidth:110}}>{k.name} ({k.unit})<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>Target: {k.target_value}</span></th>)}</tr></thead><tbody>
          {members.map(u=>(<tr key={u.id}><td style={{fontWeight:500}}>{u.display_name||u.email}</td>{kpis.map(k=>(<td key={k.id}><input type="number" className="form-input score-input" value={entries[`${u.id}_${k.id}`]||""} onChange={e=>setEntries({...entries,[`${u.id}_${k.id}`]:e.target.value})} placeholder="—" step="0.1"/></td>))}</tr>))}
        </tbody></table></div>}
      </div>
    </>:
    <div className="card"><div className="card-header"><span className="card-title">Import from CSV</span></div>
      {!csvData?<div className="csv-dropzone" onClick={()=>fileRef.current?.click()}><input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handleFile}/><Icon d={icons.upload} size={32} color="var(--accent)"/><p style={{marginTop:12,fontWeight:500}}>Click to upload a CSV file</p><p style={{color:"var(--tx3)",fontSize:13,marginTop:4}}>Export from Google Sheets or Metabase as CSV</p>
        <div style={{marginTop:16,padding:"12px 16px",background:"var(--bg)",borderRadius:8,fontSize:12,color:"var(--tx2)",maxWidth:500}}><strong>Expected columns:</strong> email (required), plus one column per KPI ({kpis.map(k=>k.slug).join(", ")}). Optional: week_start (YYYY-MM-DD).</div></div>:
      <><div style={{marginBottom:20}}><h4 style={{fontSize:14,fontWeight:600,marginBottom:12}}>Map your columns</h4><div className="form-grid">
        <div className="form-group"><label className="form-label">Email column *</label><select className="select form-input" value={csvMapping.email||""} onChange={e=>setCsvMapping({...csvMapping,email:e.target.value})}><option value="">— Select —</option>{csvHeaders.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Week start column</label><select className="select form-input" value={csvMapping.week_start||""} onChange={e=>setCsvMapping({...csvMapping,week_start:e.target.value})}><option value="">— Use default ({ws}) —</option>{csvHeaders.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
        {kpis.map(k=>(<div className="form-group" key={k.id}><label className="form-label">{k.name}</label><select className="select form-input" value={csvMapping[k.slug]||""} onChange={e=>setCsvMapping({...csvMapping,[k.slug]:e.target.value})}><option value="">— Skip —</option>{csvHeaders.map(h=><option key={h} value={h}>{h}</option>)}</select></div>))}
      </div></div>
      <div style={{marginBottom:16}}><h4 style={{fontSize:14,fontWeight:600,marginBottom:8}}>Preview (first 5 rows)</h4><div className="table-wrap"><table><thead><tr>{csvHeaders.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{csvPreview.map((row,i)=><tr key={i}>{csvHeaders.map(h=><td key={h}>{row[h]}</td>)}</tr>)}</tbody></table></div><p style={{fontSize:12,color:"var(--tx3)",marginTop:8}}>{csvData.length} total rows</p></div>
      <div style={{display:"flex",gap:8}}><button className="btn btn-primary" onClick={importCsv} disabled={saving}>{saving?"Importing...":<><Icon d={icons.upload} size={16}/>Import {csvData.length} rows</>}</button><button className="btn btn-outline" onClick={()=>{setCsvData(null);setCsvHeaders([]);setCsvMapping({});}}>Cancel</button></div></>}
    </div>}{el}
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

function PlaceholderPage({title,description,icon,minRole,userRole}){const locked=minRole&&!hasRole(userRole,minRole);
  return(<div className="page"><div className="page-header"><div className="page-title">{title}</div></div><div className="card"><div className="placeholder"><div className="placeholder-icon"><Icon d={icon} size={28}/></div><h3>{title}</h3><p>{locked?`Requires ${ROLE_LABELS[minRole]} access or above.`:description}</p><div className="placeholder-badge">{locked?"Access restricted":"Coming soon"}</div></div></div></div>);}

const NAV_ITEMS=[
  {key:"dashboard",label:"Dashboard",icon:icons.dashboard,section:"Overview"},
  {key:"leaderboard",label:"Leaderboard",icon:icons.leaderboard},
  {key:"scores",label:"Score entry",icon:icons.scores,minRole:"qa_lead",section:"Performance"},
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
  useEffect(()=>{(async()=>{let s=await sb.auth.handleCallback();if(!s)s=await sb.auth.getSession();if(s){setSession(s);try{const p=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,team_id,status",filters:`id=eq.${s.user?.id}`,token:s.access_token});if(p.length>0)setProfile(p[0]);}catch(e){console.error("Profile:",e);}}setLoading(false);})();},[]);
  if(loading)return<div className="loading-fullscreen"><div className="spinner"/><p style={{marginTop:16,color:"var(--tx2)",fontSize:14}}>Loading portal...</p></div>;
  if(!session)return(<div className="login-page"><div className="login-card"><div style={{marginBottom:8}}><TabbyLogo size={28}/></div><div className="login-subtitle">Quality Assurance Performance Portal<br/>Sign in with your Tabby Google account.</div><button className="login-btn" onClick={()=>sb.auth.signInWithGoogle()}><GoogleLogo/>Sign in with Google</button><div className="login-divider">Supported domains</div><div className="login-domains"><span className="login-domain">@tabby.ai</span><span className="login-domain">@tabby.sa</span></div><div className="login-footer">Internal tool &middot; Tabby QA Assurance</div></div></div>);
  const userRole=profile?.role||"qa";const visibleNav=NAV_ITEMS.filter(n=>!n.minRole||hasRole(userRole,n.minRole)||n.key==="escalations");let curSec=null;
  const renderPage=()=>{const t=session.access_token;switch(page){
    case"dashboard":return<DashboardPage profile={profile} token={t}/>;
    case"scores":return hasRole(userRole,"qa_lead")?<ScoreEntryPage token={t} profile={profile}/>:<PlaceholderPage title="Score entry" icon={icons.scores} minRole="qa_lead" userRole={userRole}/>;
    case"admin":return hasRole(userRole,"admin")?<AdminPage token={t} profile={profile}/>:<PlaceholderPage title="Admin panel" icon={icons.settings} minRole="admin" userRole={userRole}/>;
    case"leaderboard":return<PlaceholderPage title="Leaderboard" description="Team and global rankings. Building next." icon={icons.leaderboard} userRole={userRole}/>;
    case"dam":return hasRole(userRole,"qa_lead")?<DAMPage token={t} profile={profile}/>:<PlaceholderPage title="DAM flags" icon={icons.dam} minRole="qa_lead" userRole={userRole}/>;
    case"plans":return<PlaceholderPage title="Action plans & PIPs" description="Performance improvement plans." icon={icons.plan} minRole="qa_lead" userRole={userRole}/>;
    case"coaching":return<PlaceholderPage title="Coaching sessions" description="Session logging and email generator." icon={icons.coaching} minRole="qa_lead" userRole={userRole}/>;
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
