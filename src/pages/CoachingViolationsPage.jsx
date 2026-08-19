import React, { useState, useEffect, useCallback, useRef } from "react";
import Modal from "../components/Modal.jsx";
import { hasRole } from "../lib/constants.js";
import { sb, dataCache, SUPABASE_URL, SUPABASE_ANON } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity } from "../lib/utils.js";
import { listProfiles } from "../api/profiles.js";
import { listViolations } from "../api/violations.js";
import { useConfirm, useAutoRefresh } from "../lib/hooks.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { downloadCsv } from "../lib/csvExport.js";
import { callEdgeFunction } from "../lib/edgeSync.js";
import useKeyboard from "../lib/useKeyboard.jsx";

function CoachingViolationsPage() {
  const{token,profile,gf,rosterMap,globalToast}=useApp();
  // Resolve a possibly-aliased email (e.g. mohamed.mamdouh@tabby.ai
  // when the person's roster row is @tabby.sa) to the canonical roster
  // email, so the dam_flag we create is stamped with the QA's real
  // domain. Falls back to the input when there's no roster row.
  const canonicalRosterEmail = (email) => {
    if (!email) return email;
    const lower = email.toLowerCase();
    const rm = rosterMap || {};
    if (rm[lower]) return lower;
    const local = lower.split("@")[0];
    if (rm[local + "@tabby.ai"]) return local + "@tabby.ai";
    if (rm[local + "@tabby.sa"]) return local + "@tabby.sa";
    return lower;
  };
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  useKeyboard({"1":()=>setTab("pending"),"2":()=>setTab("reviewed")});
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [damRules, setDamRules] = useState([]);
  const [selDamRule, setSelDamRule] = useState("");
  const [sendingDigest, setSendingDigest] = useState(false);
  const { ask: confirmAsk, el: confirmEl } = useConfirm();


  // Delete a single violation (admin / super_admin only — gated by DB
  // policy cv_delete + the UI button visibility below). Wrapped in the
  // shared confirm dialog so the destructive action follows the same
  // "Cancel | Delete" convention as everywhere else in the app.
  // Strict super_admin only — regular admins cannot delete violations.
  const isSuperAdmin = profile?.role === "super_admin";
  const deleteViolation = (v) => {
    confirmAsk(
      "Delete violation?",
      `Permanently delete this ${v.violation_type} violation for ${(v.qa_email || "").split("\n").map(e => nameFromEmail(e)).filter(Boolean).join(", ") || "this QA"}? This cannot be undone.`,
      async () => {
        try {
          await sb.query("coaching_violations", { token, method: "DELETE", filters: `id=eq.${v.id}` });
          logActivity(token, profile?.email, "violation_deleted", "coaching_violations", v.id, `Type: ${v.violation_type}, QA: ${v.qa_email}`);
          dataCache.invalidate();
          await load();
          globalToast("success", "Violation deleted");
        } catch (e) { globalToast("error", safeError(e)); }
      },
      "Delete",
      "var(--red)"
    );
  };

  const load = useCallback(async () => {
    try {
      const [v, p, r] = await Promise.all([
        listViolations({ token }),
        listProfiles({ token }),
        dataCache.fetch("dam_rules",()=>sb.query("dam_rules", { select: "id,name,behavior_type", filters: "is_active=eq.true&order=name.asc", token }).catch(() => [])),
      ]);
      // Domain scope for supervisors
      const svDomain = profile?.operational_domain || profile?.domain || "tabby.ai";
      const isAdmin = hasRole(profile?.role, "admin");
      const isSv = hasRole(profile?.role, "qa_supervisor") && !isAdmin;
      let filtered = isSv ? v.filter(x => x.qa_email?.includes("@" + svDomain) || x.lead_email?.includes("@" + svDomain)) : v;
      // Apply slim global filter (Domain only — People dropped in unification).
      if(gf?.domain) filtered = filtered.filter(x => x.qa_email?.includes("@" + gf.domain));
      setViolations(filtered);
      setProfiles(p);
      setDamRules(r);
    } catch (e) { console.error("Violations:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);
  useAutoRefresh(load, 60000);

  const pendingV = violations.filter(v => v.status === "pending");
  const reviewedV = violations.filter(v => v.status !== "pending");

  const openReview = (v) => {
    setReviewModal(v);
    setReviewStatus(v.status === "pending" ? "" : (v.status === "invalid" ? "invalid" : "valid"));
    setReviewNotes(v.review_notes || "");
    // Auto-detect DAM rule from violation type
    const typeToRule = {
      "> 4 Uses": "Same link for 4+",
      "Multiple Days": "Same link on different days",
      "Multiple Agents": "Same link for multiple agents",
    };
    const matchText = typeToRule[v.violation_type] || "";
    const matched = damRules.find(r => r.name?.toLowerCase().includes(matchText.toLowerCase()));
    setSelDamRule(matched?.id || "");
  };

  // Re-entrancy guard. Double-clicking "Confirm" used to fire the
  // submit twice — for a "valid" review of a multi-QA violation the
  // inner loop iterated each QA twice, creating duplicate DAM flags
  // AND advancing occurrence_number twice (wrong DAM escalation step
  // for everyone on the row).
  const submittingReviewRef = useRef(false);
  const submitReview = async () => {
    if (!reviewStatus) { globalToast("error", "Select Valid or Invalid"); return; }
    if (submittingReviewRef.current) return;
    submittingReviewRef.current = true;

    try {
      // Update the violation
      await sb.query("coaching_violations", {
        token, method: "PATCH",
        body: {
          status: reviewStatus === "valid" ? "valid" : "invalid",
          reviewed_by: profile?.email,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes.trim() || null,
        },
        filters: `id=eq.${reviewModal.id}`,
      });

      // If valid → auto-create DAM flag (DAM rule is required)
      if (reviewStatus === "valid") {
        if (!selDamRule) { globalToast("error", "Select a DAM rule to create the flag"); setLoading(false); return; }

        const qaEmailsList = reviewModal.qa_email.split("\n").map(e => e.trim()).filter(Boolean);
        let flagsCreated = 0;

        for (const qaEmail of qaEmailsList) {
          // Try to find profile by email (check both domain variants)
          let qaProfile = profiles.find(p => p.email?.toLowerCase() === qaEmail.toLowerCase());
          if (!qaProfile) {
            const local = qaEmail.split("@")[0];
            qaProfile = profiles.find(p => p.email?.toLowerCase() === (local + "@tabby.ai") || p.email?.toLowerCase() === (local + "@tabby.sa"));
          }

          // Count existing occurrences (by profile_id or qa_email)
          let occurrence = 1;
          try {
            const filterStr = qaProfile
              ? `profile_id=eq.${qaProfile.id}&rule_id=eq.${selDamRule}&status=neq.dismissed`
              : `qa_email=eq.${qaEmail}&rule_id=eq.${selDamRule}&status=neq.dismissed`;
            const existing = await sb.query("dam_flags", { select: "id", filters: filterStr, token });
            occurrence = (existing?.length || 0) + 1;
          } catch {}

          // Create DAM flag — with profile_id if available, otherwise just qa_email.
          // Stamp qa_email as the canonical roster email so the DAM page
          // resolves the right domain (EGY/KSA) for escalation lookup
          // even when the originating violation referenced the alias.
          const selectedRule = damRules.find(r => r.id === selDamRule);
          const flagBody = {
            rule_id: selDamRule,
            qa_email: canonicalRosterEmail(qaProfile?.email || qaEmail),
            severity: selectedRule?.severity || (occurrence >= 3 ? "critical" : occurrence >= 2 ? "warning" : "notice"),
            recommended_action: selectedRule?.recommended_action || "coaching",
            status: "pending",
            notes: `Auto-created from coaching violation: ${reviewModal.violation_type}. Link: ${reviewModal.coaching_link}. Review notes: ${reviewNotes.trim()}`,
            occurrence_number: occurrence,
          };
          if (qaProfile) flagBody.profile_id = qaProfile.id;

          await sb.query("dam_flags", { token, method: "POST", body: flagBody });
          flagsCreated++;
        }

        // Update violation status to dam_created
        await sb.query("coaching_violations", {
          token, method: "PATCH",
          body: { status: "dam_created", reviewed_by: profile?.email, reviewed_at: new Date().toISOString(), review_notes: reviewNotes.trim() },
          filters: `id=eq.${reviewModal.id}`,
        });

        globalToast("success", `Marked as valid — ${flagsCreated} DAM flag(s) created`);
        logActivity(token, profile?.email, "violation_valid", "coaching_violations", reviewModal.id, `QA: ${reviewModal.qa_email}, Type: ${reviewModal.violation_type}`);
      } else {
        globalToast("success", "Marked as invalid");
        logActivity(token, profile?.email, "violation_invalid", "coaching_violations", reviewModal.id, `QA: ${reviewModal.qa_email}, Type: ${reviewModal.violation_type}`);
      }

      setReviewModal(null);
      // Optimistic update
      const newStatus = reviewStatus === "valid" ? "dam_created" : "invalid";
      setViolations(prev => prev.map(v => v.id === reviewModal.id ? { ...v, status: newStatus, reviewed_by: profile?.email, reviewed_at: new Date().toISOString(), review_notes: reviewNotes.trim() } : v));
    } catch (e) { globalToast("error", safeError(e)); }
    finally { submittingReviewRef.current = false; }
  };

  const violationColor = (type) => {
    if (type?.includes(">") || type?.includes("4")) return { bg: "var(--red-bg)", color: "var(--red)" };
    if (type?.includes("Day")) return { bg: "var(--amber-bg)", color: "var(--amber)" };
    if (type?.includes("Agent")) return { bg: "#EDE9FE", color: "#7C3AED" };
    return { bg: "var(--bg2)", color: "var(--tx2)" };
  };

  if (loading) return <div className="page"><SkeletonPage/></div>;

  return (
    <div className="page">
      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:16}}>
        {pendingV.length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--red-bg)",color:"var(--red)",fontSize:12,fontWeight:700}}>{pendingV.length} pending</span>}
        <span style={{padding:"4px 12px",borderRadius:20,background:"var(--green-bg)",color:"var(--green)",fontSize:12,fontWeight:600}}>{reviewedV.length} reviewed</span>
        <button className="btn btn-outline btn-sm" style={{fontSize:11}} disabled={(violations||[]).length===0} onClick={() => {
          downloadCsv(`violations_${new Date().toISOString().slice(0,10)}.csv`, (violations || []).map(v => ({
            violation_date: v.violation_date || "",
            reported_at: v.created_at || "",
            qa_email: v.qa_email || "",
            lead_email: v.lead_email || "",
            type: v.violation_type || "",
            status: v.status || "",
            reviewed_by: v.reviewed_by || "",
            reviewed_at: v.reviewed_at || "",
            review_notes: v.review_notes || "",
            coaching_link: v.coaching_link || "",
          })));
        }}>📥 Export CSV</button>
        {(hasRole(profile?.role,"admin")||hasRole(profile?.role,"qa_supervisor")||profile?.role==="manager")&&(
          <button
            className="btn btn-outline btn-sm"
            style={{fontSize:11}}
            disabled={pendingV.length===0||sendingDigest}
            onClick={async()=>{
              if(sendingDigest)return;
              setSendingDigest(true);
              const r = await callEdgeFunction("violations-digest", { token });
              const data = r.data || {};
              if(r.ok && data.success){
                globalToast("success",`Digest sent — ${data.leads} lead${data.leads===1?"":"s"}, ${data.violations} violation${data.violations===1?"":"s"}`);
              }else if(data.skipped){
                globalToast("success","No pending violations — nothing to send");
              }else{
                globalToast("error", r.error || "Send failed");
              }
              setSendingDigest(false);
            }}
            title="Send the daily violations digest now (also runs automatically at 11 AM Riyadh)">
            {sendingDigest?"Sending…":"📧 Send digest now"}
          </button>
        )}
      </div>

      <div className="tab-bar" style={{marginBottom:16}}>
        <button className={`tab-btn ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
          Pending review ({pendingV.length})
        </button>
        <button className={`tab-btn ${tab === "reviewed" ? "active" : ""}`} onClick={() => setTab("reviewed")}>
          Reviewed ({reviewedV.length})
        </button>
      </div>

      {tab === "pending" && <div className="card">
        {pendingV.length === 0 ? (
          <EmptyState
            tone="good"
            illus="check"
            title="All caught up"
            description={hasRole(profile?.role,"admin")?"No pending violations to review across the whole org.":hasRole(profile?.role,"qa_supervisor")?"No pending violations in your domain.":"No pending violations for your team — nothing to do here right now."}
          />
        ) : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>QA</th>
              <th>Lead</th>
              <th>Violation</th>
              <th>Date</th>
              <th>Link</th>
              {isSuperAdmin && <th style={{width:48,textAlign:"center"}}>—</th>}
            </tr></thead>
            <tbody>
              {pendingV.map(v => {
                const vc = violationColor(v.violation_type);
                return (
                  <tr key={v.id} onClick={() => openReview(v)} style={{cursor:"pointer",transition:"background var(--d1)"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>
                      {v.qa_email?.split("\n").map((e, i) => <div key={i}>{nameFromEmail(e)}</div>)}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--tx2)" }}>
                      {v.lead_email?.split("\n").map((e, i) => <div key={i}>{nameFromEmail(e)}</div>)}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, background: vc.bg, color: vc.color }}>
                        {v.violation_type}
                      </span>
                      {(()=>{
                        const flowMap = { "> 4 Uses": "Coaching Observation", "> 3 Uses": "Coaching Observation", "Multiple Days": "Calendar + Occupancy Audit", "Multiple Agents": "Calendar Audit" };
                        const flow = flowMap[v.violation_type];
                        return flow ? <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{flow}</div> : null;
                      })()}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>
                      {v.violation_date ? new Date(v.violation_date + "T00:00:00").toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <a href={v.coaching_link} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)", textDecoration: "underline", fontSize: 12 }} onClick={e=>e.stopPropagation()}>Open</a>
                        <button className="btn btn-outline btn-sm" style={{ fontSize: 10, padding: "1px 6px" }} onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(v.coaching_link);
                          globalToast("success", "Link copied!");
                        }}>Copy</button>
                      </div>
                    </td>
                    {isSuperAdmin && <td style={{textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                      <button title="Delete violation" aria-label="Delete violation" onClick={()=>deleteViolation(v)} style={{background:"none",border:"none",cursor:"pointer",padding:6,borderRadius:6,color:"var(--tx3)",lineHeight:0,transition:"background var(--d1), color var(--d1)"}} onMouseEnter={e=>{e.currentTarget.style.color="var(--red)";e.currentTarget.style.background="var(--red-bg)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--tx3)";e.currentTarget.style.background="none";}}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </td>}
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>}

      {tab === "reviewed" && <div className="card">
        {reviewedV.length === 0 ? (
          <EmptyState
            illus="empty"
            title="No reviewed violations yet"
            description="Once you review a pending violation it'll move here for the record."
          />
        ) : (
          <div className="table-wrap"><table>
            <thead><tr>
              <th>QA</th>
              <th>Violation</th>
              <th>Result</th>
              <th>Reviewed by</th>
              <th>Notes</th>
              <th>Date</th>
              {isSuperAdmin && <th style={{width:48,textAlign:"center"}}>—</th>}
            </tr></thead>
            <tbody>
              {reviewedV.map(v => {
                const vc = violationColor(v.violation_type);
                return (
                  <tr key={v.id} onClick={() => openReview(v)} style={{cursor:"pointer",transition:"background var(--d1)"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>
                      {v.qa_email?.split("\n").map((e, i) => <div key={i}>{nameFromEmail(e)}</div>)}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, background: vc.bg, color: vc.color }}>
                        {v.violation_type}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600,
                        background: v.status === "invalid" ? "var(--green-bg)" : v.status === "dam_created" ? "var(--red-bg)" : "var(--amber-bg)",
                        color: v.status === "invalid" ? "var(--green)" : v.status === "dam_created" ? "var(--red)" : "var(--amber)",
                      }}>
                        {v.status === "invalid" ? "✓ Invalid" : v.status === "dam_created" ? "⚠ Valid → DAM" : "Valid"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>{nameFromEmail(v.reviewed_by)}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.review_notes || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--tx2)" }}>
                      {v.reviewed_at ? new Date(v.reviewed_at).toLocaleDateString("en-GB", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    {isSuperAdmin && <td style={{textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                      <button title="Delete violation" aria-label="Delete violation" onClick={()=>deleteViolation(v)} style={{background:"none",border:"none",cursor:"pointer",padding:6,borderRadius:6,color:"var(--tx3)",lineHeight:0,transition:"background var(--d1), color var(--d1)"}} onMouseEnter={e=>{e.currentTarget.style.color="var(--red)";e.currentTarget.style.background="var(--red-bg)";}} onMouseLeave={e=>{e.currentTarget.style.color="var(--tx3)";e.currentTarget.style.background="none";}}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </td>}
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>}

      {/* Review Modal */}
      {reviewModal && (()=>{
        // Map violation type to suggested DAM rule and auditing flow
        const violationMap = {
          "> 4 Uses": { ruleName: "Coaching Recording: Same link for 3+ tickets", flow: "Coaching Observation" },
          "> 3 Uses": { ruleName: "Coaching Recording: Same link for 3+ tickets", flow: "Coaching Observation" },
          "Multiple Days": { ruleName: "Coaching Recording: Same link on different days", flow: "Calendar + Occupancy Audit" },
          "Multiple Agents": { ruleName: "Coaching Recording: Same link for multiple agents", flow: "Calendar Audit" },
        };
        const suggestion = violationMap[reviewModal.violation_type] || null;
        const suggestedRule = suggestion ? damRules.find(r => r.name === suggestion.ruleName) : null;

        // Now uses the shared Modal shell with title + footer slots so the
        // accessibility, scroll-lock, and focus-trap behaviour stays
        // consistent across every popup.
        return (
        <Modal
          onClose={() => setReviewModal(null)}
          maxWidth={560}
          title={reviewModal.status !== "pending" ? "Update Review" : "Review Violation"}
          footer={<>
            <button className="btn btn-primary" onClick={submitReview} disabled={!reviewStatus || !reviewNotes.trim() || (reviewStatus === "valid" && !selDamRule)}>
              {reviewModal.status !== "pending" ? "Update" : "Confirm"}
            </button>
            <button className="btn btn-outline" onClick={() => setReviewModal(null)}>Cancel</button>
            {/* Schedule coaching wizard — jumps to Coaching → Compose
                with the QA, recording link, and failing rule pre-filled
                into the form. Visible always so leads can use it for
                pending/valid/invalid alike. */}
            <button
              className="btn btn-outline"
              style={{ color: "var(--tabby-purple)", borderColor: "var(--tabby-purple)" }}
              title="Open Coaching → Compose with this violation pre-filled"
              onClick={() => {
                const qa = (reviewModal.qa_email || "").split(/[,\n]/).map(e => e.trim()).filter(Boolean)[0] || "";
                const ruleName = suggestedRule?.name || reviewModal.violation_type;
                const weaknesses = `<ul><li>${ruleName} on ${reviewModal.violation_date || ""}</li></ul>`;
                const topics = reviewModal.coaching_link
                  ? `<ul><li>Review recording: <a href="${reviewModal.coaching_link}" target="_blank" rel="noreferrer">Open coaching link</a></li></ul>`
                  : "";
                window.dispatchEvent(new CustomEvent("prefill-coaching", {
                  detail: { email: qa, type: "Coaching Session", weaknesses, topics },
                }));
                window.dispatchEvent(new CustomEvent("qc-tab", { detail: "coaching" }));
                setReviewModal(null);
              }}
            >
              📒 Schedule coaching
            </button>
            {reviewModal.status !== "pending" && <button className="btn btn-outline" style={{marginLeft:"auto",color:"var(--amber)",borderColor:"var(--amber)"}} onClick={()=>{
              confirmAsk("Reopen violation?",`This will set the violation back to "pending" for re-review. The previous decision will be cleared.`,async()=>{
                try{
                  await sb.query("coaching_violations",{token,method:"PATCH",body:{status:"pending",reviewed_by:null,reviewed_at:null,review_notes:null},filters:`id=eq.${reviewModal.id}`});
                  setViolations(prev=>prev.map(v=>v.id===reviewModal.id?{...v,status:"pending",reviewed_by:null,reviewed_at:null,review_notes:null}:v));
                  globalToast("success","Violation reopened for review");
                  setReviewModal(null);
                }catch(e){globalToast("error",safeError(e));}
              },"Reopen","var(--amber)");
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
              Reopen
            </button>}
          </>}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: "var(--tx3)" }}>QA: </span><strong>{reviewModal.qa_email?.split("\n").map(e => nameFromEmail(e)).join(", ")}</strong></div>
              <div><span style={{ color: "var(--tx3)" }}>Type: </span><strong>{reviewModal.violation_type}</strong></div>
              <div><span style={{ color: "var(--tx3)" }}>Date: </span>{reviewModal.violation_date || "—"}</div>
              <div><span style={{ color: "var(--tx3)" }}>Lead: </span>{reviewModal.lead_email?.split("\n").map(e => nameFromEmail(e)).join(", ")}</div>
            </div>

            {/* Suggested auditing flow */}
            {suggestion && <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--amber-bg)", borderRadius: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: "var(--amber)" }}>Suggested audit: </span>
              <span style={{ color: "var(--tx)" }}>{suggestion.flow}</span>
              {suggestedRule && <span style={{ color: "var(--tx3)" }}> · DAM rule: {suggestedRule.name}</span>}
            </div>}

            <div style={{ marginTop: 8 }}>
              <a href={reviewModal.coaching_link} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)", fontSize: 13 }}>
                Open coaching link ↗
              </a>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Decision</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setReviewStatus("valid"); if (suggestedRule) setSelDamRule(suggestedRule.id); }} className={`btn ${reviewStatus === "valid" ? "btn-primary" : "btn-outline"}`} style={reviewStatus === "valid" ? { background: "var(--red)" } : {}}>
                ⚠️ Valid violation
              </button>
              <button onClick={() => setReviewStatus("invalid")} className={`btn ${reviewStatus === "invalid" ? "btn-primary" : "btn-outline"}`} style={reviewStatus === "invalid" ? { background: "var(--green)" } : {}}>
                ✓ Invalid (false positive)
              </button>
            </div>
          </div>

          {reviewStatus === "valid" && <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">DAM rule <span style={{ color: "var(--red)" }}>*</span> (creates flag automatically)</label>
            <select className="select form-input" value={selDamRule} onChange={e => setSelDamRule(e.target.value)}>
              <option value="">— Select DAM rule —</option>
              {damRules.filter(r => r.name?.startsWith("Coaching Recording")).map(r => {
                const isSuggested = r.id === suggestedRule?.id;
                return <option key={r.id} value={r.id}>{isSuggested ? "⭐ " : ""}{r.name}{isSuggested ? " (suggested)" : ""}</option>;
              })}
            </select>
            {!selDamRule && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>DAM rule is required for valid violations</div>}
          </div>}

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Notes <span style={{ color: "var(--red)" }}>*</span></label>
            <textarea className="form-input" rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Explain your decision (required)..." style={{ resize: "vertical", borderColor: !reviewNotes.trim() && reviewStatus ? "var(--red)" : "" }} />
            {!reviewNotes.trim() && reviewStatus && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>Notes are required</div>}
          </div>
        </Modal>
        );
      })()}

      {confirmEl}
    </div>
  );
}

export default CoachingViolationsPage;
