import React, { useState, useEffect } from "react";
import { hasRole } from "../lib/constants.js";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";
import DAMPage from "./DAMPage.jsx";
import CoachingViolationsPage from "./CoachingViolationsPage.jsx";
import CoachingPage from "./CoachingPage.jsx";
import ActionPlanPage from "./ActionPlanPage.jsx";

const TABS = [
  { key: "violations", label: "Violations" },
  { key: "plans", label: "AP / PIP" },
  { key: "coaching", label: "Coaching" },
  { key: "dam", label: "DAM Flags" },
];

function QualityControlPage() {
  const { profile } = useApp();
  const [tab, setTab] = useUrlState("tab", "violations");

  // Listen for direct navigation requests (e.g., from notification clicks)
  useEffect(() => {
    const handler = (e) => {
      const t = e.detail;
      if (t === "dam") setTab("dam");
      else if (t === "violations") setTab("violations");
      else if (t === "coaching") setTab("coaching");
      else if (t === "plans") setTab("plans");
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
      {tab === "dam" && <DAMPage />}
      {tab === "violations" && <CoachingViolationsPage />}
      {tab === "coaching" && <CoachingPage />}
      {tab === "plans" && <ActionPlanPage />}
    </div>
  );
}

export default QualityControlPage;
