import React, { useState, useEffect, useCallback } from "react";
import { hasRole, ROLE_LABELS, ROLE_LEVEL } from "../lib/constants.js";
import { sb, SUPABASE_URL, dataCache } from "../lib/supabase.js";
import { safeError, logActivity } from "../lib/utils.js";
import { useToast, useConfirm } from "../lib/hooks.jsx";
import { PulseLoader } from "../components/Charts.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";

function AdminUsersPage({teams}){
  const{token,profile}=useApp();
  const[users,setUsers]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);const[editingId,setEditingId]=useState(null);const[editRole,setEditRole]=useState("");const[editOpDomain,setEditOpDomain]=useState("");const[editTeamIds,setEditTeamIds]=useState([]);const[userTeamsMap,setUserTeamsMap]=useState({});const[deletingId,setDeletingId]=useState(null);const{show,el}=useToast();
  const{ask:confirmAsk,el:confirmEl}=useConfirm();
  const isSuperAdmin=profile?.role==="super_admin";
  const deleteUser=async(u)=>{
    confirmAsk("Delete user?",`Permanently delete ${u.display_name||u.email}? This removes their profile, auth account, tokens, team memberships, sessions, and DAM flags. This cannot be undone.`,async()=>{
      setDeletingId(u.id);
      try{
        const resp=await fetch(`${SUPABASE_URL}/functions/v1/user-management`,{
          method:"POST",
          headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
          body:JSON.stringify({action:"delete_user",target_user_id:u.id,target_email:u.email}),
        });
        const data=await resp.json();
        if(!resp.ok||data.error){show("error",data.error||"Failed to delete user");setDeletingId(null);return;}
        setUsers(prev=>prev.filter(x=>x.id!==u.id));
        show("success",`${u.display_name||u.email} deleted`);
        logActivity(token,profile?.email,"user_deleted","profiles",u.id,`Deleted: ${u.email}`);
      }catch(e){show("error",safeError(e));}
      setDeletingId(null);
    },"Delete","var(--red)");
  };
  const load=useCallback(async()=>{try{
    const[d,r,ut]=await Promise.all([
      sb.query("profiles",{select:"id,email,display_name,role,domain,operational_domain,team_id,status",token}),
      sb.query("qa_roster",{select:"email,queue,manager_email",token}).catch(()=>[]),
      sb.query("user_teams",{select:"user_id,team_id",token}).catch(()=>[]),
    ]);
    setUsers(d.sort((a,b)=>ROLE_LEVEL[b.role]-ROLE_LEVEL[a.role]));
    setRoster(r);
    // Build map: user_id -> [team_id, ...]
    const map={};
    ut.forEach(x=>{if(!map[x.user_id])map[x.user_id]=[];map[x.user_id].push(x.team_id);});
    // Also include legacy team_id from profiles
    d.forEach(u=>{if(u.team_id){if(!map[u.id])map[u.id]=[];if(!map[u.id].includes(u.team_id))map[u.id].push(u.team_id);}});
    setUserTeamsMap(map);
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);
  const getUserTeamNames=(u)=>{
    const ids=userTeamsMap[u.id]||[];
    const teamNames=ids.map(tid=>{const t=teams.find(x=>x.id===tid);return t?t.name:null;}).filter(Boolean);
    const rosterTeams=roster.filter(r=>r.email?.toLowerCase()===u.email?.toLowerCase()).map(r=>r.queue).filter(Boolean);
    return [...new Set([...teamNames,...rosterTeams])];
  };
  const getOpDomain=(u)=>u.operational_domain||u.domain||"tabby.ai";
  const save=async(uid)=>{try{
    const u=users.find(x=>x.id===uid);
    await sb.query("profiles",{token,method:"PATCH",body:{role:editRole,operational_domain:editOpDomain,team_id:editTeamIds[0]||null},filters:`id=eq.${uid}`});
    // Sync user_teams junction table
    await sb.query("user_teams",{token,method:"DELETE",filters:`user_id=eq.${uid}`}).catch(()=>{});
    for(const tid of editTeamIds){
      await sb.query("user_teams",{token,method:"POST",body:{user_id:uid,team_id:tid}}).catch(()=>{});
    }
    logActivity(token, profile?.email, "user_updated", "profiles", uid, `${u?.email}: role=${editRole}, domain=${editOpDomain}, teams=${editTeamIds.length}`);
    dataCache.invalidate("profiles");dataCache.invalidate("profiles_slim");dataCache.invalidate("profiles_email_role");
    setUsers(prev=>prev.map(x=>x.id===uid?{...x,role:editRole,operational_domain:editOpDomain,team_id:editTeamIds[0]||null}:x));
    setEditingId(null);show("success","Updated");
  }catch(e){show("error",safeError(e));}};
  return(<div className="page">
    <div className="page-header"><div className="page-title">User management</div><div className="page-subtitle">{users.length} users</div></div>
    <div className="card">{loading?<PulseLoader/>:
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Email domain</th><th>Op. domain</th><th>Teams</th><th>Status</th><th></th></tr></thead><tbody>
        {users.map(u=>{const uTeams=getUserTeamNames(u);return(<tr key={u.id}><td style={{fontWeight:500}}>{u.display_name||"—"}</td><td style={{color:"var(--tx2)",fontSize:13}}>{u.email}</td>
        <td>{editingId===u.id?<SearchableSelect options={Object.entries(ROLE_LABELS).map(([k,v])=>({value:k,label:v}))} value={editRole} onChange={setEditRole} placeholder="Select role"/>:<span className={`role-badge role-${u.role}`}>{ROLE_LABELS[u.role]}</span>}</td>
        <td><span className={`domain-badge domain-${u.domain==="tabby.ai"?"ai":"sa"}`}>{u.domain}</span></td>
        <td>{editingId===u.id?<SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={editOpDomain} onChange={setEditOpDomain} placeholder="Domain"/>:<span className={`domain-badge domain-${getOpDomain(u)==="tabby.ai"?"ai":"sa"}`}>{getOpDomain(u)}</span>}</td>
        <td>{editingId===u.id?<SearchableSelect options={teams.map(t=>({value:t.id,label:`${t.name} (${t.domain})`}))} value={editTeamIds} onChange={setEditTeamIds} placeholder="Select teams..." multi/>:uTeams.length>0?<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{uTeams.map((n,i)=><span key={i} className="team-tag">{n}</span>)}</div>:<span style={{fontSize:13,color:"var(--tx3)"}}>—</span>}</td>
        <td><span className={`status-badge status-${u.status}`}>{u.status}</span></td>
        <td>{editingId===u.id?<div style={{display:"flex",gap:6}}><button className="btn btn-primary btn-sm" onClick={()=>save(u.id)}>Save</button><button className="btn btn-outline btn-sm" onClick={()=>setEditingId(null)}>Cancel</button></div>:<div style={{display:"flex",gap:6}}><button className="btn btn-outline btn-sm" onClick={()=>{setEditingId(u.id);setEditRole(u.role);setEditOpDomain(getOpDomain(u));setEditTeamIds(userTeamsMap[u.id]||[]);}}>Edit</button>{isSuperAdmin&&u.id!==profile?.id&&<button className="btn btn-sm" disabled={deletingId===u.id} onClick={()=>deleteUser(u)} style={{background:"var(--red-bg,#fef2f2)",color:"var(--red,#ef4444)",border:"1px solid var(--red,#ef4444)",fontSize:11,opacity:deletingId===u.id?.5:1}}>{deletingId===u.id?"...":"Delete"}</button>}</div>}</td></tr>);})}
      </tbody></table></div>}</div>{el}{confirmEl}
  </div>);
}

export default AdminUsersPage;
