import React, { useState, useEffect } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity } from "../lib/utils.js";
import { useToast, useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { PulseLoader } from "../components/Charts.jsx";
import { useApp } from "../lib/AppContext.jsx";

function TeamManagementPage(){
  const{token,profile}=useApp();
  const[teams,setTeams]=useState([]);const[users,setUsers]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);const[showForm,setShowForm]=useState(false);
  const[form,setForm]=useState({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});const[editId,setEditId]=useState(null);const{show,el}=useToast();
  const{ask:confirmAsk,el:confirmEl}=useConfirm();
  const load=useCallback(async()=>{try{const[t,u,r]=await Promise.all([
    sb.query("teams",{select:"id,name,domain,lead_id,supervisor_id,profiles!fk_teams_lead(display_name,email),sup:profiles!fk_teams_supervisor(display_name,email)",token}),
    sb.query("profiles",{select:"id,display_name,email,role,domain",token}),
    sb.query("qa_roster",{select:"email,display_name,queue,manager_email",token}).catch(()=>[]),
  ]);setTeams(t);setUsers(u);setRoster(r);

  // Auto-create teams: one DB entry per queue+domain combination
  const existingKeys=new Set(t.map(x=>(x.name.toLowerCase()+"|"+x.domain.toLowerCase())));
  const rosterQueues=[...new Set(r.map(x=>x.queue).filter(Boolean))];
  let created=0;
  for(const q of rosterQueues){
    const hasAi=r.some(x=>x.queue===q&&x.email?.endsWith("@tabby.ai"));
    const hasSa=r.some(x=>x.queue===q&&x.email?.endsWith("@tabby.sa"));
    if(hasAi&&!existingKeys.has(q.toLowerCase()+"|tabby.ai")){
      try{await sb.query("teams",{token,method:"POST",body:{name:q,domain:"tabby.ai"}});created++;existingKeys.add(q.toLowerCase()+"|tabby.ai");}catch(e){console.log("Auto-create:",q,"ai",e);}
    }
    if(hasSa&&!existingKeys.has(q.toLowerCase()+"|tabby.sa")){
      try{await sb.query("teams",{token,method:"POST",body:{name:q,domain:"tabby.sa"}});created++;existingKeys.add(q.toLowerCase()+"|tabby.sa");}catch(e){console.log("Auto-create:",q,"sa",e);}
    }
  }
  if(created>0){
    const t2=await sb.query("teams",{select:"id,name,domain,lead_id,supervisor_id,profiles!fk_teams_lead(display_name,email),sup:profiles!fk_teams_supervisor(display_name,email)",token});
    setTeams(t2);
    show("success",`Auto-created ${created} team(s) from roster`);
  }
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);

  const nameFromEmail=(email)=>{if(!email)return"—";return email.split("@")[0].split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};
  const leads=users.filter(u=>hasRole(u.role,"qa_lead")),supervisors=users.filter(u=>hasRole(u.role,"qa_supervisor"));
  const getMemberCount=(teamName)=>roster.filter(r=>r.queue===teamName&&(!filterDomain||r.email?.endsWith("@"+filterDomain))).length;
  const getTeamMembers=(teamName)=>roster.filter(r=>r.queue===teamName&&(!filterDomain||r.email?.endsWith("@"+filterDomain)));

  const save=async()=>{try{const b={name:form.name,domain:form.domain,lead_id:form.lead_id||null,supervisor_id:form.supervisor_id||null};if(editId){await sb.query("teams",{token,method:"PATCH",body:b,filters:`id=eq.${editId}`});logActivity(token,profile?.email,"team_updated","teams",editId,`Name: ${form.name}`);show("success","Team updated");}else{await sb.query("teams",{token,method:"POST",body:b});logActivity(token,profile?.email,"team_created","teams",null,`Name: ${form.name}, Domain: ${form.domain}`);show("success","Team created");}setShowForm(false);setEditId(null);setForm({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});load();}catch(e){show("error",safeError(e));}};
  const startEdit=(t)=>{setForm({name:t.name,domain:t.domain,lead_id:t.lead_id||"",supervisor_id:t.supervisor_id||""});setEditId(t.id);setShowForm(true);};
  const del=(id)=>{const t=teams.find(x=>x.id===id);confirmAsk("Delete team?",`Delete "${t?.name||"this team"}"?`,async()=>{try{await sb.query("teams",{token,method:"DELETE",filters:`id=eq.${id}`});logActivity(token,profile?.email,"team_deleted","teams",id,`Name: ${t?.name||"?"}`);show("success","Deleted");load();}catch(e){show("error",safeError(e));}},"Delete","var(--red)");};

  const [expandedTeam, setExpandedTeam] = useState(null);
  const [filterDomain, setFilterDomain] = useState("");

  return(<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div className="page-title">Team management</div><div className="page-subtitle">{teams.length} teams · {roster.length} roster members</div></div><button className="btn btn-primary" onClick={()=>{setShowForm(!showForm);setEditId(null);setForm({name:"",domain:"tabby.ai",lead_id:"",supervisor_id:""});}}><Icon d={icons.plus} size={16}/>New team</button></div>

    {/* Domain filter */}
    <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
      <select className="select" value={filterDomain} onChange={e=>setFilterDomain(e.target.value)}>
        <option value="">All domains</option>
        <option value="tabby.ai">tabby.ai</option>
        <option value="tabby.sa">tabby.sa</option>
      </select>
      {filterDomain && <span style={{fontSize:12,color:"var(--tx3)"}}>Showing {filterDomain} teams only</span>}
    </div>
    {showForm&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">{editId?"Edit team":"Create team"}</span></div>
      <div className="form-grid"><div className="form-group"><label className="form-label">Team name</label><input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Payments QA"/></div>
      <div className="form-group"><label className="form-label">Domain</label><select className="select form-input" value={form.domain} onChange={e=>setForm({...form,domain:e.target.value})}><option value="tabby.ai">tabby.ai</option><option value="tabby.sa">tabby.sa</option></select></div>
      <div className="form-group"><label className="form-label">Lead</label><select className="select form-input" value={form.lead_id} onChange={e=>setForm({...form,lead_id:e.target.value})}><option value="">— Select —</option>{leads.map(u=><option key={u.id} value={u.id}>{u.email}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Supervisor</label><select className="select form-input" value={form.supervisor_id} onChange={e=>setForm({...form,supervisor_id:e.target.value})}><option value="">— Select —</option>{supervisors.map(u=><option key={u.id} value={u.id}>{u.email}</option>)}</select></div></div>
      <div style={{display:"flex",gap:8,marginTop:16}}><button className="btn btn-primary" onClick={save}><Icon d={icons.check} size={16}/>{editId?"Update":"Create"}</button><button className="btn btn-outline" onClick={()=>{setShowForm(false);setEditId(null);}}>Cancel</button></div>
    </div>}
    <div className="card">{loading?<PulseLoader/>:teams.length===0?<div className="placeholder" style={{padding:"40px"}}><p style={{color:"var(--tx3)"}}>No teams yet. Teams are auto-created from the roster.</p></div>:
      (()=>{
        // Build virtual teams: split each queue by email domain
        const virtualTeams=[];
        const queues=[...new Set(roster.map(r=>r.queue).filter(Boolean))].sort();
        queues.forEach(queue=>{
          const aiMembers=roster.filter(r=>r.queue===queue&&r.email?.endsWith("@tabby.ai"));
          const saMembers=roster.filter(r=>r.queue===queue&&r.email?.endsWith("@tabby.sa"));
          const dbTeamAi=teams.find(t=>t.name===queue&&t.domain==="tabby.ai");
          const dbTeamSa=teams.find(t=>t.name===queue&&t.domain==="tabby.sa");
          if(aiMembers.length>0&&(!filterDomain||filterDomain==="tabby.ai")){
            virtualTeams.push({key:queue+"-ai",name:queue,domain:"tabby.ai",members:aiMembers,dbTeam:dbTeamAi,count:aiMembers.length});
          }
          if(saMembers.length>0&&(!filterDomain||filterDomain==="tabby.sa")){
            virtualTeams.push({key:queue+"-sa",name:queue,domain:"tabby.sa",members:saMembers,dbTeam:dbTeamSa,count:saMembers.length});
          }
        });
        return <div className="table-wrap"><table><thead><tr><th>Team</th><th>Domain</th><th>Members</th><th>Lead</th><th>Supervisor</th><th></th></tr></thead><tbody>
          {virtualTeams.map(vt=>{
            const isExp=expandedTeam===vt.key;
            return(<React.Fragment key={vt.key}>
              <tr onClick={()=>setExpandedTeam(isExp?null:vt.key)} style={{cursor:"pointer"}}>
                <td style={{fontWeight:500}}>{vt.name}</td>
                <td><span className={`domain-badge domain-${vt.domain==="tabby.ai"?"ai":"sa"}`}>{vt.domain}</span></td>
                <td><span style={{fontSize:12,padding:"2px 8px",borderRadius:12,background:"var(--accent-light)",color:"var(--accent-text)",fontWeight:600}}>{vt.count}</span></td>
                <td style={{fontSize:13}}>{vt.dbTeam?.profiles?.display_name||<span style={{color:"var(--tx3)"}}>Not assigned</span>}</td>
                <td style={{fontSize:13}}>{vt.dbTeam?.sup?.display_name||<span style={{color:"var(--tx3)"}}>Not assigned</span>}</td>
                <td><div style={{display:"flex",gap:4}}>
                  {vt.dbTeam&&<button className="btn btn-outline btn-sm" onClick={(e)=>{e.stopPropagation();startEdit(vt.dbTeam);}}><Icon d={icons.edit} size={14}/></button>}
                  {vt.dbTeam&&<button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={(e)=>{e.stopPropagation();del(vt.dbTeam.id);}}><Icon d={icons.trash} size={14}/></button>}
                </div></td>
              </tr>
              {isExp&&vt.members.length>0&&<tr><td colSpan={6} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"12px 20px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Team members — {vt.domain} ({vt.members.length})</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:6}}>
                  {vt.members.sort((a,b)=>(a.display_name||a.email).localeCompare(b.display_name||b.email)).map(m=>(
                    <div key={m.email} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",background:"var(--bg3)",borderRadius:6,fontSize:12}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,flexShrink:0}}>{nameFromEmail(m.email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}</div>
                      <div style={{overflow:"hidden"}}><div style={{fontWeight:500,fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.display_name||nameFromEmail(m.email)}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{m.email}</div></div>
                    </div>
                  ))}
                </div>
                {vt.members.length>0&&<div style={{fontSize:11,color:"var(--tx3)",marginTop:8}}>Manager: {vt.members[0].manager_email?nameFromEmail(vt.members[0].manager_email):"—"}</div>}
              </div></td></tr>}
            </React.Fragment>);
          })}
        </tbody></table></div>;
      })()}</div>{el}
  </div>);
}
export default TeamManagementPage;
