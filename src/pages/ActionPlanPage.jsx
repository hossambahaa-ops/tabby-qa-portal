import React, { useState, useEffect, useRef, useCallback } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity } from "../lib/utils.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import { useApp } from "../lib/AppContext.jsx";
import APDetectionTab from "../components/actionplan/APDetectionTab.jsx";
import APCreateForm from "../components/actionplan/APCreateForm.jsx";
import APConcludeModal from "../components/actionplan/APConcludeModal.jsx";
import APActivePlanCard from "../components/actionplan/APActivePlanCard.jsx";
import APHistoryTab from "../components/actionplan/APHistoryTab.jsx";
import useKeyboard from "../lib/useKeyboard.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";
import { KPI_SLABS, parseRaw, calcSlab, scoreColor, scoreBg, safeJson, safeJsonArr, parseTargets } from "../lib/actionPlan.js";

function ActionPlanPage() {
  const{token,profile,globalToast}=useApp();
  const [tab, setTab] = useUrlState("ap_tab", "active"); // active | create | detection | history
  useKeyboard({"1":()=>setTab("active"),"2":()=>setTab("detection"),"3":()=>setTab("create"),"4":()=>setTab("history")});
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [mtd, setMtd] = useState([]);
  const [roster, setRoster] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [detections, setDetections] = useState([]);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  // ── Create form state ──
  const [selQaEmail, setSelQaEmail] = useState("");
  const [planType, setPlanType] = useState("ap"); // ap | pip
  const [planDuration, setPlanDuration] = useState(4);
  const [planStartDate, setPlanStartDate] = useState(() => new Date().toISOString().split("T")[0]);
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
    setPlanStartDate(new Date().toISOString().split("T")[0]);
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
    if (!selQaEmail) { globalToast("error", "Select a QA specialist"); return; }
    if (!planReason.trim()) { globalToast("error", "Provide a reason for this plan"); return; }
    if (planTargets.length === 0 && customMetrics.length === 0) { globalToast("error", "Select at least one KPI or add a custom metric"); return; }
    // Validate KPI targets
    const missingTargets = planTargets.some(t => t.weekly_targets.some(w => w === "" || w === null || w === undefined));
    if (missingTargets) { globalToast("error", "Fill in all targets for each selected KPI"); return; }
    // Validate custom metrics
    const invalidCustom = customMetrics.some(c => !c.name.trim() || c.targets.some(t => t === "" || t === null || t === undefined));
    if (invalidCustom) { globalToast("error", "Fill in name and all targets for each custom metric"); return; }

    const existing = plans.find(p =>
      p.qa_email?.toLowerCase() === selQaEmail.toLowerCase() &&
      p.type === planType &&
      (p.status === "active" || p.status === "pending_review")
    );
    if (existing) {
      globalToast("error", `${nameFromEmail(selQaEmail)} already has an active ${existing.type.toUpperCase()} plan`);
      return;
    }

    setLoading(true);
    try {
      const startDate = planStartDate || new Date().toISOString().split("T")[0];
      const startMs = new Date(startDate + "T00:00:00").getTime();
      const periodDays = followUpMode === "monthly" ? planDuration * 30 : planDuration * 7;
      const endDate = new Date(startMs + periodDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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
          const periodStart = new Date(startMs + pDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
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

      globalToast("success", `${planType.toUpperCase()} created for ${nameFromEmail(selQaEmail)}`);
      logActivity(token, profile?.email, `${planType}_created`, "action_plans", null, `QA: ${selQaEmail}, Duration: ${planDuration} weeks`);
      setShowCreateForm(false);
      setTab("active");
      // Reload to get new plan with ID
      load();
    } catch (e) {
      globalToast("error", safeError(e));
    }
    setLoading(false);
  };

  // ── Update week actuals ──
  const updateWeekActuals = async (weekId, qaEmail, selectedMonth) => {
    // Find the plan for this week
    const week = weeks.find(w => w.id === weekId);
    if (!week) { globalToast("error", "Week not found"); return; }
    const plan = plans.find(p => p.id === week.plan_id);
    if (!plan) { globalToast("error", "Plan not found"); return; }

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
    if (!row) { globalToast("error", "No MTD data found for " + nameFromEmail(qaEmail) + " in " + useMonth); return; }

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
      globalToast("success", "Actuals updated from MTD (" + useMonth + ")");
      setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, actual_data: JSON.stringify(actualData), met_targets: metTargets, updated_at: new Date().toISOString() } : w));
    } catch (e) { globalToast("error", safeError(e)); }
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
            globalToast("success", "PIP failed — DAM flag created for HR investigation");
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
            globalToast("success", `AP failed — DAM flag created (occurrence #${occurrence}${step ? ": " + step.action : ""})`);
          }
        } catch (e) {
          console.error("DAM flag creation:", e);
          globalToast("error", "AP concluded as failed. Could not create DAM flag: " + e.message);
        }
      } else {
        globalToast("success", `${concludingPlan.type.toUpperCase()} concluded as ${conclusionOutcome === "pass" ? "PASSED" : "FAILED"}`);
        logActivity(token, profile?.email, `${concludingPlan.type}_concluded`, "action_plans", concludingPlan.id, `QA: ${concludingPlan.qa_email}, Result: ${conclusionOutcome}`);
      }

      setConcludingPlan(null);
      setConclusionOutcome("");
      setConclusionNotes("");
      // Optimistic update
      const newStatus = conclusionOutcome === "pass" ? "completed_pass" : "completed_fail";
      setPlans(prev => prev.map(p => p.id === concludingPlan.id ? { ...p, status: newStatus, conclusion: conclusionOutcome, conclusion_notes: conclusionNotes, concluded_by: profile?.email, concluded_at: new Date().toISOString() } : p));
    } catch (e) { globalToast("error", safeError(e)); }
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
      globalToast("success", "Detection dismissed for " + nameFromEmail(email));
    } catch (e) { globalToast("error", safeError(e)); }
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

  if (loading && plans.length === 0) return <div className="page"><SkeletonPage/></div>;

  return (
    <div className="page">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{padding:"4px 12px",borderRadius:20,background:"var(--primary-light)",color:"var(--primary-text,var(--tabby-purple))",fontSize:12,fontWeight:600}}>{activePlans.length} active</span>
          {detections.length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--amber-bg)",color:"var(--amber)",fontSize:12,fontWeight:600}}>{detections.length} detected</span>}
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
      {tab === "detection" && <APDetectionTab
        detections={detections}
        startCreate={startCreate}
        dismissDetectionDB={dismissDetectionDB}
        nameFromEmail={nameFromEmail}
        initialsFromEmail={initialsFromEmail}
        scoreColor={scoreColor}
      />}

      {/* ═══ CREATE TAB ═══ */}
      {tab === "create" && showCreateForm && <APCreateForm
        selQaEmail={selQaEmail}
        planType={planType}
        planDuration={planDuration}
        planStartDate={planStartDate}
        planReason={planReason}
        planTargets={planTargets}
        selectedKpis={selectedKpis}
        followUpMode={followUpMode}
        customMetrics={customMetrics}
        loading={loading}
        roster={roster}
        mtd={mtd}
        KPI_SLABS={KPI_SLABS}
        handleQaEmailChange={handleQaEmailChange}
        setPlanType={setPlanType}
        setPlanDuration={setPlanDuration}
        setPlanStartDate={setPlanStartDate}
        setPlanReason={setPlanReason}
        setPlanTargets={setPlanTargets}
        setFollowUpMode={setFollowUpMode}
        setCustomMetrics={setCustomMetrics}
        toggleKpi={toggleKpi}
        addCustomMetric={addCustomMetric}
        removeCustomMetric={removeCustomMetric}
        savePlan={savePlan}
        onCancel={() => { setShowCreateForm(false); setTab("active"); }}
        nameFromEmail={nameFromEmail}
        parseRaw={parseRaw}
      />}

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
            {activePlans.map(plan => (
              <APActivePlanCard
                key={plan.id}
                plan={plan}
                expandedPlan={expandedPlan}
                setExpandedPlan={setExpandedPlan}
                getPlanProgress={getPlanProgress}
                parseTargets={parseTargets}
                getAutoRecommendation={getAutoRecommendation}
                safeJson={safeJson}
                updateWeekActuals={updateWeekActuals}
                setConcludingPlan={setConcludingPlan}
                setConclusionOutcome={setConclusionOutcome}
                startCreate={startCreate}
                nameFromEmail={nameFromEmail}
                mtd={mtd}
                pullMonth={pullMonth}
                setPullMonth={setPullMonth}
                setPlans={setPlans}
                setWeeks={setWeeks}
                confirmAsk={confirmAsk}
                loading={loading}
              />
            ))}
          </div>
        )}
      </div>}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === "history" && <APHistoryTab
        historyPlans={historyPlans}
        expandedPlan={expandedPlan}
        setExpandedPlan={setExpandedPlan}
        getPlanProgress={getPlanProgress}
        parseTargets={parseTargets}
        safeJson={safeJson}
        setPlans={setPlans}
        setWeeks={setWeeks}
      />}

      {/* ═══ CONCLUSION MODAL ═══ */}
      <APConcludeModal
        concludingPlan={concludingPlan}
        setConcludingPlan={setConcludingPlan}
        conclusionOutcome={conclusionOutcome}
        setConclusionOutcome={setConclusionOutcome}
        conclusionNotes={conclusionNotes}
        setConclusionNotes={setConclusionNotes}
        concludePlan={concludePlan}
        loading={loading}
        getAutoRecommendation={getAutoRecommendation}
        getPlanProgress={getPlanProgress}
        nameFromEmail={nameFromEmail}
      />

      {confirmEl}
    </div>
  );
}

export default ActionPlanPage;
