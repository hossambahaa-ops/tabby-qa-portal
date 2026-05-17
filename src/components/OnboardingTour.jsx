import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";

/* Role-specific training flows.
   Each role sees a tailored walkthrough of the features they have access to. */

const TOUR_FLOWS = {
  qa: [
    { icon: "👋", title: "Welcome to Tabby Pulse!", body: "This is your personal QA portal. Let's take a 90-second tour so you know where everything is." },
    { icon: "🏠", title: "Dashboard — Your Day at a Glance", body: "See today's evals, occupancy %, and working hours at the top. A motivational banner tells you if you're on track or need to pick up the pace." },
    { icon: "📊", title: "Progress Breakdown", body: "Track SBS, Non-SBS, Coaching, and Side Tasks vs. your daily targets. Color-coded bars show you where you stand." },
    { icon: "⚡", title: "Still Needed Today", body: "A summary card shows exactly what's left: \"3 more Non-SBS needed\" or \"Target reached!\" No guessing." },
    { icon: "👤", title: "Your QA Profile", body: "Click \"QA Profile\" in the sidebar to see your full MTD scores, coaching history, and evaluation trends. Click (?) icons for metric definitions." },
    { icon: "🏆", title: "Leaderboard", body: "See the top 3 performers and your own rank. Use it as motivation — or to celebrate hitting the podium!" },
    { icon: "🔔", title: "Notifications", body: "The bell icon (top right) shows tasks assigned to you, coaching sessions logged by your lead, and announcements." },
    { icon: "🔍", title: "Quick Search (⌘K)", body: "Press Cmd+K (Mac) or Ctrl+K (Windows) anytime to jump to any page or quick action instantly." },
    { icon: "💬", title: "Need Help?", body: "Use the floating feedback button (bottom right) to report issues. Replay this tour anytime by pressing ? and clicking \"Replay tour\"." },
    { icon: "🚀", title: "You're all set!", body: "Start your day strong. Your team is counting on you!" },
  ],
  qa_lead: [
    { icon: "🎯", title: "Welcome, Team Lead!", body: "You manage a QA team. This tour covers the lead-specific features you'll use daily. Takes about 2 minutes." },
    { icon: "🏠", title: "Dashboard — Team Command Center", body: "See your team's overview, flagged QAs trending toward Action Plans, team health metrics, and assigned tasks." },
    { icon: "👥", title: "QA Profile (Full Access)", body: "Click any QA to drill into their profile: MTD scores, coaching history, DAM flags, Action Plans, daily occupancy, and evaluation trends." },
    { icon: "🏆", title: "Leaderboard + Bulk Actions", body: "Select multiple QAs using checkboxes → Send Coaching, Compare side-by-side, Focus on selected, or Export to CSV." },
    { icon: "🛡️", title: "Quality Control — 4 Tabs in One", body: "Violations → Action Plans → Coaching → DAM Flags. Flow: flag bad behavior → log violation → coach the QA → put them on AP/PIP if needed." },
    { icon: "📝", title: "Coaching Composer", body: "Connect Gmail once, then send formatted 1:1 coaching emails to one or more QAs (group coaching). Auto-logs the session." },
    { icon: "📅", title: "Schedule — Bulk Attendance", body: "Check boxes for multiple QAs → click \"Bulk mark attendance\" to mark a date range as P / AL / OFF etc. in seconds." },
    { icon: "🎯", title: "Targets", body: "Set team-wide KPI targets, or override per individual QA (useful for LLM monitors or custom roles). Use \"Apply to team\" for bulk updates." },
    { icon: "✅", title: "Assign Tasks (Multi-QA)", body: "\"+ New task\" → pick one or more QAs → one task is created per assignee. Use templates (Daily Check-in, Weekly Review) for common assignments." },
    { icon: "🔍", title: "Quick Search (⌘K)", body: "Press Cmd+K to find any QA, page, or quick action. Notifications also deep-link to the right QC tab when clicked." },
    { icon: "💬", title: "Help & Support", body: "Click \"?\" anytime to see keyboard shortcuts and replay this tour. Use the floating feedback button to report issues." },
    { icon: "🚀", title: "You're ready to lead!", body: "You have everything you need to manage your team's performance. Let's go!" },
  ],
  qa_supervisor: [
    { icon: "⭐", title: "Welcome, Supervisor!", body: "You oversee multiple teams across domains. This tour covers supervisor-specific features." },
    { icon: "🏠", title: "Dashboard — Cross-Team View", body: "See aggregated metrics across all your teams. Filter by domain, compare team performance, and spot trends early." },
    { icon: "🛡️", title: "Quality Control (Domain-Wide)", body: "See DAM flags, violations, action plans for all teams in your domain. Bulk-review and route as needed." },
    { icon: "📢", title: "Announcements", body: "Send announcements to everyone, a specific domain, a team, individuals, or multiple people. Supports multi-select targeting." },
    { icon: "🔀", title: "Escalations", body: "Review escalations routed to you. You can also CC additional reviewers when submitting an escalation." },
    { icon: "👤", title: "HR Cases", body: "Track disciplinary cases and manage sensitive performance issues." },
    { icon: "🎯", title: "Targets — Full Control", body: "Set targets at domain level, team level, or per individual QA. Use \"Apply to team\" to bulk-update multiple QAs under one lead." },
    { icon: "📊", title: "Leaderboard (Everyone)", body: "Compare QAs across teams, bulk actions, export data for management reports." },
    { icon: "🔍", title: "Quick Search (⌘K)", body: "Search any QA by name across the whole company, jump to any page instantly." },
    { icon: "💬", title: "Help & Feedback", body: "Press ? for keyboard shortcuts, use the feedback button for issues." },
    { icon: "🚀", title: "You're all set!", body: "Lead with data. You have the full picture." },
  ],
  admin: [
    { icon: "🔧", title: "Welcome, Admin!", body: "You have full system access. This tour covers admin-specific tools plus a quick overview of everything else." },
    { icon: "⚙️", title: "Admin Panel — 5 Tabs", body: "Users · Teams · Audit Trail · Feedback · Errors. All admin tools live here." },
    { icon: "👤", title: "Users Management", body: "View by role or list. Bulk role updates, bulk team reassignment, delete users. Search by name or email." },
    { icon: "🏢", title: "Teams Management", body: "Create, edit, and merge teams. Assign leads and supervisors." },
    { icon: "📜", title: "Audit Trail", body: "See every action taken in the app: user updates, targets changed, coaching sessions sent, etc. Filter by user, action type, or date." },
    { icon: "📬", title: "User Feedback", body: "Respond to feedback submitted via the floating feedback button. Close the loop with your users." },
    { icon: "🛡️", title: "Quality Control (All Access)", body: "DAM Flags, Violations, Coaching, AP/PIP — system-wide. Nothing is hidden from you." },
    { icon: "🎯", title: "Targets (Full Override)", body: "Team defaults + per-QA overrides. Define durations that feed into occupancy calculations." },
    { icon: "📢", title: "Announcements", body: "Broadcast to everyone, a domain, a team, or multiple individuals. All audit-logged." },
    { icon: "🔍", title: "Quick Search (⌘K)", body: "Power-user shortcut. Search QAs, pages, quick actions." },
    { icon: "💬", title: "Help & Support", body: "Press ? for shortcuts. Feedback button for issues. URL state syncs — share links to specific views." },
    { icon: "🚀", title: "You run the show!", body: "You have everything. Keep the portal healthy!" },
  ],
};

const ROLE_LABELS = {
  qa: "QA Specialist",
  senior_qa: "Senior QA",
  qa_lead: "QA Lead",
  qa_supervisor: "QA Supervisor",
  admin: "Admin",
  super_admin: "Super Admin",
};

// Map user role → tour flow key
function flowForRole(role) {
  if (role === "super_admin" || role === "hod" || role === "admin" || role === "manager") return "admin";
  if (role === "qa_supervisor") return "qa_supervisor";
  if (role === "qa_lead") return "qa_lead";
  return "qa"; // qa, senior_qa, auditor, or unknown
}

export default function OnboardingTour({ onDismiss, role }) {
  const flowKey = flowForRole(role);
  const steps = TOUR_FLOWS[flowKey] || TOUR_FLOWS.qa;
  const [step, setStep] = useState(0);
  const isLast = step === steps.length - 1;
  const current = steps[step];
  const total = steps.length;

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onDismiss();
      if (e.key === "ArrowRight") { if (!isLast) setStep(s => s + 1); else onDismiss(); }
      if (e.key === "ArrowLeft" && step > 0) setStep(s => s - 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, isLast, onDismiss]);

  return ReactDOM.createPortal(
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 20,
    }}>
      <div style={{
        background: "var(--bg3)", borderRadius: 16, padding: 32, maxWidth: 500, width: "100%",
        boxShadow: "var(--shadow)", border: "1px solid var(--bd)", position: "relative",
      }}>
        {/* Skip button */}
        <button onClick={onDismiss} style={{
          position: "absolute", top: 12, right: 12, background: "none", border: "none",
          color: "var(--tx3)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font)",
        }}>Skip tour ✕</button>

        {/* Role badge */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--tabby-purple)", textTransform: "uppercase", letterSpacing: ".5px", padding: "3px 10px", background: "var(--primary-light)", borderRadius: 12 }}>
            {ROLE_LABELS[role] || "Training"} · Step {step + 1} of {total}
          </span>
        </div>

        {/* Icon */}
        <div style={{ fontSize: 48, textAlign: "center", marginBottom: 12 }}>{current.icon}</div>

        {/* Content */}
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 12, color: "var(--tx)" }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 14, color: "var(--tx2)", lineHeight: 1.6, textAlign: "center", marginBottom: 24 }}>
          {current.body}
        </p>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 20, flexWrap: "wrap" }}>
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: i === step ? 20 : 7, height: 7, borderRadius: 4, cursor: "pointer",
              background: i === step ? "var(--tabby-purple)" : i < step ? "var(--green)" : "var(--bd)", transition: "all .3s",
            }} />
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn btn-outline"
            style={{ opacity: step === 0 ? 0.4 : 1, fontSize: 13 }}
          >← Back</button>
          <button
            onClick={() => { if (isLast) onDismiss(); else setStep(s => s + 1); }}
            className="btn btn-primary"
            style={{ fontSize: 13 }}
          >{isLast ? "Get Started 🚀" : "Next →"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
