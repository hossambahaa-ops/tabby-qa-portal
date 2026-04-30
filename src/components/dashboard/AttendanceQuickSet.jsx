// One-click "mark today" toggle for QAs on the dashboard. Sets P
// (Present/in-office) or H (WFH) for today's date — same upsert path
// the Schedule page uses, so it appears in the calendar grid
// immediately. P/H aren't APPROVAL_CODES so no lead approval needed;
// the row is auto-approved by the QA themselves.
//
// Placed in the welcome banner so it's the first thing a QA sees on
// login. Doesn't show for leads/supervisors/admins (they have their
// own edit affordances on the Schedule page).
import React, { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";

export default function AttendanceQuickSet({ myEmail, todayAttendance, token, globalToast }) {
  const todayStr = new Date().toISOString().split("T")[0];
  const propStatus = todayAttendance?.find(a => a.email?.toLowerCase() === myEmail)?.status || null;
  const [localStatus, setLocalStatus] = useState(propStatus);
  const [submitting, setSubmitting] = useState(false);

  // Sync local state when the dashboard refreshes the underlying data
  useEffect(() => { setLocalStatus(propStatus); }, [propStatus]);

  const setStatus = async (status) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON,
          "Authorization": `Bearer ${token}`,
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          email: myEmail,
          date: todayStr,
          status,
          approval_status: null,
          approved_by: myEmail,
          approved_at: new Date().toISOString(),
          created_by: myEmail,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setLocalStatus(status);
      globalToast?.("success", `Marked today as ${status === "P" ? "Present (in office)" : "WFH"}`);
    } catch (e) {
      globalToast?.("error", e?.message || "Failed to mark attendance");
    }
    setSubmitting(false);
  };

  const base = {
    padding: "8px 14px",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
    cursor: submitting ? "wait" : "pointer",
    fontFamily: "var(--font)",
    transition: "all .2s",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    gap: 5,
  };
  const inactive = {
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.06)",
    color: "#fff",
  };
  const activeP = {
    border: "1px solid rgba(34,197,94,.45)",
    background: "rgba(34,197,94,.18)",
    color: "#4ADE80",
  };
  const activeH = {
    border: "1px solid rgba(96,165,250,.45)",
    background: "rgba(96,165,250,.18)",
    color: "#93C5FD",
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,.55)", fontWeight: 500, marginRight: 2 }}>
        Today:
      </span>
      <button
        onClick={() => setStatus("P")}
        disabled={submitting}
        title="Mark today as Present (in office)"
        style={{ ...base, ...(localStatus === "P" ? activeP : inactive) }}
      >
        {localStatus === "P" && <span style={{ fontSize: 11 }}>✓</span>}
        Office
      </button>
      <button
        onClick={() => setStatus("H")}
        disabled={submitting}
        title="Mark today as Work from Home"
        style={{ ...base, ...(localStatus === "H" ? activeH : inactive) }}
      >
        {localStatus === "H" && <span style={{ fontSize: 11 }}>✓</span>}
        WFH
      </button>
      {localStatus && localStatus !== "P" && localStatus !== "H" && (
        <span
          title={`Today is set to ${localStatus} — clicking Office/WFH will replace it`}
          style={{ fontSize: 10, color: "rgba(255,255,255,.55)", marginLeft: 4 }}
        >
          (set: {localStatus})
        </span>
      )}
    </div>
  );
}
