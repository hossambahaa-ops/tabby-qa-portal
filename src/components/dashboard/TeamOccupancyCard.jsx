import React, { useEffect, useMemo, useState } from "react";
import { sb } from "../../lib/supabase.js";
import { hasRole } from "../../lib/constants.js";
import { useApp } from "../../lib/AppContext.jsx";
import { nameFromEmail, emailVariants } from "../../lib/utils.js";
import { listTeamTargets } from "../../api/teamTargets.js";
import { listMtd } from "../../api/mtd.js";
import { loadTeamForViewer } from "../../lib/teamScope.js";

// Compact "Team occupancy" view for QA Lead+. Shows each direct
// report's MONTH-TO-DATE average occupancy and what it would
// become if their pending side-task minutes get approved.
//
// FORMULA (Option A): current = sum(occupancy_pct over the month,
// EXCLUDING today) / mtd_scores.working_days for the same month.
// MTD's WDs reflects what the upstream sheet attributes as the QA's
// actual working days (factoring leave/off-days as best the source
// captures today). Until the in-app attendance flow is reliable,
// MTD's WDs is the most trustworthy denominator we have. Dividing
// by WDs instead of count(rows) means weekend ticket-touches add
// credit to the numerator without padding the denominator.
//
// Why exclude today: productivity_history rows for today are partial
// — a QA who's only logged the first 2 hours of their day shows up
// at ~25 % occupancy and drags the team headline number into the
// floor. WDs may include today; we just don't sum today's partial
// occupancy into the numerator.
//
// Projection formula (unchanged):
//   projected = avg_current + (pending_side_minutes / shift_minutes × 100)
//
// pending_side_minutes is a SNAPSHOT, not an accumulation — each
// day's row stores the total currently pending at that day's end.
// We take the most recent row's pending (excl today) as the source.
//
// Shift minutes default to 8 h × 60 = 480, but team_targets'
// daily_working_hours overrides per QA / queue / domain (the same
// resolution chain EvalHistory uses).
//
// View shape per role:
//   * QA Lead viewer   → flat list of their direct reports
//   * Supervisor+ viewer → lead-aggregate rows (one row per lead with
//     team avg + member count + pending), each expandable to that
//     lead's QA list. Behind-leads sort to the top (lowest projected
//     first) so the supervisor's eye lands on what's hurting.
//
// Every QA email is clickable → navigates straight to QA Profile.
//
// Renders nothing for non-leads or when the team has no recent
// productivity_history rows.

const DEFAULT_SHIFT_MIN = 480;

// Riyadh-local YYYY-MM-DD for "today" — the date we EXCLUDE from
// the month-to-date average since it's a partial day in progress.
function todayRiyadhIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
// First day of the current Riyadh month, YYYY-MM-01.
function monthStartRiyadhIso() {
  const today = todayRiyadhIso();
  return today.slice(0, 7) + "-01";
}
// Current month label in the MTD format ("May-2026"). mtd_scores keys
// on this string column for every row, so the team-occupancy card
// uses it to look up each QA's authoritative working-day count for
// the current month.
function monthLabelRiyadh() {
  const today = todayRiyadhIso();
  const [y, m] = today.split("-").map(Number);
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[m - 1]}-${y}`;
}

const occColor = (pct) => {
  if (pct >= 90) return "var(--green)";
  if (pct >= 75) return "var(--accent-text)";
  if (pct >= 60) return "var(--amber)";
  return "var(--red)";
};

const goToProfile = (qaEmail) => {
  window.location.hash = `#/profile?qa=${encodeURIComponent(qaEmail)}`;
};

export default function TeamOccupancyCard() {
  const { token, profile } = useApp();
  const isLead = hasRole(profile?.role, "qa_lead");
  const isSupervisor = hasRole(profile?.role, "qa_supervisor");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [sortBy, setSortBy] = useState("projected"); // current | projected | delta | name
  // Card-level expand toggle (the whole table block).
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem("team-occupancy-expanded") === "1"; } catch { return false; }
  });
  const toggleExpanded = () => {
    setExpanded(v => {
      try { localStorage.setItem("team-occupancy-expanded", v ? "0" : "1"); } catch {}
      return !v;
    });
  };
  // Per-lead expand state (supervisor view only). Set of lead-email
  // strings currently expanded to show their QA list.
  const [expandedLeads, setExpandedLeads] = useState(new Set());
  const toggleLead = (leadEmail) => setExpandedLeads(prev => {
    const next = new Set(prev);
    next.has(leadEmail) ? next.delete(leadEmail) : next.add(leadEmail);
    return next;
  });

  useEffect(() => {
    if (!token || !isLead || !profile?.email) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // The viewer's effective team — direct reports for leads; for
        // supervisors+ also walks one level down via teams.supervisor_id
        // so a sup sees every QA under the leads reporting to them.
        const team = (await loadTeamForViewer({ token, profile })).filter(r => r.email);
        if (team.length === 0) { if (!cancelled) setLoading(false); return; }
        const teamEmails = team.map(r => r.email.toLowerCase());

        // 2. Pull productivity_history rows from the 1st of this Riyadh
        //    month through today, then DROP today's row client-side.
        //    Server filter would need a timezone-aware "< Riyadh today"
        //    expression which PostgREST doesn't accept cleanly — easier
        //    to over-fetch by one day and discard the today row in JS.
        const todayIso = todayRiyadhIso();
        const isoFrom = monthStartRiyadhIso();
        // Expand each roster email to both @tabby.ai + @tabby.sa
        // variants so the IN.() server filter doesn't silently drop
        // cross-domain rows. Post-fetch we collapse by local-part.
        const expanded = [...new Set(teamEmails.flatMap(e => emailVariants(e)))];
        const inList = expanded.map(e => `"${e}"`).join(",");
        // Paginate so a large team late in the month can't be silently
        // truncated by PostgREST's 1000-row cap. With order=date.desc the
        // cap would drop everyone's EARLIEST days and understate the
        // month-to-date occupancy. One QA is a few dozen rows, but a
        // supervisor/manager's whole tree × 30 days can exceed 1000.
        const phRows = [];
        const PH_PAGE = 1000;
        for (let off = 0; off < 20000; off += PH_PAGE) {
          const page = await sb.query("productivity_history", {
            token,
            select: "qa_email,date,occupancy_pct,pending_side_minutes,side_task_minutes",
            filters: `qa_email=in.(${inList})&date=gte.${isoFrom}&order=date.desc,qa_email.asc&limit=${PH_PAGE}&offset=${off}`,
          }).catch(() => []);
          const arr = Array.isArray(page) ? page : [];
          phRows.push(...arr);
          if (arr.length < PH_PAGE) break;
        }
        // Group rows by QA, excluding today's date. For each QA we
        // collect every prior-day row in window so we can compute the
        // 7-day average occupancy. pending is a snapshot column, so
        // we keep the most-recent prior-day row's pending value.
        const perQa = new Map();
        for (const r of (Array.isArray(phRows) ? phRows : [])) {
          if (r.date >= todayIso) continue; // skip today's partial row
          const k = (r.qa_email || "").toLowerCase().split("@")[0];
          if (!perQa.has(k)) perQa.set(k, []);
          perQa.get(k).push(r);
        }

        // 3a. mtd_scores.working_days for this month — the denominator
        //     in the new occupancy formula. PostgREST `in.(…)` filter
        //     accepts comma-separated quoted values; we already built
        //     that string above as `inList`.
        const monthLabel = monthLabelRiyadh();
        const mtdRows = await listMtd({
          token,
          select: "qa_email,working_days",
          filters: `month=eq.${encodeURIComponent(monthLabel)}&qa_email=in.(${inList})`,
          cache: false,
        }).catch(() => []);
        const wdsByEmail = new Map();
        for (const r of (Array.isArray(mtdRows) ? mtdRows : [])) {
          const k = (r.qa_email || "").toLowerCase().split("@")[0];
          const n = Number(r.working_days);
          if (k && n > 0) wdsByEmail.set(k, n);
        }

        // 3b. Team-targets (daily_working_hours per QA / queue / Default).
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

        // 4. Build the per-QA row using the month-to-date avg occupancy
        //    (excluding today). pending is taken from the most recent
        //    prior-day row since the snapshot column stores the
        //    cumulative pending as of that day's end.
        //    Members with no prior-day rows in window are dropped.
        const out = team.map(r => {
          // perQa + wdsByEmail are now keyed by local-part so we
          // catch the cross-domain rows fetched via emailVariants.
          const lower = r.email.toLowerCase();
          const local = lower.split("@")[0];
          const rows = perQa.get(local);
          if (!rows || rows.length === 0) return null;
          const shiftMin = findShiftMin(r.email, r.queue);
          // Sum the QA's occupancy across all prior-day rows this
          // month (today already excluded above). Denominator is the
          // working_days value from mtd_scores, which captures the
          // QA's actual working days for the month (accounting for
          // leave / off-days as the source sheet records them).
          // Fallback to count(rows) when MTD hasn't reported WDs yet
          // for this QA (e.g. brand-new joiner) — same as the old
          // behavior in that edge case so the row stays meaningful.
          const occSum = rows.reduce((s, x) => s + (Number(x.occupancy_pct ?? 0)), 0);
          const wds = wdsByEmail.get(local);
          const denom = wds && wds > 0 ? wds : rows.length;
          const current = occSum / denom;
          // Most recent prior-day pending snapshot (rows are sorted
          // by date.desc from the server query above)
          const pendingMin = Number(rows[0].pending_side_minutes || 0);
          const lift = shiftMin > 0 ? (pendingMin / shiftMin) * 100 : 0;
          const projected = current + lift;
          return {
            email: r.email, display_name: r.display_name, name: nameFromEmail(r.email),
            manager_email: (r.manager_email || "").toLowerCase(),
            // Window descriptor — shown in the "As of" column. We
            // surface BOTH the productivity-data window and the WDs
            // count so the viewer can see what the math is using.
            asOfStart: rows[rows.length - 1].date,
            asOfEnd: rows[0].date,
            daysInWindow: rows.length,
            workingDays: wds || null,
            current, pendingMin, projected, delta: lift, shiftMin,
          };
        }).filter(Boolean);

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

  const sortedFlat = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      const av = Number(a[sortBy] || 0), bv = Number(b[sortBy] || 0);
      return bv - av; // desc
    });
    return arr;
  }, [rows, sortBy]);

  // Lead-level aggregation for supervisor+ view. Each group = one
  // lead's QAs, with team averages + total pending. Sorted by lowest
  // projected occupancy first so the lead in trouble is on top.
  const groupedByLead = useMemo(() => {
    if (!isSupervisor) return [];
    const groups = new Map();
    for (const r of rows) {
      const key = r.manager_email || "(unassigned)";
      if (!groups.has(key)) groups.set(key, { lead: key, members: [] });
      groups.get(key).members.push(r);
    }
    return [...groups.values()].map(g => {
      const n = g.members.length;
      const avgCurrent = n > 0 ? g.members.reduce((s, m) => s + m.current, 0) / n : 0;
      const avgProjected = n > 0 ? g.members.reduce((s, m) => s + m.projected, 0) / n : 0;
      const totalPending = g.members.reduce((s, m) => s + (m.pendingMin || 0), 0);
      const withPending = g.members.filter(m => m.pendingMin > 0).length;
      // Sort each group's members by projected desc for the nested view.
      const members = [...g.members].sort((a, b) => b.projected - a.projected);
      return { lead: g.lead, members, count: n, avgCurrent, avgProjected, totalPending, withPending, delta: avgProjected - avgCurrent };
    }).sort((a, b) => a.avgProjected - b.avgProjected); // behind-leads first
  }, [rows, isSupervisor]);

  // Card-level overall stats — the headline numbers in the header.
  const overall = useMemo(() => {
    const n = rows.length;
    const avgCurrent = n > 0 ? rows.reduce((s, r) => s + r.current, 0) / n : 0;
    const avgProjected = n > 0 ? rows.reduce((s, r) => s + r.projected, 0) / n : 0;
    const withPending = rows.filter(r => r.pendingMin > 0).length;
    return { count: n, avgCurrent, avgProjected, withPending };
  }, [rows]);

  if (!isLead) return null;
  if (loading) return null;
  if (rows.length === 0) return null;

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

  // Renders one QA row. Same shape used in both flat (lead) and
  // nested (supervisor → lead → QA) views. Email is the primary
  // label — display-name guesses were unreliable per Hossam, and
  // the email is the stable identifier. Clicking opens that QA's
  // profile.
  const fmtShortDate = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
  const qaRow = (r, opts = {}) => (
    <tr key={r.email} style={opts.indent ? { background: "rgba(106,44,121,0.04)" } : undefined}>
      <td style={{ fontWeight: 500, paddingLeft: opts.indent ? 24 : undefined }}>
        <button
          onClick={() => goToProfile(r.email)}
          title={`Open ${r.email}'s QA Profile`}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: "var(--tabby-purple)", fontFamily: "var(--font)", fontSize: 12,
            fontWeight: 600, textAlign: "left", textDecoration: "underline",
            textDecorationColor: "transparent", textUnderlineOffset: 2, transition: "text-decoration-color var(--d1)",
          }}
          onMouseEnter={e => e.currentTarget.style.textDecorationColor = "var(--tabby-purple)"}
          onMouseLeave={e => e.currentTarget.style.textDecorationColor = "transparent"}
        >{r.email}</button>
      </td>
      <td style={{ textAlign: "right", color: "var(--tx3)", fontSize: 11, whiteSpace: "nowrap" }}
          title={r.asOfStart && r.asOfEnd ? `Window: ${r.asOfStart} → ${r.asOfEnd} · ${r.daysInWindow} days` : ""}>
        {r.asOfEnd ? `${fmtShortDate(r.asOfStart)} – ${fmtShortDate(r.asOfEnd)}` : "—"}
      </td>
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: occColor(r.current) }}>
        {`${r.current.toFixed(1)}%`}
      </td>
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.pendingMin > 0 ? "var(--amber)" : "var(--tx3)", fontWeight: r.pendingMin > 0 ? 600 : 400 }}>
        {r.pendingMin > 0 ? `${r.pendingMin}m` : "—"}
      </td>
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: occColor(r.projected) }}>
        {`${r.projected.toFixed(1)}%`}
      </td>
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: !r.delta ? "var(--tx3)" : "var(--green)", fontWeight: 600 }}>
        {!r.delta || r.delta < 0.05 ? "—" : `+${r.delta.toFixed(1)}`}
      </td>
    </tr>
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        className="card-header"
        onClick={toggleExpanded}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
        title={expanded ? "Click to collapse" : "Click to expand"}
      >
        <span className="card-title">
          Team occupancy · {overall.count} member{overall.count === 1 ? "" : "s"}
          <span style={{ marginLeft: 10, fontWeight: 500, fontSize: 12, color: occColor(overall.avgProjected) }}>
            avg {overall.avgCurrent.toFixed(1)}% → {overall.avgProjected.toFixed(1)}%
          </span>
          {overall.withPending > 0 ? <span style={{ color: "var(--amber)", fontWeight: 500, marginLeft: 8 }}> · {overall.withPending} with pending ST</span> : null}
        </span>
        <span style={{ color: "var(--tx3)", fontSize: 12, marginLeft: 12 }}>{expanded ? "▼" : "▶"}</span>
      </div>
      {expanded && (
        <>
          {/* SUPERVISOR VIEW — grouped by lead. Each lead row shows
              team-level aggregates and is clickable to expand the
              nested QA rows. */}
          {isSupervisor ? (
            <div className="table-wrap" style={{ padding: "0 16px 12px" }}>
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", whiteSpace: "nowrap" }}>Lead / Member</th>
                    <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>As of</th>
                    <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Current</th>
                    <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Pending ST</th>
                    <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>If approved</th>
                    <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByLead.map(g => {
                    const isOpen = expandedLeads.has(g.lead);
                    return (
                      <React.Fragment key={g.lead}>
                        <tr
                          onClick={() => toggleLead(g.lead)}
                          style={{ cursor: "pointer", background: "var(--bg)", borderTop: "2px solid var(--bd2)" }}
                          title={isOpen ? "Click to collapse this team" : "Click to see members"}
                        >
                          <td style={{ fontWeight: 700 }}>
                            <span style={{ display: "inline-block", width: 14, color: "var(--tx3)", fontSize: 10 }}>{isOpen ? "▼" : "▶"}</span>
                            {g.lead}
                            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--tx3)", fontWeight: 500 }}>{g.count} QA{g.count === 1 ? "" : "s"}</span>
                          </td>
                          <td style={{ textAlign: "right", color: "var(--tx3)", fontSize: 11 }}>—</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: occColor(g.avgCurrent) }}>
                            {`${g.avgCurrent.toFixed(1)}%`}
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: g.totalPending > 0 ? "var(--amber)" : "var(--tx3)", fontWeight: g.totalPending > 0 ? 700 : 400 }}>
                            {g.totalPending > 0 ? `${g.totalPending}m${g.withPending > 1 ? ` · ${g.withPending}` : ""}` : "—"}
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800, color: occColor(g.avgProjected) }}>
                            {`${g.avgProjected.toFixed(1)}%`}
                          </td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: !g.delta ? "var(--tx3)" : "var(--green)", fontWeight: 600 }}>
                            {!g.delta || g.delta < 0.05 ? "—" : `+${g.delta.toFixed(1)}`}
                          </td>
                        </tr>
                        {isOpen && g.members.map(m => qaRow(m, { indent: true }))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // LEAD VIEW — flat sortable table of their direct reports.
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
                  {sortedFlat.map(r => qaRow(r))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: "0 16px 12px", fontSize: 10, color: "var(--tx3)", fontStyle: "italic" }}>
            "Current" = SUM of each QA's daily occupancy from the 1st of this month through yesterday, divided by their <b>working_days from MTD</b> for the month. This is the closest honest answer until the in-app attendance flow ships — MTD's working-days count already accounts for off-days / leave, so weekend ticket-touches add credit to the numerator without padding the denominator. Today's partial day is excluded from the sum. "If approved" adds pending side-task minutes on top (pending / shift × 100). Shift length resolved from team_targets.daily_working_hours, defaulting to 8 h. Click any email to open their profile.
          </div>
        </>
      )}
    </div>
  );
}
