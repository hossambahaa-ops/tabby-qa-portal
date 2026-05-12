import React, { useEffect, useMemo, useState } from "react";
import { sb } from "../../lib/supabase.js";
import { hasRole } from "../../lib/constants.js";
import { useApp } from "../../lib/AppContext.jsx";
import { nameFromEmail } from "../../lib/utils.js";
import { loadTeamForViewer } from "../../lib/teamScope.js";

// CoachingCadenceCard — Lead+ widget that answers "has every QA on
// my team had their WPR this week and their MPR this month?"
//
// Replaces the old OwedCoachingsCard ("not coached in 30 days") with
// the cadence-aware version: the denominator is the team, the
// numerator is "QAs who got the right session in the right window",
// the result is X/N + a percentage + a list of who's still owed.
//
// Period rules (per scoping discussion with Hossam):
//   * WPR window:  current Sun → Thu (Riyadh, Tabby work week)
//   * MPR window:  current calendar month (Riyadh)
//   * Late backfill counts retroactively — once a session for the
//     period exists, that QA shows as done.
//
// Denominator rules:
//   * For Lead viewers: every QA whose manager_email = me.
//   * For Supervisor+ viewers: walks teams.supervisor_id via
//     loadTeamForViewer so the count rolls up across all the leads
//     reporting to them, and the per-lead breakdown is shown below
//     the headline ratios.
//   * QAs on full-period leave are excluded from the denominator.
//     Heuristic: every working day in the period has an explicit
//     leave status (AL / Paid SL / Sick / X). QAs with no attendance
//     row at all stay in the denominator (we don't know they were
//     out, so we assume they weren't).
//
// One progress bar per period + a single "still owed" scrollable
// list at the bottom. For Supervisor+, an extra "by lead" breakdown
// table sits above the list.

const LEAVE_STATUSES = new Set(["AL", "Paid SL", "Sick", "Sick Leave", "X"]);

// Riyadh-local YYYY-MM-DD for a given Date.
function riyadhDateStr(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
// Return [weekStartIso, weekEndIso] for the most-recent Sun-Thu range
// (inclusive both ends). When called on Sun-Thu we get the current
// week; on Fri/Sat we get the week that just ended.
function weekRangeRiyadh() {
  const todayStr = riyadhDateStr(new Date());
  // Build a noon-Riyadh Date so day-of-week math is stable.
  const today = new Date(todayStr + "T12:00:00+03:00");
  const dow = today.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const start = new Date(today);
  start.setDate(start.getDate() - dow); // back to Sunday (or stay on Sunday)
  const end = new Date(start);
  end.setDate(start.getDate() + 4); // Sunday + 4 = Thursday
  return [riyadhDateStr(start), riyadhDateStr(end)];
}
// Return [monthStartIso, monthEndIso] for the current calendar month
// in Riyadh.
function monthRangeRiyadh() {
  const todayStr = riyadhDateStr(new Date());
  const [y, m] = todayStr.split("-");
  const start = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate(); // last day of month
  const end = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return [start, end];
}
// Enumerate all dates in [startIso, endIso] inclusive.
function datesBetween(startIso, endIso) {
  const out = [];
  const a = new Date(startIso + "T12:00:00Z");
  const b = new Date(endIso + "T12:00:00Z");
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
// Filter an iso-date list to Sun-Thu only (Tabby work week).
function workingDays(dateIsoList) {
  return dateIsoList.filter(iso => {
    const dow = new Date(iso + "T12:00:00Z").getUTCDay();
    return dow >= 0 && dow <= 4; // 0=Sun..4=Thu
  });
}
// Which week of the calendar month does the Sunday `weekStartIso`
// fall in? 1, 2, 3, 4, or 5 (months can have a partial 5th week).
// The Tabby cadence rule (per Hossam): weeks 1-3 = WPR, week 4+ = MPR.
// So in week 4 the team owes an MPR for that week — not a WPR.
function weekOfMonth(weekStartIso) {
  const day = parseInt(weekStartIso.split("-")[2], 10);
  return Math.ceil(day / 7);
}

export default function CoachingCadenceCard() {
  const { token, profile, globalToast } = useApp();
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSupervisor = hasRole(profile?.role, "qa_supervisor");
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState([]);
  const [wprDone, setWprDone] = useState(new Set());
  const [mprDone, setMprDone] = useState(new Set());
  const [wprExcluded, setWprExcluded] = useState(new Set());
  const [mprExcluded, setMprExcluded] = useState(new Set());
  const [showLeadBreakdown, setShowLeadBreakdown] = useState(false);
  const [periods] = useState(() => {
    const [wStart, wEnd] = weekRangeRiyadh();
    const [mStart, mEnd] = monthRangeRiyadh();
    const wkOfMonth = weekOfMonth(wStart);
    // Cadence rule (per Hossam):
    //   Week 1 → MPR (covers the PRIOR month's performance)
    //   Week 2 → WPR (#1 of this month)
    //   Week 3 → WPR (#2 of this month)
    //   Week 4+ → MPR (covers THIS month's performance)
    // So MPR weeks are 1, 4, 5; WPR weeks are 2, 3.
    const cadenceType = (wkOfMonth === 1 || wkOfMonth >= 4) ? "MPR" : "WPR";
    // Human-readable explanation of which MPR cycle this week
    // belongs to — matters in week 1 because the MPR there reviews
    // the prior month, not the current one.
    const mprCovers = wkOfMonth === 1 ? "prior month" : "this month";
    return { wStart, wEnd, mStart, mEnd, wkOfMonth, cadenceType, mprCovers };
  });

  useEffect(() => {
    if (!token || !isLead || !profile?.email) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // 1. Effective team for this viewer.
        const t = (await loadTeamForViewer({ token, profile })).filter(r => r.email);
        if (cancelled) return;
        setTeam(t);
        if (t.length === 0) { setLoading(false); return; }

        const teamEmails = t.map(r => r.email.toLowerCase());
        const inList = teamEmails.map(e => `"${e}"`).join(",");

        // 2. Pull all coaching sessions in this calendar month — covers
        //    both the WPR week (subset of month) and the MPR month.
        const sessions = await sb.query("coaching_sessions", {
          token,
          select: "qa_email,session_date,meeting_type",
          filters: `qa_email=in.(${inList})&session_date=gte.${periods.mStart}&session_date=lte.${periods.mEnd}&order=session_date.desc`,
        }).catch(() => []);
        // Both cadence sets are now scoped to THIS WEEK's date range.
        // Week 1's MPR (which covers the prior month) is conducted IN
        // week 1 of the new month, so its session_date sits in the
        // current week range — same check works for it as for the
        // week-4 MPR. That's intentional: the cadence card just asks
        // "was the right TYPE of session held in this week?"
        const wprSet = new Set();
        const mprSet = new Set();
        for (const s of (Array.isArray(sessions) ? sessions : [])) {
          const em = (s.qa_email || "").toLowerCase();
          const inWeek = s.session_date >= periods.wStart && s.session_date <= periods.wEnd;
          if (!inWeek) continue;
          if (s.meeting_type === "weekly_1on1") wprSet.add(em);
          if (s.meeting_type === "performance_review") mprSet.add(em);
        }

        // 3. Pull attendance for the same month so we can exclude
        //    members on full-period leave from the denominator.
        const att = await sb.query("qa_attendance", {
          token,
          select: "email,date,status,planned_code",
          filters: `email=in.(${inList})&date=gte.${periods.mStart}&date=lte.${periods.mEnd}`,
        }).catch(() => []);
        // Build per-member status map: email -> { iso: status }
        const byMember = new Map();
        for (const a of (Array.isArray(att) ? att : [])) {
          const em = (a.email || "").toLowerCase();
          if (!byMember.has(em)) byMember.set(em, {});
          byMember.get(em)[a.date] = a.status || a.planned_code;
        }
        // Exclusion = every working day in the period has a leave status.
        // Members with NO row for any day stay in the denominator
        // (we don't infer absence from missing data).
        const wprWorkingDays = workingDays(datesBetween(periods.wStart, periods.wEnd));
        const mprWorkingDays = workingDays(datesBetween(periods.mStart, periods.mEnd));
        const isFullyOnLeave = (em, days) => {
          const map = byMember.get(em);
          if (!map) return false;
          let leaveCount = 0, attendedCount = 0;
          for (const d of days) {
            const s = map[d];
            if (s == null) continue;
            if (LEAVE_STATUSES.has(s)) leaveCount++;
            else if (s === "P" || s === "H" || s === "OT") attendedCount++;
          }
          return attendedCount === 0 && leaveCount > 0;
        };
        const wprExcl = new Set();
        const mprExcl = new Set();
        for (const em of teamEmails) {
          if (isFullyOnLeave(em, wprWorkingDays)) wprExcl.add(em);
          if (isFullyOnLeave(em, mprWorkingDays)) mprExcl.add(em);
        }

        if (!cancelled) {
          setWprDone(wprSet);
          setMprDone(mprSet);
          setWprExcluded(wprExcl);
          setMprExcluded(mprExcl);
          setLoading(false);
        }
      } catch (e) {
        console.error("CoachingCadenceCard:", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, isLead, profile?.email, periods.wStart, periods.mStart]);

  // Headline numbers: ONE primary cadence per week. In weeks 1-3 the
  // team owes a WPR; in week 4+ they owe an MPR. The other cadence is
  // shown as a small informational sub-line below ("month so far"),
  // not as a parallel bar — that was confusing because it implied
  // both were due in parallel.
  const stats = useMemo(() => {
    const teamLower = team.map(r => r.email.toLowerCase());
    const isMpr = periods.cadenceType === "MPR";
    const doneSet = isMpr ? mprDone : wprDone;
    const exclSet = isMpr ? mprExcluded : wprExcluded;
    const denom = teamLower.filter(em => !exclSet.has(em));
    const num = denom.filter(em => doneSet.has(em)).length;
    const pct = denom.length > 0 ? Math.round((num / denom.length) * 100) : 0;
    const owed = team.filter(r => {
      const em = r.email.toLowerCase();
      return !exclSet.has(em) && !doneSet.has(em);
    });
    // Month-so-far sub-line numbers (informational, not gating).
    const wprMonthCount = teamLower.filter(em => wprDone.has(em)).length; // QAs who got at least one WPR this month
    const mprMonthCount = teamLower.filter(em => mprDone.has(em)).length;
    return { num, denom: denom.length, pct, owed, wprMonthCount, mprMonthCount };
  }, [team, wprDone, mprDone, wprExcluded, mprExcluded, periods.cadenceType]);

  // Per-lead breakdown for Supervisor+. Now built around the single
  // active cadence for this week (WPR or MPR depending on week of
  // month) so the table column makes sense — no more "WPR / MPR"
  // double column where one half is misleading.
  const byLead = useMemo(() => {
    if (!isSupervisor) return [];
    const isMpr = periods.cadenceType === "MPR";
    const doneSet = isMpr ? mprDone : wprDone;
    const exclSet = isMpr ? mprExcluded : wprExcluded;
    const groups = new Map();
    for (const r of team) {
      const lead = (r.manager_email || "(unassigned)").toLowerCase();
      if (!groups.has(lead)) groups.set(lead, { lead, members: [] });
      groups.get(lead).members.push(r);
    }
    return [...groups.values()].map(g => {
      const ems = g.members.map(m => m.email.toLowerCase());
      const den = ems.filter(em => !exclSet.has(em));
      const num = den.filter(em => doneSet.has(em)).length;
      return {
        lead: g.lead,
        members: g.members.length,
        num, den: den.length,
        pct: den.length ? Math.round(num / den.length * 100) : 0,
      };
    }).sort((a, b) => a.pct - b.pct); // worst first so behind-leads pop
  }, [team, wprDone, mprDone, wprExcluded, mprExcluded, isSupervisor, periods.cadenceType]);

  // Still-owed list = QAs owed for THIS WEEK's required cadence only.
  // Sorted alphabetically. NOTE: this hook must sit alongside the
  // others, before any conditional early returns, or React throws
  // #310 (rendered different number of hooks).
  const owedRows = useMemo(() => {
    return [...stats.owed].sort((a, b) => nameFromEmail(a.email).localeCompare(nameFromEmail(b.email)));
  }, [stats]);

  if (!isLead) return null;
  if (loading) return null;
  if (team.length === 0) return null;

  const goLogCoaching = (memberEmail) => {
    window.dispatchEvent(new CustomEvent("navigate", { detail: "quality" }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("qc-tab", { detail: "coaching" }));
      if (memberEmail) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("prefill-coaching", { detail: { emails: [memberEmail] } }));
        }, 300);
      }
    }, 200);
  };

  // Pretty bar for one period.
  const periodRow = (label, sub, num, den, pct, owedCount) => {
    const tone = pct >= 90 ? "var(--green)" : pct >= 70 ? "var(--accent-text)" : pct >= 50 ? "var(--amber)" : "var(--red)";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px dashed var(--bd2)" }}>
        <div style={{ flex: "0 0 90px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)" }}>{label}</div>
          <div style={{ fontSize: 10, color: "var(--tx3)" }}>{sub}</div>
        </div>
        <div style={{ flex: 1, position: "relative", height: 10, background: "var(--bg)", borderRadius: 6, overflow: "hidden", border: "1px solid var(--bd2)" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: tone, transition: "width .25s" }} />
        </div>
        <div style={{ flex: "0 0 110px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: tone }}>{num}/{den}</span>
          <span style={{ fontSize: 11, color: "var(--tx3)", marginLeft: 6 }}>{pct}%</span>
          {owedCount > 0 && <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{owedCount} owed</div>}
        </div>
      </div>
    );
  };

  const wprWindow = `${new Date(periods.wStart + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(periods.wEnd + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  const mprMonth = new Date(periods.mStart + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const isMprWeek = periods.cadenceType === "MPR";
  // Cadence-specific colour scheme so the active session type is
  // visually distinct (amber for WPR, red for MPR).
  const cadenceTone = isMprWeek ? "var(--red)" : "var(--amber)";
  const cadenceBg   = isMprWeek ? "var(--red-bg)" : "var(--amber-bg)";
  // Total leave-excluded count for the active cadence.
  const leaveExcluded = isMprWeek ? mprExcluded.size : wprExcluded.size;
  // Active percentage tone.
  const pctTone = stats.pct >= 90 ? "var(--green)" : stats.pct >= 70 ? "var(--accent-text)" : stats.pct >= 50 ? "var(--amber)" : "var(--red)";

  return (
    <div className="card" style={{ marginBottom: 16, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-.2px" }}>📅 Coaching cadence</span>
        <span style={{ fontSize: 11, color: "var(--tx3)" }}>
          {team.length} member{team.length === 1 ? "" : "s"}
          {leaveExcluded > 0 ? ` · ${leaveExcluded} on leave excluded` : ""}
        </span>
      </div>

      {/* What's required this week. The badge tells the user the
          rule at a glance: in week 1 → MPR (prior month), weeks 2-3
          → WPR, week 4+ → MPR (this month). */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, padding: "8px 12px", background: cadenceBg, borderRadius: 8, border: `1px solid ${cadenceTone}33` }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: cadenceTone, letterSpacing: ".3px", padding: "2px 8px", background: "var(--bg3)", borderRadius: 4, border: `1px solid ${cadenceTone}55` }}>
          WEEK {periods.wkOfMonth} of {mprMonth.split(" ")[0]}
        </span>
        <span style={{ fontSize: 12, color: "var(--tx)", fontWeight: 600 }}>
          {periods.cadenceType} required this week
        </span>
        <span style={{ fontSize: 11, color: "var(--tx3)" }}>
          ({wprWindow}{isMprWeek ? ` · covers ${periods.mprCovers}` : ""})
        </span>
      </div>

      {/* Single progress bar for the active cadence. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <div style={{ flex: 1, position: "relative", height: 14, background: "var(--bg)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--bd2)" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${stats.pct}%`, background: pctTone, transition: "width .25s" }} />
        </div>
        <div style={{ flex: "0 0 auto", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: pctTone }}>{stats.num}/{stats.denom}</span>
          <span style={{ fontSize: 12, color: "var(--tx3)", marginLeft: 6 }}>{stats.pct}%</span>
        </div>
      </div>
      {stats.owed.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 4 }}>
          {stats.owed.length} member{stats.owed.length === 1 ? "" : "s"} still owe a {periods.cadenceType} this week.
        </div>
      )}

      {/* Per-lead breakdown for supervisors+. Single column showing
          this week's required cadence (renames table column based on
          whether we're in a WPR or MPR week). */}
      {isSupervisor && byLead.length > 1 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowLeadBreakdown(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--tabby-purple)", fontWeight: 600, padding: "4px 0", fontFamily: "var(--font)" }}
          >
            {showLeadBreakdown ? "▼" : "▶"} By lead ({byLead.length})
          </button>
          {showLeadBreakdown && (
            <div style={{ marginTop: 6, border: "1px solid var(--bd2)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--bg)" }}>
                    <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "var(--tx3)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".4px" }}>Lead</th>
                    <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "var(--tx3)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".4px" }}>QAs</th>
                    <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "var(--tx3)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".4px" }}>{periods.cadenceType} done</th>
                  </tr>
                </thead>
                <tbody>
                  {byLead.map(g => {
                    const tone = g.pct >= 90 ? "var(--green)" : g.pct >= 70 ? "var(--accent-text)" : g.pct >= 50 ? "var(--amber)" : "var(--red)";
                    return (
                      <tr key={g.lead} style={{ borderTop: "1px solid var(--bd2)" }}>
                        <td style={{ padding: "5px 10px", fontWeight: 500 }}>{nameFromEmail(g.lead)}</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.members}</td>
                        <td style={{ padding: "5px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: tone, fontWeight: 600 }}>
                          {g.num}/{g.den}
                          <span style={{ fontWeight: 400, color: "var(--tx3)", fontSize: 10, marginLeft: 4 }}>({g.pct}%)</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Still-owed list — full, scrollable. Only shows QAs missing
          this week's required session type. */}
      {owedRows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6 }}>
            Still owe a {periods.cadenceType} ({owedRows.length})
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--bd2)", borderRadius: 8 }}>
            {owedRows.map(r => (
              <div
                key={r.email}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--bd2)", fontSize: 12 }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                  {nameFromEmail(r.email)}
                  <span style={{ color: "var(--tx3)", marginLeft: 6, fontSize: 11 }}>{r.email.split("@")[0]}</span>
                </span>
                <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, background: cadenceBg, color: cadenceTone, fontWeight: 700 }}>{periods.cadenceType}</span>
                <button
                  onClick={() => goLogCoaching(r.email)}
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: 10, padding: "3px 8px" }}
                  title={`Log a ${periods.cadenceType} for ${nameFromEmail(r.email)}`}
                >Log →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {owedRows.length === 0 && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "var(--green-bg)", color: "var(--green)", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <span>✅</span> All caught up — every member has their {periods.cadenceType} for this week.
        </div>
      )}
    </div>
  );
}
