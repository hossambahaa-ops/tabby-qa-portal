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
//    approved leave and day-offs too (Nov: an AL day and an OFF day both
//    came through as no_show), so the lead reads the pair and decides.
//
// See src/api/wfm.js for the three source semantics (missing_h clipping,
// no-show zeroing, day-offs having no row).

const lp = (e) => String(e || "").split("@")[0].toLowerCase();
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const num = (v) => (v == null || v === "" ? null : Number(v));
const h2 = (v) => (v == null ? "—" : Number(v).toFixed(2));
const m0 = (v) => (v == null ? "—" : `${Math.round(Number(v))}m`);
const dayLabel = (d) => {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
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

// What the WFM row is claiming, in the report's own vocabulary.
const wfmVerdict = (r) => {
  if (r.no_show) return { label: "No show", tone: "red" };
  if (r.nsnc_not_reported) return { label: "NSNC — not reported", tone: "red" };
  if (r.nsnc_reported) return { label: "NSNC — reported", tone: "amber" };
  return null;
};

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

  const { from, to } = useMemo(() => monthBounds(month), [month]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    Promise.all([
      listWfmShiftDays({ token, from, to }),
      listPulseAttendance({ token, from, to }),
      listLongLeave({ token }),
      listRoster({ token, select: "email,display_name,manager_email,country" }),
    ])
      .then(([w, p, l, r]) => {
        if (!alive) return;
        setRows(w || []);
        setPulse(p || []);
        setLeave(l || []);
        setRoster(r || []);
      })
      .catch((e) => alive && setErr(e?.message || String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token, from, to]);

  // Pulse status keyed on local-part + date, so the @tabby.ai / @tabby.sa
  // split can't silently miss a match (see project_cross_domain_identity).
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

  // Per-QA rollup. Nulls are skipped rather than counted as zero — a leave
  // day has no scheduled hours, which is not the same as zero worked.
  const perQa = useMemo(() => {
    const by = {};
    for (const r of rows) {
      const k = lp(r.email);
      by[k] = by[k] || {
        key: k, email: r.email, team_lead: r.team_lead, country: r.country,
        days: 0, sched: 0, login: 0, missing: 0, late: 0, early: 0,
        nsnc: 0, leaveDays: 0,
      };
      const a = by[k];
      a.days += 1;
      const s = num(r.scheduled_h), lg = num(r.login_h), ms = num(r.missing_h);
      if (s != null) a.sched += s;
      if (lg != null) a.login += lg;
      if (ms != null) a.missing += ms;
      if (num(r.late_m) != null) a.late += num(r.late_m);
      if (num(r.left_early_m) != null) a.early += num(r.left_early_m);
      if (r.no_show || r.nsnc_not_reported || r.nsnc_reported) a.nsnc += 1;
      if (r.absences) a.leaveDays += 1;
      a.team_lead = a.team_lead || r.team_lead;
    }
    return Object.values(by).sort((x, y) => y.missing - x.missing);
  }, [rows]);

  // NSNC alerts, newest first — what a lead needs to fix in the CRM.
  const alerts = useMemo(() => {
    const out = [];
    for (const r of rows) {
      const v = wfmVerdict(r);
      if (!v) continue;
      const p = pulseByKey[`${lp(r.email)}|${r.shift_date}`];
      out.push({
        ...r, verdict: v,
        pulseStatus: p?.status || null,
        pulsePlan: p?.planned_code || null,
        pulseAuto: !!p?.auto_nsnc,
      });
    }
    return out.sort((a, b) => (a.shift_date < b.shift_date ? 1 : -1));
  }, [rows, pulseByKey]);

  // QAs on the roster with no WFM row at all this month. Long leave is
  // labelled rather than hidden, so the panel never quietly drops someone.
  const coverage = useMemo(() => {
    const present = new Set(rows.map((r) => lp(r.email)));
    return roster
      .filter((r) => !present.has(lp(r.email)))
      .map((r) => ({ ...r, leave: onLongLeave.has(lp(r.email)) }))
      .sort((a, b) => Number(a.leave) - Number(b.leave));
  }, [roster, rows, onLongLeave]);

  const totals = useMemo(() => ({
    missing: perQa.reduce((s, q) => s + q.missing, 0),
    nsnc: alerts.length,
    gaps: coverage.filter((c) => !c.leave).length,
    qas: perQa.length,
    synced: rows.reduce((mx, r) => (r.synced_at && r.synced_at > mx ? r.synced_at : mx), ""),
  }), [perQa, alerts, coverage, rows]);

  if (!["super_admin"].includes(String(userRole))) {
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
              { label: "NSNC / no-show days", value: totals.nsnc, tone: totals.nsnc ? "var(--red)" : "var(--tx1)", hint: "Needs a CRM update" },
              { label: "Missing hours", value: h2(totals.missing), tone: "var(--tx1)", hint: "Inside planned windows only" },
              { label: "QAs covered", value: totals.qas, tone: "var(--tx1)", hint: `of ${roster.length} on roster` },
              { label: "Unexplained gaps", value: totals.gaps, tone: totals.gaps ? "var(--amber)" : "var(--tx1)", hint: "No WFM rows, not on leave" },
            ].map((t, i) => (
              <div key={i} className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: .4 }}>{t.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: t.tone, lineHeight: 1.2 }}>{t.value}</div>
                <div style={{ fontSize: 11, color: "var(--tx3)" }}>{t.hint}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 0, marginBottom: 12 }}>
            <div className="card-header" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon d={icons.attendance} size={15} />
              <span className="card-title">NSNC alerts — update the CRM</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: "var(--tx3)" }}>Clears when the WFM report stops reporting it</span>
            </div>
            {!alerts.length ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>Nothing flagged this month.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr>
                    <th>QA</th><th>Day</th><th>WFM says</th><th>Pulse says</th><th>Scheduled</th><th>Logged</th><th>Missing</th>
                  </tr></thead>
                  <tbody>
                    {alerts.map((a, i) => {
                      const mismatch = a.pulseStatus && !["NSNC", "A", "ABS"].includes(String(a.pulseStatus).toUpperCase());
                      return (
                        <tr key={i}>
                          <td style={{ whiteSpace: "nowrap" }}>{nameFromEmail(a.email)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{dayLabel(a.shift_date)}</td>
                          <td>
                            <span className="badge" style={{
                              background: a.verdict.tone === "red" ? "var(--red-bg)" : "var(--amber-bg)",
                              color: a.verdict.tone === "red" ? "var(--red)" : "var(--amber)",
                            }}>{a.verdict.label}</span>
                          </td>
                          <td>
                            {a.pulseStatus ? (
                              <span style={{ color: mismatch ? "var(--amber)" : "var(--tx2)", fontWeight: mismatch ? 600 : 400 }}>
                                {a.pulseStatus}{a.pulsePlan ? ` · plan ${a.pulsePlan}` : ""}{mismatch ? " ⚠" : ""}
                              </span>
                            ) : <span style={{ color: "var(--tx3)" }}>nothing logged</span>}
                          </td>
                          <td>{h2(num(a.scheduled_h))}</td>
                          <td>{h2(num(a.login_h))}</td>
                          <td>{h2(num(a.missing_h))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--tx3)", borderTop: "1px solid var(--bd)" }}>
              A no-show day carries <strong>0 missing hours</strong> in the source — the two columns are separate signals, never a single total.
              The source also flags approved leave and day-offs as no-show, so read Pulse's status beside it before acting.
            </div>
          </div>

          <div className="card" style={{ padding: 0, marginBottom: 12 }}>
            <div className="card-header" style={{ padding: "10px 14px" }}>
              <span className="card-title">Missing hours by QA</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr>
                  <th>QA</th><th>Lead</th><th>Days</th><th>Scheduled</th><th>Logged</th><th>Missing</th><th>Late</th><th>Left early</th><th>NSNC</th><th>Leave</th>
                </tr></thead>
                <tbody>
                  {perQa.map((q) => (
                    <tr key={q.key}>
                      <td style={{ whiteSpace: "nowrap" }}>{nameFromEmail(q.email)}</td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--tx3)", fontSize: 12 }}>{q.team_lead || "—"}</td>
                      <td>{q.days}</td>
                      <td>{h2(q.sched)}</td>
                      <td>{h2(q.login)}</td>
                      <td style={{ fontWeight: q.missing > 0 ? 700 : 400, color: q.missing >= 2 ? "var(--red)" : q.missing > 0 ? "var(--amber)" : "var(--tx2)" }}>{h2(q.missing)}</td>
                      <td>{m0(q.late)}</td>
                      <td>{m0(q.early)}</td>
                      <td style={{ color: q.nsnc ? "var(--red)" : "var(--tx3)", fontWeight: q.nsnc ? 700 : 400 }}>{q.nsnc || "—"}</td>
                      <td style={{ color: "var(--tx3)" }}>{q.leaveDays || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--tx3)", borderTop: "1px solid var(--bd)" }}>
              Missing hours counts absence <strong>inside</strong> the planned window — staying past your shift end earns none of it back.
              It is taken from the warehouse as-is and is not the sum of late + left early.
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
