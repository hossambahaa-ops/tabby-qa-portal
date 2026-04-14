import React, { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { hasRole } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity } from "../lib/utils.js";
import { useToast, useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { PulseLoader } from "../components/Charts.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";

function CoachingPage({token, profile, gf}) {
  const [tab, setTab] = useState("compose"); // compose | history
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [activePlans, setActivePlans] = useState([]);
  const [planWeeks, setPlanWeeks] = useState([]);
  const {show, el} = useToast();
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  // Gmail OAuth state
  const [gmailAuthorized, setGmailAuthorized] = useState(false);
  const [gmailChecking, setGmailChecking] = useState(true);

  const GMAIL_EDGE_FN = `${SUPABASE_URL}/functions/v1/gmail-auth`;

  // Helper to call the gmail-auth edge function
  const callGmailFn = async (body) => {
    const r = await fetch(GMAIL_EDGE_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  // Check Gmail auth status on mount + handle OAuth callback
  useEffect(() => {
    (async () => {
      // Check if returning from Gmail OAuth
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      if (code && state === "gmail_oauth") {
        // Exchange the code for tokens via edge function
        try {
          const result = await callGmailFn({ action: "exchange", code });
          if (result.success) {
            setGmailAuthorized(true);
            show("success", "Gmail connected successfully! You can now send emails directly.");
          } else {
            show("error", "Gmail authorization failed: " + (result.error || "Unknown error"));
          }
        } catch (e) {
          console.error("Gmail OAuth exchange:", e);
          show("error", "Failed to complete Gmail authorization");
        }
        // Clean URL
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      }
      // Check if user already has valid Gmail tokens
      try {
        const status = await callGmailFn({ action: "check" });
        setGmailAuthorized(status.authorized === true);
      } catch (e) {
        console.error("Gmail check:", e);
      }
      setGmailChecking(false);
    })();
  }, [token]);

  // Start Gmail OAuth flow
  const connectGmail = async () => {
    try {
      const result = await callGmailFn({ action: "get_auth_url" });
      if (result.authUrl) {
        // Save current page hash so we return to coaching after OAuth
        sessionStorage.setItem("gmail_oauth_return", "coaching");
        window.location.href = result.authUrl;
      } else {
        show("error", "Could not get Gmail authorization URL");
      }
    } catch (e) {
      show("error", "Failed to start Gmail authorization");
    }
  };

  // Disconnect Gmail
  const disconnectGmail = () => {
    confirmAsk("Disconnect Gmail?","You will need to re-authorize to send emails.",async()=>{
      try {
        await callGmailFn({ action: "disconnect" });
        setGmailAuthorized(false);
        show("success", "Gmail disconnected");
      } catch (e) {
        show("error", "Failed to disconnect Gmail");
      }
    },"Disconnect","var(--red)");
  };

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
  const [sigName, setSigName] = useState(profile?.display_name || "");
  const [sigTitle, setSigTitle] = useState("QA Lead");

  // Target table state (for AP/PIP reviews)
  const [targetRows, setTargetRows] = useState([{metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);

  // Conclusion state
  const [outcome, setOutcome] = useState("");
  const [nextSteps, setNextSteps] = useState("");

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilterBy, setHistoryFilterBy] = useState("all"); // all | my_sessions

  const MEETING_TYPES = ["1:1 Meeting","MPR","Coaching Session","Weekly Check-in","Action Plan Review","PIP Review"];
  const MEETING_TYPE_ENUM = {"1:1 Meeting":"weekly_1on1","MPR":"performance_review","Coaching Session":"ad_hoc","Weekly Check-in":"weekly_1on1","Action Plan Review":"ap_checkin","PIP Review":"pip_checkin"};
  const ENUM_TO_LABEL = {"weekly_1on1":"1:1 Meeting","performance_review":"MPR","ad_hoc":"Coaching Session","ap_checkin":"Action Plan Review","pip_checkin":"PIP Review","return_from_leave":"Return from Leave"};
  const TARGET_TYPES = ["Action Plan Review","PIP Review"];
  const isTargetType = TARGET_TYPES.includes(meetingType);

  const PERF_OPTIONS = [
    {val:"Needs Attention",emoji:"⚠️",bg:"var(--red-bg)",color:"var(--red)"},
    {val:"Below Expectations",emoji:"📉",bg:"var(--amber-bg)",color:"var(--amber)"},
    {val:"Meets Expectations",emoji:"✅",bg:"var(--green-bg)",color:"var(--green)"},
    {val:"Exceeds Expectations",emoji:"⭐",bg:"var(--accent-light)",color:"var(--accent-text)"},
    {val:"Outstanding",emoji:"🏆",bg:"var(--accent-light)",color:"var(--accent-text)"},
  ];

  const PERF_MESSAGES = {
    "Outstanding":"Your dedication and quality of work have set a commendable standard for the team. This level of performance is highly valued and acknowledged.",
    "Exceeds Expectations":"You have consistently gone beyond the required scope of your responsibilities, demonstrating strong professional commitment.",
    "Meets Expectations":"You are fulfilling your responsibilities in a satisfactory manner and are encouraged to continue building on this foundation.",
    "Below Expectations":"There are areas that require immediate attention and improvement. I am confident in your ability to address these with focus and commitment.",
    "Needs Attention":"I would like us to work closely together to identify the root causes and establish a clear action plan."
  };

  const INTRO_MAP = {
    "1:1 Meeting":"This is a formal summary of our weekly 1:1 meeting.",
    "MPR":"This is a formal summary of your MPR session.",
    "Coaching Session":"This is a formal summary of your Coaching Session.",
    "Weekly Check-in":"This is a formal summary of our Weekly Check-in.",
    "Action Plan Review":"This is a formal summary of your Action Plan Review. Please review your weekly targets and progress carefully.",
    "PIP Review":"This is a formal summary of your Performance Improvement Plan (PIP) Review. Please review your weekly targets and progress carefully."
  };

  const TEMPLATES = {
    "1:1 Meeting":{topics:"Weekly performance update\nTeam challenges and support needed\nCareer development discussion",strengths:"Consistent quality of work\nStrong communication with team members",weaknesses:"Time management on complex cases\nEscalation handling",goals:"Improve first response resolution rate\nComplete pending training module",actions:"Share weekly self-assessment by Thursday\nSchedule shadowing session with senior agent"},
    "Coaching Session":{topics:"Calibration score review\nSpecific case analysis\nScoring accuracy discussion",strengths:"Improvement noted in handling complex cases\nGood alignment with quality standards",weaknesses:"Soft skills in resolution communication\nAttribute scoring consistency",goals:"Reach calibration alignment score above 85%\nReduce scoring deviation",actions:"Review 5 calibration cases before next session\nComplete RTR self-practice twice this week"},
    "Weekly Check-in":{topics:"Weekly scorecard review\nCurrent challenges and blockers\nPriorities for the coming week",strengths:"Maintained consistent quality scores\nProactive communication",weaknesses:"Areas needing attention this week",goals:"Hit weekly targets across all KPIs",actions:"Focus on identified weak areas\nFlag any support needs by Wednesday"},
    "Action Plan Review":{topics:"Weekly target progress review\nCalibration score performance\nRTR session completion\nQuality consistency",strengths:"Commitment to improvement plan\nAttendance and engagement in sessions",weaknesses:"Areas where targets were not fully met\nSpecific attribute scoring gaps",goals:"Achieve agreed weekly targets\nImprove calibration alignment score",actions:"Complete weekly RTR sessions as agreed\nAttend all calibration sessions\nSubmit weekly self-review"},
    "PIP Review":{topics:"PIP target progress review\nDetailed performance metrics discussion\nSupport and resources assessment",strengths:"Positive steps taken during PIP period\nEngagement with coaching sessions",weaknesses:"Areas where PIP targets were not met\nRoot causes identified",goals:"Meet all PIP performance targets\nDemonstrate sustained improvement",actions:"Complete all agreed PIP actions\nMeet with HR for formal review\nSubmit weekly progress log"},
    "MPR":{topics:"Overall performance review for the period\nKey achievements and highlights\nAreas requiring development",strengths:"Demonstrated ownership of quality metrics\nPositive attitude and team collaboration",weaknesses:"Consistency across all ticket categories\nDocumentation quality",goals:"Achieve target KPI scores for next quarter\nComplete mandatory compliance training",actions:"Submit self-appraisal form by end of week\nAgree on development plan for next period"},
  };

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const firstNameFromEmail = (email) => {
    if (!email) return "Team Member";
    const f = email.split("@")[0].split(/[.\-_]/)[0];
    return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
  };

  const fmtDate = (s) => {
    if (!s) return "";
    try { return new Date(s+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"}); }
    catch { return s; }
  };

  // Load roster + history
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [r, s, ap, apw] = await Promise.all([
          dataCache.fetch("qa_roster",()=>sb.query("qa_roster", {select:"email,display_name,manager_email,queue",token}).catch((e)=>{console.error("roster err:",e);return[];})),
          sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch((e)=>{console.error("sessions err:",e);return[];}),
          sb.query("action_plans", {select:"*",filters:"status=eq.active",token}).catch((e)=>{console.error("ap err:",e);return[];}),
          sb.query("action_plan_weeks", {select:"*",filters:"order=plan_id.asc,week_number.asc",token}).catch((e)=>{console.error("apw err:",e);return[];}),
        ]);
        const sessionsArr = Array.isArray(s) ? s : [];
        const rosterArr = Array.isArray(r) ? r : [];
        const plansArr = Array.isArray(ap) ? ap : [];
        const svDomainC=profile?.operational_domain||profile?.domain||"tabby.ai";
        const isAdminC=hasRole(profile?.role,"admin");
        const isSvC=hasRole(profile?.role,"qa_supervisor")&&!isAdminC;
        let filteredRoster=isSvC?rosterArr.filter(x=>x.email?.endsWith("@"+svDomainC)):rosterArr;
        let filteredSessions=isSvC?sessionsArr.filter(x=>x.member_email?.endsWith("@"+svDomainC)):sessionsArr;
        let filteredPlans=isSvC?plansArr.filter(x=>x.qa_email?.endsWith("@"+svDomainC)):plansArr;
        // Apply global filters
        if(gf?.domain){filteredRoster=filteredRoster.filter(x=>x.email?.endsWith("@"+gf.domain));filteredSessions=filteredSessions.filter(x=>x.member_email?.endsWith("@"+gf.domain));filteredPlans=filteredPlans.filter(x=>x.qa_email?.endsWith("@"+gf.domain));}
        if(gf?.people?.length>0){filteredRoster=filteredRoster.filter(x=>gf.people.includes(x.email?.toLowerCase()));filteredSessions=filteredSessions.filter(x=>gf.people.includes(x.member_email?.toLowerCase()));filteredPlans=filteredPlans.filter(x=>gf.people.includes(x.qa_email?.toLowerCase()));}
        if(gf?.teams?.length>0){const rm=window.__gfRoster||{};filteredRoster=filteredRoster.filter(x=>{const q=rm[x.email?.toLowerCase()];return q&&gf.teams.includes(q);});}
        setRoster(filteredRoster);
        setSessions(filteredSessions);
        setActivePlans(filteredPlans);
        setPlanWeeks(apw);
      } catch (e) { console.error("Coaching load:", e); }
    })();
  }, [token]);

  // Listen for prefill from AP/PIP page
  const pendingPrefillRef = useRef(null);
  const pendingPrefillTypeRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.email) {
        setToEmail(e.detail.email);
        setTab("compose");
        if (e.detail.type) setMeetingType(e.detail.type);
        pendingPrefillRef.current = e.detail.email;
        pendingPrefillTypeRef.current = e.detail.type;
      }
    };
    window.addEventListener("prefill-coaching", handler);
    return () => window.removeEventListener("prefill-coaching", handler);
  }, []);

  // When toEmail changes OR activePlans loads, check if we need to fill targets
  useEffect(() => {
    if (!pendingPrefillRef.current) return;
    const email = pendingPrefillRef.current;
    const requestedType = pendingPrefillTypeRef.current;
    // Match by plan type: "PIP Review" → pip, "Action Plan Review" → ap
    const wantType = requestedType === "PIP Review" ? "pip" : "ap";
    const plan = activePlans.find(p => p.qa_email?.toLowerCase() === email.toLowerCase() && p.type === wantType)
      || activePlans.find(p => p.qa_email?.toLowerCase() === email.toLowerCase());
    if (!plan) {
      if (activePlans.length === 0) {
        sb.query("action_plans", {select:"*", filters:`qa_email=eq.${email}&status=eq.active&type=eq.${wantType}`, token}).then(directPlans => {
          if (directPlans.length > 0) fillTargetsFromPlan(directPlans[0]);
        }).catch(() => {});
      }
      return;
    }
    fillTargetsFromPlan(plan);
  }, [toEmail, activePlans.length]);

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
        show("success", `Targets loaded from ${plan.type.toUpperCase()} plan`);
      }
    } catch(e) { console.error("Fill targets:", e); }
  };

  // Get previous sessions for selected member
  const memberHistory = sessions.filter(s => s.member_email?.toLowerCase() === toEmail.toLowerCase()).slice(0, 5);

  // ── AP/PIP Integration: detect active plans for selected member ──
  const memberPlans = activePlans.filter(p => p.qa_email?.toLowerCase() === toEmail.toLowerCase());
  const memberActivePlan = memberPlans.find(p => meetingType === "PIP Review" ? p.type === "pip" : p.type === "ap") || memberPlans[0];
  const memberPlanWeeks = memberActivePlan ? planWeeks.filter(w => w.plan_id === memberActivePlan.id).sort((a, b) => a.week_number - b.week_number) : [];
  const nextUnfilledWeek = memberPlanWeeks.find(w => !w.actual_data);

  // Manual button handler for auto-fill
  const autoFillFromPlan = () => {
    if (memberActivePlan) fillTargetsFromPlan(memberActivePlan);
  };

  // Apply template
  const applyTemplate = (forceType) => {
    const t = TEMPLATES[forceType || meetingType];
    if (!t) return;
    setTopics(t.topics || "");
    setStrengths(t.strengths || "");
    setWeaknesses(t.weaknesses || "");
    setGoals(t.goals || "");
    setActions(t.actions || "");
    if (!forceType) show("success", "Template applied");
  };

  // Auto-apply template when meeting type changes and fields are empty
  useEffect(() => {
    if (!topics && !strengths && !weaknesses && !goals && !actions) {
      const t = TEMPLATES[meetingType];
      if (t) {
        setTopics(t.topics || "");
        setStrengths(t.strengths || "");
        setWeaknesses(t.weaknesses || "");
        setGoals(t.goals || "");
        setActions(t.actions || "");
      }
    }
  }, [meetingType]);

  // Target row helpers
  const addTargetRow = () => setTargetRows([...targetRows, {metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
  const removeTargetRow = (i) => setTargetRows(targetRows.filter((_,idx) => idx !== i));
  const updateTarget = (i, key, val) => {
    const rows = [...targetRows];
    rows[i] = {...rows[i], [key]: val};
    setTargetRows(rows);
  };

  const calcEom = (vals) => {
    const nums = vals.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    return nums.length ? Math.round(nums.reduce((a,b) => a+b, 0) / nums.length) : null;
  };

  const calcDiff = (target, actual) => {
    const t = parseFloat(target), a = parseFloat(actual);
    if (isNaN(t) || isNaN(a) || !actual) return null;
    return Math.round((a - t) * 10) / 10;
  };

  // Serialize target rows
  const serializeTargets = () => targetRows.filter(r => r.metric.trim()).map(r => [r.metric,r.start,r.w1,r.w2,r.w3,r.w4,r.a1,r.a2,r.a3,r.a4].join("|")).join(";;");

  // Build email HTML
  const buildEmailBody = () => {
    const fn = firstNameFromEmail(toEmail);
    const isConclusion = isTargetType && outcome;
    const planName = meetingType === "PIP Review" ? "Performance Improvement Plan" : "Action Plan";
    let html = "";

    // Greeting
    html += `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#1a1a1a;max-width:680px;">`;
    html += `<p style="margin:0 0 16px;"><span style="background:#E8F5E8;color:#1A3D2B;padding:5px 16px;border-radius:20px;font-weight:700;font-size:12px;letter-spacing:.03em;">${meetingType}</span></p>`;
    html += `<p style="margin:0 0 16px;">Dear ${fn},</p>`;

    // Conclusion or intro
    if (isConclusion && outcome === "pass") {
      html += `<p style="margin:0 0 20px;">I am pleased to formally confirm that you have successfully completed your ${planName}. Your commitment, consistency, and improvement throughout this period have been genuinely noted and are greatly appreciated. This concludes the formal ${planName} process, and your performance will continue to be monitored through our regular 1:1 sessions.</p>`;
    } else if (isConclusion && outcome === "fail") {
      html += `<p style="margin:0 0 12px;">Following a full review of your ${planName}, I regret to formally notify you that the required performance targets were not met within the agreed timeframe. This outcome has been documented and will be shared with the relevant stakeholders, including Human Resources.</p>`;
      if (nextSteps) html += `<p style="margin:0 0 6px;font-weight:700;">Agreed Next Steps:</p><p style="margin:0 0 20px;">${nextSteps.replace(/\n/g,"<br>")}</p>`;
    } else {
      html += `<p style="margin:0 0 20px;">${INTRO_MAP[meetingType] || "This is a formal summary of our session."}</p>`;
    }

    const mkList = (text) => {
      if (!text?.trim()) return "";
      return `<ul style="margin:8px 0;padding-left:22px;">${text.split("\n").filter(l=>l.trim()).map(l => `<li style="margin-bottom:6px;">${l.replace(/^[-•]\s*/,"").trim()}</li>`).join("")}</ul>`;
    };
    const mkSection = (title, body) => `<div style="margin-top:24px;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1A3D2B;border-bottom:1px solid #E8F5E8;padding-bottom:4px;">${title}</p>${body}</div>`;

    if (topics?.trim()) html += mkSection("Topics Discussed", mkList(topics));

    if (perfRating) {
      const pillStyles = {"Outstanding":"background:#C5F5C5;color:#1A3D2B;","Exceeds Expectations":"background:#A0E8A0;color:#1A3D2B;","Meets Expectations":"background:#E8F5E8;color:#2A5A2A;","Below Expectations":"background:#FEF9F0;color:#854F0B;","Needs Attention":"background:#FCEBEB;color:#A32D2D;"};
      html += mkSection("Overall Performance Rating", `<p style="margin:8px 0 6px;"><span style="${pillStyles[perfRating]||""}padding:4px 16px;border-radius:20px;font-weight:700;font-size:13px;">${perfRating}</span></p><p style="margin:0 0 4px;">${PERF_MESSAGES[perfRating]||""}</p>`);
    }

    if (strengths?.trim()) html += mkSection("Strengths & Recognized Contributions", mkList(strengths));
    if (weaknesses?.trim()) html += mkSection("Areas for Development", mkList(weaknesses));
    if (goals?.trim()) html += mkSection("Goals & Progress Update", mkList(goals));
    if (actions?.trim()) html += mkSection("Action Items & Agreed Next Steps", mkList(actions));

    // Target table
    if (isTargetType && targetRows.some(r => r.metric.trim())) {
      const s = "padding:9px 11px;font-size:13px;text-align:center;border:1px solid #C8E8C8;";
      html += `<div style="margin-top:24px;"><p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#1A3D2B;">Weekly QA Review — Score Tracking</p>`;
      html += `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">`;
      html += `<tr>${["Metric","Row","Start","W1","W2","W3","W4","EOM"].map((c,i) => `<th style="${s}font-weight:700;color:#C5F5C5;background:#1A3D2B;${i<=1?"text-align:left;":""}">${c}</th>`).join("")}</tr>`;

      targetRows.filter(r => r.metric.trim()).forEach((r, ri) => {
        const bg = ri % 2 === 0 ? "#fff" : "#F0FCF0";
        const tEom = calcEom([r.w1,r.w2,r.w3,r.w4]);
        const aEom = calcEom([r.a1,r.a2,r.a3,r.a4]);
        // Target row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:700;" rowspan="3">${r.metric}</td>`;
        html += `<td style="${s}text-align:left;font-weight:600;background:#E8F5E8;color:#1A3D2B;font-size:10px;">Target</td>`;
        html += `<td style="${s}">${r.start ? r.start+"%" : "--"}</td>`;
        ["w1","w2","w3","w4"].forEach(k => { html += `<td style="${s}">${r[k] ? r[k]+"%" : "--"}</td>`; });
        html += `<td style="${s}background:#C5F5C5;color:#1A3D2B;font-weight:700;">${tEom !== null ? tEom+"%" : "--"}</td></tr>`;
        // Actual row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:600;background:#FEF9F0;color:#854F0B;font-size:10px;">Actual</td>`;
        html += `<td style="${s}color:#aaa;">--</td>`;
        ["a1","a2","a3","a4"].forEach(k => { html += `<td style="${s}">${r[k] ? r[k]+"%" : "--"}</td>`; });
        const eAbg = aEom !== null && tEom !== null ? (aEom >= tEom ? "#E0F8E0" : "#FCEBEB") : "#FEF9F0";
        const eAc = aEom !== null && tEom !== null ? (aEom >= tEom ? "#1A6B2A" : "#A32D2D") : "#854F0B";
        html += `<td style="${s}background:${eAbg};color:${eAc};font-weight:700;">${aEom !== null ? aEom+"%" : "--"}</td></tr>`;
        // Diff row
        html += `<tr style="background:${bg}"><td style="${s}text-align:left;font-weight:600;background:#F5F5F5;color:#555;font-size:10px;">Difference</td>`;
        html += `<td style="${s}color:#aaa;">--</td>`;
        ["w1","w2","w3","w4"].forEach((wk,i) => {
          const d = calcDiff(r[wk], r["a"+(i+1)]);
          if (d !== null) {
            const dc = d > 0 ? "#1A6B2A" : d < 0 ? "#A32D2D" : "#555";
            const dbg = d > 0 ? "#E0F8E0" : d < 0 ? "#FCEBEB" : "#F5F5F5";
            html += `<td style="${s}background:${dbg};color:${dc};font-weight:700;">${d > 0 ? "+" : ""}${d}%</td>`;
          } else html += `<td style="${s}color:#ccc;">--</td>`;
        });
        // EOM diff
        if (aEom !== null && tEom !== null) {
          const ed = Math.round((aEom - tEom) * 10) / 10;
          const ec = ed > 0 ? "#1A6B2A" : ed < 0 ? "#A32D2D" : "#555";
          const eb = ed > 0 ? "#E0F8E0" : ed < 0 ? "#FCEBEB" : "#F5F5F5";
          html += `<td style="${s}background:${eb};color:${ec};font-weight:700;">${ed > 0 ? "+" : ""}${ed}%</td></tr>`;
        } else html += `<td style="${s}color:#ccc;">--</td></tr>`;
      });
      html += `</table></div>`;
    }

    // Closing
    html += `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #E8F5E8;">`;
    html += `<p style="margin:0 0 10px;">Should you have any questions, please do not hesitate to reach out.</p>`;
    html += `<p style="margin:0 0 16px;">I appreciate your continued commitment and professionalism.</p>`;
    html += `<p style="margin:0;">Best regards,<br><strong>${sigName || "QA Leader"}</strong><br>${sigTitle || "QA Lead"} | Tabby</p>`;
    html += `</div></div>`;
    return html;
  };

  const emailSubject = `Session Summary: ${meetingType} - ${fmtDate(sessionDate)}`;

  // Build plain text version for Gmail compose URL
  const buildPlainText = () => {
    const fn = firstNameFromEmail(toEmail);
    const isConclusion = isTargetType && outcome;
    const planName = meetingType === "PIP Review" ? "Performance Improvement Plan" : "Action Plan";
    const bullet = (text) => text ? text.split("\n").filter(l=>l.trim()).map(l => " - " + l.replace(/^[-•]\s*/,"").trim()).join("\n") : "";
    let lines = [];

    lines.push(`[${meetingType}]`);
    lines.push("");
    lines.push(`Dear ${fn},`);
    lines.push("");

    if (isConclusion && outcome === "pass") {
      lines.push(`I am pleased to formally confirm that you have successfully completed your ${planName}. Your commitment, consistency, and improvement throughout this period have been genuinely noted and are greatly appreciated. This concludes the formal ${planName} process.`);
    } else if (isConclusion && outcome === "fail") {
      lines.push(`Following a full review of your ${planName}, I regret to formally notify you that the required performance targets were not met within the agreed timeframe. This outcome has been documented and will be shared with the relevant stakeholders, including Human Resources.`);
      if (nextSteps) { lines.push(""); lines.push("Agreed Next Steps:"); lines.push(nextSteps); }
    } else {
      lines.push(INTRO_MAP[meetingType] || "This is a formal summary of our session.");
    }
    lines.push("");

    if (topics?.trim()) { lines.push("TOPICS DISCUSSED"); lines.push(bullet(topics)); lines.push(""); }
    if (perfRating) { lines.push("OVERALL PERFORMANCE RATING"); lines.push(` - ${perfRating}`); lines.push(` ${PERF_MESSAGES[perfRating]||""}`); lines.push(""); }
    if (strengths?.trim()) { lines.push("STRENGTHS & RECOGNIZED CONTRIBUTIONS"); lines.push(bullet(strengths)); lines.push(""); }
    if (weaknesses?.trim()) { lines.push("AREAS FOR DEVELOPMENT"); lines.push(bullet(weaknesses)); lines.push(""); }
    if (goals?.trim()) { lines.push("GOALS & PROGRESS UPDATE"); lines.push(bullet(goals)); lines.push(""); }
    if (actions?.trim()) { lines.push("ACTION ITEMS & AGREED NEXT STEPS"); lines.push(bullet(actions)); lines.push(""); }

    if (isTargetType && targetRows.some(r => r.metric.trim())) {
      lines.push("WEEKLY QA REVIEW — SCORE TRACKING");
      lines.push("");
      targetRows.filter(r => r.metric.trim()).forEach(r => {
        lines.push(`  ${r.metric}`);
        lines.push(`  Target: Start=${r.start||"--"}% W1=${r.w1||"--"}% W2=${r.w2||"--"}% W3=${r.w3||"--"}% W4=${r.w4||"--"}%`);
        lines.push(`  Actual: W1=${r.a1||"--"} W2=${r.a2||"--"} W3=${r.a3||"--"} W4=${r.a4||"--"}`);
        lines.push("");
      });
    }

    lines.push("---");
    lines.push("Should you have any questions, please do not hesitate to reach out.");
    lines.push("I appreciate your continued commitment and professionalism.");
    lines.push("");
    lines.push("Best regards,");
    lines.push(`${sigName || "QA Leader"}`);
    lines.push(`${sigTitle || "QA Lead"} | Tabby`);

    return lines.join("\n");
  };

  // Save session and send via Gmail API (Edge Function)
  const generateAndSend = async () => {
    if (!toEmail) { show("error", "Enter the team member's email"); return; }
    if (!gmailAuthorized) {
      show("error", "Please connect your Gmail account first");
      connectGmail();
      return;
    }
    setLoading(true);
    try {
      // Save to Supabase
      await sb.query("coaching_sessions", {
        token, method: "POST",
        body: {
          sender_email: profile?.email || "",
          member_email: toEmail,
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

      // Send via Gmail API through Edge Function
      try {
        const htmlBody = buildEmailBody();
        const result = await callGmailFn({
          action: "send",
          to: toEmail,
          cc: ccEmail,
          subject: emailSubject,
          htmlBody,
          replyTo: profile?.email || "",
        });

        if (result.success) {
          show("success", "Email sent & session logged");
        } else if (result.reauth) {
          // Token expired / revoked — need re-authorization
          setGmailAuthorized(false);
          show("error", "Gmail authorization expired. Please reconnect Gmail and try again.");
        } else {
          show("error", "Session saved but email failed: " + (result.error || "Unknown error"));
        }
      } catch(emailErr) {
        console.error("Email error:", emailErr);
        show("error", "Session saved but email failed: " + emailErr.message);
      }

      // Refresh history
      const s = await sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch(()=>[]);
      setSessions(s);

      // ── AP/PIP Write-back: update action_plan_weeks with actuals from this coaching session ──
      if (isTargetType && memberActivePlan && nextUnfilledWeek) {
        try {
          // Parse actuals from target rows (a1-a4 columns)
          const KPI_RAW_KEYS = { "Occupancy": "occupancy", "Coaching On-Time": "coaching", "Calibration": "calibration", "Coaching Observation": "observation", "RTR Score": "rtr" };
          const actualData = {};
          targetRows.forEach(r => {
            const kpiKey = r._kpi_key || KPI_RAW_KEYS[r.metric];
            if (kpiKey) {
              // Use the latest filled actual value (a4 > a3 > a2 > a1)
              const val = [r.a4, r.a3, r.a2, r.a1].find(v => v !== "" && v !== undefined);
              if (val !== undefined && val !== "") actualData[kpiKey] = parseFloat(val);
            }
          });

          if (Object.keys(actualData).length > 0) {
            // Check if targets met
            const weekTargetData = (() => { try { return JSON.parse(nextUnfilledWeek.target_data || "{}"); } catch { return {}; } })();
            const metTargets = Object.keys(weekTargetData).every(key => {
              const actual = actualData[key];
              const target = weekTargetData[key];
              return actual !== null && actual !== undefined && target !== undefined && actual >= target;
            });

            // Get the coaching session ID we just created
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
            show("success", `Email sent & Week ${nextUnfilledWeek.week_number} actuals written to ${memberActivePlan.type.toUpperCase()} plan${metTargets ? " ✅ Targets met!" : " ❌ Targets not met"}`);
          } else {
            show("success", "Email sent and session logged successfully!");
          }
        } catch (e) {
          console.error("AP/PIP write-back:", e);
          show("success", "Email sent! (Note: could not write back to AP/PIP plan)");
        }
      } else {
        show("success", "Email sent and session logged successfully!");
      }
      logActivity(token, profile?.email, "coaching_session_created", "coaching_sessions", null, `Member: ${toEmail}, Type: ${meetingType}`);
      setShowPreview(false);
    } catch (e) {
      show("error", safeError(e));
    }
    setLoading(false);
  };

  // Clear form
  const clearForm = () => {
    setToEmail("");setCcEmail("");setSessionDate(new Date().toISOString().split("T")[0]);
    setMeetingType("1:1 Meeting");setTopics("");setStrengths("");setWeaknesses("");
    setGoals("");setActions("");setPerfRating("");setOutcome("");setNextSteps("");
    setTargetRows([{metric:"",start:"",w1:"",w2:"",w3:"",w4:"",a1:"",a2:"",a3:"",a4:""}]);
    setShowPreview(false);
  };

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Coaching sessions</div>
          <div className="page-subtitle">1:1 coaching email generator and session tracking</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {sessions.length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--primary-light)",color:"var(--primary-text,var(--tabby-purple))",fontSize:12,fontWeight:600}}>{sessions.length} sessions logged</span>}
          {!gmailChecking && (gmailAuthorized ?
            <span onClick={disconnectGmail} title="Click to disconnect Gmail" style={{padding:"4px 12px",borderRadius:20,background:"var(--green-bg)",color:"var(--green)",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Gmail connected
            </span> :
            <button onClick={connectGmail} style={{padding:"4px 12px",borderRadius:20,background:"var(--amber-bg)",color:"var(--amber)",fontSize:12,fontWeight:600,border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Connect Gmail
            </button>
          )}
        </div>
      </div>

      <div className="tab-bar" style={{marginBottom:16}}>
        <button className={`tab-btn ${tab==="compose"?"active":""}`} onClick={()=>setTab("compose")}><Icon d={icons.coaching} size={16}/>Compose</button>
        <button className={`tab-btn ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}><Icon d={icons.scores} size={16}/>History ({sessions.length})</button>
      </div>

      {/* ═══ COMPOSE TAB ═══ */}
      {tab==="compose" && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* LEFT — Form */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Signature block */}
          <div className="card">
            <div className="card-header"><span className="card-title">Your signature</span></div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Full name</label><input className="form-input" value={sigName} onChange={e=>setSigName(e.target.value)}/></div>
              <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={sigTitle} onChange={e=>setSigTitle(e.target.value)}/></div>
            </div>
          </div>

          {/* Session details */}
          <div className="card">
            <div className="card-header"><span className="card-title">Session details</span></div>
            <div className="form-grid">
              <div className="form-group" style={{position:"relative"}}><label className="form-label">Team member email (To)</label>
                <input className="form-input" value={toEmail} onChange={e=>{setToEmail(e.target.value);}} placeholder="Type name or email..." autoComplete="off"/>
                {toEmail && !roster.find(r=>r.email===toEmail) && (() => {
                  const q = toEmail.toLowerCase();
                  const matches = roster.filter(r => (r.email||"").toLowerCase().includes(q) || (r.display_name||"").toLowerCase().includes(q)).slice(0, 8);
                  if (!matches.length) return null;
                  return <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:"0 0 var(--radius) var(--radius)",boxShadow:"var(--shadow-lg)",maxHeight:200,overflowY:"auto"}}>
                    {matches.map(r => <div key={r.email} onClick={()=>{setToEmail(r.email);const mgr=r.manager_email;if(mgr)setCcEmail(mgr);}} style={{padding:"8px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontWeight:500}}>{r.email}</span>
                      <span style={{color:"var(--tx3)",fontSize:11}}>{r.display_name || nameFromEmail(r.email)}</span>
                    </div>)}
                  </div>;
                })()}
              </div>
              <div className="form-group"><label className="form-label">Manager email (CC)</label>
                {toEmail && roster.find(r=>r.email===toEmail)?.manager_email ? (
                  <input className="form-input" value={ccEmail || roster.find(r=>r.email===toEmail)?.manager_email || ""} onChange={e=>setCcEmail(e.target.value)} onFocus={()=>{if(!ccEmail){const m=roster.find(r=>r.email===toEmail)?.manager_email;if(m)setCcEmail(m);}}}/>
                ) : <input className="form-input" value={ccEmail} onChange={e=>setCcEmail(e.target.value)} placeholder="manager@tabby.ai"/>}
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

          {/* Active AP/PIP plan notice — show all plans with separate pull buttons */}
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

          {/* Template bar */}
          {TEMPLATES[meetingType] && <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"var(--accent-light)",borderRadius:8,fontSize:13}}>
            <span style={{color:"var(--accent-text)",fontWeight:500}}>Template available for {meetingType}</span>
            <button className="btn btn-outline btn-sm" onClick={applyTemplate}>Apply template</button>
          </div>}

          {/* Content fields */}
          <div className="card">
            <div className="card-header"><span className="card-title">Session content</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[["topics","Topics discussed",topics,setTopics],["strengths","Strengths observed",strengths,setStrengths],["weaknesses","Areas for improvement",weaknesses,setWeaknesses],["goals","Goals & progress update",goals,setGoals],["actions","Action items / next steps",actions,setActions]].map(([id,label,val,setter]) => (
                <div className="form-group" key={id}><label className="form-label">{label}</label>
                  <textarea className="form-input" rows={3} value={val} onChange={e=>setter(e.target.value)} placeholder="One point per line" style={{resize:"vertical"}}/>
                  <div style={{fontSize:10,color:val.length>1800?"var(--red)":"var(--tx3)",textAlign:"right"}}>{val.length} / 2000</div>
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
                      {/* Target row */}
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
                      {/* Actual row */}
                      <tr style={{background:rowBg}}>
                        <td style={{fontSize:10,fontWeight:600,color:"var(--amber)",padding:"2px 6px"}}>Actual</td>
                        <td style={{color:"var(--tx3)",textAlign:"center",fontSize:11}}>—</td>
                        {["a1","a2","a3","a4"].map(k => <td key={k}><input className="form-input" type="number" value={r[k]} onChange={e=>updateTarget(ri,k,e.target.value)} style={{padding:"3px 4px",fontSize:12,textAlign:"center",width:50,border:"none",background:"transparent",color:"var(--tx)"}}/></td>)}
                        <td style={{fontWeight:700,textAlign:"center",fontSize:12,
                          color:aEom!==null&&tEom!==null?(aEom>=tEom?"var(--green)":"var(--red)"):"var(--amber)"
                        }}>{aEom !== null ? aEom+"%" : "—"}</td>
                      </tr>
                      {/* Diff row */}
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
                <textarea className="form-input" rows={2} value={nextSteps} onChange={e=>setNextSteps(e.target.value)} placeholder="Describe the formal next steps..." style={{resize:"vertical"}}/>
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
                    show("success","Copied to clipboard");
                  }}>Copy text</button>
                  <button className="btn btn-outline btn-sm" style={{flex:1}} onClick={()=>setShowPreview(false)}>Edit</button>
                </div>
              </div>
            </div>)}
          </div>
        </div>
      </div>}

      {/* ═══ HISTORY TAB ═══ */}
      {tab==="history" && <div className="card">
        {/* Search and filter bar */}
        <div style={{padding:"14px 16px",borderBottom:"1px solid var(--bd2)",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200,position:"relative"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input className="form-input" placeholder="Search by QA name, QA Lead, or email..." value={historySearch} onChange={e=>setHistorySearch(e.target.value)} style={{paddingLeft:34,height:36,fontSize:13}}/>
          </div>
          {hasRole(profile?.role,"qa_supervisor")&&<div style={{display:"flex",gap:4}}>
            <button className={`btn btn-sm ${historyFilterBy==="all"?"btn-primary":"btn-outline"}`} onClick={()=>setHistoryFilterBy("all")} style={{fontSize:11}}>All sessions</button>
            <button className={`btn btn-sm ${historyFilterBy==="my_sessions"?"btn-primary":"btn-outline"}`} onClick={()=>setHistoryFilterBy("my_sessions")} style={{fontSize:11}}>My sessions</button>
          </div>}
          <div style={{fontSize:12,color:"var(--tx3)"}}>{(()=>{
            const isLeadOnly = hasRole(profile?.role,"qa_lead") && !hasRole(profile?.role,"qa_supervisor");
            const myEmail = profile?.email?.toLowerCase()||"";
            const scopedSessions = isLeadOnly ? sessions.filter(s=>s.sender_email?.toLowerCase()===myEmail) : historyFilterBy==="my_sessions" ? sessions.filter(s=>s.sender_email?.toLowerCase()===myEmail) : sessions;
            const q = historySearch.toLowerCase().trim();
            const filtered = q ? scopedSessions.filter(s => {
              const memberName = nameFromEmail(s.member_email).toLowerCase();
              const senderName = nameFromEmail(s.sender_email).toLowerCase();
              return (s.member_email||"").toLowerCase().includes(q) || memberName.includes(q) || (s.sender_email||"").toLowerCase().includes(q) || senderName.includes(q) || (s.email_subject||"").toLowerCase().includes(q) || (ENUM_TO_LABEL[s.meeting_type]||"").toLowerCase().includes(q);
            }) : scopedSessions;
            return `${filtered.length} session${filtered.length!==1?"s":""}`;
          })()}</div>
        </div>
        {(()=>{
          const isLeadOnly = hasRole(profile?.role,"qa_lead") && !hasRole(profile?.role,"qa_supervisor");
          const myEmail = profile?.email?.toLowerCase()||"";
          const scopedSessions = isLeadOnly ? sessions.filter(s=>s.sender_email?.toLowerCase()===myEmail) : historyFilterBy==="my_sessions" ? sessions.filter(s=>s.sender_email?.toLowerCase()===myEmail) : sessions;
          const q = historySearch.toLowerCase().trim();
          const filtered = q ? scopedSessions.filter(s => {
            const memberName = nameFromEmail(s.member_email).toLowerCase();
            const senderName = nameFromEmail(s.sender_email).toLowerCase();
            return (s.member_email||"").toLowerCase().includes(q) || memberName.includes(q) || (s.sender_email||"").toLowerCase().includes(q) || senderName.includes(q) || (s.email_subject||"").toLowerCase().includes(q) || (ENUM_TO_LABEL[s.meeting_type]||"").toLowerCase().includes(q);
          }) : scopedSessions;
          return filtered.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>{historySearch?"No sessions matching your search.":"No coaching sessions logged yet."}</p></div> :
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Member</th><th>Sent by</th><th>Performance</th><th>Outcome</th>{hasRole(profile?.role,"super_admin")&&<th></th>}<th style={{width:30}}></th></tr></thead>
            <tbody>
              {filtered.map(s => {
                const isExp=expandedSession===s.id;
                return(<React.Fragment key={s.id}>
                  <tr onClick={()=>setExpandedSession(isExp?null:s.id)} style={{cursor:"pointer"}}>
                  <td style={{fontSize:13,whiteSpace:"nowrap"}}>{new Date(s.session_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"})}</td>
                  <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red-bg)":"var(--green-bg)",color:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red)":"var(--green)"}}>{ENUM_TO_LABEL[s.meeting_type]||s.meeting_type}</span></td>
                  <td style={{fontWeight:500}}>{nameFromEmail(s.member_email)}</td>
                  <td style={{fontSize:13,color:"var(--tx2)"}}>{nameFromEmail(s.sender_email)}</td>
                  <td>{s.performance_rating ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,
                    background:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green-bg)":s.performance_rating==="Meets Expectations"?"var(--accent-light)":"var(--amber-bg)",
                    color:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green)":s.performance_rating==="Meets Expectations"?"var(--accent-text)":"var(--amber)"
                  }}>{s.performance_rating}</span> : "—"}</td>
                  <td>{s.outcome ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:600,
                    background:s.outcome==="pass"?"var(--green-bg)":"var(--red-bg)",
                    color:s.outcome==="pass"?"var(--green)":"var(--red)"
                  }}>{s.outcome==="pass"?"Passed":"Failed"}</span> : "—"}</td>
                  {hasRole(profile?.role,"super_admin")&&<td>
                    <button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={async(e)=>{
                      e.stopPropagation();
                      confirmAsk("Delete coaching session?","This will permanently delete this session log.",async()=>{
                      try{
                        await sb.query("coaching_sessions",{token,method:"DELETE",filters:`id=eq.${s.id}`});
                        setSessions(sessions.filter(x=>x.id!==s.id));
                        show("success","Session deleted");
                      }catch(err){show("error",safeError(err));}
                    },"Delete","var(--red)");}}><Icon d={icons.trash} size={14}/></button>
                  </td>}
                  <td><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
                </tr>

                {/* Expanded session details */}
                {isExp&&<tr><td colSpan={hasRole(profile?.role,"super_admin")?8:7} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                    <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>To</div><div style={{fontSize:13}}>{s.member_email||"—"}</div></div>
                    <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>CC</div><div style={{fontSize:13}}>{s.cc_email||"—"}</div></div>
                    <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>From</div><div style={{fontSize:13}}>{s.sender_email||"—"}</div></div>
                    <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Subject</div><div style={{fontSize:13}}>{s.email_subject||"—"}</div></div>
                  </div>

                  {s.topics&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Topics discussed</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.topics}</div></div>}

                  {s.strengths&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--green)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Strengths</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.strengths}</div></div>}

                  {s.weaknesses&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--red)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Areas for improvement</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.weaknesses}</div></div>}

                  {s.goals&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Goals</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.goals}</div></div>}

                  {s.action_items&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Action items</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.action_items}</div></div>}

                  {s.next_steps&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Next steps</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.next_steps}</div></div>}

                  {s.target_data&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Target data</div><div style={{fontSize:12,color:"var(--tx2)",fontFamily:"monospace",background:"var(--bg3)",padding:"8px 10px",borderRadius:6,overflowX:"auto"}}>{s.target_data}</div></div>}

                  <div style={{display:"flex",gap:16,flexWrap:"wrap",paddingTop:12,borderTop:"1px solid var(--bd2)",fontSize:12,color:"var(--tx3)"}}>
                    {s.sig_name&&<span>Signed by: <strong style={{color:"var(--tx)"}}>{s.sig_name}</strong>{s.sig_title?" — "+s.sig_title:""}</span>}
                    {s.created_at&&<span>Logged: {new Date(s.created_at).toLocaleString("en-GB",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>}
                  </div>
                </div></td></tr>}
                </React.Fragment>);
              })}
            </tbody>
          </table></div>;
        })()}
      </div>}

      {el}
      {confirmEl}
    </div>
  );
}


export default CoachingPage;
