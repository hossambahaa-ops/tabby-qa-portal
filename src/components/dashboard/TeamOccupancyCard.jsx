import React, { useEffect, useMemo, useState } from "react";
import { sb } from "../../lib/supabase.js";
import { hasRole } from "../../lib/constants.js";
import { useApp } from "../../lib/AppContext.jsx";
import { nameFromEmail } from "../../lib/utils.js";
import { listTeamTargets } from "../../api/teamTargets.js";

// Compact "Team occupancy" view for QA Lead+. Shows each direct
// report's most-recent occupancy and what it would become if their
// pending side-task minutes get approved.
//
// Same projection formula EvalHistory uses on the per-QA Daily card:
//   projected = current + (pending_side_minutes / shift_minutes × 100)
//
// Shift minutes default to 8 h × 60 = 480, but team_targets'
// daily_working_hours overrides per QA / queue / domain (the same
// resolution chain EvalHistory uses).
//
// Renders nothing for non-leads or when the team has no recent
// productivity_history rows.

const DEFAULT_SHIFT_MIN = 480;
const LOOKBACK_DAYS = 7;

const occColor = (pct) => {
  if (pct >= 90) return "var(--green)";
  if (pct >= 75) return "var(--accent-text)";
  if (pct >= 60) return "var(--amber)";
  return "var(--red)";
};

export default function TeamOccupancyCard() {
  const { token, profile } = useApp();
  const isLead = hasRole(profile?.role, "qa_lead");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [sortBy, setSortBy] = useState("projected"); // current | projected | delta | name

  useEffect(() => {
    if (!token || !isLead || !profile?.email) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const myEmail = profile.email.toLowerCase();
        // 1. The lead's direct reports (case-insensitive match on
        //    manager_email so "tabby.ai" / "tabby.sa" mixed case works).
        const roster = await sb.query("qa_roster", {
          token,
          select: "email,display_name,queue,manager_email",
          filters: `manager_email=ilike.${myEmail}`,
        }).catch(() => []);
        const team = (Array.isArray(roster) ? roster : []).filter(r => r.email);
        if (team.length === 0) { if (!cancelled) setLoading(false); return; }
        const teamEmails = team.map(r => r.email.toLowerCase());
        const teamMap = new Map(team.map(r => [r.email.toLowerCase(), r]));

        // 2. Latest productivity_history row per QA in the last 7 days
        //    (one round trip; reduce client-side).
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - LOOKBACK_DAYS);
        const isoFrom = fromDate.toISOString().split("T")[0];
        const inList = teamEmails.map(e => `"${e}"`).join(",");
        const phRows = await sb.query("productivity_history", {
          token,
          select: "qa_email,date,occupancy_pct,pending_side_minutes,side_task_minutes",
          filters: `qa_email=in.(${inList})&date=gte.${isoFrom}&order=date.desc`,
        }).catch(() => []);
        const latestPerQa = new Map();
        for (const r of (Array.isArray(phRows) ? phRows : [])) {
          const k = (r.qa_email || "").toLowerCase();
          if (!latestPerQa.has(k)) latestPerQa.set(k, r);
        }

        // 3. Team-targets (daily_working_hours per QA / queue / Default).
        //    Same resolution chain EvalHistory uses so projections align.
        const targets = await listTeamTargets({ token }).catch(() => []);
        const findShiftMin = (email, queue) => {
          const lower = (email || "").toLowerCase();
          const dom = lower.split("@")[1] || "";
          const all = (Array.isArray(targets) ? targets : []).filter(t => t.metric === "daily_working_hours");
          const qa  = all.find(t => (t.qa_email || "").toLowerCase() === lower);
          if (qa?.target_value) return Number(qa.target_value) * 60;
          const find = (team, dm) => all.find(t => !t.qa_email && t.team_name === team && t.domain === dm);
          const tgt = find(queue, dom) || find(queue, "all") || find("Default", dom) || find("Default", "all");
          return tgt?.target_value ? Number(tgt.target_value) * 60 : DEFAULT_SHIFT_MIN;
        };

        // 4. Build the per-QA row with current + projected occupancy.
        const out = team.map(r => {
          const lower = r.email.toLowerCase();
          const ph = latestPerQa.get(lower);
          const shiftMin = findShiftMin(r.email, r.queue);
          if (!ph) return {
            email: r.email, display_name: r.display_name, name: nameFromEmail(r.email),
            date: null, current: null, pendingMin: 0, projected: null, delta: null, shiftMin,
          };
          const current = Number(ph.occupancy_pct ?? 0);
          const pendingMin = Number(ph.pending_side_minutes || 0);
          const lift = shiftMin > 0 ? (pendingMin / shiftMin) * 100 : 0;
          const projected = current + lift;
          return {
            email: r.email, display_name: r.display_name, name: nameFromEmail(r.email),
            date: ph.date, current, pendingMin, projected, delta: lift, shiftMin,
          };
        });

        if (!cancelled) {
          setRows(out);
          setLoading(false);
        }
      } catch (e) {
        console.error("TeamOccupancyCard:", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, isLead, profile?.email]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      // Members with no recent data always go last so sortable columns
      // don't put nulls above real data.
      const aNull = a.current == null, bNull = b.current == null;
      if (aNull && !bNull) return 1;
      if (!aNull && bNull) return -1;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const av = Number(a[sortBy] || 0), bv = Number(b[sortBy] || 0);
      return bv - av; // desc
    });
    return arr;
  }, [rows, sortBy]);

  if (!isLead) return null;
  if (loading) return null;
  if (rows.length === 0) return null;

  const withData = rows.filter(r => r.current != null);
  const avgCurrent = withData.length > 0 ? withData.reduce((s, r) => s + r.current, 0) / withData.length : 0;
  const avgProjected = withData.length > 0 ? withData.reduce((s, r) => s + r.projected, 0) / withData.length : 0;
  const totalPendingMin = withData.reduce((s, r) => s + r.pendingMin, 0);
  const totalLift = avgProjected - avgCurrent;

  const sortHeader = (key, label, align = "right") => (
    <th
      onClick={() => setSortBy(key)}
      style={{ textAlign: align, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      title={`Sort by ${label}`}
    >
      <span style={{ color: sortBy === key ? "var(--tabby-purple)" : undefined }}>
        {label}{sortBy === key ? " ▼" : ""}
      </span>
    </th>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span className="card-title">Team occupancy · {rows.length} member{rows.length === 1 ? "" : "s"}</span>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--tx2)", alignItems: "center" }}>
          <span><span style={{ color: "var(--tx3)" }}>Avg now: </span><strong style={{ color: occColor(avgCurrent) }}>{avgCurrent.toFixed(1)}%</strong></span>
          <span><span style={{ color: "var(--tx3)" }}>If approved: </span><strong style={{ color: occColor(avgProjected) }}>{avgProjected.toFixed(1)}%</strong>{totalLift > 0.05 && <span style={{ color: "var(--green)", marginLeft: 4, fontWeight: 600 }}>+{totalLift.toFixed(1)}</span>}</span>
          {totalPendingMin > 0 && <span style={{ color: "var(--tx3)" }}>· {(totalPendingMin / 60).toFixed(1)}h pending</span>}
        </div>
      </div>
      <div className="table-wrap" style={{ padding: "0 16px 12px" }}>
        <table style={{ fontSize: 12 }}>
          <thead>
            <tr>
              {sortHeader("name", "Member", "left")}
              <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>As of</th>
              {sortHeader("current", "Current")}
              {sortHeader("pendingMin", "Pending ST")}
              {sortHeader("projected", "If approved")}
              {sortHeader("delta", "Δ")}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.email}>
                <td style={{ fontWeight: 500 }}>
                  {r.name}
                  <div style={{ fontSize: 10, color: "var(--tx3)" }}>{r.email}</div>
                </td>
                <td style={{ textAlign: "right", color: "var(--tx3)", fontSize: 11, whiteSpace: "nowrap" }}>
                  {r.date ? new Date(r.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: r.current == null ? "var(--tx3)" : occColor(r.current) }}>
                  {r.current == null ? "—" : `${r.current.toFixed(1)}%`}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.pendingMin > 0 ? "var(--amber)" : "var(--tx3)", fontWeight: r.pendingMin > 0 ? 600 : 400 }}>
                  {r.pendingMin > 0 ? `${r.pendingMin}m` : "—"}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: r.projected == null ? "var(--tx3)" : occColor(r.projected) }}>
                  {r.projected == null ? "—" : `${r.projected.toFixed(1)}%`}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: !r.delta ? "var(--tx3)" : "var(--green)", fontWeight: 600 }}>
                  {!r.delta || r.delta < 0.05 ? "—" : `+${r.delta.toFixed(1)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "0 16px 12px", fontSize: 10, color: "var(--tx3)", fontStyle: "italic" }}>
        "If approved" projects what each QA's occupancy would become if their pending side-task minutes were approved today (current occupancy + pending minutes / shift minutes × 100). Shift length resolved from team_targets.daily_working_hours, defaulting to 8 h.
      </div>
    </div>
  );
}
