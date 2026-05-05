import React from "react";
import { computeAttendanceHealth, computeTeamAttendanceHealth, healthColor } from "../../lib/attendancePlan.js";
import HelpTip from "../HelpTip.jsx";

const fmtPct = (n) => (n === null || n === undefined ? "—" : `${n.toFixed(1)}%`);

// AttendanceHealthCard
//
// Shows MTD attendance show-up rate ("health"). Higher = healthier.
// Two modes:
//   - personal  (emails = [oneEmail])    — QA's own card
//   - team      (emails = [...emails])   — team aggregate, top movers below
//
// Props:
//   attendance  — qa_attendance rows with at least { email, date, status, planned_code }
//   emails      — array of QA emails (lowercased recommended)
//   monthYM     — "YYYY-MM"
//   mode        — "personal" | "team"
//   compact     — render the small dashboard variant (no breakdown list)
//
// Renders a div with className="card" and standard padding.
export default function AttendanceHealthCard({ attendance, emails, monthYM, mode = "personal", compact = false }) {
  const isTeam = mode === "team" && Array.isArray(emails) && emails.length > 1;
  const personalEmail = !isTeam ? (Array.isArray(emails) ? emails[0] : emails) : null;

  // Personal computation reuses the helper directly. We pre-filter rows
  // to the QA's own email so future-dated rows from other QAs don't
  // sneak in (the helper already filters by date but cares about ALL
  // rows passed in; pre-narrowing is a small-N safety net).
  const personalRows = personalEmail
    ? (attendance || []).filter(r => r.email?.toLowerCase() === personalEmail.toLowerCase())
    : [];
  const personal = personalEmail
    ? computeAttendanceHealth(personalRows, monthYM)
    : null;

  const team = isTeam
    ? computeTeamAttendanceHealth(attendance, emails, monthYM)
    : null;

  const pct = isTeam ? team.teamHealthPct : personal?.healthPct;
  const color = healthColor(pct);
  const bgColor = pct === null
    ? "rgba(156,163,175,0.10)"
    : pct >= 95 ? "rgba(34,197,94,0.10)"
    : pct >= 85 ? "rgba(245,158,11,0.10)"
    : "rgba(239,68,68,0.10)";

  const scheduled = isTeam ? team.scheduledDays : (personal?.scheduledDays ?? 0);
  const healthy = isTeam ? team.healthyDays : (personal?.healthyDays ?? 0);
  const absent = isTeam ? team.absentDays : (personal?.absentDays ?? 0);

  const tipText =
    "Health = (scheduled days where you showed up) ÷ (scheduled days so far this month) × 100. " +
    "Scheduled = days the lead planned as Home (H) or Office (P). " +
    "Show-up = a status was logged AND it wasn't NSNC. Higher = healthier.";

  // Sort team members by health asc so leads see who needs attention first.
  const memberRows = isTeam
    ? [...team.members].sort((a, b) => {
        if (a.healthPct === null) return 1;
        if (b.healthPct === null) return -1;
        return a.healthPct - b.healthPct;
      })
    : [];

  if (compact) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px" }}>
            {isTeam ? "Team Attendance Health" : "My Attendance Health"}
          </span>
          <HelpTip text={tipText} />
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>
          {fmtPct(pct)}
        </div>
        <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>
          {scheduled === 0 ? "No scheduled days yet this month" : `${healthy} of ${scheduled} scheduled days · ${absent} blank/NSNC`}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--tx2)", textTransform: "uppercase", letterSpacing: ".4px" }}>
            {isTeam ? "Team Attendance Health" : "Attendance Health"}
          </span>
          <HelpTip text={tipText} />
        </div>
        <span style={{ fontSize: 11, color: "var(--tx3)" }}>MTD · higher is healthier</span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 14px", borderRadius: 8, background: bgColor }}>
        <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {fmtPct(pct)}
        </div>
        <div style={{ fontSize: 12, color: "var(--tx2)", lineHeight: 1.4 }}>
          {scheduled === 0 ? (
            <>No scheduled days yet this month.</>
          ) : (
            <>
              {healthy} healthy / {scheduled} scheduled
              {absent > 0 && <> · <span style={{ color: "var(--red)" }}>{absent} blank or NSNC</span></>}
            </>
          )}
        </div>
      </div>

      {isTeam && memberRows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".4px" }}>
            Per QA · lowest first
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflow: "auto" }}>
            {memberRows.map(m => (
              <div key={m.email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 4, background: "var(--bg2)" }}>
                <span style={{ flex: 1, fontSize: 11, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.email}>
                  {m.email.split("@")[0]}
                </span>
                <span style={{ fontSize: 10, color: "var(--tx3)", fontVariantNumeric: "tabular-nums" }}>
                  {m.healthyDays}/{m.scheduledDays}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, minWidth: 56, textAlign: "right", color: healthColor(m.healthPct), fontVariantNumeric: "tabular-nums" }}>
                  {fmtPct(m.healthPct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
