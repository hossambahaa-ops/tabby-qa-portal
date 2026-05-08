import React, { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { sb, SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";
import { safeError, logActivity } from "../../lib/utils.js";
import { listPlans } from "../../api/plans.js";
import { useConfirm } from "../../lib/hooks.jsx";
import { Icon, icons } from "../Icons.jsx";
import RichTextField from "./RichTextField.jsx";
import { useApp } from "../../lib/AppContext.jsx";
import {
  MEETING_TYPES,
  MEETING_TYPE_ENUM,
  TARGET_TYPES,
  PERF_OPTIONS,
  PERF_MESSAGES,
  SIG_TITLE_BY_ROLE,
  buildAutoCc,
  AMANDA_EMAIL,
} from "../../lib/coachingTemplates.js";
import { buildCoachingEmailBody, fmtCoachingDate } from "../../lib/coachingEmail.js";

export default function CoachingCompose({ roster, pickerCandidates, sessions, plans, planWeeks, gmailAuthorized, setGmailAuthorized, gmailChecking, connectGmail, callGmailFn, loadSessions }) {
  // Recipient picker pulls from the unified candidates list (roster + leads
  // + supervisors + manager + HOD + admins) so MPRs can address anyone, not
  // just QAs. Falls back to roster when the parent didn't supply candidates.
  const candidates = (pickerCandidates && pickerCandidates.length > 0) ? pickerCandidates : roster;
  const { token, profile, globalToast } = useApp();

  // Team → supervisor lookup. Walking only the qa_roster sometimes misses
  // the SV (lead's manager_email may not point to the SV's tabby email),
  // so we load the teams table which has supervisor_id explicitly.
  // Keyed `<queue>|<domain>` → supervisor email.
  //
  // Implementation: two simple queries instead of a PostgREST embed
  // (`sup:profiles!fk_teams_supervisor(email)`). The embed silently
  // returned null sup objects in some sessions, which left teamSvMap
  // empty and made auto-CC fall back to Amanda only. Two-query + JS
  // join is bulletproof.
  const [teamSvMap, setTeamSvMap] = useState({});
  // leadSvMap maps a lead's email -> their supervisor's email. Lets the CC
  // resolver work when the picker recipient is a lead, not a QA.
  const [leadSvMap, setLeadSvMap] = useState({});
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const teams = await sb.query("teams", {
          token,
          select: "name,domain,lead_id,supervisor_id",
        });
        const teamRows = Array.isArray(teams) ? teams : [];
        const ids = [...new Set([
          ...teamRows.map(t => t.supervisor_id).filter(Boolean),
          ...teamRows.map(t => t.lead_id).filter(Boolean),
        ])];
        if (ids.length === 0) { setTeamSvMap({}); setLeadSvMap({}); return; }
        const profs = await sb.query("profiles", {
          token,
          select: "id,email",
          filters: `id=in.(${ids.join(",")})`,
        });
        const emailById = new Map();
        for (const p of (Array.isArray(profs) ? profs : [])) {
          if (p.id && p.email) emailById.set(p.id, p.email.toLowerCase());
        }
        const tMap = {};
        const lMap = {};
        for (const t of teamRows) {
          const sv = emailById.get(t.supervisor_id);
          const ld = emailById.get(t.lead_id);
          if (t.name && t.domain && sv) tMap[`${t.name}|${t.domain}`] = sv;
          if (ld && sv) lMap[ld] = sv;
        }
        setTeamSvMap(tMap);
        setLeadSvMap(lMap);
      } catch {
        setTeamSvMap({});
        setLeadSvMap({});
      }
    })();
  }, [token]);

  // Form state
  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [meetingType, setMeetingType] = useState("1:1 Meeting");
  const [topics, setTopics] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [goals, setGoals] = useState("");
  const [actions, setActions] = useState("");
  const [perfRating, setPerfRating] = useState("");
  // Signature seeded silently from the logged-in profile. Title comes from
  // role; user no longer types either of these but they stay in state in
  // case a future "override signature" UI needs to flip them.
  const [sigName, setSigName] = useState(profile?.display_name || "");
  const [sigTitle, setSigTitle] = useState(SIG_TITLE_BY_ROLE[profile?.role] || "QA Lead");
  // Keep signature in sync with profile changes (e.g. when profile loads
  // after the component mounts).
  useEffect(() => {
    if (profile?.display_name) setSigName(prev => prev || profile.display_name);
    if (profile?.role) setSigTitle(prev => prev || SIG_TITLE_BY_ROLE[profile.role] || prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.display_name, profile?.role]);
  const [targetRows, setTargetRows] = useState([{metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
  const [outcome, setOutcome] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Form persistence (per-user) ──
  // Every field auto-saves to localStorage (debounced). On mount we
  // silently restore everything — no "draft from earlier" banner, no
  // Restore/Discard buttons. After a successful send we wipe storage
  // and reset the form to defaults so the next session starts clean.
  // The localStorage key is scoped to the signed-in email and the
  // payload records `createdBy` so a draft from another account on the
  // same browser is never restored.
  const myEmail = (profile?.email || "").toLowerCase();
  const draftKey = myEmail ? `coaching:draft:${myEmail}` : null;

  // `hydrated` gates the auto-template and auto-save effects until the
  // load-restore effect has run. Without it, the template effect fires
  // on first render (before profile loads), the auto-save then writes
  // the template back to localStorage 500 ms later, and that wipes out
  // the user's previously-typed body content before restore can run.
  const [hydrated, setHydrated] = useState(false);

  const draftHasContent = (d) => {
    if (!d) return false;
    return !!(d.toEmail || d.ccEmail || d.outcome || d.nextSteps || d.perfRating ||
              d.topics || d.strengths || d.weaknesses || d.goals || d.actions);
  };

  // One-time cleanup of legacy shared keys.
  useEffect(() => {
    try {
      localStorage.removeItem("coaching:draft");
      localStorage.removeItem("coaching:draft:anon");
    } catch {}
  }, []);

  // Silent restore on mount, then flip `hydrated` so the rest of the
  // form effects can run.
  useEffect(() => {
    if (!draftKey || !myEmail) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) { setHydrated(true); return; }
      const d = JSON.parse(raw);
      if (d && d.createdBy && d.createdBy.toLowerCase() !== myEmail) {
        localStorage.removeItem(draftKey);
        setHydrated(true);
        return;
      }
      if (!draftHasContent(d)) {
        localStorage.removeItem(draftKey);
        setHydrated(true);
        return;
      }
      if (d.toEmail !== undefined) setToEmail(d.toEmail);
      if (d.ccEmail !== undefined) setCcEmail(d.ccEmail);
      if (d.sessionDate !== undefined) setSessionDate(d.sessionDate);
      if (d.meetingType !== undefined) setMeetingType(d.meetingType);
      if (d.topics !== undefined) setTopics(d.topics);
      if (d.strengths !== undefined) setStrengths(d.strengths);
      if (d.weaknesses !== undefined) setWeaknesses(d.weaknesses);
      if (d.goals !== undefined) setGoals(d.goals);
      if (d.actions !== undefined) setActions(d.actions);
      if (d.perfRating !== undefined) setPerfRating(d.perfRating);
      if (d.sigName !== undefined) setSigName(d.sigName);
      if (d.sigTitle !== undefined) setSigTitle(d.sigTitle);
      if (Array.isArray(d.targetRows) && d.targetRows.length > 0) setTargetRows(d.targetRows);
      if (d.outcome !== undefined) setOutcome(d.outcome);
      if (d.nextSteps !== undefined) setNextSteps(d.nextSteps);
    } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEmail]);

  // Debounced auto-save — only after hydration so we never overwrite
  // the user's stored draft with the empty/template initial state.
  useEffect(() => {
    if (!draftKey || !myEmail || !hydrated) return;
    const t = setTimeout(() => {
      const d = { toEmail, ccEmail, sessionDate, meetingType, topics, strengths, weaknesses, goals, actions, perfRating, sigName, sigTitle, targetRows, outcome, nextSteps, savedAt: Date.now(), createdBy: myEmail };
      try {
        if (draftHasContent(d)) localStorage.setItem(draftKey, JSON.stringify(d));
        else localStorage.removeItem(draftKey);
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [hydrated, myEmail, draftKey, toEmail, ccEmail, sessionDate, meetingType, topics, strengths, weaknesses, goals, actions, perfRating, sigName, sigTitle, targetRows, outcome, nextSteps]);

  // Reset form to defaults — used after send + by the manual Clear button.
  // No more template prefill: content boxes start empty.
  const resetFormToDefaults = () => {
    setToEmail("");
    setCcEmail("");
    ccUserEditedRef.current = false;
    setSessionDate(new Date().toISOString().split("T")[0]);
    setMeetingType("1:1 Meeting");
    setTopics("");
    setStrengths("");
    setWeaknesses("");
    setGoals("");
    setActions("");
    setPerfRating("");
    setOutcome("");
    setNextSteps("");
    setTargetRows([{metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
    try { if (draftKey) localStorage.removeItem(draftKey); } catch {}
  };

  const isTargetType = TARGET_TYPES.includes(meetingType);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  // Date formatter is shared with the email builder.
  const fmtDate = fmtCoachingDate;

  // Listen for prefill from AP/PIP page
  const pendingPrefillRef = useRef(null);
  const pendingPrefillTypeRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      const emails = e.detail?.emails || (e.detail?.email ? [e.detail.email] : null);
      if (emails && emails.length > 0) {
        setToEmail(emails.join(", "));
        if (e.detail.type) setMeetingType(e.detail.type);
        pendingPrefillRef.current = emails[0];
        pendingPrefillTypeRef.current = e.detail.type;
      }
    };
    window.addEventListener("prefill-coaching", handler);
    return () => window.removeEventListener("prefill-coaching", handler);
  }, []);

  // Fill target rows from a plan object
  const fillTargetsFromPlan = (plan) => {
    if (!plan?.targets) return;
    pendingPrefillRef.current = null;
    try {
      const parsed = JSON.parse(plan.targets);
      const isMonthly = parsed.follow_up_mode === "monthly";
      const metrics = Array.isArray(parsed) ? parsed : (parsed.metrics || []);
      if (metrics.length === 0) return;
      const rows = metrics.map(t => {
        const wt = t.weekly_targets || [];
        return {
          metric: t.label || t.kpi_key || "",
          start: t.current_value != null ? String(Math.round(t.current_value)) : "",
          w1: wt[0] != null ? String(wt[0]) : (t.target_value ? String(t.target_value) : ""),
          w2: wt[1] != null ? String(wt[1]) : "",
          w3: wt[2] != null ? String(wt[2]) : "",
          w4: wt[3] != null ? String(wt[3]) : "",
          a1: "", a2: "", a3: "", a4: "", _kpi_key: t.kpi_key,
          _monthly: isMonthly,
        };
      });
      if (rows[0]?.metric) {
        setTargetRows(rows);
        if (plan.type === "pip") setMeetingType("PIP Review");
        else if (plan.type === "ap") setMeetingType("Action Plan Review");
        globalToast("success", `Targets loaded from ${plan.type.toUpperCase()} plan`);
      }
    } catch(e) { console.error("Fill targets:", e); }
  };

  // When toEmail changes OR plans loads, check if we need to fill targets
  useEffect(() => {
    if (!pendingPrefillRef.current) return;
    const email = pendingPrefillRef.current;
    const requestedType = pendingPrefillTypeRef.current;
    const wantType = requestedType === "PIP Review" ? "pip" : "ap";
    const plan = plans.find(p => p.qa_email?.toLowerCase() === email.toLowerCase() && p.type === wantType)
      || plans.find(p => p.qa_email?.toLowerCase() === email.toLowerCase());
    if (!plan) {
      if (plans.length === 0) {
        listPlans({ token, filters: `qa_email=eq.${email}&status=eq.active&type=eq.${wantType}` }).then(directPlans => {
          if (directPlans.length > 0) fillTargetsFromPlan(directPlans[0]);
        }).catch(() => {});
      }
      return;
    }
    fillTargetsFromPlan(plan);
  }, [toEmail, plans.length]);

  // Get previous sessions for selected member
  const memberHistory = sessions.filter(s => s.member_email?.toLowerCase() === toEmail.toLowerCase()).slice(0, 5);
  const ENUM_TO_LABEL = {"weekly_1on1":"1:1 Meeting","performance_review":"MPR","ad_hoc":"Coaching Session","ap_checkin":"Action Plan Review","pip_checkin":"PIP Review","return_from_leave":"Return from Leave"};

  // CC auto-fill: whenever the recipient changes (typed or picked), rebuild
  // CC from supervisor + Amanda, dropping whoever the sender is. The user
  // can still edit CC after — but they no longer have to manually type
  // anything for the common case.
  const ccUserEditedRef = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (ccUserEditedRef.current) return;
    const recipient = (toEmail || "").split(/[,;\s]+/).map(e => e.trim()).filter(Boolean)[0] || "";
    if (!recipient) return;
    const next = buildAutoCc(recipient, candidates, profile?.email, teamSvMap, leadSvMap);
    setCcEmail(next || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toEmail, candidates, profile?.email, teamSvMap, leadSvMap, hydrated]);

  // AP/PIP Integration: detect active plans for selected member
  const memberPlans = plans.filter(p => p.qa_email?.toLowerCase() === toEmail.toLowerCase());
  const memberActivePlan = memberPlans.find(p => meetingType === "PIP Review" ? p.type === "pip" : p.type === "ap") || memberPlans[0];
  const memberPlanWeeks = memberActivePlan ? planWeeks.filter(w => w.plan_id === memberActivePlan.id).sort((a, b) => a.week_number - b.week_number) : [];
  const nextUnfilledWeek = memberPlanWeeks.find(w => !w.actual_data);

  // Pre-fill templates were removed per Amanda 2026-05-07. The auto-apply
  // effect that used to populate topics/strengths/etc on meeting-type change
  // is gone too — content fields stay empty until the user types.

  // Target row helpers
  const addTargetRow = () => setTargetRows([...targetRows, {metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
  const removeTargetRow = (i) => setTargetRows(targetRows.filter((_,idx) => idx !== i));
  const updateTarget = (i, key, val) => {
    const rows = [...targetRows];
    rows[i] = {...rows[i], [key]: val};
    setTargetRows(rows);
  };

  // calcEom + calcDiff live in lib/coachingEmail.js with the email builder.

  const serializeTargets = () => targetRows.filter(r => r.metric.trim()).map(r => [r.metric, r.start, r.w1, r.w2, r.w3, r.w4, r.a1, r.a2, r.a3, r.a4].join("|")).join(";;");

  // Build email HTML — delegates to the pure formatter in lib/coachingEmail.js.
  const buildEmailBody = () => buildCoachingEmailBody({
    toEmail, meetingType, isTargetType, outcome, nextSteps,
    topics, strengths, weaknesses, goals, actions,
    perfRating, targetRows, sigName, sigTitle,
  });

  const emailSubject = `Session Summary: ${meetingType} - ${fmtDate(sessionDate)}`;

  // Save session and send via Gmail API
  const generateAndSend = async () => {
    if (!toEmail) { globalToast("error", "Enter the team member's email"); return; }
    if (!gmailAuthorized) {
      globalToast("error", "Please connect your Gmail account first");
      connectGmail();
      return;
    }
    setLoading(true);
    try {
      // Parse toEmail for multiple recipients (comma/space separated)
      const memberEmails = toEmail.split(/[,;\s]+/).map(e=>e.trim()).filter(Boolean);
      // Create one coaching session record per member (group coaching)
      for (const em of memberEmails) {
        await sb.query("coaching_sessions", {
          token, method: "POST",
          body: {
            sender_email: profile?.email || "",
            member_email: em,
            cc_email: ccEmail,
            session_date: sessionDate,
            meeting_type: MEETING_TYPE_ENUM[meetingType] || "ad_hoc",
            topics, strengths, weaknesses, goals,
            action_items: actions,
            performance_rating: perfRating,
            target_data: isTargetType ? serializeTargets() : null,
            follow_up: false,
            outcome: outcome || null,
            next_steps: nextSteps || null,
            sig_name: sigName,
            sig_title: sigTitle,
            email_subject: emailSubject,
          }
        });
      }

      try {
        // Defense-in-depth: each RichTextField sanitises its own output on
        // every keystroke so the values in state are already clean. Run a
        // final DOMPurify pass right before the email leaves the app so a
        // future field that forgets to sanitise on input can't regress
        // recipients into receiving raw HTML.
        const htmlBody = DOMPurify.sanitize(buildEmailBody(), {
          ALLOWED_TAGS: ["p","br","b","strong","i","em","u","ul","ol","li","a","div","span","table","thead","tbody","tr","th","td"],
          ALLOWED_ATTR: ["href","target","rel","style"],
        });
        const result = await callGmailFn({
          action: "send",
          to: toEmail,
          cc: ccEmail,
          subject: emailSubject,
          htmlBody,
          replyTo: profile?.email || "",
        });

        if (result.success) {
          globalToast("success", "Email sent & session logged");
        } else if (result.reauth) {
          setGmailAuthorized(false);
          globalToast("error", "Gmail authorization expired. Please reconnect Gmail and try again.");
        } else {
          globalToast("error", "Session saved but email failed: " + (result.error || "Unknown error"));
        }
      } catch(emailErr) {
        console.error("Email error:", emailErr);
        globalToast("error", "Session saved but email failed: " + emailErr.message);
      }

      // Refresh history
      const s = await loadSessions();

      // AP/PIP Write-back
      if (isTargetType && memberActivePlan && nextUnfilledWeek) {
        try {
          const KPI_RAW_KEYS = { "Occupancy": "occupancy", "Coaching On-Time": "coaching", "Calibration": "calibration", "Coaching Observation": "observation", "RTR Score": "rtr" };
          const actualData = {};
          targetRows.forEach(r => {
            const kpiKey = r._kpi_key || KPI_RAW_KEYS[r.metric];
            if (kpiKey) {
              const val = [r.a4, r.a3, r.a2, r.a1].find(v => v !== "" && v !== undefined);
              if (val !== undefined && val !== "") actualData[kpiKey] = parseFloat(val);
            }
          });

          if (Object.keys(actualData).length > 0) {
            const weekTargetData = (() => { try { return JSON.parse(nextUnfilledWeek.target_data || "{}"); } catch { return {}; } })();
            const metTargets = Object.keys(weekTargetData).every(key => {
              const actual = actualData[key];
              const target = weekTargetData[key];
              return actual !== null && actual !== undefined && target !== undefined && actual >= target;
            });

            const latestSession = s.find(sess => sess.member_email?.toLowerCase() === toEmail.toLowerCase() && sess.session_date === sessionDate);

            await sb.query("action_plan_weeks", {
              token, method: "PATCH",
              body: {
                actual_data: JSON.stringify(actualData),
                met_targets: metTargets,
                coaching_session_id: latestSession?.id || null,
                updated_at: new Date().toISOString(),
              },
              filters: `id=eq.${nextUnfilledWeek.id}`,
            });
            globalToast("success", `Email sent & Week ${nextUnfilledWeek.week_number} actuals written to ${memberActivePlan.type.toUpperCase()} plan${metTargets ? " ✅ Targets met!" : " ❌ Targets not met"}`);
          } else {
            globalToast("success", "Email sent and session logged successfully!");
          }
        } catch (e) {
          console.error("AP/PIP write-back:", e);
          globalToast("success", "Email sent! (Note: could not write back to AP/PIP plan)");
        }
      } else {
        globalToast("success", "Email sent and session logged successfully!");
      }
      logActivity(token, profile?.email, "coaching_session_created", "coaching_sessions", null, `Member: ${toEmail}, Type: ${meetingType}`);
      // Wipe storage and reset the form to a clean default-template
      // state for the next session.
      resetFormToDefaults();
      setShowPreview(false);
    } catch (e) {
      globalToast("error", safeError(e));
    }
    setLoading(false);
  };

  // Manual "Clear all" button.
  const clearForm = () => {
    resetFormToDefaults();
    setShowPreview(false);
  };

  return (<>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

      {/* LEFT — Form */}
      <div style={{display:"flex",flexDirection:"column",gap:16}}>

        {/* Signature block was removed per Amanda 2026-05-07. The signature
            now auto-fills from the logged-in profile (display_name + role),
            shown read-only in the email preview. */}

        {/* Session details */}
        <div className="card">
          <div className="card-header"><span className="card-title">Session details</span></div>
          <div className="form-grid">
            <div className="form-group" style={{position:"relative"}}><label className="form-label">Member</label>
              <input className="form-input" value={toEmail} onChange={e=>{setToEmail(e.target.value); ccUserEditedRef.current = false;}} placeholder="Type name or email..." autoComplete="off"/>
              {toEmail && !candidates.find(r=>r.email===toEmail) && (() => {
                const q = toEmail.toLowerCase();
                const matches = candidates.filter(r => (r.email||"").toLowerCase().includes(q) || (r.display_name||"").toLowerCase().includes(q)).slice(0, 8);
                if (!matches.length) return null;
                return <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:"0 0 var(--radius) var(--radius)",boxShadow:"var(--shadow-lg)",maxHeight:200,overflowY:"auto"}}>
                  {matches.map(r => <div key={r.email} onClick={()=>{setToEmail(r.email); ccUserEditedRef.current = false; setCcEmail(buildAutoCc(r.email, candidates, profile?.email, teamSvMap, leadSvMap));}} style={{padding:"8px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontWeight:500}}>{r.email}</span>
                    <span style={{color:"var(--tx3)",fontSize:11}}>{r.display_name || nameFromEmail(r.email)}</span>
                  </div>)}
                </div>;
              })()}
            </div>
            <div className="form-group"><label className="form-label">CC (Supervisor + Amanda)</label>
              <input className="form-input" value={ccEmail} onChange={e=>{setCcEmail(e.target.value); ccUserEditedRef.current = true;}} placeholder={`supervisor@tabby.ai, ${AMANDA_EMAIL}`}/>
            </div>
            <div className="form-group"><label className="form-label">Session date</label><input type="date" className="form-input" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">Meeting type</label>
              <select className="select form-input" value={meetingType} onChange={e=>setMeetingType(e.target.value)}>
                {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Previous sessions for this member */}
          {toEmail && memberHistory.length > 0 && <div style={{marginTop:16,padding:"12px 14px",background:"var(--bg)",borderRadius:8}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--tx2)",marginBottom:8}}>Previous sessions ({memberHistory.length})</div>
            {memberHistory.map(s => (
              <div key={s.id} style={{fontSize:12,padding:"4px 0",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between"}}>
                <span>{new Date(s.session_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"})}</span>
                <span style={{padding:"1px 8px",borderRadius:10,fontSize:10,fontWeight:600,background:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red-bg)":"var(--green-bg)",color:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red)":"var(--green)"}}>{ENUM_TO_LABEL[s.meeting_type]||s.meeting_type}</span>
                {s.performance_rating && <span style={{color:"var(--tx2)"}}>{s.performance_rating}</span>}
              </div>
            ))}
          </div>}
        </div>

        {/* Active AP/PIP plan notice */}
        {toEmail && memberPlans.length > 0 && <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {memberPlans.map(mp => {
            const isPip = mp.type === "pip";
            const mpWeeks = planWeeks.filter(w => w.plan_id === mp.id).sort((a, b) => a.week_number - b.week_number);
            const filled = mpWeeks.filter(w => w.actual_data).length;
            return <div key={mp.id} style={{padding:"12px 16px",background:isPip?"var(--red-bg)":"var(--amber-bg)",borderRadius:8,border:`1px solid ${isPip?"var(--red)":"var(--amber)"}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18}}>{isPip?"⚠️":"📋"}</span>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:isPip?"var(--red)":"var(--amber)"}}>Active {mp.type.toUpperCase()} plan</div>
                  <div style={{fontSize:11,color:"var(--tx2)"}}>
                    {filled} of {mp.duration_weeks} periods filled · {mpWeeks.find(w=>!w.actual_data) ? "Next review due" : "All filled"}
                  </div>
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => fillTargetsFromPlan(mp)} style={{fontWeight:600}}>
                Pull {mp.type.toUpperCase()} targets
              </button>
            </div>;
          })}
        </div>}

        {/* Template bar removed (Amanda 2026-05-07) — fields stay empty
            until the user types. */}

        {/* Content fields — light rich-text editors with bold / italic /
            bullets / link. HTML is sanitized on every keystroke before
            it leaves the editor. */}
        <div className="card">
          <div className="card-header"><span className="card-title">Session content</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[["topics","Topics discussed",topics,setTopics],["strengths","Strengths observed",strengths,setStrengths],["weaknesses","Areas for improvement",weaknesses,setWeaknesses],["goals","Goals & progress update",goals,setGoals],["actions","Action items / next steps",actions,setActions]].map(([id,label,val,setter]) => (
              <div className="form-group" key={id}><label className="form-label">{label}</label>
                <RichTextField value={val} onChange={setter} placeholder="Type your notes — use the toolbar for bold, italic, bullets, or links" maxChars={2000} />
              </div>
            ))}
          </div>
        </div>

        {/* Performance rating */}
        <div className="card">
          <div className="card-header"><span className="card-title">Performance rating</span></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5, 1fr)",gap:6}}>
            {PERF_OPTIONS.map(p => (
              <button key={p.val} onClick={()=>setPerfRating(perfRating===p.val?"":p.val)} style={{
                padding:"12px 4px",border:perfRating===p.val?`2px solid ${p.color}`:"1.5px solid var(--bd)",
                borderRadius:8,background:perfRating===p.val?p.bg:"var(--bg)",cursor:"pointer",textAlign:"center",
                fontSize:11,fontWeight:perfRating===p.val?700:500,color:perfRating===p.val?p.color:"var(--tx2)",
                fontFamily:"var(--font)",transition:"all .15s",lineHeight:1.3
              }}>
                <div style={{fontSize:18,marginBottom:4}}>{p.emoji}</div>{p.val}
              </button>
            ))}
          </div>
        </div>

        {/* Target table (AP/PIP only) */}
        {isTargetType && <div className="card" style={{border:"1.5px solid var(--red)",borderColor:"var(--red)"}}>
          {(()=>{
            const isMonthlyPlan = targetRows[0]?._monthly;
            const colLabels = isMonthlyPlan ? ["M1","M2","M3","M4"] : ["W1","W2","W3","W4"];
            return <>
          <div className="card-header"><span className="card-title" style={{color:"var(--accent)"}}>{isMonthlyPlan ? "Monthly" : "Weekly"} QA Review — Score Tracking</span>
            <button className="btn btn-outline btn-sm" onClick={addTargetRow}><Icon d={icons.plus} size={14}/>Add metric</button>
          </div>
          <div className="table-wrap">
            <table style={{fontSize:12}}>
              <thead><tr>
                <th>Metric</th><th>Row</th><th>Start</th>{colLabels.map(c=><th key={c}>{c}</th>)}<th>EOM</th><th style={{width:30}}></th>
              </tr></thead>
              <tbody>
                {targetRows.map((r, ri) => {
                  const tEom = calcEom([r.w1,r.w2,r.w3,r.w4]);
                  const aEom = calcEom([r.a1,r.a2,r.a3,r.a4]);
                  const rowBg = ri%2===0?"transparent":"var(--bg)";
                  return (<React.Fragment key={ri}>
                    <tr style={{background:rowBg}}>
                      <td rowSpan={3} style={{fontWeight:600,fontSize:12,verticalAlign:"middle",minWidth:100}}>
                        <input className="form-input" value={r.metric} onChange={e=>updateTarget(ri,"metric",e.target.value)} placeholder="Metric name" style={{padding:"4px 6px",fontSize:12,fontWeight:600,border:"none",background:"transparent",color:"var(--tx)"}}/>
                      </td>
                      <td style={{fontSize:10,fontWeight:600,color:"var(--green)",padding:"2px 6px"}}>Target</td>
                      <td><input className="form-input" type="number" value={r.start} onChange={e=>updateTarget(ri,"start",e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent",color:"var(--tx)"}}/></td>
                      {["w1","w2","w3","w4"].map(k => <td key={k}><input className="form-input" type="number" value={r[k]} onChange={e=>updateTarget(ri,k,e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent",color:"var(--tx)"}}/></td>)}
                      <td style={{fontWeight:700,textAlign:"center",color:"var(--green)",fontSize:12}}>{tEom !== null ? tEom+"%" : "—"}</td>
                      <td rowSpan={3} style={{textAlign:"center",verticalAlign:"middle"}}>
                        <button onClick={()=>removeTargetRow(ri)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:14,padding:2}}>×</button>
                      </td>
                    </tr>
                    <tr style={{background:rowBg}}>
                      <td style={{fontSize:10,fontWeight:600,color:"var(--amber)",padding:"2px 6px"}}>Actual</td>
                      <td style={{color:"var(--tx3)",textAlign:"center",fontSize:11}}>—</td>
                      {["a1","a2","a3","a4"].map(k => <td key={k}><input className="form-input" type="number" value={r[k]} onChange={e=>updateTarget(ri,k,e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent",color:"var(--tx)"}}/></td>)}
                      <td style={{fontWeight:700,textAlign:"center",fontSize:12,
                        color:aEom!==null&&tEom!==null?(aEom>=tEom?"var(--green)":"var(--red)"):"var(--amber)"
                      }}>{aEom !== null ? aEom+"%" : "—"}</td>
                    </tr>
                    <tr style={{background:rowBg,borderBottom:"1px solid var(--bd2)"}}>
                      <td style={{fontSize:10,fontWeight:600,color:"var(--tx3)",padding:"2px 6px"}}>Diff</td>
                      <td style={{color:"var(--tx3)",textAlign:"center",fontSize:11}}>—</td>
                      {["w1","w2","w3","w4"].map((wk,wi) => {
                        const d = calcDiff(r[wk], r["a"+(wi+1)]);
                        return <td key={wk} style={{textAlign:"center",fontSize:12,fontWeight:d!==null?700:400,
                          color:d!==null?(d>0?"var(--green)":d<0?"var(--red)":"var(--tx3)"):"var(--tx3)"
                        }}>{d !== null ? (d>0?"+":"")+d+"%" : "—"}</td>;
                      })}
                      {(() => {
                        if (aEom !== null && tEom !== null) {
                          const ed = Math.round((aEom - tEom) * 10) / 10;
                          return <td style={{textAlign:"center",fontSize:12,fontWeight:700,
                            color:ed>0?"var(--green)":ed<0?"var(--red)":"var(--tx3)"
                          }}>{ed>0?"+":""}{ed}%</td>;
                        }
                        return <td style={{textAlign:"center",color:"var(--tx3)"}}>—</td>;
                      })()}
                    </tr>
                  </React.Fragment>);
                })}
              </tbody>
            </table>
          </div>
          <div style={{fontSize:10,color:"var(--tx3)",marginTop:6,fontStyle:"italic"}}>EOM = average of filled weekly values. Difference = Actual minus Target.</div>

          {/* Conclusion */}
          <div style={{marginTop:16,padding:"14px",background:"var(--bg)",borderRadius:8,border:"1px solid var(--bd2)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--tx2)",marginBottom:10}}>Conclude {meetingType === "PIP Review" ? "PIP" : "Action Plan"}</div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button onClick={()=>setOutcome(outcome==="pass"?"":"pass")} className={`btn ${outcome==="pass"?"btn-primary":"btn-outline"}`} style={outcome==="pass"?{background:"var(--green)",color:"#fff"}:{}}>✅ Passed</button>
              <button onClick={()=>setOutcome(outcome==="fail"?"":"fail")} className={`btn ${outcome==="fail"?"btn-primary":"btn-outline"}`} style={outcome==="fail"?{background:"var(--red)",color:"#fff"}:{}}>❌ Did Not Pass</button>
            </div>
            {outcome==="fail" && <div className="form-group" style={{marginTop:8}}>
              <label className="form-label">Agreed next steps / consequence</label>
              <RichTextField value={nextSteps} onChange={setNextSteps} placeholder="Describe the formal next steps..." maxChars={2000} />
              <div style={{marginTop:8,padding:"8px 12px",background:"var(--red-bg)",borderRadius:6,fontSize:12,color:"var(--red)",fontWeight:500}}>Please add HR to the CC field before sending.</div>
            </div>}
          </div>
        </>; })()}</div>}

        {/* Action buttons */}
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-primary" onClick={()=>setShowPreview(true)} style={{flex:1}}><Icon d={icons.check} size={16}/>Preview email</button>
          <button className="btn btn-outline" onClick={clearForm}>Clear all</button>
        </div>
      </div>

      {/* RIGHT — Preview */}
      <div>
        <div className="card" style={{position:"sticky",top:20}}>
          <div className="card-header"><span className="card-title">Email preview</span>
            <span style={{fontSize:12,color:"var(--tx3)"}}>{showPreview ? "Ready to send" : "Waiting for input"}</span>
          </div>
          {!showPreview ? (
            <div className="placeholder" style={{padding:"60px 20px"}}>
              <div className="placeholder-icon"><Icon d={icons.coaching} size={28}/></div>
              <p style={{color:"var(--tx3)"}}>Fill in the session details, then click<br/><strong>Preview Email</strong></p>
            </div>
          ) : (<div>
            <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>TO:</span> {toEmail}</div>
            {ccEmail && <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>CC:</span> {ccEmail}</div>}
            <div style={{fontSize:13,marginBottom:4}}><span style={{color:"var(--tx3)",fontWeight:600,fontSize:11}}>FROM:</span> {profile?.email}</div>
            <div style={{fontWeight:700,fontSize:15,padding:"12px 0",borderTop:"1px solid var(--bd2)",borderBottom:"1px solid var(--bd2)",margin:"10px 0 14px"}}>{emailSubject}</div>
            <div style={{background:"#fff",color:"#1a1a1a",padding:"20px",borderRadius:8,fontSize:13,lineHeight:1.85,maxHeight:500,overflowY:"auto"}} dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(buildEmailBody())}}/>

            <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--bd2)"}}>
              <button className="btn btn-primary" onClick={generateAndSend} disabled={loading || gmailChecking} style={{width:"100%",justifyContent:"center",padding:"12px"}}>
                {loading ? "Sending via Gmail..." : gmailChecking ? "Checking Gmail..." : !gmailAuthorized ? <><Icon d={icons.coaching} size={16}/>Connect Gmail & send</> : <><Icon d={icons.coaching} size={16}/>Send email & log session</>}
              </button>
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>{
                  const body = buildEmailBody();
                  navigator.clipboard.writeText("Subject: "+emailSubject+"\n\n"+document.createElement("div").innerHTML);
                  globalToast("success","Copied to clipboard");
                }}>Copy text</button>
                <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>setShowPreview(false)}>Edit</button>
              </div>
            </div>
          </div>)}
        </div>
      </div>
    </div>
  </>);
}
