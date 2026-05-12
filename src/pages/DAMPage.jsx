import React, { useState, useEffect, useCallback } from "react";
import { useUrlState } from "../lib/useUrlState.jsx";
import { hasRole, ROLE_LABELS } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { safeError, logActivity, nameFromEmail } from "../lib/utils.js";
import { listProfiles } from "../api/profiles.js";
import { useConfirm, useAutoRefresh } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";
import useKeyboard from "../lib/useKeyboard.jsx";

function DAMPage(){
  const{token,profile,gf,rosterMap,globalToast}=useApp();
  const[tab,setTab]=useUrlState("dam_tab","flags");
  useKeyboard({"1":()=>setTab("flags"),"2":()=>setTab("rules"),"3":()=>setTab("history")});const[rules,setRules]=useState([]);const[flags,setFlags]=useState([]);const[steps,setSteps]=useState([]);
  const[loading,setLoading]=useState(true);const[showCreate,setShowCreate]=useState(false);
  const[selRule,setSelRule]=useState("");const[selProfile,setSelProfile]=useState("");const[flagNotes,setFlagNotes]=useState("");
  const[profiles,setProfiles]=useState([]);
  const[selectedFlags,setSelectedFlags]=useState(new Set());
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  const load=useCallback(async()=>{try{
    const[r,f,s,p]=await Promise.all([
      dataCache.fetch("dam_rules",()=>sb.query("dam_rules",{select:"id,name,description,behavior_type,dam_reference,severity,auditing_flow,executor_role,auditor_role,goal,compliant_action",filters:"is_active=eq.true&order=behavior_type.asc,name.asc",token})),
      sb.query("dam_flags",{select:"id,profile_id,qa_email,rule_id,severity,recommended_action,triggered_at,status,notes,occurrence_number,reviewed_by,reviewed_at,profiles!dam_flags_profile_id_fkey(display_name,email),dam_rules(name,behavior_type,dam_reference)",filters:"order=triggered_at.desc&limit=100",token}).catch(()=>[]),
      dataCache.fetch("dam_escalation_steps_v2",()=>sb.query("dam_escalation_steps",{select:"id,rule_id,occurrence,action,includes_pip,pip_action,deduction_days,is_hr_investigation,domain",filters:"order=domain.asc,rule_id.asc,occurrence.asc",token})),
      listProfiles({ token, select: "id,display_name,email,role" }),
    ]);
    setRules(r);
    // Scope flags and profiles by domain for supervisors
    const svDomain=profile?.operational_domain||profile?.domain||"tabby.ai";
    const isAdminDAM=hasRole(profile?.role,"admin");
    const isSvDAM=hasRole(profile?.role,"qa_supervisor")&&!isAdminDAM;
    let scopedFlags=isSvDAM?f.filter(fl=>(fl.profiles?.email||fl.qa_email||"").endsWith("@"+svDomain)):f;
    let scopedProfiles=isSvDAM?p.filter(pr=>pr.email?.endsWith("@"+svDomain)):p;
    // Slim global filter (Domain only — People dropped in unification).
    if(gf?.domain){scopedFlags=scopedFlags.filter(fl=>(fl.profiles?.email||fl.qa_email||"").endsWith("@"+gf.domain));scopedProfiles=scopedProfiles.filter(pr=>pr.email?.endsWith("@"+gf.domain));}
    setFlags(scopedFlags);setSteps(s);setProfiles(scopedProfiles);
  }catch(e){console.error(e);}setLoading(false);},[token]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);
  useAutoRefresh(load, 60000);

  // EGY uses @tabby.ai, KSA uses @tabby.sa. Steps are duplicated per
  // domain in dam_escalation_steps; resolve the QA's domain from the
  // email and filter accordingly.
  //
  // qa_roster is the source of truth for which domain a person belongs
  // to. A flag's qa_email may carry the cross-domain alias (e.g. an
  // auto-created flag from a coaching_violation that happened to
  // reference @tabby.ai for a person whose canonical roster email is
  // @tabby.sa) — so look the local-part up in the roster first and
  // only fall back to the email's own suffix when the roster has no
  // matching row.
  const canonicalEmail=(email)=>{
    if(!email)return"";
    const lower=email.toLowerCase();
    const rm=rosterMap||{};
    if(rm[lower])return lower;
    const local=lower.split("@")[0];
    if(rm[local+"@tabby.ai"])return local+"@tabby.ai";
    if(rm[local+"@tabby.sa"])return local+"@tabby.sa";
    return lower;
  };
  const domainOf=(email)=>canonicalEmail(email).endsWith("@tabby.sa")?"tabby.sa":"tabby.ai";
  const getStepsForRule=(ruleId,domain="tabby.ai")=>steps.filter(s=>s.rule_id===ruleId&&s.domain===domain).sort((a,b)=>a.occurrence-b.occurrence);
  const getOccurrenceCount=(profileId,ruleId)=>flags.filter(f=>f.profile_id===profileId&&f.rule_id===ruleId&&f.status!=="dismissed").length;
  const profileEmail=(profileId)=>profiles.find(p=>p.id===profileId)?.email||"";

  const createFlag=async()=>{
    if(!selRule||!selProfile){globalToast("error","Select a behavior and a person");return;}
    const occ=getOccurrenceCount(selProfile,selRule)+1;
    const rule=rules.find(r=>r.id===selRule);
    const qaDomain=domainOf(profileEmail(selProfile));
    const step=getStepsForRule(selRule,qaDomain).find(s=>s.occurrence===occ);
    try{
      await sb.query("dam_flags",{token,method:"POST",body:{
        profile_id:selProfile,rule_id:selRule,severity:rule?.severity||"warning",
        recommended_action:step?.includes_pip?"pip":(step?.is_hr_investigation?"termination_review":"coaching"),
        occurrence_number:occ,escalation_step_id:step?.id||null,
        notes:flagNotes,trigger_data:{created_by:profile.id,step_action:step?.action||"No step defined"},
      }});
      globalToast("success",`Flag created — occurrence #${occ}${step?": "+step.action:""}`);
      logActivity(token, profile?.email, "dam_flag_created", "dam_flags", selProfile, `Rule: ${rules.find(r=>r.id===selRule)?.name}, Occurrence: #${occ}`);
      setShowCreate(false);setSelRule("");setSelProfile("");setFlagNotes("");load();
    }catch(e){globalToast("error",safeError(e));}
  };

  const updateFlagStatus=async(flagId,status)=>{
    setFlags(prev=>prev.map(f=>f.id===flagId?{...f,status,reviewed_by:profile.id,reviewed_at:new Date().toISOString()}:f));
    try{
      await sb.query("dam_flags",{token,method:"PATCH",body:{status,reviewed_by:profile.id,reviewed_at:new Date().toISOString()},filters:`id=eq.${flagId}`});
      logActivity(token, profile?.email, `dam_flag_${status}`, "dam_flags", flagId, `Status changed to: ${status}`);
      globalToast("success","Flag updated");
    }catch(e){globalToast("error",safeError(e));load();}
  };
  const bulkUpdateFlags=async(status)=>{
    if(selectedFlags.size===0)return;
    const ids=[...selectedFlags];
    setFlags(prev=>prev.map(f=>selectedFlags.has(f.id)?{...f,status,reviewed_by:profile.id,reviewed_at:new Date().toISOString()}:f));
    try{
      for(const id of ids){
        await sb.query("dam_flags",{token,method:"PATCH",body:{status,reviewed_by:profile.id,reviewed_at:new Date().toISOString()},filters:`id=eq.${id}`});
        logActivity(token,profile?.email,`dam_flag_${status}`,"dam_flags",id,`Bulk status change: ${status}`);
      }
      globalToast("success",`${ids.length} flag${ids.length>1?"s":""} updated`);
      setSelectedFlags(new Set());
    }catch(e){globalToast("error",safeError(e));load();}
  };
  const toggleFlagSel=(id)=>setSelectedFlags(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});

  const behaviorTypes=[{key:"manipulation",label:"Manipulation",color:"var(--red)"},{key:"performance_management",label:"Performance management",color:"var(--amber)"},{key:"completion_attainment",label:"Completion & attainment",color:"var(--accent-text)"}];
  const statusColors={pending:"var(--amber)",acknowledged:"var(--accent-text)",action_created:"var(--blue)",resolved:"var(--green)",dismissed:"var(--tx3)"};

  if(loading)return<div className="page"><SkeletonPage/></div>;

  return(<div className="page">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {flags.filter(f=>f.status==="pending").length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--amber-bg)",color:"var(--amber)",fontSize:12,fontWeight:700}}>{flags.filter(f=>f.status==="pending").length} pending</span>}
      </div>
      <button className="btn btn-primary" onClick={()=>setShowCreate(!showCreate)}><Icon d={icons.plus} size={16}/>Create flag</button>
    </div>

    <div className="tab-bar">
      <button className={`tab-btn ${tab==="flags"?"active":""}`} onClick={()=>setTab("flags")}>Active flags ({flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").length})</button>
      <button className={`tab-btn ${tab==="rules"?"active":""}`} onClick={()=>setTab("rules")}>Behavior rules ({rules.length})</button>
      <button className={`tab-btn ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}>All history ({flags.length})</button>
    </div>

    {showCreate&&<div className="card" style={{marginBottom:16}}>
      <div className="card-header"><span className="card-title">Create DAM flag</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
        <div className="form-group"><label className="form-label">Person</label>
          <SearchableSelect
            options={profiles.filter(p=>p.role==="qa"||p.role==="senior_qa"||p.role==="qa_lead").map(p=>({value:p.id,label:p.email+` (${ROLE_LABELS[p.role]})`}))}
            value={selProfile}
            onChange={setSelProfile}
            placeholder="Select person..."
          />
        </div>
        <div className="form-group"><label className="form-label">Behavior</label>
          <SearchableSelect
            options={rules.map(r=>({value:r.id,label:`[${r.behavior_type}] ${r.name}`}))}
            value={selRule}
            onChange={setSelRule}
            placeholder="Select behavior..."
          />
        </div>
        <div className="form-group"><label className="form-label">Notes</label>
          <textarea className="form-input" rows={2} value={flagNotes} onChange={e=>setFlagNotes(e.target.value)} placeholder="Context, evidence, audit findings..." style={{resize:"vertical"}}/>
        </div>
      </div>
      {selRule&&selProfile&&<div style={{marginTop:12,padding:"10px 14px",background:"var(--bg)",borderRadius:8,fontSize:13}}>
        <strong>Next occurrence:</strong> #{getOccurrenceCount(selProfile,selRule)+1}
        <span style={{marginLeft:10,fontSize:11,padding:"2px 8px",borderRadius:10,background:"var(--bg2)",color:"var(--tx2)",fontWeight:600}}>{domainOf(profileEmail(selProfile))==="tabby.sa"?"KSA":"EGY"}</span>
        {(()=>{const occ=getOccurrenceCount(selProfile,selRule)+1;const step=getStepsForRule(selRule,domainOf(profileEmail(selProfile))).find(s=>s.occurrence===occ);return step?<span> → <span style={{color:step.is_hr_investigation?"var(--red)":"var(--amber)",fontWeight:600}}>{step.action}</span></span>:<span style={{color:"var(--tx3)"}}> — No escalation step defined for this occurrence</span>;})()}
      </div>}
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button className="btn btn-primary" onClick={createFlag}><Icon d={icons.dam} size={16}/>Create flag</button>
        <button className="btn btn-outline" onClick={()=>setShowCreate(false)}>Cancel</button>
      </div>
    </div>}

    {tab==="flags"&&<div className="card">
      {flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").length===0?
        <div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No active flags. Create one above or wait for auto-detection.</p></div>:
        <>
        {selectedFlags.size>0&&<div style={{padding:"10px 16px",margin:"12px 16px 0",background:"var(--accent-light)",borderRadius:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:600,color:"var(--accent-text)"}}>{selectedFlags.size} selected</span>
          <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>bulkUpdateFlags("acknowledged")}>Acknowledge all</button>
          <button className="btn btn-outline btn-sm" style={{fontSize:11,color:"var(--green)"}} onClick={()=>bulkUpdateFlags("resolved")}>Resolve all</button>
          <button className="btn btn-outline btn-sm" style={{fontSize:11,color:"var(--tx3)"}} onClick={()=>bulkUpdateFlags("dismissed")}>Dismiss all</button>
          <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setSelectedFlags(new Set())}>Clear</button>
        </div>}
        <div className="table-wrap"><table><thead><tr>
          <th style={{width:32}}><input type="checkbox" style={{cursor:"pointer",accentColor:"var(--tabby-purple)"}} checked={(()=>{const active=flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed");return active.length>0&&active.every(f=>selectedFlags.has(f.id));})()} onChange={()=>{const active=flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed");const allSel=active.every(f=>selectedFlags.has(f.id));setSelectedFlags(prev=>{const n=new Set(prev);active.forEach(f=>{allSel?n.delete(f.id):n.add(f.id);});return n;});}}/></th>
          <th>Person</th><th>Behavior</th><th>Category</th><th>Occurrence</th><th>Escalation</th><th>Status</th><th>Date</th><th></th>
        </tr></thead><tbody>
          {flags.filter(f=>f.status!=="resolved"&&f.status!=="dismissed").map(f=>{
            const flagDomain=domainOf(f.profiles?.email||f.qa_email);
            const step=f.escalation_step_id?steps.find(s=>s.id===f.escalation_step_id):getStepsForRule(f.rule_id,flagDomain).find(s=>s.occurrence===f.occurrence_number);
            return(<tr key={f.id} style={{background:selectedFlags.has(f.id)?"var(--accent-light)":"transparent"}}>
              <td><input type="checkbox" style={{cursor:"pointer",accentColor:"var(--tabby-purple)"}} checked={selectedFlags.has(f.id)} onChange={()=>toggleFlagSel(f.id)}/></td>
              <td style={{fontWeight:500}}>{nameFromEmail(f.profiles?.email||f.qa_email)}</td>
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
        </tbody></table></div>
        </>}
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
        {[
          {label:"EGY",sub:"tabby.ai",domain:"tabby.ai"},
          {label:"KSA",sub:"tabby.sa",domain:"tabby.sa"},
        ].map(d=>{const list=getStepsForRule(r.id,d.domain);if(list.length===0)return null;return(
          <div key={d.domain} style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:".5px",padding:"3px 8px",borderRadius:8,background:"var(--bg2)",color:"var(--tx2)",minWidth:64,textAlign:"center"}} title={d.sub}>{d.label}</span>
            {list.map(s=><span key={s.id} style={{fontSize:11,padding:"3px 10px",borderRadius:12,background:s.is_hr_investigation||/termination/i.test(s.action)?"var(--red-bg)":"var(--bg2)",color:s.is_hr_investigation||/termination/i.test(s.action)?"var(--red)":"var(--tx2)",fontWeight:500}}>
              {s.occurrence}{s.occurrence===1?"st":s.occurrence===2?"nd":s.occurrence===3?"rd":"th"}: {s.action}
            </span>)}
          </div>
        );})}
      </div>)}
    </div>)}</div>}

    {tab==="history"&&<div className="card">
      {flags.length===0?<div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>{hasRole(profile?.role,"admin")?"No flags in history yet.":hasRole(profile?.role,"qa_supervisor")?"No flags in your domain yet.":"No flags on your team yet."}</p></div>:
      <>
      {hasRole(profile?.role,"super_admin")&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={async()=>{
          confirmAsk("Delete all DAM flags?",`Permanently delete ALL ${flags.length} flag records? This cannot be undone.`,async()=>{
          try{for(const f of flags){await sb.query("dam_flags",{token,method:"DELETE",filters:`id=eq.${f.id}`});}globalToast("success","All DAM flags deleted");setFlags([]);}catch(e){globalToast("error",safeError(e));}
        },"Delete all","var(--red)");}}><Icon d={icons.trash} size={14}/>Clear all history</button>
      </div>}
      <div className="table-wrap"><table><thead><tr><th>Person</th><th>Behavior</th><th>Occ.</th><th>Status</th><th>Date</th><th>Notes</th>{hasRole(profile?.role,"super_admin")&&<th></th>}</tr></thead><tbody>
        {flags.map(f=>(<tr key={f.id}>
          <td style={{fontWeight:500}}>{nameFromEmail(f.profiles?.email||f.qa_email)}</td>
          <td style={{fontSize:13}}>{f.dam_rules?.name||"—"}</td>
          <td>#{f.occurrence_number}</td>
          <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:f.status==="resolved"?"var(--green-bg)":f.status==="dismissed"?"var(--bg2)":"var(--amber-bg)",color:statusColors[f.status]||"var(--tx3)"}}>{f.status}</span></td>
          <td style={{fontSize:12,color:"var(--tx2)"}}>{new Date(f.triggered_at).toLocaleDateString()}</td>
          <td style={{fontSize:12,color:"var(--tx2)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.notes||"—"}</td>
          {hasRole(profile?.role,"super_admin")&&<td>
            <button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={async()=>{
              confirmAsk("Delete DAM flag?","This will permanently delete this flag.",async()=>{
              try{await sb.query("dam_flags",{token,method:"DELETE",filters:`id=eq.${f.id}`});globalToast("success","Flag deleted");setFlags(prev=>prev.filter(x=>x.id!==f.id));}catch(e){globalToast("error",safeError(e));}
            },"Delete","var(--red)");}}><Icon d={icons.trash} size={14}/></button>
          </td>}
        </tr>))}
      </tbody></table></div>
      </>}
    </div>}
    {confirmEl}
  </div>);
}

export default DAMPage;
