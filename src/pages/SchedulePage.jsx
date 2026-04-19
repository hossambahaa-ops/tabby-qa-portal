import React, { useState, useEffect, useRef, useCallback } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError } from "../lib/utils.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";

const ATTENDANCE_TYPES = [
  {code:"P",label:"Present",color:"#22C55E",bg:"#22C55E20"},
  {code:"H",label:"Work from Home",color:"#3B82F6",bg:"#3B82F620"},
  {code:"L",label:"Late Arrival",color:"#F97316",bg:"#F9731620"},
  {code:"PH",label:"Public Holiday",color:"#8B5CF6",bg:"#8B5CF620"},
  {code:"EL",label:"Early Leave",color:"#EAB308",bg:"#EAB30820"},
  {code:"AL",label:"Annual Leave",color:"#EF4444",bg:"#EF444420"},
  {code:"Paid SL",label:"Sick Leave",color:"#B91C1C",bg:"#B91C1C20"},
  {code:"ML",label:"Maternity Leave",color:"#EC4899",bg:"#EC489920"},
  {code:"UL",label:"Unpaid Leave",color:"#6B7280",bg:"#6B728020"},
  {code:"NSNC",label:"No Show No Call",color:"#111827",bg:"#11182720"},
  {code:"OFF",label:"Weekend / Holiday",color:"#9CA3AF",bg:"#9CA3AF15"},
  {code:"X",label:"Not Employed",color:"#6B7280",bg:"#6B728010"},
];
const ATT_MAP = {};
ATTENDANCE_TYPES.forEach(t => { ATT_MAP[t.code] = t; });

function SchedulePage() {
  const{token,profile,gf,globalToast}=useApp();
  const [attendance, setAttendance] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selMonth, setSelMonth] = useUrlState("month", (()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;})());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("OFF");
  const [csvUpload, setCsvUpload] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkScope, setBulkScope] = useState("my_team");
  const [bulkPerson, setBulkPerson] = useState("");
  const [bulkDayFilter, setBulkDayFilter] = useState("all");
  const [selectedQAs, setSelectedQAs] = useState(new Set());
  const [editCell, setEditCell] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const {ask: confirmAsk, el: confirmEl} = useConfirm();

  const myEmail = profile?.email?.toLowerCase() || "";
  const isQA = profile?.role === "qa" || profile?.role === "senior_qa";
  const isLead = hasRole(profile?.role, "qa_lead");

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
  };

  const loadData = useCallback(async () => {
    try {
      const [yr, mo] = selMonth.split("-").map(Number);
      const dim = new Date(yr, mo, 0).getDate();
      // Fetch attendance in 3 chunks to bypass 1000 row limit
      const chunk1End = Math.min(10, dim);
      const chunk2End = Math.min(20, dim);
      const chunk3End = dim;
      const fmtD = (d) => `${selMonth}-${String(d).padStart(2,"0")}`;
      const hdrs = {"apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`};
      const base = `${SUPABASE_URL}/rest/v1/qa_attendance?select=id,email,date,status`;
      const [r, a1, a2, a3] = await Promise.all([
        dataCache.fetch("qa_roster",()=>sb.query("qa_roster", {select:"email,display_name,manager_email,queue,country",token}).catch(()=>[])),
        fetch(`${base}&date=gte.${fmtD(1)}&date=lte.${fmtD(chunk1End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]),
        chunk1End < dim ? fetch(`${base}&date=gte.${fmtD(chunk1End+1)}&date=lte.${fmtD(chunk2End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]) : Promise.resolve([]),
        chunk2End < dim ? fetch(`${base}&date=gte.${fmtD(chunk2End+1)}&date=lte.${fmtD(chunk3End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]) : Promise.resolve([]),
      ]);
      setRoster(Array.isArray(r) ? r : []);
      const allAtt = [...(Array.isArray(a1)?a1:[]), ...(Array.isArray(a2)?a2:[]), ...(Array.isArray(a3)?a3:[])];
      setAttendance(allAtt);
    } catch(e) { console.error("Schedule load:", e); }
    setLoading(false);
  }, [token, selMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // Undo/Redo keyboard handler
  const tokenRef = useRef(token);
  const myEmailRef = useRef(myEmail);
  const loadDataRef = useRef(loadData);
  useEffect(() => { tokenRef.current = token; myEmailRef.current = myEmail; loadDataRef.current = loadData; });
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        setUndoStack(prev => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          const rest = prev.slice(0, -1);
          (async () => {
            try {
              if (last.oldStatus) {
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(last.email)}&date=eq.${last.date}`, {
                  method: "PATCH", headers: {"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`},
                  body: JSON.stringify({status: last.oldStatus, updated_at: new Date().toISOString()})
                });
              } else {
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(last.email)}&date=eq.${last.date}`, {
                  method: "DELETE", headers: {"apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`}
                });
              }
              setRedoStack(p => [...p, last]);
              loadDataRef.current();
            } catch (err) { console.error("Undo failed", err); }
          })();
          return rest;
        });
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        setRedoStack(prev => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          const rest = prev.slice(0, -1);
          (async () => {
            try {
              await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
                method: "POST", headers: {"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`, "Prefer": "resolution=merge-duplicates,return=minimal"},
                body: JSON.stringify({email: last.email, date: last.date, status: last.newStatus, created_by: myEmailRef.current})
              });
              setUndoStack(p => [...p, last]);
              loadDataRef.current();
            } catch (err) { console.error("Redo failed", err); }
          })();
          return rest;
        });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Get QA lead emails for filtering
  const [profiles, setProfiles] = useState([]);
  useEffect(() => {
    sb.query("profiles", {select:"email,role",token}).then(p => setProfiles(Array.isArray(p)?p:[])).catch(()=>{});
  }, [token]);
  const qaLeadSet = new Set(profiles.filter(p=>p.role==="qa_lead").map(p=>p.email?.toLowerCase()));

  // Visible QAs — scoped by role
  const visibleQAs = (() => {
    const allQAs = roster.filter(r => {
      const mgr = r.manager_email?.toLowerCase();
      return mgr && (qaLeadSet.has(mgr) || qaLeadSet.has(mgr?.split("@")[0]));
    });
    if (isQA) return allQAs.filter(r => r.email?.toLowerCase() === myEmail);
    if (isLead && !hasRole(profile?.role, "qa_supervisor")) {
      return allQAs.filter(r => r.manager_email?.toLowerCase() === myEmail);
    }
    return allQAs;
  })();

  // Days in selected month
  const [year, month] = selMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({length: daysInMonth}, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    return { num: i + 1, date: d, dayName: d.toLocaleDateString("en-US", {weekday: "short"}), isWeekend: d.getDay() === 5 || d.getDay() === 6 };
  });

  // Get attendance for a QA on a specific date
  const getAtt = (email, dayNum) => {
    const dateStr = `${selMonth}-${String(dayNum).padStart(2,"0")}`;
    return attendance.find(a => a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr);
  };

  // Set attendance for a single cell
  const setAtt = async (email, dayNum, status) => {
    const dateStr = `${selMonth}-${String(dayNum).padStart(2,"0")}`;
    try {
      const existing = getAtt(email, dayNum);
      const oldStatus = existing?.status || null;
      if (existing) {
        if (status === existing.status) { setEditCell(null); return; }
        await sb.query("qa_attendance", {token, method:"PATCH", body:{status, updated_at:new Date().toISOString()}, filters:`id=eq.${existing.id}`});
      } else {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
          method:"POST", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`,"Prefer":"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify({email:email.toLowerCase(), date:dateStr, status, created_by:myEmail})
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
      // Push to undo stack
      setUndoStack(prev => [...prev.slice(-50), {email: email.toLowerCase(), date: dateStr, oldStatus, newStatus: status}]);
      setRedoStack([]);
      setAttendance(prev => {
        const filtered = prev.filter(a => !(a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr));
        return [...filtered, {email:email.toLowerCase(), date:dateStr, status, id:existing?.id||"new-"+Date.now(), created_by:myEmail}];
      });
      setEditCell(null);
    } catch(e) { globalToast("error", safeError(e)); }
  };

  // Bulk set
  const applyBulk = async () => {
    if (!bulkFrom || !bulkTo) { globalToast("error", "Select date range"); return; }
    let targets = [];
    if (bulkScope === "my_team") targets = visibleQAs.map(r => r.email?.toLowerCase());
    else if (bulkScope === "specific" && bulkPerson) targets = [bulkPerson.toLowerCase()];
    else if (bulkScope === "selected") targets = [...selectedQAs];
    else targets = visibleQAs.map(r => r.email?.toLowerCase());
    if (targets.length === 0) { globalToast("error", "No QAs selected"); return; }

    const start = new Date(bulkFrom + "T00:00:00");
    const end = new Date(bulkTo + "T00:00:00");
    const rows = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // 0=Sun,5=Fri,6=Sat
      if (bulkDayFilter === "weekdays" && (dow === 5 || dow === 6)) continue;
      if (bulkDayFilter === "weekends" && dow !== 5 && dow !== 6) continue;
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      for (const em of targets) {
        rows.push({email: em, date: dateStr, status: bulkStatus, created_by: myEmail});
      }
    }
    if (rows.length === 0) { globalToast("error", "No matching days in range"); return; }
    try {
      const batchSize = 200;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
          method:"POST", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`,"Prefer":"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify(batch)
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
      globalToast("success", `Set ${bulkStatus} for ${targets.length} QA${targets.length>1?"s":""} × ${Math.round(rows.length/targets.length)} days`);
      setBulkModal(false);
      loadData();
    } catch(e) { globalToast("error", safeError(e)); }
  };

  // Counters per QA
  // CSV template download
  const downloadCsvTemplate = () => {
    const [y, mo] = selMonth.split("-").map(Number);
    const daysCount = new Date(y, mo, 0).getDate();
    const headers = ["email"];
    for (let d = 1; d <= daysCount; d++) {
      const dt = new Date(y, mo - 1, d);
      headers.push(`${dt.toLocaleDateString("en-US",{weekday:"short"})}_${d}`);
    }
    const rows = visibleQAs.sort((a,b)=>(a.email||"").localeCompare(b.email||"")).map(qa => {
      const em = qa.email?.toLowerCase();
      const cols = [em];
      for (let d = 1; d <= daysCount; d++) {
        const att = getAtt(em, d);
        const dt = new Date(y, mo - 1, d);
        const isWknd = dt.getDay() === 5 || dt.getDay() === 6;
        cols.push(att?.status || (isWknd ? "OFF" : ""));
      }
      return cols.join(",");
    });
    const csv = headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${selMonth}.csv`;
    a.click();
  };

  // CSV upload parse
  const parseCsvUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { globalToast("error", "CSV has no data rows"); return; }
      const headers = lines[0].split(",");
      const dayHeaders = headers.slice(1); // "Mon_1", "Tue_2", etc.
      const dayNums = dayHeaders.map(h => parseInt(h.split("_").pop()));
      const preview = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const email = cols[0]?.trim().toLowerCase();
        if (!email || !email.includes("@")) continue;
        const entries = [];
        for (let j = 0; j < dayNums.length; j++) {
          const val = cols[j + 1]?.trim().toUpperCase();
          if (val && ATTENDANCE_TYPES.some(t => t.code === val)) {
            entries.push({ day: dayNums[j], status: val });
          }
        }
        if (entries.length > 0) preview.push({ email, entries });
      }
      setCsvPreview(preview);
    };
    reader.readAsText(file);
  };

  // CSV upload execute
  const executeCsvUpload = async () => {
    setCsvUploading(true);
    try {
      const rows = [];
      csvPreview.forEach(p => {
        p.entries.forEach(e => {
          const dateStr = `${selMonth}-${String(e.day).padStart(2,"0")}`;
          rows.push({ email: p.email, date: dateStr, status: e.status, created_by: myEmail });
        });
      });
      // Batch upsert
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${token}`, "Prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(batch)
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
      globalToast("success", `Uploaded ${rows.length} attendance records for ${csvPreview.length} QAs`);
      setCsvUpload(false); setCsvFile(null); setCsvPreview([]);
      loadData();
    } catch (e) { globalToast("error", safeError(e)); }
    setCsvUploading(false);
  };

  const countByStatus = (email) => {
    const qa = attendance.filter(a => a.email?.toLowerCase() === email?.toLowerCase());
    const counts = {};
    qa.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
    return counts;
  };

  if (loading) return <div className="page"><SkeletonPage/></div>;

  return (
    <div className="page">
      {confirmEl}
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Schedule & Attendance</div>
          <div className="page-subtitle">{visibleQAs.length} team members — {new Date(year, month-1).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="month" className="form-input" style={{width:160,fontSize:12}} value={selMonth} onChange={e=>setSelMonth(e.target.value)}/>
          <div style={{display:"flex",gap:2}}>
            <button className="btn btn-outline btn-sm" style={{padding:"6px 8px",opacity:undoStack.length>0?1:0.3}} disabled={undoStack.length===0} onClick={()=>{const e=new KeyboardEvent("keydown",{key:"z",ctrlKey:true});document.dispatchEvent(e);}} title="Undo (Ctrl+Z)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 10h10a5 5 0 015 5v2"/><path d="M3 10l4-4M3 10l4 4"/></svg>
            </button>
            <button className="btn btn-outline btn-sm" style={{padding:"6px 8px",opacity:redoStack.length>0?1:0.3}} disabled={redoStack.length===0} onClick={()=>{const e=new KeyboardEvent("keydown",{key:"y",ctrlKey:true});document.dispatchEvent(e);}} title="Redo (Ctrl+Y)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10H11a5 5 0 00-5 5v2"/><path d="M21 10l-4-4M21 10l-4 4"/></svg>
            </button>
          </div>
          {isLead&&<button className="btn btn-primary btn-sm" onClick={()=>{setBulkModal(true);setBulkFrom(`${selMonth}-01`);setBulkTo(`${selMonth}-${String(daysInMonth).padStart(2,"0")}`);setBulkStatus("P");setBulkDayFilter("all");}}>
            <Icon d={icons.plus} size={14}/>Bulk set
          </button>}
          {isLead&&<button className="btn btn-outline btn-sm" onClick={downloadCsvTemplate} style={{fontSize:11}}>
            <Icon d={icons.upload} size={13}/>Download CSV
          </button>}
          {isLead&&<button className="btn btn-outline btn-sm" onClick={()=>setCsvUpload(true)} style={{fontSize:11}}>
            <Icon d={icons.upload} size={13}/>Upload CSV
          </button>}
          {profile?.role==="super_admin"&&<button className="btn btn-outline btn-sm" style={{fontSize:11,color:"var(--red)",borderColor:"var(--red)"}} onClick={()=>{
            const monthLabel=new Date(year,month-1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
            confirmAsk("Delete all attendance?",`Delete ALL attendance data for ${monthLabel}? This cannot be undone.`,async()=>{
              try{
                const startDate=`${selMonth}-01`;const endDate=`${year}-${String(month+1>12?1:month+1).padStart(2,"0")}-01`;
                const resp=await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?date=gte.${startDate}&date=lt.${endDate}`,{
                  method:"DELETE",headers:{"apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`}
                });
                if(!resp.ok)throw new Error(await resp.text());
                globalToast("success","All attendance data deleted for this month");
                loadData();
              }catch(e){globalToast("error",safeError(e));}
            },"Delete all","var(--red)");
          }}>
            <Icon d={icons.trash} size={13}/>Delete month
          </button>}
        </div>
      </div>

      {/* Legend */}
      <div className="card" style={{padding:"10px 16px",marginBottom:16}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:"var(--tx3)",fontWeight:600}}>Legend:</span>
          {ATTENDANCE_TYPES.map(t => (
            <span key={t.code} style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:t.bg,color:t.color,fontWeight:700,border:`1px solid ${t.color}30`}}>{t.code}</span>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      {isLead&&selectedQAs.size>0&&<div className="card" style={{padding:"10px 16px",marginBottom:12,background:"var(--accent-light)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:600,color:"var(--accent-text)"}}>{selectedQAs.size} QAs selected</span>
        <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={()=>{setBulkScope("selected");setBulkModal(true);}}>Bulk mark attendance</button>
        <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setSelectedQAs(new Set())}>Clear</button>
      </div>}
      <div className="card" style={{overflow:"auto"}}>
        <table style={{fontSize:11,whiteSpace:"nowrap",minWidth:800}}>
          <thead>
            <tr>
              {isLead&&<th style={{position:"sticky",left:0,background:"var(--bg3)",zIndex:3,width:28,padding:"4px 6px"}}>
                <input type="checkbox" style={{cursor:"pointer",accentColor:"var(--tabby-purple)"}} checked={visibleQAs.length>0&&visibleQAs.every(r=>selectedQAs.has(r.email?.toLowerCase()))} onChange={()=>{const allSel=visibleQAs.every(r=>selectedQAs.has(r.email?.toLowerCase()));setSelectedQAs(prev=>{const n=new Set(prev);visibleQAs.forEach(r=>{const e=r.email?.toLowerCase();if(e){allSel?n.delete(e):n.add(e);}});return n;});}}/>
              </th>}
              <th style={{position:"sticky",left:isLead?28:0,background:"var(--bg3)",zIndex:2,minWidth:140}}>QA</th>
              {days.map(d => (
                <th key={d.num} style={{textAlign:"center",padding:"4px 2px",minWidth:36,background:d.isWeekend?"rgba(156,163,175,0.1)":"transparent"}}>
                  <div style={{fontSize:9,color:d.isWeekend?"var(--tx3)":"var(--tx2)"}}>{d.dayName}</div>
                  <div style={{fontSize:11,fontWeight:600,color:d.isWeekend?"var(--tx3)":"var(--tx)"}}>{d.num}</div>
                </th>
              ))}
              <th style={{textAlign:"center",minWidth:30,fontSize:10}}>P</th>
              <th style={{textAlign:"center",minWidth:30,fontSize:10}}>AL</th>
              <th style={{textAlign:"center",minWidth:30,fontSize:10}}>SL</th>
              <th style={{textAlign:"center",minWidth:30,fontSize:10}}>OFF</th>
            </tr>
          </thead>
          <tbody>
            {visibleQAs.sort((a,b)=>(a.email||"").localeCompare(b.email||"")).map(qa => {
              const em = qa.email?.toLowerCase();
              const counts = countByStatus(em);
              return (
                <tr key={em} style={{background:selectedQAs.has(em)?"var(--accent-light)":"transparent"}}>
                  {isLead&&<td style={{position:"sticky",left:0,background:selectedQAs.has(em)?"var(--accent-light)":"var(--bg3)",zIndex:1,width:28,padding:"6px 6px",borderRight:"1px solid var(--bd)"}}>
                    <input type="checkbox" style={{cursor:"pointer",accentColor:"var(--tabby-purple)"}} checked={selectedQAs.has(em)} onChange={()=>setSelectedQAs(prev=>{const n=new Set(prev);n.has(em)?n.delete(em):n.add(em);return n;})}/>
                  </td>}
                  <td style={{position:"sticky",left:isLead?28:0,background:selectedQAs.has(em)?"var(--accent-light)":"var(--bg3)",zIndex:1,fontWeight:600,fontSize:12,padding:"6px 8px",borderRight:"1px solid var(--bd)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:"var(--accent-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"var(--accent-text)",flexShrink:0}}>
                        {nameFromEmail(em).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{nameFromEmail(em)}</span>
                    </div>
                  </td>
                  {days.map(d => {
                    const att = getAtt(em, d.num);
                    const st = att?.status || (d.isWeekend ? null : null);
                    const attType = st ? ATT_MAP[st] : null;
                    const cellKey = `${em}-${d.num}`;
                    const isEditing = editCell === cellKey;
                    const canEdit = isLead || em === myEmail;
                    return (
                      <td key={d.num} style={{textAlign:"center",padding:1,background:d.isWeekend?"rgba(156,163,175,0.05)":"transparent",position:"relative",cursor:canEdit?"pointer":"default"}}
                        onClick={()=>{if(canEdit){setEditCell(isEditing?null:cellKey);}}}>
                        {st ? (
                          <span style={{fontSize:9,padding:"2px 3px",borderRadius:3,background:attType?.bg||"var(--bg3)",color:attType?.color||"var(--tx3)",fontWeight:700,display:"inline-block",minWidth:20,pointerEvents:"none"}}>{st}</span>
                        ) : (
                          <span style={{fontSize:10,color:"var(--bd2)",pointerEvents:"none"}}>·</span>
                        )}
                        {isEditing && <div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:8,padding:4,boxShadow:"var(--shadow-lg)",display:"flex",flexWrap:"wrap",gap:2,width:160}}>
                          {ATTENDANCE_TYPES.map(t => (
                            <button key={t.code} onClick={(e)=>{e.stopPropagation();setAtt(em,d.num,t.code);}} style={{fontSize:8,padding:"3px 4px",borderRadius:3,border:"none",cursor:"pointer",background:t.bg,color:t.color,fontWeight:700,fontFamily:"var(--font)"}} title={t.label}>{t.code}</button>
                          ))}
                          {st&&<button onClick={async(e)=>{e.stopPropagation();const existing=getAtt(em,d.num);if(existing?.id&&!existing.id.startsWith("new")){try{await sb.query("qa_attendance",{token,method:"DELETE",filters:`id=eq.${existing.id}`});setAttendance(prev=>prev.filter(a=>a.id!==existing.id));setEditCell(null);globalToast("success","Removed");}catch(err){globalToast("error",safeError(err));}}else{setEditCell(null);}}} style={{fontSize:8,padding:"3px 4px",borderRadius:3,border:"1px solid var(--red)",cursor:"pointer",background:"var(--red-bg)",color:"var(--red)",fontWeight:700,fontFamily:"var(--font)",width:"100%",marginTop:2}} title="Remove entry">✕ Clear</button>}
                        </div>}
                      </td>
                    );
                  })}
                  <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"var(--green)"}}>{counts["P"]||0}</td>
                  <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"var(--red)"}}>{counts["AL"]||0}</td>
                  <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"#B91C1C"}}>{counts["Paid SL"]||0}</td>
                  <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"var(--tx3)"}}>{counts["OFF"]||0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* CSV Upload popup — positioned at top */}
      {csvUpload&&<div style={{position:"fixed",inset:0,zIndex:999,background:"rgba(0,0,0,0.5)",display:"flex",justifyContent:"center",alignItems:"flex-start",paddingTop:60}} onClick={()=>{setCsvUpload(false);setCsvFile(null);setCsvPreview([]);}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"var(--shadow-lg)",width:"100%",maxWidth:600,padding:20,maxHeight:"80vh",overflow:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:700,color:"var(--tx)"}}>Upload attendance CSV</div>
            <button onClick={()=>{setCsvUpload(false);setCsvFile(null);setCsvPreview([]);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"var(--tx3)"}}>×</button>
          </div>
          {csvPreview.length===0?<>
            <div style={{fontSize:12,color:"var(--tx2)",marginBottom:12,lineHeight:1.6}}>
              Download the CSV template, fill in the attendance codes, then upload here. Existing data will be overwritten.
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              {ATTENDANCE_TYPES.map(t=><span key={t.code} style={{fontSize:9,padding:"2px 5px",borderRadius:3,background:t.bg,color:t.color,fontWeight:700}}>{t.code}</span>)}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <button className="btn btn-outline btn-sm" onClick={downloadCsvTemplate}>Download template for {selMonth}</button>
            </div>
            <div className="form-group">
              <label className="form-label">Upload filled CSV</label>
              <input type="file" accept=".csv" className="form-input" onChange={e=>{const f=e.target.files[0];if(f){setCsvFile(f);parseCsvUpload(f);}}}/>
            </div>
          </>:<>
            <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Preview — {csvPreview.length} QAs, {csvPreview.reduce((a,p)=>a+p.entries.length,0)} records</div>
            <div style={{fontSize:12,color:"var(--tx3)",marginBottom:4}}>Month: {selMonth}</div>
            <div style={{fontSize:11,color:"var(--amber)",marginBottom:12}}>Existing records will be overwritten.</div>
            <div style={{maxHeight:280,overflow:"auto",border:"1px solid var(--bd2)",borderRadius:8,marginBottom:16}}>
              <table><thead><tr><th>QA</th><th>Records</th><th>Sample</th></tr></thead>
              <tbody>{csvPreview.map(p=>(
                <tr key={p.email}>
                  <td style={{fontSize:12,fontWeight:500}}>{p.email}</td>
                  <td style={{fontSize:12}}>{p.entries.length} days</td>
                  <td style={{fontSize:11}}>{p.entries.slice(0,5).map(e=>{const at=ATT_MAP[e.status];return <span key={e.day} style={{padding:"1px 4px",borderRadius:3,background:at?.bg,color:at?.color,fontWeight:700,fontSize:9,marginRight:2}}>{e.day}:{e.status}</span>})}{p.entries.length>5&&<span style={{color:"var(--tx3)"}}>+{p.entries.length-5}</span>}</td>
                </tr>
              ))}</tbody></table>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-primary btn-sm" disabled={csvUploading} onClick={executeCsvUpload}>
                {csvUploading?"Uploading...":"Confirm & upload"}
              </button>
              <button className="btn btn-outline btn-sm" onClick={()=>{setCsvPreview([]);setCsvFile(null);}}>Back</button>
              <button className="btn btn-outline btn-sm" onClick={()=>{setCsvUpload(false);setCsvFile(null);setCsvPreview([]);}}>Cancel</button>
            </div>
          </>}
        </div>
      </div>}

      {/* Bulk set popup — positioned at top */}
      {bulkModal&&<div style={{position:"fixed",inset:0,zIndex:999,background:"rgba(0,0,0,0.5)",display:"flex",justifyContent:"center",alignItems:"flex-start",paddingTop:60}} onClick={()=>setBulkModal(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"var(--shadow-lg)",width:"100%",maxWidth:520,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:16,fontWeight:700,color:"var(--tx)"}}>Bulk set attendance</div>
            <button onClick={()=>setBulkModal(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"var(--tx3)"}}>×</button>
          </div>

          {/* Quick actions */}
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <button className="btn btn-sm" style={{fontSize:11,background:bulkStatus==="P"&&bulkDayFilter==="weekdays"?"var(--green)":"var(--green-bg)",color:bulkStatus==="P"&&bulkDayFilter==="weekdays"?"#fff":"var(--green)",border:"1px solid var(--green)",fontWeight:600,transition:"all .15s"}} onClick={()=>{setBulkStatus("P");setBulkDayFilter("weekdays");setBulkFrom(`${selMonth}-01`);setBulkTo(`${selMonth}-${String(daysInMonth).padStart(2,"0")}`);}}>Set P for Sun–Thu</button>
            <button className="btn btn-sm" style={{fontSize:11,background:bulkStatus==="OFF"&&bulkDayFilter==="weekends"?"var(--tx3)":"rgba(156,163,175,0.1)",color:bulkStatus==="OFF"&&bulkDayFilter==="weekends"?"#fff":"var(--tx3)",border:"1px solid var(--bd)",fontWeight:600,transition:"all .15s"}} onClick={()=>{setBulkStatus("OFF");setBulkDayFilter("weekends");setBulkFrom(`${selMonth}-01`);setBulkTo(`${selMonth}-${String(daysInMonth).padStart(2,"0")}`);}}>Set OFF for Fri–Sat</button>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div className="form-group"><label className="form-label">From</label>
              <input type="date" className="form-input" value={bulkFrom} onChange={e=>setBulkFrom(e.target.value)}/>
            </div>
            <div className="form-group"><label className="form-label">To</label>
              <input type="date" className="form-input" value={bulkTo} onChange={e=>setBulkTo(e.target.value)}/>
            </div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="select form-input" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>
                {ATTENDANCE_TYPES.map(t => <option key={t.code} value={t.code}>{t.code} — {t.label}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Apply on days</label>
              <select className="select form-input" value={bulkDayFilter} onChange={e=>setBulkDayFilter(e.target.value)}>
                <option value="all">All days in range</option>
                <option value="weekdays">Sun–Thu only</option>
                <option value="weekends">Fri–Sat only</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Apply to</label>
              <select className="select form-input" value={bulkScope} onChange={e=>setBulkScope(e.target.value)}>
                <option value="my_team">{isLead&&!hasRole(profile?.role,"qa_supervisor")?"My team":"All QAs"}</option>
                <option value="specific">Specific person</option>
                {selectedQAs.size>0&&<option value="selected">Selected QAs ({selectedQAs.size})</option>}
              </select>
            </div>
            {bulkScope==="specific"&&<div className="form-group"><label className="form-label">Person</label>
              <SearchableSelect options={visibleQAs.map(r=>({value:r.email,label:r.email+" — "+nameFromEmail(r.email)}))}
                value={bulkPerson} onChange={setBulkPerson} placeholder="Select person..."/>
            </div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={applyBulk}>Apply</button>
            <button className="btn btn-outline btn-sm" onClick={()=>setBulkModal(false)}>Cancel</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

export default SchedulePage;
