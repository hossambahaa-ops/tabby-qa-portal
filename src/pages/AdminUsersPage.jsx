import React, { useState, useEffect, useCallback } from "react";
import { hasRole, ROLE_LABELS, ROLE_LEVEL } from "../lib/constants.js";
import { sb, SUPABASE_URL, dataCache } from "../lib/supabase.js";
import { safeError, logActivity } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { useConfirm } from "../lib/hooks.jsx";
import { SkeletonTable } from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";

function AdminUsersPage({teams}){
  const{token,profile,globalToast}=useApp();
  const[users,setUsers]=useState([]);
  const[roster,setRoster]=useState([]);
  const[loading,setLoading]=useState(true);
  const[editingId,setEditingId]=useState(null);
  const[editRole,setEditRole]=useState("");
  const[editOpDomain,setEditOpDomain]=useState("");
  const[editTeamIds,setEditTeamIds]=useState([]);
  const[userTeamsMap,setUserTeamsMap]=useState({});
  const[deletingId,setDeletingId]=useState(null);
  const[viewMode,setViewMode]=useState("list"); // "list" | "role"
  const[selected,setSelected]=useState(new Set());
  const[bulkRole,setBulkRole]=useState("");
  const[bulkTeam,setBulkTeam]=useState("");
  const[bulkSaving,setBulkSaving]=useState(false);
  const[collapsedRoles,setCollapsedRoles]=useState(new Set());
  const[search,setSearch]=useState("");
  const{ask:confirmAsk,el:confirmEl}=useConfirm();
  // Super-admin tier — includes hod (Imad) at the same numeric level
  const isSuperAdmin=hasRole(profile?.role,"super_admin");

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
        if(!resp.ok||data.error){globalToast("error",data.error||"Failed to delete user");setDeletingId(null);return;}
        setUsers(prev=>prev.filter(x=>x.id!==u.id));
        setSelected(prev=>{const n=new Set(prev);n.delete(u.id);return n;});
        globalToast("success",`${u.display_name||u.email} deleted`);
        logActivity(token,profile?.email,"user_deleted","profiles",u.id,`Deleted: ${u.email}`);
      }catch(e){globalToast("error",safeError(e));}
      setDeletingId(null);
    },"Delete","var(--red)");
  };

  const load=useCallback(async()=>{try{
    const[d,r,ut]=await Promise.all([
      listProfiles({ token, select: "id,email,display_name,role,domain,operational_domain,team_id,status", filters: "", cache: false }),
      listRoster({ token, select: "email,queue,manager_email", cache: false }),
      sb.query("user_teams",{select:"user_id,team_id",token}).catch(()=>[]),
    ]);
    setUsers(d.sort((a,b)=>ROLE_LEVEL[b.role]-ROLE_LEVEL[a.role]));
    setRoster(r);
    const map={};
    ut.forEach(x=>{if(!map[x.user_id])map[x.user_id]=[];map[x.user_id].push(x.team_id);});
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
    await sb.query("user_teams",{token,method:"DELETE",filters:`user_id=eq.${uid}`}).catch(()=>{});
    for(const tid of editTeamIds){
      await sb.query("user_teams",{token,method:"POST",body:{user_id:uid,team_id:tid}}).catch(()=>{});
    }
    logActivity(token, profile?.email, "user_updated", "profiles", uid, `${u?.email}: role=${editRole}, domain=${editOpDomain}, teams=${editTeamIds.length}`);
    dataCache.invalidate("profiles");dataCache.invalidate("profiles_slim");dataCache.invalidate("profiles_email_role");
    setUsers(prev=>prev.map(x=>x.id===uid?{...x,role:editRole,operational_domain:editOpDomain,team_id:editTeamIds[0]||null}:x));
    setEditingId(null);globalToast("success","Updated");
  }catch(e){globalToast("error",safeError(e));}};

  // Bulk role update
  const bulkUpdateRole=async()=>{
    if(!bulkRole||selected.size===0)return;
    const label=ROLE_LABELS[bulkRole]||bulkRole;
    confirmAsk("Bulk role update?",`Change ${selected.size} user${selected.size>1?"s":""} to "${label}"?`,async()=>{
      setBulkSaving(true);
      try{
        let count=0;
        for(const uid of selected){
          const u=users.find(x=>x.id===uid);
          if(!u||u.role===bulkRole)continue;
          await sb.query("profiles",{token,method:"PATCH",body:{role:bulkRole},filters:`id=eq.${uid}`});
          logActivity(token,profile?.email,"user_updated","profiles",uid,`${u.email}: bulk role → ${bulkRole}`);
          count++;
        }
        dataCache.invalidate("profiles");dataCache.invalidate("profiles_slim");dataCache.invalidate("profiles_email_role");
        setUsers(prev=>prev.map(u=>selected.has(u.id)?{...u,role:bulkRole}:u));
        globalToast("success",`Updated ${count} user${count>1?"s":""} to ${label}`);
        setSelected(new Set());setBulkRole("");
      }catch(e){globalToast("error",safeError(e));}
      setBulkSaving(false);
    },"Update","var(--tabby-purple)");
  };

  // Bulk team reassignment
  const bulkReassignTeam=async()=>{
    if(!bulkTeam||selected.size===0)return;
    const team=teams.find(t=>t.id===bulkTeam);
    confirmAsk("Bulk team move?",`Move ${selected.size} user${selected.size>1?"s":""} to "${team?.name||"team"}"? Existing team memberships will be replaced.`,async()=>{
      setBulkSaving(true);
      try{
        let count=0;
        for(const uid of selected){
          const u=users.find(x=>x.id===uid);
          if(!u)continue;
          // Update profiles.team_id (legacy) and user_teams junction
          await sb.query("profiles",{token,method:"PATCH",body:{team_id:bulkTeam},filters:`id=eq.${uid}`});
          await sb.query("user_teams",{token,method:"DELETE",filters:`user_id=eq.${uid}`}).catch(()=>{});
          await sb.query("user_teams",{token,method:"POST",body:{user_id:uid,team_id:bulkTeam}}).catch(()=>{});
          logActivity(token,profile?.email,"user_updated","profiles",uid,`${u.email}: bulk moved to team ${team?.name}`);
          count++;
        }
        dataCache.invalidate("profiles");dataCache.invalidate("profiles_slim");
        setUsers(prev=>prev.map(u=>selected.has(u.id)?{...u,team_id:bulkTeam}:u));
        setUserTeamsMap(prev=>{const n={...prev};[...selected].forEach(uid=>{n[uid]=[bulkTeam];});return n;});
        globalToast("success",`Moved ${count} user${count>1?"s":""} to ${team?.name}`);
        setSelected(new Set());setBulkTeam("");
      }catch(e){globalToast("error",safeError(e));}
      setBulkSaving(false);
    },"Move","var(--tabby-purple)");
  };

  // Toggle selection
  const toggleSelect=(id)=>setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleSelectAll=(list)=>{
    const allSelected=list.every(u=>selected.has(u.id));
    setSelected(prev=>{const n=new Set(prev);list.forEach(u=>{allSelected?n.delete(u.id):n.add(u.id);});return n;});
  };

  // Filter
  const filtered=search?users.filter(u=>(u.display_name||"").toLowerCase().includes(search.toLowerCase())||u.email?.toLowerCase().includes(search.toLowerCase())):users;

  // Group by role
  const roleGroups=Object.entries(ROLE_LABELS).map(([key,label])=>{
    const group=filtered.filter(u=>u.role===key);
    return {key,label,users:group};
  }).filter(g=>g.users.length>0).sort((a,b)=>(ROLE_LEVEL[b.key]||0)-(ROLE_LEVEL[a.key]||0));

  const toggleCollapse=(roleKey)=>setCollapsedRoles(prev=>{const n=new Set(prev);n.has(roleKey)?n.delete(roleKey):n.add(roleKey);return n;});

  // Render a user row
  const renderRow=(u)=>{
    const uTeams=getUserTeamNames(u);
    const isEditing=editingId===u.id;
    const isSelected=selected.has(u.id);
    return(
      <tr key={u.id} style={{background:isSelected?"var(--accent-light)":"transparent"}}>
        <td style={{width:32,padding:"8px 4px 8px 12px"}}>
          <input type="checkbox" checked={isSelected} onChange={()=>toggleSelect(u.id)} style={{cursor:"pointer",accentColor:"var(--tabby-purple)"}}/>
        </td>
        <td style={{fontWeight:500}}>{u.display_name||"—"}</td>
        <td style={{color:"var(--tx2)",fontSize:13}}>{u.email}</td>
        <td>{isEditing?<SearchableSelect options={Object.entries(ROLE_LABELS).map(([k,v])=>({value:k,label:v}))} value={editRole} onChange={setEditRole} placeholder="Select role"/>:<span className={`role-badge role-${u.role}`}>{ROLE_LABELS[u.role]}</span>}</td>
        <td><span className={`domain-badge domain-${u.domain==="tabby.ai"?"ai":"sa"}`}>{u.domain}</span></td>
        <td>{isEditing?<SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={editOpDomain} onChange={setEditOpDomain} placeholder="Domain"/>:<span className={`domain-badge domain-${getOpDomain(u)==="tabby.ai"?"ai":"sa"}`}>{getOpDomain(u)}</span>}</td>
        <td>{isEditing?<SearchableSelect options={teams.map(t=>({value:t.id,label:`${t.name} (${t.domain})`}))} value={editTeamIds} onChange={setEditTeamIds} placeholder="Select teams..." multi/>:uTeams.length>0?<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{uTeams.map((n,i)=><span key={i} className="team-tag">{n}</span>)}</div>:<span style={{fontSize:13,color:"var(--tx3)"}}>—</span>}</td>
        <td><span className={`status-badge status-${u.status}`}>{u.status}</span></td>
        <td>{isEditing?<div style={{display:"flex",gap:6}}><button className="btn btn-primary btn-sm" onClick={()=>save(u.id)}>Save</button><button className="btn btn-outline btn-sm" onClick={()=>setEditingId(null)}>Cancel</button></div>:<div style={{display:"flex",gap:6}}><button className="btn btn-outline btn-sm" onClick={()=>{setEditingId(u.id);setEditRole(u.role);setEditOpDomain(getOpDomain(u));setEditTeamIds(userTeamsMap[u.id]||[]);}}>Edit</button>{isSuperAdmin&&u.id!==profile?.id&&<button className="btn btn-sm" disabled={deletingId===u.id} onClick={()=>deleteUser(u)} style={{background:"var(--red-bg,#fef2f2)",color:"var(--red,#ef4444)",border:"1px solid var(--red,#ef4444)",fontSize:11,opacity:deletingId===u.id?.5:1}}>{deletingId===u.id?"...":"Delete"}</button>}</div>}</td>
      </tr>
    );
  };

  const tableHead=(list)=>(
    <thead><tr>
      <th style={{width:32,padding:"8px 4px 8px 12px"}}><input type="checkbox" checked={list.length>0&&list.every(u=>selected.has(u.id))} onChange={()=>toggleSelectAll(list)} style={{cursor:"pointer",accentColor:"var(--tabby-purple)"}}/></th>
      <th>Name</th><th>Email</th><th>Role</th><th>Email domain</th><th>Op. domain</th><th>Teams</th><th>Status</th><th></th>
    </tr></thead>
  );

  return(<div className="page">
    <div className="page-header">
      <div className="page-title">User management</div>
      <div className="page-subtitle">{users.length} users{selected.size>0?` · ${selected.size} selected`:""}</div>
    </div>

    {/* Toolbar */}
    <div className="card" style={{padding:"10px 16px",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        {/* Search */}
        <div style={{position:"relative",flex:"1 1 200px",maxWidth:300}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input className="form-input" placeholder="Search name or email..." value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:32,fontSize:12}}/>
        </div>

        {/* View toggle */}
        <div style={{display:"flex",gap:0,background:"var(--bg2)",padding:3,borderRadius:8}}>
          <button onClick={()=>setViewMode("list")} style={{padding:"4px 12px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,fontFamily:"var(--font)",cursor:"pointer",background:viewMode==="list"?"var(--bg3)":"transparent",color:viewMode==="list"?"var(--tabby-purple)":"var(--tx3)",boxShadow:viewMode==="list"?"var(--shadow)":"none"}}>List</button>
          <button onClick={()=>setViewMode("role")} style={{padding:"4px 12px",borderRadius:6,border:"none",fontSize:11,fontWeight:600,fontFamily:"var(--font)",cursor:"pointer",background:viewMode==="role"?"var(--bg3)":"transparent",color:viewMode==="role"?"var(--tabby-purple)":"var(--tx3)",boxShadow:viewMode==="role"?"var(--shadow)":"none"}}>By Role</button>
        </div>

        {/* Bulk actions */}
        {selected.size>0&&<>
          <div style={{height:20,width:1,background:"var(--bd)"}}/>
          <span style={{fontSize:12,fontWeight:600,color:"var(--accent-text)"}}>{selected.size} selected</span>
          <SearchableSelect options={Object.entries(ROLE_LABELS).map(([k,v])=>({value:k,label:v}))} value={bulkRole} onChange={setBulkRole} placeholder="New role..." />
          <button className="btn btn-primary btn-sm" disabled={!bulkRole||bulkSaving} onClick={bulkUpdateRole} style={{fontSize:11}}>{bulkSaving?"Saving...":"Update role"}</button>
          <div style={{height:20,width:1,background:"var(--bd)"}}/>
          <SearchableSelect options={teams.map(t=>({value:t.id,label:`${t.name} (${t.domain})`}))} value={bulkTeam} onChange={setBulkTeam} placeholder="Move to team..."/>
          <button className="btn btn-primary btn-sm" disabled={!bulkTeam||bulkSaving} onClick={bulkReassignTeam} style={{fontSize:11}}>Move to team</button>
          <button className="btn btn-outline btn-sm" onClick={()=>{setSelected(new Set());setBulkRole("");setBulkTeam("");}} style={{fontSize:11}}>Clear</button>
        </>}
      </div>
    </div>

    {/* Content */}
    {loading?<div className="card"><SkeletonTable/></div>:
      viewMode==="list"?(
        <div className="card"><div className="table-wrap"><table>
          {tableHead(filtered)}
          <tbody>{filtered.map(renderRow)}</tbody>
        </table></div></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {roleGroups.map(g=>{
            const collapsed=collapsedRoles.has(g.key);
            return(
              <div key={g.key} className="card" style={{overflow:"hidden"}}>
                <div onClick={()=>toggleCollapse(g.key)} style={{padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",background:"var(--bg2)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span className={`role-badge role-${g.key}`}>{g.label}</span>
                    <span style={{fontSize:12,color:"var(--tx3)",fontWeight:600}}>{g.users.length} user{g.users.length!==1?"s":""}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={e=>{e.stopPropagation();toggleSelectAll(g.users);}} className="btn btn-outline btn-sm" style={{fontSize:10,padding:"2px 8px"}}>
                      {g.users.every(u=>selected.has(u.id))?"Deselect all":"Select all"}
                    </button>
                    <span style={{fontSize:12,color:"var(--tx3)"}}>{collapsed?"▸":"▾"}</span>
                  </div>
                </div>
                {!collapsed&&<div className="table-wrap"><table>
                  {tableHead(g.users)}
                  <tbody>{g.users.map(renderRow)}</tbody>
                </table></div>}
              </div>
            );
          })}
        </div>
      )
    }
    {confirmEl}
  </div>);
}

export default AdminUsersPage;
