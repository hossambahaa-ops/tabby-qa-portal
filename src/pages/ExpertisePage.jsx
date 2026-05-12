import React, { useState, useEffect, useMemo } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { nameFromEmail } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { useApp } from "../lib/AppContext.jsx";
import { fetchExpertise, fetchExpertiseMonths, fetchExpertiseConfig, saveExpertiseThreshold, recomputeExpertise, fetchCombinedExpertise, fetchCombinedExpertiseMonths, fetchCombinedPopulationCounts, recomputeCombinedExpertise, fetchCombinedThreshold, saveCombinedThreshold, renderStars, starColor, starLabel, productOf, productColor } from "../lib/expertise.js";
import SkeletonPage from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import PageFilters from "../components/PageFilters.jsx";

const fmtScore = (v) => Number(v || 0).toFixed(2);

// Faint background tint on leaderboard rows so the eye can group QAs
// by tier at a glance. Kept low-saturation so chips and text contrast
// stays readable; full color is reserved for the star itself.
const starTint = (lvl) => {
  const n = Number(lvl) || 0;
  if (n >= 3) return "rgba(245,158,11,.07)";
  if (n === 2) return "rgba(59,130,246,.06)";
  if (n === 1) return "rgba(34,197,94,.05)";
  return "transparent";
};

// Avatar color derived from the QA's email domain so Front Line vs
// CCU vs tabby.sa cluster recognition kicks in without reading text.
const avatarTone = (email) => {
  const d = (email || "").split("@")[1] || "";
  if (d === "tabby.sa") return { bg: "rgba(16,185,129,.18)", color: "var(--green)" };
  return { bg: "var(--accent-light)", color: "var(--accent-text)" };
};

// Star-tier text for screen-reader announcement. Pure text alternative
// to the visual ⭐⭐⭐ glyphs.
const starsAria = (lvl) => {
  const n = Number(lvl) || 0;
  if (n === 0) return "0 stars";
  if (n === 1) return "1 star";
  return `${n} stars`;
};

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
  const [selTeam, setSelTeam] = useState([]);
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
  // Combined view (admin-only): pool = QAs + Agents, hardcoded 5-survey
  // threshold. Agents never appear in the rendered output, only as part
  // of the comparison pool for percentile / star calculations.
  const [view, setView] = useState("qa"); // 'qa' | 'combined'
  const [combinedRows, setCombinedRows] = useState([]);
  const [combinedPopulation, setCombinedPopulation] = useState({ qaCount: 0, agentCount: 0 });
  const [recomputingCombined, setRecomputingCombined] = useState(false);
  // Combined view's own threshold — independent from the QA threshold.
  const [activeCombinedThreshold, setActiveCombinedThreshold] = useState(5);
  const [pendingCombinedThreshold, setPendingCombinedThreshold] = useState(5);
  const [combinedThresholdMeta, setCombinedThresholdMeta] = useState({ updated_at: null, updated_by: null });

  // Initial month + dropdowns + threshold config
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [ms, r, ps, cfg, ccfg] = await Promise.all([
          fetchExpertiseMonths({ token }),
          listRoster({ token, select: "email,queue,manager_email" }).catch(() => []),
          listProfiles({ token, select: "email,role" }).catch(() => []),
          fetchExpertiseConfig({ token }),
          fetchCombinedThreshold({ token }),
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
        const ct = Number(ccfg?.combined_min_surveys) || 5;
        setActiveCombinedThreshold(ct);
        setPendingCombinedThreshold(ct);
        setCombinedThresholdMeta({ updated_at: ccfg?.updated_at, updated_by: ccfg?.updated_by });
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

  // Reload combined-view rows + population counts whenever month changes
  // OR the user switches to the Combined tab. Admin-only — non-admins
  // get empty arrays from the SELECT due to RLS, so the view degrades
  // gracefully even if accessed via URL.
  useEffect(() => {
    if (!token || !selMonth || !isAdmin) return;
    let cancelled = false;
    (async () => {
      const [data, pop] = await Promise.all([
        fetchCombinedExpertise({ token, month: selMonth }),
        fetchCombinedPopulationCounts({ token, month: selMonth, threshold: activeCombinedThreshold }),
      ]);
      if (cancelled) return;
      setCombinedRows(Array.isArray(data) ? data : []);
      setCombinedPopulation(pop || { qaCount: 0, agentCount: 0 });
    })();
    return () => { cancelled = true; };
  }, [token, selMonth, isAdmin, view, activeCombinedThreshold]);

  // Recompute combined view (admin-only). Mirrors handleRecompute.
  const handleRecomputeCombined = async () => {
    setRecomputingCombined(true);
    try {
      const res = await recomputeCombinedExpertise({ token, month: null });
      const [data, pop] = await Promise.all([
        fetchCombinedExpertise({ token, month: selMonth }),
        fetchCombinedPopulationCounts({ token, month: selMonth, threshold: activeCombinedThreshold }),
      ]);
      setCombinedRows(Array.isArray(data) ? data : []);
      setCombinedPopulation(pop || { qaCount: 0, agentCount: 0 });
      globalToast?.("success", `Combined recomputed · ${res?.rows_upserted ?? "?"} rows refreshed`);
    } catch (e) {
      console.error("recompute combined:", e);
      globalToast?.("error", `Couldn't recompute combined: ${e?.message || "server error"}`);
    }
    setRecomputingCombined(false);
  };

  // Persist a new combined threshold + recompute every month with it.
  // Mirrors applyThreshold but writes to combined_min_surveys.
  const applyCombinedThreshold = async () => {
    const v = Math.max(1, Math.min(200, Math.round(Number(pendingCombinedThreshold) || 1)));
    if (v === activeCombinedThreshold) return;
    setRecomputingCombined(true);
    try {
      const res = await saveCombinedThreshold({ token, minSurveys: v, actorEmail: profile?.email });
      setActiveCombinedThreshold(v);
      setCombinedThresholdMeta({ updated_at: new Date().toISOString(), updated_by: profile?.email });
      const [data, pop] = await Promise.all([
        fetchCombinedExpertise({ token, month: selMonth }),
        fetchCombinedPopulationCounts({ token, month: selMonth, threshold: v }),
      ]);
      setCombinedRows(Array.isArray(data) ? data : []);
      setCombinedPopulation(pop || { qaCount: 0, agentCount: 0 });
      const upserted = res?.rows_upserted ?? "?";
      globalToast?.("success", `Combined threshold set to ${v} surveys · ${upserted} rows recomputed`);
    } catch (e) {
      console.error("combined threshold update:", e);
      globalToast?.("error", `Couldn't update combined threshold: ${e?.message || "permission denied or server error"}`);
      setPendingCombinedThreshold(activeCombinedThreshold);
    }
    setRecomputingCombined(false);
  };

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

  // Apply role-based visibility + UI filters. Source rows depend on the
  // active view: "qa" reads from rows (qa_expertise table), "combined"
  // reads from combinedRows (combined_expertise table — admin-only).
  const visibleRows = useMemo(() => {
    let r = view === "combined" ? combinedRows : rows;
    if (isQAOnly) {
      r = r.filter(x => x.qa_email?.toLowerCase() === myEmail);
    } else if (isLead && !isSupervisor && teamEmailsForMe) {
      r = r.filter(x => teamEmailsForMe.has(x.qa_email?.toLowerCase()) || x.qa_email?.toLowerCase() === myEmail);
    } else if (isSupervisor && !isAdmin && myDomain) {
      r = r.filter(x => x.qa_email?.toLowerCase().endsWith("@" + myDomain));
    }
    if (selDomain) r = r.filter(x => x.qa_email?.toLowerCase().endsWith("@" + selDomain));
    if (selTeam.length > 0) r = r.filter(x => selTeam.includes(rosterMap[x.qa_email?.toLowerCase()]?.queue));
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
  }, [view, rows, combinedRows, isQAOnly, isLead, isSupervisor, isAdmin, teamEmailsForMe, myEmail, myDomain, selDomain, selTeam, selStar, search, rosterMap]);

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
      case "default":
        // In Combined view, the natural ordering is by pool rank
        // ascending — so #1 of 769 is at the top, then #2, then #3,
        // not by star group (which scrambles ranks within each tier).
        // QA view keeps the star/score-first ordering it always had.
        if (view === "combined") {
          return r.combined_rank ? (100000 - Number(r.combined_rank)) : 0;
        }
        return Number(r.star_level || 0) * 10000 + Number(r.expertise_score || 0);
      case "specialist": return nameFromEmail(r.qa_email).toLowerCase();
      case "stars":      return Number(r.star_level || 0) * 10000 + Number(r.expertise_score || 0);
      case "score":      return Number(r.expertise_score || 0);
      case "champion":   return (r.champion_topics || []).length;
      case "solid":      return (r.solid_topics || []).length;
      case "bnpl":       return Number(r.bnpl_score || 0);
      case "card":       return Number(r.card_score || 0);
      case "universal":  return Number(r.universal_score || 0);
      // Pool Rank: lower rank = better. Encode as (max - rank) so the
      // existing "desc = highest val first" logic puts #1 at the top.
      case "poolrank":   return r.combined_rank ? (100000 - Number(r.combined_rank)) : 0;
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
          <div className="page-title">
            Expertise
            <span title={`Pilot version — based on ${selMonth} data only. Expertise calls will sharpen as 3+ months accumulate.`} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "var(--amber-bg)", color: "var(--amber)", marginLeft: 8, verticalAlign: "middle", cursor: "help" }}>PILOT</span>
          </div>
          <div className="page-subtitle">CSAT-driven topic mastery — {visibleRows.length} specialist{visibleRows.length === 1 ? "" : "s"} · {selMonth} · ≥{activeThreshold} survey{activeThreshold === 1 ? "" : "s"} per topic</div>
        </div>
      </div>

      {/* Tab strip — admin-only. The Combined view ranks QAs against the
          merged QA + Agent pool with a hardcoded 5-survey threshold.
          Agents never appear in the rendered output, only in the math. */}
      {isAdmin && (
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--bd)", marginBottom: 16, overflowX: "auto" }}>
          {[
            { key: "qa",       label: "QA Expertise" },
            { key: "combined", label: "Combined (QAs + Agents)" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 18px", border: "none",
                borderBottom: view === t.key ? "2px solid var(--tabby-purple)" : "2px solid transparent",
                background: "transparent", cursor: "pointer",
                fontSize: 13, fontWeight: view === t.key ? 700 : 500,
                color: view === t.key ? "var(--tabby-purple)" : "var(--tx2)",
                fontFamily: "var(--font)", whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Combined-view header — population counts only. The Recompute
          combined button lives in the threshold card below alongside
          the threshold input, mirroring the QA-tab layout. */}
      {isAdmin && view === "combined" && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderLeft: "3px solid var(--tabby-purple)" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Pool</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            <strong>{combinedPopulation.qaCount}</strong> QAs + <strong>{combinedPopulation.agentCount}</strong> Agents = <strong>{combinedPopulation.qaCount + combinedPopulation.agentCount}</strong> scorers
          </span>
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>· {activeCombinedThreshold}+ surveys per topic · {selMonth}</span>
        </div>
      )}

      {/* Admin threshold control + manual recompute. Whole page is
          admin-only at the route level, so no extra role gate needed.
          Each view has its own threshold (qa_expertise_config.min_surveys
          for QA, .combined_min_surveys for Combined) so they can be
          tuned independently. */}
      {view !== "combined" && (
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
      )}

      {/* Parallel threshold control for the Combined view. Independent
          from the QA threshold above so admins can tune them separately. */}
      {view === "combined" && (
        <div className="card" style={{ padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Combined threshold</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number" min={1} max={200}
              value={pendingCombinedThreshold}
              onChange={e => setPendingCombinedThreshold(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") applyCombinedThreshold(); }}
              disabled={recomputingCombined}
              className="form-input"
              style={{ width: 64, fontSize: 12, padding: "5px 8px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
            />
            <span style={{ fontSize: 11, color: "var(--tx3)" }}>min surveys per topic</span>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={applyCombinedThreshold}
            disabled={recomputingCombined || Number(pendingCombinedThreshold) === activeCombinedThreshold}
            style={{ fontSize: 11 }}
          >
            {recomputingCombined ? "Recomputing…" : Number(pendingCombinedThreshold) !== activeCombinedThreshold ? `Apply ${pendingCombinedThreshold}` : `Active: ${activeCombinedThreshold}`}
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleRecomputeCombined}
            disabled={recomputingCombined}
            title="Re-run the combined expertise calculation against the current threshold"
            style={{ fontSize: 11 }}
          >
            ↻ Recompute combined
          </button>
          {[3, 5, 8, 12, 20].map(v => (
            <button
              key={v}
              onClick={() => setPendingCombinedThreshold(v)}
              disabled={recomputingCombined}
              className={`pill${v === activeCombinedThreshold ? " pill-tone-purple" : ""}`}
              style={{ cursor: "pointer", fontSize: 11 }}
            >
              {v}
            </button>
          ))}
          {combinedThresholdMeta.updated_at && (
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx3)" }}>
              Last changed {new Date(combinedThresholdMeta.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{combinedThresholdMeta.updated_by ? ` by ${combinedThresholdMeta.updated_by.split("@")[0]}` : ""}
            </span>
          )}
        </div>
      )}

      {/* Unified PageFilters strip — same component, same spot, same
          clear behaviour as MTD/Leaderboard/CSAT. The star-level
          distribution histogram moved to its own compact card below
          since it's a stat display, not a filter (though clicking a
          bar still filters by that star tier). Native <select>s
          replaced with SearchableSelect for visual consistency with
          every other migrated page. */}
      <PageFilters
        onClear={() => { setSelDomain(""); setSelTeam([]); setSelStar(""); setSearch(""); }}
        searchProps={{ value: search, onChange: setSearch, placeholder: "Search name or email…" }}
      >
        <SearchableSelect options={months} value={selMonth} onChange={setSelMonth} placeholder="Select month"/>
        {!isQAOnly && (
          <SearchableSelect
            options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]}
            value={selDomain} onChange={setSelDomain} placeholder="All domains"
          />
        )}
        {!isQAOnly && (
          <SearchableSelect multi options={teams} value={selTeam} onChange={setSelTeam} placeholder={`All teams (${teams.length})`}/>
        )}
        <SearchableSelect
          options={[
            { value: "3",          label: "⭐⭐⭐ Triple-domain" },
            { value: "2",          label: "⭐⭐ Cross-domain" },
            { value: "1",          label: "⭐ Specialist" },
            { value: "0_lowperf",  label: "0★ — has data, low rank" },
            { value: "no_sample",  label: "Not enough sample yet" },
          ]}
          value={selStar} onChange={setSelStar} placeholder="All star levels"
        />
      </PageFilters>

      {/* Star-level distribution histogram. Click a bar to filter to
          that bucket; click again to clear. */}
      <div className="card" style={{ padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "var(--tx3)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px" }}>Distribution</span>
        {(() => {
          const bars = [
            { key: "3", lvl: 3, label: "⭐⭐⭐", color: starColor(3), val: starCounts[3] || 0 },
            { key: "2", lvl: 2, label: "⭐⭐",   color: starColor(2), val: starCounts[2] || 0 },
            { key: "1", lvl: 1, label: "⭐",     color: starColor(1), val: starCounts[1] || 0 },
            { key: "0", lvl: 0, label: "0★",     color: "var(--tx3)", val: starCounts[0] || 0 },
            { key: "n", lvl: null, label: "n/a", color: "var(--bd)", val: starCounts.no_sample || 0 },
          ];
          const max = Math.max(...bars.map(b => b.val), 1);
          return (
            <div role="img" aria-label={`Distribution: ${bars.map(b => `${b.val} ${b.label}`).join(", ")}`} style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 38 }}>
              {bars.map(b => (
                <div
                  key={b.key}
                  onClick={() => {
                    if (b.lvl == null) setSelStar(selStar === "no_sample" ? "" : "no_sample");
                    else if (b.lvl === 0) setSelStar(selStar === "0_lowperf" ? "" : "0_lowperf");
                    else setSelStar(String(selStar) === String(b.lvl) ? "" : String(b.lvl));
                  }}
                  title={`${b.val} ${b.label === "n/a" ? "QA(s) not enough sample" : b.label + " QA" + (b.val === 1 ? "" : "s")}`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", minWidth: 28 }}
                >
                  <span style={{ fontSize: 9, fontWeight: 700, color: b.color, lineHeight: 1, marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>{b.val}</span>
                  <div style={{
                    width: 18,
                    height: `${Math.max(2, (b.val / max) * 22)}px`,
                    background: b.color,
                    borderRadius: 2,
                    transition: "height .2s",
                    opacity: b.val === 0 ? 0.25 : 1,
                  }} />
                  <span style={{ fontSize: 9, color: "var(--tx3)", marginTop: 2, lineHeight: 1 }}>{b.label}</span>
                </div>
              ))}
            </div>
          );
        })()}
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
                    ...(view === "combined" ? [{ k: "poolrank", label: "Pool Rank", align: "right", style: { width: 110 } }] : []),
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
                  const lvl = Number(r.star_level) || 0;
                  const baseTint = starTint(lvl);
                  const av = avatarTone(r.qa_email);
                  return (
                    <React.Fragment key={r.qa_email}>
                      <tr
                        onClick={() => setExpanded(isExp ? null : r.qa_email)}
                        style={{ cursor: "pointer", background: baseTint, transition: "background .15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = baseTint; }}
                      >
                        <td style={{ color: "var(--tx3)", fontWeight: 500 }}>{i + 1}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div title={(r.qa_email || "").split("@")[1] || ""} style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: av.bg, color: av.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                              {nameFromEmail(r.qa_email).split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{nameFromEmail(r.qa_email)}</div>
                              <div style={{ fontSize: 10, color: "var(--tx3)" }}>{r.qa_email}</div>
                            </div>
                          </div>
                        </td>
                        {view === "combined" && (
                          <td style={{ textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                            {r.combined_rank ? (
                              <span title={`Ranked #${r.combined_rank} of ${r.combined_pool_size} scorers (QAs + Agents) with at least one qualified topic in this month's pool`}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: r.combined_rank <= 50 ? "var(--green)" : r.combined_rank <= 200 ? "var(--blue)" : "var(--tx2)" }}>#{r.combined_rank}</span>
                                <span style={{ fontSize: 11, color: "var(--tx3)", marginLeft: 4 }}>/ {r.combined_pool_size}</span>
                              </span>
                            ) : (
                              <span title="Not enough qualified topics this month to enter the merged ranking pool" style={{ fontSize: 11, color: "var(--tx3)", fontStyle: "italic" }}>unranked</span>
                            )}
                          </td>
                        )}
                        <td>
                          {r.star_level > 0 ? (
                            <span aria-label={`${starsAria(r.star_level)} — ${starLabel(r.star_level)}`} title={starLabel(r.star_level)} style={{ fontSize: 14, color: starColor(r.star_level) }}>
                              {renderStars(r.star_level)}
                            </span>
                          ) : !hasSample(r) ? (
                            <span aria-label={`Not enough surveys yet — needs at least ${activeThreshold} per topic`} title={`No topic met the ${activeThreshold}-survey threshold this month — keep handling chats and the score will follow`} style={{
                              fontSize: 10, fontWeight: 600,
                              padding: "2px 8px", borderRadius: 8,
                              background: "var(--amber-bg)", color: "var(--amber)",
                              border: "1px solid var(--amber)",
                              whiteSpace: "nowrap",
                            }}>Needs ≥{activeThreshold} surveys</span>
                          ) : (
                            <span aria-label="0 stars — has data but did not reach champion or solid percentile" title="Has CSAT data but didn't reach champion/solid percentile on any topic" style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600 }}>0★</span>
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
                          <td colSpan={view === "combined" ? 11 : 10} style={{ padding: "12px 16px 16px" }}>
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
