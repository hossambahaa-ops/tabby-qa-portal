import React, { useState, useEffect, useRef } from "react";
import { hasRole } from "../lib/constants.js";
import { sb } from "../lib/supabase.js";
import { Icon } from "./Icons.jsx";
import { useApp } from "../lib/AppContext.jsx";

const safe=(v)=>{if(v==null)return"";if(typeof v==="object")return JSON.stringify(v);return String(v);};

function NotificationBell({ onNavigate }) {
  const{token,profile}=useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyMonth, setHistoryMonth] = useState("");
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("notif_dismissed") || "[]"); } catch { return []; }
  });
  const ref = useRef(null);
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSv = hasRole(profile?.role, "qa_supervisor");

  const dismiss = (id) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    localStorage.setItem("notif_dismissed", JSON.stringify(updated));
  };

  const dismissAll = () => {
    const allIds = items.map(i => i.id);
    setDismissed(prev => { const u = [...new Set([...prev, ...allIds])]; localStorage.setItem("notif_dismissed", JSON.stringify(u)); return u; });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const myEmail = profile?.email?.toLowerCase();
        const queries = [
          // Tasks assigned to ME
          sb.query("tasks", { select: "id,title,priority,created_by,eta_date,created_at", filters: `assigned_to=eq.${profile?.email}&status=neq.done&order=created_at.desc&limit=10`, token }).catch(() => []),
          // Escalations routed to ME
          sb.query("escalations", { select: "id,category,status,submitted_by,created_at", filters: `routed_to=eq.${profile?.email}&status=eq.open&order=created_at.desc&limit=10`, token }).catch(() => []),
          // Announcements (everyone gets these)
          sb.query("announcements", { select: "id,title,priority,sent_by,created_at", filters: "order=created_at.desc&limit=5", token }).catch(() => []),
          // Feedback responses to MY feedback (any role)
          sb.query("feedback", { select: "id,category,status,admin_response,created_at", filters: `user_email=eq.${profile?.email}&status=neq.new&order=created_at.desc&limit=5`, token }).catch(() => []),
        ];
        // QA Lead gets violations for THEIR team only, DAM flags, and their APs
        if (isLead && !isSv) {
          queries.push(sb.query("coaching_violations", { select: "id,violation_type,qa_emails,lead_email,created_at", filters: `lead_email=eq.${myEmail}&status=eq.pending&order=created_at.desc&limit=10`, token }).catch(() => []));
          queries.push(sb.query("dam_flags", { select: "id,qa_email,status,created_at,dam_rules(name)", filters: "status=eq.pending&order=created_at.desc&limit=10", token }).catch(() => []));
          queries.push(sb.query("action_plans", { select: "id,qa_email,type,status,end_date,tl_email,created_at", filters: `tl_email=eq.${myEmail}&status=eq.active&order=created_at.desc&limit=10`, token }).catch(() => []));
        }
        // Supervisors see their domain's violations + DAM flags
        if (isSv) {
          queries.push(sb.query("coaching_violations", { select: "id,violation_type,qa_emails,lead_email,created_at", filters: "status=eq.pending&order=created_at.desc&limit=10", token }).catch(() => []));
          queries.push(sb.query("dam_flags", { select: "id,qa_email,status,created_at,dam_rules(name)", filters: "status=eq.pending&order=created_at.desc&limit=10", token }).catch(() => []));
          queries.push(sb.query("action_plans", { select: "id,qa_email,type,status,end_date,tl_email,created_at", filters: "status=eq.active&order=created_at.desc&limit=10", token }).catch(() => []));
        }
        const results = await Promise.all(queries);
        const [assignedTasks, escalations, announcements, myFeedback] = results;
        const violations = (isLead || isSv) ? (results[4] || []) : [];
        const damFlags = (isLead || isSv) ? (results[5] || []) : [];
        const activePlans = (isLead || isSv) ? (results[6] || []) : [];

        const all = [
          ...assignedTasks.map(t => ({ id: "t-"+t.id, type: "task", title: `Task: ${t.title}`, sub: `From: ${t.created_by?.split("@")[0]}${t.eta_date?" · ETA: "+new Date(t.eta_date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"}):""}`, time: t.created_at, page: "dashboard" })),
          ...escalations.map(e => ({ id: "e-"+e.id, type: "escalation", title: `Escalation: ${e.category}`, sub: "Anonymous submission", time: e.created_at, page: "escalations" })),
          ...myFeedback.filter(f => f.admin_response).map(f => ({ id: "fb-"+f.id, type: "feedback", title: `Feedback response: ${f.category}`, sub: `Status: ${f.status}`, time: f.created_at, page: "dashboard" })),
          ...violations.map(v => ({ id: "v-"+v.id, type: "violation", title: `Violation: ${v.violation_type}`, sub: v.qa_emails?.split("\n")[0], time: v.created_at, page: "violations" })),
          ...damFlags.map(f => ({ id: "d-"+f.id, type: "dam", title: `DAM: ${f.dam_rules?.name || "Flag"}`, sub: f.qa_email || "—", time: f.created_at, page: "dam" })),
          ...activePlans.filter(p => {
            if (!p.end_date) return false;
            const daysLeft = (new Date(p.end_date) - new Date()) / (1000*60*60*24);
            return daysLeft <= 7 && daysLeft > -1;
          }).map(p => ({ id: "ap-"+p.id, type: "plan", title: `${p.type.toUpperCase()} ending soon`, sub: `${p.qa_email?.split("@")[0]} — ${Math.ceil((new Date(p.end_date)-new Date())/(1000*60*60*24))} days left`, time: p.created_at, page: "plans" })),
        ];
        // Daily task reminders — check auto-close tasks vs daily_scores
        try {
          const todayStr = new Date().toISOString().split("T")[0];
          const [dailyDs, allTodayTasks] = await Promise.all([
            sb.query("daily_scores", {select:"*",filters:`date=eq.${todayStr}`,token}).catch(()=>[]),
            sb.query("tasks", {select:"id,title,assigned_to,target_metric,target_value,auto_close,status,due_date",filters:`due_date=eq.${todayStr}&auto_close=eq.true&status=eq.pending`,token}).catch(()=>[]),
          ]);
          const myAutoTasks = allTodayTasks.filter(t => t.assigned_to?.toLowerCase() === myEmail);
          for (const task of myAutoTasks) {
            const local = myEmail.split("@")[0];
            const ds = dailyDs.find(d => {
              const em = d.qa_email?.toLowerCase();
              return em === myEmail || em?.split("@")[0] === local;
            });
            const actual = ds ? (parseFloat(ds[task.target_metric]) || 0) : 0;
            const target = parseFloat(task.target_value) || 0;
            const remaining = Math.max(0, target - actual);
            if (remaining > 0) {
              const metricLabel = (task.target_metric||"").replace(/_/g, " ");
              all.push({
                id: "dr-"+task.id,
                type: "reminder",
                title: `⏰ ${remaining} more ${metricLabel} needed`,
                sub: `${actual}/${target} done · ${task.title}`,
                time: new Date().toISOString(),
                page: "dashboard"
              });
            }
          }
        } catch(e) { console.error("Daily reminders:", e); }
        all.sort((a, b) => new Date(b.time) - new Date(a.time));
        setItems(all);
      } catch {}
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [token, profile?.email]);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const visible = items.filter(i => !dismissed.includes(i.id));
  const count = visible.length;
  const typeColor = { violation: { bg: "var(--red-bg)", color: "var(--red)" }, dam: { bg: "var(--amber-bg)", color: "var(--amber)" }, escalation: { bg: "#EDE9FE", color: "#7C3AED" }, task: { bg: "var(--primary-light)", color: "var(--tabby-purple,#6A2C79)" }, plan: { bg: "var(--amber-bg)", color: "var(--amber)" }, feedback: { bg: "var(--green-bg)", color: "var(--green)" }, reminder: { bg: "var(--amber-bg)", color: "var(--amber)" } };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="notif-btn" onClick={() => setOpen(!open)}>
        <Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" size={20} />
        {count > 0 && <span className="notif-badge">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && <div className="notif-dropdown">
        <div className="notif-header">
          <span>Notifications</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{ fontSize: 11, color: "var(--tx3)" }}>{count} new</span>
            {count > 0 && <button onClick={dismissAll} style={{fontSize:10,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>Clear all</button>}
          </div>
        </div>
        {/* Pending notifications */}
        {visible.length === 0 && dismissed.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>No notifications yet</div> :
          <>
            {visible.length === 0 && <div style={{ padding: 12, textAlign: "center", color: "var(--tx3)", fontSize: 12 }}>All caught up!</div>}
            {visible.slice(0, 5).map(item => {
              const tc = typeColor[item.type] || {};
              return <div key={item.id} className="notif-item" style={{display:"flex",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1,cursor:"pointer"}} onClick={() => { onNavigate(item.page); setOpen(false); dismiss(item.id); }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="search-result-type" style={{ background: tc.bg, color: tc.color }}>{item.type}</span>
                    <span style={{ fontWeight: 500, fontSize: 12 }}>{safe(item.title)}</span>
                  </div>
                  <div style={{ color: "var(--tx3)", fontSize: 11, marginTop: 2 }}>{safe(item.sub)} · {new Date(item.time).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); dismiss(item.id); }} title="Dismiss" style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:14,padding:"2px",lineHeight:1,flexShrink:0,marginTop:2}}>×</button>
              </div>;
            })}
            {visible.length > 5 && <div style={{padding:"8px 16px",textAlign:"center"}}><span style={{fontSize:11,color:"var(--accent-text)",cursor:"pointer",fontWeight:600}} onClick={()=>{}}>+{visible.length-5} more</span></div>}
          </>
        }
        {/* Recent history + View All */}
        {(()=>{
          const allHistory = items.filter(i => dismissed.includes(i.id));
          const recentHistory = allHistory.slice(0, 5);
          if (recentHistory.length === 0 && !showAllHistory) return null;
          return <div style={{borderTop:"1px solid var(--bd)",paddingTop:8}}>
            <div style={{padding:"4px 16px 4px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>History</span>
              <button onClick={()=>setShowAllHistory(!showAllHistory)} style={{fontSize:10,color:"var(--accent-text)",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>{showAllHistory?"Show less":"View all"}</button>
            </div>
            {!showAllHistory && recentHistory.map(item => {
              const tc = typeColor[item.type] || {};
              return <div key={item.id} className="notif-item" style={{display:"flex",alignItems:"flex-start",gap:8,opacity:0.5}}>
                <div style={{flex:1,cursor:"pointer"}} onClick={() => { onNavigate(item.page); setOpen(false); }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="search-result-type" style={{ background: tc.bg, color: tc.color }}>{item.type}</span>
                    <span style={{ fontWeight: 500, fontSize: 12 }}>{safe(item.title)}</span>
                  </div>
                  <div style={{ color: "var(--tx3)", fontSize: 11, marginTop: 2 }}>{safe(item.sub)} · {new Date(item.time).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}</div>
                </div>
              </div>;
            })}
            {showAllHistory && <div>
              <div style={{padding:"4px 16px 8px"}}>
                <select className="select form-input" style={{fontSize:11,padding:"4px 8px",width:"auto"}} value={historyMonth} onChange={e=>setHistoryMonth(e.target.value)}>
                  <option value="">All months</option>
                  {[...new Set(allHistory.map(i=>{const d=new Date(i.time);return d.toLocaleDateString("en-GB",{month:"short",year:"numeric"});}))].map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{maxHeight:300,overflowY:"auto"}}>
                {allHistory.filter(i=>{if(!historyMonth)return true;const d=new Date(i.time);return d.toLocaleDateString("en-GB",{month:"short",year:"numeric"})===historyMonth;}).map(item => {
                  const tc = typeColor[item.type] || {};
                  return <div key={item.id} className="notif-item" style={{display:"flex",alignItems:"flex-start",gap:8,opacity:0.6}}>
                    <div style={{flex:1,cursor:"pointer"}} onClick={() => { onNavigate(item.page); setOpen(false); }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="search-result-type" style={{ background: tc.bg, color: tc.color }}>{item.type}</span>
                        <span style={{ fontWeight: 500, fontSize: 12 }}>{safe(item.title)}</span>
                      </div>
                      <div style={{ color: "var(--tx3)", fontSize: 11, marginTop: 2 }}>{safe(item.sub)} · {new Date(item.time).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}</div>
                    </div>
                  </div>;
                })}
                {allHistory.filter(i=>{if(!historyMonth)return true;const d=new Date(i.time);return d.toLocaleDateString("en-GB",{month:"short",year:"numeric"})===historyMonth;}).length===0&&<div style={{padding:12,textAlign:"center",color:"var(--tx3)",fontSize:11}}>No notifications in this period</div>}
              </div>
            </div>}
          </div>;
        })()}
      </div>}
    </div>
  );
}

export default NotificationBell;
