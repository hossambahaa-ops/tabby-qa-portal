import React, { useState, useEffect, useMemo } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { nameFromEmail } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { useApp } from "../lib/AppContext.jsx";
import { fetchExpertise, fetchExpertiseMonths, fetchExpertiseConfig, saveExpertiseThreshold, recomputeExpertise, renderStars, starColor, starLabel, productOf, productColor } from "../lib/expertise.js";
import SkeletonPage from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";

const fmtScore = (v) => Number(v || 0).toFixed(2);

// Mini horizontal bar capped at 3.0 (the rough ceiling for any single
// product sub-score in practice — 3 Tier-1 champion topics × 1.0).
const ProductBar = ({ label, value, max = 3 }) => {
  const pct = Math.min(100, (Number(value || 0) / max) * 100);
  const c = productColor(label);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", width: 64, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "var(--bd)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: c, borderRadius: 3, transition: "width .3s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: c, width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtScore(value)}</span>
    </div>
  );
};

// Topic chip — green for champion, blue for solid.
const TopicChip = ({ topic, strength = "champion" }) => {
  const tone = strength === "champion"
    ? { bg: "var(--green-bg)", color: "var(--green)" }
    : { bg: "var(--blue-bg)", color: "var(--blue)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 10,
      background: tone.bg, color: tone.color,
      whiteSpace: "nowrap",
    }}>
      {topic}
    </span>
  );
};

export default function ExpertisePage() {
  const { token, profile, gf, globalToast } = useApp();
  const myEmail = profile?.email?.toLowerCase() || "";
  const isAdmin      = hasRole(profile?.role, "admin");
  const isSupervisor = hasRole(profile?.role, "qa_supervisor");
  const isLead       = hasRole(profile?.role, "qa_lead");
  const isQAOnly     = profile?.role === "qa" || profile?.role === "senior_qa";

  const [rows, setRows] = useState([]);
  const [roster, setRoster] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selMonth, setSelMonth] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [selTeam, setSelTeam] = useState("");
  const [selStar, setSelStar] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  // Threshold management — admin-only. activeThreshold is what's stored
  // in the DB; pendingThreshold is the value in the input (lets users
  // type without firing recompute on every keystroke).
  const [activeThreshold, setActiveThreshold] = useState(5);
  const [pendingThreshold, setPendingThreshold] = useState(5);
  const [thresholdMeta, setThresholdMeta] = useState({ updated_at: null, updated_by: null });
  const [recomputing, setRecomputing] = useState(false);

  // Initial month + dropdowns + threshold config
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [ms, r, ps, cfg] = await Promise.all([
          fetchExpertiseMonths({ token }),
          listRoster({ token, select: "email,queue,manager_email" }).catch(() => []),
          listProfiles({ token, select: "email,role" }).catch(() => []),
          fetchExpertiseConfig({ token }),
        ]);
        if (cancelled) return;
        const sorted = sortMonthsDesc(ms);
        setMonths(sorted);
        setRoster(Array.isArray(r) ? r : []);
        setProfiles(Array.isArray(ps) ? ps : []);
        const t = Number(cfg?.min_surveys) || 5;
        setActiveThreshold(t);
        setPendingThreshold(t);
        setThresholdMeta({ updated_at: cfg?.updated_at, updated_by: cfg?.updated_by });
        const initial = (gf?.month && sorted.includes(gf.month)) ? gf.month : sorted[0] || "";
        setSelMonth(initial);
      } catch (e) { console.error("Expertise initial:", e); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Apply a new threshold: persist to qa_expertise_config + recompute
  // every month + reload current view.
  const applyThreshold = async () => {
    const v = Math.max(1, Math.min(200, Math.round(Number(pendingThreshold) || 1)));
    if (v === activeThreshold) return;
    setRecomputing(true);
    try {
      const res = await saveExpertiseThreshold({ token, minSurveys: v, actorEmail: profile?.email });
      setActiveThreshold(v);
      setThresholdMeta({ updated_at: new Date().toISOString(), updated_by: profile?.email });
      // Refetch the current month's rows so the UI reflects the new scoring.
      const data = await fetchExpertise({ token, month: selMonth });
      setRows(Array.isArray(data) ? data : []);
      const upserted = res?.rows_upserted ?? "?";
      globalToast?.("success", `Threshold set to ${v} surveys · ${upserted} rows recomputed`);
    } catch (e) {
      console.error("threshold update:", e);
      globalToast?.("error", `Couldn't update threshold: ${e?.message || "permission denied or server error"}`);
      setPendingThreshold(activeThreshold);
    }
    setRecomputing(false);
  };

  // Recompute without changing the threshold — useful after a CSAT re-sync.
  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const res = await recomputeExpertise({ token, month: null });
      const data = await fetchExpertise({ token, month: selMonth });
      setRows(Array.isArray(data) ? data : []);
      globalToast?.("success", `Recomputed · ${res?.rows_upserted ?? "?"} rows refreshed`);
    } catch (e) {
      console.error("recompute:", e);
      globalToast?.("error", `Couldn't recompute: ${e?.message || "server error"}`);
    }
    setRecomputing(false);
  };

  // Reload rows when month changes
  useEffect(() => {
    if (!token || !selMonth) return;
    let cancelled = false;
    (async () => {
      const data = await fetchExpertise({ token, month: selMonth });
      if (!cancelled) setRows(Array.isArray(data) ? data : []);
    })();
    return () => { cancelled = true; };
  }, [token, selMonth]);

  // Visibility scoping per role
  const rosterMap = useMemo(() => {
    const m = {};
    roster.forEach(r => { if (r.email) m[r.email.toLowerCase()] = r; });
    return m;
  }, [roster]);

  const teamEmailsForMe = useMemo(() => {
    if (!isLead || isSupervisor) return null;
    const myLocal = myEmail.split("@")[0];
    const myAlt = myEmail.endsWith("@tabby.ai") ? myLocal + "@tabby.sa" : myLocal + "@tabby.ai";
    return new Set(roster
      .filter(r => {
        const m = r.manager_email?.toLowerCase();
        return m && (m === myEmail || m === myAlt || m === myLocal);
      })
      .map(r => r.email?.toLowerCase())
      .filter(Boolean)
    );
  }, [isLead, isSupervisor, roster, myEmail]);

  const myDomain = profile?.operational_domain || profile?.domain || "";

  // A QA "has sample" if at least one of their topics met the active
  // survey threshold (and therefore has a row in topic_breakdown). 0★
  // QAs with sample = low performance on real data; 0★ QAs without
  // sample = simply not enough surveys to evaluate yet — totally
  // different stories that should read differently in the UI.
  const hasSample = (r) => Array.isArray(r?.topic_breakdown) && r.topic_breakdown.length > 0;

  // Apply role-based visibility + UI filters
  const visibleRows = useMemo(() => {
    let r = rows;
    if (isQAOnly) {
      r = r.filter(x => x.qa_email?.toLowerCase() === myEmail);
    } else if (isLead && !isSupervisor && teamEmailsForMe) {
      r = r.filter(x => teamEmailsForMe.has(x.qa_email?.toLowerCase()) || x.qa_email?.toLowerCase() === myEmail);
    } else if (isSupervisor && !isAdmin && myDomain) {
      r = r.filter(x => x.qa_email?.toLowerCase().endsWith("@" + myDomain));
    }
    if (selDomain) r = r.filter(x => x.qa_email?.toLowerCase().endsWith("@" + selDomain));
    if (selTeam)   r = r.filter(x => rosterMap[x.qa_email?.toLowerCase()]?.queue === selTeam);
    if (selStar !== "") {
      if (selStar === "no_sample") r = r.filter(x => !hasSample(x));
      else if (selStar === "0_lowperf") r = r.filter(x => Number(x.star_level) === 0 && hasSample(x));
      else r = r.filter(x => Number(x.star_level) === Number(selStar));
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      r = r.filter(x =>
        (x.qa_email || "").toLowerCase().includes(q) ||
        nameFromEmail(x.qa_email).toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, isQAOnly, isLead, isSupervisor, isAdmin, teamEmailsForMe, myEmail, myDomain, selDomain, selTeam, selStar, search, rosterMap]);

  const teams = useMemo(() => [...new Set(roster.map(r => r.queue).filter(q => q && !q.includes(",")))].sort(), [roster]);

  // Split the 0★ bucket so the chip strip reflects the two distinct
  // populations: low-performance (data, but ranked too low) vs
  // no-sample (didn't even meet the survey threshold yet).
  const starCounts = useMemo(() => {
    const counts = { 3: 0, 2: 0, 1: 0, 0: 0, no_sample: 0 };
    visibleRows.forEach(r => {
      const lvl = Number(r.star_level) || 0;
      if (lvl === 0 && !hasSample(r)) counts.no_sample++;
      else counts[lvl]++;
    });
    return counts;
  }, [visibleRows]);

  // Click-to-sort state. "default" = star_level desc, expertise_score desc
  // (matches the original DB ordering). 3-state cycle on the active
  // column: desc → asc → default.
  const [sort, setSort] = useState({ key: "default", dir: "desc" });
  const toggleSort = (key) => setSort(prev => {
    if (prev.key !== key) return { key, dir: "desc" };
    if (prev.dir === "desc") return { key, dir: "asc" };
    return { key: "default", dir: "desc" };
  });
  const sortArrow = (key) => sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  const sortVal = (r, key) => {
    switch (key) {
      case "default":    return Number(r.star_level || 0) * 10000 + Number(r.expertise_score || 0);
      case "specialist": return nameFromEmail(r.qa_email).toLowerCase();
      case "stars":      return Number(r.star_level || 0) * 10000 + Number(r.expertise_score || 0);
      case "score":      return Number(r.expertise_score || 0);
      case "champion":   return (r.champion_topics || []).length;
      case "solid":      return (r.solid_topics || []).length;
      case "bnpl":       return Number(r.bnpl_score || 0);
      case "card":       return Number(r.card_score || 0);
      case "universal":  return Number(r.universal_score || 0);
      default:           return 0;
    }
  };

  // Sort the table rows. No-sample QAs ALWAYS sort to the bottom
  // regardless of direction — they're a separate population, not a
  // low-ranked one, and shouldn't appear above QAs with real data
  // when sorting ascending. Among themselves they're sorted by name
  // so they have a stable display order.
  const sortedRows = useMemo(() => {
    const arr = [...visibleRows];
    arr.sort((a, b) => {
      const aNoSample = !hasSample(a);
      const bNoSample = !hasSample(b);
      if (aNoSample && !bNoSample) return 1;
      if (!aNoSample && bNoSample) return -1;
      if (aNoSample && bNoSample) {
        return nameFromEmail(a.qa_email).localeCompare(nameFromEmail(b.qa_email));
      }
      const av = sortVal(a, sort.key);
      const bv = sortVal(b, sort.key);
      if (typeof av === "string") {
        const c = av.localeCompare(bv);
        return sort.dir === "asc" ? c : -c;
      }
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, sort]);

  if (loading) return <div className="page"><SkeletonPage /></div>;
  if (!selMonth || months.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">Expertise</div>
        </div>
        <div className="card">
          <EmptyState
            title="No expertise data yet"
            description="The CSAT topic sync hasn't produced data with enough surveys to qualify any specialists. Try again after a CSAT sync runs."
            icon="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Expertise <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "var(--amber-bg)", color: "var(--amber)", marginLeft: 8, verticalAlign: "middle" }}>PILOT</span></div>
          <div className="page-subtitle">CSAT-driven topic mastery — {visibleRows.length} specialist{visibleRows.length === 1 ? "" : "s"} · {selMonth}</div>
        </div>
      </div>

      {/* Pilot disclaimer */}
      <div style={{ padding: "10px 14px", marginBottom: 16, background: "var(--amber-bg)", borderLeft: "3px solid var(--amber)", borderRadius: 8, fontSize: 12, color: "var(--tx2)" }}>
        <strong style={{ color: "var(--amber)" }}>Pilot version</strong> — based on {selMonth} data only. Threshold currently set to <strong>{activeThreshold} survey{activeThreshold === 1 ? "" : "s"}</strong> per topic — admins can adjust it below as the dataset grows. Expertise calls will become more accurate as 3+ months of data accumulate.
      </div>

      {/* Admin threshold control + manual recompute. Whole page is admin-
          only at the route level, so no extra role gate needed here. */}
      <div className="card" style={{ padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Threshold</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number" min={1} max={200}
            value={pendingThreshold}
            onChange={e => setPendingThreshold(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") applyThreshold(); }}
            disabled={recomputing}
            className="form-input"
            style={{ width: 64, fontSize: 12, padding: "5px 8px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
          />
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>min surveys per topic</span>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={applyThreshold}
          disabled={recomputing || Number(pendingThreshold) === activeThreshold}
          style={{ fontSize: 11 }}
        >
          {recomputing ? "Recomputing…" : Number(pendingThreshold) !== activeThreshold ? `Apply ${pendingThreshold}` : `Active: ${activeThreshold}`}
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={handleRecompute}
          disabled={recomputing}
          title="Re-run the expertise calculation against the current threshold (use after a CSAT re-sync)"
          style={{ fontSize: 11 }}
        >
          ↻ Recompute now
        </button>
        {[3, 5, 8, 12, 20].map(v => (
          <button
            key={v}
            onClick={() => setPendingThreshold(v)}
            disabled={recomputing}
            className={`pill${v === activeThreshold ? " pill-tone-purple" : ""}`}
            style={{ cursor: "pointer", fontSize: 11 }}
          >
            {v}
          </button>
        ))}
        {thresholdMeta.updated_at && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx3)" }}>
            Last changed {new Date(thresholdMeta.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{thresholdMeta.updated_by ? ` by ${thresholdMeta.updated_by.split("@")[0]}` : ""}
          </span>
        )}
      </div>

      {/* Filters + star summary */}
      <div className="card" style={{ padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select className="select form-input" style={{ fontSize: 12, padding: "6px 10px", width: "auto" }} value={selMonth} onChange={e => setSelMonth(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {!isQAOnly && <select className="select form-input" style={{ fontSize: 12, padding: "6px 10px", width: "auto" }} value={selDomain} onChange={e => setSelDomain(e.target.value)}>
            <option value="">All domains</option>
            <option value="tabby.ai">tabby.ai</option>
            <option value="tabby.sa">tabby.sa</option>
          </select>}
          {!isQAOnly && <select className="select form-input" style={{ fontSize: 12, padding: "6px 10px", width: "auto" }} value={selTeam} onChange={e => setSelTeam(e.target.value)}>
            <option value="">All teams</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>}
          <select className="select form-input" style={{ fontSize: 12, padding: "6px 10px", width: "auto" }} value={selStar} onChange={e => setSelStar(e.target.value)}>
            <option value="">All star levels</option>
            <option value="3">⭐⭐⭐ Triple-domain</option>
            <option value="2">⭐⭐ Cross-domain</option>
            <option value="1">⭐ Specialist</option>
            <option value="0_lowperf">0★ — has data, low rank</option>
            <option value="no_sample">Not enough sample yet</option>
          </select>
          <div style={{ position: "relative", minWidth: 180, flex: 1, maxWidth: 240 }}>
            <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" style={{ fontSize: 12, padding: "6px 10px" }} />
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 14 }}>×</button>}
          </div>
          <div style={{ display: "flex", gap: 12, marginLeft: "auto", fontSize: 11, color: "var(--tx2)", fontWeight: 600 }}>
            {[3, 2, 1, 0].map(lv => (
              <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title={lv === 0 ? "0★ — has CSAT data but didn't reach champion/solid percentile on any topic" : undefined}>
                <span style={{ color: starColor(lv) }}>{lv > 0 ? renderStars(lv) : "0★"}</span>
                <span>{starCounts[lv]}</span>
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--tx3)" }} title="No topic met the survey threshold yet — these QAs need more CSAT data before we can score them">
              <span style={{ fontSize: 10, fontWeight: 500 }}>n/a</span>
              <span>{starCounts.no_sample}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card" style={{ padding: 0 }}>
        {visibleRows.length === 0 ? (
          <EmptyState title="No matches" description="No specialists meet the current filters." icon="M21 21l-4.35-4.35M16 11a5 5 0 11-10 0 5 5 0 0110 0z" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  {[
                    { k: "specialist", label: "Specialist", align: "left",  style: { minWidth: 180 } },
                    { k: "stars",      label: "Stars",      align: "left",  style: { width: 100 } },
                    { k: "score",      label: "Score",      align: "right", style: { width: 80 } },
                    { k: "champion",   label: "Champion topics", align: "left", style: { minWidth: 200 } },
                    { k: "solid",      label: "Solid topics",    align: "left", style: { minWidth: 200 } },
                    { k: "bnpl",       label: "BNPL",       align: "right", style: { width: 80 } },
                    { k: "card",       label: "Card",       align: "right", style: { width: 80 } },
                    { k: "universal",  label: "Universal",  align: "right", style: { width: 90 } },
                  ].map(c => (
                    <th key={c.k}
                        className={`sortable${sort.key === c.k ? " is-sorted" : ""}`}
                        onClick={() => toggleSort(c.k)}
                        title={`Sort by ${c.label}`}
                        style={{ textAlign: c.align, whiteSpace: "nowrap", ...(c.style || {}) }}>
                      {c.label}{sortArrow(c.k)}
                    </th>
                  ))}
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => {
                  const isExp = expanded === r.qa_email;
                  return (
                    <React.Fragment key={r.qa_email}>
                      <tr onClick={() => setExpanded(isExp ? null : r.qa_email)} style={{ cursor: "pointer" }}>
                        <td style={{ color: "var(--tx3)", fontWeight: 500 }}>{i + 1}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                              {nameFromEmail(r.qa_email).split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{nameFromEmail(r.qa_email)}</div>
                              <div style={{ fontSize: 10, color: "var(--tx3)" }}>{r.qa_email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {r.star_level > 0 ? (
                            <span title={starLabel(r.star_level)} style={{ fontSize: 14, color: starColor(r.star_level) }}>
                              {renderStars(r.star_level)}
                            </span>
                          ) : !hasSample(r) ? (
                            <span title={`No topic met the ${activeThreshold}-survey threshold this month`} style={{
                              fontSize: 10, fontWeight: 600,
                              padding: "2px 8px", borderRadius: 8,
                              background: "var(--bg)", color: "var(--tx3)",
                              border: "1px dashed var(--bd)",
                              whiteSpace: "nowrap",
                            }}>Not enough sample</span>
                          ) : (
                            <span title="Has CSAT data but didn't reach champion/solid percentile on any topic" style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>0★</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: starColor(r.star_level), fontVariantNumeric: "tabular-nums" }}>
                          {hasSample(r) ? fmtScore(r.expertise_score) : <span style={{ color: "var(--tx3)", fontWeight: 500 }}>—</span>}
                        </td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {(r.champion_topics || []).slice(0, 4).map(t => <TopicChip key={t} topic={t} strength="champion" />)}
                            {(r.champion_topics || []).length > 4 && <span style={{ fontSize: 10, color: "var(--tx3)", alignSelf: "center" }}>+{r.champion_topics.length - 4}</span>}
                            {(!r.champion_topics || r.champion_topics.length === 0) && <span style={{ color: "var(--tx3)", fontSize: 11 }}>—</span>}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {(r.solid_topics || []).slice(0, 4).map(t => <TopicChip key={t} topic={t} strength="solid" />)}
                            {(r.solid_topics || []).length > 4 && <span style={{ fontSize: 10, color: "var(--tx3)", alignSelf: "center" }}>+{r.solid_topics.length - 4}</span>}
                            {(!r.solid_topics || r.solid_topics.length === 0) && <span style={{ color: "var(--tx3)", fontSize: 11 }}>—</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: Number(r.bnpl_score) > 0 ? productColor("BNPL") : "var(--tx3)" }}>{fmtScore(r.bnpl_score)}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: Number(r.card_score) > 0 ? productColor("Card") : "var(--tx3)" }}>{fmtScore(r.card_score)}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: Number(r.universal_score) > 0 ? productColor("Universal") : "var(--tx3)" }}>{fmtScore(r.universal_score)}</td>
                        <td style={{ color: "var(--tx3)", fontSize: 11 }}>{isExp ? "▲" : "▼"}</td>
                      </tr>
                      {isExp && (
                        <tr style={{ background: "var(--bg)" }}>
                          <td colSpan={10} style={{ padding: "12px 16px 16px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
                              Topic breakdown · {(r.topic_breakdown || []).length} qualified topic{(r.topic_breakdown || []).length === 1 ? "" : "s"}
                            </div>
                            {(!r.topic_breakdown || r.topic_breakdown.length === 0) ? (
                              <span style={{ fontSize: 12, color: "var(--tx3)" }}>No topic met the {activeThreshold}-survey threshold this month.</span>
                            ) : (
                              <div className="table-wrap">
                                <table style={{ fontSize: 12 }}>
                                  <thead>
                                    <tr>
                                      <th>Topic</th>
                                      <th style={{ width: 70, textAlign: "right" }}>Surveys</th>
                                      <th style={{ width: 80, textAlign: "right" }}>CSAT %</th>
                                      <th style={{ width: 90, textAlign: "right" }}>Percentile</th>
                                      <th style={{ width: 90 }}>Strength</th>
                                      <th style={{ width: 60, textAlign: "right" }}>Tier</th>
                                      <th style={{ width: 90, textAlign: "right" }}>Contribution</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(r.topic_breakdown || []).map((t, idx) => (
                                      <tr key={idx}>
                                        <td>{t.topic}{productOf(t.topic) && <span style={{ fontSize: 9, fontWeight: 600, marginLeft: 6, color: productColor(productOf(t.topic)) }}>· {productOf(t.topic)}</span>}</td>
                                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.surveys_count}</td>
                                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(t.csat_score).toFixed(1)}%</td>
                                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>P{Number(t.percentile).toFixed(0)}</td>
                                        <td>{t.strength === "champion" ? <TopicChip topic="Champion" strength="champion" /> : t.strength === "solid" ? <TopicChip topic="Solid" strength="solid" /> : <span style={{ fontSize: 11, color: "var(--tx3)" }}>—</span>}</td>
                                        <td style={{ textAlign: "right", fontWeight: 600 }}>T{t.tier}</td>
                                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: Number(t.contribution) > 0 ? "var(--tx)" : "var(--tx3)" }}>{Number(t.contribution).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
                              <ProductBar label="BNPL" value={r.bnpl_score} />
                              <ProductBar label="Card" value={r.card_score} />
                              <ProductBar label="Universal" value={r.universal_score} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend at the bottom — small reminder of the scoring rules */}
      <div className="card" style={{ padding: "10px 14px", marginTop: 12, fontSize: 11, color: "var(--tx2)", display: "flex", gap: 18, flexWrap: "wrap" }}>
        <span><strong style={{ color: "var(--tabby-purple)" }}>⭐⭐⭐</strong> ≥ 1.70</span>
        <span><strong style={{ color: "var(--blue)" }}>⭐⭐</strong> ≥ 1.00</span>
        <span><strong style={{ color: "var(--green)" }}>⭐</strong> ≥ 0.20</span>
        <span style={{ color: "var(--tx3)" }}>·</span>
        <span><strong style={{ color: "var(--green)" }}>Champion</strong> = top 10% on a topic</span>
        <span><strong style={{ color: "var(--blue)" }}>Solid</strong> = next 20%</span>
        <span style={{ color: "var(--tx3)" }}>·</span>
        <span>Tier 1 (high-volume) topics weight 1.0, Tier 2 = 0.5, Tier 3 = 0.2</span>
      </div>
    </div>
  );
}
