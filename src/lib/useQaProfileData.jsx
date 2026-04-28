import { useState, useEffect, useCallback } from "react";
import { hasRole } from "./constants.js";
import { sb } from "./supabase.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listMtd } from "../api/mtd.js";
import { listTasks } from "../api/tasks.js";
import { listCoachingSessions } from "../api/coachingSessions.js";
import { listTeamTargets } from "../api/teamTargets.js";
import { listPlans } from "../api/plans.js";

// Loads everything the QA Profile page needs in one round-trip and
// derives the visible-QA universe from it. The page itself keeps the
// per-selected-QA slicing (qaMtd, qaSessions, qaFlags …) because those
// depend on URL state that lives in the component.
//
// Returns: { roster, mtd, sessions, plans, tasks, flags, qaAttendance,
//   dailyScores, teamTargets, loading, allQAs, qaLeadSet }
export function useQaProfileData(token, profile) {
  const [roster, setRoster] = useState([]);
  const [mtd, setMtd] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [flags, setFlags] = useState([]);
  const [qaAttendance, setQaAttendance] = useState([]);
  const [dailyScores, setDailyScores] = useState([]);
  const [teamTargets, setTeamTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  // qaLeadSet + allProfiles drive the QA-only filter; we keep them in
  // state instead of stashing on `window` like the original code did.
  const [qaLeadSet, setQaLeadSet] = useState(() => new Set());
  const [allProfiles, setAllProfiles] = useState([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const curMonth = new Date().toISOString().slice(0, 7);
        const today = new Date().toISOString().split("T")[0];
        const [r, m, s, ap, t, f, profs, att, ds, tgt] = await Promise.all([
          listRoster({ token, select: "email,display_name,manager_email,queue,country,hiring_date", cacheKey: "qa_roster_full" }),
          listMtd({ token }),
          listCoachingSessions({ token, select: "id,member_email,sender_email,cc_email,meeting_type,session_date,performance_rating,outcome,topics,strengths,weaknesses,goals,action_items,notes,agenda,follow_up,next_steps,email_subject,conclusion,ap_week_pass", filters: "order=session_date.desc" }),
          listPlans({ token, select: "id,qa_email,type,status,start_date,end_date,conclusion,created_by,team,reason,action_plan_weeks(id,week_number,week_start,target_data,actual_data,met_targets,notes)", filters: "", cacheKey: "action_plans_full", cache: true }),
          listTasks({ token }),
          sb.query("dam_flags", { select: "id,qa_email,severity,status,triggered_at,occurrence_number,reviewed_by,reviewed_at,notes,dam_rules(name,behavior_type,recommended_action)", filters: "order=triggered_at.desc", token }).catch(() => []),
          listProfiles({ token, select: "email,role", filters: "", cacheKey: "profiles_email_role" }),
          sb.query("qa_attendance", { select: "email,date,status", filters: `date=gte.${curMonth}-01&order=date.asc`, token }).catch(() => []),
          sb.query("daily_scores", { select: "*", filters: `date=eq.${today}`, token }).catch(() => []),
          listTeamTargets({ token }),
        ]);
        if (cancelled) return;
        setRoster(Array.isArray(r) ? r : []);
        setMtd(Array.isArray(m) ? m : []);
        setSessions(Array.isArray(s) ? s : []);
        setPlans(Array.isArray(ap) ? ap : []);
        setTasks(Array.isArray(t) ? t : []);
        setFlags(Array.isArray(f) ? f : []);
        setQaAttendance(Array.isArray(att) ? att : []);
        setDailyScores(Array.isArray(ds) ? ds : []);
        setTeamTargets(Array.isArray(tgt) ? tgt : []);
        const profList = Array.isArray(profs) ? profs : [];
        setAllProfiles(profList);
        setQaLeadSet(new Set(profList.filter(p => p.role === "qa_lead").map(p => p.email?.toLowerCase()).filter(Boolean)));
      } catch (e) {
        console.error("QA Profile load:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Build full list: roster + anyone in MTD not in roster — only QAs
  // under the qa_lead set, with non-QA roles and Sr QA both excluded.
  const allQAs = (() => {
    const map = new Map();
    const nonQaEmails = new Set();
    qaLeadSet.forEach(em => nonQaEmails.add(em));
    const excludeRoles = new Set(["qa_lead", "qa_supervisor", "admin", "super_admin"]);
    allProfiles.filter(p => excludeRoles.has(p.role)).forEach(p => {
      if (p.email) {
        nonQaEmails.add(p.email.toLowerCase());
        nonQaEmails.add(p.email.toLowerCase().split("@")[0]);
      }
    });
    const isSrQa = (r) => /^(sr\.?|senior)\s*qa$/i.test((r.role || "").trim());
    const srQaEmails = new Set();
    roster.forEach(r => { if (isSrQa(r) && r.email) srQaEmails.add(r.email.toLowerCase()); });
    roster.forEach(r => {
      const em = r.email?.toLowerCase();
      if (!em || nonQaEmails.has(em) || nonQaEmails.has(em.split("@")[0])) return;
      if (srQaEmails.has(em)) return;
      const mgr = r.manager_email?.toLowerCase();
      if (!mgr) return;
      if (qaLeadSet.has(mgr) || qaLeadSet.has(mgr.split("@")[0])) {
        map.set(em, r);
      }
    });
    mtd.forEach(m => {
      const em = m.qa_email?.toLowerCase();
      if (!em || map.has(em) || nonQaEmails.has(em) || nonQaEmails.has(em.split("@")[0])) return;
      if (srQaEmails.has(em)) return;
      const tl = m.qa_tl?.toLowerCase();
      if (tl && (qaLeadSet.has(tl) || qaLeadSet.has(tl.split("@")[0]))) {
        map.set(em, { email: em, manager_email: m.qa_tl, queue: null, country: null });
      }
    });
    return [...map.values()];
  })();

  // Re-pull just today's daily_scores after a Refresh button press —
  // avoids re-running the full 10-table load when only those numbers
  // change.
  const refreshDailyScores = useCallback(async () => {
    if (!token) return;
    const today = new Date().toISOString().split("T")[0];
    const ds = await sb.query("daily_scores", { select: "*", filters: `date=eq.${today}`, token }).catch(() => []);
    setDailyScores(Array.isArray(ds) ? ds : []);
  }, [token]);

  return {
    roster, mtd, sessions, plans, tasks, flags, qaAttendance, dailyScores, teamTargets,
    loading, allQAs, qaLeadSet, refreshDailyScores,
  };
}
