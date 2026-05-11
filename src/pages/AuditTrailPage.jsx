import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { nameFromEmail } from "../lib/utils.js";
import { listProfiles } from "../api/profiles.js";
import SkeletonPage from "../components/Skeleton.jsx";
import { useApp } from "../lib/AppContext.jsx";

function AuditTrailPage() {
  const{token,profile}=useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  // Default OFF: show every action including super-admin. Toggle ON to
  // hide super-admin noise. Was previously hard-coded to "always hide",
  // which left ~90% of all log rows invisible to the only super_admin
  // (the person most likely to be looking at the audit trail).
  const [hideSuperAdmin, setHideSuperAdmin] = useState(false);
  const [superAdminEmails, setSuperAdminEmails] = useState(() => new Set());
  // Click-to-sort. Default: most recent action first.
  const [sort, setSort] = useState({ key: "time", dir: "desc" });
  const toggleSort = (key) => setSort(p => p.key === key ? { key, dir: p.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" });
  const sortArrow = (key) => sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  useEffect(() => {
    (async () => {
      try {
        // Load both activity_log and audit_trail, exclude super_admin actions
        const [activities, audits, profs] = await Promise.all([
          sb.query("activity_log", {select:"*",filters:"order=created_at.desc&limit=500",token}).catch(()=>[]),
          sb.query("audit_trail", {select:"*",filters:"order=created_at.desc&limit=500",token}).catch(()=>[]),
          listProfiles({ token, select: "email,role", filters: "", cache: false }),
        ]);
        // Build super_admin email set so the toggle can hide them on demand.
        const saSet = new Set(
          (Array.isArray(profs)?profs:[]).filter(p=>p.role==="super_admin").map(p=>p.email?.toLowerCase()).filter(Boolean)
        );
        setSuperAdminEmails(saSet);
        const merged = [
          ...(Array.isArray(activities)?activities:[]).map(a=>({
            id:`a-${a.id}`, type:"activity", actor:a.actor_email, action:a.action, target:a.target_type, target_id:a.target_id, details:a.details, time:a.created_at
          })),
          ...(Array.isArray(audits)?audits:[]).map(a=>({
            id:`t-${a.id}`, type:"audit", actor:a.actor_email, action:a.action, target:a.table_name, target_id:a.record_id, details:JSON.stringify(a.new_data||a.old_data||"").slice(0,200), time:a.created_at
          })),
        ].sort((a,b)=>new Date(b.time)-new Date(a.time));
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
    if(hideSuperAdmin && superAdminEmails.has(l.actor?.toLowerCase())) return false;
    if(filterAction && l.action !== filterAction) return false;
    if(filterActor && l.actor !== filterActor) return false;
    if(filterMonth) {
      const d=new Date(l.time);
      if(d.toLocaleDateString("en-GB",{month:"short",year:"numeric"})!==filterMonth) return false;
    }
    return true;
  });
  const hiddenSaCount = hideSuperAdmin
    ? logs.filter(l => superAdminEmails.has(l.actor?.toLowerCase())).length
    : 0;
  // Apply sort to filtered list before rendering.
  const sortVal = (l, key) => {
    if (key === "time")    return new Date(l.time).getTime();
    if (key === "user")    return (nameFromEmail(l.actor) || "").toLowerCase();
    if (key === "action")  return (l.action || "").toLowerCase();
    if (key === "target")  return (l.target || "").toLowerCase();
    if (key === "details") return (l.details || "").toLowerCase();
    return null;
  };
  const sortedFiltered = [...filtered].sort((a, b) => {
    const av = sortVal(a, sort.key);
    const bv = sortVal(b, sort.key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") {
      const c = av.localeCompare(bv);
      return sort.dir === "asc" ? c : -c;
    }
    return sort.dir === "asc" ? av - bv : bv - av;
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
        <div className="page-subtitle">{filtered.length} action{filtered.length === 1 ? "" : "s"} shown{hiddenSaCount ? ` · ${hiddenSaCount} super-admin entries hidden` : ""}</div>
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
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"var(--tx2)",cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={hideSuperAdmin} onChange={e=>setHideSuperAdmin(e.target.checked)} style={{cursor:"pointer"}} />
            Hide super admin actions
          </label>
          {(filterMonth||filterAction||filterActor||hideSuperAdmin)&&<button className="btn btn-outline btn-sm" style={{fontSize:10}} onClick={()=>{setFilterMonth("");setFilterAction("");setFilterActor("");setHideSuperAdmin(false);}}>Clear filters</button>}
        </div>
      </div>

      {/* Log entries */}
      <div className="card">
        {filtered.length===0?<div style={{padding:40,textAlign:"center",color:"var(--tx3)",fontSize:13}}>No audit entries found</div>:
        <div className="table-wrap"><table>
          <thead><tr>
            {[
              { k: "time",    label: "Time",    w: 140 },
              { k: "user",    label: "User",    w: 160 },
              { k: "action",  label: "Action",  w: 120 },
              { k: "target",  label: "Target",  w: 100 },
              { k: "details", label: "Details" },
            ].map(c => (
              <th key={c.k}
                  className={`sortable${sort.key === c.k ? " is-sorted" : ""}`}
                  onClick={() => toggleSort(c.k)}
                  title={`Sort by ${c.label}`}
                  style={{ width: c.w, whiteSpace: "nowrap" }}>
                {c.label}{sortArrow(c.k)}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sortedFiltered.slice(0,200).map(l=>{
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
        {sortedFiltered.length>200&&<div style={{padding:12,textAlign:"center",color:"var(--tx3)",fontSize:11}}>Showing 200 of {sortedFiltered.length} entries</div>}
      </div>
    </div>
  );
}

export default AuditTrailPage;
