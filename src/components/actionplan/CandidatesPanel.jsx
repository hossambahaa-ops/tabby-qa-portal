import React, { useEffect, useMemo, useState } from "react";
import { sb } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { hasRole, sortMonthsDesc } from "../../lib/constants.js";
import { nameFromEmail } from "../../lib/utils.js";
import { useConfirm } from "../../lib/hooks.jsx";
import SearchableSelect from "../SearchableSelect.jsx";

// Performance Candidates panel — reads from pip_ap_candidates_v
// (the view computed end-of-month from mtd_scores). Lives as a tab
// on Quality Control. Visible to qa_lead+.
//
// Each row: QA, domain badge, failing KPIs, recommended action,
// Start AP/PIP button, Dismiss button. Dismiss requires a reason.
//
// Rules:
//   * tabby.ai (EGY): AP first → PIP if failed AP in last 60 days
//   * tabby.sa (KSA): AP only. If prior AP failed, "needs review"
//     flag — the supervisor / manager handles the next step per
//     the DAM (manager involvement, HR escalation, etc.). No
//     automatic PIP for KSA.
//   * Multiple failing KPIs → one consolidated AP/PIP, not segregated.

const DISMISS_REASONS = [
  "On extended leave / sickness",
  "Joined mid-month / partial-month data",
  "Already on an active plan",
  "Manager review — handled outside system",
  "Data error — KPI is inaccurate",
  "Other",
];

export default function CandidatesPanel() {
  const { token, profile, globalToast } = useApp();
  const { ask: confirmAsk, el: confirmEl } = useConfirm();
  const isLead = hasRole(profile?.role, "qa_lead");

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [dismissals, setDismissals] = useState([]);
  const [activePlanEmails, setActivePlanEmails] = useState(new Set());
  // Available months in the view (oldest available → latest). Default
  // to the most recent completed month — which by definition is the
  // month before the current calendar month.
  const [allMonths, setAllMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  // Dismiss modal state
  const [dismissTarget, setDismissTarget] = useState(null); // { qa_email, month }
  const [dismissReason, setDismissReason] = useState("");
  const [dismissNote, setDismissNote] = useState("");

  // Load candidates + dismissals + active-plan emails.
  const load = async () => {
    if (!token || !isLead) { setLoading(false); return; }
    try {
      const [cands, dismList, activePlans] = await Promise.all([
        sb.query("pip_ap_candidates_v", {
          token,
          select: "qa_email,month,domain,qa_tl,failing_kpis,recommended_action,needs_review,had_failed_ap_recently,cal_pct,rtr_pct,occ_pct",
          filters: "order=month.desc,qa_email.asc",
        }).catch(() => []),
        sb.query("pip_ap_candidate_dismissals", {
          token, select: "qa_email,month,reason,dismissed_by,dismissed_at",
        }).catch(() => []),
        sb.query("action_plans", {
          token, select: "qa_email,type,status",
          filters: "status=eq.active",
        }).catch(() => []),
      ]);
      const cArr = Array.isArray(cands) ? cands : [];
      setCandidates(cArr);
      setDismissals(Array.isArray(dismList) ? dismList : []);
      setActivePlanEmails(new Set(
        (Array.isArray(activePlans) ? activePlans : []).map(p => (p.qa_email || "").toLowerCase())
      ));
      const monthsInView = sortMonthsDesc([...new Set(cArr.map(r => r.month).filter(Boolean))]);
      setAllMonths(monthsInView);
      // Default to the most recent month in the data (which is also
      // the most recent CLOSED month since the view only sees what's
      // already in mtd_scores).
      if (!selMonth && monthsInView.length > 0) setSelMonth(monthsInView[0]);
    } catch (e) { console.error("CandidatesPanel:", e); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token, isLead]);

  // Index dismissals by (email, month) for O(1) lookup.
  const dismissedSet = useMemo(() => {
    const s = new Set();
    for (const d of dismissals) s.add(`${(d.qa_email || "").toLowerCase()}|${d.month}`);
    return s;
  }, [dismissals]);

  // Visible rows for the selected month, filtered + sorted with
  // "needs review" QAs floated to the top so they pop visually.
  const visible = useMemo(() => {
    return candidates
      .filter(c => c.month === selMonth)
      .filter(c => !dismissedSet.has(`${(c.qa_email || "").toLowerCase()}|${c.month}`))
      .filter(c => !activePlanEmails.has((c.qa_email || "").toLowerCase()))
      .filter(c => !domainFilter || c.domain === domainFilter)
      .filter(c => !actionFilter || c.recommended_action === actionFilter)
      .sort((a, b) => {
        // needs_review first, then by domain, then by email
        if (a.needs_review !== b.needs_review) return a.needs_review ? -1 : 1;
        if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
        return a.qa_email.localeCompare(b.qa_email);
      });
  }, [candidates, selMonth, dismissedSet, activePlanEmails, domainFilter, actionFilter]);

  // Open the Start-AP/PIP flow. We route to the Plans tab and emit
  // a prefill event that ActionPlanPage listens for. ActionPlanPage
  // wires that into APCreateForm via its existing state.
  const startPlan = (c, typeOverride) => {
    const type = typeOverride || c.recommended_action; // 'ap' | 'pip'
    // Fire the cross-page hand-off. The Quality Control parent
    // already listens for `qc-tab` events; we add the prefill payload
    // as a separate event so ActionPlanPage can pick it up.
    window.dispatchEvent(new CustomEvent("qc-tab", { detail: "plans" }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("plan-prefill", { detail: {
        qa_email: c.qa_email,
        type,
        reason: c.failing_kpis.map(k => `${k.kpi} ${k.value}% (target ${k.target}${k.unit})`).join(" · "),
        kpis: c.failing_kpis,
        candidate_month: c.month,
      } }));
    }, 200);
  };

  const submitDismiss = async () => {
    if (!dismissTarget) return;
    const fullReason = dismissReason === "Other"
      ? (dismissNote.trim() || "Other (no note)")
      : dismissReason;
    try {
      await sb.query("pip_ap_candidate_dismissals", {
        token, method: "POST",
        body: { qa_email: dismissTarget.qa_email, month: dismissTarget.month,
                dismissed_by: profile?.email, reason: fullReason },
      });
      // Optimistic local update so the row hides immediately
      setDismissals(prev => [...prev, { qa_email: dismissTarget.qa_email, month: dismissTarget.month, reason: fullReason, dismissed_by: profile?.email, dismissed_at: new Date().toISOString() }]);
      globalToast("success", `Dismissed ${dismissTarget.qa_email} for ${dismissTarget.month}`);
    } catch (e) {
      globalToast("error", "Couldn't dismiss: " + (e?.message || "unknown error"));
    } finally {
      setDismissTarget(null); setDismissReason(""); setDismissNote("");
    }
  };

  if (!isLead) {
    return <div className="page" style={{ padding: 40 }}>
      <p style={{ color: "var(--tx3)" }}>Candidates view is for QA Lead+ users.</p>
    </div>;
  }
  if (loading) return <div className="page" style={{ padding: 40 }}><p style={{ color: "var(--tx3)" }}>Loading candidates…</p></div>;

  // Cohort summary by domain × recommended_action for the headline.
  const summary = visible.reduce((acc, c) => {
    const k = `${c.domain}-${c.recommended_action}${c.needs_review ? "-review" : ""}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page" style={{ padding: "16px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Performance Candidates</div>
          <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 2 }}>
            QAs whose Calibration / RTR / Occupancy dipped below target last closed month. Detection runs from the 5th of each month after the prior month's data finalizes.
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>{visible.length} candidate{visible.length === 1 ? "" : "s"}</div>
      </div>

      {/* Filter strip */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600 }}>Month</span>
        <SearchableSelect options={allMonths} value={selMonth} onChange={setSelMonth} placeholder="Latest closed" />
        <span style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600, marginLeft: 12 }}>Domain</span>
        <SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={domainFilter} onChange={setDomainFilter} placeholder="All" />
        <span style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 600, marginLeft: 12 }}>Action</span>
        <SearchableSelect options={[{value:"ap",label:"AP"},{value:"pip",label:"PIP"}]} value={actionFilter} onChange={setActionFilter} placeholder="All" />
        {(domainFilter || actionFilter) && (
          <button onClick={() => { setDomainFilter(""); setActionFilter(""); }}
            style={{ background:"none", border:"none", color:"var(--red)", fontSize:11, cursor:"pointer", fontFamily:"var(--font)", fontWeight:500, padding:"4px 8px" }}>× Clear</button>
        )}
      </div>

      {/* Summary chips */}
      {Object.keys(summary).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {Object.entries(summary).map(([k, n]) => (
            <span key={k} style={{
              fontSize: 11, padding: "3px 9px", borderRadius: 999, fontWeight: 600,
              background: k.includes("review") ? "var(--amber-bg)" : k.endsWith("pip") ? "var(--red-bg)" : "var(--accent-light)",
              color:      k.includes("review") ? "var(--amber)"    : k.endsWith("pip") ? "var(--red)"    : "var(--accent-text)",
            }}>{k}: {n}</span>
          ))}
        </div>
      )}

      {/* Candidate rows */}
      {visible.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--tx3)" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tx)", marginBottom: 4 }}>No candidates for {selMonth}</div>
          <div style={{ fontSize: 12 }}>Everyone is above target for Calibration, RTR, and Occupancy — or already on an active plan / dismissed.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map(c => {
            const recPIP = c.recommended_action === "pip";
            return (
              <div key={c.qa_email + c.month} className="card" style={{
                padding: "12px 14px",
                borderLeft: c.needs_review ? "4px solid var(--amber)" : recPIP ? "4px solid var(--red)" : "4px solid var(--accent-text)",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{c.qa_email}</span>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "var(--bg)", color: "var(--tx2)", border: "1px solid var(--bd2)", fontWeight: 600 }}>{c.domain}</span>
                    {c.qa_tl && <span style={{ fontSize: 10, color: "var(--tx3)" }}>Lead: {c.qa_tl}</span>}
                    {c.needs_review && (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--amber-bg)", color: "var(--amber)", fontWeight: 700 }}>🔶 NEEDS REVIEW</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--tx2)" }}>
                    <strong style={{ color: "var(--tx)" }}>Failing:</strong>{" "}
                    {(c.failing_kpis || []).map(k => (
                      <span key={k.kpi} style={{ marginRight: 10 }}>
                        {k.kpi} <strong style={{ color: "var(--red)" }}>{Number(k.value).toFixed(1)}{k.unit}</strong> <span style={{ color: "var(--tx3)" }}>(target {k.target}{k.unit})</span>
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>
                    Recommended: <strong style={{ color: recPIP ? "var(--red)" : "var(--accent-text)" }}>{recPIP ? "PIP" : "AP"}</strong>
                    {c.had_failed_ap_recently && (
                      <span> · prior AP failed within last 60 days</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {/* Primary action follows the recommendation. */}
                  <button
                    onClick={() => startPlan(c)}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 11, padding: "6px 12px", whiteSpace: "nowrap" }}
                  >Start {recPIP ? "PIP" : "AP"} →</button>
                  {/* For EGY candidates where PIP is recommended, give a "start AP instead" escape hatch. */}
                  {recPIP && c.domain === "tabby.ai" && (
                    <button
                      onClick={() => startPlan(c, "ap")}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: 11, padding: "6px 12px", whiteSpace: "nowrap" }}
                    >AP instead</button>
                  )}
                  <button
                    onClick={() => { setDismissTarget({ qa_email: c.qa_email, month: c.month }); setDismissReason(""); setDismissNote(""); }}
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: 11, padding: "6px 12px", color: "var(--tx3)", whiteSpace: "nowrap" }}
                  >Dismiss</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Past-month info bar */}
      <div style={{ marginTop: 16, padding: "8px 12px", background: "var(--bg)", borderRadius: 8, fontSize: 11, color: "var(--tx3)", border: "1px solid var(--bd2)" }}>
        <strong style={{ color: "var(--tx2)" }}>Past months:</strong> use the Month picker above to review prior cohorts and see which candidates were actioned vs dismissed.
      </div>

      {/* Dismiss modal */}
      {dismissTarget && (
        <div onClick={() => setDismissTarget(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: 460, width: "100%", padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Dismiss candidate</div>
            <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 14 }}>
              {dismissTarget.qa_email} · {dismissTarget.month}
            </div>
            <div style={{ fontSize: 12, color: "var(--tx2)", fontWeight: 600, marginBottom: 6 }}>Reason (required)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {DISMISS_REASONS.map(r => (
                <label key={r} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="radio" name="dismissReason" value={r} checked={dismissReason === r} onChange={() => setDismissReason(r)} />
                  {r}
                </label>
              ))}
            </div>
            {dismissReason === "Other" && (
              <textarea
                value={dismissNote}
                onChange={e => setDismissNote(e.target.value)}
                placeholder="Brief note for the audit trail…"
                rows={3}
                className="form-input"
                style={{ width: "100%", fontSize: 12, marginBottom: 14, fontFamily: "var(--font)" }}
              />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setDismissTarget(null)} className="btn btn-outline btn-sm">Cancel</button>
              <button
                onClick={submitDismiss}
                disabled={!dismissReason || (dismissReason === "Other" && !dismissNote.trim())}
                className="btn btn-primary btn-sm"
                style={{ opacity: (!dismissReason || (dismissReason === "Other" && !dismissNote.trim())) ? 0.5 : 1 }}
              >Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {confirmEl}
    </div>
  );
}
