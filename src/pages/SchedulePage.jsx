import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { hasRole } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import { callEdgeFunction } from "../lib/edgeSync.js";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";
import { ATTENDANCE_TYPES, ATT_MAP, APPROVAL_CODES, PICKER_TYPES, LEAVE_CODES, RESOLVED_NO_CHECKIN } from "../lib/attendance.js";
import AttendanceBulkModal from "../components/attendance/AttendanceBulkModal.jsx";
import AttendanceCsvUpload from "../components/attendance/AttendanceCsvUpload.jsx";
import AttendanceOtModal from "../components/attendance/AttendanceOtModal.jsx";
import PendingApprovals from "../components/attendance/PendingApprovals.jsx";
import LeaveBalances from "../components/attendance/LeaveBalances.jsx";
import MonthlySummary from "../components/attendance/MonthlySummary.jsx";
import AttendancePlanGrid from "../components/attendance/AttendancePlanGrid.jsx";
// Calendar/cell subcomponents — extracted from this file 2026-05-08 to
// keep SchedulePage focused on data loading + page layout.
import CellPicker from "../components/schedule/CellPicker.jsx";
import CalendarDayCell from "../components/schedule/CalendarDayCell.jsx";
import MyMonthCalendar from "../components/schedule/MyMonthCalendar.jsx";
import DayCell from "../components/schedule/DayCell.jsx";
import { riyadhTodayStr } from "../lib/attendancePlan.js";

function SchedulePage() {
  const{token,profile,gf,globalToast,realProfile}=useApp();
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
  // Calendar-tab-only: filter by QA Lead. Empty = show all.
  const [selectedLeadFilter, setSelectedLeadFilter] = useUrlState("lead", "");
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
      // 2 parallel chunks of ~15 days each — safely under Supabase's 1000-row cap
      // even for 50 QAs (50 × 15 = 750 rows per chunk).
      const mid = Math.ceil(dim / 2);
      const fmtD = (d) => `${selMonth}-${String(d).padStart(2,"0")}`;
      const hdrs = {"apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`};
      const base = `${SUPABASE_URL}/rest/v1/qa_attendance?select=id,email,date,status,approval_status,requested_by,approved_by,approved_at,ot_hours,request_note,denial_reason,denied_by,denied_at,planned_code,justification,mismatch_approved,plan_updated_at,shift_start,shift_end,checked_in_at`;
      const [r, a1, a2] = await Promise.all([
        listRoster({ token, select: "email,display_name,manager_email,queue,country" }),
        fetch(`${base}&date=gte.${fmtD(1)}&date=lte.${fmtD(mid)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]),
        fetch(`${base}&date=gte.${fmtD(mid+1)}&date=lte.${fmtD(dim)}&order=date.asc&limit=1000`, {headers:hdrs}).then(r=>r.json()).catch(()=>[]),
      ]);
      setRoster(Array.isArray(r) ? r : []);
      const allAtt = [...(Array.isArray(a1)?a1:[]), ...(Array.isArray(a2)?a2:[])];
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
  const attRef = useRef(attendance);
  const selMonthRef = useRef(selMonth);
  const monthIsLockedRef = useRef(monthIsLocked);
  const actionsRef = useRef({});
  useEffect(() => {
    tokenRef.current = token;
    myEmailRef.current = myEmail;
    loadDataRef.current = loadData;
    attRef.current = attendance;
    selMonthRef.current = selMonth;
    monthIsLockedRef.current = monthIsLocked;
    actionsRef.current = {
      getManagerEmail: (qaEmail) => { const r = roster.find(r => r.email?.toLowerCase() === qaEmail?.toLowerCase()); return r?.manager_email?.toLowerCase() || null; },
      logAttendanceEvent,
    };
  });
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
                // Preserve the original checked_in_at so undo doesn't
                // turn a self-checked-in row into a fresh auto-NSNC
                // candidate.
                const undoBody = {email: last.email, date: last.date, status: last.oldStatus, created_by: myEmailRef.current};
                if (last.oldCheckedInAt) undoBody.checked_in_at = last.oldCheckedInAt;
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
                  method: "POST", headers: {"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`, "Prefer": "resolution=merge-duplicates,return=minimal"},
                  body: JSON.stringify(undoBody)
                });
              } else {
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(last.email)}&date=eq.${last.date}`, {
                  method: "DELETE", headers: {"apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`}
                });
              }
              setRedoStack(p => [...p, last]);
              setAttendance(prev => {
                const f = prev.filter(a => !(a.email?.toLowerCase() === last.email && a.date === last.date));
                return last.oldStatus ? [...f, {email:last.email,date:last.date,status:last.oldStatus,id:"undo-"+Date.now()}] : f;
              });
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
                const redoBody = {email: last.email, date: last.date, status: last.newStatus, created_by: myEmailRef.current};
                if (last.newCheckedInAt) redoBody.checked_in_at = last.newCheckedInAt;
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
                  method: "POST", headers: {"Content-Type": "application/json", "apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`, "Prefer": "resolution=merge-duplicates,return=minimal"},
                  body: JSON.stringify(redoBody)
                });
              } else {
                await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(last.email)}&date=eq.${last.date}`, {
                  method: "DELETE", headers: {"apikey": SUPABASE_ANON, "Authorization": `Bearer ${tokenRef.current}`}
                });
              }
              setUndoStack(p => [...p, last]);
              setAttendance(prev => {
                const f = prev.filter(a => !(a.email?.toLowerCase() === last.email && a.date === last.date));
                return last.newStatus ? [...f, {email:last.email,date:last.date,status:last.newStatus,id:"redo-"+Date.now()}] : f;
              });
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

  // Synthesize roster-shaped rows for QA Leads themselves. qa_roster
  // only contains QAs / Sr.QAs (leads aren't synced), but leads now
  // need to mark their own attendance too — so we lift them out of
  // `profiles` and shape them like roster entries the grid expects.
  // `__isLead` is a marker the renderer can use to group / style them
  // at the top of their team without changing the table contract.
  const leadRosterRows = (profiles || [])
    .filter(p => p.role === "qa_lead" && p.email)
    .map(p => {
      const em = p.email;
      const domain = em.toLowerCase().endsWith("@tabby.sa") ? "tabby.sa" : "tabby.ai";
      return {
        email: em,
        manager_email: null,
        queue: null,
        domain,
        role: "qa_lead",
        __isLead: true,
      };
    });

  // Visible QAs — now includes the relevant QA Leads at the top of
  // their team. Sr.QAs are already in qa_roster as QAs of a lead so
  // they fall in via the existing allQAs filter; only QA Leads need
  // to be lifted in from profiles.
  const visibleQAs = (() => {
    const allQAs = roster.filter(r => {
      const mgr = r.manager_email?.toLowerCase();
      return mgr && (qaLeadSet.has(mgr) || qaLeadSet.has(mgr?.split("@")[0]));
    });
    if (isQA) return allQAs.filter(r => r.email?.toLowerCase() === myEmail);
    if (isLead && !hasRole(profile?.role, "qa_supervisor")) {
      const team = allQAs.filter(r => r.manager_email?.toLowerCase() === myEmail);
      const meRow = leadRosterRows.find(r => r.email?.toLowerCase() === myEmail);
      return meRow ? [meRow, ...team] : team;
    }
    // For supervisors / admins viewing the calendar tab, allow narrowing
    // by a specific QA Lead (selectedLeadFilter, set via the dropdown
    // added on the page header). Empty string = show everyone, grouped
    // by lead.
    if (selectedLeadFilter) {
      const sel = selectedLeadFilter.toLowerCase();
      const selLocal = sel.split("@")[0];
      const team = allQAs.filter(r => {
        const mgr = (r.manager_email || "").toLowerCase();
        return mgr === sel || mgr.split("@")[0] === selLocal;
      });
      const leadRow = leadRosterRows.find(r => {
        const em = r.email?.toLowerCase();
        return em === sel || em?.split("@")[0] === selLocal;
      });
      return leadRow ? [leadRow, ...team] : team;
    }
    // No filter: group every lead with their team. Each lead row is
    // emitted before their direct reports so leads appear at the top
    // of each cluster. Any orphan QAs (manager not in qaLeadSet) fall
    // through to the bottom as a "no lead" group.
    const grouped = [];
    const used = new Set();
    const sortedLeads = [...leadRosterRows].sort((a, b) =>
      (a.email || "").localeCompare(b.email || "")
    );
    for (const lead of sortedLeads) {
      const le = lead.email?.toLowerCase();
      grouped.push(lead);
      used.add(le);
      const team = allQAs.filter(r => {
        const mgr = (r.manager_email || "").toLowerCase();
        return mgr === le || (mgr && le && mgr.split("@")[0] === le.split("@")[0]);
      });
      for (const t of team) {
        grouped.push(t);
        used.add(t.email?.toLowerCase());
      }
    }
    for (const q of allQAs) {
      if (!used.has(q.email?.toLowerCase())) grouped.push(q);
    }
    return grouped;
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
    const dateIso = `${year}-${String(month).padStart(2,"0")}-${String(i + 1).padStart(2,"0")}`;
    return { num: i + 1, date: d, dateIso, dayName: d.toLocaleDateString("en-US", {weekday: "short"}), isWeekend: d.getDay() === 5 || d.getDay() === 6 };
  });
  // Riyadh-local YYYY-MM-DD for "today". Computed once per render so
  // every DayCell shares the same reference value (memo comparator
  // checks ===).
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

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
  // Wrapped in useCallback with stable refs so DayCell memoization holds.
  const setAtt = useCallback(async (email, dayNum, status, requestNote) => {
    if (monthIsLockedRef.current) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
    const sm = selMonthRef.current;
    const dateStr = `${sm}-${String(dayNum).padStart(2,"0")}`;
    const existing = attRef.current.find(a => a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr);
    const oldStatus = existing?.status || null;
    const isSelfRequest = isQA && email?.toLowerCase() === myEmail && APPROVAL_CODES.has(status);
    const approval_status = isSelfRequest ? "pending" : null;
    const requested_by = isSelfRequest ? myEmail : null;
    const approved_by = isSelfRequest ? null : myEmail;
    const approved_at = isSelfRequest ? null : new Date().toISOString();
    const note = requestNote || null;
    // Stamp checked_in_at when the QA self-marks their OWN row for
    // TODAY with a real check-in code (P or H). Same behaviour as the
    // dashboard DailyCheckInWidget so the source — dashboard or
    // attendance page — doesn't matter for the auto-NSNC cron + digest.
    // Leads / supervisors editing a QA's row do NOT stamp the timestamp
    // — that would defeat the "the QA never checked in" signal.
    const todayIso = riyadhTodayStr();
    const isOwnTodayCheckIn =
      email?.toLowerCase() === myEmail &&
      dateStr === todayIso &&
      (status === "P" || status === "H");
    const checkedInAt = isOwnTodayCheckIn ? new Date().toISOString() : undefined;
    try {
      if (existing) {
        if (status === existing.status && (existing.approval_status || null) === approval_status) { setEditCell(null); setPendingReason(""); return; }
        const body = { status, approval_status, requested_by, approved_by, approved_at, request_note: note, updated_at: new Date().toISOString() };
        if (checkedInAt) body.checked_in_at = checkedInAt;
        // Optimistic-row IDs from a prior insert use a "new-" timestamp
        // placeholder which Postgres rejects as an invalid UUID. Same
        // fallback pattern as approveAtt / denyAtt / clearAtt: filter
        // by (email, date) instead of id when we don't have a real UUID.
        if (existing.id && !String(existing.id).startsWith("new")) {
          await sb.query("qa_attendance", { token, method: "PATCH", body, filters: `id=eq.${existing.id}` });
        } else {
          const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(email.toLowerCase())}&date=eq.${dateStr}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          });
          if (!resp.ok) throw new Error(await resp.text());
        }
      } else {
        const insertBody = { email:email.toLowerCase(), date:dateStr, status, approval_status, requested_by, approved_by, approved_at, request_note: note, created_by:myEmail };
        if (checkedInAt) insertBody.checked_in_at = checkedInAt;
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
          method:"POST", headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`,"Prefer":"resolution=merge-duplicates,return=minimal"},
          body:JSON.stringify(insertBody)
        });
        if (!resp.ok) throw new Error(await resp.text());
      }
      // Capture checked_in_at alongside status so Undo / Redo can
       // restore the timestamp. Without it, undoing a self-check-in
       // re-inserted the old status but wiped checked_in_at, which
       // then made the row a fresh auto-NSNC candidate at shift_end+1h.
      setUndoStack(prev => [...prev.slice(-50), {email: email.toLowerCase(), date: dateStr, oldStatus, oldCheckedInAt: existing?.checked_in_at || null, newStatus: status, newCheckedInAt: checkedInAt || null}]);
      setRedoStack([]);
      setAttendance(prev => {
        const filtered = prev.filter(a => !(a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr));
        return [...filtered, {email:email.toLowerCase(), date:dateStr, status, approval_status, requested_by, approved_by, approved_at, request_note: note, id:existing?.id||"new-"+Date.now(), created_by:myEmail}];
      });
      setEditCell(null);
      setPendingReason("");
      if (isSelfRequest) {
        globalToast("success", `${status} requested — pending lead approval`);
        const mgr = actionsRef.current.getManagerEmail(email);
        if (mgr) await actionsRef.current.logAttendanceEvent("attendance_request_submitted", mgr, { qa_email: email, date: dateStr, status, request_note: note });
      }
    } catch(e) { globalToast("error", safeError(e)); }
  }, [token, isQA, myEmail, globalToast]);

  // ── approveAtt ────────────────────────────────────────────────────────────
  const approveAtt = useCallback(async (email, dayNum) => {
    if (monthIsLockedRef.current) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
    const sm = selMonthRef.current;
    const dateStr = `${sm}-${String(dayNum).padStart(2,"0")}`;
    const existing = attRef.current.find(a => a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr);
    if (!existing) return;
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
      await actionsRef.current.logAttendanceEvent("attendance_request_approved", email.toLowerCase(), { date: dateStr, status: existing.status });
    } catch(e) { globalToast("error", safeError(e)); }
  }, [token, myEmail, globalToast]);

  // ── denyAtt ───────────────────────────────────────────────────────────────
  const denyAtt = useCallback(async (email, dayNum, reason) => {
    if (monthIsLockedRef.current) { globalToast("error", "Month is locked. Ask a lead to unlock first."); return; }
    const sm = selMonthRef.current;
    const dateStr = `${sm}-${String(dayNum).padStart(2,"0")}`;
    const existing = attRef.current.find(a => a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr);
    if (!existing) return;
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
      globalToast("success", `Denied ${existing.status} for ${nameFromEmail(email)}`);
      await actionsRef.current.logAttendanceEvent("attendance_request_denied", email.toLowerCase(), { date: dateStr, status: existing.status, denial_reason: reason || null });
    } catch(e) { globalToast("error", safeError(e)); }
  }, [token, myEmail, globalToast]);

  // ── clearAtt (remove a cell's attendance record) ──────────────────────────
  const clearAtt = useCallback(async (email, dayNum) => {
    const sm = selMonthRef.current;
    const dateStr = `${sm}-${String(dayNum).padStart(2,"0")}`;
    const existing = attRef.current.find(a => a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr);
    if (!existing) { setEditCell(null); return; }
    const oldStatus = existing.status || null;
    try {
      if (existing.id && !String(existing.id).startsWith("new")) {
        await sb.query("qa_attendance", {token, method:"DELETE", filters:`id=eq.${existing.id}`});
      } else {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?email=eq.${encodeURIComponent(email)}&date=eq.${dateStr}`, {method:"DELETE", headers:{"apikey":SUPABASE_ANON,"Authorization":`Bearer ${token}`}});
        if (!resp.ok) throw new Error(await resp.text());
      }
      setAttendance(prev => prev.filter(a => !(a.email?.toLowerCase() === email?.toLowerCase() && a.date === dateStr)));
      setUndoStack(prev => [...prev.slice(-50), {email: email.toLowerCase(), date: dateStr, oldStatus, newStatus: null}]);
      setRedoStack([]);
      setEditCell(null); setPendingReason("");
      globalToast("success", "Removed");
    } catch(err) { globalToast("error", safeError(err)); }
  }, [token, globalToast]);

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
  // Per-QA monthly tally. Special-cased so that the P (Office) and H
  // (Home) buckets only count rows where the QA themselves checked
  // in — i.e. the row was created by the QA, not pre-filled by the
  // lead from the plan. created_by is set to the QA's own email when
  // they hit the Home/Office buttons in DailyCheckInWidget; lead-
  // initiated rows have created_by = the lead's email. Other status
  // types (AL / Paid SL / PH / OFF) are admin-set and have no
  // self-check-in concept, so they count as-is.
  const countByStatus = (email) => {
    const lower = email?.toLowerCase();
    const qa = attendance.filter(a => a.email?.toLowerCase() === lower && isCounted(a));
    const counts = {};
    qa.forEach(a => {
      const isAttended = a.status === "P" || a.status === "H";
      if (isAttended) {
        const isSelfCheckIn = (a.created_by || "").toLowerCase() === lower;
        if (!isSelfCheckIn) return; // skip plan-only rows for P/H
      }
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
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
      // Scope badge to the currently selected month so switching from
      // May → April doesn't leave May's pending count hanging on the
      // tab. attendance.date is YYYY-MM-DD; selMonth is YYYY-MM.
      if (selMonth && a.date && !a.date.startsWith(selMonth)) return false;
      const mgr = roster.find(r => r.email?.toLowerCase() === a.email?.toLowerCase())?.manager_email?.toLowerCase();
      return a.approval_status === "pending" && mgr === myEmail;
    }).length : 0 },
    { key: "balances", label: "Balances", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    ...(isQA ? [] : [{ key: "summary",  label: "Monthly summary", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }]),
    // Plan editor — leads and above only
    ...(isLead ? [{ key: "plan", label: "Attendance Plan", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2H7a2 2 0 00-2 2v2m4-7h6" }] : []),
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

          {/* Manual digest trigger — admin/sv/manager only. Same idempotency
              guard as the daily 11:00 UTC cron, so spamming this is safe. */}
          {(hasRole(profile?.role,"admin")||hasRole(profile?.role,"qa_supervisor")||profile?.role==="manager") && (
            <button
              className="btn btn-outline btn-sm"
              style={{fontSize:11}}
              onClick={async()=>{
                const r = await callEdgeFunction("attendance-digest", { token, headers: { "X-Trigger": "manual" } });
                const data = r.data || {};
                if(r.ok && data.success){
                  globalToast("success",`Attendance digest sent — ${data.overall?.planned||0} planned, ${data.overall?.accuracy||0}% match`);
                }else if(data.skipped){
                  globalToast("success", data.reason || "No planned QAs today");
                }else{
                  globalToast("error", r.error || "Send failed");
                }
              }}
              title="Send the attendance digest now (also runs automatically at 2 PM Riyadh)"
            >
              📊 Send attendance digest
            </button>
          )}

          {/* QA Lead filter — calendar tab, supervisors / admins only.
              QAs and individual leads see only their own scope so the
              filter would do nothing for them. */}
          {activeTab === "calendar" && hasRole(profile?.role, "qa_supervisor") && (() => {
            // Build the lead options from the current roster's manager_email
            // values intersected with the qa_lead profile set.
            const leadEmails = [...new Set(
              roster.map(r => r.manager_email?.toLowerCase()).filter(Boolean).filter(em => qaLeadSet.has(em) || qaLeadSet.has(em.split("@")[0])),
            )].sort();
            return (
              <select
                value={selectedLeadFilter}
                onChange={(e) => setSelectedLeadFilter(e.target.value)}
                className="form-input"
                style={{ width: 180, fontSize: 12 }}
                title="Filter the calendar grid by QA Lead"
              >
                <option value="">All QA Leads ({leadEmails.length})</option>
                {leadEmails.map(em => (
                  <option key={em} value={em}>{_nameFromEmail(em)}</option>
                ))}
              </select>
            );
          })()}

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
            <button className="btn btn-outline btn-sm" disabled={monthIsLocked} style={{opacity:monthIsLocked?0.5:1,fontSize:11,color:"#0D9488",borderColor:"#0D9488"}} onClick={()=>{if(monthIsLocked){globalToast("error","Month is locked.");return;}const todayStr=riyadhTodayStr();setOtModal(true);setOtFrom(todayStr);setOtTo(todayStr);setOtTarget(isQA?myEmail:"");setOtNote("");}}>
              ⏱ {isQA ? "Request OT" : "Add OT"}
            </button>
            {isLead&&<button className="btn btn-outline btn-sm" onClick={downloadCsvTemplate} style={{fontSize:11}}><Icon d={icons.upload} size={13}/>Download CSV</button>}
            {isLead&&<button className="btn btn-outline btn-sm" onClick={()=>setCsvUpload(true)} style={{fontSize:11}}><Icon d={icons.upload} size={13}/>Upload CSV</button>}
            {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" style={{fontSize:11,color:"var(--red)",borderColor:"var(--red)"}} onClick={()=>{
              const monthLabel=new Date(year,month-1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
              confirmAsk("Delete all attendance?",`Delete ALL attendance data for ${monthLabel}? This cannot be undone.`,async()=>{
                try{
                  // Roll the year too when month=12 — the previous form
                  // (`month+1>12 ? 1 : month+1`) wrapped the month back
                  // to 01 but kept the same year, deleting January of
                  // the SAME year instead of January of the next year.
                  const nextMonth = month >= 12 ? 1 : month + 1;
                  const nextYear = month >= 12 ? year + 1 : year;
                  const startDate=`${selMonth}-01`;const endDate=`${nextYear}-${String(nextMonth).padStart(2,"0")}-01`;
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

        {/* ── PREVIEW (super_admin only): "This week" strip + Today's huddle ──
            Gated on the REAL profile's role, not the effective one, so the
            preview survives a "View as" impersonation — Hossam can switch
            into any QA Lead and still see how their team's huddle renders.
            Remove the gate entirely once approved. */}
        {(realProfile?.role === "super_admin" || isSuperAdmin) && (() => {
          const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
          const todayIso = riyadhTodayStr();
          // ── Today's huddle data (only meaningful if there's a team) ──
          const teamEmails = (visibleQAs || []).map(r => r.email?.toLowerCase()).filter(Boolean);
          const todayTeam = (attendance || [])
            .filter(a => a.date === todayIso && teamEmails.includes(a.email?.toLowerCase()))
            .map(a => ({ ...a, name: _nameFromEmail(a.email) }));
          const checkedIn = todayTeam.filter(r => r.checked_in_at);
          const notYet = todayTeam.filter(r => r.planned_code === "P" && !r.checked_in_at && r.status !== "NSNC" && !LEAVE_CODES.has(r.status));
          const nsnc = todayTeam.filter(r => r.status === "NSNC");
          const onLeave = todayTeam.filter(r => LEAVE_CODES.has(r.status));
          // ── Status colour resolver ──
          const stColor = (st, pc, ci) => {
            if (st === "NSNC") return "var(--red)";
            if (LEAVE_CODES.has(st)) return "var(--blue)";
            if (ci) return "var(--green)";
            if (pc === "P" && !ci) return "var(--amber)";
            return "var(--tx3)";
          };
          return (
            <>
              {/* "This week — my view" strip was removed in favour of the
                  collapsible-week-first layout now baked into MyMonthCalendar
                  (enhanced={true}). The strip duplicated information that
                  the integrated monthly view now shows in one place. */}

              {/* ── Today's huddle (lead view) — only when there's a team ── */}
              {todayTeam.length > 0 && (
                <div className="card" style={{ marginBottom: 14, padding: "18px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Today's huddle — {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
                    <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 999, background: "rgba(201,160,255,.18)", color: "#C9A0FF", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px" }}>preview · super admin only</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--tx3)", marginBottom: 14 }}>Snapshot of the visible team. NSNC + not-yet first.</div>
                  {/* Stats banner */}
                  <div style={{ display: "flex", gap: 14, marginBottom: 14, padding: "12px 16px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", flexWrap: "wrap" }}>
                    {[
                      ["Checked in", checkedIn.length, "var(--green)"],
                      ["Not yet",    notYet.length,    "var(--amber)"],
                      ["NSNC",       nsnc.length,      "var(--red)"],
                      ["On leave",   onLeave.length,   "var(--blue)"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ minWidth: 100 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                        <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Sorted team rows — NSNC, then not-yet, then present, then leave */}
                  {[...nsnc, ...notYet, ...checkedIn, ...onLeave].slice(0, 8).map(r => {
                    const color = stColor(r.status, r.planned_code, r.checked_in_at);
                    const stateLabel = r.status === "NSNC" ? "✕ NSNC"
                                    : LEAVE_CODES.has(r.status) ? `🌴 ${r.status}`
                                    : r.checked_in_at ? "✓ Present"
                                    : r.planned_code === "P" ? "⏳ Not yet"
                                    : "—";
                    const timeStr = r.checked_in_at ? fmtTime(r.checked_in_at)
                                    : r.status === "NSNC" ? "auto"
                                    : r.planned_code === "P" && !r.checked_in_at ? "pending"
                                    : "—";
                    const rowBg = r.status === "NSNC" ? "rgba(255,107,107,.08)"
                                : r.planned_code === "P" && !r.checked_in_at && !RESOLVED_NO_CHECKIN.has(r.status) ? "rgba(255,177,59,.06)"
                                : "rgba(255,255,255,.025)";
                    const rowShadow = r.status === "NSNC" ? "inset 0 0 0 1px rgba(255,107,107,.18)" : "none";
                    return (
                      <div key={r.email} style={{
                        display: "grid", gridTemplateColumns: "32px 1fr 130px 110px 90px",
                        gap: 12, alignItems: "center",
                        padding: "10px 12px", borderRadius: 10,
                        background: rowBg, boxShadow: rowShadow,
                        fontSize: 12.5, marginBottom: 6,
                      }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#6A2C79,#C9A0FF)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>
                          {r.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <strong>{r.name}</strong>
                          <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>plan · {r.planned_code || "—"}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--tx3)" }}>
                          {r.shift_start && r.shift_end ? `window ${r.shift_start.slice(0, 5)}–${r.shift_end.slice(0, 5)}` : "no shift set"}
                        </div>
                        <div style={{ fontWeight: 700, color }}>{stateLabel}</div>
                        <div style={{ fontSize: 11, color: "var(--tx3)", fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
                      </div>
                    );
                  })}
                  {todayTeam.length > 8 && (
                    <div style={{ textAlign: "center", fontSize: 11, color: "var(--tx3)", padding: 6 }}>
                      + {todayTeam.length - 8} more — scroll the team calendar below
                    </div>
                  )}
                </div>
              )}

              {/* ── Compact full-month grid (qa_lead+ only) ──
                  Same vocabulary as the QA week-first view: plan badge,
                  status, check-in time per cell. 31 cols, sticky-left
                  QA name, today's column outlined. Built for leads who
                  need the broader picture in one shot. */}
              {hasRole(profile?.role, "qa_lead") && visibleQAs.length > 0 && (() => {
                const [yyyy, mm] = selMonth.split("-").map(Number);
                const daysInMonth = new Date(yyyy, mm, 0).getDate();
                const dowLetters = ["S","M","T","W","T","F","S"];
                const today = new Date();
                const days = Array.from({ length: daysInMonth }, (_, i) => {
                  const dnum = i + 1;
                  const dt = new Date(yyyy, mm - 1, dnum);
                  const dow = dt.getDay();
                  const iso = `${selMonth}-${String(dnum).padStart(2, "0")}`;
                  return {
                    dnum,
                    dow,
                    dowLetter: dowLetters[dow],
                    isWeekend: dow === 5 || dow === 6,
                    isToday: dt.toDateString() === today.toDateString(),
                    iso,
                  };
                });
                // Aggregate stats for the strip across visible team
                const teamEmailsLower = visibleQAs.map(r => r.email?.toLowerCase()).filter(Boolean);
                const monthRows = (attendance || []).filter(a => teamEmailsLower.includes((a.email || "").toLowerCase()));
                // Per-QA stats — used to render an adherence badge next to
                // each row's name. Keyed by lower-cased email.
                const perQaStats = new Map();
                for (const qa of visibleQAs) {
                  perQaStats.set(qa.email.toLowerCase(), { eligible: 0, adhered: 0, nsnc: 0 });
                }
                let pCount = 0, nsncCount = 0, alCount = 0, plannedP = 0, pendingTodayCount = 0;
                // Adherence is now strictly a P-vs-H planning question.
                // Eligible = rows where BOTH plan and status are in (P, H).
                // Adhered = subset where plan === status.
                // Approved-leave statuses (AL/SL/PH) and NSNC are excluded
                // from adherence — they're tracked separately. This is what
                // the user asked for: "If planned P and added H it counts
                // down, but planned P and AL/whatever shouldn't affect
                // adherence."
                let eligibleDays = 0;
                let adheredCount = 0;
                const isPH = (v) => v === "P" || v === "H";
                for (const r of monthRows) {
                  const k = (r.email || "").toLowerCase();
                  const s = perQaStats.get(k);
                  if (s) {
                    if (isPH(r.planned_code) && isPH(r.status)) {
                      s.eligible++;
                      if (r.planned_code === r.status) s.adhered++;
                    }
                    if (r.status === "NSNC") s.nsnc++;
                  }
                  if (r.status === "P") pCount++;
                  if (r.status === "NSNC") nsncCount++;
                  if (LEAVE_CODES.has(r.status)) alCount++;
                  if (r.planned_code === "P") plannedP++;
                  if (isPH(r.planned_code) && isPH(r.status)) {
                    eligibleDays++;
                    if (r.planned_code === r.status) adheredCount++;
                  }
                  if (r.date === todayIso && r.planned_code === "P" && !r.checked_in_at && r.status !== "NSNC" && !LEAVE_CODES.has(r.status)) pendingTodayCount++;
                }
                const adherence = eligibleDays > 0 ? `${((adheredCount / eligibleDays) * 100).toFixed(1)}%` : "—";
                // Cell variant + content resolver.
                // Rule: only render a status badge (statText) when the row
                // has a REAL outcome — checked-in, a mismatch with the
                // plan, or a definitive non-P/H code. Otherwise leave
                // statText empty so the plan badge in the corner is the
                // only thing showing. Keeps the cell from echoing the
                // plan-default 'P' before the QA has actually marked
                // themselves.
                const cellDesc = (qaLower, d) => {
                  const row = monthRows.find(a => (a.email || "").toLowerCase() === qaLower && a.date === d.iso);
                  const plan = row?.planned_code;
                  const status = row?.status;
                  const ci = row?.checked_in_at;
                  let variant = "future";
                  let statText = "";
                  let timeText = "";
                  if (!row || (!plan && !status)) {
                    variant = "off";
                  } else if (status === "NSNC") {
                    variant = "nsnc"; statText = "NSNC"; timeText = "auto";
                  } else if (LEAVE_CODES.has(status)) {
                    variant = "al"; statText = status; timeText = ci ? fmtTime(ci) : "lead";
                  } else if (ci) {
                    // QA self-checked-in. Show their actual status in the middle.
                    variant = status === "H" ? "h" : "p";
                    statText = status || "P";
                    timeText = fmtTime(ci);
                  } else if (plan && status && plan !== status) {
                    // Mismatch (e.g. planned P, actual H by lead override).
                    // Worth surfacing — keep the status badge visible.
                    variant = status === "H" ? "h" : status === "P" ? "p" : "off";
                    statText = status;
                  } else if (plan === "H") {
                    // Planned holiday, no actual outcome yet — plan badge tells the story.
                    variant = "h";
                  } else if (plan === "P" && d.iso === todayIso) {
                    // Today's planned-P, not yet checked in. Show the
                    // ACTUAL check-in window (shift_start through
                    // shift_end + 1h grace, matching the auto-NSNC cutoff).
                    variant = "pending";
                    const s = row?.shift_start; const e = row?.shift_end;
                    const toMM = (t) => (typeof t === "string" ? t.slice(0, 5) : "");
                    const plusGrace = (t) => {
                      // shift_end + 1h grace, rolling over past
                      // midnight (e.g. 23:30 → 00:30). Was previously
                      // clamped at 23:00 — silently shortened the
                      // window for anyone on a late shift.
                      if (typeof t !== "string") return "";
                      const [h, m] = t.split(":").map(Number);
                      const minutes = ((h || 0) + 1) * 60 + (m || 0);
                      const hh = Math.floor(minutes / 60) % 24;
                      return `${String(hh).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
                    };
                    timeText = (s && e) ? `${toMM(s)}–${plusGrace(e)}` : "09:00–19:00";
                  } else if (plan === "P" && d.iso > todayIso) {
                    variant = "future";
                  } else if (plan === "P" && d.iso < todayIso) {
                    // Past planned-P with default-P status, no check-in.
                    // Plan badge is enough — keep statText empty.
                    variant = "p";
                  } else {
                    variant = "off";
                  }
                  return { variant, statText, timeText, plan };
                };
                // Variant -> background/border/colour map
                const variantStyle = (v, isToday) => {
                  const base = {
                    p:      { bg: "rgba(60,255,165,.12)",  bd: "rgba(60,255,165,.22)",  fg: "var(--green)"     },
                    h:      { bg: "rgba(255,177,59,.10)",  bd: "rgba(255,177,59,.20)",  fg: "var(--amber)"     },
                    al:     { bg: "rgba(120,150,255,.10)", bd: "rgba(120,150,255,.22)", fg: "var(--accent-text)" },
                    nsnc:   { bg: "rgba(255,107,107,.18)", bd: "rgba(255,107,107,.32)", fg: "var(--red)"       },
                    pending:{ bg: "rgba(255,255,255,.04)", bd: "rgba(255,255,255,.18)", fg: "rgba(255,255,255,.6)", dashed: true },
                    future: { bg: "rgba(255,255,255,.025)",bd: "rgba(255,255,255,.06)", fg: "rgba(255,255,255,.4)" },
                    off:    { bg: "rgba(245,243,248,.04)", bd: "rgba(245,243,248,.08)", fg: "rgba(245,243,248,.45)" },
                  }[v];
                  return {
                    background: base.bg,
                    border: `1px ${base.dashed ? "dashed" : "solid"} ${base.bd}`,
                    color: base.fg,
                    boxShadow: isToday ? "0 0 0 2px rgba(60,255,165,.55)" : "none",
                  };
                };
                const planBadgeStyle = (plan) => {
                  if (plan === "P") return { background: "rgba(60,255,165,.20)", color: "#3CFFA5" };
                  if (plan === "H") return { background: "rgba(255,177,59,.20)", color: "#FFB13B" };
                  return { background: "rgba(255,255,255,.10)", color: "rgba(255,255,255,.6)" };
                };
                return (
                  <div className="card" style={{ marginBottom: 14, padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        Team attendance · full month
                        <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 999, background: "rgba(106,44,121,.18)", color: "#C9A0FF", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", marginLeft: 10 }}>qa_lead+ compact</span>
                      </div>
                      <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 999, background: "rgba(201,160,255,.18)", color: "#C9A0FF", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px" }}>preview · super admin only</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--tx3)", marginBottom: 12 }}>{visibleQAs.length} specialists · plan badge top-right · status middle · check-in time bottom · today's column outlined</div>
                    {/* Stat strip */}
                    <div style={{ display: "flex", gap: 18, marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", flexWrap: "wrap" }}>
                      {[
                        ["Working days", plannedP, "var(--green)"],
                        ["P this month", pCount, "var(--green)"],
                        ["NSNC", nsncCount, "var(--red)"],
                        ["Pending today", pendingTodayCount, "var(--amber)"],
                        ["AL approved", alCount, "var(--accent-text)"],
                        ["Adherence", adherence, "var(--tx)"],
                      ].map(([label, val, c]) => (
                        <div key={label} style={{ minWidth: 80 }}>
                          <div style={{ fontSize: 17, fontWeight: 700, color: c, letterSpacing: "-.3px", fontVariantNumeric: "tabular-nums" }}>{val}</div>
                          <div style={{ fontSize: 9.5, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    {/* Grid */}
                    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                      <div style={{ display: "grid", gridTemplateColumns: `150px repeat(${daysInMonth}, minmax(54px, 1fr))`, gap: 3, minWidth: 150 + daysInMonth * 56 }}>
                        {/* Header: QA + day numbers */}
                        <div style={{ position: "sticky", left: 0, background: "rgba(15,13,20,.92)", backdropFilter: "blur(8px)", zIndex: 3, padding: "5px 8px", fontSize: 9, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px", display: "flex", alignItems: "center" }}>QA</div>
                        {days.map(d => (
                          <div key={`h-${d.dnum}`} style={{ padding: "5px 2px", textAlign: "center", fontSize: 9, fontWeight: 700, color: d.isToday ? "var(--green)" : d.isWeekend ? "rgba(245,243,248,.28)" : "var(--tx3)", textTransform: "uppercase", letterSpacing: ".3px", lineHeight: 1.1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
                            <span style={{ opacity: .65, fontSize: 8.5 }}>{d.dowLetter}</span>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{d.dnum}</span>
                          </div>
                        ))}
                        {/* Rows: one per visible QA */}
                        {visibleQAs.map(qa => {
                          const qaLower = qa.email.toLowerCase();
                          const st = perQaStats.get(qaLower) || { eligible: 0, adhered: 0, nsnc: 0 };
                          const adhPct = st.eligible > 0 ? (st.adhered / st.eligible) * 100 : null;
                          // Adherence badge colour: green ≥90, amber 70-90, red <70.
                          // Null when there are no P/H-vs-P/H days yet.
                          const adhColor = adhPct == null ? "var(--tx3)" : adhPct >= 90 ? "var(--green)" : adhPct >= 70 ? "var(--amber)" : "var(--red)";
                          return (
                            <React.Fragment key={`row-${qa.email}`}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", fontSize: 11.5, fontWeight: 600, position: "sticky", left: 0, background: "rgba(15,13,20,.92)", backdropFilter: "blur(8px)", zIndex: 2, minHeight: 58, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #6A2C79, #C9A0FF)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9.5, flexShrink: 0 }}>
                                  {_nameFromEmail(qa.email).split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
                                </span>
                                <div style={{ display: "flex", flexDirection: "column", gap: 1, overflow: "hidden", minWidth: 0 }}>
                                  <span style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{_nameFromEmail(qa.email)}</span>
                                  <span style={{ fontSize: 9.5, color: adhColor, fontVariantNumeric: "tabular-nums", fontWeight: 700, letterSpacing: ".2px" }} title={`${st.adhered} of ${st.eligible} P/H days matched plan${st.nsnc > 0 ? ` · ${st.nsnc} NSNC` : ""} · approved leave (AL/SL/PH) excluded from adherence`}>
                                    {st.eligible > 0
                                      ? `${st.adhered}/${st.eligible} · ${adhPct.toFixed(0)}%${st.nsnc > 0 ? ` · ${st.nsnc} NSNC` : ""}`
                                      : "no P/H days yet"}
                                  </span>
                                </div>
                              </div>
                              {days.map(d => {
                                const desc = cellDesc(qaLower, d);
                                const vs = variantStyle(desc.variant, d.isToday);
                                return (
                                  <div
                                    key={`${qa.email}-${d.dnum}`}
                                    onClick={() => setEditCell(`${qa.email}-${d.dnum}`)}
                                    title={`${d.iso} · plan ${desc.plan || "—"} · ${desc.statText}${desc.timeText ? " · " + desc.timeText : ""}`}
                                    style={{
                                      minHeight: 58,
                                      borderRadius: 7,
                                      padding: "3px 4px",
                                      cursor: "pointer",
                                      transition: "transform .15s, box-shadow .15s",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 0,
                                      textAlign: "center",
                                      fontSize: 9,
                                      position: "relative",
                                      lineHeight: 1,
                                      ...vs,
                                    }}
                                  >
                                    {/* plan badge — top-right corner */}
                                    {desc.plan && (
                                      <span style={{
                                        position: "absolute", top: 2, right: 3,
                                        fontSize: 7.5, fontWeight: 700,
                                        padding: "0 4px",
                                        borderRadius: 2,
                                        letterSpacing: ".3px",
                                        lineHeight: 1.3,
                                        ...planBadgeStyle(desc.plan),
                                      }}>{desc.plan}</span>
                                    )}
                                    {/* status text — only when there's a real outcome */}
                                    {desc.statText && (
                                      <div style={{ fontSize: 10.5, fontWeight: 800, lineHeight: 1.1, marginTop: 12, marginBottom: "auto" }}>{desc.statText}</div>
                                    )}
                                    {/* check-in time */}
                                    {desc.timeText && (
                                      <div style={{ fontSize: 8.5, opacity: .8, fontVariantNumeric: "tabular-nums", fontWeight: 500, marginTop: 2 }}>{desc.timeText}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          );
        })()}

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

        {/* QA-only calendar view — Google-Calendar-style month grid for
            their own days. Replaces the wide table for QAs since they
            only see their own row in it anyway. */}
        {isQA && !isLead && (
          <MyMonthCalendar
            selMonth={selMonth}
            myEmail={myEmail}
            attendance={attendance}
            monthIsLocked={monthIsLocked}
            isLead={isLead}
            isQA={isQA}
            editCell={editCell}
            setEditCell={setEditCell}
            pickerStage={pickerStage}
            pendingReason={pendingReason}
            onSetAtt={(em, dayNum, code, note) => setAtt(em, dayNum, code, note)}
            onApproveAtt={(em, dayNum) => approveAtt(em, dayNum)}
            onClearAtt={(em, dayNum) => clearAtt(em, dayNum)}
            setPendingReason={setPendingReason}
            setPickerStage={setPickerStage}
            // Enhanced layout (collapsed past + future weeks, check-in
            // time inside each cell) is gated to super-admin previewing
            // via View-as. Drop the gate once approved for everyone.
            enhanced={realProfile?.role === "super_admin"}
          />
        )}

        {/* Calendar grid (leads / supervisors / admins) */}
        {/* Wide team table — the original lead grid. Hidden when the new
            compact full-month grid is rendering (super-admin viewing-as
            qa_lead+) so leads don't see two side-by-side views. Drop
            the second clause once the compact grid is approved for
            everyone qa_lead+. */}
        {!(isQA && !isLead) && !(realProfile?.role === "super_admin" && hasRole(profile?.role, "qa_lead")) && (<>
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
                <th style={{textAlign:"center",minWidth:30,fontSize:10}} title="Days the QA checked in from Office (self check-in only)">P</th>
                <th style={{textAlign:"center",minWidth:30,fontSize:10}} title="Days the QA checked in from Home (self check-in only)">H</th>
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
                      const cellKey = `${em}-${d.num}`;
                      const isEditing = editCell === cellKey;
                      const canEdit = (isLead || em === myEmail) && !monthIsLocked;
                      const canApprove = att?.approval_status === "pending" && isLead && em !== myEmail;
                      return (
                        <DayCell
                          key={d.num}
                          em={em}
                          dayNum={d.num}
                          dateIso={d.dateIso}
                          todayIso={todayIso}
                          isWeekend={d.isWeekend}
                          att={att}
                          isEditing={isEditing}
                          canEdit={canEdit}
                          isLead={isLead}
                          isQA={isQA}
                          canApprove={canApprove}
                          pickerStage={isEditing ? pickerStage : null}
                          pendingReason={isEditing ? pendingReason : ""}
                          selMonth={selMonth}
                          monthIsLocked={monthIsLocked}
                          onOpen={() => { setEditCell(cellKey); setPendingReason(""); }}
                          onClose={() => { setEditCell(null); setPendingReason(""); }}
                          onSetAtt={setAtt}
                          onApproveAtt={approveAtt}
                          onClearAtt={clearAtt}
                          setPendingReason={setPendingReason}
                          setPickerStage={setPickerStage}
                        />
                      );
                    })}
                    <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"var(--green)"}}>{counts["P"]||0}</td>
                    <td style={{textAlign:"center",fontSize:10,fontWeight:600,color:"var(--accent-text)"}}>{counts["H"]||0}</td>
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
        </>)}

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
      {activeTab === "plan" && isLead && (
        <AttendancePlanGrid
          attendance={attendance}
          qaList={visibleQAs}
          roster={roster}
          selMonth={selMonth}
          monthIsLocked={monthIsLocked}
          isSuperAdmin={isSuperAdmin}
          onSaved={loadData}
        />
      )}
    </div>
  );
}

export default SchedulePage;
