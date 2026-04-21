import React, { useState, useEffect } from "react";
import { hasRole } from "../../lib/constants.js";
import { useApp } from "../../lib/AppContext.jsx";
import { listTasks } from "../../api/tasks.js";
import { listPlans } from "../../api/plans.js";
import { listViolations } from "../../api/violations.js";
import { listEscalations } from "../../api/escalations.js";
import { listProfiles } from "../../api/profiles.js";
import { teamEmailsFor } from "../../lib/scope.js";

// Compact "what needs your attention" panel for qa_lead+.
// Deep-links to the detail pages via the window navigate event.
export default function MyResponsibilities({ roster, onNavigate }) {
  const { token, profile } = useApp();
  const [counts, setCounts] = useState(null);

  const isLead = hasRole(profile?.role, "qa_lead");
  const isAdmin = hasRole(profile?.role, "admin");

  useEffect(() => {
    if (!isLead || !profile?.email) return;
    const myEmail = profile.email.toLowerCase();
    const teamSet = teamEmailsFor(profile, roster || []);
    teamSet.add(myEmail);

    (async () => {
      const [openEsc, pendingViol, activePlans, openTeamTasks, newFb] = await Promise.all([
        listEscalations({ token, select: "id,status,routed_to", filters: `routed_to=eq.${profile.email}&status=eq.open` }),
        listViolations({ token, select: "id,status,lead_email,qa_emails", filters: isAdmin ? "status=eq.pending" : `lead_email=eq.${myEmail}&status=eq.pending` }),
        listPlans({ token, select: "id,qa_email,type,status,end_date,tl_email", filters: isAdmin ? "status=eq.active" : `tl_email=eq.${profile.email}&status=eq.active` }),
        listTasks({ token, select: "id,status,assigned_to", filters: "status=neq.done" }),
        isAdmin
          ? listEscalations({ token, select: "id" }).then(() => null).catch(() => null) // placeholder
          : Promise.resolve(null),
      ]);

      const now = new Date();
      const plansEndingSoon = (activePlans || []).filter(p => {
        if (!p.end_date) return false;
        const daysLeft = (new Date(p.end_date) - now) / (1000 * 60 * 60 * 24);
        return daysLeft <= 7 && daysLeft >= 0;
      });

      const teamTasksOpen = (openTeamTasks || []).filter(t => {
        const a = t.assigned_to?.toLowerCase();
        return a && teamSet.has(a);
      });

      setCounts({
        escalations: (openEsc || []).length,
        violations: (pendingViol || []).length,
        plansActive: (activePlans || []).length,
        plansEndingSoon: plansEndingSoon.length,
        teamTasks: teamTasksOpen.length,
      });
    })().catch(() => {});
  }, [token, profile?.email, profile?.role, roster, isLead, isAdmin]);

  if (!isLead || !counts) return null;

  const total = counts.escalations + counts.violations + counts.plansEndingSoon + counts.teamTasks;
  if (total === 0) {
    return (
      <div className="card" style={{ padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>You're all caught up</div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>No pending escalations, violations, or plans needing review.</div>
        </div>
      </div>
    );
  }

  const nav = (page, tab) => () => {
    if (onNavigate) onNavigate(page);
    if (tab) setTimeout(() => window.dispatchEvent(new CustomEvent("qc-tab", { detail: tab })), 100);
  };

  const tile = (label, value, sub, tone, onClick) => (
    <div
      onClick={onClick}
      style={{
        padding: "12px 14px", borderRadius: 10, background: "var(--bg)",
        cursor: onClick ? "pointer" : "default", border: "1px solid var(--bd2)",
        transition: "all .15s ease",
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = "var(--tabby-purple)"; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.borderColor = "var(--bd2)"; }}
    >
      <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: value > 0 ? tone : "var(--tx3)", marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        Needs your attention
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--amber-bg)", color: "var(--amber)", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>{total}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {tile("Open escalations", counts.escalations, counts.escalations > 0 ? "Routed to you" : null, "var(--red)", nav("escalations"))}
        {tile("Pending violations", counts.violations, counts.violations > 0 ? "Need review" : null, "var(--amber)", nav("quality", "violations"))}
        {tile("Plans ending soon", counts.plansEndingSoon, `${counts.plansActive} active total`, "var(--amber)", nav("quality", "plans"))}
        {tile("Team tasks open", counts.teamTasks, "Across direct reports", "var(--tabby-purple)", nav("dashboard"))}
      </div>
    </div>
  );
}
