import React, { useState, useEffect, Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import "./index.css";
import { hasRole, ROLE_LABELS, defaultFilters, sortMonthsDesc } from "./lib/constants.js";
import { sb, SUPABASE_URL } from "./lib/supabase.js";
import { Icon, icons, GoogleLogo } from "./components/Icons.jsx";
import GlobalFilterBar from "./components/GlobalFilterBar.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import GlobalSearch from "./components/GlobalSearch.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AppContext } from "./lib/AppContext.jsx";
import { ToastProvider, useGlobalToast } from "./lib/ToastContext.jsx";
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const ScoreEntryPage = lazy(() => import("./pages/ScoreEntryPage.jsx"));
const TargetsPage = lazy(() => import("./pages/TargetsPage.jsx"));
const AuditTrailPage = lazy(() => import("./pages/AuditTrailPage.jsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.jsx"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage.jsx"));
const DAMPage = lazy(() => import("./pages/DAMPage.jsx"));
const ActionPlanPage = lazy(() => import("./pages/ActionPlanPage.jsx"));
const CoachingPage = lazy(() => import("./pages/CoachingPage.jsx"));
const CoachingViolationsPage = lazy(() => import("./pages/CoachingViolationsPage.jsx"));
const EscalationsPage = lazy(() => import("./pages/EscalationsPage.jsx"));
const QAProfilePage = lazy(() => import("./pages/QAProfilePage.jsx"));
const SchedulePage = lazy(() => import("./pages/SchedulePage.jsx"));
const PlaceholderPage = lazy(() => import("./pages/PlaceholderPage.jsx"));

document.title = "Tabby Pulse — QA Performance & Analytics";


const NAV_ITEMS=[
  {key:"dashboard",label:"Dashboard",icon:icons.dashboard,section:"Overview"},
  {key:"leaderboard",label:"Leaderboard",icon:icons.leaderboard},
  {key:"profile",label:"QA Profile",icon:icons.hr},
  {key:"schedule",label:"Schedule",icon:icons.coaching},
  {key:"scores",label:"MTD",icon:icons.scores,section:"Performance"},
  {key:"targets",label:"Targets",icon:icons.scores,minRole:"qa_lead"},
  {key:"dam",label:"DAM flags",icon:icons.dam,minRole:"qa_lead"},
  {key:"plans",label:"AP / PIP",icon:icons.plan,minRole:"qa_lead"},
  {key:"coaching",label:"Coaching",icon:icons.coaching,minRole:"qa_lead",section:"Management"},
  {key:"violations",label:"Violations",icon:icons.dam,minRole:"qa_lead"},
  {key:"hr",label:"HR cases",icon:icons.hr,minRole:"qa_supervisor"},
  {key:"escalations",label:"Escalations",icon:icons.escalation},
  {key:"audit",label:"Audit trail",icon:icons.settings,minRole:"admin",section:"System"},
  {key:"admin",label:"Admin panel",icon:icons.settings,minRole:"admin"},
];

/* ═══ APP ═══ */
function AppInner(){
  const navigate=useNavigate();
  const location=useLocation();
  const page=location.pathname.replace(/^\//,"") || "dashboard";
  const[session,setSession]=useState(null);const[profile,setProfile]=useState(null);const[loading,setLoading]=useState(true);
  const[sidebarOpen,setSidebarOpen]=useState(false);
  const[sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem("sb_collapsed")==="true");
  const[viewAsRole,setViewAsRole]=useState("");
  const[darkMode,setDarkMode]=useState(()=>{const stored=localStorage.getItem("dark_mode");return stored===null?true:stored==="true";});
  const[showSearch,setShowSearch]=useState(false);
  const[globalFilters,setGlobalFilters]=useState({...defaultFilters});
  const[globalRoster,setGlobalRoster]=useState([]);
  const[globalMonths,setGlobalMonths]=useState([]);
  const[pendingAnnouncements,setPendingAnnouncements]=useState([]);
  const[showFeedback,setShowFeedback]=useState(false);
  const[feedbackForm,setFeedbackForm]=useState({category:"general",message:"",rating:0});
  const[feedbackSending,setFeedbackSending]=useState(false);
  const[feedbackSent,setFeedbackSent]=useState(false);
  const setPage=(p)=>navigate("/"+p);
  // Gmail OAuth redirect
  useEffect(()=>{const urlP=new URLSearchParams(window.location.search);if(urlP.get("state")==="gmail_oauth"){navigate("/coaching",{replace:true});}},[]);
  // Dynamic page title
  useEffect(()=>{
    const item=NAV_ITEMS.find(n=>n.key===page);
    document.title=item?`${item.label} — Tabby Pulse`:"Tabby Pulse";
  },[page]);
  // Set favicon on mount
  useEffect(()=>{
    let link=document.querySelector("link[rel='icon']");
    if(!link){link=document.createElement("link");link.rel="icon";document.head.appendChild(link);}
    link.type="image/svg+xml";
    link.href="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3BFF9D"/><stop offset="100%" stop-color="#8B5CF6"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="#0d1117"/><path d="M3 16 L8 16 L11 7 L16 25 L21 12 L24 16 L29 16" stroke="url(#fg)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>');
  },[]);
  // Persist sidebar collapse
  useEffect(()=>{localStorage.setItem("sb_collapsed",sidebarCollapsed);},[sidebarCollapsed]);
  // Dark mode
  useEffect(()=>{document.documentElement.classList.toggle("dark",darkMode);localStorage.setItem("dark_mode",darkMode);},[darkMode]);
  // Keyboard shortcut: Cmd/Ctrl+K for search
  useEffect(()=>{const handler=(e)=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setShowSearch(true);}};document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler);},[]);
  // Auto-refresh JWT every 10 minutes to prevent expiry
  useEffect(()=>{
    if(!session?.refresh_token)return;
    const interval=setInterval(async()=>{
      try{const s=await sb.auth.getSession();if(s){setSession(s);}}catch{}
    },10*60*1000);
    return()=>clearInterval(interval);
  },[session?.refresh_token]);
  // Listen for session refresh from sb.query 401 handler
  useEffect(()=>{
    const handler=(e)=>{if(e.detail)setSession(e.detail);};
    window.addEventListener("session-refreshed",handler);
    return()=>window.removeEventListener("session-refreshed",handler);
  },[]);
  // Listen for legacy "navigate" custom events from child pages
  useEffect(()=>{const handler=(e)=>navigate("/"+e.detail);window.addEventListener("navigate",handler);return()=>window.removeEventListener("navigate",handler);},[navigate]);
  useEffect(()=>{(async()=>{let s=await sb.auth.handleCallback();if(!s)s=await sb.auth.getSession();if(s){setSession(s);try{
    // First try by Auth UUID
    let p=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user?.id}`,token:s.access_token});
    // If not found, check by email (pre-created profile from violations/admin)
    if(p.length===0 && s.user?.email){
      const emailProf=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`email=eq.${s.user.email}`,token:s.access_token}).catch(()=>[]);
      if(emailProf.length>0){
        // Update the pre-created profile with the real Auth UUID
        await sb.query("profiles",{token:s.access_token,method:"PATCH",body:{id:s.user.id,display_name:s.user.user_metadata?.full_name||s.user.user_metadata?.name||emailProf[0].display_name,avatar_url:s.user.user_metadata?.avatar_url||null},filters:`email=eq.${s.user.email}`}).catch(()=>{});
        p=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user.id}`,token:s.access_token}).catch(()=>[]);
      }
    }
    if(p.length>0){setProfile(p[0]);}else if(s.user?.id){
    // Auto-create profile for first-time login
    const email=s.user.email||"";const domain=email.endsWith("@tabby.sa")?"tabby.sa":"tabby.ai";
    const name=s.user.user_metadata?.full_name||s.user.user_metadata?.name||email.split("@")[0].split(".").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ");
    try{
      await sb.query("profiles",{token:s.access_token,method:"POST",body:{id:s.user.id,email,display_name:name,role:"qa",domain,operational_domain:domain,status:"active",avatar_url:s.user.user_metadata?.avatar_url||null}});
      const p2=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user.id}`,token:s.access_token});
      if(p2.length>0)setProfile(p2[0]);
    }catch(e){console.error("Auto-create profile:",e);}
  }}catch(e){console.error("Profile:",e);}}setLoading(false);})();},[]);

  // Load global filter data (roster + months)
  useEffect(()=>{if(!session)return;(async()=>{try{
    const[r,m]=await Promise.all([
      sb.query("qa_roster",{select:"email,queue,manager_email",token:session.access_token}).catch(()=>[]),
      sb.query("mtd_scores",{select:"month",token:session.access_token}).catch(()=>[]),
    ]);
    setGlobalRoster(r);
    // Build roster map for global filter team lookups
    const rm = {};
    const rmMgr = {};
    r.forEach(x => { 
      if (x.email && x.queue) rm[x.email.toLowerCase()] = x.queue;
      if (x.email && x.manager_email) rmMgr[x.email.toLowerCase()] = x.manager_email.toLowerCase();
    });
    window.__gfRoster = rm;
    window.__gfRosterMgr = rmMgr;
    const uniqueMonths=sortMonthsDesc([...new Set(m.map(x=>x.month).filter(Boolean))]);
    setGlobalMonths(uniqueMonths);
  }catch(e){console.error("Global filters:",e);}})();},[session]);

  // Load pending announcements that need acknowledgement
  useEffect(()=>{if(!session||!profile)return;(async()=>{try{
    const[anns,acks]=await Promise.all([
      sb.query("announcements",{select:"*",filters:"order=created_at.desc",token:session.access_token}).catch(()=>[]),
      sb.query("announcement_acks",{select:"announcement_id",filters:`user_email=eq.${profile.email}`,token:session.access_token}).catch(()=>[]),
    ]);
    const ackedIds=new Set(acks.map(a=>a.announcement_id));
    const myEmail=profile.email?.toLowerCase();
    const myDomain=profile.domain||profile.operational_domain||"";
    const myQueue=(window.__gfRoster||{})[myEmail]||"";
    const pending=anns.filter(a=>{
      if(ackedIds.has(a.id))return false;
      if(a.target_type==="all")return true;
      if(a.target_type==="domain")return myEmail.endsWith("@"+a.target_value);
      if(a.target_type==="team")return myQueue===a.target_value;
      if(a.target_type==="individual")return myEmail===a.target_value?.toLowerCase();
      if(a.target_type==="my_team"){
        // Show to QAs whose manager matches target_value, OR to the sender themselves
        const myMgr=(window.__gfRosterMgr||{})[myEmail]||"";
        const targetLead=a.target_value?.toLowerCase()||"";
        return myEmail===targetLead || myMgr===targetLead || (targetLead.split("@")[0]&&myMgr.split("@")[0]===targetLead.split("@")[0]);
      }
      return false;
    });
    setPendingAnnouncements(pending);
  }catch(e){console.error("Announcements:",e);}})();},[session,profile]);

  const acknowledgeAnnouncement=async(annId)=>{
    try{
      await sb.query("announcement_acks",{token:session.access_token,method:"POST",body:{announcement_id:annId,user_email:profile.email}});
      setPendingAnnouncements(prev=>prev.filter(a=>a.id!==annId));
    }catch(e){console.error("Ack error:",e);}
  };
  if(loading)return<div className="loading-fullscreen">
    <svg width="200" height="60" viewBox="0 0 200 60" fill="none" className="pulse-line-anim">
      <path d="M0 30 L40 30 L55 8 L75 52 L95 20 L110 30 L200 30" stroke="url(#pulseGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <defs><linearGradient id="pulseGrad" x1="0" y1="0" x2="200" y2="0"><stop offset="0%" stopColor="#3BFF9D"/><stop offset="100%" stopColor="#6A2C79"/></linearGradient></defs>
    </svg>
    <div style={{marginTop:20,fontSize:32,fontWeight:700,color:"#fff",letterSpacing:"-1px"}}>tabby<span style={{background:"linear-gradient(135deg, #3BFF9D, #6A2C79)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Pulse</span></div>
    <p style={{marginTop:6,color:"rgba(255,255,255,.35)",fontSize:12,letterSpacing:"2px",textTransform:"uppercase"}}>QA Performance & Analytics</p>
    
    <p style={{marginTop:16,color:"rgba(255,255,255,.3)",fontSize:12}}>Loading your workspace...</p>
  </div>;
  if(!session)return(<div className="login-page"><div className="login-card">
    <div style={{marginBottom:16,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <svg width="120" height="40" viewBox="0 0 120 40" fill="none"><path d="M0 20 L24 20 L33 5 L45 35 L57 13 L66 20 L120 20" stroke="url(#lgGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><defs><linearGradient id="lgGrad" x1="0" y1="0" x2="120" y2="0"><stop offset="0%" stopColor="#3BFF9D"/><stop offset="100%" stopColor="#6A2C79"/></linearGradient></defs></svg>
      <div style={{fontSize:28,fontWeight:700,color:"#fff",letterSpacing:"-1px"}}>tabby<span style={{background:"linear-gradient(135deg, #3BFF9D, #6A2C79)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Pulse</span></div>
    </div>
    <div className="login-subtitle">QA Performance & Analytics<br/>Sign in with your Tabby Google account.</div>
    <button className="login-btn" onClick={()=>sb.auth.signInWithGoogle()}><GoogleLogo/>Sign in with Google</button>
    <div className="login-divider">Supported domains</div>
    <div className="login-domains"><span className="login-domain">@tabby.ai</span><span className="login-domain">@tabby.sa</span></div>
    <div className="login-footer">Internal tool &middot; Tabby Pulse</div>
  </div></div>);
  const realRole=profile?.role||"qa";
  const userRole=viewAsRole||realRole;
  const effectiveProfile=viewAsRole?{...profile,role:viewAsRole}:profile;
  const isAuditor = userRole === "auditor";
  const visibleNav=NAV_ITEMS.filter(n=>{
    if (n.key === "escalations") return true;
    if (isAuditor) {
      // Auditors see: dashboard, leaderboard, scores, dam, violations, plans, escalations
      return !n.minRole || ["dam","violations","plans"].includes(n.key);
    }
    return !n.minRole || hasRole(userRole, n.minRole);
  });let curSec=null;
  const guardRole=(role,component,fallbackProps)=>(hasRole(userRole,role)||userRole==="auditor")?component:<PlaceholderPage {...fallbackProps} minRole={role} userRole={userRole}/>;
  const globalToast=useGlobalToast();
  const appCtx={token:session.access_token,profile:effectiveProfile,gf:globalFilters,session,setProfile,userRole,rosterMap:window.__gfRoster||{},rosterMgrMap:window.__gfRosterMgr||{},globalToast};
  return(<AppContext.Provider value={appCtx}><div className="app-layout">
    <div className={`mobile-overlay ${sidebarOpen?"open":""}`} onClick={()=>setSidebarOpen(false)}/>
    <aside className={`sidebar ${sidebarOpen?"open":""} ${sidebarCollapsed?"collapsed":""}`}>
      <div className="sidebar-header" style={{display:"flex",alignItems:"center",justifyContent:sidebarCollapsed?"center":"space-between"}}>
        <div className="sidebar-brand">{sidebarCollapsed?<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 12 L6 12 L8 5 L12 19 L16 9 L18 12 L22 12" stroke="#3BFF9D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>:<>tabby<span>Pulse</span></>}</div>
        <button className="sidebar-toggle" onClick={()=>setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed?"Expand":"Collapse"}>
          <Icon d={sidebarCollapsed?"M9 5l7 7-7 7":"M15 19l-7-7 7-7"} size={16}/>
        </button>
      </div>
      <nav className="sidebar-nav">{visibleNav.map(item=>{let sh=null;if(item.section&&item.section!==curSec){curSec=item.section;sh=<div className="sidebar-section" key={`s-${item.section}`}>{item.section}</div>;}return(<div key={item.key}>{sh}<button className={`nav-item ${page===item.key?"active":""}`} onClick={()=>{setPage(item.key);setSidebarOpen(false);}} data-tooltip={item.label}><Icon d={item.icon} size={18}/><span className="nav-item-label">{item.label}</span></button></div>);})}</nav>
    </aside>
    <div className="main-content">
      {/* View-as banner for super admin */}
      {viewAsRole && <div className="view-as-bar">
        <span>👁 Viewing as <strong>{ROLE_LABELS[viewAsRole]}</strong></span>
        <button onClick={()=>setViewAsRole("")} style={{background:"var(--amber)",color:"#fff",border:"none",borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"var(--font)"}}>Exit</button>
      </div>}
      <div className="topbar"><button className="topbar-menu" onClick={()=>setSidebarOpen(true)}><Icon d={icons.menu} size={22}/></button><span className="topbar-title">{NAV_ITEMS.find(n=>n.key===page)?.label||"Dashboard"}</span>
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
        {/* Search */}
        <button className="notif-btn" onClick={()=>setShowSearch(true)} title="Search (⌘K)">
          <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" size={18}/>
        </button>
        {/* Notifications */}
        <NotificationBell onNavigate={setPage}/>
        {/* Dark mode */}
        <button className="notif-btn" onClick={()=>setDarkMode(!darkMode)} title={darkMode?"Light mode":"Dark mode"}>
          <Icon d={darkMode?"M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z":"M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"} size={18}/>
        </button>
        {/* View-as dropdown for super admin */}
        {realRole==="super_admin"&&!viewAsRole&&<select value={viewAsRole} onChange={e=>setViewAsRole(e.target.value)} style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:"1px solid var(--bd)",background:"var(--bg3)",fontFamily:"var(--font)",color:"var(--tx2)",cursor:"pointer"}}>
          <option value="">View as...</option>
          <option value="qa">QA</option>
          <option value="qa_lead">QA Lead</option>
          <option value="qa_supervisor">QA Supervisor</option>
          <option value="admin">Admin</option>
        </select>}
        <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:8,paddingLeft:12,borderLeft:"1px solid var(--bd)"}}>
          <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",flexShrink:0,cursor:"pointer",position:"relative"}} title="Change profile picture" onClick={()=>document.getElementById("avatar-upload")?.click()}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{width:32,height:32,objectFit:"cover",borderRadius:"50%"}}/> :
            <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg, var(--tabby-purple), var(--tabby-purple-light))",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700}}>{(profile?.display_name||"U").split(" ").map(p=>p[0]).join("").slice(0,2).toUpperCase()}</div>}
          </div>
          <input id="avatar-upload" type="file" accept="image/*" style={{display:"none"}} onChange={async(e)=>{
            const file=e.target.files?.[0]; if(!file)return;
            if(file.size>2*1024*1024){show("error","Image must be under 2MB");return;}
            try{
              const ext=file.name.split(".").pop();
              const path=`${profile.id}.${ext}`;
              const formData=new FormData();formData.append("file",file);
              await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`,{method:"POST",headers:{"Authorization":`Bearer ${session.access_token}`},body:formData});
              const url=`${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
              await sb.query("profiles",{token:session.access_token,method:"PATCH",body:{avatar_url:url},filters:`id=eq.${profile.id}`});
              setProfile({...profile,avatar_url:url});
            }catch(err){console.error("Avatar upload:",err);}
            e.target.value="";
          }}/>
          <div style={{display:"flex",flexDirection:"column",lineHeight:1.2}}>
            <span style={{fontSize:13,fontWeight:600,color:"var(--tx)",letterSpacing:"-.2px"}}>{profile?.display_name||"User"}</span>
            <span className={`role-badge role-${viewAsRole||profile?.role}`} style={{fontSize:9,padding:"1px 6px",alignSelf:"flex-start"}}>{ROLE_LABELS[viewAsRole||profile?.role]||"QA"}{viewAsRole?" (viewing)":""}</span>
          </div>
        </div>
        <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:profile?.domain==="tabby.sa"?"rgba(234,88,12,.1)":"rgba(79,70,229,.1)",color:profile?.domain==="tabby.sa"?"#EA580C":"#4F46E5",fontWeight:600}}>{profile?.domain}</span>
        <button onClick={()=>{sb.auth.signOut();setSession(null);setProfile(null);window.location.hash="";}} style={{background:"none",border:"1px solid var(--bd)",borderRadius:8,padding:"5px 12px",fontSize:11,color:"var(--tx3)",cursor:"pointer",fontFamily:"var(--font)",fontWeight:500,transition:"all .2s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--red)";e.currentTarget.style.color="var(--red)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--bd)";e.currentTarget.style.color="var(--tx3)";}}
        >Sign out</button>
      </div>
    </div>
    {/* Global filter bar */}
    <GlobalFilterBar filters={globalFilters} setFilters={setGlobalFilters} months={globalMonths} teams={[]} roster={globalRoster} profile={effectiveProfile} role={userRole}/>
    {/* Search overlay */}
    {showSearch&&<GlobalSearch onNavigate={setPage} onClose={()=>setShowSearch(false)}/>}
    <div className="page-animate"><Suspense fallback={<div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:200}}><div className="pulse-loader"/></div>}><Routes>
      <Route path="/dashboard" element={<DashboardPage/>}/>
      <Route path="/scores" element={<ScoreEntryPage/>}/>
      <Route path="/targets" element={<TargetsPage/>}/>
      <Route path="/leaderboard" element={<LeaderboardPage/>}/>
      <Route path="/profile" element={<QAProfilePage/>}/>
      <Route path="/schedule" element={<SchedulePage/>}/>
      <Route path="/escalations" element={<EscalationsPage/>}/>
      <Route path="/dam" element={guardRole("qa_lead",<DAMPage/>,{title:"DAM flags",icon:icons.dam})}/>
      <Route path="/plans" element={guardRole("qa_lead",<ActionPlanPage/>,{title:"Action plans & PIPs",icon:icons.plan})}/>
      <Route path="/coaching" element={hasRole(userRole,"qa_lead")&&userRole!=="auditor"?<CoachingPage/>:<PlaceholderPage title="Coaching sessions" icon={icons.coaching} minRole="qa_lead" userRole={userRole}/>}/>
      <Route path="/violations" element={guardRole("qa_lead",<CoachingViolationsPage/>,{title:"Coaching Violations",icon:icons.dam})}/>
      <Route path="/audit" element={hasRole(userRole,"admin")?<AuditTrailPage/>:<PlaceholderPage title="Audit trail" icon={icons.settings} minRole="admin" userRole={userRole}/>}/>
      <Route path="/admin" element={hasRole(userRole,"admin")?<AdminPage/>:<PlaceholderPage title="Admin panel" icon={icons.settings} minRole="admin" userRole={userRole}/>}/>
      <Route path="/hr" element={<PlaceholderPage title="HR cases" description="Disciplinary case tracking." icon={icons.hr} minRole="qa_supervisor" userRole={userRole}/>}/>
      <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
    </Routes></Suspense></div>

    {/* ═══ ANNOUNCEMENT POPUP — blocks until acknowledged ═══ */}
    {pendingAnnouncements.length>0&&<div style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(8px)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,
      animation:"fadeIn .3s cubic-bezier(.4,0,.2,1)",
    }}>
      <div style={{
        width:"100%",maxWidth:520,margin:20,background:"var(--bg3)",borderRadius:20,
        boxShadow:"0 32px 64px rgba(0,0,0,.4)",border:"1px solid var(--bd)",overflow:"hidden",
      }}>
        {/* Header */}
        <div style={{
          padding:"20px 24px",background:"linear-gradient(135deg, var(--tabby-purple-dark,#4A1B56), var(--tabby-purple,#6A2C79))",
          color:"#fff",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <span style={{fontSize:22}}>📢</span>
            <span style={{fontSize:16,fontWeight:700}}>Announcement</span>
            {pendingAnnouncements.length>1&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.15)",fontWeight:600}}>{pendingAnnouncements.length} messages</span>}
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>From: {pendingAnnouncements[0].sent_by?.split("@")[0].split(".").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ")} · {new Date(pendingAnnouncements[0].created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
        </div>
        {/* Body */}
        <div style={{padding:"24px"}}>
          {(()=>{
            const ann=pendingAnnouncements[0];
            const priorityStyle={urgent:{bg:"var(--red-bg)",color:"var(--red)",label:"URGENT"},important:{bg:"var(--amber-bg)",color:"var(--amber)",label:"IMPORTANT"},normal:{bg:"var(--primary-light)",color:"var(--tabby-purple,#6A2C79)",label:"INFO"}}[ann.priority]||{};
            return <>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
                <span style={{fontSize:10,padding:"3px 10px",borderRadius:8,background:priorityStyle.bg,color:priorityStyle.color,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>{priorityStyle.label}</span>
                {ann.target_type!=="all"&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:8,background:"var(--bg2)",color:"var(--tx3)",fontWeight:600}}>To: {ann.target_type==="domain"?ann.target_value:ann.target_type==="team"?"Team: "+ann.target_value:ann.target_value}</span>}
              </div>
              <h3 style={{fontSize:18,fontWeight:700,marginBottom:12,letterSpacing:"-.3px",lineHeight:1.3}}>{ann.title}</h3>
              <div style={{fontSize:14,color:"var(--tx2)",lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:300,overflowY:"auto"}}>{ann.message}</div>
            </>;
          })()}
        </div>
        {/* Footer — must acknowledge */}
        <div style={{padding:"16px 24px",borderTop:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--tx3)"}}>You must acknowledge to continue</span>
          <button onClick={()=>acknowledgeAnnouncement(pendingAnnouncements[0].id)} style={{
            padding:"10px 24px",borderRadius:10,border:"none",
            background:"var(--tabby-purple,#6A2C79)",color:"#fff",fontSize:13,fontWeight:700,
            cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",
          }}
            onMouseEnter={e=>{e.currentTarget.style.background="var(--tabby-purple-light,#8B4D99)";e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="var(--tabby-purple,#6A2C79)";e.currentTarget.style.transform="translateY(0)";}}
          >I Acknowledge</button>
        </div>
      </div>
    </div>}

    {/* ═══ FEEDBACK FLOATING BUTTON + MODAL ═══ */}
    {!showFeedback&&<button onClick={()=>{setShowFeedback(true);setFeedbackSent(false);setFeedbackForm({category:"general",message:"",rating:0});}} style={{
      position:"fixed",bottom:24,right:24,width:48,height:48,borderRadius:"50%",border:"none",
      background:"var(--tabby-purple,#6A2C79)",color:"#fff",fontSize:20,cursor:"pointer",
      boxShadow:"0 4px 20px rgba(106,44,121,.4)",display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:900,transition:"all .2s",
    }}
      onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.1)";e.currentTarget.style.boxShadow="0 6px 28px rgba(106,44,121,.5)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 4px 20px rgba(106,44,121,.4)";}}
      title="Send feedback"
    >💬</button>}

    {showFeedback&&<div style={{position:"fixed",bottom:24,right:24,width:380,maxHeight:"80vh",background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"0 16px 48px rgba(0,0,0,.25)",zIndex:950,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{padding:"16px 20px",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>💬</span>
          <span style={{fontSize:15,fontWeight:700,letterSpacing:"-.3px"}}>Send Feedback</span>
        </div>
        <button onClick={()=>setShowFeedback(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:18,padding:4}}>✕</button>
      </div>

      {feedbackSent?
        /* Success state */
        <div style={{padding:"40px 20px",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>🎉</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Thank you!</div>
          <div style={{fontSize:13,color:"var(--tx2)"}}>Your feedback has been received. We appreciate you taking the time to help us improve.</div>
          <button onClick={()=>setShowFeedback(false)} className="btn btn-primary" style={{marginTop:20}}>Close</button>
        </div>
      :
        /* Form */
        <div style={{padding:"16px 20px",overflow:"auto"}}>
          {/* Rating */}
          <div style={{marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>How's your experience?</div>
            <div style={{display:"flex",justifyContent:"center",gap:8}}>
              {[1,2,3,4,5].map(star=>(
                <button key={star} onClick={()=>setFeedbackForm({...feedbackForm,rating:star})} style={{
                  background:"none",border:"none",cursor:"pointer",fontSize:28,transition:"transform .15s",
                  transform:feedbackForm.rating>=star?"scale(1.1)":"scale(1)",
                  filter:feedbackForm.rating>=star?"none":"grayscale(1) opacity(0.3)",
                }}>⭐</button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="form-group" style={{marginBottom:12}}>
            <label className="form-label">Category</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[{v:"bug",l:"🐛 Bug",c:"var(--red)"},{v:"feature",l:"💡 Feature Request",c:"var(--blue)"},{v:"improvement",l:"✨ Improvement",c:"var(--amber)"},{v:"general",l:"💬 General",c:"var(--tx3)"}].map(cat=>(
                <button key={cat.v} onClick={()=>setFeedbackForm({...feedbackForm,category:cat.v})} style={{
                  padding:"5px 12px",borderRadius:20,border:"1px solid "+(feedbackForm.category===cat.v?cat.c:"var(--bd)"),
                  background:feedbackForm.category===cat.v?"var(--bg)":"transparent",
                  color:feedbackForm.category===cat.v?cat.c:"var(--tx3)",fontSize:11,fontWeight:600,
                  cursor:"pointer",fontFamily:"var(--font)",transition:"all .15s",
                }}>{cat.l}</button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="form-group" style={{marginBottom:16}}>
            <label className="form-label">Your feedback</label>
            <textarea className="form-input" rows={4} value={feedbackForm.message} onChange={e=>setFeedbackForm({...feedbackForm,message:e.target.value})} placeholder="Tell us what's on your mind... What's working? What could be better?" style={{resize:"vertical",fontSize:13}}/>
          </div>

          {/* Submit */}
          <button disabled={!feedbackForm.message.trim()||feedbackSending} onClick={async()=>{
            setFeedbackSending(true);
            try{
              await sb.query("feedback",{token:session.access_token,method:"POST",body:{
                user_email:profile?.email,user_name:profile?.display_name,
                category:feedbackForm.category,message:feedbackForm.message,
                rating:feedbackForm.rating||null,page:page,
              }});
              setFeedbackSent(true);
            }catch(e){console.error("Feedback error:",e);}
            setFeedbackSending(false);
          }} className="btn btn-primary" style={{width:"100%"}}>
            {feedbackSending?"Sending...":"Send feedback"}
          </button>

          <div style={{fontSize:10,color:"var(--tx3)",textAlign:"center",marginTop:8}}>
            Your name and email will be attached so we can follow up if needed.
          </div>
        </div>
      }
    </div>}

    </div>
  </div></AppContext.Provider>);
}

export default function App() {
  return <ErrorBoundary><ToastProvider><HashRouter><AppInner/></HashRouter></ToastProvider></ErrorBoundary>;
}
