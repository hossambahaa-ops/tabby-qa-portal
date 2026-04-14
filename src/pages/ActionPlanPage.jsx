import React, { useState, useEffect, useRef } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity } from "../lib/utils.js";
import { useToast, useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { PulseLoader } from "../components/Charts.jsx";
import { useApp } from "../lib/AppContext.jsx";

function ActionPlanPage() {
  const{token,profile}=useApp();
  const [tab, setTab] = useState("active"); // active | create | detection | history
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [mtd, setMtd] = useState([]);
  const [roster, setRoster] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [detections, setDetections] = useState([]);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [dismissModalAP, setDismissModalAP] = useState(null);
  const [dismissReasonAP, setDismissReasonAP] = useState("");
  const { show, el } = useToast();
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  // ── Create form state ──
  const [selQaEmail, setSelQaEmail] = useState("");
  const [planType, setPlanType] = useState("ap"); // ap | pip
  const [planDuration, setPlanDuration] = useState(4);
  const [planReason, setPlanReason] = useState("");
  const [planTargets, setPlanTargets] = useState([]);
  const [selectedKpis, setSelectedKpis] = useState([]);
  const [followUpMode, setFollowUpMode] = useState("weekly"); // weekly | monthly
  const [customMetrics, setCustomMetrics] = useState([]); // [{name:"",targets:[]}]
  const [showCreateForm, setShowCreateForm] = useState(false);

  // ── Conclusion modal state ──
  const [concludingPlan, setConcludingPlan] = useState(null);
  const [conclusionOutcome, setConclusionOutcome] = useState("");
  const [conclusionNotes, setConclusionNotes] = useState("");
  const [pullMonth, setPullMonth] = useState(""); // month to pull MTD data from

  // ── Slab engine (same as dashboard/leaderboard) ──
  const KPI_SLABS = {
    occupancy:   { label: "Occupancy",           weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
    coaching:    { label: "Coaching On-Time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
    calibration: { label: "Calibration",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
    observation: { label: "Coaching Observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
    rtr:         { label: "RTR Score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
  };

  const parseRaw = (val) => {
    if (!val && val !== 0) return null;
    const s = String(val).trim().replace(",", ".");
    if (s.includes("%")) return parseFloat(s.replace("%", ""));
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    if (n >= 0 && n <= 2) return n * 100;
    return n;
  };

  const calcSlab = (rawPct, th) => {
    if (rawPct === null) return { slab: 0, pct: 0, label: "Slab 0" };
    if (rawPct >= th[2]) return { slab: 3, pct: 100, label: "Slab 3" };
    if (rawPct >= th[1]) return { slab: 2, pct: 75, label: "Slab 2" };
    if (rawPct >= th[0]) return { slab: 1, pct: 50, label: "Slab 1" };
    return { slab: 0, pct: 0, label: "Slab 0" };
  };

  const getKpiScores = (row) => {
    return Object.entries(KPI_SLABS).map(([key, def]) => {
      const rawPct = parseRaw(row[def.rawKey]);
      const slab = calcSlab(rawPct, def.thresholds);
      const score = (def.weight * slab.pct) / 100;
      return { key, label: def.label, weight: def.weight, rawPct, slab, score, thresholds: def.thresholds, rawKey: def.rawKey };
    });
  };

  const getTotalScore = (row) => getKpiScores(row).reduce((s, k) => s + k.score, 0);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const c = p.replace(/[\d]+$/, "");
      return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const initialsFromEmail = (email) => {
    const name = nameFromEmail(email);
    const parts = name.split(" ");
    return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
  };

  const scoreColor = (v) => v >= 55 * 0.7 ? "var(--green)" : v >= 55 * 0.4 ? "var(--amber)" : "var(--red)";
  const scoreBg = (v) => v >= 55 * 0.7 ? "var(--green-bg)" : v >= 55 * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";

  // ── Data loading ──
  const load = useCallback(async () => {
    try {
      const [planRows, weekRows, mtdRows, rosterRows, profRows, dismissalRows, damFlags, damSteps] = await Promise.all([
        sb.query("action_plans", { select: "*", filters: "order=created_at.desc", token }).catch(() => []),
        sb.query("action_plan_weeks", { select: "*", filters: "order=plan_id.asc,week_number.asc", token }).catch(() => []),
        dataCache.fetch("mtd_scores",()=>sb.query("mtd_scores", { select: "*", filters: "order=month.desc", token }).catch(() => [])),
        dataCache.fetch("qa_roster",()=>sb.query("qa_roster", { select: "email,display_name,queue,manager_email", token }).catch(() => [])),
        dataCache.fetch("profiles",()=>sb.query("profiles", { select: "id,email,display_name,role", filters: "status=eq.active", token }).catch(() => [])),
        sb.query("ap_dismissals", { select: "*", filters: "order=created_at.desc", token }).catch(() => []),
        sb.query("dam_flags", { select: "id,profile_id,rule_id,occurrence_number,status,notes,profiles!dam_flags_profile_id_fkey(email,display_name),dam_rules(name,behavior_type)", filters: "order=triggered_at.desc", token }).catch(() => []),
        dataCache.fetch("dam_escalation_steps",()=>sb.query("dam_escalation_steps", { select: "id,rule_id,occurrence,action,includes_pip,pip_action", token }).catch(() => [])),
      ]);
      setPlans(planRows);
      setWeeks(weekRows);
      setMtd(mtdRows);
      setRoster(rosterRows);
      setProfiles(profRows);

      // ── Auto-detection engine (DAM-driven) ──
      runDetection(mtdRows, planRows, dismissalRows, damFlags, damSteps);
    } catch (e) { console.error("AP/PIP load:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);

  // ── Auto-detection: DAM-driven — only flag QAs with DAM escalation that includes AP/PIP ──
  const runDetection = (mtdRows, existingPlans, dismissalRows, damFlagRows, damStepRows) => {
    const activePlanEmails = existingPlans
      .filter(p => p.status === "active" || p.status === "pending_review")
      .map(p => p.qa_email?.toLowerCase());
    const dismissedEmails = new Set((dismissalRows || []).map(d => d.qa_email?.toLowerCase()));
    const months = sortMonthsDesc([...new Set(mtdRows.map(r => r.month))]);
    const latestMonth = months[0] || "—";
    const activeFlags = (damFlagRows || []).filter(f => f.status === "pending" || f.status === "acknowledged");
    const flagged = [];

    activeFlags.forEach(flag => {
      const email = flag.profiles?.email||flag.qa_email?.toLowerCase();
      if (!email) return;
      if (activePlanEmails.includes(email)) return;
      if (dismissedEmails.has(email)) return;
      if (flagged.find(f => f.email?.toLowerCase() === email)) return;

      const step = (damStepRows || []).find(s => s.rule_id === flag.rule_id && s.occurrence === flag.occurrence_number);
      if (!step || !step.includes_pip) return;

      const row = mtdRows.find(r => r.qa_email?.toLowerCase() === email && r.month === latestMonth);
      const totalScore = row ? getTotalScore(row) : 0;
      const kpis = row ? getKpiScores(row) : [];
      const ruleName = flag.dam_rules?.name || "Unknown";
      const behaviorType = flag.dam_rules?.behavior_type?.replace(/_/g, " ") || "";
      const pipAction = step.pip_action || step.action || "Action Plan required";

      flagged.push({
        email: flag.profiles?.email||flag.qa_email || email,
        name: flag.profiles?.display_name || nameFromEmail(email),
        reason: `DAM: ${ruleName} (${behaviorType}) — Occurrence #${flag.occurrence_number}: ${pipAction}`,
        severity: flag.occurrence_number >= 3 ? "critical" : flag.occurrence_number >= 2 ? "warning" : "notice",
        totalScore, kpis, latestMonth,
        tl: row?.qa_tl,
        damFlagId: flag.id,
        planType: step.includes_pip ? "pip" : "ap",
        pipActionType: step.pip_action || "new",
      });
    });

    const sevOrder = { critical: 0, warning: 1, notice: 2 };
    flagged.sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) || a.totalScore - b.totalScore);
    setDetections(flagged);
  };

  // ── Generate suggested targets based on current scores ──
  const generateTargets = (qaEmail, kpiKeys) => {
    const months = sortMonthsDesc([...new Set(mtd.map(r => r.month))]);
    const latestMonth = months[0];
    const row = mtd.find(r => r.month === latestMonth && r.qa_email?.toLowerCase() === qaEmail.toLowerCase());
    const periods = followUpMode === "monthly" ? planDuration : planDuration;

    return (kpiKeys || []).map(key => {
      const def = KPI_SLABS[key];
      if (!def) return null;
      const rawPct = row ? parseRaw(row[def.rawKey]) : null;
      const slab = rawPct !== null ? calcSlab(rawPct, def.thresholds) : { slab: 0, label: "No data" };

      return {
        kpi_key: key,
        label: def.label,
        raw_key: def.rawKey,
        current_value: rawPct,
        current_slab: slab.label,
        target_value: "",
        weekly_targets: Array(periods).fill(""),
        weight: def.weight,
        thresholds: def.thresholds,
      };
    }).filter(Boolean);
  };

  // ── Start creating a plan (from detection or manually) ──
  const startCreate = (qaEmail, type) => {
    setSelQaEmail(qaEmail || "");
    setPlanType(type || "ap");
    setPlanDuration(type === "pip" ? 8 : 4);
    setPlanReason("");
    setSelectedKpis([]);
    setPlanTargets([]);
    setFollowUpMode("weekly");
    setCustomMetrics([]);
    setShowCreateForm(true);
    setTab("create");
  };

  // When QA email changes in create form, regenerate targets
  const handleQaEmailChange = (email) => {
    setSelQaEmail(email);
    if (email && roster.find(r => r.email?.toLowerCase() === email.toLowerCase()) && selectedKpis.length > 0) {
      setPlanTargets(generateTargets(email, selectedKpis));
    }
  };

  // Toggle KPI selection
  const toggleKpi = (key) => {
    const newSel = selectedKpis.includes(key) ? selectedKpis.filter(k => k !== key) : [...selectedKpis, key];
    setSelectedKpis(newSel);
    if (selQaEmail && roster.find(r => r.email?.toLowerCase() === selQaEmail.toLowerCase())) {
      setPlanTargets(generateTargets(selQaEmail, newSel));
    } else {
      setPlanTargets(newSel.map(k => {
        const def = KPI_SLABS[k]; if (!def) return null;
        return { kpi_key: k, label: def.label, raw_key: def.rawKey, current_value: null, current_slab: "—", target_value: "", weekly_targets: Array(planDuration).fill(""), weight: def.weight, thresholds: def.thresholds };
      }).filter(Boolean));
    }
  };

  // Custom metrics (free text)
  const addCustomMetric = () => setCustomMetrics(prev => [...prev, { name: "", targets: Array(planDuration).fill("") }]);
  const removeCustomMetric = (idx) => setCustomMetrics(prev => prev.filter((_, i) => i !== idx));

  // ── Save plan to Supabase ──
  const savePlan = async () => {
    if (!selQaEmail) { show("error", "Select a QA specialist"); return; }
    if (!planReason.trim()) { show("error", "Provide a reason for this plan"); return; }
    if (planTargets.length === 0 && customMetrics.length === 0) { show("error", "Select at least one KPI or add a custom metric"); return; }
    // Validate KPI targets
    const missingTargets = planTargets.some(t => t.weekly_targets.some(w => w === "" || w === null || w === undefined));
    if (missingTargets) { show("error", "Fill in all targets for each selected KPI"); return; }
    // Validate custom metrics
    const invalidCustom = customMetrics.some(c => !c.name.trim() || c.targets.some(t => t === "" || t === null || t === undefined));
    if (invalidCustom) { show("error", "Fill in name and all targets for each custom metric"); return; }

    const existing = plans.find(p =>
      p.qa_email?.toLowerCase() === selQaEmail.toLowerCase() &&
      p.type === planType &&
      (p.status === "active" || p.status === "pending_review")
    );
    if (existing) {
      show("error", `${nameFromEmail(selQaEmail)} already has an active ${existing.type.toUpperCase()} plan`);
      return;
    }

    setLoading(true);
    try {
      const startDate = new Date().toISOString().split("T")[0];
      const periodDays = followUpMode === "monthly" ? planDuration * 30 : planDuration * 7;
      const endDate = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Serialize all targets (KPIs + custom)
      const targetsJson = [
        ...planTargets.map(t => ({
          kpi_key: t.kpi_key, label: t.label, raw_key: t.raw_key,
          current_value: t.current_value, target_value: t.target_value,
          weekly_targets: t.weekly_targets, weight: t.weight, thresholds: t.thresholds,
        })),
        ...customMetrics.map((c, i) => ({
          kpi_key: "custom_" + i, label: c.name, raw_key: null,
          current_value: null, target_value: null,
          weekly_targets: c.targets, weight: 0, thresholds: null, is_custom: true,
        })),
      ];

      const qaRoster = roster.find(r => r.email?.toLowerCase() === selQaEmail.toLowerCase());

      const [planResult] = await sb.query("action_plans", {
        token, method: "POST",
        body: {
          qa_email: selQaEmail,
          type: planType,
          status: "active",
          reason: planReason,
          targets: JSON.stringify({ follow_up_mode: followUpMode, metrics: targetsJson }),
          start_date: startDate,
          end_date: endDate,
          duration_weeks: planDuration,
          created_by: profile?.email,
          tl_email: qaRoster?.manager_email || profile?.email,
          team: qaRoster?.queue || null,
        }
      });

      // Create period rows (weeks or months)
      if (planResult?.id) {
        const periodBodies = [];
        for (let p = 1; p <= planDuration; p++) {
          const pDays = followUpMode === "monthly" ? (p - 1) * 30 : (p - 1) * 7;
          const periodStart = new Date(Date.now() + pDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const targetData = {};
          planTargets.forEach(t => { targetData[t.kpi_key] = t.weekly_targets[p - 1] ?? t.target_value; });
          customMetrics.forEach((c, i) => { targetData["custom_" + i] = c.targets[p - 1] ?? ""; });
          periodBodies.push({
            plan_id: planResult.id,
            week_number: p,
            week_start: periodStart,
            target_data: JSON.stringify(targetData),
            actual_data: null, met_targets: null, coaching_session_id: null, notes: null,
          });
        }
        await sb.query("action_plan_weeks", { token, method: "POST", body: periodBodies });
      }

      show("success", `${planType.toUpperCase()} created for ${nameFromEmail(selQaEmail)}`);
      logActivity(token, profile?.email, `${planType}_created`, "action_plans", null, `QA: ${selQaEmail}, Duration: ${planDuration} weeks`);
      setShowCreateForm(false);
      setTab("active");
      // Reload to get new plan with ID
      load();
    } catch (e) {
      show("error", safeError(e));
    }
    setLoading(false);
  };

  // ── Update week actuals ──
  const updateWeekActuals = async (weekId, qaEmail, selectedMonth) => {
    // Find the plan for this week
    const week = weeks.find(w => w.id === weekId);
    if (!week) { show("error", "Week not found"); return; }
    const plan = plans.find(p => p.id === week.plan_id);
    if (!plan) { show("error", "Plan not found"); return; }

    // Parse the plan's targets to know which KPIs to pull
    let targetData = {};
    try { targetData = JSON.parse(week.target_data || "{}"); } catch { }
    const targetKeys = Object.keys(targetData);

    // Parse plan targets to get raw_key mapping
    let planMetrics = [];
    try {
      const parsed = JSON.parse(plan.targets || "[]");
      planMetrics = Array.isArray(parsed) ? parsed : (parsed.metrics || []);
    } catch { }

    // Pull MTD data for the selected month (or latest if not specified)
    const months = sortMonthsDesc([...new Set(mtd.map(r => r.month))]);
    const useMonth = selectedMonth || pullMonth || months[0];
    const qaLocal = qaEmail.toLowerCase().split("@")[0];
    const row = mtd.find(r => r.month === useMonth && (r.qa_email?.toLowerCase() === qaEmail.toLowerCase() || r.qa_email?.toLowerCase().split("@")[0] === qaLocal));
    if (!row) { show("error", "No MTD data found for " + nameFromEmail(qaEmail) + " in " + useMonth); return; }

    // Only pull actuals for KPIs that are in this plan's targets
    const actualData = {};
    targetKeys.forEach(key => {
      const metric = planMetrics.find(m => m.kpi_key === key);
      if (metric?.raw_key && KPI_SLABS[key]) {
        actualData[key] = parseRaw(row[KPI_SLABS[key].rawKey]);
      } else if (metric?.raw_key) {
        actualData[key] = parseRaw(row[metric.raw_key]);
      }
    });

    // Check if targets met
    const metTargets = targetKeys.every(key => {
      const actual = actualData[key];
      const target = targetData[key];
      if (actual === null || actual === undefined) return true;
      if (target === null || target === undefined || target === "") return true;
      return Number(actual) >= Number(target);
    });

    try {
      await sb.query("action_plan_weeks", {
        token, method: "PATCH",
        body: {
          actual_data: JSON.stringify(actualData),
          met_targets: metTargets,
          updated_at: new Date().toISOString(),
        },
        filters: `id=eq.${weekId}`,
      });
      show("success", "Actuals updated from MTD (" + useMonth + ")");
      setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, actual_data: JSON.stringify(actualData), met_targets: metTargets, updated_at: new Date().toISOString() } : w));
    } catch (e) { show("error", safeError(e)); }
  };

  // ── Conclude plan ──
  const concludePlan = async () => {
    if (!concludingPlan || !conclusionOutcome) return;
    setLoading(true);
    try {
      await sb.query("action_plans", {
        token, method: "PATCH",
        body: {
          status: conclusionOutcome === "pass" ? "completed_pass" : "completed_fail",
          conclusion: conclusionOutcome,
          conclusion_notes: conclusionNotes,
          concluded_by: profile?.email,
          concluded_at: new Date().toISOString(),
        },
        filters: `id=eq.${concludingPlan.id}`,
      });

      // If PIP failed → auto-create DAM flag
      if (concludingPlan.type === "pip" && conclusionOutcome === "fail") {
        try {
          const qaProfile = profiles.find(p => p.email?.toLowerCase() === concludingPlan.qa_email?.toLowerCase());
          if (qaProfile) {
            await sb.query("dam_flags", {
              token, method: "POST",
              body: {
                profile_id: qaProfile.id,
                severity: "critical",
                recommended_action: "termination_review",
                notes: `PIP failed. Plan ID: ${concludingPlan.id}. ${conclusionNotes}`,
                status: "pending",
                occurrence_number: 1,
                trigger_data: JSON.stringify({ source: "pip_failure", plan_id: concludingPlan.id }),
              }
            });
            show("success", "PIP failed — DAM flag created for HR investigation");
          }
        } catch (e) { console.error("DAM flag creation:", e); }
      }

      // If AP failed → create DAM flag (performance_management) — DAM handles escalation
      if (concludingPlan.type === "ap" && conclusionOutcome === "fail") {
        try {
          const qaProfile = profiles.find(p => p.email?.toLowerCase() === concludingPlan.qa_email?.toLowerCase());
          if (qaProfile) {
            // Find the performance_management rule
            let pmRule = null;
            try {
              const rules = await sb.query("dam_rules", { select: "id,name,behavior_type", filters: "behavior_type=eq.performance_management&is_active=eq.true&limit=1", token });
              pmRule = rules[0] || null;
            } catch { }

            // Count existing occurrences for this person + rule
            let occurrence = 1;
            if (pmRule) {
              try {
                const existing = await sb.query("dam_flags", { select: "id", filters: `profile_id=eq.${qaProfile.id}&rule_id=eq.${pmRule.id}&status=neq.dismissed`, token });
                occurrence = (existing?.length || 0) + 1;
              } catch { }
            }

            // Get escalation step for this occurrence
            let step = null;
            if (pmRule) {
              try {
                const steps = await sb.query("dam_escalation_steps", { select: "*", filters: `rule_id=eq.${pmRule.id}&occurrence=eq.${occurrence}`, token });
                step = steps[0] || null;
              } catch { }
            }

            await sb.query("dam_flags", {
              token, method: "POST",
              body: {
                profile_id: qaProfile.id,
                rule_id: pmRule?.id || null,
                severity: "warning",
                recommended_action: step?.includes_pip ? "pip" : (step?.is_hr_investigation ? "termination_review" : "coaching"),
                notes: `Action Plan failed. Plan ID: ${concludingPlan.id}. ${conclusionNotes}`,
                status: "pending",
                occurrence_number: occurrence,
                escalation_step_id: step?.id || null,
                trigger_data: JSON.stringify({ source: "ap_failure", plan_id: concludingPlan.id, step_action: step?.action || "No step defined" }),
              }
            });
            show("success", `AP failed — DAM flag created (occurrence #${occurrence}${step ? ": " + step.action : ""})`);
          }
        } catch (e) {
          console.error("DAM flag creation:", e);
          show("error", "AP concluded as failed. Could not create DAM flag: " + e.message);
        }
      } else {
        show("success", `${concludingPlan.type.toUpperCase()} concluded as ${conclusionOutcome === "pass" ? "PASSED" : "FAILED"}`);
        logActivity(token, profile?.email, `${concludingPlan.type}_concluded`, "action_plans", concludingPlan.id, `QA: ${concludingPlan.qa_email}, Result: ${conclusionOutcome}`);
      }

      setConcludingPlan(null);
      setConclusionOutcome("");
      setConclusionNotes("");
      // Optimistic update
      const newStatus = conclusionOutcome === "pass" ? "completed_pass" : "completed_fail";
      setPlans(prev => prev.map(p => p.id === concludingPlan.id ? { ...p, status: newStatus, conclusion: conclusionOutcome, conclusion_notes: conclusionNotes, concluded_by: profile?.email, concluded_at: new Date().toISOString() } : p));
    } catch (e) { show("error", safeError(e)); }
    setLoading(false);
  };

  // ── Dismiss detection (persisted to DB) ──
  const dismissDetectionDB = async (email, reason) => {
    try {
      await sb.query("ap_dismissals", { token, method: "POST", body: {
        qa_email: email,
        dismissed_by: profile?.email,
        reason: reason || "Dismissed by super admin",
        month: mtd.length ? sortMonthsDesc([...new Set(mtd.map(r => r.month))])[0] : "",
        detection_info: detections.find(d => d.email === email)?.reason || "",
      }});
      setDetections(prev => prev.filter(d => d.email !== email));
      show("success", "Detection dismissed for " + nameFromEmail(email));
    } catch (e) { show("error", safeError(e)); }
  };

  // ── Helper: parse JSON safely ──
  const safeJson = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
  const safeJsonArr = (str) => { try { return JSON.parse(str || "[]"); } catch { return []; } };
  // Parse targets — handles old format (array) and new format ({follow_up_mode, metrics})
  const parseTargets = (str) => {
    try {
      const parsed = JSON.parse(str || "[]");
      if (Array.isArray(parsed)) return { follow_up_mode: "weekly", metrics: parsed };
      if (parsed.metrics) return parsed;
      return { follow_up_mode: "weekly", metrics: [] };
    } catch { return { follow_up_mode: "weekly", metrics: [] }; }
  };

  // ── Filtered plans ──
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSupervisor = hasRole(profile?.role, "qa_supervisor");
  const isAdmin = hasRole(profile?.role, "admin");
  const myEmail = profile?.email?.toLowerCase();
  const myDomain = profile?.operational_domain || profile?.domain || "tabby.ai";

  // Leads see their team's plans; supervisors see their domain; admins see all
  const myTeamLocal = myEmail?.split("@")[0]||"";
  const myEmailAltAP = myEmail?(myEmail.endsWith("@tabby.ai")?myTeamLocal+"@tabby.sa":myTeamLocal+"@tabby.ai"):"";
  const myTeamEmails = roster.filter(r => {const m=r.manager_email?.toLowerCase();return m&&(m===myEmail||m===myEmailAltAP||m===myTeamLocal);}).map(r => r.email?.toLowerCase());
  const visiblePlans = isAdmin ? plans : isSupervisor ? plans.filter(p =>
    p.qa_email?.endsWith("@" + myDomain)
  ) : plans.filter(p =>
    p.created_by?.toLowerCase() === myEmail ||
    p.tl_email?.toLowerCase() === myEmail ||
    myTeamEmails.includes(p.qa_email?.toLowerCase())
  );

  const activePlans = visiblePlans.filter(p => p.status === "active" || p.status === "pending_review");
  const historyPlans = visiblePlans.filter(p => p.status !== "active" && p.status !== "pending_review");

  const getWeeksForPlan = (planId) => weeks.filter(w => w.plan_id === planId).sort((a, b) => a.week_number - b.week_number);

  // ── Calculate plan progress ──
  const getPlanProgress = (plan) => {
    const planWeeks = getWeeksForPlan(plan.id);
    const filledWeeks = planWeeks.filter(w => w.actual_data);
    const metWeeks = planWeeks.filter(w => w.met_targets === true);
    const totalWeeks = plan.duration_weeks || planWeeks.length;
    const elapsed = filledWeeks.length;
    const remaining = totalWeeks - elapsed;
    const successRate = filledWeeks.length ? (metWeeks.length / filledWeeks.length * 100) : 0;
    return { totalWeeks, elapsed, remaining, metWeeks: metWeeks.length, successRate, planWeeks, filledWeeks };
  };

  // ── Auto-calculate pass recommendation ──
  const getAutoRecommendation = (plan) => {
    const { planWeeks, metWeeks, filledWeeks } = getPlanProgress(plan);
    if (filledWeeks.length === 0) return null;
    // Pass if >= 60% of filled weeks met targets
    const rate = metWeeks / filledWeeks.length;
    if (rate >= 0.6) return "pass";
    return "fail";
  };

  if (loading && plans.length === 0) return <div className="page"><PulseLoader/></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title">Action Plans & PIPs</div>
          <div className="page-subtitle">
            {activePlans.length} active plan{activePlans.length !== 1 ? "s" : ""} · {detections.length} detected
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => startCreate("", "ap")}>
          <Icon d={icons.plus} size={16} />New plan
        </button>
      </div>

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>
          Active ({activePlans.length})
        </button>
        <button className={`tab-btn ${tab === "detection" ? "active" : ""}`} onClick={() => setTab("detection")}>
          Detection {detections.length > 0 && <span style={{ marginLeft: 4, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "var(--red-bg)", color: "var(--red)" }}>{detections.length}</span>}
        </button>
        {showCreateForm && <button className={`tab-btn ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>
          Create plan
        </button>}
        <button className={`tab-btn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          History ({historyPlans.length})
        </button>
      </div>

      {/* ═══ DETECTION TAB ═══ */}
      {tab === "detection" && <div>
        {detections.length === 0 ? (
          <div className="card"><div className="placeholder" style={{ padding: "40px" }}>
            <div className="placeholder-icon"><Icon d={icons.check} size={28} /></div>
            <h3>No auto-detections</h3>
            <p>No QAs currently need an Action Plan.<br />AP/PIP detection is triggered by DAM escalation steps with "includes PIP" enabled.</p>
          </div></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: "10px 14px", background: "var(--amber-bg)", borderRadius: 8, fontSize: 13, color: "var(--amber)", fontWeight: 500 }}>
              ⚠️ {detections.length} QA specialist{detections.length !== 1 ? "s" : ""} flagged for potential Action Plan. Review and confirm below.
            </div>
            {detections.map(d => (
              <div key={d.email} className="card" style={{
                borderLeft: `4px solid ${d.severity === "critical" ? "var(--red)" : d.severity === "warning" ? "var(--amber)" : "var(--blue)"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
                      {initialsFromEmail(d.email)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                      <div style={{ fontSize: 12, color: "var(--tx3)" }}>{d.email} · TL: {d.tl ? nameFromEmail(d.tl) : "—"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: d.severity === "critical" ? "var(--red-bg)" : d.severity === "warning" ? "var(--amber-bg)" : "var(--green-bg)",
                      color: d.severity === "critical" ? "var(--red)" : d.severity === "warning" ? "var(--amber)" : "var(--green)",
                    }}>{d.severity.toUpperCase()}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(d.totalScore) }}>
                      {d.totalScore.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--tx3)" }}> / 55</span>
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, color: "var(--tx2)" }}>
                  {d.reason}
                </div>

                {/* KPI breakdown mini */}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {d.kpis.map(k => (
                    <div key={k.key} style={{
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                      background: k.slab.slab === 0 ? "var(--red-bg)" : k.slab.slab === 1 ? "var(--amber-bg)" : "var(--green-bg)",
                      color: k.slab.slab === 0 ? "var(--red)" : k.slab.slab === 1 ? "var(--amber)" : "var(--green)",
                    }}>
                      {k.label}: {k.rawPct !== null ? k.rawPct.toFixed(1) + "%" : "—"} ({k.slab.label})
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => startCreate(d.email, d.planType || "pip")} style={d.planType === "pip" ? { background: "var(--red)", color: "#fff" } : {}}>
                    <Icon d={d.planType === "pip" ? icons.dam : icons.plan} size={14} />Create {(d.planType || "pip").toUpperCase()}
                  </button>
                  {hasRole(profile?.role, "super_admin") ?
                    <button className="btn btn-outline btn-sm" onClick={() => dismissDetectionDB(d.email, "")}>Dismiss</button> :
                    <button className="btn btn-outline btn-sm" onClick={() => { setDismissModalAP(d); setDismissReasonAP(""); }}>Dismiss</button>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dismiss reason modal for non-super-admins */}
        {dismissModalAP && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20,overflowY:"auto"}} onClick={e=>{if(e.target===e.currentTarget){setDismissModalAP(null);setDismissReasonAP("");}}}>
          <div className="card" style={{width:"100%",maxWidth:480,margin:20,maxHeight:"85vh",overflowY:"auto"}}>
            <div className="card-header"><span className="card-title">Dismiss Detection — {nameFromEmail(dismissModalAP.email)}</span></div>
            <div style={{fontSize:13,color:"var(--tx2)",marginBottom:12}}>{dismissModalAP.reason}</div>
            <div className="form-group">
              <label className="form-label">Reason for dismissal (required — visible to your supervisor)</label>
              <textarea className="form-input" rows={3} value={dismissReasonAP} onChange={e=>setDismissReasonAP(e.target.value)} placeholder="Why is this detection being dismissed?" style={{resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="btn btn-primary" disabled={!dismissReasonAP.trim()} onClick={async()=>{
                await dismissDetectionDB(dismissModalAP.email, dismissReasonAP.trim());
                setDismissModalAP(null);setDismissReasonAP("");
              }}>Confirm dismissal</button>
              <button className="btn btn-outline" onClick={()=>{setDismissModalAP(null);setDismissReasonAP("");}}>Cancel</button>
            </div>
          </div>
        </div>}
      </div>}

      {/* ═══ CREATE TAB ═══ */}
      {tab === "create" && showCreateForm && <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Create {planType === "pip" ? "Performance Improvement Plan" : "Action Plan"}</span>
          </div>
          <div className="form-grid">
            <div className="form-group" style={{ position: "relative" }}>
              <label className="form-label">QA Specialist</label>
              <input className="form-input" value={selQaEmail} onChange={e => handleQaEmailChange(e.target.value)} placeholder="Type name or email..." autoComplete="off" />
              {selQaEmail && !roster.find(r => r.email === selQaEmail) && (() => {
                const q = selQaEmail.toLowerCase();
                const matches = roster.filter(r => (r.email || "").toLowerCase().includes(q) || (r.display_name || "").toLowerCase().includes(q)).slice(0, 8);
                if (!matches.length) return null;
                return <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: "0 0 var(--radius) var(--radius)", boxShadow: "var(--shadow-lg)", maxHeight: 200, overflowY: "auto" }}>
                  {matches.map(r => <div key={r.email} onClick={() => handleQaEmailChange(r.email)} style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--bd2)", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontWeight: 500 }}>{r.email}</span>
                    <span style={{ color: "var(--tx3)", fontSize: 11 }}>{r.display_name || nameFromEmail(r.email)}</span>
                  </div>)}
                </div>;
              })()}
            </div>
            <div className="form-group">
              <label className="form-label">Plan type</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setPlanType("ap"); setPlanDuration(4); }} className={`btn ${planType === "ap" ? "btn-primary" : "btn-outline"}`} style={planType === "ap" ? { background: "var(--amber)" } : {}}>
                  📋 Action Plan
                </button>
                <button onClick={() => { setPlanType("pip"); setPlanDuration(8); }} className={`btn ${planType === "pip" ? "btn-primary" : "btn-outline"}`} style={planType === "pip" ? { background: "var(--red)", color: "#fff" } : {}}>
                  ⚠️ PIP
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Duration</label>
              <select className="select form-input" value={planDuration} onChange={e => {
                const d = Number(e.target.value);
                setPlanDuration(d);
                // Resize existing targets
                setPlanTargets(prev => prev.map(t => ({ ...t, weekly_targets: Array(d).fill("") })));
                setCustomMetrics(prev => prev.map(c => ({ ...c, targets: Array(d).fill("") })));
              }}>
                {followUpMode === "weekly" ? (
                  planType === "ap" ? <option value={4}>4 weeks</option> : <>
                    <option value={4}>4 weeks</option>
                    <option value={6}>6 weeks</option>
                    <option value={8}>8 weeks</option>
                  </>
                ) : (
                  <>
                    <option value={1}>1 month</option>
                    <option value={2}>2 months</option>
                    <option value={3}>3 months</option>
                    <option value={4}>4 months</option>
                  </>
                )}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Follow-up frequency</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setFollowUpMode("weekly"); setPlanDuration(4); setPlanTargets(prev => prev.map(t => ({ ...t, weekly_targets: Array(4).fill("") }))); setCustomMetrics(prev => prev.map(c => ({ ...c, targets: Array(4).fill("") }))); }} className={`btn ${followUpMode === "weekly" ? "btn-primary" : "btn-outline"}`} style={{ fontSize: 13 }}>
                  📅 Weekly
                </button>
                <button onClick={() => { setFollowUpMode("monthly"); setPlanDuration(1); setPlanTargets(prev => prev.map(t => ({ ...t, weekly_targets: Array(1).fill("") }))); setCustomMetrics(prev => prev.map(c => ({ ...c, targets: Array(1).fill("") }))); }} className={`btn ${followUpMode === "monthly" ? "btn-primary" : "btn-outline"}`} style={{ fontSize: 13 }}>
                  📆 Monthly
                </button>
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Reason / justification</label>
              <textarea className="form-input" rows={2} value={planReason} onChange={e => setPlanReason(e.target.value)} placeholder="Why is this plan being created? Reference specific KPIs, months, patterns..." style={{ resize: "vertical" }} />
            </div>
          </div>
        </div>

        {/* Target configuration */}
        {/* Step 2: KPI selection */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Select KPIs to track</span>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>Choose which metrics to include in the plan</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
            {Object.entries(KPI_SLABS).map(([key, def]) => {
              const isOn = selectedKpis.includes(key);
              // Get current value for this QA
              const months2 = sortMonthsDesc([...new Set(mtd.map(r => r.month))]);
              const row2 = selQaEmail ? mtd.find(r => r.month === months2[0] && r.qa_email?.toLowerCase() === selQaEmail.toLowerCase()) : null;
              const curVal = row2 ? parseRaw(row2[def.rawKey]) : null;
              return (
                <div key={key} onClick={() => toggleKpi(key)} style={{
                  padding: "10px 16px", borderRadius: 10, cursor: "pointer", minWidth: 140,
                  border: isOn ? "2px solid var(--accent)" : "2px solid var(--bd2)",
                  background: isOn ? "var(--accent-light)" : "var(--bg)",
                  transition: "all .15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: isOn ? "none" : "2px solid var(--bd)", background: isOn ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isOn && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{def.label}</span>
                  </div>
                  {curVal !== null && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Current: {curVal.toFixed(1)}%</div>}
                </div>
              );
            })}
          </div>

          {/* Custom metric input */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--bd2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx3)" }}>Custom metrics (not in KPI list)</span>
              <button className="btn btn-outline btn-sm" onClick={addCustomMetric} style={{ fontSize: 11 }}>+ Add custom metric</button>
            </div>
            {customMetrics.map((cm, ci) => (
              <div key={ci} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input className="form-input" value={cm.name} onChange={e => {
                  const upd = [...customMetrics]; upd[ci] = { ...upd[ci], name: e.target.value }; setCustomMetrics(upd);
                }} placeholder="Metric name (e.g. CSAT, Attendance, SBS quality...)" style={{ flex: 1, fontSize: 13, padding: "6px 10px" }} />
                <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={() => removeCustomMetric(ci)}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Step 3: Targets (manual entry) */}
        {(planTargets.length > 0 || customMetrics.length > 0) && <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Set {followUpMode === "monthly" ? "monthly" : "weekly"} targets</span>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>Enter target % for each metric per {followUpMode === "monthly" ? "month" : "week"}</span>
          </div>
          <div className="table-wrap">
            <table style={{ fontSize: 12 }}>
              <thead><tr>
                <th>Metric</th>
                <th style={{ textAlign: "center" }}>Current</th>
                {Array.from({ length: planDuration }, (_, i) => (
                  <th key={i} style={{ textAlign: "center" }}>{followUpMode === "monthly" ? `M${i + 1}` : `W${i + 1}`} target</th>
                ))}
                <th style={{ textAlign: "center" }}>Avg</th>
              </tr></thead>
              <tbody>
                {planTargets.map((t, ti) => {
                  const filled = t.weekly_targets.filter(w => w !== "" && w !== null && w !== undefined);
                  const avg = filled.length > 0 ? filled.reduce((a, b) => a + Number(b), 0) / filled.length : null;
                  return (
                  <tr key={t.kpi_key}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>
                      {t.label}
                      {t.current_slab && t.current_slab !== "—" && <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 400 }}>{t.current_slab}</div>}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 500, color: t.current_value !== null ? (t.current_value >= t.thresholds?.[0] ? "var(--green)" : "var(--red)") : "var(--tx3)" }}>
                      {t.current_value !== null ? t.current_value.toFixed(1) + "%" : "—"}
                    </td>
                    {Array.from({ length: planDuration }, (_, wi) => (
                      <td key={wi} style={{ textAlign: "center" }}>
                        <input type="number" step="0.1" className="form-input" value={t.weekly_targets[wi] ?? ""} onChange={e => {
                          const newTargets = [...planTargets];
                          const newWeekly = [...newTargets[ti].weekly_targets];
                          newWeekly[wi] = e.target.value === "" ? "" : Number(e.target.value);
                          newTargets[ti] = { ...newTargets[ti], weekly_targets: newWeekly };
                          setPlanTargets(newTargets);
                        }} placeholder="%" style={{ width: 60, textAlign: "center", padding: "4px 6px", fontSize: 12 }} />
                      </td>
                    ))}
                    <td style={{ textAlign: "center", fontWeight: 600, fontSize: 12, color: avg !== null ? "var(--accent-text)" : "var(--tx3)" }}>
                      {avg !== null ? avg.toFixed(1) + "%" : "—"}
                    </td>
                  </tr>);
                })}
                {customMetrics.map((cm, ci) => {
                  const filledC = cm.targets.filter(t => t !== "" && t !== null && t !== undefined);
                  const nums = filledC.map(Number).filter(n => !isNaN(n));
                  const avgC = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
                  return (
                  <tr key={"custom_" + ci} style={{ background: "var(--bg)" }}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>
                      {cm.name || <span style={{ color: "var(--tx3)", fontStyle: "italic" }}>Custom metric</span>}
                      <div style={{ fontSize: 10, color: "var(--accent-text)", fontWeight: 400 }}>Custom</div>
                    </td>
                    <td style={{ textAlign: "center", color: "var(--tx3)" }}>—</td>
                    {Array.from({ length: planDuration }, (_, wi) => (
                      <td key={wi} style={{ textAlign: "center" }}>
                        <input className="form-input" value={cm.targets[wi] ?? ""} onChange={e => {
                          const upd = [...customMetrics];
                          const newT = [...upd[ci].targets];
                          newT[wi] = e.target.value;
                          upd[ci] = { ...upd[ci], targets: newT };
                          setCustomMetrics(upd);
                        }} placeholder="target" style={{ width: 60, textAlign: "center", padding: "4px 6px", fontSize: 12 }} />
                      </td>
                    ))}
                    <td style={{ textAlign: "center", fontWeight: 600, fontSize: 12, color: avgC !== null ? "var(--accent-text)" : "var(--tx3)" }}>
                      {avgC !== null ? avgC.toFixed(1) : "—"}
                    </td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 8, fontStyle: "italic" }}>
            {followUpMode === "monthly" ? "Targets will be reviewed at the end of each month." : "Targets will be reviewed weekly. Actuals are pulled from MTD data."}{customMetrics.length > 0 ? " Custom metrics are tracked manually." : ""}
          </div>
        </div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={savePlan} disabled={loading}>
            {loading ? "Creating..." : <><Icon d={icons.check} size={16} />Create {planType === "pip" ? "PIP" : "Action Plan"}</>}
          </button>
          <button className="btn btn-outline" onClick={() => { setShowCreateForm(false); setTab("active"); }}>Cancel</button>
        </div>
      </div>}

      {/* ═══ ACTIVE PLANS TAB ═══ */}
      {tab === "active" && <div>
        {activePlans.length === 0 ? (
          <div className="card"><div className="placeholder" style={{ padding: "40px" }}>
            <div className="placeholder-icon"><Icon d={icons.plan} size={28} /></div>
            <h3>No active plans</h3>
            <p>Create a new Action Plan or PIP from the Detection tab or the button above.</p>
          </div></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {activePlans.map(plan => {
              const prog = getPlanProgress(plan);
              const isExp = expandedPlan === plan.id;
              const targetsData = parseTargets(plan.targets);
              const targets = targetsData.metrics;
              const autoRec = getAutoRecommendation(plan);
              const progressPct = prog.totalWeeks ? (prog.elapsed / prog.totalWeeks) * 100 : 0;
              const daysLeft = plan.end_date ? Math.max(0, Math.ceil((new Date(plan.end_date) - Date.now()) / (1000 * 60 * 60 * 24))) : null;

              return (
                <div key={plan.id} className="card" style={{
                  borderLeft: `4px solid ${plan.type === "pip" ? "var(--red)" : "var(--amber)"}`,
                }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, cursor: "pointer" }} onClick={() => setExpandedPlan(isExp ? null : plan.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: plan.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                        color: plan.type === "pip" ? "var(--red)" : "var(--amber)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700,
                      }}>
                        {plan.type === "pip" ? "⚠️" : "📋"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{nameFromEmail(plan.qa_email)}</div>
                        <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                          <span style={{
                            padding: "1px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                            background: plan.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                            color: plan.type === "pip" ? "var(--red)" : "var(--amber)",
                            marginRight: 6,
                          }}>{plan.type.toUpperCase()}</span>
                          {plan.team || "—"} · Created by {nameFromEmail(plan.created_by)} · {new Date(plan.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })} — {new Date(plan.end_date).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Progress</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: prog.successRate >= 60 ? "var(--green)" : "var(--red)" }}>
                          {prog.metWeeks}/{prog.elapsed} {targetsData.follow_up_mode === "monthly" ? "months" : "weeks"} met
                        </div>
                      </div>
                      {daysLeft !== null && <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Remaining</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: daysLeft <= 7 ? "var(--red)" : "var(--tx)" }}>{daysLeft}d</div>
                      </div>}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform .2s", transform: isExp ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginTop: 12, height: 6, background: "var(--bd2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: 3, background: prog.successRate >= 60 ? "var(--green)" : "var(--amber)", transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--tx3)", marginTop: 4 }}>
                    <span>{targetsData.follow_up_mode === "monthly" ? "Month" : "Week"} {prog.elapsed} of {prog.totalWeeks}</span>
                    <span>Success rate: {prog.successRate.toFixed(0)}%</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--bd2)" }}>

                    {/* Reason */}
                    {plan.reason && <div style={{ marginBottom: 14, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, color: "var(--tx2)" }}>
                      <span style={{ fontWeight: 600, color: "var(--tx)" }}>Reason: </span>{plan.reason}
                    </div>}

                    {/* Weekly tracking table */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx2)", textTransform: "uppercase", letterSpacing: ".5px" }}>{targetsData.follow_up_mode === "monthly" ? "Monthly" : "Weekly"} tracking</div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:10,color:"var(--tx3)",fontWeight:500}}>Pull from:</span>
                        <select className="form-input" style={{fontSize:11,padding:"3px 8px",width:"auto",minWidth:120}} value={pullMonth} onChange={e=>setPullMonth(e.target.value)}>
                          <option value="">Latest month</option>
                          {sortMonthsDesc([...new Set(mtd.map(r=>r.month))]).map(m=><option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table style={{ fontSize: 12 }}>
                        <thead><tr>
                          <th>{targetsData.follow_up_mode === "monthly" ? "Month" : "Week"}</th>
                          <th>Date</th>
                          {targets.map(t => <th key={t.kpi_key || t.label} style={{ textAlign: "center" }}>{t.label}{t.is_custom ? <div style={{fontSize:9,color:"var(--tx3)",fontWeight:400}}>Custom</div> : ""}</th>)}
                          <th style={{ textAlign: "center" }}>Met?</th>
                          <th style={{ width: 80 }}></th>
                        </tr></thead>
                        <tbody>
                          {prog.planWeeks.map(week => {
                            const targetData = safeJson(week.target_data);
                            const actualData = safeJson(week.actual_data);
                            const hasActuals = week.actual_data && Object.keys(actualData).length > 0;

                            return (
                              <tr key={week.id} style={{ background: hasActuals ? (week.met_targets ? "var(--green-bg)" : "var(--red-bg)") : "transparent" }}>
                                <td style={{ fontWeight: 600 }}>{targetsData.follow_up_mode === "monthly" ? "M" : "W"}{week.week_number}</td>
                                <td style={{ fontSize: 11, color: "var(--tx3)" }}>
                                  {week.week_start ? new Date(week.week_start + "T00:00:00").toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"}
                                </td>
                                {targets.map(t => {
                                  const tKey = t.kpi_key || t.label;
                                  const target = targetData[tKey];
                                  const actual = actualData?.[tKey];
                                  const met = actual !== null && actual !== undefined && target !== undefined && Number(actual) >= Number(target);
                                  return (
                                    <td key={tKey} style={{ textAlign: "center" }}>
                                      <div style={{ fontSize: 11, color: "var(--tx3)" }}>T: {target !== undefined ? target + (t.is_custom ? "" : "%") : "—"}</div>
                                      {hasActuals && <div style={{ fontSize: 12, fontWeight: 600, color: met ? "var(--green)" : "var(--red)" }}>
                                        A: {actual !== null && actual !== undefined ? (typeof actual === "number" ? actual.toFixed(1) + "%" : actual) : "—"}
                                      </div>}
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: "center" }}>
                                  {hasActuals ? (
                                    week.met_targets ?
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>✅</span> :
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>❌</span>
                                  ) : <span style={{ color: "var(--tx3)" }}>—</span>}
                                </td>
                                <td>
                                  {!hasActuals && <button className="btn btn-outline btn-sm" onClick={() => updateWeekActuals(week.id, plan.qa_email)} style={{ fontSize: 10, padding: "2px 8px" }}>
                                    Pull MTD
                                  </button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      {/* Send coaching review email */}
                      <button className="btn btn-outline btn-sm" style={{ color: "var(--accent-text)" }} onClick={() => {
                        window.dispatchEvent(new CustomEvent("navigate", { detail: "coaching" }));
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent("prefill-coaching", { detail: {
                            email: plan.qa_email,
                            type: plan.type === "pip" ? "PIP Review" : "Action Plan Review",
                          }}));
                        }, 300);
                      }}>
                        <Icon d={icons.coaching} size={14} />Send Review Email
                      </button>

                      {/* Schedule Google Calendar meeting */}
                      <button className="btn btn-outline btn-sm" onClick={() => {
                        const title = encodeURIComponent(`${plan.type === "pip" ? "PIP" : "AP"} Review — ${plan.qa_email?.split("@")[0].split(".").map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(" ")}`);
                        const details = encodeURIComponent(`${plan.type === "pip" ? "PIP" : "Action Plan"} follow-up meeting.\n\nQA: ${plan.qa_email}\nPlan created: ${new Date(plan.created_at).toLocaleDateString()}`);
                        const attendee = encodeURIComponent(plan.qa_email);
                        const now = new Date();
                        const start = new Date(now.getTime() + 24*60*60*1000); // tomorrow
                        start.setHours(10,0,0,0);
                        const end = new Date(start.getTime() + 30*60*1000); // 30 min
                        const fmt = (d) => d.toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
                        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${fmt(start)}/${fmt(end)}&add=${attendee}`;
                        window.open(url, "_blank");
                      }}>
                        <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={14} />Schedule Meeting
                      </button>

                      {/* Pull all remaining weeks */}
                      {prog.planWeeks.some(w => !w.actual_data) && <button className="btn btn-outline btn-sm" onClick={async () => {
                        for (const w of prog.planWeeks.filter(w => !w.actual_data)) {
                          await updateWeekActuals(w.id, plan.qa_email);
                        }
                      }}>
                        <Icon d={icons.upload} size={14} />Pull all actuals from MTD
                      </button>}

                      {/* Conclude */}
                      <button className="btn btn-primary btn-sm" onClick={() => {
                        setConcludingPlan(plan);
                        const rec = getAutoRecommendation(plan);
                        setConclusionOutcome(rec || "");
                      }}>
                        <Icon d={icons.check} size={14} />Conclude {plan.type.toUpperCase()}
                      </button>

                      {/* Failed AP → suggest PIP */}
                      {plan.type === "ap" && prog.successRate < 50 && prog.elapsed >= 2 && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={() => startCreate(plan.qa_email, "pip")}>
                        <Icon d={icons.dam} size={14} />Escalate to PIP
                      </button>}

                      {/* Super admin: hard delete */}
                      {hasRole(profile?.role, "super_admin") && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)", marginLeft: "auto" }} onClick={async (e) => {
                        e.stopPropagation();
                        confirmAsk(`Delete ${plan.type.toUpperCase()}?`,`Permanently delete this plan for ${nameFromEmail(plan.qa_email)}? This cannot be undone.`,async()=>{
                        try {
                          await sb.query("action_plan_weeks", { token, method: "DELETE", filters: `plan_id=eq.${plan.id}` });
                          await sb.query("action_plans", { token, method: "DELETE", filters: `id=eq.${plan.id}` });
                          show("success", "Plan permanently deleted");
                          setPlans(prev => prev.filter(p => p.id !== plan.id));
                          setWeeks(prev => prev.filter(w => w.plan_id !== plan.id));
                        } catch (err) { show("error", safeError(err)); }
                      },"Delete","var(--red)");}}>
                        <Icon d={icons.trash} size={14} />Delete
                      </button>}
                    </div>

                    {/* Audit trail */}
                    <div style={{ marginTop: 14, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 11, color: "var(--tx3)" }}>
                      Created by {nameFromEmail(plan.created_by)} on {new Date(plan.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                      {plan.tl_email && <span> · TL: {nameFromEmail(plan.tl_email)}</span>}
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === "history" && <div className="card">
        {historyPlans.length === 0 ? (
          <div className="placeholder" style={{ padding: "40px" }}>
            <p style={{ color: "var(--tx3)" }}>No completed plans in history.</p>
          </div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>QA Specialist</th>
              <th>Type</th>
              <th>Duration</th>
              <th style={{ textAlign: "center" }}>Result</th>
              <th>Created by</th>
              <th>Date range</th>
              <th>Concluded by</th>
              <th>Notes</th>
              {hasRole(profile?.role, "super_admin") && <th></th>}
            </tr></thead>
            <tbody>
              {historyPlans.map(p => {
                const prog = getPlanProgress(p);
                const isHistExp = expandedPlan === "h-" + p.id;
                const hTargets = parseTargets(p.targets);
                const hMetrics = hTargets.metrics;
                const isMonthlyH = hTargets.follow_up_mode === "monthly";
                return (<React.Fragment key={p.id}>
                  <tr onClick={() => setExpandedPlan(isHistExp ? null : "h-" + p.id)} style={{ cursor: "pointer" }}>
                    <td style={{ fontWeight: 500 }}>{nameFromEmail(p.qa_email)}</td>
                    <td>
                      <span style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                        background: p.type === "pip" ? "var(--red-bg)" : "var(--amber-bg)",
                        color: p.type === "pip" ? "var(--red)" : "var(--amber)",
                      }}>{p.type.toUpperCase()}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{p.duration_weeks}{isMonthlyH ? "m" : "w"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        padding: "3px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: p.conclusion === "pass" ? "var(--green-bg)" : "var(--red-bg)",
                        color: p.conclusion === "pass" ? "var(--green)" : "var(--red)",
                      }}>
                        {p.conclusion === "pass" ? "Passed" : "Failed"}
                      </span>
                      <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{prog.metWeeks}/{prog.elapsed} {isMonthlyH ? "months" : "weeks"} met</div>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>{nameFromEmail(p.created_by)}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>
                      {p.start_date ? new Date(p.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"} — {p.end_date ? new Date(p.end_date).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>{nameFromEmail(p.concluded_by)}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.conclusion_notes || "—"}
                    </td>
                    {hasRole(profile?.role, "super_admin") && <td>
                      <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async (e) => {
                        e.stopPropagation();
                        confirmAsk(`Delete ${p.type.toUpperCase()}?`,`Permanently delete this plan for ${nameFromEmail(p.qa_email)}?`,async()=>{
                        try {
                          await sb.query("action_plan_weeks", { token, method: "DELETE", filters: `plan_id=eq.${p.id}` });
                          await sb.query("action_plans", { token, method: "DELETE", filters: `id=eq.${p.id}` });
                          show("success", "Plan permanently deleted");
                          setPlans(prev => prev.filter(x => x.id !== p.id));
                          setWeeks(prev => prev.filter(w => w.plan_id !== p.id));
                        } catch (err) { show("error", safeError(err)); }
                      },"Delete","var(--red)");}}><Icon d={icons.trash} size={14} /></button>
                    </td>}
                  </tr>
                  {/* Expanded tracking detail */}
                  {isHistExp && <tr><td colSpan={hasRole(profile?.role, "super_admin") ? 9 : 8} style={{ padding: "16px", background: "var(--bg)" }}>
                    {p.reason && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--tx2)" }}>
                      <span style={{ fontWeight: 600, color: "var(--tx)" }}>Reason: </span>{p.reason}
                    </div>}
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>{isMonthlyH ? "Monthly" : "Weekly"} tracking</div>
                    <table style={{ fontSize: 12, width: "100%" }}>
                      <thead><tr>
                        <th>{isMonthlyH ? "Month" : "Week"}</th>
                        <th>Date</th>
                        {hMetrics.map(t => <th key={t.kpi_key || t.label} style={{ textAlign: "center" }}>{t.label}</th>)}
                        <th style={{ textAlign: "center" }}>Met?</th>
                      </tr></thead>
                      <tbody>
                        {prog.planWeeks.map(week => {
                          const td = safeJson(week.target_data);
                          const ad = safeJson(week.actual_data);
                          const hasA = week.actual_data && Object.keys(ad).length > 0;
                          return <tr key={week.id} style={{ background: hasA ? (week.met_targets ? "var(--green-bg)" : "var(--red-bg)") : "transparent" }}>
                            <td style={{ fontWeight: 600 }}>{isMonthlyH ? "M" : "W"}{week.week_number}</td>
                            <td style={{ fontSize: 11, color: "var(--tx3)" }}>{week.week_start ? new Date(week.week_start + "T00:00:00").toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"}</td>
                            {hMetrics.map(t => {
                              const tKey = t.kpi_key || t.label;
                              const target = td[tKey];
                              const actual = ad?.[tKey];
                              const met = actual != null && target != null && Number(actual) >= Number(target);
                              return <td key={tKey} style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 11, color: "var(--tx3)" }}>T: {target != null ? target + "%" : "—"}</div>
                                {hasA && <div style={{ fontSize: 12, fontWeight: 600, color: met ? "var(--green)" : "var(--red)" }}>A: {actual != null ? (typeof actual === "number" ? actual.toFixed(1) + "%" : actual) : "—"}</div>}
                              </td>;
                            })}
                            <td style={{ textAlign: "center" }}>{hasA ? (week.met_targets ? <span style={{ color: "var(--green)", fontWeight: 700 }}>Yes</span> : <span style={{ color: "var(--red)", fontWeight: 700 }}>No</span>) : "—"}</td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                    {p.conclusion_notes && <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg3)", borderRadius: 6, fontSize: 12, color: "var(--tx2)" }}>
                      <span style={{ fontWeight: 600 }}>Conclusion notes: </span>{p.conclusion_notes}
                    </div>}
                  </td></tr>}
                </React.Fragment>);
              })}
            </tbody>
          </table></div>
        )}
      </div>}

      {/* ═══ CONCLUSION MODAL ═══ */}
      {concludingPlan && <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, overflowY: "auto",
      }} onClick={(e) => { if (e.target === e.currentTarget) setConcludingPlan(null); }}>
        <div className="card" style={{ width: "100%", maxWidth: 520, margin: 20, maxHeight: "85vh", overflowY: "auto" }}>
          <div className="card-header">
            <span className="card-title">Conclude {concludingPlan.type.toUpperCase()} — {nameFromEmail(concludingPlan.qa_email)}</span>
          </div>

          {/* Auto-recommendation */}
          {(() => {
            const rec = getAutoRecommendation(concludingPlan);
            const prog = getPlanProgress(concludingPlan);
            return rec ? (
              <div style={{ padding: "10px 14px", background: rec === "pass" ? "var(--green-bg)" : "var(--red-bg)", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: rec === "pass" ? "var(--green)" : "var(--red)" }}>
                  Auto-recommendation: {rec === "pass" ? "✅ PASS" : "❌ FAIL"}
                </span>
                <span style={{ color: "var(--tx2)", marginLeft: 8 }}>({prog.metWeeks}/{prog.elapsed} periods met targets — {prog.successRate.toFixed(0)}%)</span>
              </div>
            ) : null;
          })()}

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setConclusionOutcome("pass")} className={`btn ${conclusionOutcome === "pass" ? "btn-primary" : "btn-outline"}`} style={conclusionOutcome === "pass" ? { background: "var(--green)", color: "#fff" } : {}}>✅ Passed</button>
            <button onClick={() => setConclusionOutcome("fail")} className={`btn ${conclusionOutcome === "fail" ? "btn-primary" : "btn-outline"}`} style={conclusionOutcome === "fail" ? { background: "var(--red)", color: "#fff" } : {}}>❌ Failed</button>
          </div>

          <div className="form-group">
            <label className="form-label">Conclusion notes</label>
            <textarea className="form-input" rows={3} value={conclusionNotes} onChange={e => setConclusionNotes(e.target.value)} placeholder="Document the final assessment..." style={{ resize: "vertical" }} />
          </div>

          {conclusionOutcome === "fail" && concludingPlan.type === "ap" && (
            <div style={{ padding: "8px 12px", background: "var(--amber-bg)", borderRadius: 6, fontSize: 12, color: "var(--amber)", fontWeight: 500, marginTop: 8 }}>
              ⚠️ Failed AP will recommend escalation to PIP.
            </div>
          )}
          {conclusionOutcome === "fail" && concludingPlan.type === "pip" && (
            <div style={{ padding: "8px 12px", background: "var(--red-bg)", borderRadius: 6, fontSize: 12, color: "var(--red)", fontWeight: 500, marginTop: 8 }}>
              ⚠️ Failed PIP will automatically create a DAM flag for HR investigation.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={concludePlan} disabled={!conclusionOutcome || loading}>
              {loading ? "Processing..." : "Confirm conclusion"}
            </button>
            <button className="btn btn-outline" onClick={() => { setConcludingPlan(null); setConclusionOutcome(""); setConclusionNotes(""); }}>Cancel</button>
          </div>
        </div>
      </div>}

      {el}
      {confirmEl}
    </div>
  );
}

export default ActionPlanPage;
