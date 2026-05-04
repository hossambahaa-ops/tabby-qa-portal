import React, { useState, useEffect, useCallback } from "react";
import { sb, SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { safeError, emailsMatchLoose } from "../../lib/utils.js";
import { riyadhTodayStr, PLAN_FEATURE_START } from "../../lib/attendancePlan.js";

/**
 * <DailyCheckInWidget />
 *
 * Dashboard tile shown to QAs. Two-button check-in for today:
 *   🏠 Home   →  writes 'H' to qa_attendance.status
 *   🏢 Office →  writes 'P' to qa_attendance.status
 *
 * Reads the planned_code (set by lead) and shows it as context so the
 * QA knows what's expected. After check-in, shows the recorded value
 * with a small mismatch hint if the actual ≠ planned.
 *
 * Hidden on weekends and on dates < May 2026 (feature start).
 */
export default function DailyCheckInWidget() {
  const { token, profile, globalToast } = useApp();
  const myEmail = profile?.email?.toLowerCase() || "";
  const today = riyadhTodayStr();

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token || !myEmail) { setLoading(false); return; }
    try {
      // Pull both possible email fields and any cross-domain variant.
      const local = myEmail.split("@")[0];
      const rows = await sb.query("qa_attendance", {
        token,
        select: "id,email,date,status,planned_code,justification,mismatch_approved",
        filters: `date=eq.${today}&or=(email.ilike.${local}@%,email.eq.${myEmail})`,
      });
      const mine = (rows || []).find((r) => emailsMatchLoose(r.email, myEmail));
      setRow(mine || null);
    } catch (e) {
      console.error("DailyCheckInWidget load:", e);
    }
    setLoading(false);
  }, [token, myEmail, today]);

  useEffect(() => { load(); }, [load]);

  const checkIn = async (code) => {
    if (saving) return;
    setSaving(true);
    try {
      const body = { email: myEmail, date: today, status: code };
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${token}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(await resp.text());
      globalToast("success", `Checked in as ${code === "H" ? "🏠 Home" : "🏢 Office"}`);
      await load();
    } catch (e) {
      globalToast("error", safeError(e));
    }
    setSaving(false);
  };

  // Hide before feature start
  if (today < PLAN_FEATURE_START) return null;

  // Hide on weekends (Friday/Saturday Saudi week)
  const dow = new Date(today + "T00:00:00").getDay();
  if (dow === 5 || dow === 6) return null;

  if (loading) return null;

  const planned = row?.planned_code;
  const actual = row?.status;
  const checkedIn = actual === "H" || actual === "P";
  const isLeave = actual && !checkedIn; // any non-H/P actual = leave/holiday/etc
  const mismatch = planned && checkedIn && planned !== actual && !row?.mismatch_approved;

  // If the QA has a leave code already (AL, SL, PH, etc.), don't prompt
  // for a check-in — this is "off today."
  if (isLeave) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        padding: 14,
        borderLeft: `4px solid ${mismatch ? "var(--amber)" : checkedIn ? "var(--green)" : "var(--tabby-purple)"}`,
        background: "linear-gradient(135deg, var(--bg2) 0%, var(--bg3) 100%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)", marginBottom: 2 }}>
            {checkedIn
              ? `Checked in: ${actual === "H" ? "🏠 Home" : "🏢 Office"}`
              : "Where are you working today?"}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>
            {planned ? (
              <>
                Planned by your lead: <strong style={{ color: planned === "H" ? "var(--blue)" : "var(--green)" }}>
                  {planned === "H" ? "🏠 Home" : "🏢 Office"}
                </strong>
              </>
            ) : (
              "No plan set for today — check in with what you're doing."
            )}
            {mismatch && (
              <span style={{ marginLeft: 8, color: "var(--amber)", fontWeight: 600 }}>
                ⚠ Doesn't match your plan
              </span>
            )}
          </div>
        </div>
        {!checkedIn ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => checkIn("H")}
              disabled={saving}
              style={{ minWidth: 96, fontSize: 12 }}
            >
              🏠 Home
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => checkIn("P")}
              disabled={saving}
              style={{ minWidth: 96, fontSize: 12 }}
            >
              🏢 Office
            </button>
          </div>
        ) : (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => checkIn(actual === "H" ? "P" : "H")}
            disabled={saving}
            style={{ fontSize: 11 }}
            title="Made a mistake? Click to switch."
          >
            Switch to {actual === "H" ? "🏢 Office" : "🏠 Home"}
          </button>
        )}
      </div>
    </div>
  );
}
