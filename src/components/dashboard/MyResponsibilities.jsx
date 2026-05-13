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
        listViolations({ token, select: "id,status,lead_email,qa_email", filters: isAdmin ? "status=eq.pending" : `lead_email=eq.${myEmail}&status=eq.pending` }),
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
    // Healthy-day signal — collapses to a one-line strip instead of
    // taking the full card height the populated state uses. Same
    // marginBottom so the rhythm of the page below doesn't shift.
    return (
      <div style={{
        padding: "6px 12px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 8,
        borderRadius: 8, background: "var(--green-bg)",
        border: "1px solid var(--green)", color: "var(--green)",
        fontSize: 12, fontWeight: 600,
      }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>✅</span>
        <span>All caught up — no pending escalations, violations, or plans need review.</span>
      </div>
    );
  }

  const nav = (page, tab) => () => {
    if (onNavigate) onNavigate(page);
    if (tab) setTimeout(() => window.dispatchEvent(new CustomEvent("qc-tab", { detail: tab })), 100);
  };

  // Tone-tinted floating tile. Borderless to match the Floating
  // Layers theme — depth comes from the soft tone-coloured shadow +
  // top-edge highlight, not a hard outline. Left-edge accent bar
  // preserves the colour cue. Hover lifts and warms the wash.
  const tile = (icon, label, value, sub, tone, toneRgb, onClick) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="attn-tile"
      style={{
        display: "flex", flexDirection: "column", gap: 4,
        padding: "14px 16px", borderRadius: 20,
        background: `rgba(${toneRgb}, .10)`,
        border: "none",
        position: "relative", overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "transform .2s var(--ease), background .2s ease, box-shadow .2s ease",
        textAlign: "left", color: "var(--tx)",
        fontFamily: "var(--font)",
        boxShadow: `0 6px 18px -4px rgba(${toneRgb}, .18), 0 2px 6px -2px rgba(${toneRgb}, .12), inset 0 1px 0 rgba(255,255,255,.10)`,
      }}
      onMouseEnter={e => {
        if (!onClick) return;
        e.currentTarget.style.background = `rgba(${toneRgb}, .16)`;
        e.currentTarget.style.boxShadow = `0 12px 28px -4px rgba(${toneRgb}, .28), 0 4px 10px -2px rgba(${toneRgb}, .18), inset 0 1px 0 rgba(255,255,255,.14)`;
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={e => {
        if (!onClick) return;
        e.currentTarget.style.background = `rgba(${toneRgb}, .10)`;
        e.currentTarget.style.boxShadow = `0 6px 18px -4px rgba(${toneRgb}, .18), 0 2px 6px -2px rgba(${toneRgb}, .12), inset 0 1px 0 rgba(255,255,255,.10)`;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Left-edge accent stripe — visually links the tile to its tone */}
      <span aria-hidden="true" style={{
        position: "absolute", left: 0, top: 8, bottom: 8, width: 3,
        background: tone, borderRadius: "0 3px 3px 0",
        opacity: value > 0 ? 1 : 0.35,
      }}/>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: tone, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px" }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
        <span style={{ color: "var(--tx2)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: value > 0 ? tone : "var(--tx3)", lineHeight: 1, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>{sub}</div>}
      {onClick && value > 0 && (
        <span aria-hidden="true" style={{ position: "absolute", top: 14, right: 14, color: tone, fontSize: 12, opacity: .55, fontWeight: 700 }}>›</span>
      )}
    </button>
  );

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        Needs your attention
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--amber-bg)", color: "var(--amber)", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>{total}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {tile("⚡", "Open escalations",  counts.escalations,    counts.escalations > 0 ? "Routed to you" : null,        "var(--red)",          "255,107,107", nav("escalations"))}
        {tile("⚠",  "Pending violations", counts.violations,     counts.violations > 0 ? "Need review" : null,           "var(--amber)",        "255,177,59",  nav("quality", "violations"))}
        {tile("📅", "Plans ending soon",  counts.plansEndingSoon, `${counts.plansActive} active total`,                   "var(--tabby-purple)", "106,44,121",  nav("quality", "plans"))}
        {tile("✓",  "Team tasks open",    counts.teamTasks,      "Across direct reports",                                  "var(--tabby-purple-light)", "139,77,153", nav("dashboard"))}
      </div>
    </div>
  );
}
