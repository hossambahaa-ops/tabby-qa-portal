import React from "react";
import { hasRole, ROLE_LABELS } from "../lib/constants.js";
import { Icon } from "../components/Icons.jsx";

/* Simple lock SVG illustration for permission-gated pages */
const LockIllustration = () => (
  <svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    fill="none"
    style={{ animation: "placeholderFloat 3s ease-in-out infinite" }}
  >
    <rect x="18" y="36" width="44" height="34" rx="6" fill="var(--primary-light)" stroke="var(--primary)" strokeWidth="2.5" />
    <path
      d="M28 36V28a12 12 0 0 1 24 0v8"
      stroke="var(--primary)"
      strokeWidth="2.5"
      strokeLinecap="round"
      fill="none"
    />
    <circle cx="40" cy="52" r="5" fill="var(--primary)" />
    <rect x="38.5" y="55" width="3" height="7" rx="1.5" fill="var(--primary)" />
  </svg>
);

/* Simple clock SVG for coming-soon pages */
const ComingSoonIllustration = () => (
  <svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    fill="none"
    style={{ animation: "placeholderFloat 3s ease-in-out infinite" }}
  >
    <circle cx="40" cy="40" r="28" fill="var(--primary-light)" stroke="var(--primary)" strokeWidth="2.5" />
    <path d="M40 22v20l12 8" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

function PlaceholderPage({ title, description, icon, minRole, userRole }) {
  const locked = minRole && !hasRole(userRole, minRole);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">{title}</div>
      </div>
      <div className="card">
        <div className="placeholder">
          {locked ? <LockIllustration /> : <ComingSoonIllustration />}

          <div className="placeholder-icon" style={{ marginTop: 12 }}>
            <Icon d={icon} size={28} />
          </div>

          <h3>{title}</h3>

          <p>
            {locked
              ? `This page requires ${ROLE_LABELS[minRole]} access or above.`
              : description}
          </p>

          {locked && userRole && (
            <p style={{ fontSize: 12, color: "var(--tx3)", marginTop: 4 }}>
              Your current role: <strong>{ROLE_LABELS[userRole] || userRole}</strong>
            </p>
          )}

          <div className="placeholder-badge">
            {locked ? "Access restricted" : "Coming soon"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlaceholderPage;
