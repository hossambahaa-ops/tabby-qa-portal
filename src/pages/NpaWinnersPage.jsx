import React, { useState, useEffect, useMemo } from "react";
import { sb } from "../lib/supabase.js";
import { listRoster } from "../api/roster.js";
import { nameFromEmail } from "../lib/utils.js";
import { sortMonthsDesc } from "../lib/constants.js";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";

// ── NPA Winners ────────────────────────────────────────────────────────
// One-button computation of the monthly "QA NPA Winners" recognition
// sheet straight from Pulse data. Every rule below was reverse-engineered
// from the historical Jun-2026 sheet and reproduces those winners exactly:
//   • CSAT        — csat_by_topic aggregated per QA/month (good/(good+bad))
//   • Own ABT     — mtd_scores.abt + tickets_touched, with a ≥100-ticket
//                   qualifying gate, then the 5 lowest ABT, then the busiest
//                   of those 5 (reproduces Mariam Gad 12.73 / 253).
//   • Calibration — average of mtd_scores.phase_1_score over the trailing
//                   3 months (reproduces abdallah.ashraf 86.7%, elwany 90.3%).
//   • Coaching    — mtd_scores.coaching_completion_pct, sized by
//                   coaching_sessions (reproduces pola 44 / mamdouh 36).
// Sessions Master ("Q Sessions") has no clean Pulse source yet and is left
// out for now. VMV Alignment is a manual nomination — an editable row.

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const lp = (e) => (e || "").split("@")[0].toLowerCase();
const parsePct = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace("%", "").trim());
  return isFinite(n) ? n : null;
};
const trailing3 = (month) => {
  const [mon, yr] = String(month).split("-");
  let mi = MONTHS.indexOf(mon), y = +yr;
  const out = [];
  if (mi < 0 || !isFinite(y)) return [month];
  for (let i = 0; i < 3; i++) { out.push(`${MONTHS[mi]}-${y}`); mi--; if (mi < 0) { mi = 11; y--; } }
  return out;
};
const countryFull = (c) => (c === "Egy" ? "Egypt" : c === "KSA" ? "KSA" : c || "");
const COUNTRIES = ["Egy", "KSA"];

// Sheet metric labels — kept verbatim so exports paste straight into the sheet.
const SHEET_LABEL = {
  csat: "CSAT",
  calibration: "Calibration Score - Average of the past 3 months",
  abt: "Own ABT",
  coaching: "Coaching Completion",
  vmv: "VMV Alignment",
};
const METRICS = [
  { key: "csat", title: "CSAT", icon: icons.csat, rule: "Highest CSAT % (good ÷ good+bad) among QAs at or above the survey floor." },
  { key: "calibration", title: "Calibration — avg last 3 months", icon: icons.targets, rule: "Average of the Phase-1 calibration score over the selected month + the two before it." },
  { key: "abt", title: "Own ABT", icon: icons.utilization, rule: "Among QAs handling ≥ the ticket floor, take the 5 lowest ABT, then the busiest of those 5 wins." },
  { key: "coaching", title: "Coaching Completion", icon: icons.quality, rule: "Highest coaching-completion % among QAs at or above the coachings floor." },
];

export default function NpaWinnersPage() {
  const { token, globalToast } = useApp();
  const [roster, setRoster] = useState([]);
  const [mtd, setMtd] = useState([]);
  const [csat, setCsat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [csatLoading, setCsatLoading] = useState(false);

  const [month, setMonth] = useUrlState("mo", "");
  const [minSurveys, setMinSurveys] = useState(10);
  const [minCoachings, setMinCoachings] = useState(10);
  const [minTickets, setMinTickets] = useState(100);
  const [minCals, setMinCals] = useState(3);

  // Per metric+country winner selections. Keyed `${metric}|${country}` → Set of localparts.
  const [selected, setSelected] = useState({});
  // QAs manually excluded from every metric's ranking (localparts).
  const [excluded, setExcluded] = useState(() => new Set());
  // Manual VMV rows, per country.
  const [vmv, setVmv] = useState({ Egy: { name: "", reason: "" }, KSA: { name: "", reason: "" } });

  // ── Base data (roster + all mtd months) — once ──
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [r, m] = await Promise.all([
          listRoster({ token, select: "email,display_name,country,title,queue,role", cacheKey: "qa_roster_npa" }),
          sb.query("mtd_scores", {
            select: "month,qa_email,abt,tickets_touched,coaching_completion_pct,coaching_sessions,phase_1_score",
            token,
          }),
        ]);
        if (!alive) return;
        setRoster(r || []);
        setMtd(m || []);
        const months = sortMonthsDesc([...new Set((m || []).map((x) => x.month).filter(Boolean))]);
        if (!month && months.length) setMonth(months[0]);
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── CSAT for the selected month — refetch on month change ──
  useEffect(() => {
    if (!month) return;
    let alive = true;
    (async () => {
      setCsatLoading(true);
      try {
        const rows = await sb.query("csat_by_topic", {
          select: "qa_email,month,good,bad,surveys_count",
          filters: `month=eq.${month}`,
          token,
        });
        if (alive) setCsat(rows || []);
      } catch {
        if (alive) setCsat([]);
      } finally {
        if (alive) setCsatLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [month, token]);

  const rosterMap = useMemo(() => {
    const map = {};
    for (const r of roster) {
      const k = lp(r.email);
      if (!k) continue;
      // Name is derived from the email (nameFromEmail) to match how every
      // other view in the app renders QA names (MTD table, filters, exports).
      // The roster's display_name (the person's real full name) is deliberately
      // NOT used here — it diverges from the app-wide convention.
      map[k] = { name: nameFromEmail(r.email), country: r.country, title: r.title, queue: r.queue };
    }
    return map;
  }, [roster]);

  const monthOptions = useMemo(
    () => sortMonthsDesc([...new Set(mtd.map((x) => x.month).filter(Boolean))]),
    [mtd]
  );

  // mtd indexed by `${localpart}|${month}` for the calibration window.
  const mtdIndex = useMemo(() => {
    const idx = {};
    for (const r of mtd) idx[`${lp(r.qa_email)}|${r.month}`] = r;
    return idx;
  }, [mtd]);

  // ── Compute the ranked candidates for every metric, per country ──
  const results = useMemo(() => {
    const out = { csat: {}, calibration: {}, abt: {}, coaching: {} };
    if (!month) return out;
    const window3 = trailing3(month);
    const monthRows = mtd.filter((r) => r.month === month);

    for (const country of COUNTRIES) {
      // Eligible = a roster QA in this country who hasn't been manually excluded.
      const inCountry = (k) => rosterMap[k] && rosterMap[k].country === country && !excluded.has(k);

      // CSAT — aggregate this month's csat_by_topic per QA.
      const agg = {};
      for (const r of csat) {
        const k = lp(r.qa_email);
        if (!inCountry(k)) continue;
        const b = agg[k] || (agg[k] = { good: 0, bad: 0, surv: 0 });
        b.good += r.good || 0; b.bad += r.bad || 0; b.surv += r.surveys_count || 0;
      }
      out.csat[country] = Object.entries(agg)
        .map(([k, b]) => ({ k, name: rosterMap[k].name, pct: b.good + b.bad > 0 ? (b.good / (b.good + b.bad)) * 100 : null, surv: b.surv }))
        .filter((x) => x.pct != null && x.surv >= minSurveys)
        .sort((a, b) => b.pct - a.pct || b.surv - a.surv)
        .map((x) => ({ ...x, perf: `${x.pct.toFixed(1)}%`, sample: `${x.surv} surveys` }));

      // Calibration — avg phase_1_score over the trailing 3 months.
      const cal = [];
      const seen = new Set();
      for (const r of mtd) {
        const k = lp(r.qa_email);
        if (seen.has(k) || !inCountry(k)) continue;
        seen.add(k);
        const scores = window3
          .map((mm) => parsePct(mtdIndex[`${k}|${mm}`]?.phase_1_score))
          .filter((v) => v != null);
        if (scores.length < minCals) continue;
        const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
        cal.push({ k, name: rosterMap[k].name, avg, n: scores.length, perf: `${avg.toFixed(1)}%`, sample: `${scores.length} Calibrations` });
      }
      out.calibration[country] = cal.sort((a, b) => b.avg - a.avg || b.n - a.n);

      // Own ABT — gate on tickets, 5 lowest ABT, then busiest of the 5.
      const pool = monthRows
        .filter((r) => inCountry(lp(r.qa_email)) && r.abt != null && +r.abt > 0 && (r.tickets_touched || 0) >= minTickets)
        .map((r) => ({ k: lp(r.qa_email), name: rosterMap[lp(r.qa_email)].name, abt: +r.abt, tickets: r.tickets_touched || 0 }))
        .sort((a, b) => a.abt - b.abt)
        .slice(0, 5);
      const abtWinner = pool.reduce((best, x) => (!best || x.tickets > best.tickets ? x : best), null);
      out.abt[country] = pool.map((x) => ({ ...x, perf: `${x.abt.toFixed(2)} min`, sample: `${x.tickets} tickets handled`, _win: abtWinner && x.k === abtWinner.k }));

      // Coaching — highest completion %, sized by coaching_sessions.
      out.coaching[country] = monthRows
        .filter((r) => inCountry(lp(r.qa_email)) && parsePct(r.coaching_completion_pct) != null && (r.coaching_sessions || 0) >= minCoachings)
        .map((r) => ({ k: lp(r.qa_email), name: rosterMap[lp(r.qa_email)].name, pct: parsePct(r.coaching_completion_pct), sessions: r.coaching_sessions || 0 }))
        .sort((a, b) => b.pct - a.pct || b.sessions - a.sessions)
        .map((x) => ({ ...x, perf: `${Math.round(x.pct)}%`, sample: `${x.sessions} coachings` }));
    }
    return out;
  }, [month, mtd, csat, rosterMap, mtdIndex, minSurveys, minCoachings, minTickets, minCals, excluded]);

  // Default winner (top of each ranked list; ABT uses the busiest-of-5 flag).
  const defaultWinnerKey = (metric, country) => {
    const list = results[metric]?.[country] || [];
    if (!list.length) return null;
    if (metric === "abt") return (list.find((x) => x._win) || list[0]).k;
    return list[0].k;
  };

  // Reset selections to the computed defaults whenever the computation changes.
  useEffect(() => {
    const next = {};
    for (const m of METRICS) for (const c of COUNTRIES) {
      const w = defaultWinnerKey(m.key, c);
      next[`${m.key}|${c}`] = new Set(w ? [w] : []);
    }
    setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const toggle = (metric, country, k) => {
    setSelected((prev) => {
      const key = `${metric}|${country}`;
      const set = new Set(prev[key] || []);
      if (set.has(k)) set.delete(k); else set.add(k);
      return { ...prev, [key]: set };
    });
  };
  const excludeQA = (k) => setExcluded((prev) => new Set(prev).add(k));
  const restoreQA = (k) => setExcluded((prev) => { const n = new Set(prev); n.delete(k); return n; });

  // ── Build the export rows (sheet column order) ──
  const exportRows = useMemo(() => {
    const rows = [];
    for (const m of METRICS) {
      for (const c of COUNTRIES) {
        const set = selected[`${m.key}|${c}`] || new Set();
        const list = results[m.key]?.[c] || [];
        for (const row of list) {
          if (!set.has(row.k)) continue;
          rows.push({ metric: SHEET_LABEL[m.key], employee: row.name, performance: row.perf, sample: row.sample, country: countryFull(c) });
        }
      }
    }
    for (const c of COUNTRIES) {
      const v = vmv[c];
      if (v && v.name.trim()) rows.push({ metric: SHEET_LABEL.vmv, employee: v.name.trim(), performance: v.reason.trim() || "-", sample: "-", country: countryFull(c) });
    }
    return rows;
  }, [selected, results, vmv]);

  const toCsv = () => {
    const head = ["Metric", "Employee", "Performance", "Sample Size", "Country"];
    const esc = (s) => { const t = String(s ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return [head, ...exportRows.map((r) => [r.metric, r.employee, r.performance, r.sample, r.country])]
      .map((cols) => cols.map(esc).join(",")).join("\n");
  };
  const copyCsv = async () => {
    try { await navigator.clipboard.writeText(toCsv()); globalToast?.("success", "Winners copied as CSV"); }
    catch { globalToast?.("error", "Copy failed — use Download instead"); }
  };
  const downloadCsv = () => {
    const blob = new Blob([toCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `QA-NPA-Winners-${month || "period"}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="page"><SkeletonPage /></div>;
  if (err) return (
    <div className="page">
      <div className="page-header"><div className="page-title">NPA Winners</div></div>
      <div className="card" style={{ color: "var(--red)" }}>Couldn't load data — {err}</div>
    </div>
  );

  const selectedCount = exportRows.length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon d={icons.podium} size={24} /> NPA Winners
        </div>
        <div className="page-subtitle">Compute the monthly recognition winners straight from Pulse. Click a row to pick a different winner; blank rows stay manual.</div>
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px" }}>Period</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={monthSelStyle}>
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <NumField label="Min surveys (CSAT)" value={minSurveys} onChange={setMinSurveys} />
        <NumField label="Min coachings" value={minCoachings} onChange={setMinCoachings} />
        <NumField label="Min tickets (ABT)" value={minTickets} onChange={setMinTickets} />
        <NumField label="Min calibrations" value={minCals} onChange={setMinCals} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--tx2)" }}>{selectedCount} winner{selectedCount === 1 ? "" : "s"} selected</span>
          <button onClick={copyCsv} className="btn" style={btnStyle}>Copy CSV</button>
          <button onClick={downloadCsv} className="btn" style={{ ...btnStyle, background: "var(--tabby-purple)", color: "#fff", borderColor: "var(--tabby-purple)" }}>Download CSV</button>
        </div>
      </div>

      {excluded.size > 0 && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px" }}>Excluded ({excluded.size})</span>
          {[...excluded].map((k) => (
            <button key={k} onClick={() => restoreQA(k)} title="Click to restore" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 16, border: "1px solid var(--bd2)", background: "var(--bg3)", color: "var(--tx2)", fontSize: 12, cursor: "pointer" }}>
              {rosterMap[k]?.name || k} <span style={{ color: "var(--tx3)" }}>↩</span>
            </button>
          ))}
        </div>
      )}

      {csatLoading && <div style={{ fontSize: 12, color: "var(--tx3)", margin: "0 0 8px 2px" }}>Refreshing CSAT for {month}…</div>}

      {/* Metric cards */}
      {METRICS.map((m) => (
        <div className="card" key={m.key} style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ marginBottom: 6 }}>
            <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon d={m.icon} size={17} /> {m.title}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 14 }}>{m.rule}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {COUNTRIES.map((c) => {
              const list = (results[m.key]?.[c] || []).slice(0, 6);
              const set = selected[`${m.key}|${c}`] || new Set();
              return (
                <div key={c}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx2)", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 8 }}>{countryFull(c)}</div>
                  {list.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--tx3)", padding: "8px 0" }}>No qualifying QAs.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {list.map((row, i) => {
                        const on = set.has(row.k);
                        return (
                          <div key={row.k} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                            <button
                              onClick={() => toggle(m.key, c, row.k)}
                              style={{
                                flex: 1, minWidth: 0,
                                display: "grid", gridTemplateColumns: "20px 1fr auto", alignItems: "center", gap: 8,
                                textAlign: "left", cursor: "pointer", padding: "7px 10px", borderRadius: 8,
                                border: on ? "1px solid var(--tabby-purple)" : "1px solid var(--bd2)",
                                background: on ? "var(--primary-light)" : "var(--bg3)",
                              }}
                            >
                              <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 700 }}>{on ? "★" : i + 1}</span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 13, fontWeight: on ? 700 : 500, color: "var(--tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
                                <span style={{ fontSize: 11, color: "var(--tx3)" }}>{row.sample}</span>
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: on ? "var(--tabby-purple)" : "var(--tx2)" }}>{row.perf}</span>
                            </button>
                            <button
                              onClick={() => excludeQA(row.k)}
                              title={`Exclude ${row.name} from all winners`}
                              aria-label={`Exclude ${row.name}`}
                              style={{ width: 30, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 8, border: "1px solid var(--bd2)", background: "var(--bg3)", color: "var(--tx3)", fontSize: 16, lineHeight: 1 }}
                            >×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* VMV — manual */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ marginBottom: 6 }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon d={icons.northstar} size={17} /> VMV Alignment</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 14 }}>Manual nomination — type the winner and the reason. Included in the export only when a name is filled.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {COUNTRIES.map((c) => (
            <div key={c}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx2)", textTransform: "uppercase", letterSpacing: ".7px", marginBottom: 8 }}>{countryFull(c)}</div>
              <input placeholder="Winner name" value={vmv[c].name} onChange={(e) => setVmv((p) => ({ ...p, [c]: { ...p[c], name: e.target.value } }))} style={{ ...inputStyle, marginBottom: 6 }} />
              <input placeholder="Reason (e.g. Ownership — …)" value={vmv[c].reason} onChange={(e) => setVmv((p) => ({ ...p, [c]: { ...p[c], reason: e.target.value } }))} style={inputStyle} />
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="card">
        <div className="card-header"><div className="card-title">Export preview</div></div>
        {exportRows.length === 0 ? (
          <EmptyState title="Nothing selected" description="Pick winners above to build the export." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: 13 }}>
              <thead><tr>{["Metric", "Employee", "Performance", "Sample Size", "Country"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {exportRows.map((r, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{r.metric}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.employee}</td>
                    <td style={tdStyle}>{r.performance}</td>
                    <td style={tdStyle}>{r.sample}</td>
                    <td style={tdStyle}>{r.country}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const selStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--bd2)", background: "var(--bg3)", color: "var(--tx)", fontSize: 13, fontWeight: 600 };
// Month <select>: kill the native OS arrow(s) and draw a single clean chevron.
const monthSelStyle = {
  padding: "8px 34px 8px 12px", borderRadius: 8, border: "1px solid var(--bd2)",
  backgroundColor: "var(--bg3)", color: "var(--tx)", fontSize: 13, fontWeight: 600, cursor: "pointer",
  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235E5A65' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
};
const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--bd2)", background: "var(--bg3)", color: "var(--tx)", fontSize: 13 };
const btnStyle = { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--bd2)", background: "var(--bg3)", color: "var(--tx)", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const thStyle = { textAlign: "left", padding: "8px 10px", fontSize: 11, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", borderBottom: "1px solid var(--bd2)" };
const tdStyle = { padding: "8px 10px", borderBottom: "1px solid var(--bd)", color: "var(--tx2)" };

function NumField({ label, value, onChange }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px" }}>{label}</span>
      <input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, +e.target.value || 0))} style={{ ...selStyle, width: 92, WebkitAppearance: "textfield", MozAppearance: "textfield" }} />
    </label>
  );
}
