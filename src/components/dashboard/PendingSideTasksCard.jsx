import React, { useEffect, useState } from "react";
import { sb } from "../../lib/supabase.js";
import { hasRole } from "../../lib/constants.js";
import { useApp } from "../../lib/AppContext.jsx";
import { nameFromEmail } from "../../lib/utils.js";
import { loadTeamForViewer } from "../../lib/teamScope.js";

// Tiny widget for QA Leads (and above) showing how many side-task hours
// across their team are currently waiting for their approval. Renders
// nothing when:
//   * the viewer isn't a lead+,
//   * the lead has no pending side-task minutes for their team in the
//     last 7 days.
//
// Source: productivity_history.pending_side_minutes — set by the daily
// productivity feed; clears once the lead approves and the QA's hours
// move from "pending" to "approved" side_task_minutes. We sum across
// the last 7 days so a lead doesn't lose visibility on Monday for
// Friday's submissions.
//
// Scoping: a QA "belongs to" this lead when qa_roster.manager_email
// matches the viewer's email (case-insensitive). Supervisors / managers
// see every lead under them by virtue of role-based RLS on
// qa_roster + productivity_history.
export default function PendingSideTasksCard() {
  const { token, profile } = useApp();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState({ qas: [], totalMin: 0, asOf: null });

  const isLead = hasRole(profile?.role, "qa_lead");

  useEffect(() => {
    if (!token || !isLead || !profile?.email) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // 1. Effective team for this viewer — direct reports for leads;
        //    for supervisors+ also walks one level down via teams.supervisor_id
        //    so a sup sees every QA under the leads reporting to them.
        const team = (await loadTeamForViewer({ token, profile })).filter(r => r.email);
        const teamEmails = team.map(r => r.email.toLowerCase());
        if (teamEmails.length === 0) {
          if (!cancelled) { setLoading(false); }
          return;
        }

        // 2. Pull the latest productivity_history row per QA in the team
        //    for the last 7 days. We only care about the most recent
        //    non-zero pending value per QA — that's what's currently
        //    awaiting approval.
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        const isoFrom = fromDate.toISOString().split("T")[0];
        const inList = teamEmails.map(e => `"${e}"`).join(",");
        const rows = await sb.query("productivity_history", {
          token,
          select: "qa_email,date,pending_side_minutes,synced_at",
          filters: `date=gte.${isoFrom}&qa_email=in.(${inList})&pending_side_minutes=gt.0&order=date.desc`,
        }).catch(() => []);

        // Take the most-recent date per QA that has pending > 0.
        const latestPerQa = new Map();
        for (const r of (Array.isArray(rows) ? rows : [])) {
          const key = (r.qa_email || "").toLowerCase();
          if (!latestPerQa.has(key)) latestPerQa.set(key, r);
        }

        const qas = [...latestPerQa.values()];
        const totalMin = qas.reduce((s, r) => s + Number(r.pending_side_minutes || 0), 0);
        const asOf = qas.reduce((max, r) => (r.synced_at && (!max || r.synced_at > max) ? r.synced_at : max), null);

        if (!cancelled) {
          setPending({ qas, totalMin, asOf });
          setLoading(false);
        }
      } catch (e) {
        console.error("PendingSideTasksCard:", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, isLead, profile?.email]);

  if (!isLead) return null;
  if (loading) return null;
  if (pending.totalMin === 0 || pending.qas.length === 0) return null;

  const hours = (pending.totalMin / 60).toFixed(1);
  const qaCount = pending.qas.length;
  const asOfLabel = pending.asOf
    ? new Date(pending.asOf).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  // Top 3 QAs by pending minutes — shown inline so the lead can see who
  // to ping without opening the schedule page.
  const top = [...pending.qas]
    .sort((a, b) => Number(b.pending_side_minutes || 0) - Number(a.pending_side_minutes || 0))
    .slice(0, 3);

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        borderLeft: "4px solid var(--amber)",
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 240 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "var(--amber-bg)", color: "var(--amber)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0,
        }}>⏳</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", letterSpacing: "-.1px" }}>
            {hours}h pending side-task approval
          </div>
          <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 2 }}>
            {qaCount} QA{qaCount === 1 ? "" : "s"} on your team
            {asOfLabel ? <span style={{ color: "var(--tx3)" }}> · last update {asOfLabel}</span> : null}
          </div>
        </div>
      </div>

      {top.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {top.map(r => {
            const mins = Number(r.pending_side_minutes || 0);
            const h = mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`;
            return (
              <span
                key={r.qa_email}
                style={{
                  fontSize: 11, fontWeight: 600,
                  padding: "4px 10px", borderRadius: 999,
                  background: "var(--bg)", border: "1px solid var(--bd2)", color: "var(--tx2)",
                }}
                title={`${r.qa_email} — ${mins} min pending (date ${r.date})`}
              >
                {nameFromEmail(r.qa_email)} · {h}
              </span>
            );
          })}
          {pending.qas.length > top.length && (
            <span style={{ fontSize: 11, color: "var(--tx3)", alignSelf: "center" }}>
              +{pending.qas.length - top.length} more
            </span>
          )}
        </div>
      )}

      <a
        href="#/schedule?tab=approvals"
        className="btn btn-outline btn-sm"
        style={{ fontSize: 11, padding: "6px 14px", whiteSpace: "nowrap" }}
        title="Open the Schedule page's pending approvals tab"
      >
        Review approvals →
      </a>
    </div>
  );
}
