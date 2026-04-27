import React, { useState, useEffect, useRef, useCallback } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";

const ATTENDANCE_TYPES = [
  {code:"P",label:"Present",color:"#22C55E",bg:"#22C55E20"},
  {code:"H",label:"Work from Home",color:"#3B82F6",bg:"#3B82F620"},
  {code:"OT",label:"Overtime",color:"#0D9488",bg:"#0D948820"},
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
// Codes that need lead approval when set by a QA themselves. Leads
// setting these for their team approve them implicitly.
const APPROVAL_CODES = new Set(["OT", "PH"]);
// Codes shown in the cell picker. OT is intentionally excluded — it's a
// separate request flow behind the "Request OT" header button so it
// can't be set casually by clicking around.
const PICKER_TYPES = ATTENDANCE_TYPES.filter(t => t.code !== "OT");

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
  const [otModal, setOtModal] = useState(false);
  const [otFrom, setOtFrom] = useState("");
  const [otTo, setOtTo] = useState("");
  const [otTarget, setOtTarget] = useState(""); // for leads: which QA(s)
  const [otNote, setOtNote] = useState("");
  const [bulkScope, setBulkScope] = useState("my_team");
  const [bulkPerson, setBulkPerson] = useState("");
  const [bulkDayFilter, setBulkDayFilter] = useState("all");
  const [selectedQAs, setSelectedQAs] = useState(new Set());
  const [editCell, setEditCell] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [monthLock, setMonthLock] = useState(null); // {year_month, locked_by, locked_at} or null
  const {ask: confirmAsk, el: confirmEl} = useConfirm();

  const myEmail = profile?.email?.toLowerCase() || "";
  const isQA = profile?.role === "qa" || profile?.role === "senior_qa";
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSuperAdmin = hasRole(profile?.role, "super_admin");
  // The selected month is locked for everyone except super_admin once a
  // lead closes it. Used to gate every write path.
  const monthIsLocked = !!monthLock && !isSuperAdmin;

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
      const base = `${SUPABASE_URL}/rest/v1/qa_attendance?select=id,email,date,status,approval_status,requested_by,approved_by,approved_at`;
      const [r, a1, a2, a3] = await Promise.all([
        listRoster({ token, select: "email,display_name,manager_email,queue,country" }),
        fetch(`${base}&date=gte.${fmtD(1)}&date=lte.${fmtD(chunk1End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]),
        chunk1End < dim ? fetch(`${base}&date=gte.${fmtD(chunk1End+1)}&date=lte.${fmtD(chunk2End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]) : Promise.resolve([]),
        chunk2End < dim ? fetch(`${base}&date=gte.${fmtD(chunk2End+1)}&date=lte.${fmtD(chunk3End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]) : Promise.resolve([]),
      ]);
      setRoster(Array.isArray(r) ? r : []);
      const allAtt = [...(Array.isArray(a1)?a1:[]), ...(Array.isArray(a2)?a2:[]), ...(Array.isArray(a3)?a3:[])];
      setAttendance(allAtt);
      // Lock state for the selected month.
      try {
        const lock = await sb.query("attendance_month_locks", { token, select: "year_month,locked_by,locked_at", filters: `year_month=eq.${selMonth}&limit=1` }).catch(() => []);
        setMonthLock(Array.isArray(lock) && lock.length > 0 ? lock[0] : null);
      } catch { setMonthLock(null); }
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
                // Upsert so undo works whether the row still exists (status
                // changed in-place) or was deleted (Clear → row removed).
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
                  method: "POST", headers: {"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`, "Prefer": "resolution=merge-duplicates,return=minimal"},
                  body: JSON.stringify({email: last.email, date: last.date, status: last.oldStatus, created_by: myEmailRef.current})
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
              if (last.newStatus) {
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
                  method: "POST", headers: {"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`, "Prefer": "resolution=merge-duplicates,return=minimal"},
                  body: JSON.stringify({email: last.email, date: last.date, status: last.newStatus, created_by: myEmailRef.current})
                });
              } else {
                // Redo of a Clear → remove the row again.
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(last.email)}&date=eq.${last.date}`, {
                  method: "DELETE", headers: {"apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`}
                });
              }
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

  // Single-key shortcuts inside the cell picker + arrow nav between cells.
  // Only active while a cell is open for editing.
  const editCellRef = useRef(editCell);
  const visibleQAsRef = useRef([]);
  const daysInMonthRef = useRef(0);
  const setAttRef = useRef(null);
  useEffect(() => { editCellRef.current = editCell; });
  useEffect(() => {
    const handler = (e) => {
      const cur = editCellRef.current;
      if (!cur) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/i.test(e.target.tagName)) return;
      // Parse current cellKey: "<email>-<dayNum>".
      const lastDash = cur.lastIndexOf("-");
      const em = cur.slice(0, lastDash);
      const dayNum = parseInt(cur.slice(lastDash + 1), 10);
      if (!em || !dayNum) return;

      // Single-key code shortcuts → set status and close.
      const SHORTCUTS = { p: "P", h: "H", l: "L", a: "AL", s: "Paid SL", n: "NSNC", e: "EL", u: "UL", m: "ML" };
      const key = e.key.toLowerCase();
      if (SHORTCUTS[key]) { e.preventDefault(); setAttRef.current?.(em, dayNum, SHORTCUTS[key]); return; }
      if (e.key === "Escape") { e.preventDefault(); setEditCell(null); return; }

      // Arrow navigation → move to adjacent cell, leaving the picker open
      // there for chord-style entry.
      const qas = visibleQAsRef.current;
      const dim = daysInMonthRef.current;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = dayNum + (e.key === "ArrowRight" ? 1 : -1);
        if (next >= 1 && next <= dim) setEditCell(`${em}-${next}`);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = qas.findIndex(r => r.email?.toLowerCase() === em);
        if (idx === -1) return;
        const nextIdx = idx + (e.key === "ArrowDown" ? 1 : -1);
        if (nextIdx >= 0 && nextIdx < qas.length) {
          const nextEm = qas[nextIdx].email?.toLowerCase();
          if (nextEm) setEditCell(`${nextEm}-${dayNum}`);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Get QA lead emails for filtering
  const [profiles, setProfiles] = useState([]);
  useEffect(() => {
    listProfiles({ token, select: "email,role", filters: "", cache: false }).then(p => setProfiles(Array.isArray(p)?p:[]));
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
  // Keep refs current for the keyboard handler.
  useEffect(() => {
    visibleQAsRef.current = [...visibleQAs].sort((a,b)=>(a.email||"").localeCompare(b.email||""));
    daysInMonthRef.current = daysInMonth;
    setAttRef.current = setAtt;
  });
  const days = Array.from({length: daysInMonth}, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    return { num: i + 1, date: d, dayName: d.toLocaleDateString("en-US", {weekday: "short"}), isWeekend: d.getDay() === 5 || d.getDay() === 6 };
  });

  // Get attendance for a QA on a specific date
  const getAtt = (email, dayNum) => {
    const dateStr = `${selMonth}-${String(dayNum).padStart(2,"0")}`;
    return attendance.find(a => a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr);
  };

  // Submit an OT request for one or more days. QA submits for self
  // (lands as 'pending'); lead can submit for any QA on their team and
  // it lands already 'approved'.
  const applyOtRequest = async () => {
    if (monthIsLocked) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
    if (!otFrom || !otTo) { globalToast("error", "Pick a date range"); return; }
    const targetEmail = isQA ? myEmail : (otTarget || "").toLowerCase();
    if (!targetEmail) { globalToast("error", "Pick the QA the OT is for"); return; }
    const start = new Date(otFrom + "T00:00:00");
    const end = new Date(otTo + "T00:00:00");
    if (end < start) { globalToast("error", "End date is before start date"); return; }
    const isSelf = targetEmail === myEmail && isQA;
    const approval_status = isSelf ? "pending" : "approved";
    const requested_by = isSelf ? myEmail : null;
    const approved_by = isSelf ? null : myEmail;
    const approved_at = isSelf ? null : new Date().toISOString();
    const rows = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      rows.push({ email: targetEmail, date: dateStr, status: "OT", approval_status, requested_by, approved_by, approved_at, notes: otNote || null, created_by: myEmail });
    }
    if (rows.length === 0) { globalToast("error", "No days in range"); return; }
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
        method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${token}`, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!resp.ok) throw new Error(await resp.text());
      globalToast("success", isSelf ? `OT requested for ${rows.length} day${rows.length>1?"s":""} — pending lead approval` : `OT logged for ${rows.length} day${rows.length>1?"s":""}`);
      setOtModal(false); setOtFrom(""); setOtTo(""); setOtNote(""); setOtTarget("");
      loadData();
    } catch (e) { globalToast("error", safeError(e)); }
  };

  // Lock / unlock the selected month. Lead+ only; super_admin can unlock
  // anything they didn't originally lock.
  const toggleLock = async () => {
    try {
      if (monthLock) {
        await sb.query("attendance_month_locks", { token, method: "DELETE", filters: `year_month=eq.${selMonth}` });
        setMonthLock(null);
        globalToast("success", `Unlocked ${selMonth}`);
      } else {
        const body = { year_month: selMonth, locked_by: myEmail, locked_at: new Date().toISOString() };
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/attendance_month_locks?on_conflict=year_month`, {
          method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${token}`, "Prefer": "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error(await resp.text());
        setMonthLock(body);
        globalToast("success", `Locked ${selMonth}`);
      }
    } catch (e) { globalToast("error", safeError(e)); }
  };

  // Set attendance for a single cell
  const setAtt = async (email, dayNum, status) => {
    if (monthIsLocked) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
    const dateStr = `${selMonth}-${String(dayNum).padStart(2,"0")}`;
    try {
      const existing = getAtt(email, dayNum);
      const oldStatus = existing?.status || null;
      // QAs (or senior_qa) self-setting OT or PH need lead approval. Anyone
      // else (lead, supervisor, admin) writes already-approved.
      const isSelfRequest = isQA && email?.toLowerCase() === myEmail && APPROVAL_CODES.has(status);
      const approval_status = isSelfRequest ? "pending" : null;
      const requested_by = isSelfRequest ? myEmail : null;
      const approved_by = isSelfRequest ? null : myEmail;
      const approved_at = isSelfRequest ? null : new Date().toISOString();
      if (existing) {
        if (status === existing.status && (existing.approval_status || null) === approval_status) { setEditCell(null); return; }
        await sb.query("qa_attendance", {token, method:"PATCH", body:{status, approval_status, requested_by, approved_by, approved_at, updated_at:new Date().toISOString()}, filters:`id=eq.${existing.id}`});
      } else {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
          method:"POST", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`,"Prefer":"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify({email:email.toLowerCase(), date:dateStr, status, approval_status, requested_by, approved_by, approved_at, created_by:myEmail})
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
      // Push to undo stack
      setUndoStack(prev => [...prev.slice(-50), {email: email.toLowerCase(), date: dateStr, oldStatus, newStatus: status}]);
      setRedoStack([]);
      setAttendance(prev => {
        const filtered = prev.filter(a => !(a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr));
        return [...filtered, {email:email.toLowerCase(), date:dateStr, status, approval_status, requested_by, approved_by, approved_at, id:existing?.id||"new-"+Date.now(), created_by:myEmail}];
      });
      setEditCell(null);
      if (isSelfRequest) globalToast("success", `${status} requested — pending lead approval`);
    } catch(e) { globalToast("error", safeError(e)); }
  };

  // Lead approves a pending OT/PH request. Keeps the same status, just
  // flips approval_status to 'approved'.
  const approveAtt = async (email, dayNum) => {
    if (monthIsLocked) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
    const existing = getAtt(email, dayNum);
    if (!existing) return;
    const dateStr = `${selMonth}-${String(dayNum).padStart(2,"0")}`;
    try {
      const body = { approval_status: "approved", approved_by: myEmail, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (existing.id && !String(existing.id).startsWith("new")) {
        await sb.query("qa_attendance", { token, method:"PATCH", body, filters:`id=eq.${existing.id}` });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(email)}&date=eq.${dateStr}`, {
          method:"PATCH", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`},
          body: JSON.stringify(body),
        });
      }
      setAttendance(prev => prev.map(a => (a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr) ? { ...a, ...body } : a));
      setEditCell(null);
      globalToast("success", `Approved ${existing.status} for ${nameFromEmail(email)}`);
    } catch(e) { globalToast("error", safeError(e)); }
  };

  // Bulk set
  const applyBulk = async () => {
    if (monthIsLocked) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
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
    if (monthIsLocked) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
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
          {isLead&&<button className="btn btn-outline btn-sm" style={{fontSize:11,color:monthLock?"var(--amber)":"var(--tx2)",borderColor:monthLock?"var(--amber)":"var(--bd)"}} onClick={toggleLock} title={monthLock?`Locked by ${nameFromEmail(monthLock.locked_by)} on ${new Date(monthLock.locked_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`:"Lock this month so it can't be edited"}>
            {monthLock ? "🔓 Unlock" : "🔒 Lock month"}
          </button>}
          {isLead&&<button className="btn btn-primary btn-sm" disabled={monthIsLocked} style={{opacity:monthIsLocked?0.5:1}} onClick={()=>{if(monthIsLocked){globalToast("error","Month is locked.");return;}setBulkModal(true);setBulkFrom(`${selMonth}-01`);setBulkTo(`${selMonth}-${String(daysInMonth).padStart(2,"0")}`);setBulkStatus("P");setBulkDayFilter("all");}}>
            <Icon d={icons.plus} size={14}/>Bulk set
          </button>}
          <button className="btn btn-outline btn-sm" disabled={monthIsLocked} style={{opacity:monthIsLocked?0.5:1,fontSize:11,color:"#0D9488",borderColor:"#0D9488"}} onClick={()=>{if(monthIsLocked){globalToast("error","Month is locked.");return;}const todayStr=new Date().toISOString().split("T")[0];setOtModal(true);setOtFrom(todayStr);setOtTo(todayStr);setOtTarget(isQA?myEmail:"");setOtNote("");}}
            title={isQA?"Request OT for yourself — sent to your lead for approval":"Add OT for a QA on your team"}>
            ⏱ {isQA ? "Request OT" : "Add OT"}
          </button>
          {isLead&&<button className="btn btn-outline btn-sm" onClick={downloadCsvTemplate} style={{fontSize:11}}>
            <Icon d={icons.upload} size={13}/>Download CSV
          </button>}
          {isLead&&<button className="btn btn-outline btn-sm" onClick={()=>setCsvUpload(true)} style={{fontSize:11}}>
            <Icon d={icons.upload} size={13}/>Upload CSV
          </button>}
          {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" style={{fontSize:11,color:"var(--red)",borderColor:"var(--red)"}} onClick={()=>{
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

      {/* Lock banner */}
      {monthLock && <div className="card" style={{padding:"10px 14px",marginBottom:12,borderLeft:"3px solid var(--amber)",background:"var(--amber-bg)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:13}}>🔒</span>
        <span style={{fontSize:12,color:"var(--tx)",fontWeight:500}}>
          Locked by <strong>{nameFromEmail(monthLock.locked_by)}</strong> on {new Date(monthLock.locked_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}.
          {isSuperAdmin ? " Super-admin override active — you can still edit." : " Ask a lead to unlock to edit."}
        </span>
      </div>}

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
                    const isPending = att?.approval_status === "pending";
                    const cellKey = `${em}-${d.num}`;
                    const isEditing = editCell === cellKey;
                    const canEdit = (isLead || em === myEmail) && !monthIsLocked;
                    const cellTitle = isPending
                      ? `${attType?.label || st} — pending lead approval${att?.requested_by?` (requested by ${nameFromEmail(att.requested_by)})`:""}`
                      : (attType?.label || "");
                    return (
                      <td key={d.num} style={{textAlign:"center",padding:1,background:d.isWeekend?"rgba(156,163,175,0.05)":"transparent",position:"relative",cursor:canEdit?"pointer":"default"}}
                        onClick={()=>{if(canEdit){setEditCell(isEditing?null:cellKey);}}}
                        title={cellTitle}>
                        {st ? (
                          <span style={{position:"relative",display:"inline-block",minWidth:20,pointerEvents:"none"}}>
                            <span style={{fontSize:9,padding:"2px 3px",borderRadius:3,background:attType?.bg||"var(--bg3)",color:attType?.color||"var(--tx3)",fontWeight:700,display:"inline-block",minWidth:20,opacity:isPending?0.55:1,outline:isPending?`1px dashed ${attType?.color||"var(--tx3)"}`:"none"}}>{st}</span>
                            {isPending && <span style={{position:"absolute",top:-4,right:-4,fontSize:8,lineHeight:1,background:"var(--bg3)",border:"1px solid var(--amber)",color:"var(--amber)",borderRadius:6,padding:"1px 2px",fontWeight:700}}>⏳</span>}
                          </span>
                        ) : (
                          <span style={{fontSize:10,color:"var(--bd2)",pointerEvents:"none"}}>·</span>
                        )}
                        {isEditing && <div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:8,padding:4,boxShadow:"var(--shadow-lg)",display:"flex",flexWrap:"wrap",gap:2,width:160}}>
                          {isPending && isLead && em !== myEmail && <button onClick={(e)=>{e.stopPropagation();approveAtt(em,d.num);}} style={{fontSize:9,padding:"4px 6px",borderRadius:4,border:"1px solid var(--green)",cursor:"pointer",background:"var(--green-bg)",color:"var(--green)",fontWeight:700,fontFamily:"var(--font)",width:"100%",marginBottom:2}} title={`Approve ${st}`}>✓ Approve {st}</button>}
                          {isPending && isLead && em !== myEmail && <div style={{fontSize:8,color:"var(--tx3)",width:"100%",padding:"2px 0",textAlign:"center",fontStyle:"italic"}}>Or pick a different code to replace</div>}
                          {PICKER_TYPES.map(t => {
                            const SK = { P:"p", H:"h", L:"l", AL:"a", "Paid SL":"s", NSNC:"n", EL:"e", UL:"u", ML:"m" }[t.code];
                            return <button key={t.code} onClick={(e)=>{e.stopPropagation();setAtt(em,d.num,t.code);}} style={{fontSize:8,padding:"3px 4px",borderRadius:3,border:"none",cursor:"pointer",background:t.bg,color:t.color,fontWeight:700,fontFamily:"var(--font)"}} title={`${t.label}${SK?` (${SK})`:""}`}>{t.code}</button>;
                          })}
                          <div style={{fontSize:7,color:"var(--tx3)",width:"100%",textAlign:"center",marginTop:2,letterSpacing:.3}}>Type a key · ← → ↑ ↓ to nav · Esc to close</div>
                          {st&&<button onClick={async(e)=>{
                            e.stopPropagation();
                            const existing=getAtt(em,d.num);
                            if(!existing){setEditCell(null);return;}
                            const dateStr=`${selMonth}-${String(d.num).padStart(2,"0")}`;
                            const oldStatus=existing.status||null;
                            try{
                              if(existing.id&&!String(existing.id).startsWith("new")){
                                // Real DB row — delete by id.
                                await sb.query("qa_attendance",{token,method:"DELETE",filters:`id=eq.${existing.id}`});
                              }else{
                                // Optimistic row whose id is still the temp "new-..." placeholder.
                                // The actual DB row (created by the prior upsert) is keyed on email+date.
                                const resp=await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(em)}&date=eq.${dateStr}`,{
                                  method:"DELETE",headers:{"apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`}
                                });
                                if(!resp.ok)throw new Error(await resp.text());
                              }
                              setAttendance(prev=>prev.filter(a=>!(a.email?.toLowerCase()===em&&a.date===dateStr)));
                              setUndoStack(prev=>[...prev.slice(-50),{email:em,date:dateStr,oldStatus,newStatus:null}]);
                              setRedoStack([]);
                              setEditCell(null);
                              globalToast("success","Removed");
                            }catch(err){globalToast("error",safeError(err));}
                          }} style={{fontSize:8,padding:"3px 4px",borderRadius:3,border:"1px solid var(--red)",cursor:"pointer",background:"var(--red-bg)",color:"var(--red)",fontWeight:700,fontFamily:"var(--font)",width:"100%",marginTop:2}} title="Remove entry">✕ Clear</button>}
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

      {/* Request / Add OT popup */}
      {otModal&&<div style={{position:"fixed",inset:0,zIndex:999,background:"rgba(0,0,0,0.5)",display:"flex",justifyContent:"center",alignItems:"flex-start",paddingTop:80}} onClick={()=>setOtModal(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"var(--shadow-lg)",width:"100%",maxWidth:460,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:16,fontWeight:700,color:"var(--tx)",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,padding:"3px 8px",borderRadius:6,background:"#0D948820",color:"#0D9488",fontWeight:700}}>OT</span>
              {isQA ? "Request overtime" : "Add overtime"}
            </div>
            <button onClick={()=>setOtModal(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"var(--tx3)"}}>×</button>
          </div>
          <div style={{fontSize:12,color:"var(--tx2)",marginBottom:12,lineHeight:1.5}}>
            {isQA
              ? "Pick the day(s) you worked overtime. Your QA Lead will get a notification and can approve or replace it."
              : "Pick the day(s) and the QA. This is added directly as approved overtime — no further approval needed."}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div className="form-group"><label className="form-label">From</label>
              <input type="date" className="form-input" value={otFrom} onChange={e=>setOtFrom(e.target.value)}/>
            </div>
            <div className="form-group"><label className="form-label">To</label>
              <input type="date" className="form-input" value={otTo} onChange={e=>setOtTo(e.target.value)}/>
            </div>
          </div>
          {!isQA && <div className="form-group" style={{marginBottom:12}}>
            <label className="form-label">QA</label>
            <SearchableSelect options={visibleQAs.map(r=>({value:r.email,label:r.email+" — "+nameFromEmail(r.email)}))}
              value={otTarget} onChange={setOtTarget} placeholder="Pick the QA..."/>
          </div>}
          <div className="form-group" style={{marginBottom:14}}>
            <label className="form-label">Note (optional)</label>
            <input type="text" className="form-input" value={otNote} onChange={e=>setOtNote(e.target.value)} placeholder="e.g. weekend coverage for launch"/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={applyOtRequest}>{isQA ? "Send request" : "Add OT"}</button>
            <button className="btn btn-outline btn-sm" onClick={()=>setOtModal(false)}>Cancel</button>
          </div>
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
            <button className="btn btn-sm" style={{fontSize:11,background:bulkStatus==="OFF"&&bulkDayFilter==="weekends"?"var(--tx2)":"rgba(156,163,175,0.1)",color:bulkStatus==="OFF"&&bulkDayFilter==="weekends"?"var(--bg3)":"var(--tx2)",border:"1px solid var(--bd)",fontWeight:600,transition:"all .15s"}} onClick={()=>{setBulkStatus("OFF");setBulkDayFilter("weekends");setBulkFrom(`${selMonth}-01`);setBulkTo(`${selMonth}-${String(daysInMonth).padStart(2,"0")}`);}}>Set OFF for Fri–Sat</button>
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
                <option value="my_team">{isLead&&!hasRole(profile?.role,"qa_supervisor")?"My team (direct reports)":hasRole(profile?.role,"qa_supervisor")?"All QAs in my domain":"All QAs"}</option>
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
