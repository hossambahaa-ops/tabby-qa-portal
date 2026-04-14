import React, { useState } from "react";
import { hasRole } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { useConfirm } from "../../lib/hooks.jsx";
import { useApp } from "../../lib/AppContext.jsx";

function APDetectionAlerts({ apDetections, setApDetections, apDismissals, setApDismissals, months }){
  const { profile, token } = useApp();
  const [dismissModal, setDismissModal] = useState(null);
  const [dismissReason, setDismissReason] = useState("");
  const { ask: confirmAsk, el: confirmEl } = useConfirm();

  const isLead = hasRole(profile?.role,"qa_lead");
  const nav = (page) => window.dispatchEvent(new CustomEvent("navigate",{detail:page}));

  const nameFromEmail=(email)=>{if(!email)return"—";const local=email.split("@")[0];return local.split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};

  const scoreColor=(v)=>v>=55*0.7?"var(--green)":v>=55*0.4?"var(--amber)":"var(--red)";

  return <>
    {/* AP/PIP Detection Alerts for TLs */}
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
            <button className="btn btn-primary btn-sm" style={{fontSize:11,padding:"3px 10px",background:d.planType==="pip"?"var(--red)":"",color:d.planType==="pip"?"#fff":""}} onClick={(e)=>{e.stopPropagation();nav("plans");}}>Create {(d.planType||"pip").toUpperCase()}</button>
            {hasRole(profile?.role,"super_admin") ?
              <button className="btn btn-outline btn-sm" style={{fontSize:11,padding:"3px 10px"}} onClick={async(e)=>{e.stopPropagation();try{await sb.query("ap_dismissals",{token,method:"POST",body:{qa_email:d.email,dismissed_by:profile?.email,reason:"Dismissed by super admin",month:months[0]||"",detection_info:d.reason}});setApDetections(prev=>prev.filter(x=>x.email!==d.email));}catch(err){console.error(err);}}}>Dismiss</button> :
              <button className="btn btn-outline btn-sm" style={{fontSize:11,padding:"3px 10px"}} onClick={(e)=>{e.stopPropagation();setDismissModal(d);}}>Dismiss</button>
            }
          </div>
        </div>
      ))}
      {apDetections.length>5&&<div style={{fontSize:12,color:"var(--tx3)",marginTop:8}}>+{apDetections.length-5} more — view all in AP/PIP page</div>}
    </div>}

    {/* Dismiss Modal */}
    {dismissModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20,overflowY:"auto"}} onClick={e=>{if(e.target===e.currentTarget){setDismissModal(null);setDismissReason("");}}}>
      <div className="card" style={{width:"100%",maxWidth:480,margin:20,maxHeight:"85vh",overflowY:"auto"}}>
        <div className="card-header"><span className="card-title">Dismiss AP Detection — {dismissModal.name}</span></div>
        <div style={{fontSize:13,color:"var(--tx2)",marginBottom:12}}>{dismissModal.reason} · Score: {dismissModal.score.toFixed(1)}/55</div>
        <div className="form-group">
          <label className="form-label">Reason for dismissal (required)</label>
          <textarea className="form-input" rows={3} value={dismissReason} onChange={e=>setDismissReason(e.target.value)} placeholder="Explain why this detection is being dismissed — this will be visible to your supervisor..." style={{resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button className="btn btn-primary" disabled={!dismissReason.trim()} onClick={async()=>{
            try{
              await sb.query("ap_dismissals",{token,method:"POST",body:{
                qa_email:dismissModal.email,
                dismissed_by:profile?.email,
                reason:dismissReason.trim(),
                month:months[0]||"",
                detection_info:dismissModal.reason+" · Score: "+dismissModal.score.toFixed(1),
              }});
              setApDetections(prev=>prev.filter(x=>x.email!==dismissModal.email));
              setApDismissals(prev=>[{qa_email:dismissModal.email,dismissed_by:profile?.email,reason:dismissReason.trim(),month:months[0],detection_info:dismissModal.reason,created_at:new Date().toISOString()},...prev]);
              setDismissModal(null);setDismissReason("");
            }catch(err){console.error(err);}
          }}>Confirm dismissal</button>
          <button className="btn btn-outline" onClick={()=>{setDismissModal(null);setDismissReason("");}}>Cancel</button>
        </div>
      </div>
    </div>}

    {/* Supervisor: Recent dismissals by TLs */}
    {hasRole(profile?.role,"qa_supervisor")&&(()=>{
      const leadDismissals=apDismissals.filter(d=>d.reason!=="Dismissed by super admin");
      if(leadDismissals.length===0)return null;
      return <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <span className="card-title">Recent AP dismissals by leads</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"var(--tx3)"}}>{leadDismissals.length} total</span>
            {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" style={{color:"var(--red)",fontSize:10}} onClick={async()=>{
              confirmAsk("Clear dismissal records?","This will allow dismissed QAs to be re-detected.",async()=>{
              try{
                for(const d of apDismissals){await sb.query("ap_dismissals",{token,method:"DELETE",filters:`id=eq.${d.id}`});}
                setApDismissals([]);
              }catch(e){console.error(e);}
            },"Clear all","var(--red)");}}>Clear all</button>}
          </div>
        </div>
        {leadDismissals.slice(0,10).map((d,i)=>(
          <div key={i} style={{padding:"8px 0",borderBottom:"1px solid var(--bd2)",fontSize:13}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div>
                <span style={{fontWeight:600}}>{nameFromEmail(d.qa_email)}</span>
                <span style={{color:"var(--tx3)",marginLeft:8}}>dismissed by <span style={{fontWeight:500,color:"var(--tx2)"}}>{nameFromEmail(d.dismissed_by)}</span></span>
              </div>
              <span style={{fontSize:11,color:"var(--tx3)",whiteSpace:"nowrap"}}>{d.created_at?new Date(d.created_at).toLocaleDateString("en-GB",{month:"short",day:"numeric"}):"—"}</span>
            </div>
            <div style={{marginTop:4,padding:"6px 10px",background:"var(--bg)",borderRadius:6,fontSize:12,color:"var(--tx2)"}}>{d.reason}</div>
          </div>
        ))}
      </div>;
    })()}

    {confirmEl}
  </>;
}

export default APDetectionAlerts;
