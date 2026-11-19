import React, { useState, useEffect, useMemo } from "react";
import { listWfmShiftDays, listPulseAttendance, listLongLeave } from "../api/wfm.js";
import { listRoster } from "../api/roster.js";
import { nameFromEmail } from "../lib/utils.js";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { useApp } from "../lib/AppContext.jsx";

// ── WFM Report panel (work in progress) ─────────────────────────────────
// Brings the Metabase "WFM Report (ex. Attendance) (dubai time)" into
// Pulse. Gated to super_admin while the numbers are being signed off.
//
// Two deliberate design rules, both from how the source behaves:
//
//  • NSNC is shown until the WFM REPORT stops reporting it, not until
//    someone ticks it off here. The alert clearing is therefore evidence
//    that the CRM was actually corrected upstream, rather than evidence
//    that a lead clicked a button. There is no dismiss action, by design.
//  • Pulse's own status sits next to the WFM verdict and is never
//    overwritten by it. The source's no_show flag is known to fire on
//    approved leave and day-offs too, so the lead reads the pair and
//    decides.
//
// See src/api/wfm.js for the three source semantics (missing_h clipping,
// no-show zeroing, day-offs having no row).

const lp = (e) => String(e || "").split("@")[0].toLowerCase();
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const num = (v) => (v == null || v === "" ? null : Number(v));
const h2 = (v) => (v == null ? "—" : Number(v).toFixed(2));
const m0 = (v) => (v == null ? "—" : `${Math.round(Number(v))}m`);

// Clock helpers. plan_shift_start / _end hold the Dubai wall-clock time the
// warehouse reported. Formatting them through the browser's timezone would
// silently shift every shift by the local offset, so the HH:MM is read
// straight out of the ISO string instead of being re-interpreted as an
// instant.
const clockOf = (ts) => {
  const m = String(ts || "").match(/[T ](\d{2}:\d{2})/);
  return m ? m[1] : null;
};
const toMin = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (mins) => {
  if (mins == null) return "—";
  let v = Math.round(mins);
  const wrapped = ((v % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
};
const fmtHrs = (h) => {
  if (h == null) return "—";
  const mins = Math.round(Math.abs(h) * 60);
  const hh = Math.floor(mins / 60), mm = mins % 60;
  return hh ? `${hh}h ${mm}m` : `${mm}m`;
};
const dayLabel = (d) => {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};
const monthBounds = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
};
const monthOptions = () => {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTHS[d.getMonth()]}-${d.getFullYear()}`,
    });
  }
  return out;
};

// Work out what a row's missing hours actually consist of, and render it in
// the report's own terms. Late + left-early are measured; anything the
// stored missing_h carries BEYOND those two is unaccounted time sitting
// inside the shift. The stored value always wins — it is never recomputed
// from the parts (15 of 350 Nov rows disagree in both directions).
const explainRow = (r) => {
  const planIn = clockOf(r.plan_shift_start);
  const planOut = clockOf(r.plan_shift_end);
  const late = num(r.late_m) || 0;
  const early = num(r.left_early_m) || 0;
  const missing = num(r.missing_h);

  const inMin = toMin(planIn), outMin = toMin(planOut);
  const loggedIn = r.no_show ? null : (inMin != null ? fromMin(inMin + late) : null);
  const loggedOut = r.no_show ? null : (outMin != null ? fromMin(outMin - early) : null);

  const parts = [];
  if (r.no_show) {
    parts.push("No show — never logged in");
  } else {
    if (late > 0) parts.push(`Late start: ${planIn}–${loggedIn}`);
    if (early > 0) parts.push(`Left early: ${loggedOut}–${planOut}`);
    const gap = (missing || 0) - (late + early) / 60;
    if (gap > 0.02) {
      parts.push(parts.length ? `Gap inside the shift: ${fmtHrs(gap)}` : "Gap inside the shift, no clock time");
    }
    if (!parts.length && missing > 0) parts.push("Gap inside the shift, no clock time");
    if (!parts.length && (late > 0 || early > 0)) parts.push("Recorded, but the source counts no missing time");
  }
  if (r.absences) parts.push(r.absences);

  return {
    planned: planIn && planOut ? `${planIn}-${planOut}` : "—",
    loggedIn, loggedOut,
    missing,
    where: parts.join(". ") || "—",
  };
};

const wfmVerdict = (r) => {
  if (r.no_show) return { label: "No show", tone: "red" };
  if (r.nsnc_not_reported) return { label: "NSNC — not reported", tone: "red" };
  if (r.nsnc_reported) return { label: "NSNC — reported", tone: "amber" };
  return null;
};

// ── Expandable per-QA group ─────────────────────────────────────────────
function QaGroup({ open, onToggle, name, lead, stats, children }) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: "pointer", background: open ? "var(--bg2,rgba(127,127,127,.06))" : undefined }}
      >
        <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
          <span style={{
            display: "inline-block", width: 14, color: "var(--tx3)",
            transform: open ? "rotate(90deg)" : "none",
          }}>›</span>
          {name}
        </td>
        {stats.map((s, i) => (
          <td key={i} style={{ fontWeight: s.strong ? 700 : 400, color: s.color || undefined, whiteSpace: "nowrap" }}>
            {s.value}
          </td>
        ))}
        <td style={{ color: "var(--tx3)", fontSize: 12, whiteSpace: "nowrap" }}>{lead || "—"}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={stats.length + 2} style={{ padding: 0, background: "var(--bg2,rgba(127,127,127,.03))" }}>
            <div style={{ padding: "6px 10px 12px 28px" }}>{children}</div>
          </td>
        </tr>
      )}
    </>
  );
}

const detailTableHead = (
  <thead>
    <tr>
      <th>Date</th><th>Planned shift</th><th>Logged in</th><th>Logged out</th><th>Missing</th><th>Where it sits</th>
    </tr>
  </thead>
);

function DetailRows({ rows, pulseByKey }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ fontSize: 12 }}>
        {detailTableHead}
        <tbody>
          {rows.map((r, i) => {
            const e = explainRow(r);
            const p = pulseByKey[`${lp(r.email)}|${r.shift_date}`];
            return (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}>{dayLabel(r.shift_date)}</td>
                <td style={{ whiteSpace: "nowrap" }}>{e.planned}</td>
                <td style={{ whiteSpace: "nowrap" }}>{e.loggedIn || "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>{e.loggedOut || "—"}</td>
                <td style={{ fontWeight: 600 }}>{h2(e.missing)}</td>
                <td style={{ color: "var(--tx2)" }}>
                  {e.where}
                  {p?.status && (
                    <span style={{ color: "var(--tx3)" }}> · Pulse: {p.status}{p.planned_code ? ` (plan ${p.planned_code})` : ""}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function WfmPage() {
  const { token, userRole } = useApp();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rows, setRows] = useState([]);
  const [pulse, setPulse] = useState([]);
  const [leave, setLeave] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [openNs, setOpenNs] = useState(() => new Set());
  const [openMh, setOpenMh] = useState(() => new Set());

  const { from, to } = useMemo(() => monthBounds(month), [month]);
  const toggle = (setFn) => (k) =>
    setFn((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    setOpenNs(new Set()); setOpenMh(new Set());
    Promise.all([
      listWfmShiftDays({ token, from, to }),
      listPulseAttendance({ token, from, to }),
      listLongLeave({ token }),
      listRoster({ token, select: "email,display_name,manager_email,country" }),
    ])
      .then(([w, p, l, r]) => {
        if (!alive) return;
        setRows(w || []); setPulse(p || []); setLeave(l || []); setRoster(r || []);
      })
      .catch((e) => alive && setErr(e?.message || String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token, from, to]);

  const pulseByKey = useMemo(() => {
    const m = {};
    for (const p of pulse) m[`${lp(p.email)}|${p.date}`] = p;
    return m;
  }, [pulse]);

  const onLongLeave = useMemo(() => {
    const set = new Set();
    for (const l of leave) {
      const startsBeforeEnd = !l.starts_on || l.starts_on <= to;
      const endsAfterStart = !l.ends_on || l.ends_on >= from;
      if (startsBeforeEnd && endsAfterStart) set.add(lp(l.email));
    }
    return set;
  }, [leave, from, to]);

  // One entry per QA — names are reconciled on the local-part so the
  // @tabby.ai / @tabby.sa split can't list the same person twice.
  const byQa = useMemo(() => {
    const m = {};
    for (const r of rows) {
      const k = lp(r.email);
      m[k] = m[k] || { key: k, email: r.email, lead: r.team_lead, days: [] };
      m[k].days.push(r);
      m[k].lead = m[k].lead || r.team_lead;
    }
    for (const q of Object.values(m)) q.days.sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1));
    return m;
  }, [rows]);

  const noShowGroups = useMemo(() =>
    Object.values(byQa)
      .map((q) => ({ ...q, hits: q.days.filter((d) => wfmVerdict(d)) }))
      .filter((q) => q.hits.length)
      .sort((a, b) => b.hits.length - a.hits.length || a.key.localeCompare(b.key)),
  [byQa]);

  const missingGroups = useMemo(() =>
    Object.values(byQa)
      .map((q) => {
        const hits = q.days.filter((d) => (num(d.missing_h) || 0) > 0);
        const total = hits.reduce((s, d) => s + (num(d.missing_h) || 0), 0);
        const late = hits.reduce((s, d) => s + (num(d.late_m) || 0), 0);
        const early = hits.reduce((s, d) => s + (num(d.left_early_m) || 0), 0);
        return { ...q, hits, total, late, early };
      })
      .filter((q) => q.hits.length)
      .sort((a, b) => b.total - a.total),
  [byQa]);

  const coverage = useMemo(() => {
    const present = new Set(rows.map((r) => lp(r.email)));
    return roster
      .filter((r) => !present.has(lp(r.email)))
      .map((r) => ({ ...r, leave: onLongLeave.has(lp(r.email)) }))
      .sort((a, b) => Number(a.leave) - Number(b.leave));
  }, [roster, rows, onLongLeave]);

  const totals = useMemo(() => ({
    nsncDays: noShowGroups.reduce((s, q) => s + q.hits.length, 0),
    nsncPeople: noShowGroups.length,
    missing: missingGroups.reduce((s, q) => s + q.total, 0),
    missingPeople: missingGroups.length,
    gaps: coverage.filter((c) => !c.leave).length,
    synced: rows.reduce((mx, r) => (r.synced_at && r.synced_at > mx ? r.synced_at : mx), ""),
  }), [noShowGroups, missingGroups, coverage, rows]);

  if (String(userRole) !== "super_admin") {
    return (
      <div className="page">
        <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--tx3)" }}>
          This panel is still being finalised.
        </div>
      </div>
    );
  }
  if (loading) return <SkeletonPage />;

  return (
    <div className="page">
      <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="badge" style={{ background: "var(--amber-bg)", color: "var(--amber)", fontWeight: 700 }}>WORK IN PROGRESS</span>
        <span style={{ fontSize: 12, color: "var(--tx3)" }}>
          Mirror of the Metabase <strong>WFM Report (ex. Attendance)</strong> (Dubai time). Visible to you only.
        </span>
        <span style={{ flex: 1 }} />
        <select className="form-input" style={{ width: 150 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {monthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {err && (
        <div className="card" style={{ padding: 14, marginBottom: 12, background: "var(--red-bg)", color: "var(--red)" }}>
          Couldn't load WFM data: {err}
        </div>
      )}

      {!err && !rows.length && (
        <EmptyState title="No WFM data for this month" description="The warehouse has no shift rows in this window. Nov-2026 is the first month loaded." />
      )}

      {!!rows.length && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 12 }}>
            {[
              { label: "NSNC / no-show days", value: totals.nsncDays, tone: totals.nsncDays ? "var(--red)" : "var(--tx1)", hint: `${totals.nsncPeople} ${totals.nsncPeople === 1 ? "person" : "people"}` },
              { label: "Missing hours", value: h2(totals.missing), tone: "var(--tx1)", hint: `${totals.missingPeople} affected` },
              { label: "QAs covered", value: Object.keys(byQa).length, tone: "var(--tx1)", hint: `of ${roster.length} on roster` },
              { label: "Unexplained gaps", value: totals.gaps, tone: totals.gaps ? "var(--amber)" : "var(--tx1)", hint: "No WFM rows, not on leave" },
            ].map((t, i) => (
              <div key={i} className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: .4 }}>{t.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: t.tone, lineHeight: 1.2 }}>{t.value}</div>
                <div style={{ fontSize: 11, color: "var(--tx3)" }}>{t.hint}</div>
              </div>
            ))}
          </div>

          {/* ── No shows / NSNC ───────────────────────────────────────── */}
          <div className="card" style={{ padding: 0, marginBottom: 12 }}>
            <div className="card-header" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon d={icons.attendance} size={15} />
              <span className="card-title">No shows &amp; NSNC — update the CRM</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: "var(--tx3)" }}>Click a name for the days · clears when the WFM report stops reporting it</span>
            </div>
            {!noShowGroups.length ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>Nothing flagged this month.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>QA</th><th>No shows</th><th>Not reported</th><th>Lead</th></tr></thead>
                  <tbody>
                    {noShowGroups.map((q) => (
                      <QaGroup
                        key={q.key}
                        open={openNs.has(q.key)}
                        onToggle={() => toggle(setOpenNs)(q.key)}
                        name={nameFromEmail(q.email)}
                        lead={q.lead}
                        stats={[
                          { value: q.hits.length, strong: true, color: "var(--red)" },
                          { value: q.hits.filter((d) => d.nsnc_not_reported).length || "—" },
                        ]}
                      >
                        <DetailRows rows={q.hits} pulseByKey={pulseByKey} />
                      </QaGroup>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--tx3)", borderTop: "1px solid var(--bd)" }}>
              A no-show day carries <strong>0 missing hours</strong> in the source — the two sections are separate signals, never a single total.
              The source also flags approved leave and day-offs as no-show, so check Pulse's status in the detail before acting.
            </div>
          </div>

          {/* ── Missing hours ─────────────────────────────────────────── */}
          <div className="card" style={{ padding: 0, marginBottom: 12 }}>
            <div className="card-header" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="card-title">Missing hours</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: "var(--tx3)" }}>Click a name for the day-by-day breakdown</span>
            </div>
            {!missingGroups.length ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>No missing hours this month.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>QA</th><th>Total missing</th><th>Days</th><th>Late</th><th>Left early</th><th>Lead</th></tr></thead>
                  <tbody>
                    {missingGroups.map((q) => (
                      <QaGroup
                        key={q.key}
                        open={openMh.has(q.key)}
                        onToggle={() => toggle(setOpenMh)(q.key)}
                        name={nameFromEmail(q.email)}
                        lead={q.lead}
                        stats={[
                          { value: h2(q.total), strong: true, color: q.total >= 2 ? "var(--red)" : "var(--amber)" },
                          { value: q.hits.length },
                          { value: m0(q.late) },
                          { value: m0(q.early) },
                        ]}
                      >
                        <DetailRows rows={q.hits} pulseByKey={pulseByKey} />
                      </QaGroup>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--tx3)", borderTop: "1px solid var(--bd)" }}>
              Missing hours counts absence <strong>inside</strong> the planned window — staying past your shift end earns none of it back.
              The figure is taken from the warehouse as-is; it is not the sum of late + left early, and the two can disagree.
              <br />
              <strong>Logged in / Logged out are derived</strong> from the planned shift plus the late and left-early minutes —
              the warehouse's own clock times aren't stored in Pulse yet, so treat them as indicative until they are.
            </div>
          </div>

          {!!coverage.length && (
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header" style={{ padding: "10px 14px" }}>
                <span className="card-title">Not in the WFM report · {coverage.length}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>QA</th><th>Country</th><th>Why</th></tr></thead>
                  <tbody>
                    {coverage.map((c) => (
                      <tr key={c.email}>
                        <td style={{ whiteSpace: "nowrap" }}>{c.display_name || nameFromEmail(c.email)}</td>
                        <td>{c.country || "—"}</td>
                        <td>
                          {c.leave
                            ? <span className="badge" style={{ background: "var(--primary-light)", color: "var(--tabby-purple,#6A2C79)" }}>On long leave — no schedule expected</span>
                            : <span style={{ color: "var(--amber)", fontWeight: 600 }}>Unexplained — no shift rows at all this month</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!!totals.synced && (
            <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 10, textAlign: "right" }}>
              Warehouse copy last synced {new Date(totals.synced).toLocaleString("en-GB")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
