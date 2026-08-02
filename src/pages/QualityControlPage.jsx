import React, { useState, useEffect, Suspense } from "react";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";
import { lazyWithRetry as lazy } from "../lib/lazyWithRetry.js";

// One tab is visible at a time, so load one tab's code at a time. These were
// static imports, which meant opening Quality Control pulled all four pages
// (~181 kB raw — AP/PIP and Coaching are ~70 kB each) before rendering the
// default Violations tab. lazyWithRetry, not bare React.lazy, so a tab still
// recovers from a stale chunk after a deploy like every other route does.
const DAMPage = lazy(() => import("./DAMPage.jsx"));
const CoachingViolationsPage = lazy(() => import("./CoachingViolationsPage.jsx"));
const CoachingPage = lazy(() => import("./CoachingPage.jsx"));
const ActionPlanPage = lazy(() => import("./ActionPlanPage.jsx"));
// Performance Candidates rolled into AP/PIP → Detection tab instead
// of a standalone Quality Control tab. CandidatesPanel.jsx kept on
// disk for now in case it's useful as a fallback view, but it's not
// imported here.

const TABS = [
  { key: "violations", label: "Violations" },
  { key: "plans", label: "AP / PIP" },
  { key: "coaching", label: "Coaching" },
  { key: "dam", label: "DAM Flags" },
];

function QualityControlPage() {
  const { profile } = useApp();
  // Namespaced (was "tab") so a stale ?tab=feedback from /admin or
  // ?tab=plan from /schedule doesn't bleed in and leave Quality on
  // its default fallback when the user crosses pages.
  const [tab, setTab] = useUrlState("qc_tab", "violations");

  // Listen for direct navigation requests (e.g., from notification clicks)
  useEffect(() => {
    const handler = (e) => {
      const t = e.detail;
      if (t === "dam") setTab("dam");
      else if (t === "violations") setTab("violations");
      else if (t === "coaching") setTab("coaching");
      else if (t === "plans") setTab("plans");
      // "candidates" event now lands on the AP/PIP tab where the
      // Detection sub-tab surfaces month-end candidates.
      else if (t === "candidates") setTab("plans");
    };
    window.addEventListener("qc-tab", handler);
    return () => window.removeEventListener("qc-tab", handler);
  }, []);

  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div className="page-title">Quality Control</div>
          <div className="page-subtitle">DAM flags, violations, coaching sessions, and action plans</div>
        </div>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.key} className={`tab-btn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      {/* Local Suspense, not the router's: the route-level boundary would
          blank the header and tab bar too, so switching tabs would flash the
          whole page instead of just the panel being loaded. */}
      <Suspense fallback={
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 220 }}>
          <div className="pulse-loader" />
        </div>
      }>
        {tab === "dam" && <DAMPage />}
        {tab === "violations" && <CoachingViolationsPage />}
        {tab === "coaching" && <CoachingPage />}
        {tab === "plans" && <ActionPlanPage />}
      </Suspense>
    </div>
  );
}

export default QualityControlPage;
