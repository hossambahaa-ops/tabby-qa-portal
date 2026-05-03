import React, { useState, useEffect, useRef } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache, SUPABASE_URL, SUPABASE_ANON } from "../lib/supabase.js";
import { nameFromEmail, csatPctValue, csatColor, safeError, logActivity } from "../lib/utils.js";
import SkeletonPage from "../components/Skeleton.jsx";
import { useApp } from "../lib/AppContext.jsx";
import EvalHistory from "../components/EvalHistory.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";
import { useQaProfileData, bustBulkCache } from "../lib/useQaProfileData.jsx";
import { useFreshness } from "../lib/useFreshness.js";
import FreshnessBadge from "../components/FreshnessBadge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ExpertiseProfileCard from "../components/ExpertiseProfileCard.jsx";
import Badges from "../components/Badges.jsx";
import { ATT_MAP } from "../lib/attendance.js";

// Safe render: prevent objects/arrays from crashing React
const safe = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") { console.warn("safe() caught object:", v); return JSON.stringify(v); }
  return String(v);
};

function QAProfilePage() {
  const { token, profile, gf, globalToast } = useApp();
  const isQA = profile?.role === "qa" || profile?.role === "senior_qa";
  const isLead = hasRole(profile?.role, "qa_lead");
  const myEmail = profile?.email?.toLowerCase() || "";

  // Bulk data load is owned by useQaProfileData; the page keeps the
  // selection / search / expanded-row state plus the per-QA derivations.
  const {
    roster, mtd, sessions, plans, tasks, flags, qaAttendance, dailyScores, teamTargets,
    loading, allQAs, qaLeadSet, refreshDailyScores, refreshMtd,
  } = useQaProfileData(token, profile);

  const [selectedQA, setSelectedQA] = useUrlState("qa", "");
  // Compare with another QA — shows a side-by-side delta strip in the
  // header card. Persisted in the URL so leads can share comparison links.
  const [compareQA, setCompareQA] = useUrlState("vs", "");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSession, setExpandedSession] = useState(null);
  const [freshnessKey, setFreshnessKey] = useState(0);
  const [syncPulse, setSyncPulse] = useState(0);
  const freshness = useFreshness(token, freshnessKey);
  const [expandedFlag, setExpandedFlag] = useState(null);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const [selMonth, setSelMonth] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Tab state — "overview" (today + activity) vs "monthly" (perf + trend + expertise)
  const [activeTab, setActiveTab] = useUrlState("ptab", "overview");

  // Pulls all three live CSVs (Today_Productivity → daily_scores, MTD,
  // Q_Support_Performance → csat_by_topic) in parallel via the matching
  // edge functions, then re-reads the affected tables. Cron runs every
  // 5 min — this button is for "I want it now."
  const refreshLive = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const callSync = (slug) => fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    }).then(r => r.json().then(d => ({ ok: r.ok, data: d })).catch(() => ({ ok: r.ok, data: {} })))
      .catch(e => ({ ok: false, data: { error: e?.message || "fetch failed" } }));
    try {
      const [daily, mtdRes, csat] = await Promise.all([
        callSync("daily-scores-sync"),
        callSync("mtd-sync"),
        callSync("csat-topic-sync"),
      ]);
      // Re-fetch the rows the page reads from, in parallel.
      await Promise.all([refreshDailyScores(), refreshMtd()]);
      // Extract the most descriptive error message from an edge-function response.
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
        globalToast?.("success", `Live sync — ${parts.join(" · ")}`);
        setSyncPulse(p => p + 1); // pulse the FreshnessBadge to confirm visually
        logActivity(token, profile?.email, "live_sync_triggered", "edge_functions", null, `from QA Profile · ${parts.join(" · ")}`);
      } else {
        console.error("[sync] failures:", fail);
        globalToast?.("error", `Sync issue — ${fail[0]}${fail.length > 1 ? ` (+${fail.length - 1} more, see console)` : ""}`);
        logActivity(token, profile?.email, "live_sync_failed", "edge_functions", null, `from QA Profile · ${fail.join(" | ")}`);
      }
    } catch (e) {
      console.error("[sync] unexpected:", e);
      globalToast?.("error", safeError ? safeError(e) : (e?.message || "Sync failed"));
    }
    setRefreshing(false);
    setFreshnessKey(k => k + 1); // re-fetch freshness timestamps after sync
    bustBulkCache(); // next navigation will re-fetch from DB, not cache
  };

  // QAs land on their own profile by default — once data loads.
  useEffect(() => {
    if (!loading && isQA && myEmail && !selectedQA) setSelectedQA(myEmail);
  }, [loading, isQA, myEmail, selectedQA, setSelectedQA]);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
  };

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
  // When the viewer is looking at their own profile, hide DAM flags that
  // are still being investigated. They should only surface to the QA after
  // their lead has reviewed and resolved/dismissed them.
  const viewingSelf = matchQA(profile?.email);
  const qaFlags = flags.filter(f => {
    if (!matchQA(f.qa_email)) return false;
    if (viewingSelf && (f.status === "pending" || f.status === "acknowledged")) return false;
    return true;
  });

  const fmtPct = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    const s = String(val).trim();
    if (s.includes("%")) return s;
    const n = parseFloat(s.replace(",", "."));
    if (isNaN(n)) return s;
    if (n >= 0 && n <= 2) return (n * 100).toFixed(1) + "%";
    return n.toFixed(1) + "%";
  };

  if (loading) return <div className="page"><SkeletonPage/></div>;

  // ═══ LIST VIEW (no QA selected, or QA role sees own profile directly) ═══
  if (!selectedQA && !isQA) return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="page-title">QA Profiles</div>
          <div className="page-subtitle">{visibleQAs.length} team members</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FreshnessBadge ts={freshness} pulseKey={syncPulse} />
          <button className="btn btn-outline btn-sm" onClick={refreshLive} disabled={refreshing} title="Pull the latest Today_Productivity CSV from Google Sheets" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            {refreshing
              ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Refreshing…</>
              : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>Refresh live</>}
          </button>
        </div>
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
      {/* Back button for non-QA roles + Refresh live button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {!isQA && <button className="btn btn-outline" onClick={()=>{setSelectedQA("");setSearchQuery("");}} style={{display:"flex",alignItems:"center",gap:6}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back to list
        </button>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <FreshnessBadge ts={freshness} pulseKey={syncPulse} />
          <button className="btn btn-outline btn-sm" onClick={refreshLive} disabled={refreshing} title="Pull the latest Today_Productivity CSV from Google Sheets" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            {refreshing
              ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Refreshing…</>
              : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>Refresh live</>}
          </button>
        </div>
      </div>

      {/* Header card */}
      {(()=>{
        // Tenure from hiring_date (or fall back to operations_date)
        const startStr = qa?.hiring_date || qa?.operations_date;
        let tenureText = null;
        if (startStr) {
          const start = new Date(startStr);
          const now = new Date();
          const months = (now.getFullYear()-start.getFullYear())*12 + (now.getMonth()-start.getMonth()) - (now.getDate()<start.getDate()?1:0);
          if (months >= 0) {
            const years = Math.floor(months/12);
            const rem = months % 12;
            tenureText = years > 0 ? `${years}y ${rem}m` : `${months}m`;
          }
        }
        // Today's attendance status (from already-loaded qaAttendance)
        const todayStr = new Date().toISOString().split("T")[0];
        const todayAtt = (qaAttendance || []).find(a => matchQA(a.email) && a.date === todayStr);
        const todayCode = todayAtt?.status;
        const todayType = todayCode ? ATT_MAP[todayCode] : null;
        const todayPending = todayAtt?.approval_status === "pending";
        return (
          <div className="card" style={{marginBottom:16,padding:20}}>
            <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:"var(--accent-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"var(--accent-text)",flexShrink:0}}>
                {nameFromEmail(selectedQA).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:20,fontWeight:700}}>{nameFromEmail(selectedQA)}</div>
                <div style={{fontSize:13,color:"var(--tx2)"}}>{selectedQA}</div>
                <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                  {qa?.queue && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--accent-light)",color:"var(--accent-text)",fontWeight:600}}>{qa.queue}</span>}
                  {qa?.country && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--bg3)",color:"var(--tx3)",fontWeight:600}}>{qa.country}</span>}
                  {qa?.manager_email && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--green-bg)",color:"var(--green)",fontWeight:600}}>Lead: {nameFromEmail(qa.manager_email)}</span>}
                  {tenureText && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"var(--bg3)",color:"var(--tx3)",fontWeight:600}} title={`Joined ${new Date(startStr).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`}>📅 {tenureText} tenure</span>}
                  {todayCode && todayType && <span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:todayType.bg,color:todayType.color,fontWeight:700,border:`1px solid ${todayType.color}40`}} title={`Today: ${todayType.label}${todayPending?" (pending approval)":""}`}>Today: {todayCode}{todayPending?" ⏳":""}</span>}
                </div>
                {/* Earned badges — celebrate=true fires a toast the first
                    time a QA sees a freshly earned badge on their own profile */}
                <div style={{marginTop:10}}>
                  <Badges qaEmail={selectedQA} celebrate={selectedQA?.toLowerCase() === myEmail} />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tabs — Overview (today + activity) vs Monthly (perf + trend) */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--bd)",marginBottom:16,overflowX:"auto"}}>
        {[
          { key: "overview", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
          { key: "monthly",  label: "Monthly performance", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
        ].map(tab => (
          <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{
            display:"flex",alignItems:"center",gap:6,padding:"10px 18px",border:"none",
            borderBottom:activeTab===tab.key?"2px solid var(--tabby-purple)":"2px solid transparent",
            background:"transparent",cursor:"pointer",fontSize:13,fontWeight:activeTab===tab.key?700:500,
            color:activeTab===tab.key?"var(--tabby-purple)":"var(--tx2)",
            fontFamily:"var(--font)",whiteSpace:"nowrap",position:"relative",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={tab.icon}/></svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && <>
      {/* KPI cards row */}
      {/* ── Today's KPI cards ── */}
      {(()=>{
        const d = dailyScores.find(x => matchQA(x.qa_email));
        const sbs = parseFloat(d?.sbs_count || d?.sbs || 0);
        const nonSbs = parseFloat(d?.non_sbs_count || d?.non_sbs || 0);
        const totalEvals = sbs + nonSbs;
        const coaching = parseFloat(d?.coaching_count || d?.coaching_sessions || 0);
        const stMins = parseFloat(d?.side_task_minutes || 0);
        const loginHrs = parseFloat(d?.login_hours || 0);
        const loginMins = loginHrs * 60;
        const csatScore = d?.csat_score !== null && d?.csat_score !== undefined ? parseFloat(d.csat_score) : null;
        const ticketsHandled = parseFloat(d?.tickets_handled || 0);
        const apt = d?.apt !== null && d?.apt !== undefined ? parseFloat(d.apt) : null;
        const agpt = d?.agpt !== null && d?.agpt !== undefined ? parseFloat(d.agpt) : null;
        const productivity = loginHrs > 0 ? ticketsHandled / loginHrs : 0;
        const isTicketDay = loginHrs > 0;
        const qaQueue = qa?.queue || "";
        const qaEmail = selectedQA?.toLowerCase() || "";
        const qaDomain = qaEmail.endsWith("@tabby.sa") ? "tabby.sa" : "tabby.ai";
        const findTgt = (metric) => {
          // 1. Per-QA override
          const qaMatch = teamTargets.find(t => t.qa_email?.toLowerCase() === qaEmail && t.metric === metric);
          if (qaMatch) return qaMatch;
          // 2. Team+domain → team+all → Default+domain → Default+all
          const find = (team, dom) => teamTargets.find(t => !t.qa_email && t.team_name === team && t.domain === dom && t.metric === metric);
          return find(qaQueue, qaDomain) || find(qaQueue, "all") || find("Default", qaDomain) || find("Default", "all");
        };
        const sbsTarget = parseFloat(findTgt("daily_sbs")?.target_value) || 3;
        const nonSbsTarget = parseFloat(findTgt("daily_non_sbs")?.target_value) || 10;
        const occTarget = parseFloat(findTgt("occupancy_pct")?.target_value) || 95;
        const whTarget = parseFloat(findTgt("daily_working_hours")?.target_value) || 8;
        const sbsDur = parseFloat(findTgt("sbs_duration_minutes")?.target_value) || 20;
        const nonSbsDur = parseFloat(findTgt("non_sbs_duration_minutes")?.target_value) || 15;
        const coachingDur = parseFloat(findTgt("coaching_duration_minutes")?.target_value) || 30;
        const shiftMins = whTarget * 60;
        const productiveMins = (sbs * sbsDur) + (nonSbs * nonSbsDur) + (coaching * coachingDur) + stMins + loginMins;
        const occPct = shiftMins > 0 ? (productiveMins / shiftMins) * 100 : 0;
        const workingHrs = productiveMins / 60;
        const target = sbsTarget + nonSbsTarget;
        const pct = target > 0 ? Math.min(100, Math.round((totalEvals / target) * 100)) : 0;
        const circumference = 2 * Math.PI * 28;
        const sbsFrac = totalEvals > 0 ? sbs / totalEvals : 0;
        const nsbsFrac = totalEvals > 0 ? nonSbs / totalEvals : 0;
        const sbsArc = sbsFrac * pct / 100 * circumference;
        const nsbsArc = nsbsFrac * pct / 100 * circumference;
        const occPctOfTarget = occTarget > 0 ? Math.round((occPct / occTarget) * 100) : 0;
        const miniBar = (val, max, color) => <div style={{width:"100%",height:4,borderRadius:2,background:"var(--bd2)",marginTop:4}}>
          <div style={{width:Math.min(100,max>0?(val/max)*100:0)+"%",height:4,borderRadius:2,background:color,transition:"width .4s"}}/>
        </div>;
        return <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
          {/* Today's Evals */}
          <div className="card" style={{padding:16,textAlign:"center"}}>
            <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Today's evals</div>
            <div style={{position:"relative",width:64,height:64,margin:"0 auto 8px"}}>
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--bd2)" strokeWidth="5"/>
                {sbs > 0 && <circle cx="32" cy="32" r="28" fill="none" stroke="var(--green)" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${sbsArc} ${circumference - sbsArc}`} transform="rotate(-90 32 32)"/>}
                {nonSbs > 0 && <circle cx="32" cy="32" r="28" fill="none" stroke="var(--blue)" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${nsbsArc} ${circumference - nsbsArc}`} transform={`rotate(${-90 + sbsFrac * pct / 100 * 360} 32 32)`}/>}
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:totalEvals>0?"var(--tx)":"var(--tx3)"}}>{totalEvals>0?totalEvals:"—"}</div>
            </div>
            <div style={{display:"flex",justifyContent:"center",gap:10,fontSize:10}}>
              <span style={{color:"var(--green)",fontWeight:600}}>{sbs} SBS</span>
              <span style={{color:"var(--blue)",fontWeight:600}}>{nonSbs} Non</span>
            </div>
            <div style={{fontSize:10,color:"var(--tx3)",marginTop:4}}>{totalEvals} / {target} target</div>
          </div>

          {/* Occupancy vs target */}
          <div className="card" style={{padding:16,textAlign:"center"}}>
            <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Occupancy</div>
            <div style={{fontSize:28,fontWeight:800,color:occPct>0?(occPctOfTarget>=90?"var(--green)":occPctOfTarget>=60?"var(--amber)":"var(--red)"):"var(--tx3)"}}>
              {occPct > 0 ? occPct.toFixed(1)+"%" : "—"}
            </div>
            <div style={{fontSize:10,color:"var(--tx3)",marginTop:2}}>Target: {occTarget}%</div>
            {miniBar(occPct, occTarget, occPctOfTarget>=90?"var(--green)":occPctOfTarget>=60?"var(--amber)":"var(--red)")}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--tx3)",marginTop:6}}>
              <span>Hours: {workingHrs.toFixed(1)}h</span>
              <span>/ {whTarget}h</span>
            </div>
          </div>

          {/* Coaching + Side Tasks + Final Score */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:10}}>Today's activity</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,color:"var(--tx2)"}}>Coaching</span>
                  <span style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>{coaching}</span>
                </div>
              </div>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,color:"var(--tx2)"}}>Side Tasks</span>
                  <span style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>{stMins>0?(stMins>=60?Math.floor(stMins/60)+"h "+Math.round(stMins%60)+"m":Math.round(stMins)+"m"):"0m"}</span>
                </div>
              </div>
              <div style={{borderTop:"1px solid var(--bd2)",paddingTop:8,marginTop:2}}>
                <div style={{fontSize:10,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>CSAT ({latestMtd?.month || "—"})</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:12,color:"var(--tx2)"}}>CSAT %</span>
                  {(()=>{const v=csatPctValue(latestMtd?.csat_pct);const s=Number(latestMtd?.csat_total||0);const show=v!=null&&s>0;return <span style={{fontSize:13,fontWeight:700,color:csatColor(v,s)}}>{show?v.toFixed(1)+"%":"—"}</span>;})()}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,color:"var(--tx2)"}}>Surveys</span>
                  <span style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>{latestMtd?.csat_total ?? "—"}</span>
                </div>
              </div>
              {isTicketDay && <>
                <div style={{borderTop:"1px solid var(--bd2)",paddingTop:8,marginTop:2}}>
                  <div style={{fontSize:10,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>Ticket Handling</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12,color:"var(--tx2)"}}>Login Hours</span>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>{loginHrs.toFixed(1)}h</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12,color:"var(--tx2)"}}>Tickets Handled</span>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>{Math.round(ticketsHandled)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12,color:"var(--tx2)"}}>Productivity</span>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--accent-text)"}}>{productivity.toFixed(1)}/h</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12,color:"var(--tx2)"}}>APT</span>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>{apt!==null?apt.toFixed(1)+"m":"—"}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,color:"var(--tx2)"}}>AGPT</span>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>{agpt!==null?agpt.toFixed(1)+"m":"—"}</span>
                  </div>
                </div>
              </>}
              <div style={{borderTop:"1px solid var(--bd2)",paddingTop:8,marginTop:2}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,color:"var(--tx2)"}}>Final Score</span>
                  <span style={{fontSize:13,fontWeight:700,color:latestMtd?((latestMtd.final_performance||0)>=0.4?"var(--green)":(latestMtd.final_performance||0)>=0.25?"var(--amber)":"var(--red)"):"var(--tx3)"}}>
                    {latestMtd ? ((latestMtd.final_performance||0)*100).toFixed(1)+"%" : "—"}
                  </span>
                </div>
                <div style={{fontSize:10,color:"var(--tx3)"}}>{ latestMtd?.month || "No data"}</div>
              </div>
            </div>
          </div>
        </div>;
      })()}

      {/* ─── Compare with another QA ─────────────────────────────────
          Lets a lead/admin pick a second QA and see a side-by-side
          delta strip (Score / CSAT / DSAT / Rank). Persisted via the
          `vs=` URL param so links like /profile?qa=a@…&vs=b@… work.   */}
      {!isQA && hasRole(profile?.role, "qa_lead") && (() => {
        const qaOptions = (allQAs || [])
          .filter(r => r.email && r.email.toLowerCase() !== selectedQA?.toLowerCase())
          .map(r => ({ value: r.email.toLowerCase(), label: nameFromEmail(r.email) }))
          .sort((a, b) => a.label.localeCompare(b.label));
        const compareLatest = compareQA ? mtd.filter(m => m.qa_email?.toLowerCase() === compareQA.toLowerCase()).sort((a, b) => (b.month || "").localeCompare(a.month || ""))[0] : null;
        const myLatest = (() => {
          const rows = mtd.filter(m => matchQA(m.qa_email)).sort((a, b) => (b.month || "").localeCompare(a.month || ""));
          return rows[0];
        })();
        const fmtPct = (v) => (v == null || isNaN(v) ? "—" : Number(v).toFixed(1) + "%");
        const fmtNum = (v) => (v == null ? "—" : Number(v).toFixed(1));
        const delta = (mine, other) => {
          if (mine == null || other == null || isNaN(mine) || isNaN(other)) return null;
          const d = mine - other;
          return d;
        };
        const renderRow = (label, mine, other, fmt = fmtNum, higherIsBetter = true) => {
          const d = delta(mine, other);
          const showDelta = d !== null;
          const winLeft = showDelta && (higherIsBetter ? d > 0 : d < 0);
          const winRight = showDelta && (higherIsBetter ? d < 0 : d > 0);
          return (<div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--bd2)",fontSize:13}}>
            <div style={{textAlign:"right",fontWeight:winLeft?700:500,color:winLeft?"var(--green)":"var(--tx2)"}}>{fmt(mine)}</div>
            <div style={{fontSize:10,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",textAlign:"center",minWidth:60}}>{label}</div>
            <div style={{textAlign:"left",fontWeight:winRight?700:500,color:winRight?"var(--green)":"var(--tx2)"}}>{fmt(other)}</div>
          </div>);
        };
        return (
          <div className="card" style={{padding:16,marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:compareQA?14:0,flexWrap:"wrap"}}>
              <span style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Compare with</span>
              <select className="form-input" style={{maxWidth:280,fontSize:13}} value={compareQA||""} onChange={e=>setCompareQA(e.target.value)}>
                <option value="">— Select another QA —</option>
                {qaOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {compareQA && <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setCompareQA("")}>Clear</button>}
            </div>
            {compareQA && (
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,alignItems:"center",marginBottom:8}}>
                  <div style={{textAlign:"right",fontWeight:700,fontSize:14,color:"var(--tx)"}}>{nameFromEmail(selectedQA)}</div>
                  <div style={{fontSize:10,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",textAlign:"center",minWidth:60}}>vs</div>
                  <div style={{textAlign:"left",fontWeight:700,fontSize:14,color:"var(--tx)"}}>{nameFromEmail(compareQA)}</div>
                </div>
                {renderRow("Score", parseFloat(myLatest?.final_performance), parseFloat(compareLatest?.final_performance))}
                {renderRow("CSAT", csatPctValue(myLatest?.csat_pct), csatPctValue(compareLatest?.csat_pct), fmtPct)}
                {renderRow("DSAT", parseFloat(myLatest?.dsat) || 0, parseFloat(compareLatest?.dsat) || 0, (v)=>v==null?"—":Math.round(v), false /* lower is better */)}
                {renderRow("Tickets/day", parseFloat(myLatest?.ticket_per_day), parseFloat(compareLatest?.ticket_per_day))}
                <div style={{fontSize:10,color:"var(--tx3)",marginTop:10,textAlign:"center"}}>Latest month — bold green = winner. DSAT lower is better.</div>
              </>
            )}
          </div>
        );
      })()}

      {/* Tasks summary row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        {/* Tasks */}
        <div className="card" style={{padding:16,textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Tasks</div>
          <div style={{display:"flex",justifyContent:"center",gap:16}}>
            <div><div style={{fontSize:22,fontWeight:800,color:"var(--amber)"}}>{qaTasks.filter(t=>t.status==="pending"||t.status==="in_progress").length}</div><div style={{fontSize:10,color:"var(--tx3)"}}>Open</div></div>
            <div><div style={{fontSize:22,fontWeight:800,color:"var(--green)"}}>{qaTasks.filter(t=>t.status==="done").length}</div><div style={{fontSize:10,color:"var(--tx3)"}}>Done</div></div>
          </div>
        </div>
      </div>

      {/* Coaching history — full width (Overview) */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-header"><span className="card-title">Coaching sessions ({qaSessions.length})</span></div>
        {qaSessions.length > 0 ? <div style={{padding:"0 16px 16px",maxHeight:expandedSession?500:340,overflowY:"auto"}}>
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
                  }}>{safe(s.performance_rating)}</span>}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" style={{transform:isExpanded?"rotate(180deg)":"rotate(0)",transition:"transform .2s"}}><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>
              {isExpanded && <div style={{padding:12,background:"var(--bg)",borderRadius:8,margin:"8px 0",borderBottom:"1px solid var(--bd)"}}>
                {s.email_subject && <div style={{fontSize:12,fontWeight:600,color:"var(--tx)",marginBottom:8}}>Subject: {safe(s.email_subject)}</div>}
                {[["Topics",s.topics],["Strengths",s.strengths],["Areas for improvement",s.weaknesses],["Goals",s.goals],["Action items",s.action_items],["Notes",s.notes||s.agenda],["Next steps",s.next_steps]].map(([label,val])=>
                  val ? <div key={label} style={{marginBottom:8}}>
                    <div style={{fontSize:10,fontWeight:600,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>{label}</div>
                    <div style={{fontSize:12,color:"var(--tx2)",whiteSpace:"pre-wrap",lineHeight:1.5}}>{safe(val)}</div>
                  </div> : null
                )}
                {s.outcome && <div style={{marginTop:4}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:6,fontWeight:600,background:s.outcome==="pass"?"var(--green-bg)":"var(--red-bg)",color:s.outcome==="pass"?"var(--green)":"var(--red)"}}>Outcome: {safe(s.outcome)}</span></div>}
                {s.conclusion && <div style={{marginTop:4}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:6,fontWeight:600,background:"var(--blue-bg)",color:"var(--blue)"}}>Conclusion: {safe(s.conclusion)}</span></div>}
              </div>}
            </div>;
          })}
        </div> : <EmptyState
          variant="compact"
          title="No coaching sessions yet"
          description={isLead && !isQA ? "Schedule a coaching session to start tracking growth." : "Your lead hasn't logged any sessions yet."}
          icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          cta={isLead && !isQA ? { label: "Schedule one →", onClick: () => window.dispatchEvent(new CustomEvent("navigate", { detail: "quality" })) } : undefined}
        />}
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
                  <div style={{fontSize:12,color:t.status==="done"?"var(--tx3)":"var(--tx)",textDecoration:t.status==="done"?"line-through":"none",fontWeight:500}}>{safe(t.title)}</div>
                  <span style={{fontSize:9,padding:"2px 6px",borderRadius:6,fontWeight:600,flexShrink:0,
                    background:t.status==="done"?"var(--green-bg)":t.status==="pending"?"var(--amber-bg)":"var(--blue-bg)",
                    color:t.status==="done"?"var(--green)":t.status==="pending"?"var(--amber)":"var(--blue)"
                  }}>{t.status}</span>
                </div>
                {isExp && <div style={{padding:10,margin:"4px 0 8px",background:"var(--bg)",borderRadius:8,fontSize:12}}>
                  {t.description && <div style={{color:"var(--tx2)",marginBottom:6,whiteSpace:"pre-wrap"}}>{safe(t.description)}</div>}
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
          </div> : <EmptyState
            variant="compact"
            title="No tasks yet"
            description={isLead && !isQA ? "Assign a task or use a template to get started." : "No tasks assigned to you right now."}
            icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />}
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
                  {p.reason && <div style={{fontSize:11,color:"var(--tx3)",marginBottom:6}}>Reason: {safe(p.reason)}</div>}
                  {p.conclusion && <div style={{fontSize:11,color:String(p.conclusion).includes("pass")?"var(--green)":"var(--red)",marginBottom:8,fontWeight:600}}>Conclusion: {safe(p.conclusion)}</div>}
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
          </div> : <EmptyState
            variant="compact"
            title="No action plans"
            description="No PIPs or improvement plans on file — keep it that way."
            icon="M9 12l2 2 4-4M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />}
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
                  {f.notes && <div style={{fontSize:11,color:"var(--tx2)",marginTop:4,whiteSpace:"pre-wrap"}}>{safe(f.notes)}</div>}
                </div>}
              </div>;
            })}
          </div> : <EmptyState
            variant="compact"
            title="No DAM flags"
            description="No deviance from acceptable monitoring rules — clean record."
            icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />}
        </div>
      </div>

      </>}

      {/* ── MONTHLY PERFORMANCE TAB ── */}
      {activeTab === "monthly" && <>
        {/* Performance + Trend in 2-col */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          {/* Performance metrics with month selector */}
          <div className="card">
            <div className="card-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span className="card-title">Performance</span>
              {qaMtd.length > 0 && <select className="select form-input" style={{width:"auto",fontSize:12,padding:"4px 8px"}} value={selMonth||latestMtd?.month||""} onChange={e=>setSelMonth(e.target.value)}>
                {qaMtd.map(m=><option key={m.month} value={m.month}>{m.month}</option>)}
              </select>}
            </div>
            {(()=>{
              const m = selMonth ? qaMtd.find(x=>x.month===selMonth) : latestMtd;
              if(!m) return <div style={{padding:24,textAlign:"center",color:"var(--tx3)",fontSize:13}}>No MTD data available</div>;
              const totalLogin = parseFloat(m.total_login_hours || 0);
              const totalTickets = parseFloat(m.total_tickets_handled || 0);
              const avgProd = totalLogin > 0 ? totalTickets / totalLogin : null;
              const rows = [
                ["SBS", m.sbs],["Non-SBS", m.non_sbs],["DSAT", m.dsat],
                ["RTR Score", fmtPct(m.avg_rtr_score)],["Calibration", fmtPct(m.avg_calibration_match_rate)],
                ["CO Score", fmtPct(m.avg_observation_score_pct)],["Coaching on-time", fmtPct(m.ontime_coaching_pct)],
                ["Tickets/day", m.ticket_per_day ? Number(m.ticket_per_day).toFixed(1) : "—"],
                ["Occupancy", fmtPct(m.occupancy_pct)],["JKQ", m.jkq_score || "—"],
                ["CSAT %", (() => { const v = csatPctValue(m.csat_pct); const s = Number(m.csat_total || 0); return (v != null && s > 0) ? v.toFixed(1) + "%" : "—"; })()],
                ["Surveys", m.csat_total ?? "—"],
              ];
              if (totalLogin > 0 || totalTickets > 0 || m.avg_apt != null || m.avg_agpt != null) {
                rows.push(
                  ["Login Hours (total)", totalLogin > 0 ? totalLogin.toFixed(1) + "h" : "—"],
                  ["Tickets Handled (total)", totalTickets > 0 ? Math.round(totalTickets) : "—"],
                  ["Productivity (avg)", avgProd !== null ? avgProd.toFixed(1) + "/h" : "—"],
                  ["APT (avg)", m.avg_apt != null ? Number(m.avg_apt).toFixed(1) + "m" : "—"],
                  ["AGPT (avg)", m.avg_agpt != null ? Number(m.avg_agpt).toFixed(1) + "m" : "—"],
                );
              }
              return <div style={{padding:"0 16px 16px"}}>
                {rows.map(([label, val], i) => (
                  <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<rows.length-1?"1px solid var(--bd)":"none"}}>
                    <span style={{fontSize:13,color:"var(--tx2)"}}>{label}</span>
                    <span style={{fontSize:13,fontWeight:600,color:"var(--tx)"}}>{safe(val)}</span>
                  </div>
                ))}
              </div>;
            })()}
          </div>

          {/* Performance Trend */}
          {qaMtd.length >= 2 ? <div className="card">
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
          </div> : <div className="card" style={{padding:32,textAlign:"center",color:"var(--tx3)",fontSize:13}}>
            <div style={{fontSize:24,marginBottom:6}}>📈</div>
            <div style={{fontWeight:600,color:"var(--tx2)",marginBottom:2}}>Trend appears after 2 months</div>
            <div>Need at least two months of MTD data to draw the line.</div>
          </div>}
        </div>

        {/* Expertise — admin-only pilot. CSAT-driven topic mastery, follows the same selected month. Full-width below. */}
        {hasRole(profile?.role, "admin") && <ExpertiseProfileCard qaEmail={selectedQA} month={selMonth || latestMtd?.month} />}

        {/* Evaluation History — moved into Monthly performance review */}
        {selectedQA && <EvalHistory qaEmail={selectedQA} matchQA={matchQA} teamTargets={teamTargets} qa={qa} />}
      </>}
    </div>
  );
}

export default QAProfilePage;
