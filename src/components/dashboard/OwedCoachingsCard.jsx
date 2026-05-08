import React, { useEffect, useState } from "react";
import { sb } from "../../lib/supabase.js";
import { hasRole } from "../../lib/constants.js";
import { useApp } from "../../lib/AppContext.jsx";
import { nameFromEmail } from "../../lib/utils.js";

// Tiny widget for QA Leads (and above) showing which of their team's QAs
// are overdue for a coaching session — defaults to "no coaching in the
// last 30 days" but can be tightened/loosened via the OVERDUE_DAYS const.
//
// Renders nothing when:
//   * the viewer isn't a lead+,
//   * every QA on their team has been coached in the window.
//
// Same visual shape as PendingSideTasksCard so the two cards stack
// naturally on the lead's Dashboard.
const OVERDUE_DAYS = 30;

export default function OwedCoachingsCard() {
  const { token, profile } = useApp();
  const [loading, setLoading] = useState(true);
  const [overdue, setOverdue] = useState([]);

  const isLead = hasRole(profile?.role, "qa_lead");

  useEffect(() => {
    if (!token || !isLead || !profile?.email) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const myEmail = profile.email.toLowerCase();
        // 1. The lead's direct reports.
        const roster = await sb.query("qa_roster", {
          token,
          select: "email,display_name,manager_email",
          filters: `manager_email=ilike.${myEmail}`,
        }).catch(() => []);
        const team = (Array.isArray(roster) ? roster : []).filter(r => r.email);
        if (team.length === 0) { if (!cancelled) setLoading(false); return; }

        // 2. Latest coaching_sessions.session_date per member, scoped to
        //    this team. Fetched in one round trip and reduced client-side
        //    so we don't need a per-QA query.
        const teamEmails = team.map(r => r.email.toLowerCase());
        const inList = teamEmails.map(e => `"${e}"`).join(",");
        const sessions = await sb.query("coaching_sessions", {
          token,
          select: "member_email,session_date",
          filters: `member_email=in.(${inList})&order=session_date.desc&limit=1000`,
        }).catch(() => []);
        const lastByMember = new Map();
        for (const s of (Array.isArray(sessions) ? sessions : [])) {
          const k = (s.member_email || "").toLowerCase();
          if (!lastByMember.has(k) && s.session_date) lastByMember.set(k, s.session_date);
        }

        // 3. Compute overdue list. "Never coached" treated as max overdue
        //    so it sorts to the top.
        const now = Date.now();
        const out = team.map(r => {
          const last = lastByMember.get(r.email.toLowerCase());
          const daysSince = last ? Math.max(0, Math.round((now - new Date(last + "T00:00:00").getTime()) / 86400000)) : null;
          return { email: r.email, display_name: r.display_name, daysSince };
        }).filter(x => x.daysSince === null || x.daysSince >= OVERDUE_DAYS)
          .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999));

        if (!cancelled) {
          setOverdue(out);
          setLoading(false);
        }
      } catch (e) {
        console.error("OwedCoachingsCard:", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, isLead, profile?.email]);

  if (!isLead) return null;
  if (loading) return null;
  if (overdue.length === 0) return null;

  const top = overdue.slice(0, 5);

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        borderLeft: "4px solid var(--tabby-purple, #6A2C79)",
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
          background: "var(--accent-light, var(--bg2))", color: "var(--tabby-purple, #6A2C79)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0,
        }}>📒</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", letterSpacing: "-.1px" }}>
            {overdue.length} coaching{overdue.length === 1 ? "" : "s"} owed
          </div>
          <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 2 }}>
            QAs not coached in the last {OVERDUE_DAYS} days
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {top.map(r => (
          <span
            key={r.email}
            style={{
              fontSize: 11, fontWeight: 600,
              padding: "4px 10px", borderRadius: 999,
              background: "var(--bg)", border: "1px solid var(--bd2)", color: "var(--tx2)",
            }}
            title={r.daysSince == null ? `${r.email} — never coached` : `${r.email} — last coached ${r.daysSince} days ago`}
          >
            {nameFromEmail(r.email)} · {r.daysSince == null ? "never" : `${r.daysSince}d`}
          </span>
        ))}
        {overdue.length > top.length && (
          <span style={{ fontSize: 11, color: "var(--tx3)", alignSelf: "center" }}>
            +{overdue.length - top.length} more
          </span>
        )}
      </div>

      <a
        href="#/quality?tab=coaching"
        className="btn btn-outline btn-sm"
        style={{ fontSize: 11, padding: "6px 14px", whiteSpace: "nowrap" }}
        title="Open Coaching → Compose to log a session"
      >
        Log coaching →
      </a>
    </div>
  );
}
