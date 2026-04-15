import React, { useState, useEffect, useCallback } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError } from "../lib/utils.js";
import { useConfirm } from "../lib/hooks.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import { useApp } from "../lib/AppContext.jsx";

const DAILY_TARGET_METRICS = [
  {key:"daily_sbs",label:"SBS evals",icon:"📋",unit:"evals",type:"number"},
  {key:"daily_non_sbs",label:"Non-SBS evals",icon:"📝",unit:"evals",type:"number"},
  {key:"sbs_time_mins",label:"Time per SBS",icon:"⏳",unit:"mins",type:"number"},
  {key:"non_sbs_time_mins",label:"Time per Non-SBS",icon:"⏳",unit:"mins",type:"number"},
];
const TARGET_METRICS = [
  {key:"sbs",label:"SBS evaluations / month",type:"number"},
  {key:"non_sbs",label:"Non-SBS evaluations / month",type:"number"},
  {key:"occupancy_pct",label:"Occupancy %",type:"percent"},
  {key:"coaching_completion_pct",label:"Coaching completion %",type:"percent"},
  {key:"ontime_coaching_pct",label:"On-time coaching %",type:"percent"},
  {key:"rtr_count",label:"RTR evaluations / month",type:"number"},
  {key:"calibration_count",label:"Calibrations / month",type:"number"},
  {key:"observed_coaching_count",label:"Coaching observations / month",type:"number"},
  {key:"ticket_per_day",label:"Tickets / day",type:"number"},
  {key:"final_performance",label:"Final performance score",type:"decimal"},
  {key:"daily_working_hours",label:"Working hours / day",type:"number"},
  {key:"sbs_duration_minutes",label:"SBS duration (minutes)",type:"number"},
  {key:"non_sbs_duration_minutes",label:"Non-SBS duration (minutes)",type:"number"},
  {key:"coaching_duration_minutes",label:"Coaching duration (minutes)",type:"number"},
];

const ALL_OVERRIDE_METRICS = [
  ...DAILY_TARGET_METRICS,
  ...TARGET_METRICS,
];

function TargetsPage() {
  const{token,profile,globalToast}=useApp();
  const [targets, setTargets] = useState([]);
  const [teams, setTeams] = useState([]);
  const [roster, setRoster] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selTeam, setSelTeam] = useState("Default");
  const [selDomain, setSelDomain] = useState("all");
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [tab, setTab] = useState("team"); // "team" | "qa"
  const [selQA, setSelQA] = useState("");
  const [qaSearch, setQaSearch] = useState("");
  const [selLead, setSelLead] = useState("");
  const {ask: confirmAsk, el: confirmEl} = useConfirm();

  const isLead = hasRole(profile?.role, "qa_lead");
  const isAdmin = hasRole(profile?.role, "admin");
  const myEmail = profile?.email?.toLowerCase() || "";

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
  };

  const load = useCallback(async () => {
    try {
      const [t, tm, r, pr] = await Promise.all([
        sb.query("team_targets", {select:"*",filters:"order=team_name.asc,metric.asc",token}).catch(()=>[]),
        sb.query("teams", {select:"id,name,lead_id,profiles!fk_teams_lead(email)",token}).catch(()=>[]),
        sb.query("qa_roster", {select:"email,display_name,manager_email,queue",token}).catch(()=>[]),
        dataCache.fetch("profiles_email_role",()=>sb.query("profiles", {select:"email,role",token}).catch(()=>[])),
      ]);
      setTargets(Array.isArray(t) ? t : []);
      setTeams(Array.isArray(tm) ? tm : []);
      setRoster(Array.isArray(r) ? r : []);
      setProfiles(Array.isArray(pr) ? pr : []);
    } catch(e) { console.error("Targets load:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);

  // Get team names — leads see their teams + Default, admins see all
  const teamNames = (() => {
    const names = new Set(["Default"]);
    teams.forEach(t => names.add(t.name));
    if (!isAdmin) {
      // Leads only see teams they lead
      const myTeams = teams.filter(t => t.profiles?.email?.toLowerCase() === myEmail);
      const filtered = new Set(["Default"]);
      myTeams.forEach(t => filtered.add(t.name));
      return [...filtered].sort();
    }
    return [...names].sort();
  })();

  // Get targets: team+domain → team+all → Default+domain → Default+all
  const getTarget = (metric) => {
    const find = (team, dom) => targets.find(t => t.team_name === team && t.domain === dom && t.metric === metric);
    // Try exact match first
    const exact = find(selTeam, selDomain);
    if (exact) return { ...exact, source: "exact" };
    // Try team + all domains
    if (selDomain !== "all") {
      const teamAll = find(selTeam, "all");
      if (teamAll) return { ...teamAll, source: "team-all" };
    }
    // Try Default + domain
    if (selTeam !== "Default") {
      const defDom = find("Default", selDomain);
      if (defDom) return { ...defDom, source: "default-domain" };
      const defAll = find("Default", "all");
      if (defAll) return { ...defAll, source: "default" };
    }
    return null;
  };

  const saveTarget = async (metric, forQA) => {
    const val = parseFloat(editValue);
    if (isNaN(val)) { globalToast("error", "Invalid number"); return; }
    try {
      if (forQA) {
        // Per-QA override
        const existing = targets.find(t => t.qa_email?.toLowerCase() === forQA.toLowerCase() && t.metric === metric);
        if (existing) {
          await sb.query("team_targets", {token, method:"PATCH", body:{target_value:val, updated_by:myEmail, updated_at:new Date().toISOString()}, filters:`id=eq.${existing.id}`});
        } else {
          const label = ALL_OVERRIDE_METRICS.find(m=>m.key===metric)?.label || metric;
          await fetch(`${SUPABASE_URL}/rest/v1/team_targets`, {
            method:"POST", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`,"Prefer":"return=minimal"},
            body:JSON.stringify({team_name:"Override", domain:"all", metric, target_value:val, target_label:label, updated_by:myEmail, qa_email:forQA.toLowerCase()})
          });
        }
      } else {
        const existing = targets.find(t => t.team_name === selTeam && t.domain === selDomain && t.metric === metric && !t.qa_email);
        if (existing) {
          await sb.query("team_targets", {token, method:"PATCH", body:{target_value:val, updated_by:myEmail, updated_at:new Date().toISOString()}, filters:`id=eq.${existing.id}`});
        } else {
          const label = ALL_OVERRIDE_METRICS.find(m=>m.key===metric)?.label || metric;
          await fetch(`${SUPABASE_URL}/rest/v1/team_targets?on_conflict=team_name,domain,metric`, {
            method:"POST", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`,"Prefer":"resolution=merge-duplicates,return=minimal"},
            body:JSON.stringify({team_name:selTeam, domain:selDomain, metric, target_value:val, target_label:label, updated_by:myEmail})
          });
        }
      }
      globalToast("success", "Target updated");
      setEditing(null);
      load();
    } catch(e) { globalToast("error", safeError(e)); }
  };

  const deleteQAOverride = async (id) => {
    try {
      await sb.query("team_targets", {token, method:"DELETE", filters:`id=eq.${id}`});
      globalToast("success", "Override removed");
      load();
    } catch(e) { globalToast("error", safeError(e)); }
  };

  const copyFromDefault = async () => {
    if (selTeam === "Default" && selDomain === "all") return;
    confirmAsk("Copy defaults?", `Copy Default targets to "${selTeam}" (${selDomain})? Existing custom targets will be overwritten.`, async () => {
      try {
        const defaults = targets.filter(t => t.team_name === "Default" && (t.domain === "all" || t.domain === selDomain));
        for (const d of defaults) {
          await fetch(`${SUPABASE_URL}/rest/v1/team_targets?on_conflict=team_name,domain,metric`, {
            method:"POST", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`,"Prefer":"resolution=merge-duplicates,return=minimal"},
            body:JSON.stringify({team_name:selTeam, domain:selDomain, metric:d.metric, target_value:d.target_value, target_label:d.target_label, updated_by:myEmail})
          });
        }
        globalToast("success", `Copied ${defaults.length} targets to ${selTeam}`);
        load();
      } catch(e) { globalToast("error", safeError(e)); }
    }, "Copy", "var(--tabby-purple)");
  };

  if (loading) return <div className="page"><SkeletonPage/></div>;

  // QA list for overrides — grouped by lead
  const excludeRoles = new Set(["qa_lead","qa_supervisor","admin","super_admin"]);
  const nonQaEmails = new Set(profiles.filter(p => excludeRoles.has(p.role)).map(p => p.email?.toLowerCase()));
  const qaList = roster.filter(r => {
    const em = r.email?.toLowerCase();
    if (!em || nonQaEmails.has(em)) return false;
    const mgr = r.manager_email?.toLowerCase();
    return mgr && qaLeadSet.has(mgr);
  }).sort((a,b) => (a.email||"").localeCompare(b.email||""));
  const qaLeadSet = new Set(profiles.filter(p => p.role === "qa_lead").map(p => p.email?.toLowerCase()));
  const leadEmails = [...qaLeadSet].filter(Boolean).sort();
  const filteredQAList = qaList.filter(r => {
    if (selLead && r.manager_email?.toLowerCase() !== selLead) return false;
    if (qaSearch && !r.email.toLowerCase().includes(qaSearch.toLowerCase()) && !nameFromEmail(r.email).toLowerCase().includes(qaSearch.toLowerCase())) return false;
    return true;
  });
  // QAs that already have overrides
  const qasWithOverrides = [...new Set(targets.filter(t => t.qa_email).map(t => t.qa_email.toLowerCase()))];

  return (
    <div className="page">
      {confirmEl}
      <div className="page-header">
        <div className="page-title">QA Targets</div>
        <div className="page-subtitle">Set KPI targets per team or per individual QA</div>
      </div>

      {/* Tab switcher */}
      <div style={{display:"flex",gap:0,marginBottom:16,borderBottom:"2px solid var(--bd)"}}>
        {[{key:"team",label:"Team Defaults"},{key:"qa",label:"QA Overrides"}].map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",border:"none",borderBottom:tab===t.key?"2px solid var(--tabby-purple)":"2px solid transparent",
            background:"none",color:tab===t.key?"var(--tabby-purple)":"var(--tx3)",marginBottom:-2,fontFamily:"var(--font)",transition:"all .15s"
          }}>{t.label}{t.key==="qa" && qasWithOverrides.length > 0 ? ` (${qasWithOverrides.length})` : ""}</button>
        ))}
      </div>

      {tab === "team" && <>
      {/* Team & Domain selector */}
      <div className="card" style={{padding:"12px 16px",marginBottom:16}}>
        <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:10,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>Team</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {teamNames.map(tn => (
                <button key={tn} onClick={() => setSelTeam(tn)} style={{
                  padding:"5px 12px",borderRadius:8,fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid var(--bd)",fontFamily:"var(--font)",
                  background:selTeam===tn?"var(--tabby-purple)":"transparent",color:selTeam===tn?"#fff":"var(--tx2)",transition:"all .15s"
                }}>{tn}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>Domain</div>
            <div style={{display:"flex",gap:6}}>
              {["all","tabby.ai","tabby.sa"].map(d => (
                <button key={d} onClick={() => setSelDomain(d)} style={{
                  padding:"5px 12px",borderRadius:8,fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid var(--bd)",fontFamily:"var(--font)",
                  background:selDomain===d?"var(--tabby-purple)":"transparent",color:selDomain===d?"#fff":"var(--tx2)",transition:"all .15s"
                }}>{d === "all" ? "All domains" : d}</button>
              ))}
            </div>
          </div>
          {(selTeam !== "Default" || selDomain !== "all") && <button className="btn btn-outline btn-sm" style={{fontSize:10,alignSelf:"flex-end"}} onClick={copyFromDefault}>Copy from Default</button>}
        </div>
      </div>

      {/* ═══ DAILY TARGETS — smart card layout ═══ */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <span className="card-title">Daily targets — {selTeam} {selDomain !== "all" ? `(${selDomain})` : ""}</span>
          <span style={{fontSize:11,color:"var(--tx3)"}}>How much each QA should complete per day</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,padding:"12px 16px"}}>
          {DAILY_TARGET_METRICS.map(m => {
            const target = getTarget(m.key);
            const val = target?.target_value ?? "—";
            const isEdit = editing === m.key;
            const isCustom = targets.some(t => t.team_name === selTeam && t.domain === selDomain && t.metric === m.key);
            const isInherited = !isCustom && (selTeam !== "Default" || selDomain !== "all");
            return (
              <div key={m.key} style={{background:"var(--bg)",borderRadius:12,padding:16,textAlign:"center",border:"1px solid var(--bd)",cursor:isEdit?"default":"pointer",transition:"all .15s"}}
                onClick={()=>{if(!isEdit){setEditing(m.key);setEditValue(target?.target_value||"");}}}
                onMouseEnter={e=>{if(!isEdit)e.currentTarget.style.borderColor="var(--tabby-purple)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--bd)";}}
              >
                <div style={{fontSize:22,marginBottom:4}}>{m.icon}</div>
                {isEdit ? <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"center"}}>
                  <input type="number" className="form-input" style={{width:70,fontSize:16,fontWeight:700,textAlign:"center",padding:"4px 8px"}} value={editValue} onChange={e=>setEditValue(e.target.value)} autoFocus
                    onKeyDown={e=>{if(e.key==="Enter")saveTarget(m.key);if(e.key==="Escape")setEditing(null);}}/>
                  <button className="btn btn-primary btn-sm" style={{fontSize:10,padding:"4px 8px"}} onClick={e=>{e.stopPropagation();saveTarget(m.key);}}>✓</button>
                </div>
                : <div style={{fontSize:24,fontWeight:800,color:isInherited?"var(--tx3)":"var(--tx)"}}>{val}</div>}
                <div style={{fontSize:11,fontWeight:600,color:"var(--tx2)",marginTop:4}}>{m.label}</div>
                <div style={{fontSize:9,color:"var(--tx3)",marginTop:2}}>{isInherited?"inherited":"per QA / day"} · {m.unit}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ MONTHLY KPI TARGETS ═══ */}
      {/* Targets grid */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{selTeam} targets {selDomain !== "all" ? `(${selDomain})` : ""}</span>
          {(selTeam !== "Default" || selDomain !== "all") && <span style={{fontSize:11,color:"var(--tx3)"}}>Custom values override Default. Unset metrics fall back to Default.</span>}
        </div>
        <div style={{padding:"0 16px 16px"}}>
          {TARGET_METRICS.map(m => {
            const target = getTarget(m.key);
            const isCustom = targets.some(t => t.team_name === selTeam && t.domain === selDomain && t.metric === m.key);
            const isDefault = !isCustom && (selTeam !== "Default" || selDomain !== "all");
            const source = target?.source;
            const isEdit = editing === m.key;
            return (
              <div key={m.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid var(--bd)"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--tx)"}}>{m.label}</div>
                  {isDefault && <div style={{fontSize:10,color:"var(--tx3)"}}>
                    {source==="team-all"?"Using team (all domains)":source==="default-domain"?"Using Default ("+selDomain+")":"Using Default"}
                  </div>}
                  {target?.updated_by && target.updated_by !== "system" && <div style={{fontSize:10,color:"var(--tx3)"}}>Set by {nameFromEmail(target.updated_by)}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {isEdit ? <>
                    <input type="number" step={m.type==="decimal"?"0.01":"1"} className="form-input" style={{width:80,fontSize:13,padding:"6px 10px",textAlign:"right"}} value={editValue} onChange={e=>setEditValue(e.target.value)} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveTarget(m.key);if(e.key==="Escape")setEditing(null);}}/>
                    <button className="btn btn-primary btn-sm" style={{fontSize:10,padding:"4px 10px"}} onClick={()=>saveTarget(m.key)}>Save</button>
                    <button className="btn btn-outline btn-sm" style={{fontSize:10,padding:"4px 8px"}} onClick={()=>setEditing(null)}>Cancel</button>
                  </> : <>
                    <span style={{fontSize:18,fontWeight:700,color:isDefault?"var(--tx3)":"var(--tx)",minWidth:50,textAlign:"right"}}>
                      {target ? (m.type==="percent"?target.target_value+"%":m.type==="decimal"?(target.target_value*100).toFixed(0)+"%":target.target_value) : "—"}
                    </span>
                    <button className="btn btn-outline btn-sm" style={{fontSize:10,padding:"4px 8px"}} onClick={()=>{setEditing(m.key);setEditValue(target?.target_value||"");}}>Edit</button>
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </>}

      {/* ═══ QA OVERRIDES TAB ═══ */}
      {tab === "qa" && <>
        {/* Lead filter bar */}
        <div className="card" style={{padding:"10px 16px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Filter by Lead:</span>
            <button onClick={()=>setSelLead("")} style={{
              padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid var(--bd)",fontFamily:"var(--font)",
              background:!selLead?"var(--tabby-purple)":"transparent",color:!selLead?"#fff":"var(--tx2)"
            }}>All</button>
            {leadEmails.map(le => (
              <button key={le} onClick={()=>setSelLead(le)} style={{
                padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid var(--bd)",fontFamily:"var(--font)",
                background:selLead===le?"var(--tabby-purple)":"transparent",color:selLead===le?"#fff":"var(--tx2)"
              }}>{nameFromEmail(le)}</button>
            ))}
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:16}}>
          {/* QA selector panel */}
          <div className="card" style={{padding:0,maxHeight:"calc(100vh - 270px)",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"12px 12px 8px"}}>
              <input className="form-input" placeholder="Search QA by name or email..." value={qaSearch} onChange={e=>setQaSearch(e.target.value)} style={{fontSize:12}}/>
            </div>
            {qasWithOverrides.length > 0 && !qaSearch && !selLead && <div style={{padding:"0 12px 6px"}}>
              <div style={{fontSize:9,fontWeight:700,color:"var(--green)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>With overrides ({qasWithOverrides.length})</div>
              {qasWithOverrides.map(em => {
                const r = roster.find(x => x.email?.toLowerCase() === em);
                return <div key={em} onClick={()=>setSelQA(em)} style={{
                  padding:"8px 10px",borderRadius:8,cursor:"pointer",fontSize:12,marginBottom:2,
                  fontWeight:selQA===em?600:400,
                  background:selQA===em?"var(--accent-light)":"transparent",
                  color:selQA===em?"var(--accent-text)":"var(--tx2)",
                  display:"flex",justifyContent:"space-between",alignItems:"center"
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:24,height:24,borderRadius:"50%",background:"var(--green-bg)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"var(--green)",flexShrink:0}}>
                      {nameFromEmail(em).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontSize:12,fontWeight:600}}>{nameFromEmail(em)}</div>
                      {r?.manager_email && <div style={{fontSize:9,color:"var(--tx3)"}}>Lead: {nameFromEmail(r.manager_email)}</div>}
                    </div>
                  </div>
                  <span style={{fontSize:9,background:"var(--green-bg)",color:"var(--green)",padding:"2px 6px",borderRadius:4,fontWeight:700}}>{targets.filter(t=>t.qa_email?.toLowerCase()===em).length}</span>
                </div>;
              })}
              <div style={{borderBottom:"1px solid var(--bd)",margin:"8px 0"}}/>
            </div>}
            <div style={{flex:1,overflowY:"auto",padding:"0 12px 12px"}}>
              <div style={{fontSize:9,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>
                {selLead ? `${nameFromEmail(selLead)}'s team (${filteredQAList.length})` : `All QAs (${filteredQAList.length})`}
              </div>
              {filteredQAList.map(r => {
                const em = r.email?.toLowerCase();
                const hasOverride = qasWithOverrides.includes(em);
                return <div key={em} onClick={()=>setSelQA(em)} style={{
                  padding:"8px 10px",borderRadius:8,cursor:"pointer",fontSize:12,marginBottom:2,
                  fontWeight:selQA===em?600:400,
                  background:selQA===em?"var(--accent-light)":"transparent",
                  color:selQA===em?"var(--accent-text)":"var(--tx2)",
                  display:"flex",alignItems:"center",gap:8
                }}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:hasOverride?"var(--green-bg)":"var(--bg3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:hasOverride?"var(--green)":"var(--tx3)",flexShrink:0}}>
                    {nameFromEmail(em).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:hasOverride?600:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nameFromEmail(em)}</div>
                    <div style={{fontSize:9,color:"var(--tx3)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{em}</div>
                  </div>
                  {hasOverride && <span style={{fontSize:7,color:"var(--green)",fontWeight:700,flexShrink:0}}>●</span>}
                </div>;
              })}
              {filteredQAList.length === 0 && <div style={{padding:12,textAlign:"center",color:"var(--tx3)",fontSize:11}}>No QAs found</div>}
            </div>
          </div>

          {/* Override editor */}
          {selQA ? <div>
            <div className="card" style={{padding:16,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:"var(--accent-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"var(--accent-text)"}}>
                  {nameFromEmail(selQA).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize:16,fontWeight:700}}>{nameFromEmail(selQA)}</div>
                  <div style={{fontSize:11,color:"var(--tx3)"}}>{selQA}</div>
                  {(()=>{const r=roster.find(x=>x.email?.toLowerCase()===selQA);return r?.manager_email?<div style={{fontSize:10,color:"var(--tx3)"}}>Lead: {nameFromEmail(r.manager_email)}</div>:null;})()}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Target overrides</span>
                <span style={{fontSize:11,color:"var(--tx3)"}}>Only set metrics that differ from team defaults</span>
              </div>
              <div style={{padding:"0 16px 16px"}}>
                {ALL_OVERRIDE_METRICS.map(m => {
                  const override = targets.find(t => t.qa_email?.toLowerCase() === selQA && t.metric === m.key);
                  const isEdit = editing === "qa-"+m.key;
                  const teamDefault = getTarget(m.key);
                  return (
                    <div key={m.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--bd)"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--tx)"}}>{m.label}</div>
                        <div style={{fontSize:10,color:"var(--tx3)"}}>
                          {override ? "Custom override" : `Default: ${teamDefault?.target_value ?? "—"}`}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {isEdit ? <>
                          <input type="number" step={m.type==="decimal"?"0.01":"1"} className="form-input" style={{width:80,fontSize:13,padding:"6px 10px",textAlign:"right"}} value={editValue} onChange={e=>setEditValue(e.target.value)} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveTarget(m.key,selQA);if(e.key==="Escape")setEditing(null);}}/>
                          <button className="btn btn-primary btn-sm" style={{fontSize:10,padding:"4px 10px"}} onClick={()=>saveTarget(m.key,selQA)}>Save</button>
                          <button className="btn btn-outline btn-sm" style={{fontSize:10,padding:"4px 8px"}} onClick={()=>setEditing(null)}>Cancel</button>
                        </> : <>
                          <span style={{fontSize:16,fontWeight:700,color:override?"var(--green)":"var(--tx3)",minWidth:50,textAlign:"right"}}>
                            {override ? (m.type==="percent"?override.target_value+"%":m.type==="decimal"?(override.target_value*100).toFixed(0)+"%":override.target_value) : "—"}
                          </span>
                          <button className="btn btn-outline btn-sm" style={{fontSize:10,padding:"4px 8px"}} onClick={()=>{setEditing("qa-"+m.key);setEditValue(override?.target_value||teamDefault?.target_value||"");}}>
                            {override?"Edit":"Set"}
                          </button>
                          {override && <button className="btn btn-outline btn-sm" style={{fontSize:10,padding:"4px 8px",color:"var(--red)",borderColor:"var(--red)"}} onClick={()=>deleteQAOverride(override.id)}>×</button>}
                        </>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div> : <div className="card" style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40,color:"var(--tx3)",fontSize:14}}>
            Select a QA from the list to set individual target overrides
          </div>}
        </div>
      </>}
    </div>
  );
}

export default TargetsPage;
