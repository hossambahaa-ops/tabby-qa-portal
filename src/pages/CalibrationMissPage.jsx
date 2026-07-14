import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";
import { hasRole } from "../lib/constants.js";
import { emailsMatchLoose, nameFromEmail } from "../lib/utils.js";

// Lead-facing page to validate WHY a QA missed their Phase-1 calibration.
//
// A calibration_miss_reviews row is auto-created (status 'pending') when a
// QA's phase_1_status is 'missed'. No AP is created for a miss — instead the
// lead records the reason here (status → 'validated'). RLS scopes read/patch
// to the QA's lead (+ supervisors/admins); emailsMatchLoose tolerates the
// @tabby.ai / @tabby.sa cross-domain split.
export default function CalibrationMissPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, profile, globalToast } = useApp();
  const [state, setState] = useState({ loading: true, error: null, row: null });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    if (!id || !token || !profile?.email) return;
    try {
      const rows = await sb.query("calibration_miss_reviews", {
        token,
        select: "id,qa_email,lead_email,month,reason,status,validated_by,validated_at,created_at",
        filters: `id=eq.${id}`,
      }).catch(() => []);
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!row) { setState({ loading: false, error: "We couldn't find this record — the link may be expired.", row: null }); return; }
      setReason(row.reason || "");
      setState({ loading: false, error: null, row });
    } catch (e) {
      setState({ loading: false, error: e?.message || String(e), row: null });
    }
  }, [id, token, profile?.email]);

  useEffect(() => { setState({ loading: true, error: null, row: null }); load(); }, [load]);

  const row = state.row;
  const mineAsLead = row && (emailsMatchLoose(row.lead_email, profile?.email) || hasRole(profile?.role, "qa_supervisor"));

  const submit = async () => {
    if (!reason.trim()) { globalToast?.("error", "Please enter the reason before validating."); return; }
    setBusy(true);
    try {
      await sb.query("calibration_miss_reviews", {
        token, method: "PATCH", headers: { Prefer: "return=minimal" },
        filters: `id=eq.${id}`,
        body: { reason: reason.trim(), status: "validated", validated_by: profile.email, validated_at: new Date().toISOString() },
      });
      globalToast?.("success", `Reason recorded for ${nameFromEmail(row.qa_email)}.`);
      await load();
    } catch (e) {
      globalToast?.("error", e?.message || "Couldn't save the reason.");
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
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Record unavailable</div>
            <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 16 }}>{state.error}</div>
            <button className="btn btn-outline" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
          </div>
        ) : !mineAsLead ? (
          <div style={{ fontSize: 13, color: "var(--tx2)" }}>
            This record belongs to a different team. You're signed in as {profile?.email}.
            <div><button className="btn btn-outline" style={{ marginTop: 14 }} onClick={() => navigate("/dashboard")}>Back to dashboard</button></div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 26 }}>❓</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Missed calibration — validate reason</div>
                <div style={{ fontSize: 12, color: "var(--tx3)" }}>{nameFromEmail(row.qa_email)} · Phase 1 · {row.month}</div>
              </div>
            </div>

            {row.status === "validated" ? (
              <div style={{ fontSize: 13, color: "var(--tx2)" }}>
                <div style={{ background: "var(--bg)", border: "1px solid var(--bd)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--tx3)", marginBottom: 4 }}>Recorded reason</div>
                  <div style={{ fontSize: 13, color: "var(--tx1)", lineHeight: 1.5 }}>{row.reason}</div>
                </div>
                <div>✅ Validated {row.validated_at ? "on " + fmt(row.validated_at) : ""}{row.validated_by ? " by " + nameFromEmail(row.validated_by) : ""}.</div>
                <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => navigate("/quality")}>Back to Quality Control</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 10 }}>
                  Record why <strong>{nameFromEmail(row.qa_email)}</strong> missed the Phase-1 calibration session. This is logged for the record — no action plan is created for a miss.
                </div>
                <textarea
                  className="form-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. On approved annual leave during the calibration window; rescheduled for next cycle."
                  rows={4}
                  style={{ width: "100%", resize: "vertical", marginBottom: 14 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Mark reason validated"}</button>
                  <button className="btn btn-outline" onClick={() => navigate("/quality")}>Later</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
