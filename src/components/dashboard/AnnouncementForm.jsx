import React, { useState } from "react";
import { hasRole } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { logActivity } from "../../lib/utils.js";
import SearchableSelect from "../SearchableSelect.jsx";
import { useApp } from "../../lib/AppContext.jsx";

function AnnouncementForm({ roster, show, onClose }){
  const { profile, token } = useApp();
  const [annForm, setAnnForm] = useState({title:"",message:"",priority:"normal",target_type:"my_team",target_value:""});

  const nameFromEmail=(email)=>{if(!email)return"—";const local=email.split("@")[0];return local.split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};

  const sendAnnouncement=async()=>{
    if(!annForm.title.trim()||!annForm.message.trim()){show("error","Title and message are required");return;}
    if(annForm.target_type!=="all"&&annForm.target_type!=="my_team"&&!annForm.target_value){show("error","Please select a target");return;}
    try{
      const targetValue = annForm.target_type==="all"?null:annForm.target_type==="my_team"?profile?.email:annForm.target_value;
      const result = await sb.query("announcements",{token,method:"POST",body:{
        title:annForm.title,message:annForm.message,priority:annForm.priority,
        target_type:annForm.target_type,target_value:targetValue,
        sent_by:profile?.email,requires_ack:true,
      }});
      logActivity(token,profile?.email,"announcement_sent","announcements",null,`Title: ${annForm.title}, Target: ${annForm.target_type}${targetValue?" ("+targetValue+")":""}`);
      onClose();
      setAnnForm({title:"",message:"",priority:"normal",target_type:"my_team",target_value:""});
      show("success","Announcement sent successfully!");
    }catch(e){
      console.error("Announcement error:", e);
      show("error","Failed: " + (e.message || "Unknown error"));
    }
  };

  return <div className="card" style={{marginBottom:16,borderLeft:"4px solid var(--tabby-purple,#6A2C79)"}}>
    <div className="card-header"><span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>📢</span>Send Announcement</span></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <div className="form-group" style={{gridColumn:"1/-1"}}>
        <label className="form-label">Title *</label>
        <input className="form-input" value={annForm.title} onChange={e=>setAnnForm({...annForm,title:e.target.value})} placeholder="Announcement title..." autoFocus/>
      </div>
      <div className="form-group" style={{gridColumn:"1/-1"}}>
        <label className="form-label">Message *</label>
        <textarea className="form-input" rows={4} value={annForm.message} onChange={e=>setAnnForm({...annForm,message:e.target.value})} placeholder="Write your message here..." style={{resize:"vertical"}}/>
      </div>
      <div className="form-group">
        <label className="form-label">Priority</label>
        <SearchableSelect options={[{value:"normal",label:"ℹ️ Normal"},{value:"important",label:"⚠️ Important"},{value:"urgent",label:"🔴 Urgent"}]} value={annForm.priority} onChange={v=>setAnnForm({...annForm,priority:v})} placeholder="Normal"/>
      </div>
      <div className="form-group">
        <label className="form-label">Send to</label>
        <SearchableSelect options={[
          ...(hasRole(profile?.role,"qa_supervisor")?[{value:"all",label:"Everyone"},{value:"domain",label:"Specific domain"}]:[]),
          {value:"my_team",label:"My team"},
          {value:"team",label:"Specific team"},
          {value:"individual",label:"Individual person"},
        ]} value={annForm.target_type} onChange={v=>setAnnForm({...annForm,target_type:v,target_value:""})} placeholder="Select audience"/>
      </div>
      {annForm.target_type==="domain"&&<div className="form-group">
        <label className="form-label">Domain</label>
        <SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select domain"/>
      </div>}
      {annForm.target_type==="team"&&<div className="form-group">
        <label className="form-label">Team</label>
        <SearchableSelect options={[...new Set(roster.map(r=>r.queue).filter(Boolean))].sort()} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select team"/>
      </div>}
      {annForm.target_type==="individual"&&<div className="form-group">
        <label className="form-label">Person</label>
        <SearchableSelect options={roster.map(r=>({value:r.email,label:r.email+` (${nameFromEmail(r.email)})`}))} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select person"/>
      </div>}
    </div>
    <div style={{display:"flex",gap:8,marginTop:16}}>
      <button className="btn btn-primary" onClick={sendAnnouncement}>Send announcement</button>
      <button className="btn btn-outline" onClick={onClose}>Cancel</button>
    </div>
  </div>;
}

export default AnnouncementForm;
