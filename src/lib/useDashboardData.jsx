import { useState, useCallback, useEffect } from "react";
import { hasRole, sortMonthsDesc } from "./constants.js";
import { sb, dataCache } from "./supabase.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listPlans, listPlanWeeks } from "../api/plans.js";
import { getScore } from "./dashboardScore.js";
import { useAutoRefresh } from "./hooks.jsx";
import { nameFromEmail } from "./utils.js";

// Bulk loader for the home dashboard. Pulls MTD (last 6 months), roster,
// profiles, DAM flags, plans, plan weeks, dismissals, escalation steps,
// today's attendance, today's daily_scores, and the teams hierarchy in
// two waves of parallel queries. For QA leads, also computes the AP
// detection alert list (active DAM flags, escalation step asks for PIP,
// not already on a plan, scoped to the lead's team). Refreshes every
// 5 minutes via useAutoRefresh.
//
// Returns: { mtd, roster, appProfiles, damCount, profileCount,
//   todayAttendance, apPlans, apWeeks, apDetections, apDismissals,
//   dailyScores, loading, refresh }
export function useDashboardData(token, profile) {
  const [mtd, setMtd] = useState([]);
  const [roster, setRoster] = useState([]);
  const [appProfiles, setAppProfiles] = useState([]);
  const [damCount, setDamCount] = useState(0);
  const [profileCount, setProfileCount] = useState({ qas: 0, leads: 0, active: 0 });
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [monthAttendance, setMonthAttendance] = useState([]);
  const [apPlans, setApPlans] = useState([]);
  const [apWeeks, setApWeeks] = useState([]);
  const [apDetections, setApDetections] = useState([]);
  const [apDismissals, setApDismissals] = useState([]);
  const [dailyScores, setDailyScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const sixAgo = new Date();
      sixAgo.setMonth(sixAgo.getMonth() - 6);
      const minMonth = sixAgo.toISOString().slice(0, 7);

      // All 11 queries fire in a single round — no sequential waterfalls.
      const [
        mtdRows, rosterRows, profs,
        damFlagsRaw, plans, planWeeks, dismissals, damStepsRaw,
        attRaw, dsRaw, teamsRaw,
      ] = await Promise.all([
        dataCache.fetch("mtd_scores", () =>
          sb.query("mtd_scores_v", { select: "*", filters: `month=gte.${minMonth}&order=month.desc`, token }).catch(() => [])
        ),
        listRoster({ token, select: "*" }),
        listProfiles({ token, select: "id,email,display_name,role,status" }),
        dataCache.fetch("dam_flags_full", () =>
          sb.query("dam_flags", { select: "id,profile_id,qa_email,rule_id,occurrence_number,status,profiles!dam_flags_profile_id_fkey(email,display_name),dam_rules(name,behavior_type)", filters: "order=triggered_at.desc", token }).catch(() => [])
        ),
        listPlans({ token, cacheKey: "action_plans", cache: true }),
        listPlanWeeks({ token, cacheKey: "action_plan_weeks", cache: true }),
        dataCache.fetch("ap_dismissals", () =>
          sb.query("ap_dismissals", { select: "*", filters: "order=created_at.desc", token }).catch(() => [])
        ),
        dataCache.fetch("dam_escalation_steps", () =>
          sb.query("dam_escalation_steps", { select: "id,rule_id,occurrence,action,includes_pip,pip_action", token }).catch(() => [])
        ),
        // Month-to-date attendance with planned_code so the dashboard can
        // compute attendance Health. Today's rows are derived from this
        // (filtered below) — separate query removed to avoid an extra
        // round-trip.
        sb.query("qa_attendance", { select: "email,date,status,planned_code", filters: `date=gte.${todayStr.slice(0,7)}-01`, token }).catch(() => []),
        sb.query("daily_scores", { select: "*", filters: `date=eq.${todayStr}`, token }).catch(() => []),
        dataCache.fetch("teams_hierarchy", () =>
          sb.query("teams", { select: "name,domain,profiles!fk_teams_lead(email),sup:profiles!fk_teams_supervisor(email)", token }).catch(() => [])
        ),
      ]);

      // Filter out non-QA profiles + roster rows whose manager isn't a qa_lead.
      const nonQaProfsD = profs.filter(p => p.role !== "qa");
      const blacklistD = new Set();
      nonQaProfsD.forEach(p => {
        const em = p.email?.toLowerCase(); if (!em) return;
        blacklistD.add(em);
        const local = em.split("@")[0];
        if (em.endsWith("@tabby.ai")) blacklistD.add(local + "@tabby.sa");
        if (em.endsWith("@tabby.sa")) blacklistD.add(local + "@tabby.ai");
      });
      const qaLeadEmails = new Set();
      profs.filter(p => p.role === "qa_lead").forEach(p => {
        const em = p.email?.toLowerCase(); if (!em) return;
        qaLeadEmails.add(em);
        const local = em.split("@")[0];
        if (em.endsWith("@tabby.ai")) qaLeadEmails.add(local + "@tabby.sa");
        if (em.endsWith("@tabby.sa")) qaLeadEmails.add(local + "@tabby.ai");
        qaLeadEmails.add(local);
      });
      const filteredRoster = rosterRows.filter(r => {
        if (blacklistD.has(r.email?.toLowerCase())) return false;
        const mgr = r.manager_email?.toLowerCase();
        if (!mgr) return false;
        if (qaLeadEmails.has(mgr)) return true;
        const mgrLocal = mgr.split("@")[0];
        if (qaLeadEmails.has(mgrLocal)) return true;
        return false;
      });
      const filteredMtd = mtdRows.filter(r => {
        const em = r.qa_email?.toLowerCase();
        if (blacklistD.has(em)) return false;
        const tl = r.qa_tl?.toLowerCase();
        if (!tl) return true;
        return qaLeadEmails.has(tl) || qaLeadEmails.has(tl.split("@")[0]);
      });
      // Cross-domain identity reconciliation: prefer the @tabby.sa /
      // @tabby.ai variant that's actually in the roster / profiles.
      const rosterEmailSet = new Set(filteredRoster.map(r => r.email?.toLowerCase()));
      const normalizedMtd = filteredMtd.map(r => {
        const em = r.qa_email?.toLowerCase();
        if (!em) return r;
        if (rosterEmailSet.has(em)) return r;
        const local = em.split("@")[0];
        const alt = em.endsWith("@tabby.ai") ? local + "@tabby.sa" : local + "@tabby.ai";
        if (rosterEmailSet.has(alt)) return { ...r, qa_email: alt };
        return r;
      });
      const profEmails = new Set(profs.map(p => p.email?.toLowerCase()));
      const normalizedMtd2 = normalizedMtd.map(r => {
        const tl = r.qa_tl?.toLowerCase();
        if (!tl) return r;
        const tlLocal = tl.split("@")[0];
        const tlAlt = tl.endsWith("@tabby.ai") ? tlLocal + "@tabby.sa" : tlLocal + "@tabby.ai";
        if (!profEmails.has(tl) && profEmails.has(tlAlt)) return { ...r, qa_tl: tlAlt };
        return r;
      });

      setMtd(normalizedMtd2);
      setRoster(filteredRoster);
      setAppProfiles(profs);
      setDamCount(damFlagsRaw.filter(f => f.status === "pending").length);
      setProfileCount({
        qas: filteredRoster.length,
        leads: [...new Set(filteredRoster.map(r => r.manager_email).filter(Boolean))].length,
        active: profs.length,
      });
      setApPlans(plans);
      setApWeeks(planWeeks);
      setApDismissals(dismissals);

      // Today's att / daily scores / teams were fetched in the same round above.
      // attRaw now holds the full MTD set (see query expansion above) — keep
      // todayAttendance scoped to today's rows for the existing daily widget,
      // and expose the month set under monthAttendance for the Health card.
      const monthRows = Array.isArray(attRaw) ? attRaw : [];
      setMonthAttendance(monthRows);
      setTodayAttendance(monthRows.filter(r => r.date === todayStr));
      setDailyScores(Array.isArray(dsRaw) ? dsRaw : []);
      window.__teamsData = (Array.isArray(teamsRaw) ? teamsRaw : []).map(tm => ({
        name: tm.name, domain: tm.domain,
        lead_email: tm.profiles?.email || null,
        supervisor_email: tm.sup?.email || null,
      }));

      // QA-lead-only AP detection alerts: active DAM flags whose
      // escalation step calls for a PIP, scoped to the lead's team, not
      // already on an active plan and not previously dismissed.
      if (hasRole(profile?.role, "qa_lead")) {
        const dismissedEmails = new Set(dismissals.map(d => d.qa_email?.toLowerCase()));
        const activePlanEmails = plans.filter(p => p.status === "active" || p.status === "pending_review").map(p => p.qa_email?.toLowerCase());
        const pEmail = profile?.email?.toLowerCase() || "";
        const pLocal = pEmail.split("@")[0];
        const pAlt = pEmail.endsWith("@tabby.ai") ? pLocal + "@tabby.sa" : pLocal + "@tabby.ai";
        const myTeam = rosterRows.filter(r => { const m = r.manager_email?.toLowerCase(); return m && (m === pEmail || m === pAlt || m === pLocal); }).map(r => r.email.toLowerCase());
        const mnths = sortMonthsDesc([...new Set(mtdRows.map(r => r.month))]);
        const latestMtd = mtdRows.filter(r => r.month === mnths[0]);
        const myTlRows = latestMtd.filter(r => { const tl = r.qa_tl?.toLowerCase(); return tl && (tl === pEmail || tl === pAlt); }).map(r => r.qa_email?.toLowerCase());
        const teamEmails = [...new Set([...myTeam, ...myTlRows])];

        const activeFlags = (damFlagsRaw || []).filter(f => f.status === "pending" || f.status === "acknowledged");
        const flagged = [];
        activeFlags.forEach(flag => {
          const email = flag.profiles?.email || flag.qa_email?.toLowerCase();
          if (!email) return;
          if (activePlanEmails.includes(email)) return;
          if (dismissedEmails.has(email)) return;
          if (teamEmails.length > 0 && !teamEmails.includes(email)) return;
          if (flagged.find(f => f.email?.toLowerCase() === email)) return;
          const step = (damStepsRaw || []).find(s => s.rule_id === flag.rule_id && s.occurrence === flag.occurrence_number);
          if (!step || !step.includes_pip) return;
          const row = latestMtd.find(r => r.qa_email?.toLowerCase() === email);
          const score = row ? getScore(row) : 0;
          const ruleName = flag.dam_rules?.name || "Unknown";
          const pipAction = step.pip_action || step.action || "AP required";
          flagged.push({
            email: flag.profiles?.email || flag.qa_email || email,
            name: nameFromEmail(flag.profiles?.email || email),
            score,
            reason: `DAM: ${ruleName} — #${flag.occurrence_number}: ${pipAction}`,
            slab0Count: 0,
            planType: step.includes_pip ? "pip" : "ap",
          });
        });
        flagged.sort((a, b) => a.score - b.score);
        setApDetections(flagged);
      }
    } catch (e) {
      console.error("Dashboard:", e);
    }
    setLoading(false);
  }, [token, profile?.role, profile?.email]);

  useEffect(() => { refresh(); }, [refresh]);
  useAutoRefresh(refresh, 60000); // 1 min — dashboard should feel live

  return {
    mtd, roster, appProfiles, damCount, profileCount,
    todayAttendance, monthAttendance, apPlans, apWeeks, apDetections, apDismissals,
    dailyScores, loading, refresh,
    // setters that the AP-detection dismiss flow on the page needs
    setApDetections, setApDismissals,
  };
}
