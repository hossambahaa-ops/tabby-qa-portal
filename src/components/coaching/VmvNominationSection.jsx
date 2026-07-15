import React, { useState, useEffect } from "react";
import { sb } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { hasRole } from "../../lib/constants.js";
import { nameFromEmail, emailsMatchLoose } from "../../lib/utils.js";

// 'Mon-YYYY' labels in Riyadh time (matches the mtd_scores.month convention).
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function riyadhYM() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", month: "numeric", year: "numeric" }).formatToParts(new Date());
  return { y: +p.find(x => x.type === "year").value, m: +p.find(x => x.type === "month").value };
}
export function currentMonthLabel() {
  const { y, m } = riyadhYM();
  return `${MONTH_ABBR[m - 1]}-${y}`;
}
// Current + prior month labels — the nomination month toggle. Early-month
// MPRs sometimes cover the prior month, so a lead can file against either.
export function monthChoices() {
  const { y, m } = riyadhYM();
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  return [`${MONTH_ABBR[m - 1]}-${y}`, `${MONTH_ABBR[pm - 1]}-${py}`];
}

// "Nomination for VMV" (Vision, Mission & Values) — surfaced inside the MPR
// compose flow. A lead can nominate any of their direct reports for the
// current month with a reason; multiple nominations per month are allowed
// (one per team member — re-nominating updates the reason). Leads see and
// manage their own here; leadership reviews all via VmvNominationsReview.
export default function VmvNominationSection({ roster = [] }) {
  const { token, profile, realProfile, impersonating, globalToast } = useApp();
  const myEmail = (impersonating ? realProfile?.email : profile?.email) || "";
  const isLead = hasRole(profile?.role, "qa_lead");
  const choices = monthChoices();
  const [month, setMonth] = useState(choices[0]);

  const [noms, setNoms] = useState([]);
  const [nominee, setNominee] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Nominee options: the lead's own direct reports. Supervisors/admins (no
  // direct reports of their own) fall back to the full visible roster.
  const myTeam = roster.filter(r => emailsMatchLoose(r.manager_email, myEmail) && !emailsMatchLoose(r.email, myEmail));
  const nomineeOptions = (myTeam.length ? myTeam : roster.filter(r => !emailsMatchLoose(r.email, myEmail)))
    .slice().sort((a, b) => (a.email || "").localeCompare(b.email || ""));

  const load = async () => {
    if (!token || !myEmail) return;
    const rows = await sb.query("vmv_nominations", {
      token, select: "id,nominee_email,nominated_by,reason,month,created_at",
      filters: `month=eq.${month}&order=created_at.desc`,
    }).catch(() => []);
    // RLS may return others' rows for a supervisor; the compose section only
    // manages the current lead's own nominations.
    setNoms((rows || []).filter(r => emailsMatchLoose(r.nominated_by, myEmail)));
  };
  useEffect(() => { load(); }, [token, myEmail, month]);

  const add = async () => {
    if (!nominee) { globalToast?.("error", "Pick a team member to nominate."); return; }
    if (!reason.trim()) { globalToast?.("error", "Add a short reason for the nomination."); return; }
    setBusy(true);
    try {
      await sb.query("vmv_nominations", {
        token, method: "POST",
        filters: "on_conflict=nominee_email,nominated_by,month",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: { nominee_email: nominee.toLowerCase(), nominated_by: myEmail.toLowerCase(), month, reason: reason.trim(), domain: (myEmail.split("@")[1] || null) },
      });
      globalToast?.("success", `Nominated ${nameFromEmail(nominee)} for VMV.`);
      setNominee(""); setReason("");
      await load();
    } catch (e) { globalToast?.("error", e?.message || "Couldn't save the nomination."); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    try {
      await sb.query("vmv_nominations", { token, method: "DELETE", headers: { Prefer: "return=minimal" }, filters: `id=eq.${id}` });
      await load();
    } catch (e) { globalToast?.("error", e?.message || "Couldn't remove the nomination."); }
  };

  if (!isLead) return null;

  return (
    <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--bg)", borderRadius: 10, border: "1px solid var(--bd2)", borderLeft: "3px solid var(--tabby-purple, #6A2C79)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>🌟</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Nomination for VMV</span>
        <span style={{ fontSize: 11, color: "var(--tx3)" }}>· for</span>
        <select className="select form-input" value={month} onChange={e => setMonth(e.target.value)} style={{ width: "auto", fontSize: 11, padding: "2px 6px" }} title="Month this nomination is filed under">
          {choices.map(mo => <option key={mo} value={mo}>{mo}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 12 }}>
        Nominate a team member who lived Tabby's <strong>Vision, Mission &amp; Values</strong> for the selected month. You can nominate more than one.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <select className="select form-input" value={nominee} onChange={e => setNominee(e.target.value)} style={{ flex: "1 1 200px", minWidth: 180 }}>
          <option value="">Select a team member…</option>
          {nomineeOptions.map(r => <option key={r.email} value={r.email}>{nameFromEmail(r.email)} ({r.email})</option>)}
        </select>
        <input className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason — how they showed VMV" style={{ flex: "2 1 260px", minWidth: 200 }} />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={add} style={{ flexShrink: 0 }}>{busy ? "Saving…" : "Nominate"}</button>
      </div>

      {noms.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {noms.map(n => (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--bd2)" }}>
              <span style={{ fontSize: 13 }}>🌟</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{nameFromEmail(n.nominee_email)}</div>
                <div style={{ fontSize: 11, color: "var(--tx3)" }}>{n.reason}</div>
              </div>
              <button type="button" onClick={() => remove(n.id)} title="Remove nomination" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
