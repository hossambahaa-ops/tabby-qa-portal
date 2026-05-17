import React, { useState, useEffect, useRef } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { Icon } from "./Icons.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { listTasks } from "../api/tasks.js";
import { listCoachingSessions } from "../api/coachingSessions.js";
import { listPlans } from "../api/plans.js";
import { listViolations } from "../api/violations.js";
import { listEscalations } from "../api/escalations.js";
import { listRoster } from "../api/roster.js";
import { loadTeamForViewer } from "../lib/teamScope.js";
import { fetchUnreadReleases, ackRelease } from "../lib/featureReleases.js";
import { isMismatch, isMissingCheckIn, isAutoNsnc, PLAN_FEATURE_START, seenPlanKey, isPlanUnseen, riyadhTodayStr } from "../lib/attendancePlan.js";
import { listProfiles } from "../api/profiles.js";
import { emailsMatchLoose, nameFromEmail } from "../lib/utils.js";
import { isLive as annIsLive, matchesAudience as annMatchesAudience } from "../lib/announcementUtils.js";

const safe=(v)=>{if(v==null)return"";if(typeof v==="object")return JSON.stringify(v);return String(v);};

function NotificationBell({ onNavigate }) {
  const{token,profile,realProfile,impersonating}=useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyMonth, setHistoryMonth] = useState("");
  // Per-user dismissal key so (a) signing out and another user signing
  // in doesn't inherit the previous user's dismissed set, and (b) the
  // notification IDs (e.g. "v-12") don't collide across users.
  // While impersonating, fall back to the real admin's key so View-As
  // browsing doesn't pollute either bucket.
  const storageEmail = (impersonating ? realProfile?.email : profile?.email) || "anon";
  const dismissKey = `notif_dismissed_${storageEmail.toLowerCase()}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(dismissKey) || "[]"); } catch { return []; }
  });
  // Reload dismissed set if identity flips (sign-out + sign-in another
  // user without a page reload, or View-As toggle). Without this the
  // hook closure keeps the previous identity's list in memory.
  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem(dismissKey) || "[]")); }
    catch { setDismissed([]); }
  }, [dismissKey]);
  const ref = useRef(null);
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSv = hasRole(profile?.role, "qa_supervisor");
  const isAdmin = hasRole(profile?.role, "admin");

  const dismiss = (id) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    // Skip the localStorage write entirely while impersonating —
    // dismissals from a View-As session shouldn't bleed back into
    // the real admin's bucket. Same applies to the seenPlanKey marker.
    if (!impersonating) {
      localStorage.setItem(dismissKey, JSON.stringify(updated));
      if (id?.startsWith("plan-updated-")) {
        const ts = id.slice("plan-updated-".length);
        try { localStorage.setItem(seenPlanKey(profile?.email), ts); } catch {}
      }
    }
  };

  const dismissAll = () => {
    const allIds = items.map(i => i.id);
    setDismissed(prev => {
      const u = [...new Set([...prev, ...allIds])];
      if (!impersonating) localStorage.setItem(dismissKey, JSON.stringify(u));
      return u;
    });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const myEmail = profile?.email?.toLowerCase();
        const queries = [
          // Tasks assigned to ME
          listTasks({ token, select: "id,title,priority,created_by,eta_date,created_at", filters: `assigned_to=eq.${profile?.email}&status=neq.done&order=created_at.desc&limit=10` }),
          // Escalations routed to ME
          listEscalations({ token, select: "id,category,status,submitted_by,created_at", filters: `routed_to=eq.${profile?.email}&status=eq.open&order=created_at.desc&limit=10` }),
          // Announcements — pull recent ones; we filter by isLive +
          // audience + ack status below before surfacing.
          sb.query("announcements", { select: "id,title,priority,sent_by,target_type,target_value,requires_ack,dismiss_mode,send_at,expires_at,published,deleted_at,created_at", filters: "order=created_at.desc&limit=20", token }).catch(() => []),
          // Feedback responses to MY feedback (any role)
          sb.query("feedback", { select: "id,category,status,admin_response,created_at", filters: `user_email=eq.${profile?.email}&status=neq.new&order=created_at.desc&limit=5`, token }).catch(() => []),
          // Coaching sessions where I'm the member (for QAs)
          listCoachingSessions({ token, select: "id,meeting_type,sender_email,session_date,created_at", filters: `qa_email=eq.${profile?.email}&order=created_at.desc&limit=5` }),
        ];
        // QA Lead gets violations for THEIR team only, DAM flags, and their APs
        if (isLead && !isSv) {
          queries.push(listViolations({ token, select: "id,violation_type,qa_email,lead_email,created_at", filters: `lead_email=eq.${myEmail}&status=eq.pending&order=created_at.desc&limit=10` }));
          queries.push(sb.query("dam_flags", { select: "id,qa_email,status,created_at,dam_rules(name)", filters: "status=eq.pending&order=created_at.desc&limit=10", token }).catch(() => []));
          queries.push(listPlans({ token, select: "id,qa_email,type,status,end_date,tl_email,created_at", filters: `tl_email=eq.${myEmail}&status=eq.active&order=created_at.desc&limit=10` }));
        }
        // Supervisors see their domain's violations + DAM flags. Order
        // matters: violations / dam_flags / plans must always sit at
        // results[5] / [6] / [7] regardless of which role-branch ran.
        if (isSv) {
          queries.push(listViolations({ token, select: "id,violation_type,qa_email,lead_email,created_at", filters: "status=eq.pending&order=created_at.desc&limit=10" }));
          queries.push(sb.query("dam_flags", { select: "id,qa_email,status,created_at,dam_rules(name)", filters: "status=eq.pending&order=created_at.desc&limit=10", token }).catch(() => []));
          queries.push(listPlans({ token, select: "id,qa_email,type,status,end_date,tl_email,created_at", filters: "status=eq.active&order=created_at.desc&limit=10" }));
        }
        // QA Lead also gets attendance approval requests (OT/PH) from their
        // team. Pushed AFTER the supervisor block so its index is always
        // recorded via attReqIdx and never shifts the violations / dam /
        // plans triple at indices 5–7.
        let attReqIdx = -1;
        if (isLead) {
          attReqIdx = queries.length;
          queries.push(sb.query("qa_attendance", { select: "id,email,date,status,requested_by,created_at,updated_at", filters: "approval_status=eq.pending&order=updated_at.desc&limit=20", token }).catch(() => []));
        }
        // Admins (and super admins) see new user feedback submissions
        let newFeedbackIdx = -1;
        if (isAdmin) {
          newFeedbackIdx = queries.length;
          queries.push(sb.query("feedback", { select: "id,user_name,user_email,category,message,created_at", filters: "status=eq.new&order=created_at.desc&limit=10", token }).catch(() => []));
        }
        // Admins also get alerted when the client-error log picks up new entries
        let newErrorsIdx = -1;
        if (isAdmin) {
          const since = new Date(Date.now() - 24*60*60*1000).toISOString();
          newErrorsIdx = queries.length;
          queries.push(sb.query("client_errors", { select: "id,source,message,user_email,created_at", filters: `created_at=gte.${since}&order=created_at.desc&limit=10`, token }).catch(() => []));
        }
        // Admins also see sign-ins from emails not on the qa_roster.
        // The auto-create now provisions them but logs a heads-up so
        // the admin can either add them to roster or remove the user.
        let noRosterIdx = -1;
        if (isAdmin) {
          noRosterIdx = queries.length;
          queries.push(sb.query("activity_log", {
            select: "id,actor_email,target_id,details,created_at",
            filters: "action=eq.profile_no_roster_match&order=created_at.desc&limit=20",
            token,
          }).catch(() => []));
        }
        // Tracker initiatives assigned to me. The dashboard "tasks" table
        // (queried at index 0) is separate from the "initiatives" table
        // that powers the Tracker page — assigning a TRK-N item didn't
        // fire a notification at all before this. Open items only,
        // ordered newest first.
        let trackerIdx = queries.length;
        queries.push(sb.query("initiatives", {
          select: "id,seq,title,priority,status,assigned_to,created_by,eta_date,created_at",
          filters: `assigned_to=eq.${profile?.email}&status=neq.Done&order=created_at.desc&limit=20`,
          token,
        }).catch(() => []));
        const results = await Promise.all(queries);
        const [assignedTasks, escalations, announcements, myFeedback, myCoaching] = results;
        // Filter announcements down to ones the user should still see:
        //   * live (not deleted, published, within send_at..expires_at)
        //   * audience match (handled by matchesAudience)
        //   * not yet acknowledged
        const myAcks = await sb.query("announcement_acks", { select: "announcement_id", filters: `user_email=eq.${profile?.email}`, token }).catch(() => []);
        const ackedAnnIds = new Set((myAcks || []).map(a => a.announcement_id));
        const myQueueForAnn = (window.__gfRoster || {})[myEmail] || "";
        const liveAnnouncements = (announcements || []).filter(a =>
          annIsLive(a)
          && annMatchesAudience(a, { email: myEmail, queue: myQueueForAnn }, window.__gfRosterMgr || {})
          && !ackedAnnIds.has(a.id)
        );
        const violations = (isLead || isSv) ? (results[5] || []) : [];
        const damFlags = (isLead || isSv) ? (results[6] || []) : [];
        const activePlans = (isLead || isSv) ? (results[7] || []) : [];
        const pendingAtt = attReqIdx >= 0 ? (results[attReqIdx] || []) : [];
        const newFeedback = newFeedbackIdx >= 0 ? (results[newFeedbackIdx] || []) : [];
        const newErrors  = newErrorsIdx  >= 0 ? (results[newErrorsIdx]  || []) : [];
        const noRosterAlerts = noRosterIdx >= 0 ? (results[noRosterIdx] || []) : [];
        const myInitiatives = trackerIdx >= 0 ? (results[trackerIdx] || []) : [];

        // Filter attendance requests to the viewer's effective team.
        // Leads → direct reports; supervisors+ → also QAs whose lead
        // reports to them via teams.supervisor_id.
        let teamEmails = null;
        if (isLead && pendingAtt.length > 0) {
          try {
            const team = await loadTeamForViewer({ token, profile });
            teamEmails = new Set((team || []).map(r => r.email?.toLowerCase()).filter(Boolean));
          } catch { teamEmails = new Set(); }
        }
        const myTeamPendingAtt = pendingAtt.filter(a => {
          const em = a.email?.toLowerCase();
          if (!em || em === myEmail) return false;
          return !teamEmails || teamEmails.has(em);
        });

        const all = [
          ...assignedTasks.map(t => ({ id: "t-"+t.id, type: "task", title: `Task: ${t.title}`, sub: `From: ${t.created_by?.split("@")[0]}${t.eta_date?" · ETA: "+new Date(t.eta_date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"}):""}`, time: t.created_at, page: "dashboard" })),
          // Tracker initiatives assigned to me. Self-assigned items are
          // skipped (no need to notify yourself about your own create).
          ...myInitiatives.filter(i => (i.created_by || "").toLowerCase() !== myEmail).map(i => ({
            id: "trk-" + i.id,
            type: "tracker",
            title: `Tracker: ${i.title}`,
            sub: `${i.created_by ? "From " + i.created_by.split("@")[0] : "Assigned"}${i.eta_date ? " · ETA: " + new Date(i.eta_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}`,
            time: i.created_at,
            page: "tracker",
          })),
          ...escalations.map(e => ({ id: "e-"+e.id, type: "escalation", title: `Escalation: ${e.category}`, sub: "Anonymous submission", time: e.created_at, page: "escalations" })),
          ...myFeedback.filter(f => f.admin_response).map(f => ({ id: "fb-"+f.id, type: "feedback", title: `Feedback response: ${f.category}`, sub: `Status: ${f.status}`, time: f.created_at, page: "dashboard" })),
          ...(!isLead && !isSv ? (myCoaching || []) : []).map(c => ({ id: "c-"+c.id, type: "coaching", title: `Coaching logged: ${c.meeting_type || "Coaching"}`, sub: c.sender_email ? `From ${c.sender_email.split("@")[0]}` : "—", time: c.created_at, page: "profile" })),
          ...violations.map(v => ({ id: "v-"+v.id, type: "violation", title: `Violation: ${v.violation_type}`, sub: v.qa_email?.split("\n")[0], time: v.created_at, page: "quality", qcTab: "violations" })),
          ...damFlags.map(f => ({ id: "d-"+f.id, type: "dam", title: `DAM: ${f.dam_rules?.name || "Flag"}`, sub: f.qa_email || "—", time: f.created_at, page: "quality", qcTab: "dam" })),
          ...myTeamPendingAtt.map(a => ({
            id: "att-" + a.id,
            type: "attendance",
            title: `Attendance request: ${a.status}`,
            sub: `${(a.email || "").split("@")[0]} — ${new Date(a.date + "T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,
            time: a.updated_at || a.created_at,
            page: "schedule",
          })),
          ...activePlans.filter(p => {
            if (!p.end_date) return false;
            const daysLeft = (new Date(p.end_date) - new Date()) / (1000*60*60*24);
            return daysLeft <= 7 && daysLeft > -1;
          }).map(p => ({ id: "ap-"+p.id, type: "plan", title: `${p.type.toUpperCase()} ending soon`, sub: `${p.qa_email?.split("@")[0]} — ${Math.ceil((new Date(p.end_date)-new Date())/(1000*60*60*24))} days left`, time: p.created_at, page: "quality", qcTab: "plans" })),
          ...newFeedback.filter(f => f.user_email?.toLowerCase() !== myEmail).map(f => ({
            id: "nf-"+f.id,
            type: "feedback",
            title: `New feedback: ${f.category || "general"}`,
            sub: `${f.user_name || f.user_email?.split("@")[0] || "Someone"}${f.message ? " · " + f.message.slice(0, 70) + (f.message.length > 70 ? "…" : "") : ""}`,
            time: f.created_at,
            page: "admin",
            adminTab: "feedback",
          })),
          ...newErrors.map(e => ({
            id: "err-" + e.id,
            type: "error",
            title: `Runtime error (${e.source})`,
            sub: `${(e.message || "").slice(0, 70)}${(e.message || "").length > 70 ? "…" : ""}${e.user_email ? " — " + e.user_email.split("@")[0] : ""}`,
            time: e.created_at,
            page: "admin",
            adminTab: "errors",
          })),
          // Live, audience-matching, un-acked announcements. Clicking
          // surfaces them on the dashboard where the modal/banner will
          // pick them up — same source of truth as the rest of the
          // notification surface area.
          ...liveAnnouncements.map(a => ({
            id: "ann-" + a.id,
            type: "announcement",
            title: `📢 ${a.title || "Announcement"}`,
            sub: `From ${nameFromEmail(a.sent_by || "")}${a.priority && a.priority !== "normal" ? " · " + a.priority : ""}`,
            time: a.created_at,
            page: "dashboard",
          })),
          // Sign-ins from emails not on qa_roster (admin-only). Clicking
          // opens AdminUsersPage so the admin can add them to roster
          // or remove the auto-created profile.
          ...noRosterAlerts.map(a => ({
            id: "nr-" + a.id,
            type: "no_roster",
            title: `⚠ Not on roster: ${nameFromEmail(a.actor_email || "")}`,
            sub: `${a.actor_email || ""} — review & add to roster, or remove`,
            time: a.created_at,
            page: "admin",
            adminTab: "users",
          })),
        ];
        // Daily task reminders — check auto-close tasks vs daily_scores
        try {
          const todayStr = riyadhTodayStr();
          const [dailyDs, allTodayTasks] = await Promise.all([
            sb.query("daily_scores", {select:"*",filters:`date=eq.${todayStr}`,token}).catch(()=>[]),
            listTasks({ token, select: "id,title,assigned_to,target_metric,target_value,auto_close,status,due_date", filters: `due_date=eq.${todayStr}&auto_close=eq.true&status=eq.pending` }),
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

        // Feature-release "what's new" entries — admin-curated, role-gated,
        // auto-expire after 30 days. Pre-acked rows in feature_release_acks
        // are filtered out by fetchUnreadReleases so the user never sees
        // a release they've already dismissed/visited on another device.
        try {
          const releases = await fetchUnreadReleases({ token, userEmail: profile?.email, role: profile?.role });
          for (const r of (releases || [])) {
            all.push({
              id: "fr-" + r.key,
              type: "feature_release",
              title: `🎉 ${r.title}`,
              sub: r.description || "Click to explore",
              time: r.released_at,
              page: (r.target_path || "/dashboard").replace(/^\//, "") || "dashboard",
              releaseKey: r.key,
            });
          }
        } catch (e) { console.error("Feature releases:", e); }

        // ── Attendance plan notifications: plan published, mismatch, missing check-in ──
        // Self-contained block: pulls last 14 days of qa_attendance for the
        // user (and the lead's team), then derives flags client-side via
        // attendancePlan helpers — no event log table needed.
        try {
          const sinceDate = (() => {
            const d = new Date(); d.setDate(d.getDate() - 14);
            const cap = d.toISOString().split("T")[0];
            return cap > PLAN_FEATURE_START ? cap : PLAN_FEATURE_START;
          })();
          // Build a Set of QA emails (role qa or senior_qa). All attendance
          // flags are filtered by this set so leads/admins/managers don't
          // generate or see flags about their own non-QA records.
          const qaProfiles = await listProfiles({ token, select: "email,role", cacheKey: "profiles_slim_for_bell" }).catch(() => []);
          const qaEmailSet = new Set();
          (qaProfiles || []).forEach(p => {
            if (p.role === "qa" || p.role === "senior_qa") {
              const e = p.email?.toLowerCase();
              if (e) qaEmailSet.add(e);
            }
          });
          const isQaEmail = (em) => qaEmailSet.has((em || "").toLowerCase());

          const local = myEmail.split("@")[0];
          // PostgREST ilike wildcard: * not % (URLs reject unencoded %).
          const myAttFilters = `date=gte.${sinceDate}&or=(email.ilike.${local}@*,email.eq.${profile?.email})&order=date.desc&limit=60`;
          const myAttRows = await sb.query("qa_attendance", {
            select: "id,email,date,status,planned_code,justification,mismatch_approved,plan_updated_at,auto_nsnc",
            filters: myAttFilters,
            token,
          }).catch(() => []);
          // Self-flags only fire if the viewer themselves is a QA. For
          // leads/admins/managers (who shouldn't have plans on their own
          // attendance row), skip the self block entirely.
          const mineFiltered = isQaEmail(myEmail)
            ? (myAttRows || []).filter(r => emailsMatchLoose(r.email, myEmail))
            : [];

          // "Plan updated" notification — pings the QA when a lead publishes
          // any new/changed planned_code values for them. Suppressed once
          // the user dismisses the bell entry (via the existing dismissed list).
          let lastSeen = "";
          try { lastSeen = localStorage.getItem(seenPlanKey(myEmail)) || ""; } catch {}
          const newPlanRows = mineFiltered.filter(r => r.planned_code && isPlanUnseen(r, lastSeen));
          if (newPlanRows.length > 0) {
            const latest = newPlanRows.reduce((a, b) => new Date(b.plan_updated_at) > new Date(a.plan_updated_at) ? b : a);
            const days = newPlanRows.length;
            all.push({
              id: "plan-updated-" + latest.plan_updated_at,
              type: "attendance_plan",
              title: `📅 Your attendance plan was updated`,
              sub: days === 1
                ? `1 day planned (${new Date(latest.date + "T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})})`
                : `${days} days planned — view your schedule`,
              time: latest.plan_updated_at,
              page: "schedule",
            });
          }

          // Mine: mismatches + missing check-ins + auto-NSNC. Already
          // gated to QAs above (mineFiltered is empty for non-QA viewers).
          mineFiltered.forEach(r => {
            if (isMismatch(r)) {
              all.push({
                id: "att-mis-" + r.id,
                type: "attendance_mismatch",
                title: `⚠ Attendance mismatch on ${new Date(r.date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,
                sub: `Planned: ${r.planned_code} · Checked in: ${r.status}`,
                time: r.date + "T18:00:00Z",
                page: "schedule",
              });
            } else if (isAutoNsnc(r)) {
              all.push({
                id: "att-nsnc-" + r.id,
                type: "attendance_auto_nsnc",
                title: `🚨 Auto-marked NSNC on ${new Date(r.date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,
                sub: `Planned ${r.planned_code} but no check-in by 7 PM Riyadh — your lead can adjust if needed.`,
                time: r.date + "T19:00:00Z",
                page: "schedule",
              });
            } else if (isMissingCheckIn(r)) {
              all.push({
                id: "att-miss-" + r.id,
                type: "attendance_missing",
                title: `⏰ Missing check-in for ${new Date(r.date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,
                sub: `Planned: ${r.planned_code} — please check in`,
                time: r.date + "T19:00:00Z",
                page: "dashboard",
              });
            }
          });

          // Lead+: same flags for their effective team. Reuses
          // teamEmails from the attendance-approval block above when
          // available; otherwise resolves via loadTeamForViewer so
          // supervisors+ see QAs under the leads reporting to them too.
          if (isLead) {
            let leadTeamEmails = teamEmails;
            if (!leadTeamEmails) {
              try {
                const team = await loadTeamForViewer({ token, profile });
                leadTeamEmails = new Set((team || []).map(r => r.email?.toLowerCase()).filter(Boolean));
              } catch { leadTeamEmails = new Set(); }
            }
            if (leadTeamEmails && leadTeamEmails.size > 0) {
              const teamEmailList = [...leadTeamEmails].slice(0, 50).map(e => `email.eq.${e}`).join(",");
              const teamAtt = await sb.query("qa_attendance", {
                select: "id,email,date,status,planned_code,justification,mismatch_approved,auto_nsnc",
                filters: `date=gte.${sinceDate}&or=(${teamEmailList})&order=date.desc&limit=200`,
                token,
              }).catch(() => []);
              (teamAtt || []).forEach(r => {
                const em = r.email?.toLowerCase();
                if (!leadTeamEmails.has(em)) return;
                // Plans only apply to QAs. Even if a non-QA somehow has
                // a planned_code on their row, their team-level flags
                // are out of scope here.
                if (!isQaEmail(em)) return;
                if (isMismatch(r)) {
                  all.push({
                    id: "tatt-mis-" + r.id,
                    type: "attendance_mismatch",
                    title: `⚠ ${nameFromEmail(em)} — mismatch on ${new Date(r.date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,
                    sub: `Planned: ${r.planned_code} · Got: ${r.status}${r.justification ? ` · "${r.justification.slice(0,40)}"` : ""}`,
                    time: r.date + "T18:00:00Z",
                    page: "schedule",
                  });
                } else if (isAutoNsnc(r)) {
                  all.push({
                    id: "tatt-nsnc-" + r.id,
                    type: "attendance_auto_nsnc",
                    title: `🚨 ${nameFromEmail(em)} — auto-NSNC on ${new Date(r.date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,
                    sub: `Planned ${r.planned_code} but never checked in by 7 PM. Click to adjust.`,
                    time: r.date + "T19:00:00Z",
                    page: "schedule",
                  });
                } else if (isMissingCheckIn(r)) {
                  all.push({
                    id: "tatt-miss-" + r.id,
                    type: "attendance_missing",
                    title: `⏰ ${nameFromEmail(em)} — missing check-in on ${new Date(r.date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,
                    sub: `Planned: ${r.planned_code}`,
                    time: r.date + "T19:00:00Z",
                    page: "schedule",
                  });
                }
              });
            }
          }
        } catch (e) { console.error("Attendance plan notifications:", e); }

        all.sort((a, b) => new Date(b.time) - new Date(a.time));
        setItems(all);
      } catch {}
    };
    load();
    const interval = setInterval(load, 60000); // poll notifications every minute
    return () => clearInterval(interval);
  }, [token, profile?.email]);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const visible = items.filter(i => !dismissed.includes(i.id));
  const count = visible.length;

  // ── Digest aggregation ──────────────────────────────────────────
  // When 4+ notifications of the same type pile up (e.g. 8 pending
  // attendance approvals after a long weekend), collapse them into a
  // single roll-up tile to cut the noise. Low-frequency types stay
  // individual so single events keep their per-item context.
  const DIGEST_TYPES_TO_GROUP = ["attendance", "violation", "dam", "task", "plan", "error"];
  const TYPE_LABELS = {
    attendance: "attendance request",
    violation: "violation",
    dam: "DAM flag",
    task: "open task",
    plan: "plan ending soon",
    error: "runtime error",
  };
  const TYPE_PAGE = {
    attendance: { page: "schedule" },
    violation: { page: "quality", qcTab: "violations" },
    dam: { page: "quality", qcTab: "dam" },
    task: { page: "dashboard" },
    plan: { page: "quality", qcTab: "plans" },
    error: { page: "admin", adminTab: "errors" },
  };
  const visibleByType = visible.reduce((acc, it) => {
    (acc[it.type] = acc[it.type] || []).push(it); return acc;
  }, {});
  const visibleAggregated = (() => {
    const out = [];
    const handled = new Set();
    for (const it of visible) {
      if (handled.has(it.id)) continue;
      const group = visibleByType[it.type] || [];
      if (DIGEST_TYPES_TO_GROUP.includes(it.type) && group.length >= 4) {
        if (!handled.has("digest-" + it.type)) {
          const oldest = group[group.length - 1];
          const newest = group[0];
          out.push({
            id: "digest-" + it.type,
            type: it.type,
            title: `${group.length} ${TYPE_LABELS[it.type] || it.type}${group.length > 1 ? "s" : ""} pending`,
            sub: `${(newest?.sub || "").split("·")[0].trim() || "Tap to review"} · oldest ${new Date(oldest.time).toLocaleDateString("en-GB",{month:"short",day:"numeric"})}`,
            time: newest.time,
            ...TYPE_PAGE[it.type],
            __digestIds: group.map(g => g.id), // for bulk-dismiss
          });
          handled.add("digest-" + it.type);
          group.forEach(g => handled.add(g.id));
        }
      } else {
        out.push(it);
        handled.add(it.id);
      }
    }
    return out;
  })();
  const dismissDigest = (item) => {
    if (item.__digestIds) {
      const updated = [...new Set([...dismissed, ...item.__digestIds])];
      setDismissed(updated);
      if (!impersonating) localStorage.setItem(dismissKey, JSON.stringify(updated));
    } else {
      dismiss(item.id);
    }
  };
  const typeColor = { violation: { bg: "var(--red-bg)", color: "var(--red)" }, dam: { bg: "var(--amber-bg)", color: "var(--amber)" }, escalation: { bg: "#EDE9FE", color: "#7C3AED" }, task: { bg: "var(--primary-light)", color: "var(--tabby-purple,#6A2C79)" }, plan: { bg: "var(--amber-bg)", color: "var(--amber)" }, feedback: { bg: "var(--green-bg)", color: "var(--green)" }, reminder: { bg: "var(--amber-bg)", color: "var(--amber)" }, coaching: { bg: "var(--primary-light)", color: "var(--tabby-purple,#6A2C79)" }, error: { bg: "var(--red-bg)", color: "var(--red)" }, attendance: { bg: "rgba(13,148,136,0.12)", color: "#0D9488" }, feature_release: { bg: "var(--green-bg)", color: "var(--green)" } };

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
            {visibleAggregated.slice(0, 5).map(item => {
              const tc = typeColor[item.type] || {};
              const isDigest = !!item.__digestIds;
              return <div key={item.id} className="notif-item" style={{display:"flex",alignItems:"flex-start",gap:8,background: isDigest ? "var(--bg)" : undefined}}>
                <div style={{flex:1,cursor:"pointer"}} onClick={() => { onNavigate(item.page); if(item.qcTab) setTimeout(()=>window.dispatchEvent(new CustomEvent("qc-tab",{detail:item.qcTab})),100); if(item.adminTab) setTimeout(()=>{const h=window.location.hash||"#/";const [b,q=""]=h.split("?");const p=new URLSearchParams(q);p.set("tab",item.adminTab);window.location.hash=`${b}?${p.toString()}`;},150); if(item.type === "attendance" && isDigest) setTimeout(()=>{const h=window.location.hash||"#/";const [b,q=""]=h.split("?");const p=new URLSearchParams(q);p.set("tab","pending");window.location.hash=`${b}?${p.toString()}`;},150); setOpen(false); if(isDigest) dismissDigest(item); else dismiss(item.id); if(item.releaseKey) ackRelease({ token, userEmail: profile?.email, featureKey: item.releaseKey, via: "click" }); }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="search-result-type" style={{ background: tc.bg, color: tc.color }}>{item.type}{isDigest ? " ·"+item.__digestIds.length : ""}</span>
                    <span style={{ fontWeight: isDigest ? 700 : 500, fontSize: 12 }}>{safe(item.title)}</span>
                  </div>
                  <div style={{ color: "var(--tx3)", fontSize: 11, marginTop: 2 }}>{safe(item.sub)} · {new Date(item.time).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); if(isDigest) dismissDigest(item); else dismiss(item.id); if(item.releaseKey) ackRelease({ token, userEmail: profile?.email, featureKey: item.releaseKey, via: "dismiss" }); }} title={isDigest ? "Dismiss all" : "Dismiss"} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:14,padding:"2px",lineHeight:1,flexShrink:0,marginTop:2}}>×</button>
              </div>;
            })}
            {visibleAggregated.length > 5 && <div style={{padding:"8px 16px",textAlign:"center"}}><span style={{fontSize:11,color:"var(--accent-text)",cursor:"pointer",fontWeight:600}} onClick={()=>{}}>+{visibleAggregated.length-5} more</span></div>}
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
