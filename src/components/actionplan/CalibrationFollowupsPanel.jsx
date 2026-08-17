import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { sb } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { hasRole } from "../../lib/constants.js";
import { emailsMatchLoose, nameFromEmail } from "../../lib/utils.js";
import EmptyState from "../EmptyState.jsx";

// Lead-facing summary of outstanding calibration actions, so a lead who
// dismissed the bell can still find them in one place on the plans tab:
//   • verbal warnings awaiting the lead's confirm+submit (pending_lead)
//   • verbal warnings issued but not yet acknowledged by the QA
//   • missed calibrations awaiting the lead's reason validation
// Each row opens the same role-aware page the bell routes to. RLS scopes
// rows server-side; emailsMatchLoose handles the @tabby.ai/@tabby.sa split.
// Supervisors/admins see everything they oversee; a plain lead sees theirs.
// Now the "Calibration" tab's own view rather than a block wedged above every
// other tab (where it repeated on all four and was easy to scroll past).
// It stays MOUNTED whichever tab is showing — the fetch has to run so the tab
// bar can carry an accurate count — and only its output is gated on `visible`.
// `onCount` reports the outstanding total up to the parent for that badge.
export default function CalibrationFollowupsPanel({ visible = true, onCount }) {
  const { token, profile } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const isPriv = hasRole(profile?.role, "qa_supervisor");

  // Ref so a parent passing an inline arrow doesn't re-trigger the fetch.
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;
  useEffect(() => { onCountRef.current?.(items.length); }, [items.length]);

  useEffect(() => {
    if (!token || !profile?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const [warns, miss] = await Promise.all([
          sb.query("verbal_warnings", { token, select: "id,qa_email,lead_email,reason,status,created_at,issued_at,acked_at", filters: "status=in.(pending_lead,issued)&order=created_at.desc&limit=100" }).catch(() => []),
          sb.query("calibration_miss_reviews", { token, select: "id,qa_email,lead_email,month,status,created_at", filters: "status=eq.pending&order=created_at.desc&limit=100" }).catch(() => []),
        ]);
        const mine = (email) => isPriv || emailsMatchLoose(email, profile?.email);
        const out = [];
        (warns || []).forEach(w => {
          if (!mine(w.lead_email)) return;
          if (w.status === "pending_lead") {
            out.push({ id: "vw-" + w.id, icon: "⚠", name: nameFromEmail(w.qa_email), label: "Phase 1 fail — confirm & send verbal warning", cta: "Review", route: "/verbal-warning/" + w.id, time: w.created_at });
          } else if (w.status === "issued" && !w.acked_at) {
            out.push({ id: "vw-" + w.id, icon: "📣", name: nameFromEmail(w.qa_email), label: "Verbal warning issued — awaiting QA acknowledgment", cta: "View", route: "/verbal-warning/" + w.id, time: w.issued_at || w.created_at });
          }
        });
        (miss || []).forEach(r => {
          if (!mine(r.lead_email)) return;
          out.push({ id: "cm-" + r.id, icon: "❓", name: nameFromEmail(r.qa_email), label: `Missed calibration (${r.month}) — validate reason`, cta: "Validate", route: "/calibration-miss/" + r.id, time: r.created_at });
        });
        out.sort((a, b) => new Date(b.time) - new Date(a.time));
        if (!cancelled) { setItems(out); setLoaded(true); }
      } catch { if (!cancelled) { setItems([]); setLoaded(true); } }
    })();
    return () => { cancelled = true; };
  }, [token, profile?.email, isPriv]);

  if (!visible) return null;
  if (items.length === 0) {
    return loaded
      ? <div className="card"><EmptyState tone="good" illus="check" title="No calibration follow-ups" description="Nothing outstanding — no verbal warnings awaiting confirmation and no missed calibrations to validate."/></div>
      : null;
  }

  return (
    <div className="card" style={{ padding: 14, borderLeft: "3px solid var(--amber)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Calibration follow-ups</span>
        <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "var(--amber-bg)", color: "var(--amber)" }}>{items.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(it => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--bd)" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{it.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</div>
              <div style={{ fontSize: 11, color: "var(--tx3)" }}>{it.label}</div>
            </div>
            <button className="btn btn-outline" style={{ flexShrink: 0, fontSize: 12, padding: "4px 12px" }} onClick={() => navigate(it.route)}>{it.cta}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
