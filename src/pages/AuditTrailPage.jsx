import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { nameFromEmail } from "../lib/utils.js";
import SkeletonPage from "../components/Skeleton.jsx";
import { useApp } from "../lib/AppContext.jsx";

function AuditTrailPage() {
  const{token,profile}=useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
  };

  useEffect(() => {
    (async () => {
      try {
        // Load both activity_log and audit_trail, exclude super_admin actions
        const [activities, audits, profs] = await Promise.all([
          sb.query("activity_log", {select:"*",filters:"order=created_at.desc&limit=500",token}).catch(()=>[]),
          sb.query("audit_trail", {select:"*",filters:"order=created_at.desc&limit=500",token}).catch(()=>[]),
          sb.query("profiles", {select:"email,role",token}).catch(()=>[]),
        ]);
        // Build super_admin email set to exclude their actions
        const superAdminEmails = new Set(
          (Array.isArray(profs)?profs:[]).filter(p=>p.role==="super_admin").map(p=>p.email?.toLowerCase()).filter(Boolean)
        );
        // Merge and filter out super_admin actions
        const merged = [
          ...(Array.isArray(activities)?activities:[]).map(a=>({
            id:a.id, type:"activity", actor:a.actor_email, action:a.action, target:a.target_type, target_id:a.target_id, details:a.details, time:a.created_at
          })),
          ...(Array.isArray(audits)?audits:[]).map(a=>({
            id:a.id, type:"audit", actor:a.actor_email, action:a.action, target:a.table_name, target_id:a.record_id, details:JSON.stringify(a.new_data||a.old_data||"").slice(0,200), time:a.created_at
          })),
        ].filter(l=>!superAdminEmails.has(l.actor?.toLowerCase()))
         .sort((a,b)=>new Date(b.time)-new Date(a.time));
        setLogs(merged);
      } catch(e) { console.error("Audit load:", e); }
      setLoading(false);
    })();
  }, [token]);

  // Get unique actors and actions for filters
  const actors = [...new Set(logs.map(l=>l.actor).filter(Boolean))].sort();
  const actions = [...new Set(logs.map(l=>l.action).filter(Boolean))].sort();
  const logMonths = [...new Set(logs.map(l=>{const d=new Date(l.time);return d.toLocaleDateString("en-GB",{month:"short",year:"numeric"});}))];

  const filtered = logs.filter(l=>{
    if(filterAction && l.action !== filterAction) return false;
    if(filterActor && l.actor !== filterActor) return false;
    if(filterMonth) {
      const d=new Date(l.time);
      if(d.toLocaleDateString("en-GB",{month:"short",year:"numeric"})!==filterMonth) return false;
    }
    return true;
  });

  const actionColor = (action) => {
    if(action?.includes("delete")) return {bg:"var(--red-bg)",color:"var(--red)"};
    if(action?.includes("create") || action?.includes("insert")) return {bg:"var(--green-bg)",color:"var(--green)"};
    if(action?.includes("update") || action?.includes("patch")) return {bg:"var(--blue-bg)",color:"var(--blue)"};
    if(action?.includes("generate") || action?.includes("sync")) return {bg:"var(--accent-light)",color:"var(--accent-text)"};
    return {bg:"var(--bg3)",color:"var(--tx3)"};
  };

  if(loading) return <div className="page"><SkeletonPage/></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Audit Trail</div>
        <div className="page-subtitle">{filtered.length} actions logged (super admin actions excluded)</div>
      </div>

      {/* Filters */}
      <div className="card" style={{padding:"12px 16px",marginBottom:16}}>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
          <div className="form-group" style={{marginBottom:0,minWidth:140}}>
            <select className="select form-input" style={{fontSize:11,padding:"6px 10px"}} value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}>
              <option value="">All months</option>
              {logMonths.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0,minWidth:140}}>
            <select className="select form-input" style={{fontSize:11,padding:"6px 10px"}} value={filterAction} onChange={e=>setFilterAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0,minWidth:180}}>
            <select className="select form-input" style={{fontSize:11,padding:"6px 10px"}} value={filterActor} onChange={e=>setFilterActor(e.target.value)}>
              <option value="">All users</option>
              {actors.map(a=><option key={a} value={a}>{nameFromEmail(a)} ({a})</option>)}
            </select>
          </div>
          {(filterMonth||filterAction||filterActor)&&<button className="btn btn-outline btn-sm" style={{fontSize:10}} onClick={()=>{setFilterMonth("");setFilterAction("");setFilterActor("");}}>Clear filters</button>}
        </div>
      </div>

      {/* Log entries */}
      <div className="card">
        {filtered.length===0?<div style={{padding:40,textAlign:"center",color:"var(--tx3)",fontSize:13}}>No audit entries found</div>:
        <div className="table-wrap"><table>
          <thead><tr>
            <th style={{width:140}}>Time</th>
            <th style={{width:160}}>User</th>
            <th style={{width:120}}>Action</th>
            <th style={{width:100}}>Target</th>
            <th>Details</th>
          </tr></thead>
          <tbody>
            {filtered.slice(0,200).map(l=>{
              const ac=actionColor(l.action);
              return <tr key={l.id}>
                <td style={{fontSize:11,color:"var(--tx3)",whiteSpace:"nowrap"}}>{new Date(l.time).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</td>
                <td style={{fontSize:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:"var(--accent-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"var(--accent-text)",flexShrink:0}}>{nameFromEmail(l.actor).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                    <span style={{fontSize:12,fontWeight:500}}>{nameFromEmail(l.actor)}</span>
                  </div>
                </td>
                <td><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:600,background:ac.bg,color:ac.color}}>{l.action}</span></td>
                <td style={{fontSize:11,color:"var(--tx2)"}}>{l.target||"—"}</td>
                <td style={{fontSize:11,color:"var(--tx3)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.details||"—"}</td>
              </tr>;
            })}
          </tbody>
        </table></div>}
        {filtered.length>200&&<div style={{padding:12,textAlign:"center",color:"var(--tx3)",fontSize:11}}>Showing 200 of {filtered.length} entries</div>}
      </div>
    </div>
  );
}

export default AuditTrailPage;
