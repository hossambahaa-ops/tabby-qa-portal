import React, { useState, useEffect, useRef, useCallback } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";
import { ATTENDANCE_TYPES, ATT_MAP, APPROVAL_CODES, PICKER_TYPES } from "../lib/attendance.js";
import AttendanceBulkModal from "../components/attendance/AttendanceBulkModal.jsx";
import AttendanceCsvUpload from "../components/attendance/AttendanceCsvUpload.jsx";
import AttendanceOtModal from "../components/attendance/AttendanceOtModal.jsx";
import PendingApprovals from "../components/attendance/PendingApprovals.jsx";
import LeaveBalances from "../components/attendance/LeaveBalances.jsx";
import MonthlySummary from "../components/attendance/MonthlySummary.jsx";

function SchedulePage() {
  const{token,profile,gf,globalToast}=useApp();
  const [attendance, setAttendance] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useUrlState("tab", "calendar");
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
  const [otTarget, setOtTarget] = useState("");
  const [otNote, setOtNote] = useState("");
  const [otHoursPerDay, setOtHoursPerDay] = useState(2);
  const [bulkScope, setBulkScope] = useState("my_team");
  const [bulkPerson, setBulkPerson] = useState("");
  const [bulkDayFilter, setBulkDayFilter] = useState("all");
  const [selectedQAs, setSelectedQAs] = useState(new Set());
  const [editCell, setEditCell] = useState(null);
  const [pendingReason, setPendingReason] = useState(""); // reason input in cell picker
  const [pickerStage, setPickerStage] = useState(null); // null | { code } — sub-stage inside open cell picker
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [monthLock, setMonthLock] = useState(null);
  const {ask: confirmAsk, el: confirmEl} = useConfirm();

  const myEmail = profile?.email?.toLowerCase() || "";
  const isQA = profile?.role === "qa" || profile?.role === "senior_qa";
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSuperAdmin = hasRole(profile?.role, "super_admin");
  const monthIsLocked = !!monthLock && !isSuperAdmin;

  const _nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
  };

  const loadData = useCallback(async () => {
    try {
      const [yr, mo] = selMonth.split("-").map(Number);
      const dim = new Date(yr, mo, 0).getDate();
      const chunk1End = Math.min(10, dim);
      const chunk2End = Math.min(20, dim);
      const chunk3End = dim;
      const fmtD = (d) => `${selMonth}-${String(d).padStart(2,"0")}`;
      const hdrs = {"apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`};
      const base = `${SUPABASE_URL}/rest/v1/qa_attendance?select=id,email,date,status,approval_status,requested_by,approved_by,approved_at,ot_hours,request_note,denial_reason,denied_by,denied_at`;
      const [r, a1, a2, a3] = await Promise.all([
        listRoster({ token, select: "email,display_name,manager_email,queue,country" }),
        fetch(`${base}&date=gte.${fmtD(1)}&date=lte.${fmtD(chunk1End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]),
        chunk1End < dim ? fetch(`${base}&date=gte.${fmtD(chunk1End+1)}&date=lte.${fmtD(chunk2End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]) : Promise.resolve([]),
        chunk2End < dim ? fetch(`${base}&date=gte.${fmtD(chunk2End+1)}&date=lte.${fmtD(chunk3End)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]) : Promise.resolve([]),
      ]);
      setRoster(Array.isArray(r) ? r : []);
      const allAtt = [...(Array.isArray(a1)?a1:[]), ...(Array.isArray(a2)?a2:[]), ...(Array.isArray(a3)?a3:[])];
      setAttendance(allAtt);
      try {
        const lock = await sb.query("attendance_month_locks", { token, select: "year_month,locked_by,locked_at", filters: `year_month=eq.${selMonth}&limit=1` }).catch(() => []);
        setMonthLock(Array.isArray(lock) && lock.length > 0 ? lock[0] : null);
      } catch { setMonthLock(null); }
    } catch(e) { console.error("Schedule load:", e); }
    setLoading(false);
  }, [token, selMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset picker sub-stage whenever the open cell changes (or picker closes)
  useEffect(() => { setPickerStage(null); }, [editCell]);

  // Undo/Redo
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

  // Cell picker keyboard shortcuts
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
      const lastDash = cur.lastIndexOf("-");
      const em = cur.slice(0, lastDash);
      const dayNum = parseInt(cur.slice(lastDash + 1), 10);
      if (!em || !dayNum) return;
      const SHORTCUTS = { p: "P", h: "H", l: "L", a: "AL", s: "Paid SL", n: "NSNC", e: "EL", u: "UL", m: "ML" };
      const key = e.key.toLowerCase();
      if (SHORTCUTS[key]) { e.preventDefault(); setAttRef.current?.(em, dayNum, SHORTCUTS[key]); return; }
      if (e.key === "Escape") { e.preventDefault(); setEditCell(null); setPendingReason(""); return; }
      const qas = visibleQAsRef.current;
      const dim = daysInMonthRef.current;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = dayNum + (e.key === "ArrowRight" ? 1 : -1);
        if (next >= 1 && next <= dim) { setEditCell(`${em}-${next}`); setPendingReason(""); }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = qas.findIndex(r => r.email?.toLowerCase() === em);
        if (idx === -1) return;
        const nextIdx = idx + (e.key === "ArrowDown" ? 1 : -1);
        if (nextIdx >= 0 && nextIdx < qas.length) {
          const nextEm = qas[nextIdx].email?.toLowerCase();
          if (nextEm) { setEditCell(`${nextEm}-${dayNum}`); setPendingReason(""); }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Profiles for lead set
  const [profiles, setProfiles] = useState([]);
  useEffect(() => {
    listProfiles({ token, select: "email,role", filters: "", cache: false }).then(p => setProfiles(Array.isArray(p)?p:[]));
  }, [token]);
  const qaLeadSet = new Set(profiles.filter(p=>p.role==="qa_lead").map(p=>p.email?.toLowerCase()));

  // Visible QAs
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

  const [year, month] = selMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  useEffect(() => {
    visibleQAsRef.current = [...visibleQAs].sort((a,b)=>(a.email||"").localeCompare(b.email||""));
    daysInMonthRef.current = daysInMonth;
    setAttRef.current = setAtt;
  });
  const days = Array.from({length: daysInMonth}, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    return { num: i + 1, date: d, dayName: d.toLocaleDateString("en-US", {weekday: "short"}), isWeekend: d.getDay() === 5 || d.getDay() === 6 };
  });

  const getAtt = (email, dayNum) => {
    const dateStr = `${selMonth}-${String(dayNum).padStart(2,"0")}`;
    return attendance.find(a => a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr);
  };

  // ── Helper: resolve manager email for notifications ──────────────────────
  const getManagerEmail = (qaEmail) => {
    const r = roster.find(r => r.email?.toLowerCase() === qaEmail?.toLowerCase());
    return r?.manager_email?.toLowerCase() || null;
  };

  // ── Helper: log to activity_log for bell notifications ───────────────────
  const logAttendanceEvent = async (kind, recipientEmail, details) => {
    try {
      await sb.query("activity_log", {
        token,
        method: "POST",
        body: {
          actor_email: myEmail,
          action: kind,
          target_type: "attendance",
          target_id: null,
          details: { recipient: recipientEmail, ...details },
        },
      });
    } catch { /* fire-and-forget */ }
  };

  // ── setAtt (cell picker commit) ──────────────────────────────────────────
  const setAtt = async (email, dayNum, status, requestNote) => {
    if (monthIsLocked) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
    const dateStr = `${selMonth}-${String(dayNum).padStart(2,"0")}`;
    try {
      const existing = getAtt(email, dayNum);
      const oldStatus = existing?.status || null;
      const isSelfRequest = isQA && email?.toLowerCase() === myEmail && APPROVAL_CODES.has(status);
      const approval_status = isSelfRequest ? "pending" : null;
      const requested_by = isSelfRequest ? myEmail : null;
      const approved_by = isSelfRequest ? null : myEmail;
      const approved_at = isSelfRequest ? null : new Date().toISOString();
      const note = requestNote || null;
      if (existing) {
        if (status === existing.status && (existing.approval_status || null) === approval_status) { setEditCell(null); setPendingReason(""); return; }
        await sb.query("qa_attendance", {token, method:"PATCH", body:{status, approval_status, requested_by, approved_by, approved_at, request_note: note, updated_at:new Date().toISOString()}, filters:`id=eq.${existing.id}`});
      } else {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
          method:"POST", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`,"Prefer":"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify({email:email.toLowerCase(), date:dateStr, status, approval_status, requested_by, approved_by, approved_at, request_note: note, created_by:myEmail})
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
      setUndoStack(prev => [...prev.slice(-50), {email: email.toLowerCase(), date: dateStr, oldStatus, newStatus: status}]);
      setRedoStack([]);
      setAttendance(prev => {
        const filtered = prev.filter(a => !(a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr));
        return [...filtered, {email:email.toLowerCase(), date:dateStr, status, approval_status, requested_by, approved_by, approved_at, request_note: note, id:existing?.id||"new-"+Date.now(), created_by:myEmail}];
      });
      setEditCell(null);
      setPendingReason("");
      if (isSelfRequest) {
        globalToast("success", `${status} requested — pending lead approval`);
        const mgr = getManagerEmail(email);
        if (mgr) await logAttendanceEvent("attendance_request_submitted", mgr, { qa_email: email, date: dateStr, status, request_note: note });
      }
    } catch(e) { globalToast("error", safeError(e)); }
  };

  // ── approveAtt ────────────────────────────────────────────────────────────
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
      globalToast("success", `Approved ${existing.status} for ${_nameFromEmail(email)}`);
      await logAttendanceEvent("attendance_request_approved", email.toLowerCase(), { date: dateStr, status: existing.status });
    } catch(e) { globalToast("error", safeError(e)); }
  };

  // ── denyAtt ───────────────────────────────────────────────────────────────
  const denyAtt = async (email, dayNum, reason) => {
    if (monthIsLocked) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
    const existing = getAtt(email, dayNum);
    if (!existing) return;
    const dateStr = `${selMonth}-${String(dayNum).padStart(2,"0")}`;
    try {
      const body = { approval_status: "denied", denied_by: myEmail, denied_at: new Date().toISOString(), denial_reason: reason || null, updated_at: new Date().toISOString() };
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
      globalToast("success", `Denied ${existing.status} for ${_nameFromEmail(email)}`);
      await logAttendanceEvent("attendance_request_denied", email.toLowerCase(), { date: dateStr, status: existing.status, denial_reason: reason || null });
    } catch(e) { globalToast("error", safeError(e)); }
  };

  // ── bulkApprove ───────────────────────────────────────────────────────────
  const bulkApprove = (rows) => {
    confirmAsk(
      `Approve ${rows.length} request${rows.length > 1 ? "s" : ""}?`,
      `This will approve ${rows.length} pending attendance request${rows.length > 1 ? "s" : ""} from your team.`,
      async () => {
        try {
          const ids = rows.map(r => r.id).filter(id => id && !String(id).startsWith("new"));
          if (ids.length > 0) {
            const body = { approval_status: "approved", approved_by: myEmail, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            await sb.query("qa_attendance", { token, method: "PATCH", body, filters: `id=in.(${ids.join(",")})` });
          }
          setAttendance(prev => prev.map(a => rows.find(r => r.id === a.id) ? { ...a, approval_status: "approved", approved_by: myEmail } : a));
          globalToast("success", `Approved ${rows.length} request${rows.length > 1 ? "s" : ""}`);
          for (const r of rows) {
            await logAttendanceEvent("attendance_request_approved", r.email?.toLowerCase(), { date: r.date, status: r.status });
          }
        } catch(e) { globalToast("error", safeError(e)); }
      },
      "Approve all",
      "var(--green)"
    );
  };

  // ── bulkDeny ──────────────────────────────────────────────────────────────
  const bulkDeny = (rows, reason) => {
    confirmAsk(
      `Deny ${rows.length} request${rows.length > 1 ? "s" : ""}?`,
      `This will deny ${rows.length} pending attendance request${rows.length > 1 ? "s" : ""} from your team.`,
      async () => {
        try {
          const ids = rows.map(r => r.id).filter(id => id && !String(id).startsWith("new"));
          if (ids.length > 0) {
            const body = { approval_status: "denied", denied_by: myEmail, denied_at: new Date().toISOString(), denial_reason: reason || null, updated_at: new Date().toISOString() };
            await sb.query("qa_attendance", { token, method: "PATCH", body, filters: `id=in.(${ids.join(",")})` });
          }
          setAttendance(prev => prev.map(a => rows.find(r => r.id === a.id) ? { ...a, approval_status: "denied", denied_by: myEmail, denial_reason: reason || null } : a));
          globalToast("success", `Denied ${rows.length} request${rows.length > 1 ? "s" : ""}`);
          for (const r of rows) {
            await logAttendanceEvent("attendance_request_denied", r.email?.toLowerCase(), { date: r.date, status: r.status, denial_reason: reason || null });
          }
        } catch(e) { globalToast("error", safeError(e)); }
      },
      "Deny all",
      "var(--red)"
    );
  };

  // ── OT request ────────────────────────────────────────────────────────────
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
    const hours = Math.max(0, parseFloat(otHoursPerDay) || 0);
    if (hours <= 0) { globalToast("error", "Hours per day must be greater than 0"); return; }
    const rows = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      rows.push({ email: targetEmail, date: dateStr, status: "OT", approval_status, requested_by, approved_by, approved_at, ot_hours: hours, notes: otNote || null, created_by: myEmail });
    }
    if (rows.length === 0) { globalToast("error", "No days in range"); return; }
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
        method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${token}`, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const totalHours = hours * rows.length;
      globalToast("success", isSelf ? `OT requested: ${totalHours}h across ${rows.length} day${rows.length>1?"s":""} — pending lead approval` : `OT logged: ${totalHours}h across ${rows.length} day${rows.length>1?"s":""}`);
      if (isSelf) {
        const mgr = getManagerEmail(targetEmail);
        if (mgr) await logAttendanceEvent("attendance_request_submitted", mgr, { qa_email: targetEmail, date: otFrom, status: "OT", request_note: otNote });
      }
      setOtModal(false); setOtFrom(""); setOtTo(""); setOtNote(""); setOtTarget(""); setOtHoursPerDay(2);
      loadData();
    } catch (e) { globalToast("error", safeError(e)); }
  };

  // ── Lock / unlock ─────────────────────────────────────────────────────────
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

  // ── Bulk set ──────────────────────────────────────────────────────────────
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
      const dow = d.getDay();
      if (bulkDayFilter === "weekdays" && (dow === 5 || dow === 6)) continue;
      if (bulkDayFilter === "weekends" && dow !== 5 && dow !== 6) continue;
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      for (const em of targets) rows.push({email: em, date: dateStr, status: bulkStatus, created_by: myEmail});
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

  // ── CSV helpers ───────────────────────────────────────────────────────────
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
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `attendance_${selMonth}.csv`; a.click();
  };

  const parseCsvUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { globalToast("error", "CSV has no data rows"); return; }
      const headers = lines[0].split(",");
      const dayHeaders = headers.slice(1);
      const dayNums = dayHeaders.map(h => parseInt(h.split("_").pop()));
      const preview = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const email = cols[0]?.trim().toLowerCase();
        if (!email || !email.includes("@")) continue;
        const entries = [];
        for (let j = 0; j < dayNums.length; j++) {
          const val = cols[j + 1]?.trim().toUpperCase();
          if (val && ATTENDANCE_TYPES.some(t => t.code === val)) entries.push({ day: dayNums[j], status: val });
        }
        if (entries.length > 0) preview.push({ email, entries });
      }
      setCsvPreview(preview);
    };
    reader.readAsText(file);
  };

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
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
          method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${token}`, "Prefer": "resolution=merge-duplicates,return=minimal" },
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

  // ── Counters ──────────────────────────────────────────────────────────────
  const isCounted = (a) => !a.approval_status || a.approval_status === "approved";
  const countByStatus = (email) => {
    const qa = attendance.filter(a => a.email?.toLowerCase() === email?.toLowerCase() && isCounted(a));
    const counts = {};
    qa.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
    return counts;
  };
  const trackerFor = (email) => {
    const rows = attendance.filter(a => a.email?.toLowerCase() === email?.toLowerCase() && isCounted(a));
    const otHours = rows.filter(a => a.status === "OT").reduce((s, a) => s + (parseFloat(a.ot_hours) || 0), 0);
    const phDays = rows.filter(a => a.status === "PH").length;
    return { otHours, phDays };
  };

  // ── My-month counts (for QA panel) ────────────────────────────────────────
  const myMonthCounts = (() => {
    const myAtt = attendance.filter(a => a.email?.toLowerCase() === myEmail);
    const approved = myAtt.filter(a => !a.approval_status || a.approval_status === "approved");
    const pending = myAtt.filter(a => a.approval_status === "pending");
    const count = (arr, ...codes) => arr.filter(a => codes.includes(a.status)).length;
    return {
      p: count(approved, "P"),
      h: count(approved, "H"),
      ph: count(approved, "PH"),
      cdo: count(approved, "CDO"),
      al: count(approved, "AL"),
      tabbyDay: count(approved, "Tabby Day"),
      otApproved: approved.filter(a => a.status === "OT").reduce((s, a) => s + (parseFloat(a.ot_hours) || 0), 0),
      otPending: pending.filter(a => a.status === "OT").reduce((s, a) => s + (parseFloat(a.ot_hours) || 0), 0),
      pendingCount: pending.length,
    };
  })();

  // Manager email for the QA's "Routes to" chip
  const myManagerEmail = roster.find(r => r.email?.toLowerCase() === myEmail)?.manager_email || null;
  const myManagerName = myManagerEmail ? _nameFromEmail(myManagerEmail) : null;

  // Pending count scoped to team (for the chip)
  const myTeamPendingCount = (() => {
    if (!isQA) return 0;
    return attendance.filter(a => a.email?.toLowerCase() === myEmail && a.approval_status === "pending").length;
  })();

  if (loading) return <div className="page"><SkeletonPage/></div>;

  const TABS = [
    { key: "calendar", label: "Calendar", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { key: "pending",  label: "Pending",  icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", badge: isLead ? attendance.filter(a => {
      const mgr = roster.find(r => r.email?.toLowerCase() === a.email?.toLowerCase())?.manager_email?.toLowerCase();
      return a.approval_status === "pending" && mgr === myEmail;
    }).length : 0 },
    { key: "balances", label: "Balances", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    ...(isQA ? [] : [{ key: "summary",  label: "Monthly summary", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }]),
  ];

  return (
    <div className="page">
      {confirmEl}

      {/* ── Page header ── */}
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Schedule & Attendance</div>
          <div className="page-subtitle">{visibleQAs.length} team members — {new Date(year, month-1).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {/* Month picker — always visible */}
          <input type="month" className="form-input" style={{width:160,fontSize:12}} value={selMonth} onChange={e=>setSelMonth(e.target.value)}/>

          {/* Calendar-only controls */}
          {activeTab === "calendar" && <>
            <div style={{display:"flex",gap:2}}>
              <button className="btn btn-outline btn-sm" style={{padding:"6px 8px",opacity:undoStack.length>0?1:0.3}} disabled={undoStack.length===0} onClick={()=>{const e=new KeyboardEvent("keydown",{key:"z",ctrlKey:true});document.dispatchEvent(e);}} title="Undo (Ctrl+Z)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 10h10a5 5 0 015 5v2"/><path d="M3 10l4-4M3 10l4 4"/></svg>
              </button>
              <button className="btn btn-outline btn-sm" style={{padding:"6px 8px",opacity:redoStack.length>0?1:0.3}} disabled={redoStack.length===0} onClick={()=>{const e=new KeyboardEvent("keydown",{key:"y",ctrlKey:true});document.dispatchEvent(e);}} title="Redo (Ctrl+Y)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 10H11a5 5 0 00-5 5v2"/><path d="M21 10l-4-4M21 10l-4 4"/></svg>
              </button>
            </div>
            {isLead&&<button className="btn btn-outline btn-sm" style={{fontSize:11,color:monthLock?"var(--amber)":"var(--tx2)",borderColor:monthLock?"var(--amber)":"var(--bd)"}} onClick={toggleLock} title={monthLock?`Locked by ${_nameFromEmail(monthLock.locked_by)}`:"Lock this month"}>
              {monthLock ? "🔓 Unlock" : "🔒 Lock month"}
            </button>}
            {isLead&&<button className="btn btn-primary btn-sm" disabled={monthIsLocked} style={{opacity:monthIsLocked?0.5:1}} onClick={()=>{if(monthIsLocked){globalToast("error","Month is locked.");return;}setBulkModal(true);setBulkFrom(`${selMonth}-01`);setBulkTo(`${selMonth}-${String(daysInMonth).padStart(2,"0")}`);setBulkStatus("P");setBulkDayFilter("all");}}>
              <Icon d={icons.plus} size={14}/>Bulk set
            </button>}
            <button className="btn btn-outline btn-sm" disabled={monthIsLocked} style={{opacity:monthIsLocked?0.5:1,fontSize:11,color:"#0D9488",borderColor:"#0D9488"}} onClick={()=>{if(monthIsLocked){globalToast("error","Month is locked.");return;}const todayStr=new Date().toISOString().split("T")[0];setOtModal(true);setOtFrom(todayStr);setOtTo(todayStr);setOtTarget(isQA?myEmail:"");setOtNote("");}}>
              ⏱ {isQA ? "Request OT" : "Add OT"}
            </button>
            {isLead&&<button className="btn btn-outline btn-sm" onClick={downloadCsvTemplate} style={{fontSize:11}}><Icon d={icons.upload} size={13}/>Download CSV</button>}
            {isLead&&<button className="btn btn-outline btn-sm" onClick={()=>setCsvUpload(true)} style={{fontSize:11}}><Icon d={icons.upload} size={13}/>Upload CSV</button>}
            {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" style={{fontSize:11,color:"var(--red)",borderColor:"var(--red)"}} onClick={()=>{
              const monthLabel=new Date(year,month-1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
              confirmAsk("Delete all attendance?",`Delete ALL attendance data for ${monthLabel}? This cannot be undone.`,async()=>{
                try{
                  const startDate=`${selMonth}-01`;const endDate=`${year}-${String(month+1>12?1:month+1).padStart(2,"0")}-01`;
                  const resp=await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?date=gte.${startDate}&date=lt.${endDate}`,{method:"DELETE",headers:{"apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`}});
                  if(!resp.ok)throw new Error(await resp.text());
                  globalToast("success","All attendance data deleted for this month");loadData();
                }catch(e){globalToast("error",safeError(e));}
              },"Delete all","var(--red)");
            }}><Icon d={icons.trash} size={13}/>Delete month</button>}
          </>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--bd)",marginBottom:16,overflowX:"auto"}}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{
            display:"flex",alignItems:"center",gap:6,padding:"10px 18px",border:"none",
            borderBottom:activeTab===tab.key?"2px solid var(--tabby-purple)":"2px solid transparent",
            background:"transparent",cursor:"pointer",fontSize:13,fontWeight:activeTab===tab.key?700:500,
            color:activeTab===tab.key?"var(--tabby-purple)":"var(--tx2)",
            fontFamily:"var(--font)",whiteSpace:"nowrap",position:"relative",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={tab.icon}/></svg>
            {tab.label}
            {tab.badge > 0 && <span style={{background:"var(--tabby-purple)",color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 5px",marginLeft:2}}>{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── Calendar tab ── */}
      {activeTab === "calendar" && <>
        {/* Lock banner */}
        {monthLock && <div className="card" style={{padding:"10px 14px",marginBottom:12,borderLeft:"3px solid var(--amber)",background:"var(--amber-bg)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:13}}>🔒</span>
          <span style={{fontSize:12,color:"var(--tx)",fontWeight:500}}>
            Locked by <strong>{_nameFromEmail(monthLock.locked_by)}</strong> on {new Date(monthLock.locked_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}.
            {isSuperAdmin ? " Super-admin override active — you can still edit." : " Ask a lead to unlock to edit."}
          </span>
        </div>}

        {/* Routes-to chip (QA only) */}
        {isQA && myManagerName && <div style={{marginBottom:10,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"var(--tx3)",background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:6,padding:"4px 10px",display:"flex",alignItems:"center",gap:5}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.1 2.18 2 2 0 012.1 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            Approvals routed to: <strong>{myManagerName}</strong>
            {myTeamPendingCount > 0 && <span style={{background:"var(--amber)",color:"#fff",borderRadius:8,fontSize:9,fontWeight:700,padding:"1px 5px"}}>⏳ {myTeamPendingCount} pending</span>}
          </span>
        </div>}

        {/* My-month panel (QA only) */}
        {isQA && <div className="card" style={{marginBottom:12,padding:"12px 16px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--tx)",marginBottom:10}}>My month — {new Date(year,month-1).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
            {[["P","Present","var(--green)"],["H","WFH","#3B82F6"],["PH","Pub.Holiday","#8B5CF6"],["CDO","CDO","#14B8A6"],["AL","Annual Leave","var(--red)"],["Tabby Day","Tabby Day","#A855F7"]].map(([key,label,color])=>(
              <div key={key} style={{textAlign:"center",minWidth:54,background:"var(--bg3)",borderRadius:6,padding:"6px 8px"}}>
                <div style={{fontSize:18,fontWeight:800,color}}>{key==="AL"?myMonthCounts.al:key==="P"?myMonthCounts.p:key==="H"?myMonthCounts.h:key==="PH"?myMonthCounts.ph:key==="CDO"?myMonthCounts.cdo:myMonthCounts.tabbyDay}</div>
                <div style={{fontSize:9,color:"var(--tx3)",marginTop:1}}>{label}</div>
              </div>
            ))}
            {(myMonthCounts.otApproved > 0 || myMonthCounts.otPending > 0) && <div style={{textAlign:"center",minWidth:54,background:"var(--bg3)",borderRadius:6,padding:"6px 8px"}}>
              <div style={{fontSize:18,fontWeight:800,color:"#0D9488"}}>{myMonthCounts.otApproved.toFixed(1)}h</div>
              <div style={{fontSize:9,color:"var(--tx3)",marginTop:1}}>OT approved</div>
            </div>}
            {myMonthCounts.otPending > 0 && <div style={{textAlign:"center",minWidth:54,background:"var(--bg3)",borderRadius:6,padding:"6px 8px",border:"1px dashed var(--amber)"}}>
              <div style={{fontSize:18,fontWeight:800,color:"var(--amber)"}}>{myMonthCounts.otPending.toFixed(1)}h</div>
              <div style={{fontSize:9,color:"var(--tx3)",marginTop:1}}>OT pending</div>
            </div>}
          </div>
          {/* AL + Tabby Day balance bars */}
          {(()=>{
            const alUsed = myMonthCounts.al; // approximate from this month only — full year balance shown in Balances tab
            return <div style={{fontSize:11,color:"var(--tx3)"}}>Full-year leave balance available in the <button onClick={()=>setActiveTab("balances")} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tabby-purple)",fontWeight:600,fontSize:11,fontFamily:"var(--font)",padding:0}}>Balances tab</button></div>;
          })()}
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

        {/* Monthly tracker */}
        {(()=>{
          const sortedQAs = [...visibleQAs].sort((a,b)=>(a.email||"").localeCompare(b.email||""));
          const totals = sortedQAs.map(qa => ({ email: qa.email?.toLowerCase(), name: _nameFromEmail(qa.email), ...trackerFor(qa.email?.toLowerCase()) }));
          const teamOt = totals.reduce((s, r) => s + r.otHours, 0);
          const teamPh = totals.reduce((s, r) => s + r.phDays, 0);
          const anyData = totals.some(r => r.otHours > 0 || r.phDays > 0);
          return <div className="card" style={{marginBottom:12,padding:"12px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:anyData?10:0,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>Monthly tracker</span>
                <span style={{fontSize:11,color:"var(--tx3)"}}>Approved OT hours + PH days · {selMonth}</span>
              </div>
              <div style={{display:"flex",gap:14,alignItems:"center",fontSize:11}}>
                <span style={{color:"var(--tx3)"}}>Team total:</span>
                <span style={{color:"#0D9488",fontWeight:700}}>⏱ {teamOt.toFixed(2)}h OT</span>
                <span style={{color:"#8B5CF6",fontWeight:700}}>📅 {teamPh} PH day{teamPh===1?"":"s"}</span>
              </div>
            </div>
            {anyData && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:6}}>
              {totals.filter(r => r.otHours > 0 || r.phDays > 0).map(r => (
                <div key={r.email} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:"var(--bg)",borderRadius:6,fontSize:12}}>
                  <span style={{fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:6}}>{r.name}</span>
                  <span style={{display:"flex",gap:8,fontSize:11}}>
                    {r.otHours > 0 && <span style={{color:"#0D9488",fontWeight:700}}>{r.otHours.toFixed(2)}h</span>}
                    {r.phDays > 0 && <span style={{color:"#8B5CF6",fontWeight:700}}>{r.phDays} PH</span>}
                  </span>
                </div>
              ))}
            </div>}
          </div>;
        })()}

        {/* Selection bulk bar */}
        {isLead&&selectedQAs.size>0&&<div className="card" style={{padding:"10px 16px",marginBottom:12,background:"var(--accent-light)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:600,color:"var(--accent-text)"}}>{selectedQAs.size} QAs selected</span>
          <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={()=>{setBulkScope("selected");setBulkModal(true);}}>Bulk mark attendance</button>
          <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setSelectedQAs(new Set())}>Clear</button>
        </div>}

        {/* Calendar grid */}
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
                <th style={{textAlign:"center",minWidth:30,fontSize:10}}>PH</th>
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
                          {_nameFromEmail(em).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                        </div>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{_nameFromEmail(em)}</span>
                      </div>
                    </td>
                    {days.map(d => {
                      const att = getAtt(em, d.num);
                      const st = att?.status || null;
                      const attType = st ? ATT_MAP[st] : null;
                      const isPending = att?.approval_status === "pending";
                      const isDenied  = att?.approval_status === "denied";
                      const cellKey = `${em}-${d.num}`;
                      const isEditing = editCell === cellKey;
                      const canEdit = (isLead || em === myEmail) && !monthIsLocked;
                      // Determine if this code needs approval (for reason input)
                      const needsApproval = isQA && em === myEmail && st && APPROVAL_CODES.has(st);
                      const cellTitle = isPending
                        ? `${attType?.label || st} — pending lead approval${att?.requested_by?` (by ${_nameFromEmail(att.requested_by)})`:""}${att?.request_note?` · "${att.request_note}"`:"" }`
                        : isDenied
                        ? `${attType?.label || st} — denied by ${_nameFromEmail(att?.denied_by||"")}${att?.denial_reason?` · "${att.denial_reason}"`:"" }`
                        : (attType?.label || "");

                      return (
                        <td key={d.num} style={{textAlign:"center",padding:1,background:d.isWeekend?"rgba(156,163,175,0.05)":"transparent",position:"relative",cursor:canEdit?"pointer":"default"}}
                          onClick={()=>{ if(canEdit){ if(isEditing){setEditCell(null);setPendingReason("");}else{setEditCell(cellKey);setPendingReason("");} } }}
                          title={cellTitle}>
                          {st ? (
                            <span style={{position:"relative",display:"inline-block",minWidth:20,pointerEvents:"none"}}>
                              <span style={{fontSize:9,padding:"2px 3px",borderRadius:3,background:attType?.bg||"var(--bg3)",color:attType?.color||"var(--tx3)",fontWeight:700,display:"inline-block",minWidth:20,opacity:isPending?0.55:isDenied?0.4:1,outline:isPending?`1px dashed ${attType?.color||"var(--tx3)"}`:isDenied?"1px dashed var(--red)":"none"}}>{st}</span>
                              {isPending && <span style={{position:"absolute",top:-4,right:-4,fontSize:8,lineHeight:1,background:"var(--bg3)",border:"1px solid var(--amber)",color:"var(--amber)",borderRadius:6,padding:"1px 2px",fontWeight:700}}>⏳</span>}
                              {isDenied  && <span style={{position:"absolute",top:-4,right:-4,fontSize:8,lineHeight:1,background:"var(--bg3)",border:"1px solid var(--red)",color:"var(--red)",borderRadius:6,padding:"1px 2px",fontWeight:700}}>✗</span>}
                            </span>
                          ) : (
                            <span style={{fontSize:10,color:"var(--bd2)",pointerEvents:"none"}}>·</span>
                          )}
                          {isEditing && (()=>{
                            const isSelfApproval = isQA && em === myEmail;
                            return (
                              <div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:8,padding:6,boxShadow:"var(--shadow-lg)",width:180}} onClick={e=>e.stopPropagation()}>
                                {/* Approve/deny for lead */}
                                {isPending && isLead && em !== myEmail && <>
                                  <button onClick={(e)=>{e.stopPropagation();approveAtt(em,d.num);}} style={{fontSize:9,padding:"4px 6px",borderRadius:4,border:"1px solid var(--green)",cursor:"pointer",background:"var(--green-bg)",color:"var(--green)",fontWeight:700,fontFamily:"var(--font)",width:"100%",marginBottom:2}}>✓ Approve {st}</button>
                                  <div style={{fontSize:8,color:"var(--tx3)",width:"100%",padding:"2px 0",textAlign:"center",fontStyle:"italic"}}>Or pick a different code to replace</div>
                                </>}
                                {/* Reason input for self-approval-required codes */}
                                {pickerStage ? (
                                  <div>
                                    <div style={{fontSize:9,color:"var(--tx3)",marginBottom:4,fontWeight:600}}>Reason for {pickerStage.code} <span style={{fontWeight:400}}>(optional)</span></div>
                                    <input
                                      autoFocus
                                      type="text"
                                      placeholder="e.g. Eid holiday, sick"
                                      value={pendingReason}
                                      onChange={e=>setPendingReason(e.target.value)}
                                      onKeyDown={ev=>{if(ev.key==="Enter"){ev.preventDefault();setAtt(em,d.num,pickerStage.code,pendingReason);}if(ev.key==="Escape"){setPickerStage(null);setPendingReason("");}}}
                                      style={{width:"100%",fontSize:10,padding:"4px 6px",borderRadius:4,border:"1px solid var(--bd)",background:"var(--bg)",color:"var(--tx)",fontFamily:"var(--font)",boxSizing:"border-box",marginBottom:4}}
                                    />
                                    <div style={{display:"flex",gap:4}}>
                                      <button onClick={()=>setAtt(em,d.num,pickerStage.code,pendingReason)} style={{flex:1,fontSize:9,padding:"4px 0",borderRadius:4,border:"none",cursor:"pointer",background:"var(--tabby-purple)",color:"#fff",fontWeight:700,fontFamily:"var(--font)"}}>Send for approval</button>
                                      <button onClick={()=>{setPickerStage(null);setPendingReason("");}} style={{fontSize:9,padding:"4px 8px",borderRadius:4,border:"1px solid var(--bd)",cursor:"pointer",background:"var(--bg)",color:"var(--tx2)",fontFamily:"var(--font)"}}>Back</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                                    {PICKER_TYPES.map(t => {
                                      const SK = { P:"p", H:"h", L:"l", AL:"a", "Paid SL":"s", NSNC:"n", EL:"e", UL:"u", ML:"m" }[t.code];
                                      const needsReason = isSelfApproval && APPROVAL_CODES.has(t.code);
                                      return <button key={t.code} onClick={(e)=>{e.stopPropagation();if(needsReason){setPickerStage({code:t.code});setPendingReason("");}else{setAtt(em,d.num,t.code);}}} style={{fontSize:8,padding:"3px 4px",borderRadius:3,border:"none",cursor:"pointer",background:t.bg,color:t.color,fontWeight:700,fontFamily:"var(--font)"}} title={`${t.label}${SK?` (${SK})`:""}`}>{t.code}</button>;
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
                                          await sb.query("qa_attendance",{token,method:"DELETE",filters:`id=eq.${existing.id}`});
                                        }else{
                                          const resp=await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(em)}&date=eq.${dateStr}`,{method:"DELETE",headers:{"apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`}});
                                          if(!resp.ok)throw new Error(await resp.text());
                                        }
                                        setAttendance(prev=>prev.filter(a=>!(a.email?.toLowerCase()===em&&a.date===dateStr)));
                                        setUndoStack(prev=>[...prev.slice(-50),{email:em,date:dateStr,oldStatus,newStatus:null}]);
                                        setRedoStack([]);
                                        setEditCell(null);setPendingReason("");
                                        globalToast("success","Removed");
                                      }catch(err){globalToast("error",safeError(err));}
                                    }} style={{fontSize:8,padding:"3px 4px",borderRadius:3,border:"1px solid var(--red)",cursor:"pointer",background:"var(--red-bg)",color:"var(--red)",fontWeight:700,fontFamily:"var(--font)",width:"100%",marginTop:2}}>✕ Clear</button>}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      );
                    })}
                    <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"var(--green)"}}>{counts["P"]||0}</td>
                    <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"var(--red)"}}>{counts["AL"]||0}</td>
                    <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"#B91C1C"}}>{counts["Paid SL"]||0}</td>
                    <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"#8B5CF6"}}>{counts["PH"]||0}</td>
                    <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"var(--tx3)"}}>{counts["OFF"]||0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <AttendanceCsvUpload open={csvUpload} onClose={() => setCsvUpload(false)} csvFile={csvFile} setCsvFile={setCsvFile} csvPreview={csvPreview} setCsvPreview={setCsvPreview} csvUploading={csvUploading} selMonth={selMonth} parseCsvUpload={parseCsvUpload} executeCsvUpload={executeCsvUpload} downloadCsvTemplate={downloadCsvTemplate}/>
        <AttendanceOtModal open={otModal} onClose={() => setOtModal(false)} isQA={isQA} visibleQAs={visibleQAs} otFrom={otFrom} setOtFrom={setOtFrom} otTo={otTo} setOtTo={setOtTo} otHoursPerDay={otHoursPerDay} setOtHoursPerDay={setOtHoursPerDay} otTarget={otTarget} setOtTarget={setOtTarget} otNote={otNote} setOtNote={setOtNote} applyOtRequest={applyOtRequest}/>
        <AttendanceBulkModal open={bulkModal} onClose={() => setBulkModal(false)} bulkStatus={bulkStatus} setBulkStatus={setBulkStatus} bulkDayFilter={bulkDayFilter} setBulkDayFilter={setBulkDayFilter} bulkFrom={bulkFrom} setBulkFrom={setBulkFrom} bulkTo={bulkTo} setBulkTo={setBulkTo} bulkScope={bulkScope} setBulkScope={setBulkScope} bulkPerson={bulkPerson} setBulkPerson={setBulkPerson} selMonth={selMonth} daysInMonth={daysInMonth} isLead={isLead} profile={profile} selectedQAs={selectedQAs} visibleQAs={visibleQAs} applyBulk={applyBulk}/>
      </>}

      {/* ── Pending tab ── */}
      {activeTab === "pending" && (
        <PendingApprovals
          attendance={attendance}
          roster={roster}
          visibleQAs={visibleQAs}
          profile={profile}
          myEmail={myEmail}
          isLead={isLead}
          selMonth={selMonth}
          approveAtt={approveAtt}
          denyAtt={denyAtt}
          bulkApprove={bulkApprove}
          bulkDeny={bulkDeny}
          onViewOnCalendar={(email, dayNum) => {
            setActiveTab("calendar");
            setEditCell(`${email.toLowerCase()}-${dayNum}`);
          }}
        />
      )}

      {/* ── Balances tab ── */}
      {activeTab === "balances" && (
        <LeaveBalances
          visibleQAs={visibleQAs}
          token={token}
          profile={profile}
          myEmail={myEmail}
          globalToast={globalToast}
        />
      )}

      {/* ── Monthly summary tab (lead+ only) ── */}
      {activeTab === "summary" && !isQA && (
        <MonthlySummary
          visibleQAs={visibleQAs}
          attendance={attendance}
          selMonth={selMonth}
          token={token}
          profile={profile}
        />
      )}
    </div>
  );
}

export default SchedulePage;
