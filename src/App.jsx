import React, { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { lazyWithRetry as lazy } from "./lib/lazyWithRetry.js";
import QualityPrinciple from "./components/QualityPrinciple.jsx";
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import "./index.css";
import { hasRole, ROLE_LABELS, defaultFilters, sortMonthsDesc } from "./lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON } from "./lib/supabase.js";
import { fetchUnreadReleases, ackRelease } from "./lib/featureReleases.js";
import { avatarStyle, initialsFromEmail as initialsForAvatar } from "./lib/avatar.js";
import { nameFromEmail } from "./lib/utils.js";
import { riyadhTodayStr } from "./lib/attendancePlan.js";
import { startVersionCheck } from "./lib/versionCheck.js";
import { startHeartbeat } from "./lib/heartbeat.js";
import { initErrorLog } from "./lib/errorLog.js";
import { listRoster } from "./api/roster.js";
import { listMtd } from "./api/mtd.js";
import { Icon, icons, GoogleLogo } from "./components/Icons.jsx";
import GlobalFilterBar from "./components/GlobalFilterBar.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import MyBeltIndicator from "./components/MyBeltIndicator.jsx";
import BeltAnnouncementModal from "./components/BeltAnnouncementModal.jsx";
import GlobalSearch from "./components/GlobalSearch.jsx";
import MandatorySurveyModal from "./components/MandatorySurveyModal.jsx";
// Lazy — only loaded when the user opens the composer from the topbar
// (or from the dashboard action bar, but that fallback path is gone).
const AnnouncementForm = lazy(() => import("./components/dashboard/AnnouncementForm.jsx"));
import OnboardingTour from "./components/OnboardingTour.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AppContext } from "./lib/AppContext.jsx";
import DOMPurify from "dompurify";
import { isLive as annIsLive, matchesAudience as annMatchesAudience } from "./lib/announcementUtils.js";
import { ToastProvider, useGlobalToast } from "./lib/ToastContext.jsx";
import { subscribeRealtime } from "./lib/realtime.js";
import useKeyboard from "./lib/useKeyboard.jsx";
import PulseMark from "./components/PulseMark.jsx";
import TabbyPulseWordmark from "./components/TabbyPulseWordmark.jsx";
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const QualityDNAPage = lazy(() => import("./pages/QualityDNAPage.jsx"));
const ScoreEntryPage = lazy(() => import("./pages/ScoreEntryPage.jsx"));
const CSATPage = lazy(() => import("./pages/CSATPage.jsx"));
const TargetsPage = lazy(() => import("./pages/TargetsPage.jsx"));
const AuditTrailPage = lazy(() => import("./pages/AuditTrailPage.jsx"));
const AdminPage = lazy(() => import("./pages/AdminPage.jsx"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage.jsx"));
const DAMPage = lazy(() => import("./pages/DAMPage.jsx"));
const ActionPlanPage = lazy(() => import("./pages/ActionPlanPage.jsx"));
const CoachingPage = lazy(() => import("./pages/CoachingPage.jsx"));
const CoachingAckPage = lazy(() => import("./pages/CoachingAckPage.jsx"));
const CoachingViolationsPage = lazy(() => import("./pages/CoachingViolationsPage.jsx"));
const EscalationsPage = lazy(() => import("./pages/EscalationsPage.jsx"));
const QualityControlPage = lazy(() => import("./pages/QualityControlPage.jsx"));
const QAProfilePage = lazy(() => import("./pages/QAProfilePage.jsx"));
const SchedulePage = lazy(() => import("./pages/SchedulePage.jsx"));
const UtilizationPage = lazy(() => import("./pages/UtilizationPage.jsx"));
const ExpertisePage = lazy(() => import("./pages/ExpertisePage.jsx"));
const TrackerPage = lazy(() => import("./pages/TrackerPage.jsx"));

// Hover-prefetch map. Calling import() warms the chunk cache; the
// subsequent React.lazy() resolution on click is instant. Keys must
// match NAV_ITEMS.key so the sidebar's onMouseEnter can fire the
// right loader. Safe to call repeatedly — Vite caches the module
// graph so the second hover is a no-op.
// Every prefetcher swallows its own rejection. A failing prefetch on
// hover is harmless — when the user actually clicks, lazyWithRetry()
// fires fresh + does the retry-then-reload dance. Without these
// .catch() guards, a stale-chunk hover-prefetch surfaces as an
// unhandledrejection and ends up in client_errors as a fake "real"
// error even though the user never saw a broken page.
const safePrefetch = (loader) => () => { loader().catch(() => {}); };
const PAGE_PREFETCH = {
  dashboard:   safePrefetch(() => import("./pages/DashboardPage.jsx")),
  "quality-dna": safePrefetch(() => import("./pages/QualityDNAPage.jsx")),
  scores:      safePrefetch(() => import("./pages/ScoreEntryPage.jsx")),
  csat:        safePrefetch(() => import("./pages/CSATPage.jsx")),
  targets:     safePrefetch(() => import("./pages/TargetsPage.jsx")),
  admin:       safePrefetch(() => import("./pages/AdminPage.jsx")),
  leaderboard: safePrefetch(() => import("./pages/LeaderboardPage.jsx")),
  quality:     safePrefetch(() => import("./pages/QualityControlPage.jsx")),
  escalations: safePrefetch(() => import("./pages/EscalationsPage.jsx")),
  profile:     safePrefetch(() => import("./pages/QAProfilePage.jsx")),
  schedule:    safePrefetch(() => import("./pages/SchedulePage.jsx")),
  utilization: safePrefetch(() => import("./pages/UtilizationPage.jsx")),
  expertise:   safePrefetch(() => import("./pages/ExpertisePage.jsx")),
  tracker:     safePrefetch(() => import("./pages/TrackerPage.jsx")),
};
function prefetchPage(key) { try { PAGE_PREFETCH[key]?.(); } catch {} }
const PlaceholderPage = lazy(() => import("./pages/PlaceholderPage.jsx"));

document.title = "Tabby Pulse — QA Performance & Analytics";

/* Prevent React #310 — never render a raw object as JSX child */
const safe = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};


const NAV_ITEMS=[
  {key:"dashboard",label:"Dashboard",icon:icons.dashboard,section:"Overview"},
  {key:"leaderboard",label:"Leaderboard",icon:icons.podium},
  {key:"quality-dna",label:"Quality DNA",icon:icons.northstar},
  {key:"profile",label:"QA Profile",icon:icons.profile,section:"Performance"},
  {key:"scores",label:"MTD",icon:icons.scores},
  {key:"csat",label:"CSAT",icon:icons.csat},
  {key:"expertise",label:"Expertise",icon:icons.expertise,minRole:"admin"},
  {key:"targets",label:"Targets",icon:icons.targets,minRole:"qa_lead"},
  {key:"schedule",label:"Attendance",icon:icons.attendance,section:"Management"},
  {key:"tracker",label:"Tracker",icon:icons.tracker,minRole:"senior_qa"},
  {key:"quality",label:"Quality Control",icon:icons.quality,minRole:"qa_lead"},
  {key:"escalations",label:"Escalations",icon:icons.escalation},
  {key:"hr",label:"HR cases",icon:icons.folder,minRole:"qa_supervisor"},
  {key:"admin",label:"Admin panel",icon:icons.key,minRole:"admin",section:"System"},
  {key:"utilization",label:"App utilization",icon:icons.utilization,minRole:"qa_supervisor"},
];

/* ═══ APP ═══ */
function AppInner(){
  const navigate=useNavigate();
  // Routes where the slim Month + Domain global bar is suppressed.
  // These pages either have no notion of monthly/domain scoping
  // (Tracker, Admin, Audit Trail) or they handle their own scope
  // entirely (Dashboard's role-based view, QA Profile's per-QA view,
  // Escalations). Suppressing the bar on these routes prevents the
  // "I changed it but nothing happened" confusion.
  const HIDE_GLOBAL_FILTER_PAGES = React.useMemo(() => new Set([
    "dashboard",
    "tracker",
    "profile",
    "admin",
    "audit",
    "escalations",
    "hr",
    "utilization",
    "quality-dna",
  ]), []);
  const location=useLocation();
  const page=location.pathname.replace(/^\//,"") || "dashboard";
  const[session,setSession]=useState(null);const[profile,setProfile]=useState(null);const[loading,setLoading]=useState(true);
  const[sidebarOpen,setSidebarOpen]=useState(false);
  const[sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem("sb_collapsed")==="true");
  // ── View as a specific user (super_admin only) ──
  // viewAsUser holds the FULL profile we're impersonating; null = off.
  // Persisted in sessionStorage so a page reload keeps the impersonation
  // (handy while debugging a specific QA's view) but it clears when
  // the browser tab closes — never persists across sessions.
  const[viewAsUser,setViewAsUser]=useState(()=>{
    try{const s=sessionStorage.getItem("view_as_user");return s?JSON.parse(s):null;}catch{return null;}
  });
  const setViewAsUserPersist=(u)=>{
    setViewAsUser(u);
    try{
      if(u)sessionStorage.setItem("view_as_user",JSON.stringify(u));
      else sessionStorage.removeItem("view_as_user");
    }catch{}
  };
  // Loaded list of profiles for the picker. Pulled lazily — only when
  // a super_admin opens the picker, so non-super-admins never trigger
  // the query.
  const[allProfiles,setAllProfiles]=useState([]);
  const[viewAsPickerOpen,setViewAsPickerOpen]=useState(false);
  const[viewAsSearch,setViewAsSearch]=useState("");
  const[darkMode,setDarkMode]=useState(()=>{const stored=localStorage.getItem("dark_mode");return stored===null?true:stored==="true";});
  // Density toggle — power users want compact tables, others want
  // breathing room. Stored per-user in localStorage; CSS rules in
  // index.css read body[data-density] to scale paddings + font sizes.
  const[density,setDensity]=useState(()=>localStorage.getItem("density")||"comfortable");
  const[showSearch,setShowSearch]=useState(false);
  const[showAnnForm,setShowAnnForm]=useState(false);
  const[globalFilters,setGlobalFilters]=useState({...defaultFilters});
  const[globalRoster,setGlobalRoster]=useState([]);
  const[globalMonths,setGlobalMonths]=useState([]);
  const[pendingAnnouncements,setPendingAnnouncements]=useState([]);
  // Banner-mode announcements: still live, audience matches, but the
  // sender picked dismiss_mode='banner' so they show as a dismissible
  // card on the dashboard rather than a blocking modal.
  const[bannerAnnouncements,setBannerAnnouncements]=useState([]);
  const[showFeedback,setShowFeedback]=useState(false);
  // Recently viewed QA emails for the sidebar's "Recent" section.
  // Stored per-user in localStorage so it survives sessions.
  const[recentQAs,setRecentQAs]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("recent_qas")||"[]");}catch{return[];}
  });
  const[showShortcutsHelp,setShowShortcutsHelp]=useState(false);
  const[showTour,setShowTour]=useState(false);
  const[feedbackForm,setFeedbackForm]=useState({category:"general",message:"",rating:0});
  const[feedbackSending,setFeedbackSending]=useState(false);
  const[feedbackSent,setFeedbackSent]=useState(false);
  const[isMobile,setIsMobile]=useState(()=>typeof window!=="undefined"&&window.innerWidth<768);
  // Sidebar attention counts — drives the pulsing dot next to nav
  // items that have pending work. Refreshed on mount + every 5 min.
  // Keyed by nav-item.key. Red = urgent (escalations); amber = needs
  // review (violations, tasks). RLS scopes the counts to what the
  // viewer can actually see, so each user gets their own dots.
  const[navCounts,setNavCounts]=useState({});
  // Collapsible sidebar sections — persisted per user across sessions
  const[collapsedSections,setCollapsedSections]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("sb_collapsed_sections")||"[]");}catch{return[];}
  });
  const toggleSection=(s)=>setCollapsedSections(prev=>{
    const next=prev.includes(s)?prev.filter(x=>x!==s):[...prev,s];
    try{localStorage.setItem("sb_collapsed_sections",JSON.stringify(next));}catch{}
    return next;
  });
  const setPage=(p)=>navigate("/"+p);
  // Global runtime error capture → Supabase public.client_errors
  useEffect(() => {
    initErrorLog({
      getToken: () => session?.access_token,
      getUser: () => ({ email: profile?.email, role: profile?.role }),
    });
  }, [session?.access_token, profile?.email, profile?.role]);
  // Gmail OAuth redirect
  useEffect(()=>{const urlP=new URLSearchParams(window.location.search);if(urlP.get("state")==="gmail_oauth"){navigate("/quality",{replace:true});}},[]);
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
    link.href="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="M2 16 L9 16 L12 6 L16 26 L20 10 L23 16 L30 16" stroke="#3BFF9D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  },[]);
  // Persist sidebar collapse
  useEffect(()=>{localStorage.setItem("sb_collapsed",sidebarCollapsed);},[sidebarCollapsed]);
  // Dark mode
  useEffect(()=>{document.documentElement.classList.toggle("dark",darkMode);localStorage.setItem("dark_mode",darkMode);},[darkMode]);
  // Density (cozy / comfortable / compact) — applies via body data-attr
  useEffect(()=>{document.body.dataset.density=density;localStorage.setItem("density",density);},[density]);
  // Global keyboard shortcuts
  useKeyboard({"Meta+k":()=>setShowSearch(true),"Ctrl+k":()=>setShowSearch(true),"Escape":()=>{if(showSearch)setShowSearch(false);else if(showFeedback)setShowFeedback(false);else if(showShortcutsHelp)setShowShortcutsHelp(false);},"?":()=>setShowShortcutsHelp(s=>!s)});
  // Auto-refresh JWT every 10 minutes to prevent expiry
  useEffect(()=>{
    if(!session?.refresh_token)return;
    const interval=setInterval(async()=>{
      try{const s=await sb.auth.getSession();if(s){setSession(s);}}catch{}
    },10*60*1000);
    return()=>clearInterval(interval);
  },[session?.refresh_token]);

  // Daily Riyadh-midnight forced logout was removed (previously this
  // block stamped login_riyadh_date and signed users out the next day).
  // Removed because Supabase already enforces session validity via
  // 1-hour JWTs that auto-refresh — the daily kick added zero security
  // and was actively locking users out (one bad first-of-the-day
  // sign-in, then they had to log in twice). Stale localStorage stamps
  // from before this change are harmless: nothing reads the key now.
  // Defensive cleanup so the key doesn't sit there forever.
  useEffect(()=>{ try{ localStorage.removeItem("login_riyadh_date"); }catch{} }, []);

  // App utilization heartbeat — extracted to src/lib/heartbeat.js so the
  // shell stays focused on routing + layout. Restarts when token, email,
  // or current path changes.
  useEffect(() => startHeartbeat({
    token: session?.access_token,
    email: profile?.email,
    getPagePath: () => location.pathname.replace(/^\//, "") || "dashboard",
  }), [session?.access_token, profile?.email, location.pathname]);
  // Listen for session refresh from sb.query 401 handler
  useEffect(()=>{
    const handler=(e)=>{if(e.detail)setSession(e.detail);};
    window.addEventListener("session-refreshed",handler);
    return()=>window.removeEventListener("session-refreshed",handler);
  },[]);
  // Listen for legacy "navigate" custom events from child pages
  useEffect(()=>{const handler=(e)=>navigate("/"+e.detail);window.addEventListener("navigate",handler);return()=>window.removeEventListener("navigate",handler);},[navigate]);

  // Track recently viewed QA profiles. Reads ?qa= from the hash and
  // pushes the email to the front of the list (max 5, dedup, drop self).
  useEffect(()=>{
    if(page!=="profile")return;
    try{
      const hash=window.location.hash||"";
      const q=hash.includes("?")?new URLSearchParams(hash.split("?")[1]):null;
      const qa=(q?.get("qa")||"").toLowerCase();
      if(!qa||qa===profile?.email?.toLowerCase())return;
      setRecentQAs(prev=>{
        const next=[qa,...prev.filter(e=>e!==qa)].slice(0,6);
        try{localStorage.setItem("recent_qas",JSON.stringify(next));}catch{}
        return next;
      });
    }catch{}
  },[page,location.search,location.hash,profile?.email]);

  // Auto-ack feature releases when the user organically visits the
  // target page. Fetch the unread set on every route change (cheap;
  // small table); if any matches the current path, ack it so it stops
  // appearing in the bell on this device AND on any other device the
  // user logs into.
  useEffect(()=>{
    if(!session?.access_token||!profile?.email)return;
    const currentPath="/"+(location.pathname.replace(/^\//,"")||"dashboard");
    let cancelled=false;
    (async()=>{
      try{
        const releases=await fetchUnreadReleases({token:session.access_token,userEmail:profile.email,role:profile.role});
        if(cancelled)return;
        const match=(releases||[]).find(r=>r.target_path===currentPath);
        if(match){ackRelease({token:session.access_token,userEmail:profile.email,featureKey:match.key,via:"auto_visit"});}
      }catch{}
    })();
    return()=>{cancelled=true;};
  },[session?.access_token,profile?.email,profile?.role,location.pathname]);
  useEffect(()=>{
    // Hard ceiling: regardless of what happens with auth or profile fetch,
    // never leave the user staring at "Loading your workspace…" longer than
    // 12 s. Better to show login or an empty dashboard than a frozen screen.
    let done=false;
    const safety=setTimeout(()=>{if(!done){console.warn("App load watchdog tripped — forcing past loading screen");setLoading(false);}},12000);
    // Race any promise against a per-call timeout so a single hung
    // request can't pin the whole boot for 12 s. Returns the promise's
    // result on success, or null on timeout / rejection so callers can
    // proceed gracefully (and the user can sign in / retry).
    const withTimeout=(p,ms)=>Promise.race([
      Promise.resolve(p).catch(()=>null),
      new Promise(r=>setTimeout(()=>r(null),ms)),
    ]);
    (async()=>{
      try{
        let s=await withTimeout(sb.auth.handleCallback(),6000);
        if(!s)s=await withTimeout(sb.auth.getSession(),4000);
        if(s){
          setSession(s);
          try{
            let p=await withTimeout(sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user?.id}`,token:s.access_token}),5000)||[];
            if(p.length===0 && s.user?.email){
              const emailProf=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`email=eq.${s.user.email}`,token:s.access_token}).catch(()=>[]);
              if(emailProf.length>0){
                await sb.query("profiles",{token:s.access_token,method:"PATCH",body:{id:s.user.id,display_name:s.user.user_metadata?.full_name||s.user.user_metadata?.name||emailProf[0].display_name,avatar_url:s.user.user_metadata?.avatar_url||null},filters:`email=eq.${s.user.email}`}).catch(()=>{});
                p=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user.id}`,token:s.access_token}).catch(()=>[]);
              }
              // Last-resort fallback: still no profile by id but found one
              // by email — use the email-matched profile directly so the
              // user gets through. (Happens when the PATCH/refetch above
              // is blocked by RLS or returns 0 rows due to a stale id.)
              if(p.length===0 && emailProf.length>0){
                console.warn("Falling back to email-matched profile (id sync didn't take):",emailProf[0].id);
                p=emailProf;
              }
            }
            if(p.length>0){setProfile(p[0]);}else if(s.user?.id){
              // Auto-create profile for any signed-in @tabby.* Google
              // account so legitimate new hires can land in the app
              // immediately. (The "not on roster" admin alert + the
              // badge in Admin → Users were removed 2026-05-17 — the
              // canonical roster sync runs daily from the Google
              // Sheet and wipes any manual additions, so the alerts
              // would have been re-firing every morning.)
              const email=s.user.email||"";
              const domain=email.endsWith("@tabby.sa")?"tabby.sa":"tabby.ai";
              const name=s.user.user_metadata?.full_name||s.user.user_metadata?.name||email.split("@")[0].split(".").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ");
              try{
                await sb.query("profiles",{token:s.access_token,method:"POST",body:{id:s.user.id,email,display_name:name,role:"qa",domain,operational_domain:domain,status:"active",avatar_url:s.user.user_metadata?.avatar_url||null}});
                const p2=await sb.query("profiles",{select:"id,email,display_name,avatar_url,role,domain,operational_domain,team_id,status",filters:`id=eq.${s.user.id}`,token:s.access_token});
                if(p2.length>0)setProfile(p2[0]);
              }catch(e){console.error("Auto-create profile:",e);}
            }
          }catch(e){console.error("Profile:",e);}
        }
      }catch(e){
        console.error("App boot:",e);
      }finally{
        done=true;
        clearTimeout(safety);
        setLoading(false);
      }
    })();
    return()=>{clearTimeout(safety);};
  },[]);

  // Load global filter data (roster + months)
  useEffect(()=>{if(!session)return;(async()=>{try{
    const[r,m]=await Promise.all([
      listRoster({ token: session.access_token, select: "email,queue,manager_email", cache: false }),
      listMtd({ token: session.access_token, select: "month", filters: "", cache: false }),
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

  // Sidebar attention counts. Three lightweight COUNT-style queries
  // populate the pulsing dots on Quality, Escalations, and Tracker.
  // RLS scopes each query to what the viewer can see, so the dots
  // match their effective workload. Refresh every 5 min.
  useEffect(()=>{
    if(!session)return;
    let cancelled=false;
    const fetchCounts=async()=>{
      const tok=session.access_token;
      const [v,e,t]=await Promise.all([
        sb.query("coaching_violations",{token:tok,select:"id",filters:"status=eq.pending&limit=200"}).catch(()=>[]),
        sb.query("escalations",{token:tok,select:"id",filters:"status=eq.open&limit=200"}).catch(()=>[]),
        sb.query("tasks",{token:tok,select:"id",filters:"status=eq.open&limit=200"}).catch(()=>[]),
      ]);
      if(cancelled)return;
      setNavCounts({
        quality:(v||[]).length,
        escalations:(e||[]).length,
        tracker:(t||[]).length,
      });
    };
    fetchCounts();
    const id=setInterval(fetchCounts,5*60*1000);
    return()=>{cancelled=true;clearInterval(id);};
  },[session]);

  // Load announcements that should surface to this user. Splits into:
  //   * pendingAnnouncements — dismiss_mode='modal', requires ack →
  //     blocks the UI with the full-screen modal until acknowledged.
  //   * bannerAnnouncements   — dismiss_mode='banner' OR ack not
  //     required → renders as a dismissible card on the dashboard.
  // Filters apply isLive (handles expires_at, send_at, deleted_at,
  // published) and matchesAudience (handles all the target_type
  // variants including my_team cross-domain).
  useEffect(()=>{if(!session||!profile)return;(async()=>{try{
    const[anns,acks]=await Promise.all([
      sb.query("announcements",{select:"*",filters:"order=created_at.desc&limit=50",token:session.access_token}).catch(()=>[]),
      sb.query("announcement_acks",{select:"announcement_id",filters:`user_email=eq.${profile.email}`,token:session.access_token}).catch(()=>[]),
    ]);
    const ackedIds=new Set(acks.map(a=>a.announcement_id));
    const myEmail=(profile.email||"").toLowerCase();
    const myQueue=(window.__gfRoster||{})[myEmail]||"";
    const me={email:myEmail,queue:myQueue};
    const mgrMap=window.__gfRosterMgr||{};
    const visible=(anns||[]).filter(a=>{
      if(!annIsLive(a))return false;
      if(!annMatchesAudience(a,me,mgrMap))return false;
      // Acked items don't surface again, regardless of mode.
      if(ackedIds.has(a.id))return false;
      return true;
    });
    const modal=visible.filter(a=>(a.dismiss_mode||"modal")==="modal"&&a.requires_ack!==false);
    const banner=visible.filter(a=>!modal.includes(a));
    setPendingAnnouncements(modal);
    setBannerAnnouncements(banner);
  }catch(e){console.error("Announcements:",e);}})();},[session,profile]);

  const acknowledgeAnnouncement=async(annId)=>{
    try{
      await sb.query("announcement_acks",{token:session.access_token,method:"POST",body:{announcement_id:annId,user_email:profile.email}});
      setPendingAnnouncements(prev=>prev.filter(a=>a.id!==annId));
    }catch(e){console.error("Ack error:",e);}
  };

  // ── Daily refresh enforcement ─────────────────────────────────────
  // After 12:00 KSA each day, prompt the user to reload Pulse once.
  // The reload picks up the latest deployed build + clears stale
  // in-memory state from sessions that have been open since the morning.
  // Tracked in localStorage so we don't nag the same user twice per day.
  // Re-checks on a 1-minute tick + on tab focus so the modal appears
  // at noon even for users who never interact with the page.
  const [showDailyRefresh,setShowDailyRefresh]=useState(false);
  useEffect(()=>{
    if(!session)return;
    const check=()=>{
      const now=new Date();
      // Riyadh = UTC+3, no DST. Compute KSA hour directly so this
      // works regardless of the user's device timezone.
      const ksaHour=(now.getUTCHours()+3)%24;
      const todayKsa=riyadhTodayStr(now);
      let lastAck=null;
      try{lastAck=localStorage.getItem("pulse_daily_refresh_ack");}catch{}
      setShowDailyRefresh(ksaHour>=12&&lastAck!==todayKsa);
    };
    check();
    const id=setInterval(check,60_000);
    const onFocus=()=>check();
    window.addEventListener("focus",onFocus);
    return()=>{clearInterval(id);window.removeEventListener("focus",onFocus);};
  },[session]);
  const acknowledgeDailyRefresh=async()=>{
    // Stamp today's KSA date FIRST so the modal doesn't re-appear on
    // the login screen / next sign-in. Then sign the user out — the
    // login redirect picks up the latest deployed assets cleanly +
    // forces a fresh auth session. (Used to call window.location.reload;
    // switched to logout because re-authenticating is a stronger nudge
    // than a refresh that lots of people swiped past too quickly.)
    try{localStorage.setItem("pulse_daily_refresh_ack",riyadhTodayStr());}catch{}
    setShowDailyRefresh(false);
    try{await sb.auth.signOut();}catch{}
    setSession(null);
    setProfile(null);
    window.location.hash="";
    // Belt-and-suspenders: force a full reload so the next page load
    // is the fresh build, not the old SPA shell rerouting to /login.
    window.location.reload();
  };

  // ── Hooks that MUST run before any early return (Rules of Hooks) ──
  const globalToast=useGlobalToast();
  const realRole=profile?.role||"qa";
  // Effective identity for the session — viewAsUser fully swaps the
  // profile fields children read through AppContext (email, role,
  // domain, team_id, etc.) so a super-admin can step into any user's
  // session and see exactly what they would see. null = own session.
  const userRole=viewAsUser?.role||realRole;
  const effectiveProfile=viewAsUser?{...profile,...viewAsUser}:profile;
  // Convenience flag — read by display elements in the topbar/sidebar
  // so they render the impersonated identity (avatar, name, role,
  // domain badge) instead of the admin's real profile.
  const impersonating=!!viewAsUser;
  // Memoised AppContext value with a stable identity across renders so
  // route changes / interval ticks / toasts don't re-render every
  // useApp() consumer. MUST live here — before the loading / login /
  // mobile early returns — to satisfy the Rules of Hooks. globalRoster is
  // in the deps because window.__gfRoster / __gfRosterMgr are populated
  // alongside setGlobalRoster, keeping rosterMap / rosterMgrMap fresh.
  const appCtx=useMemo(()=>({token:session?.access_token,profile:effectiveProfile,gf:globalFilters,session,setProfile,userRole,rosterMap:window.__gfRoster||{},rosterMgrMap:window.__gfRosterMgr||{},globalToast,realProfile:profile,impersonating}),[session,effectiveProfile,profile,globalFilters,userRole,globalRoster,globalToast,setProfile,impersonating]);
  // Show role-specific onboarding tour once per user
  useEffect(()=>{
    if(!profile?.email)return;
    // Key includes role so if user is promoted they get the new role's training
    const tourKey=`tour_seen_${profile.email.toLowerCase()}_${profile.role||"qa"}`;
    if(!localStorage.getItem(tourKey)){
      setTimeout(()=>setShowTour(true),1500);
    }
  },[profile?.email,profile?.role]);
  const dismissTour=()=>{
    if(profile?.email)localStorage.setItem(`tour_seen_${profile.email.toLowerCase()}_${profile.role||"qa"}`,"1");
    setShowTour(false);
  };
  // Realtime subscriptions (guard: skips if no profile yet)
  useEffect(()=>{
    if(!profile?.email)return;
    const myEmailLocal=profile.email.toLowerCase().split("@")[0];
    const myEmailAlt=profile.email.toLowerCase().endsWith("@tabby.ai")?myEmailLocal+"@tabby.sa":myEmailLocal+"@tabby.ai";
    const teamEmails=globalRoster.filter(r=>{const m=r.manager_email?.toLowerCase();return m&&(m===profile.email.toLowerCase()||m===myEmailAlt||m===myEmailLocal);}).map(r=>r.email?.toLowerCase());
    const unsub=subscribeRealtime({
      profile:effectiveProfile,
      userRole,
      teamEmails,
      onEvent:(type,msg)=>{
        globalToast("success",msg);
        window.dispatchEvent(new CustomEvent("data-changed"));
      },
    });
    return unsub;
  },[profile?.email,userRole]);

  // Responsive mobile detection — reactive to orientation changes / resizes
  useEffect(()=>{const check=()=>setIsMobile(window.innerWidth<768);window.addEventListener("resize",check);return()=>window.removeEventListener("resize",check);},[]);

  // Loading state: render a shell-shaped skeleton (sidebar + topbar +
  // page area) instead of a centred splash. The shapes match the real
  // layout so when data lands, the visual doesn't jump — the user sees
  // structure within ~80 ms instead of staring at a blank screen for
  // a second. The wordmark + status pill at the top keep the brand
  // visible during the load.
  if(loading)return(<div className="app-shell-skel">
    <div className="app-shell-skel-sidebar">
      <div className="app-shell-skel-brand">
        <TabbyPulseWordmark height={20} uid="tpw-loading" style={{color:"#fff"}}/>
      </div>
      {[0,1,2,3].map(g=><div key={`g${g}`}>
        <div className="skeleton app-shell-skel-section"/>
        {[0,1,2,3].map(i=><div key={`g${g}i${i}`} className="skeleton app-shell-skel-nav"/>)}
      </div>)}
    </div>
    <div className="app-shell-skel-main">
      <div className="app-shell-skel-topbar">
        <div className="skeleton app-shell-skel-crumbs"/>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div className="skeleton app-shell-skel-iconbtn"/>
          <div className="skeleton app-shell-skel-iconbtn"/>
          <div className="skeleton app-shell-skel-userchip"/>
        </div>
      </div>
      <div className="app-shell-skel-page">
        <div className="skeleton app-shell-skel-pagetitle"/>
        <div className="skeleton app-shell-skel-pagesub"/>
        <div className="app-shell-skel-kpis">
          {[0,1,2,3].map(i=><div key={i} className="app-shell-skel-kpi">
            <div className="skeleton app-shell-skel-kpil"/>
            <div className="skeleton app-shell-skel-kpiv"/>
            <div className="skeleton app-shell-skel-kpid"/>
          </div>)}
        </div>
        <div className="skeleton app-shell-skel-panel"/>
      </div>
    </div>
  </div>);
  if(!session)return(<div className="login-page login-v2">
    <div className="login-v2-bg" aria-hidden="true"/>
    <div className="login-v2-frame">
      <div className="login-v2-hero">
        <div className="login-v2-wordmark">
          <TabbyPulseWordmark height={56} uid="tpw-login" style={{color:"#fff"}}/>
        </div>
        <h1 className="login-v2-h1">
          Where Tabby measures<br/>
          <span className="login-v2-h1-accent">customer experience.</span>
        </h1>
        <p className="login-v2-lede">
          The internal workspace for scoring, coaching, and resolving — sign in with your Tabby Google account to continue.
        </p>
        <div className="login-v2-cta">
          <button className="login-v2-primary" onClick={()=>sb.auth.signInWithGoogle()}>
            <GoogleLogo/>
            <span>Continue with Google</span>
          </button>
          <p className="login-v2-sso">SSO via <code>@tabby.ai</code> or <code>@tabby.sa</code></p>
          <QualityPrinciple variant="login"/>
        </div>
      </div>
      <div className="login-v2-rail">
        <div className="login-v2-rail-left">
          <div className="login-v2-rail-item"><div className="login-v2-rail-ico"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 11V7a4 4 0 0 0-8 0v4M5 11h14v10H5z"/></svg></div><span>OAuth secured</span></div>
          <div className="login-v2-rail-item"><div className="login-v2-rail-ico"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/></svg></div><span>Role-aware access</span></div>
          <div className="login-v2-rail-item"><div className="login-v2-rail-ico"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><span>Audit trail</span></div>
        </div>
        <div className="login-v2-rail-right">Tabby Pulse · Internal tool · © {new Date().getFullYear()} Tabby</div>
      </div>
    </div>
  </div>);
  const visibleNav=NAV_ITEMS.filter(n=>{
    if (n.key === "escalations") return true;
    return !n.minRole || hasRole(userRole, n.minRole);
  });let curSec=null;
  const guardRole=(role,component,fallbackProps)=>hasRole(userRole,role)?component:<PlaceholderPage {...fallbackProps} minRole={role} userRole={userRole}/>;
  // appCtx is memoised earlier, before the early returns (Rules of Hooks).

  // ── Block QA / senior_qa roles on mobile devices ──
  // They must use a desktop browser. Leads and admins may use mobile.
  if(isMobile&&profile&&(userRole==="qa"||userRole==="senior_qa"))return(
    <div style={{minHeight:"100vh",background:"var(--sidebar-bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px",textAlign:"center",gap:0}}>
      <div style={{fontSize:52,marginBottom:12,lineHeight:1}}>🖥️</div>
      <TabbyPulseWordmark height={38} uid="tpw-desktop-only" style={{color:"#fff",marginBottom:20}}/>
      <h2 style={{color:"#fff",fontSize:20,fontWeight:700,letterSpacing:"-.3px",marginBottom:8,lineHeight:1.3}}>Desktop Only</h2>
      <p style={{color:"rgba(255,255,255,.48)",fontSize:14,lineHeight:1.65,maxWidth:270,marginBottom:28}}>Tabby Pulse is optimised for desktop use. Please open it on your laptop or PC.</p>
      <p style={{color:"rgba(255,255,255,.3)",fontSize:12,marginBottom:20}}>Signed in as&nbsp;<strong style={{color:"rgba(255,255,255,.55)"}}>{nameFromEmail(profile?.email)}</strong></p>
      <button onClick={()=>{sb.auth.signOut();setSession(null);setProfile(null);window.location.hash="";}} style={{padding:"10px 28px",borderRadius:12,border:"1px solid rgba(255,255,255,.14)",background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.65)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",touchAction:"manipulation",WebkitTapHighlightColor:"transparent"}}>Sign out</button>
    </div>
  );

  return(<AppContext.Provider value={appCtx}><div className="app-layout">
    <div className={`mobile-overlay ${sidebarOpen?"open":""}`} onClick={()=>setSidebarOpen(false)}/>
    <aside className={`sidebar ${sidebarOpen?"open":""} ${sidebarCollapsed?"collapsed":""}`}>
      <div className="sidebar-header" style={{display:"flex",alignItems:"center",justifyContent:sidebarCollapsed?"center":"space-between"}}>
        <div className="sidebar-brand">{sidebarCollapsed?<PulseMark size={26} animated/>:<TabbyPulseWordmark height={36} uid="tpw-sidebar" style={{display:"block"}}/>}</div>
        <button className="sidebar-toggle" onClick={()=>setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed?"Expand":"Collapse"} aria-label={sidebarCollapsed?"Expand sidebar":"Collapse sidebar"}>
          <Icon d={sidebarCollapsed?"M9 5l7 7-7 7":"M15 19l-7-7 7-7"} size={16}/>
        </button>
      </div>
      <nav className="sidebar-nav" role="navigation" aria-label="Main navigation">{(()=>{
        // Group items by section so each section header can collapse/expand
        // its items as a unit (with smooth height + chevron animation).
        const groups=[];
        let cur=null;
        visibleNav.forEach(item=>{
          if(item.section&&item.section!==cur){cur=item.section;groups.push({section:item.section,items:[]});}
          else if(groups.length===0){groups.push({section:null,items:[]});}
          groups[groups.length-1].items.push(item);
        });
        return groups.map(g=>{
          const isCollapsed=g.section&&!sidebarCollapsed&&collapsedSections.includes(g.section);
          return(<div key={`grp-${g.section||"root"}`} className="sidebar-group">
            {g.section&&!sidebarCollapsed&&(
              <button className={`sidebar-section${isCollapsed?" is-collapsed":""}`} onClick={()=>toggleSection(g.section)} aria-expanded={!isCollapsed}>
                <span>{g.section}</span>
                <Icon d="M19 9l-7 7-7-7" size={12} className="sidebar-section-chevron"/>
              </button>
            )}
            <div className={`sidebar-group-items${isCollapsed?" is-collapsed":""}`}>
              <div className="sidebar-group-items-inner">
                {g.items.map(item=>{
                  // Pulsing dot is a real <span>, not ::after — keeps it
                  // from clashing with the collapsed-sidebar hover tooltip
                  // (which uses ::after for the floating label).
                  const n=navCounts[item.key]||0;
                  const dotTone=item.key==="escalations"?"":" amber";
                  return(
                  <button key={item.key} className={`nav-item${page===item.key?" active":""}`} onClick={()=>{setPage(item.key);setSidebarOpen(false);}} onMouseEnter={()=>prefetchPage(item.key)} onFocus={()=>prefetchPage(item.key)} data-tooltip={item.label} aria-current={page===item.key?"page":undefined}>
                    <Icon d={item.icon} size={18}/>
                    <span className="nav-item-label">{item.label}</span>
                    {n>0 && <span className={`nav-attn-dot${dotTone}`} title={`${n} pending`}/>}
                  </button>
                  );
                })}
              </div>
            </div>
          </div>);
        });
      })()}</nav>
      {/* Mobile-only footer: user info + dark mode + sign out
          (topbar versions are hidden on mobile to save space) */}
      <div className="sidebar-mobile-footer">
        <div className="sidebar-mobile-user">
          <div className="sidebar-mobile-avatar">
            {effectiveProfile?.avatar_url
              ? <img src={effectiveProfile.avatar_url} alt=""/>
              : <span style={{...avatarStyle(effectiveProfile?.email),display:"inline-flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%",borderRadius:"50%",fontSize:13,fontWeight:700}}>{initialsForAvatar(effectiveProfile?.email)||"U"}</span>}
          </div>
          <div className="sidebar-mobile-user-info">
            <div className="sidebar-mobile-user-name">{nameFromEmail(effectiveProfile?.email)||"User"}</div>
            <div className="sidebar-mobile-user-meta">
              <span className={`role-badge role-${effectiveProfile?.role}`}>{safe(ROLE_LABELS[effectiveProfile?.role])||"QA"}</span>
              <span className="sidebar-mobile-user-domain">{safe(effectiveProfile?.domain)}</span>
            </div>
          </div>
        </div>
        <button className="sidebar-mobile-btn" onClick={()=>setDarkMode(!darkMode)}>
          <Icon d={darkMode?"M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z":"M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"} size={16}/>
          <span>{darkMode?"Light mode":"Dark mode"}</span>
        </button>
        <button className="sidebar-mobile-btn sidebar-mobile-signout" onClick={()=>{sb.auth.signOut();setSession(null);setProfile(null);window.location.hash="";}}>
          <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" size={16}/>
          <span>Sign out</span>
        </button>
      </div>
    </aside>
    <div className="main-content">
      {/* View-as banner — surfaces above the topbar while a
          super-admin is impersonating another user so it's impossible
          to forget you're not in your own session. The Exit button
          drops back to the admin's real profile. */}
      {viewAsUser && <div className="view-as-bar" style={{background:"var(--tabby-purple)"}}>
        <span>👤 Viewing as <strong>{nameFromEmail(viewAsUser.email)}</strong> · <span style={{opacity:.85}}>{viewAsUser.email}</span> · <span style={{opacity:.85}}>{safe(ROLE_LABELS[viewAsUser.role])||viewAsUser.role}</span></span>
        <button onClick={()=>{
          // Audit the exit so the trail captures both ends of the
          // impersonation window (start log written at picker click).
          try{
            sb.query("activity_log",{
              token:session?.access_token,
              method:"POST",
              body:{actor_email:profile?.email,action:"view_as_user_stop",target_type:"profiles",target_id:viewAsUser.id||null,details:`Stopped viewing as ${viewAsUser.email}`},
            }).catch(()=>{});
          }catch{}
          setViewAsUserPersist(null);
        }} style={{background:"#fff",color:"var(--tabby-purple)",border:"none",borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"var(--font)",fontWeight:600}}>Exit</button>
      </div>}
<div className="topbar"><button className="topbar-menu" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><Icon d={icons.menu} size={22}/></button><div className="topbar-title" style={{display:"flex",alignItems:"center",gap:6}}>{(()=>{const item=NAV_ITEMS.find(n=>n.key===page);const section=item?.section||NAV_ITEMS.slice(0,NAV_ITEMS.indexOf(item)).reverse().find(n=>n.section)?.section;return section?<><span style={{color:"var(--tx3)",fontSize:13}}>{section}</span><span style={{color:"var(--tx3)",fontSize:11}}>›</span><span>{item?.label||"Dashboard"}</span></>:<span>{item?.label||"Dashboard"}</span>;})()}</div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
        {/* Send announcement — anyone senior_qa+ can open the composer.
            The form itself enforces audience-by-role inside it. Lives
            on the topbar so the action is one click away from every
            page, not just the dashboard. */}
        {hasRole(effectiveProfile?.role,"senior_qa") && (
          <button className="notif-btn" onClick={()=>setShowAnnForm(true)} title="Send announcement" aria-label="Send announcement">
            <Icon d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" size={18}/>
          </button>
        )}
        {/* Search */}
        <button className="notif-btn" onClick={()=>setShowSearch(true)} title="Search (⌘K)" aria-label="Search">
          <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" size={18}/>
        </button>
        {/* Notifications */}
        <NotificationBell onNavigate={setPage}/>
        {/* Championship belts indicator — only renders if the user holds at least one */}
        <MyBeltIndicator onClick={()=>setPage("leaderboard")}/>
        {/* Density toggle — cycles cozy → comfortable → compact → cozy */}
        <button className="notif-btn topbar-dm-toggle" onClick={()=>{const next={cozy:"comfortable",comfortable:"compact",compact:"cozy"}[density]||"comfortable";setDensity(next);}} title={`Density: ${density} (click to change)`} aria-label={`Toggle density (${density})`}>
          <Icon d={density==="compact"?"M3 6h18M3 10h18M3 14h18M3 18h18":density==="cozy"?"M3 6h18M3 18h18":"M3 6h18M3 12h18M3 18h18"} size={18}/>
        </button>
        {/* Dark mode */}
        <button className="notif-btn topbar-dm-toggle" onClick={()=>setDarkMode(!darkMode)} title={darkMode?"Light mode":"Dark mode"} aria-label={darkMode?"Switch to light mode":"Switch to dark mode"}>
          <Icon d={darkMode?"M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z":"M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"} size={18}/>
        </button>
        {/* View-as-user picker — super-admin only. Opens a small
            popover with a searchable list of every active profile so
            the admin can step into any specific user's session
            (identity-level impersonation). Every start/stop is logged
            to activity_log against the real admin's email. */}
        {realRole==="super_admin"&&!viewAsUser&&<div style={{position:"relative"}}>
          <button onClick={async()=>{
            if(allProfiles.length===0){
              try{
                const rows=await sb.query("profiles",{token:session?.access_token,select:"id,email,display_name,role,domain,operational_domain,team_id,avatar_url",filters:"order=email.asc&limit=500"});
                setAllProfiles(Array.isArray(rows)?rows:[]);
              }catch(e){console.error("Load profiles:",e);}
            }
            setViewAsPickerOpen(v=>!v);
          }} className="topbar-viewas" style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:"1px solid var(--bd)",background:"var(--bg3)",fontFamily:"var(--font)",color:"var(--tx2)",cursor:"pointer"}}>
            👤 View as user
          </button>
          {viewAsPickerOpen && <>
            {/* backdrop closes the popover on outside click */}
            <div onClick={()=>setViewAsPickerOpen(false)} style={{position:"fixed",inset:0,zIndex:90}}/>
            <div className="topbar-viewas-popover" style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:100,width:320,maxHeight:380,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <input
                autoFocus
                value={viewAsSearch}
                onChange={e=>setViewAsSearch(e.target.value)}
                placeholder="Search by name or email…"
                style={{padding:"10px 12px",border:"none",borderBottom:"1px solid var(--bd2)",fontFamily:"var(--font)",fontSize:12,background:"transparent",color:"var(--tx)",outline:"none"}}
              />
              <div style={{overflowY:"auto",flex:1}}>
                {(()=>{
                  const q=viewAsSearch.toLowerCase().trim();
                  const filtered=allProfiles
                    .filter(p=>p.email&&p.id!==profile?.id)
                    .filter(p=>!q||p.email.toLowerCase().includes(q)||(p.display_name||"").toLowerCase().includes(q)||nameFromEmail(p.email).toLowerCase().includes(q))
                    .slice(0,60);
                  if(filtered.length===0)return <div style={{padding:14,fontSize:11,color:"var(--tx3)",textAlign:"center"}}>No matches.</div>;
                  return filtered.map(p=>(
                    <button key={p.id} onClick={()=>{
                      setViewAsUserPersist(p);
                      setViewAsPickerOpen(false);
                      setViewAsSearch("");
                      // Audit trail — every impersonation start is logged
                      // against the REAL admin's email so we can always
                      // trace who-saw-as-who.
                      try{
                        sb.query("activity_log",{
                          token:session?.access_token,
                          method:"POST",
                          body:{actor_email:profile?.email,action:"view_as_user_start",target_type:"profiles",target_id:p.id,details:`Viewing as ${p.email} (${p.role})`},
                        }).catch(()=>{});
                      }catch{}
                    }} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 12px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",borderBottom:"1px solid var(--bd2)",fontFamily:"var(--font)"}}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--tx)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nameFromEmail(p.email)}</div>
                        <div style={{fontSize:10,color:"var(--tx3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.email}</div>
                      </div>
                      <span className={`role-badge role-${p.role}`} style={{fontSize:9,padding:"2px 7px",flexShrink:0}}>{safe(ROLE_LABELS[p.role])||p.role}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>
          </>}
        </div>}
        <div className="topbar-user-section" style={{display:"flex",alignItems:"center",gap:10,marginLeft:8,paddingLeft:12,borderLeft:"1px solid var(--bd)"}}>
          <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",flexShrink:0,cursor:impersonating?"default":"pointer",position:"relative"}} title={impersonating?"Avatar change disabled while impersonating":"Change profile picture"} onClick={()=>{ if(!impersonating) document.getElementById("avatar-upload")?.click(); }}>
            {effectiveProfile?.avatar_url ? <img src={effectiveProfile.avatar_url} alt="" style={{width:32,height:32,objectFit:"cover",borderRadius:"50%"}}/> :
            <div style={{width:32,height:32,borderRadius:"50%",...avatarStyle(effectiveProfile?.email),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700}}>{initialsForAvatar(effectiveProfile?.email)||"U"}</div>}
          </div>
          <input id="avatar-upload" type="file" accept="image/*" style={{display:"none"}} onChange={async(e)=>{
            const file=e.target.files?.[0]; if(!file){return;}
            // Belt-and-braces: even though the click target is disabled
            // while impersonating, refuse the upload here too so the
            // input can't be triggered another way (DevTools, AT, etc.).
            if(impersonating){globalToast("error","Stop viewing as another user before changing your avatar.");e.target.value="";return;}
            if(!file.type?.startsWith("image/")){globalToast("error","Please select an image file");e.target.value="";return;}
            if(file.size>2*1024*1024){globalToast("error","Image must be under 2MB");e.target.value="";return;}
            try{
              // Always pin the path to the user id + a single canonical
              // extension so the avatar URL is stable and re-uploads
              // overwrite (never orphan) the previous file. We use PUT
              // with x-upsert:true — POST would 409 if the path exists.
              const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
              const path=`${profile.id}.${ext}`;
              // Storage PUT expects the raw file bytes as the body.
              // The previous version wrapped the file in FormData, which
              // stored a multipart envelope (headers + boundary + the PNG
              // inside) — the URL worked but the bytes weren't a valid
              // image, so the browser rendered a broken-image icon. Sending
              // the File directly + an explicit Content-Type fixes this.
              const upRes=await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`,{
                method:"PUT",
                headers:{
                  "Authorization":`Bearer ${session.access_token}`,
                  "x-upsert":"true",
                  "Content-Type": file.type || "application/octet-stream",
                  "Cache-Control": "max-age=3600",
                },
                body:file,
              });
              if(!upRes.ok){
                const detail=await upRes.text().catch(()=>"");
                console.error("Avatar storage upload failed:",upRes.status,detail);
                globalToast("error",`Upload failed (${upRes.status}). ${detail.slice(0,120)||"Try a different image."}`);
                e.target.value="";return;
              }
              const url=`${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
              await sb.query("profiles",{token:session.access_token,method:"PATCH",body:{avatar_url:url},filters:`id=eq.${profile.id}`});
              setProfile({...profile,avatar_url:url});
              globalToast("success","Profile picture updated");
            }catch(err){
              console.error("Avatar upload:",err);
              globalToast("error",`Couldn't save profile picture: ${err?.message||"unknown error"}`);
            }
            e.target.value="";
          }}/>
          <div style={{display:"flex",flexDirection:"column",lineHeight:1.2}}>
            <span style={{fontSize:13,fontWeight:600,color:"var(--tx)",letterSpacing:"-.2px"}}>{nameFromEmail(effectiveProfile?.email)||"User"}</span>
            <span className={`role-badge role-${effectiveProfile?.role}`} style={{fontSize:9,padding:"1px 6px",alignSelf:"flex-start"}}>{safe(ROLE_LABELS[effectiveProfile?.role])||"QA"}</span>
          </div>
        </div>
        <span className="topbar-domain-badge" style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:safe(effectiveProfile?.domain)==="tabby.sa"?"rgba(234,88,12,.1)":"rgba(79,70,229,.1)",color:safe(effectiveProfile?.domain)==="tabby.sa"?"#EA580C":"#4F46E5",fontWeight:600}}>{safe(effectiveProfile?.domain)}</span>
        <button className="topbar-signout-btn" onClick={()=>{sb.auth.signOut();setSession(null);setProfile(null);window.location.hash="";}} style={{background:"none",border:"1px solid var(--bd)",borderRadius:8,padding:"5px 12px",fontSize:11,color:"var(--tx3)",cursor:"pointer",fontFamily:"var(--font)",fontWeight:500,transition:"all .2s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--red)";e.currentTarget.style.color="var(--red)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--bd)";e.currentTarget.style.color="var(--tx3)";}}
        >Sign out</button>
      </div>
    </div>
    {/* Global filter bar — slimmed to Month + Domain only.
        Hidden on routes that don't actually consume gf, so users
        don't see "dead controls" that change nothing. Page-level
        filters live under <PageFilters> on each page. */}
    {!HIDE_GLOBAL_FILTER_PAGES.has(page) && <GlobalFilterBar filters={globalFilters} setFilters={setGlobalFilters} months={globalMonths} role={userRole}/>}
    {/* Banner-mode announcements — non-blocking, dismissible card row
        rendered just under the global filter bar so it's prominent
        but doesn't interrupt navigation. requires_ack=true ones
        still record an ack when dismissed (so the sender's "who's
        seen it" panel stays accurate). */}
    {bannerAnnouncements.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,padding:"12px 24px 0"}}>
      {bannerAnnouncements.slice(0,3).map(b=>{
        const dismiss=async()=>{
          if(b.requires_ack){
            try{await sb.query("announcement_acks",{token:session?.access_token,method:"POST",body:{announcement_id:b.id,user_email:profile?.email}});}catch{}
          }
          setBannerAnnouncements(prev=>prev.filter(x=>x.id!==b.id));
        };
        const accent=b.priority==="urgent"?"var(--red)":b.priority==="important"?"var(--amber)":"var(--tabby-purple)";
        return (<div key={b.id} role="status" style={{
          border:`1px solid ${accent}`,borderLeft:`3px solid ${accent}`,
          background:"var(--bg3)",borderRadius:8,padding:"10px 14px",
          display:"flex",alignItems:"flex-start",gap:12,
        }}>
          <span style={{fontSize:18}}>{b.priority==="urgent"?"🔴":b.priority==="important"?"⚠️":"📌"}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>{b.title}</div>
            {b.body_format==="html"
              ? <div style={{fontSize:12,color:"var(--tx2)",marginTop:2,lineHeight:1.5}}
                     dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(String(b.message||""),{ALLOWED_TAGS:["p","br","b","strong","i","em","u","ul","ol","li","a","div","span"],ALLOWED_ATTR:["href","target","rel"]})}}/>
              : <div style={{fontSize:12,color:"var(--tx2)",marginTop:2,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{b.message}</div>}
            <div style={{fontSize:10,color:"var(--tx3)",marginTop:4}}>From {nameFromEmail(b.sent_by)} · {new Date(b.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
          </div>
          <button onClick={dismiss} aria-label="Dismiss" title={b.requires_ack?"Acknowledge & dismiss":"Dismiss"} style={{background:"none",border:"none",color:"var(--tx3)",cursor:"pointer",fontSize:18,padding:4,lineHeight:1}}>×</button>
        </div>);
      })}
    </div>}
    {/* Search overlay */}
    {showSearch&&<GlobalSearch onNavigate={setPage} onClose={()=>setShowSearch(false)}/>}
    {/* Announcement composer — wrapped in Suspense because AnnouncementForm
        is lazy-loaded; without the boundary the page would crash on first
        open while the chunk is in flight. */}
    {showAnnForm&&<Suspense fallback={null}><AnnouncementForm roster={globalRoster} onClose={()=>setShowAnnForm(false)}/></Suspense>}
    {showTour&&<OnboardingTour onDismiss={dismissTour} role={profile?.role}/>}
    {/* First-of-month championship belts splash. Self-contained: fetches its
        own data, decides whether to show, marks itself "seen" on dismiss. */}
    <BeltAnnouncementModal/>
    <div className="page-animate"><Suspense fallback={<div style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",minHeight:240,gap:4}}><div className="pulse-loader"/><QualityPrinciple variant="loading"/></div>}><Routes>
      <Route path="/dashboard" element={<DashboardPage/>}/>
      <Route path="/quality-dna" element={<QualityDNAPage/>}/>
      <Route path="/scores" element={<ScoreEntryPage/>}/>
      <Route path="/csat" element={<CSATPage/>}/>
      <Route path="/expertise" element={hasRole(userRole,"admin")?<ExpertisePage/>:<PlaceholderPage title="Expertise" icon={icons.expertise} minRole="admin" userRole={userRole}/>}/>
      <Route path="/targets" element={<TargetsPage/>}/>
      <Route path="/leaderboard" element={<LeaderboardPage/>}/>
      <Route path="/profile" element={<QAProfilePage/>}/>
      <Route path="/schedule" element={<SchedulePage/>}/>
      <Route path="/escalations" element={<EscalationsPage/>}/>
      <Route path="/tracker" element={hasRole(userRole,"senior_qa")?<TrackerPage/>:<PlaceholderPage title="Tracker" icon={icons.tracker} minRole="senior_qa" userRole={userRole}/>}/>
      <Route path="/quality" element={guardRole("qa_lead",<QualityControlPage/>,{title:"Quality Control",icon:icons.quality})}/>
      {/* Legacy redirects */}
      <Route path="/dam" element={<Navigate to="/quality" replace/>}/>
      <Route path="/plans" element={<Navigate to="/quality" replace/>}/>
      <Route path="/coaching" element={<Navigate to="/quality" replace/>}/>
      {/* Coaching email "I've read this" landing page. Posts an ack to
          coaching_session_acks; route owns its own auth check. */}
      <Route path="/coaching/ack/:id" element={<CoachingAckPage/>}/>
      <Route path="/violations" element={<Navigate to="/quality" replace/>}/>
      <Route path="/audit" element={<Navigate to="/admin" replace/>}/>
      <Route path="/admin" element={hasRole(userRole,"admin")?<AdminPage/>:<PlaceholderPage title="Admin panel" icon={icons.key} minRole="admin" userRole={userRole}/>}/>
      {/* `hasRole(userRole, "admin")` already implies qa_supervisor
          in ROLE_LEVEL, so the OR with qa_supervisor was a dead
          branch. Single gate now matches what App.jsx does for
          every other admin route. */}
      <Route path="/utilization" element={hasRole(userRole,"qa_supervisor")?<UtilizationPage/>:<PlaceholderPage title="App utilization" icon={icons.utilization} minRole="qa_supervisor" userRole={userRole}/>}/>
      <Route path="/hr" element={<PlaceholderPage title="HR cases" description="Disciplinary case tracking." icon={icons.folder} minRole="qa_supervisor" userRole={userRole}/>}/>
      <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
    </Routes></Suspense></div>

    {/* ═══ ANNOUNCEMENT POPUP — blocks until acknowledged ═══ */}
    {pendingAnnouncements.length>0&&<div role="dialog" aria-modal="true" aria-label="Announcement" style={{
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
          <div style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>From: {nameFromEmail(pendingAnnouncements[0].sent_by)} · {new Date(pendingAnnouncements[0].created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
        </div>
        {/* Body */}
        <div style={{padding:"24px"}}>
          {(()=>{
            const ann=pendingAnnouncements[0];
            const priorityStyle={urgent:{bg:"var(--red-bg)",color:"var(--red)",label:"URGENT"},important:{bg:"var(--amber-bg)",color:"var(--amber)",label:"IMPORTANT"},normal:{bg:"var(--primary-light)",color:"var(--tabby-purple,#6A2C79)",label:"INFO"}}[ann.priority]||{};
            return <>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
                <span style={{fontSize:10,padding:"3px 10px",borderRadius:8,background:priorityStyle.bg,color:priorityStyle.color,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>{safe(priorityStyle.label)}</span>
                {ann.target_type!=="all"&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:8,background:"var(--bg2)",color:"var(--tx3)",fontWeight:600}}>To: {ann.target_type==="domain"?String(ann.target_value||""):ann.target_type==="team"?"Team: "+String(ann.target_value||""):String(ann.target_value||"")}</span>}
              </div>
              <h3 style={{fontSize:18,fontWeight:700,marginBottom:12,letterSpacing:"-.3px",lineHeight:1.3}}>{typeof ann.title==="object"?JSON.stringify(ann.title):ann.title}</h3>
              {ann.body_format==="html"
                ? <div style={{fontSize:14,color:"var(--tx2)",lineHeight:1.7,maxHeight:300,overflowY:"auto"}}
                       dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(String(ann.message||""),{ALLOWED_TAGS:["p","br","b","strong","i","em","u","ul","ol","li","a","div","span"],ALLOWED_ATTR:["href","target","rel"]})}}/>
                : <div style={{fontSize:14,color:"var(--tx2)",lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:300,overflowY:"auto"}}>{typeof ann.message==="object"?JSON.stringify(ann.message):ann.message}</div>}
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

    {/* ═══ MANDATORY SURVEY — blocks until the user submits ═══
        Renders self-contained: pulls the active survey, checks for an
        existing response, only mounts the UI if there's something
        outstanding. No-ops otherwise. */}
    <MandatorySurveyModal/>

    {/* ═══ DAILY REFRESH GATE — after 12 KSA, blocks until user reloads ═══ */}
    {showDailyRefresh&&<div role="dialog" aria-modal="true" aria-label="Daily refresh" style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(8px)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:10001,
      animation:"fadeIn .3s cubic-bezier(.4,0,.2,1)",
    }}>
      <div style={{
        width:"100%",maxWidth:480,margin:20,background:"var(--bg3)",borderRadius:20,
        boxShadow:"0 32px 64px rgba(0,0,0,.4)",border:"1px solid var(--bd)",overflow:"hidden",
      }}>
        {/* Header — same purple gradient as the announcement modal so users
            recognise it as a "must acknowledge" surface. */}
        <div style={{
          padding:"20px 24px",background:"linear-gradient(135deg, var(--tabby-purple-dark,#4A1B56), var(--tabby-purple,#6A2C79))",
          color:"#fff",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <span style={{fontSize:22}}>🔐</span>
            <span style={{fontSize:16,fontWeight:700}}>Daily sign-in refresh</span>
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.65)"}}>Triggered daily at 12:00 KSA</div>
        </div>
        {/* Body */}
        <div style={{padding:"24px"}}>
          <p style={{fontSize:14,color:"var(--tx2)",lineHeight:1.65,margin:"0 0 12px"}}>
            To keep things secure and make sure you're on the latest version, Pulse
            signs you out once a day. One quick re-login and you're back — no data
            lost, no work interrupted.
          </p>
          <p style={{fontSize:13,color:"var(--tx3)",lineHeight:1.55,margin:0}}>
            Takes ~5 seconds. Happens once per day.
          </p>
        </div>
        {/* Footer — must acknowledge */}
        <div style={{padding:"16px 24px",borderTop:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--tx3)"}}>You must sign in again to continue</span>
          <button onClick={acknowledgeDailyRefresh} style={{
            padding:"10px 24px",borderRadius:10,border:"none",
            background:"var(--tabby-purple,#6A2C79)",color:"#fff",fontSize:13,fontWeight:700,
            cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",
          }}
            onMouseEnter={e=>{e.currentTarget.style.background="var(--tabby-purple-light,#8B4D99)";e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="var(--tabby-purple,#6A2C79)";e.currentTarget.style.transform="translateY(0)";}}
          >Sign out &amp; back in</button>
        </div>
      </div>
    </div>}

    {/* ═══ KEYBOARD SHORTCUTS HELP ═══ */}
    {showShortcutsHelp&&<div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setShowShortcutsHelp(false)}>
      <div onClick={e=>e.stopPropagation()} style={{borderRadius:16,width:"100%",maxWidth:360,padding:24}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Keyboard shortcuts</div>
        {[["Cmd/Ctrl + K","Open search"],["Escape","Close overlay / modal"],["?","Toggle this help"],["1 - 4","Switch tabs (on tabbed pages)"]].map(([k,d])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--bd2)"}}>
            <span style={{fontSize:13,color:"var(--tx2)"}}>{d}</span>
            <kbd style={{fontSize:11,padding:"2px 8px",borderRadius:6,background:"var(--bg)",border:"1px solid var(--bd)",fontFamily:"var(--font)",color:"var(--tx3)"}}>{k}</kbd>
          </div>
        ))}
        <button className="btn btn-outline" style={{marginTop:12,width:"100%",fontSize:12}} onClick={()=>{setShowShortcutsHelp(false);setShowTour(true);}}>🎯 Replay onboarding tour</button>
        <button className="btn btn-outline" style={{marginTop:8,width:"100%"}} onClick={()=>setShowShortcutsHelp(false)}>Close</button>
      </div>
    </div>}

    {/* ═══ FEEDBACK FLOATING BUTTON + MODAL ═══ */}
    {!showFeedback&&<button className="feedback-fab" onClick={()=>{setShowFeedback(true);setFeedbackSent(false);setFeedbackForm({category:"general",message:"",rating:0});}} style={{
      position:"fixed",bottom:24,right:24,width:48,height:48,borderRadius:"50%",border:"none",
      background:"var(--tabby-purple,#6A2C79)",color:"#fff",fontSize:20,cursor:"pointer",
      boxShadow:"0 4px 20px rgba(106,44,121,.4)",display:"flex",alignItems:"center",justifyContent:"center",
      zIndex:900,transition:"all .2s",
    }}
      onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.1)";e.currentTarget.style.boxShadow="0 6px 28px rgba(106,44,121,.5)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 4px 20px rgba(106,44,121,.4)";}}
      title="Send feedback"
      aria-label="Send feedback"
    >💬</button>}

    {showFeedback&&<div className="feedback-panel" style={{position:"fixed",bottom:24,right:24,width:380,maxHeight:"80vh",background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"0 16px 48px rgba(0,0,0,.25)",zIndex:950,overflow:"hidden",display:"flex",flexDirection:"column"}}>
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

    {/* ═══ MOBILE BOTTOM NAV — only visible on mobile (≤768px) via CSS ═══ */}
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Bottom navigation">
      {[
        {key:"dashboard",label:"Home",icon:icons.dashboard},
        {key:"profile",label:"Profile",icon:icons.profile},
        {key:"schedule",label:"Attendance",icon:icons.attendance},
        hasRole(userRole,"admin")?{key:"admin",label:"Admin",icon:icons.key}:hasRole(userRole,"qa_lead")?{key:"quality",label:"Quality",icon:icons.quality}:{key:"leaderboard",label:"Rank",icon:icons.podium},
      ].map(item=>(
        <button key={item.key} className={`mobile-bottom-nav-item${page===item.key?" active":""}`} onClick={()=>{setPage(item.key);setSidebarOpen(false);}} onTouchStart={()=>prefetchPage(item.key)}>
          <Icon d={item.icon} size={20}/>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>

    </div>
  </div></AppContext.Provider>);
}

// Version-check banner — owns its own state and runs the poll loop
// independently of AppInner. Rendered OUTSIDE the ErrorBoundary so a
// crash inside the app doesn't take this banner down with it; the user
// can always click "Reload now" to escape a broken bundle. Session is
// preserved on reload because sb_session lives in localStorage.
function VersionBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    const stop = startVersionCheck({
      onUpdateAvailable: (info) => setUpdateAvailable(!!info),
    });
    return () => stop?.();
  }, []);
  if (!updateAvailable) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "9px 16px",
      background: "linear-gradient(90deg, var(--tabby-purple, #6A2C79) 0%, var(--tabby-purple-light, #8B5CF6) 100%)",
      color: "#fff", fontSize: 13, fontWeight: 600, zIndex: 9999,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <span>✨ A new version of Tabby Pulse is available — your work-in-progress is preserved on reload.</span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => window.location.reload()} style={{
          background: "#fff", border: "none", borderRadius: 6,
          padding: "4px 14px", fontSize: 12, cursor: "pointer",
          fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, color: "#6A2C79",
        }}>Reload now</button>
        <button onClick={() => setUpdateAvailable(false)} style={{
          background: "rgba(0,0,0,.2)", border: "none", borderRadius: 6,
          padding: "4px 12px", fontSize: 12, cursor: "pointer",
          fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600, color: "#fff",
        }}>Later</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <VersionBanner />
      <ErrorBoundary><ToastProvider><HashRouter><AppInner/></HashRouter></ToastProvider></ErrorBoundary>
    </>
  );
}
