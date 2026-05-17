import React, { useState, useEffect, useRef, useCallback } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { riyadhTodayStr } from "../lib/attendancePlan.js";
import { nameFromEmail, initialsFromEmail, safeError, logActivity } from "../lib/utils.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { useAutoRefresh } from "../lib/hooks.jsx";
import APDetectionTab from "../components/actionplan/APDetectionTab.jsx";
import APCreateForm from "../components/actionplan/APCreateForm.jsx";
import APConcludeModal from "../components/actionplan/APConcludeModal.jsx";
import APActivePlanCard from "../components/actionplan/APActivePlanCard.jsx";
import APHistoryTab from "../components/actionplan/APHistoryTab.jsx";
import useKeyboard from "../lib/useKeyboard.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";
import { KPI_SLABS, parseRaw, calcSlab, scoreColor, scoreBg, safeJson, safeJsonArr, parseTargets, getKpiScores, getTotalScore, generateTargets as buildTargets, computeDetections } from "../lib/actionPlan.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listMtd } from "../api/mtd.js";
import { listPlans, listPlanWeeks } from "../api/plans.js";
import { loadTeamForViewer } from "../lib/teamScope.js";

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
  // Role-scoped allow-list of QA emails — drives the Detection list so
  // a lead only sees their direct reports and a supervisor only sees
  // their reports' QAs. `null` = unrestricted (admin / auditor view).
  const [scopeEmails, setScopeEmails] = useState(null);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  // ── Create form state ──
  const [selQaEmail, setSelQaEmail] = useState("");
  const [planType, setPlanType] = useState("ap"); // ap | pip
  const [planDuration, setPlanDuration] = useState(4);
  const [planStartDate, setPlanStartDate] = useState(() => riyadhTodayStr());
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

  // ── Data loading ──
  const load = useCallback(async () => {
    try {
      const [planRows, weekRows, mtdRows, rosterRows, profRows, dismissalRows, damFlags, damSteps, candidateRows, candDismissals] = await Promise.all([
        listPlans({ token }),
        listPlanWeeks({ token }),
        listMtd({ token }),
        listRoster({ token }),
        listProfiles({ token }),
        sb.query("ap_dismissals", { select: "*", filters: "order=created_at.desc", token }).catch(() => []),
        sb.query("dam_flags", { select: "id,profile_id,rule_id,occurrence_number,status,notes,profiles!dam_flags_profile_id_fkey(email,display_name),dam_rules(name,behavior_type)", filters: "order=triggered_at.desc", token }).catch(() => []),
        dataCache.fetch("dam_escalation_steps",()=>sb.query("dam_escalation_steps", { select: "id,rule_id,occurrence,action,includes_pip,pip_action", token }).catch(() => [])),
        // Month-end KPI candidates view — Calibration/RTR/Occupancy
        // thresholds. Per-occurrence escalation follows the DAM step
        // table (dam_action_label, plan_type, deduction_days,
        // is_hr_investigation). KSA override at occurrence 1 only:
        // "Verbal Warning + AP" instead of just "Verbal Warning".
        sb.query("pip_ap_candidates_v", {
          select: "qa_email,month,domain,qa_tl,failing_kpis,occurrence,plan_type,dam_action_label,deduction_days,is_hr_investigation,needs_review,had_failed_ap_recently,recurring_same_kpi,cal_pct,rtr_pct,occ_pct",
          filters: "order=month.desc,qa_email.asc",
          token,
        }).catch(() => []),
        sb.query("pip_ap_candidate_dismissals", { select: "qa_email,month,reason", token }).catch(() => []),
      ]);
      setPlans(planRows);
      setWeeks(weekRows);
      setMtd(mtdRows);
      setRoster(rosterRows);
      setProfiles(profRows);

      // ── DAM-driven detections (real-time incident flags) ──
      const damDetections = computeDetections({
        mtdRows, existingPlans: planRows, dismissalRows,
        damFlagRows: damFlags, damStepRows: damSteps,
        sortMonthsDesc, nameFromEmail,
      });

      // ── Month-end KPI candidates — for the most recent CLOSED
      //    month only (today's in-progress month is skipped). The
      //    view returns rows for every month in mtd_scores; we filter
      //    here to the prior-month label so the Detection tab shows
      //    "actionable now" cohort by default. Dismissed candidates
      //    (per pip_ap_candidate_dismissals) hidden too.
      //
      //    Per Hossam: QAs WITH an active AP/PIP STILL appear in the
      //    list, but their row carries a nudge ("already on
      //    [AP|PIP]") so the lead doesn't open a duplicate by
      //    mistake. The existingPlan info is attached to the
      //    detection so the UI can render the nudge + a link.
      const now = new Date();
      const priorD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const priorMonthLabel = `${MON[priorD.getMonth()]}-${priorD.getFullYear()}`;
      // Map of qa_email → active plan + the short-code KPI set it
      // already targets. Used both for the nudge badge AND for
      // suppressing rows where the candidate's failing KPIs are
      // already fully covered by the active plan (no point flagging
      // someone again for the same metric their AP/PIP is working on).
      const normKpi = (s) => {
        const x = String(s || "").toLowerCase();
        if (x.startsWith("cal") || x.includes("calibration")) return "cal";
        if (x === "rtr" || x.startsWith("rtr") || x.includes("rtr")) return "rtr";
        if (x.startsWith("occ") || x.includes("occupancy")) return "occ";
        return null;
      };
      const activePlanByEmail = new Map();
      for (const p of planRows) {
        if (p.status === "active" || p.status === "pending_review") {
          let targetsObj = p.targets;
          if (typeof targetsObj === "string") {
            try { targetsObj = JSON.parse(targetsObj); } catch { targetsObj = null; }
          }
          const metrics = Array.isArray(targetsObj?.metrics) ? targetsObj.metrics : [];
          const coveredKpis = new Set(
            metrics.map(m => normKpi(m.kpi_key) || normKpi(m.raw_key) || normKpi(m.label)).filter(Boolean)
          );
          activePlanByEmail.set((p.qa_email || "").toLowerCase(), { plan: p, coveredKpis });
        }
      }
      const candDismissed = new Set(
        (candDismissals || []).map(d => `${(d.qa_email || "").toLowerCase()}|${d.month}`)
      );
      const damDetectedEmails = new Set(damDetections.map(d => (d.email || "").toLowerCase()));
      const monthEndDetections = (candidateRows || [])
        .filter(c => c.month === priorMonthLabel)
        .filter(c => !candDismissed.has(`${(c.qa_email || "").toLowerCase()}|${c.month}`))
        // Don't duplicate a QA who's already in the DAM-flag list
        .filter(c => !damDetectedEmails.has((c.qa_email || "").toLowerCase()))
        // Suppress rows where the QA's active AP/PIP already covers
        // ALL the KPIs that triggered this candidate — that's a
        // genuine duplicate and would only add noise. Partially-
        // overlapping cases stay (the lead still needs to act on the
        // KPIs the plan doesn't address).
        .filter(c => {
          const existing = activePlanByEmail.get((c.qa_email || "").toLowerCase());
          if (!existing) return true;
          const failingShort = new Set(
            (c.failing_kpis || []).map(k => normKpi(k.kpi)).filter(Boolean)
          );
          if (failingShort.size === 0) return true;
          // Any failing KPI NOT covered by the plan → keep the row.
          for (const k of failingShort) if (!existing.coveredKpis.has(k)) return true;
          // Otherwise (fully covered) → suppress.
          return false;
        })
        .map(c => {
          const kpiReasons = (c.failing_kpis || [])
            .map(k => `${k.kpi} ${Number(k.value).toFixed(1)}${k.unit} (target ${k.target}${k.unit})`)
            .join(", ");
          // Nudge if this QA already has an active AP/PIP in flight.
          // Rows where the plan FULLY covers the failing KPIs are
          // already suppressed above, so anything reaching here is a
          // partial-overlap case — the badge will say which KPIs are
          // new vs already-covered.
          const existingMeta = activePlanByEmail.get((c.qa_email || "").toLowerCase()) || null;
          const existing = existingMeta?.plan || null;
          const planCovered = existingMeta?.coveredKpis || new Set();
          const newFailingKpiNames = (c.failing_kpis || [])
            .filter(k => !planCovered.has(normKpi(k.kpi)))
            .map(k => k.kpi);
          const coveredFailingKpiNames = (c.failing_kpis || [])
            .filter(k => planCovered.has(normKpi(k.kpi)))
            .map(k => k.kpi);
          // plan_type values from the view:
          //   'pip'           → EGY occurrence 1 (NEW PIP)
          //   'pip_extension' → EGY occurrence 2 or 3 (extension of an
          //                     existing PIP per DAM; in the app we
          //                     still open the create-PIP flow since
          //                     extending a closed plan isn't a thing)
          //   'ap'            → KSA occurrence 1 (override per Hossam)
          //   'none'          → no app-side plan (EGY occ 4 = HR
          //                     Investigation; KSA occ ≥ 2 = warnings
          //                     + deductions handled outside system)
          // Map to a button planType the existing UI understands:
          const buttonPlanType =
            c.plan_type === "ap" ? "ap"
            : c.plan_type === "pip" || c.plan_type === "pip_extension" ? "pip"
            : null; // null → no Create button
          return {
            email: c.qa_email,
            name: nameFromEmail(c.qa_email),
            reason: `Month-end (${c.month}): ${kpiReasons}. DAM occurrence ${c.occurrence}: ${c.dam_action_label}.`,
            severity: c.is_hr_investigation || c.occurrence >= 4 ? "critical"
                      : c.plan_type === "pip" || c.plan_type === "pip_extension" ? "critical"
                      : "warning",
            totalScore: 0,
            kpis: (c.failing_kpis || []).map(k => ({
              key: k.kpi.toLowerCase(),
              label: k.kpi,
              rawPct: Number(k.value),
              slab: { slab: 0, label: "Below" },
            })),
            latestMonth: c.month,
            tl: c.qa_tl,
            damFlagId: null,
            // planType drives the existing Create button. null = hide.
            planType: buttonPlanType,
            pipActionType: c.plan_type === "pip_extension" ? "extension" : "new",
            source: "month-end",
            needsReview: c.needs_review,
            // DAM step context for the row's badge + label.
            occurrence: c.occurrence,
            damActionLabel: c.dam_action_label,
            deductionDays: c.deduction_days || 0,
            isHrInvestigation: !!c.is_hr_investigation,
            domain: c.domain,
            verbalWarningRequired: c.occurrence === 1, // verbal step is occ-1 only per DAM
            // Existing-plan nudge — surfaced as an info badge in
            // APDetectionTab so the lead doesn't open a duplicate
            // plan. The buttons stay clickable; this is informational,
            // not a hard block.
            existingPlan: existing ? {
              id: existing.id,
              type: existing.type,
              status: existing.status,
              end_date: existing.end_date,
              coveredKpiNames: coveredFailingKpiNames,
              newKpiNames: newFailingKpiNames,
            } : null,
          };
        });

      // Merge: DAM real-time flags first, then month-end candidates.
      // Same shape so APDetectionTab renders both with the same UI.
      setDetections([...damDetections, ...monthEndDetections]);
    } catch (e) { console.error("AP/PIP load:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);
  // Keep the Detection/Active tabs live — re-pulls plans, MTD,
  // candidates, and DAM flags every minute so leads don't sit on
  // stale numbers between manual refreshes.
  useAutoRefresh(load, 60000);

  // Resolve the viewer's team for Detection scoping. Admin-tier roles
  // (manager / hod / admin / super_admin) and auditor see the whole
  // org and skip the lookup. Re-runs when impersonation flips the
  // effective profile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !profile?.email) { setScopeEmails(new Set()); return; }
      if (hasRole(profile?.role, "manager") || profile?.role === "auditor") {
        setScopeEmails(null);
        return;
      }
      const team = await loadTeamForViewer({ token, profile });
      if (cancelled) return;
      setScopeEmails(new Set((team || []).map(r => (r.email || "").toLowerCase()).filter(Boolean)));
    })();
    return () => { cancelled = true; };
  }, [token, profile?.email, profile?.role]);

  // Generate suggested targets for the currently-selected QA using shared MTD data.
  const generateTargets = (qaEmail, kpiKeys) =>
    buildTargets({ qaEmail, kpiKeys, mtd, duration: planDuration, sortMonthsDesc, nameFromEmail });

  // ── Start creating a plan (from detection or manually) ──
  const startCreate = (qaEmail, type) => {
    setSelQaEmail(qaEmail || "");
    setPlanType(type || "ap");
    setPlanDuration(type === "pip" ? 8 : 4);
    setPlanStartDate(riyadhTodayStr());
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

    // Reject when ANY active plan exists for this QA, not just the
    // same type. Allowing simultaneous AP + PIP meant both tracked,
    // both concluded, and both auto-issued DAM flags on failure —
    // double-counting an offense that's really one offense.
    const existing = plans.find(p =>
      p.qa_email?.toLowerCase() === selQaEmail.toLowerCase() &&
      (p.status === "active" || p.status === "pending_review")
    );
    if (existing) {
      const sameType = existing.type === planType;
      globalToast(
        "error",
        sameType
          ? `${nameFromEmail(selQaEmail)} already has an active ${existing.type.toUpperCase()} plan`
          : `${nameFromEmail(selQaEmail)} already has an active ${existing.type.toUpperCase()}. Conclude it before starting a ${planType.toUpperCase()}.`
      );
      return;
    }

    setLoading(true);
    try {
      const startDate = planStartDate || riyadhTodayStr();
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
  // Ref-based re-entrancy guard. A double-click on the modal's Submit
  // button used to fire concludePlan twice before React could disable
  // it, creating two DAM flags per failure and stamping the plan twice.
  const concludingRef = useRef(false);
  const concludePlan = async () => {
    if (!concludingPlan || !conclusionOutcome) return;
    if (concludingRef.current) return;
    // Hard guard against concluding Pass on a plan with zero filled
    // weeks of actuals — a fresh AP/PIP can otherwise be marked Pass
    // by a single click, silently clearing DAM history for that QA
    // with no justification. Fail-with-zero-weeks is still allowed
    // (early termination is a real workflow).
    if (conclusionOutcome === "pass") {
      const { filledWeeks } = getPlanProgress(concludingPlan);
      if (!filledWeeks || filledWeeks.length === 0) {
        globalToast("error", "Add weekly actuals before marking this plan as Passed.");
        return;
      }
    }
    concludingRef.current = true;
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

      // If PIP failed → auto-create DAM flag against the
      // performance_management rule, matching the AP-failure branch
      // below. Previously this branch omitted `rule_id` entirely and
      // hard-coded occurrence_number=1, so the DAM escalation walk
      // never advanced past step 1 even on repeat PIP failures and
      // the "termination_review" action was wrong for a QA on their
      // 2nd or 3rd offense (the rule's step matrix should drive it).
      if (concludingPlan.type === "pip" && conclusionOutcome === "fail") {
        try {
          const qaProfile = profiles.find(p => p.email?.toLowerCase() === concludingPlan.qa_email?.toLowerCase());
          if (qaProfile) {
            let pmRule = null;
            try {
              const rules = await sb.query("dam_rules", { select: "id,name,behavior_type", filters: "behavior_type=eq.performance_management&is_active=eq.true&limit=1", token });
              pmRule = rules[0] || null;
            } catch { }

            let occurrence = 1;
            if (pmRule) {
              try {
                const existing = await sb.query("dam_flags", { select: "id", filters: `profile_id=eq.${qaProfile.id}&rule_id=eq.${pmRule.id}&status=neq.dismissed`, token });
                occurrence = (existing?.length || 0) + 1;
              } catch { }
            }

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
                severity: "critical",
                recommended_action: step?.includes_pip ? "pip" : (step?.is_hr_investigation ? "termination_review" : "termination_review"),
                notes: `PIP failed. Plan ID: ${concludingPlan.id}. ${conclusionNotes}`,
                status: "pending",
                occurrence_number: occurrence,
                escalation_step_id: step?.id || null,
                trigger_data: JSON.stringify({ source: "pip_failure", plan_id: concludingPlan.id, step_action: step?.action || "No step defined" }),
              }
            });
            globalToast("success", `PIP failed — DAM flag created (occurrence #${occurrence}${step ? ": " + step.action : ""})`);
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
    // Release the re-entrancy lock no matter how the request settles.
    concludingRef.current = false;
  };

  // ── Dismiss detection (persisted to DB) ──
  // Month-end KPI candidates and DAM real-time flags live in
  // different tables. Route the dismissal to the right one so it
  // actually filters the row out next load.
  const dismissDetectionDB = async (email, reason) => {
    try {
      const det = detections.find(d => d.email === email);
      if (det?.source === "month-end") {
        // Upsert on the (qa_email, month) PK — re-dismissing the same
        // row (e.g. after an event-driven reload races a second click)
        // shouldn't throw a duplicate-key error.
        await sb.query("pip_ap_candidate_dismissals", {
          token, method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: {
            qa_email: email,
            month: det.latestMonth,
            dismissed_by: profile?.email,
            reason: reason || "Dismissed by super admin",
          },
        });
      } else {
        await sb.query("ap_dismissals", { token, method: "POST", body: {
          qa_email: email,
          dismissed_by: profile?.email,
          reason: reason || "Dismissed by super admin",
          month: mtd.length ? sortMonthsDesc([...new Set(mtd.map(r => r.month))])[0] : "",
          detection_info: det?.reason || "",
        }});
      }
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

  // Detection scoping — same intent as visiblePlans but using the
  // hierarchy-walked team set from teamScope so supervisors only see
  // their reports' QAs (not the whole domain). `scopeEmails === null`
  // means unrestricted (admin / auditor / org-wide).
  const visibleDetections = scopeEmails === null ? detections : detections.filter(d => {
    const e = (d.email || "").toLowerCase();
    if (scopeEmails.has(e)) return true;
    // Belt-and-braces: leads also see rows where the TL field points
    // at them directly (handles stale roster vs profile mismatches).
    if ((d.tl || "").toLowerCase() === myEmail) return true;
    return false;
  });

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
          {visibleDetections.length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--amber-bg)",color:"var(--amber)",fontSize:12,fontWeight:600}}>{visibleDetections.length} detected</span>}
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
          Detection {visibleDetections.length > 0 && <span style={{ marginLeft: 4, padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "var(--red-bg)", color: "var(--red)" }}>{visibleDetections.length}</span>}
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
        detections={visibleDetections}
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
            <h3>{isAdmin ? "No active plans" : isSupervisor ? "No active plans in your domain" : "No active plans for your team"}</h3>
            <p>{isAdmin ? "Create a new Action Plan or PIP from the Detection tab or the button above." : isSupervisor ? "No QA in your operational domain currently has an active AP or PIP. Check the Detection tab for QAs who may need one." : "None of your direct reports is currently on an AP or PIP. Check the Detection tab for QAs who may need one."}</p>
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
