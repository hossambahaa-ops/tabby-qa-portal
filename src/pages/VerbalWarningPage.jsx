import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";
import { hasRole } from "../lib/constants.js";
import { emailsMatchLoose, nameFromEmail } from "../lib/utils.js";

// Verbal-warning surface for a Phase-1 calibration failure.
//
// A verbal_warnings row is auto-created (status 'pending_lead') alongside
// the auto-created AP when a QA fails Phase 1 with a numeric score < 85%.
// Nothing reaches the QA until the LEAD deliberately confirms + submits it
// here (status → 'issued'); the QA then sees it in their bell and comes
// here to acknowledge (acked_at set). One page, role-aware:
//   • lead + pending_lead  → "Confirm & submit verbal warning"
//   • lead + issued        → read-only status + QA ack state
//   • QA + issued/unacked  → the warning + "I acknowledge" button
//   • QA + acked           → confirmation
// RLS (verbal_warnings policies) enforces who may read/patch server-side;
// emailsMatchLoose tolerates the @tabby.ai / @tabby.sa cross-domain split.
export default function VerbalWarningPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, profile, globalToast } = useApp();
  const [state, setState] = useState({ loading: true, error: null, row: null });
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    if (!id || !token || !profile?.email) return;
    try {
      const rows = await sb.query("verbal_warnings", {
        token,
        select: "id,qa_email,lead_email,action_plan_id,month,reason,status,issued_at,issued_by,acked_at,created_at",
        filters: `id=eq.${id}`,
      }).catch(() => []);
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!row) { setState({ loading: false, error: "We couldn't find this verbal warning — the link may be expired.", row: null }); return; }
      setState({ loading: false, error: null, row });
    } catch (e) {
      setState({ loading: false, error: e?.message || String(e), row: null });
    }
  }, [id, token, profile?.email]);

  useEffect(() => { setState({ loading: true, error: null, row: null }); load(); }, [load]);

  const row = state.row;
  const mineAsLead = row && emailsMatchLoose(row.lead_email, profile?.email);
  const mineAsQa = row && emailsMatchLoose(row.qa_email, profile?.email);
  const isPriv = hasRole(profile?.role, "qa_supervisor");

  const submitIssue = async () => {
    setBusy(true);
    try {
      await sb.query("verbal_warnings", {
        token, method: "PATCH", headers: { Prefer: "return=minimal" },
        filters: `id=eq.${id}`,
        body: { status: "issued", issued_by: profile.email, issued_at: new Date().toISOString() },
      });
      globalToast?.("success", `Verbal warning issued to ${nameFromEmail(row.qa_email)}.`);
      await load();
    } catch (e) {
      globalToast?.("error", e?.message || "Couldn't submit the verbal warning.");
    } finally { setBusy(false); }
  };

  const submitAck = async () => {
    setBusy(true);
    try {
      await sb.query("verbal_warnings", {
        token, method: "PATCH", headers: { Prefer: "return=minimal" },
        filters: `id=eq.${id}`,
        body: { acked_at: new Date().toISOString() },
      });
      globalToast?.("success", "Acknowledgement recorded — thank you.");
      await load();
    } catch (e) {
      globalToast?.("error", e?.message || "Couldn't record your acknowledgement.");
    } finally { setBusy(false); }
  };

  const fmt = (t) => t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="page" style={{ maxWidth: 580, margin: "40px auto" }}>
      <div className="card" style={{ padding: 24 }}>
        {state.loading ? (
          <div style={{ color: "var(--tx2)", textAlign: "center" }}>Loading…</div>
        ) : state.error ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Verbal warning unavailable</div>
            <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 16 }}>{state.error}</div>
            <button className="btn btn-outline" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 26 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Verbal warning</div>
                <div style={{ fontSize: 12, color: "var(--tx3)" }}>Phase 1 calibration · {row.month}</div>
              </div>
            </div>

            <div style={{ background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--tx3)", marginBottom: 4 }}>
                {mineAsQa && !mineAsLead ? "Reason" : `${nameFromEmail(row.qa_email)} — reason`}
              </div>
              <div style={{ fontSize: 13, color: "var(--tx1)", lineHeight: 1.5 }}>{row.reason || "Failed Phase 1 calibration (< 85%). Target: pass the Phase 2 retake."}</div>
              {row.action_plan_id && (
                <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 10 }}>
                  🎯 An action plan has been created — its goal is to <strong>pass the Phase 2 calibration retake (≥ 85%)</strong>.
                  <span
                    onClick={() => { window.location.hash = "#/quality"; setTimeout(() => window.dispatchEvent(new CustomEvent("qc-tab", { detail: "plans" })), 120); }}
                    style={{ color: "var(--accent-text)", cursor: "pointer", fontWeight: 600, marginLeft: 6 }}
                  >View the plan →</span>
                </div>
              )}
            </div>

            {/* LEAD — pending confirmation */}
            {mineAsLead && row.status === "pending_lead" && (
              <>
                <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 14 }}>
                  Confirm you have delivered this verbal warning to <strong>{nameFromEmail(row.qa_email)}</strong>. Submitting notifies them to acknowledge it in Pulse.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy} onClick={submitIssue}>{busy ? "Submitting…" : "Confirm & submit verbal warning"}</button>
                  <button className="btn btn-outline" onClick={() => navigate("/quality")}>Later</button>
                </div>
              </>
            )}

            {/* LEAD — already issued */}
            {mineAsLead && row.status === "issued" && (
              <div style={{ fontSize: 13, color: "var(--tx2)" }}>
                <div style={{ marginBottom: 6 }}>✅ Issued {row.issued_at ? "on " + fmt(row.issued_at) : ""}{row.issued_by ? " by " + nameFromEmail(row.issued_by) : ""}.</div>
                <div>QA acknowledgement: {row.acked_at ? <span style={{ color: "var(--green)", fontWeight: 600 }}>Acknowledged {fmt(row.acked_at)}</span> : <span style={{ color: "var(--amber)", fontWeight: 600 }}>Pending</span>}</div>
                <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => navigate("/quality")}>Back to Quality Control</button>
              </div>
            )}

            {/* QA — needs to acknowledge */}
            {mineAsQa && !mineAsLead && row.status === "issued" && !row.acked_at && (
              <>
                <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 14 }}>
                  Please confirm you have received and understood this verbal warning. Your acknowledgement is recorded with a timestamp.
                </div>
                <button className="btn btn-primary" disabled={busy} onClick={submitAck}>{busy ? "Recording…" : "I acknowledge this verbal warning"}</button>
              </>
            )}

            {/* QA — already acknowledged */}
            {mineAsQa && !mineAsLead && row.acked_at && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 34, marginBottom: 6 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>You acknowledged this on {fmt(row.acked_at)}.</div>
                <button className="btn btn-outline" style={{ marginTop: 14 }} onClick={() => navigate("/profile")}>Open my profile</button>
              </div>
            )}

            {/* QA — not issued yet (shouldn't normally be reachable) */}
            {mineAsQa && !mineAsLead && row.status === "pending_lead" && (
              <div style={{ fontSize: 13, color: "var(--tx2)" }}>This verbal warning hasn't been issued yet.</div>
            )}

            {/* Privileged onlooker (supervisor/admin) who is neither the QA nor the lead */}
            {!mineAsQa && !mineAsLead && isPriv && (
              <div style={{ fontSize: 13, color: "var(--tx2)" }}>
                <div>Status: <strong>{row.status}</strong>{row.issued_at ? " · issued " + fmt(row.issued_at) : ""}{row.acked_at ? " · acknowledged " + fmt(row.acked_at) : ""}</div>
                <div style={{ marginTop: 4 }}>Lead: {nameFromEmail(row.lead_email)}</div>
              </div>
            )}

            {/* Not related to this user */}
            {!mineAsQa && !mineAsLead && !isPriv && (
              <div style={{ fontSize: 13, color: "var(--tx2)" }}>
                This verbal warning belongs to a different teammate. You're signed in as {profile?.email}.
                <div><button className="btn btn-outline" style={{ marginTop: 14 }} onClick={() => navigate("/dashboard")}>Back to dashboard</button></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
