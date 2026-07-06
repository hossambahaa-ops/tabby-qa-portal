import React, { useState, useEffect, useRef } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb } from "../lib/supabase.js";
import { csatPctValue, csatColor, normalizeTopic, nameFromEmail, emailsMatchLoose } from "../lib/utils.js";
import QuartilePill from "../components/QuartilePill.jsx";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listMtd } from "../api/mtd.js";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import PageFilters from "../components/PageFilters.jsx";
import CsatTopicMatrix from "../components/csat/CsatTopicMatrix.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState, useUrlStateMulti } from "../lib/useUrlState.jsx";

// Navigate to a QA's profile. Same hash-router pattern used by every
// other clickable QA name in the app (Occupancy card, Score Entry
// context menu, etc.).
const goToProfile = (qaEmail) => {
  window.location.hash = `#/profile?qa=${encodeURIComponent(qaEmail)}`;
};

// Compact "x ago" for the quartile freshness indicator. Mirrors
// FreshnessBadge.fmtAge, but kept local and neutral-toned — the quartile
// population is a once-daily feed, so we don't want red "stale" colours.
const fmtAgo = (ts) => {
  if (!ts) return null;
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function CSATPage() {
  const { token, profile, gf } = useApp();
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [cutoffs, setCutoffs] = useState([]); // CSAT quartile cutoffs for the selected month
  const [quartilesUpdatedAt, setQuartilesUpdatedAt] = useState(null); // when csat_population was last loaded (daily 19:00 Riyadh sync)
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  // Filter state — persistent ones go through useUrlState so refresh
  // keeps your context and the URL is shareable. selQA stays local
  // since it's a multi-select with potentially many emails (too noisy
  // in the URL). Same pattern as Score Entry / Leaderboard.
  const [selMonth, setSelMonth] = useUrlState("month", "");
  const [selDomain, setSelDomain] = useUrlState("domain", "");
  // selTeam and selTL are arrays (multi-select). Stored in the URL
  // as comma-separated strings via useUrlStateMulti.
  const [selTeam, setSelTeam] = useUrlStateMulti("team");
  const [selTL, setSelTL] = useUrlStateMulti("lead");
  const [selQA, setSelQA] = useState([]);
  const [csatView, setCsatView] = useUrlState("view", "qa"); // qa | lead | topic
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [expandedLead, setExpandedLead] = useState(null);
  const [topics, setTopics] = useState({}); // key: `${email}__${month}`
  const [leadTopics, setLeadTopics] = useState({}); // key: `${leadKey}__${month}`
  const [topicsLoading, setTopicsLoading] = useState(null);
  const [leadTopicsLoading, setLeadTopicsLoading] = useState(null);
  const [topicMatrixByMonth, setTopicMatrixByMonth] = useState({}); // key: month -> { topics, cells, totalsByTopic, totalsByAgent }
  const [topicMatrixLoading, setTopicMatrixLoading] = useState(false);
  const [topicMinSurveys, setTopicMinSurveys] = useState(0);
  const [topicSort, setTopicSort] = useState({ key: null, dir: "desc" }); // key: topic name | "__name__" | null (overall)
  // Auto-refresh tick — bumped every minute so the load effect below
  // re-runs and picks up newly-imported CSAT surveys without the user
  // having to navigate away. Filter-driven re-runs still go through
  // the same effect; we just gate the month/team auto-selection so it
  // doesn't yank the user back to the latest month on each refresh.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setReloadKey(k => k + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Per-(domain, LOB) quartile cutoffs for the selected month, written by
  // recalculate_csat_quartiles. Surfaced as a reference strip so leads can
  // see the Q1 threshold (p75): a QA at/above it is Q1, below it Q2/Q3/Q4.
  useEffect(() => {
    if (!selMonth || !token) { setCutoffs([]); return; }
    let alive = true;
    sb.query("csat_quartile_cutoffs", {
      token,
      select: "domain,lob,cohort_size,p75,p50,p25",
      filters: `month=eq.${encodeURIComponent(selMonth)}&order=lob.asc,domain.asc`,
    }).then(rows => { if (alive) setCutoffs(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setCutoffs([]); });
    // When the resolver population (the quartile basis) was last loaded.
    // Surfaced as a small freshness note on the thresholds strip.
    sb.rpc("csat_quartiles_last_updated", {}, token)
      .then(ts => { if (alive) setQuartilesUpdatedAt(typeof ts === "string" ? ts : null); })
      .catch(() => { if (alive) setQuartilesUpdatedAt(null); });
    return () => { alive = false; };
  }, [selMonth, token, reloadKey]);

  const lastFilterKey = useRef("");

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows, profRows, csatTopicRows] = await Promise.all([
          listMtd({ token, filters: "order=month.desc,qa_email.asc" }),
          listRoster({ token, select: "email,queue,manager_email" }),
          listProfiles({ token, select: "id,email,role", cacheKey: "profiles_slim" }),
          sb.query("csat_by_topic", { token, select: "qa_email,month,good,bad" }).catch(() => []),
        ]);
        setRoster(rosterRows);
        // Mirror ScoreEntryPage filtering: exclude non-QA profiles and entries
        // not managed by a recognised lead. Both qa_lead AND qa_supervisor
        // count as valid managers — some QAs (and SQAs) report directly to
        // a supervisor (e.g. Amer Saad's reports), and previously they were
        // dropped from CSAT just because their TL wasn't a qa_lead.
        const leadRoles = new Set(["qa_lead", "qa_supervisor"]);
        const qaLeadSet = new Set();
        profRows.filter(p => leadRoles.has(p.role)).forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          qaLeadSet.add(email);
          const local = email.split("@")[0];
          qaLeadSet.add(local);
          if (email.endsWith("@tabby.ai")) qaLeadSet.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) qaLeadSet.add(local + "@tabby.ai");
        });
        // Senior QAs handle customer chats just like QAs, so their CSAT
        // surveys are meaningful here. Only profile roles outside this
        // allow-list (qa_lead, qa_supervisor, admin, etc.) get blacklisted.
        const csatRoles = new Set(["qa", "senior_qa"]);
        const blacklist = new Set();
        profRows.filter(p => !csatRoles.has(p.role)).forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          blacklist.add(email);
          const local = email.split("@")[0];
          if (email.endsWith("@tabby.ai")) blacklist.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) blacklist.add(local + "@tabby.ai");
        });
        const rosterMgrValid = new Set(rosterRows.filter(r => {
          const mgr = r.manager_email?.toLowerCase();
          if (!mgr) return false;
          return qaLeadSet.has(mgr) || qaLeadSet.has(mgr.split("@")[0]);
        }).map(r => r.email?.toLowerCase()));
        // Bring in QAs who have CSAT surveys in csat_by_topic
        // (Q_Support_Performance) but no mtd_scores row for that month yet
        // (e.g. not in the MTD sheet so far, mid-month). Their CSAT good/bad/
        // surveys come from csat_by_topic; TL/LOB from the roster; ticket-level
        // columns stay blank. This makes the CSAT tab reflect the fresh CSAT
        // source rather than only the (lagging) MTD sheet.
        const csatAgg = new Map();
        for (const t of (csatTopicRows || [])) {
          const em = (t.qa_email || "").toLowerCase();
          if (!em || !t.month) continue;
          const k = `${em} ${t.month}`;
          const a = csatAgg.get(k) || { good: 0, bad: 0, email: t.qa_email, month: t.month };
          a.good += Number(t.good || 0); a.bad += Number(t.bad || 0);
          csatAgg.set(k, a);
        }
        const mtdKeys = new Set(rows.map(r => `${(r.qa_email || "").toLowerCase()} ${r.month}`));
        const rosterByEmail = new Map(rosterRows.map(r => [(r.email || "").toLowerCase(), r]));
        const csatOnlyRows = [];
        for (const a of csatAgg.values()) {
          if (mtdKeys.has(`${a.email.toLowerCase()} ${a.month}`)) continue;
          const total = a.good + a.bad;
          if (total <= 0) continue;
          const ros = rosterByEmail.get(a.email.toLowerCase());
          csatOnlyRows.push({
            qa_email: a.email, month: a.month,
            qa_tl: ros?.manager_email || null,
            lob: ros?.queue || null,
            csat_good: a.good, csat_bad: a.bad, csat_total: total,
            csat_pct: (a.good / total * 100).toFixed(2) + "%",
            tickets_touched: null, abt: null, csat_quartile: null,
          });
        }
        const allRows = csatOnlyRows.length ? rows.concat(csatOnlyRows) : rows;
        const filtered = allRows.filter(r => {
          const em = r.qa_email?.toLowerCase();
          if (blacklist.has(em)) return false;
          const tl = r.qa_tl?.toLowerCase();
          if (tl && !qaLeadSet.has(tl) && !qaLeadSet.has(tl.split("@")[0])) return false;
          if (rosterRows.some(x => x.email?.toLowerCase() === em)) {
            return rosterMgrValid.has(em);
          }
          return true;
        });
        setData(filtered);
        const uniqueMonths = sortMonthsDesc([...new Set(filtered.map(r => r.month))]);
        setMonths(uniqueMonths);
        // Only auto-pick month/team when the effect was triggered by a
        // filter change (token / gf), NOT by a reloadKey bump — otherwise
        // a user who picked a prior month would get bounced back to the
        // latest every 60 s.
        const filterKey = `${token || ""}|${gf?.month || ""}|${(gf?.teams || []).join(",")}`;
        if (lastFilterKey.current !== filterKey) {
          lastFilterKey.current = filterKey;
          if (uniqueMonths.length > 0) setSelMonth(uniqueMonths[0]);
          // CSAT is intentionally unscoped by domain: every user — including
          // supervisors who are domain-locked at the global level — should
          // see the full dataset across By QA / By Lead / By Topic, and
          // narrow with the page's own filter dropdowns if they want.
          if (gf?.month && uniqueMonths.includes(gf.month)) setSelMonth(gf.month);
          if (gf?.teams?.length > 0) setSelTeam(gf.teams.filter(Boolean));
        }
      } catch (e) { console.error("CSAT:", e); }
      setLoading(false);
    })();
  }, [token, gf?.month, gf?.teams, reloadKey]);

  const monthData = data.filter(r => r.month === selMonth);
  // Literal previous calendar month for the selected month (e.g.
  // "Apr-2026" → "Mar-2026"). We use the calendar prev — not just
  // `months[1]` — so a missing intermediate month doesn't silently
  // make the comparison span 2 months. If parsing fails, prev is
  // null and the delta column just renders "—".
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const prevMonth = (() => {
    if (!selMonth) return null;
    const [m, y] = selMonth.split("-");
    const idx = MON.indexOf(m);
    if (idx < 0 || !y) return null;
    const d = new Date(parseInt(y), idx - 1, 1);
    return `${MON[d.getMonth()]}-${d.getFullYear()}`;
  })();
  // Map qa_email (lowercased) → previous-month CSAT % (number) so we
  // can compute the per-QA delta without re-scanning data per row.
  // Keyed by local-part so the same QA's cross-domain previous-month
  // row (e.g. @tabby.sa last month, @tabby.ai this month) is found.
  const prevByEmail = {};
  if (prevMonth) {
    data.filter(r => r.month === prevMonth).forEach(r => {
      const v = csatPctValue(r.csat_pct);
      const s = Number(r.csat_total || 0);
      const key = (r.qa_email || "").toLowerCase().split("@")[0];
      if (v != null && s > 0 && key) prevByEmail[key] = { v, s };
    });
  }
  const lookupPrev = (email) => {
    const k = (email || "").toLowerCase().split("@")[0];
    return k ? prevByEmail[k] : null;
  };
  const rosterMap = {}; roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  // Skip compound LOBs ("CCU, Escalation, Dispute") that occasionally
  // sneak in from the roster CSV — they're never a real team.
  const scoreTeams = [...new Set(roster.filter(r => r.queue && !r.queue.includes(",") && (!selDomain || r.email?.endsWith("@" + selDomain))).map(r => r.queue))].sort();
  const tlEmails = [...new Set(monthData.map(r => r.qa_tl).filter(Boolean))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@" + selDomain));
  if (selTeam.length > 0) filtered = filtered.filter(r => selTeam.includes(rosterMap[r.qa_email?.toLowerCase()]?.queue));
  if (selTL.length > 0) filtered = filtered.filter(r => selTL.includes(r.qa_tl));
  if (selQA.length > 0) {
    // Match by local-part so cross-domain duplicates of the same
    // person collapse. selQA may hold local-parts (new dropdown
    // format) or full emails (legacy saved views) — normalize both.
    const selLocals = new Set(selQA.map(e => String(e || "").toLowerCase().split("@")[0]));
    filtered = filtered.filter(r => selLocals.has(String(r.qa_email || "").toLowerCase().split("@")[0]));
  }
  // gf.people / gf.teams were dropped in the filter unification —
  // CSAT's selQA / selTeam dropdowns cover the same scoping.

  // A QA with zero surveys has no CSAT signal to report — hide them
  // from every view so the page only shows people with actual data.
  const csatSorted = [...filtered]
    .filter(r => Number(r.csat_total || 0) > 0)
    .sort((a, b) => {
      const pa = csatPctValue(a.csat_pct) ?? -1;
      const pb = csatPctValue(b.csat_pct) ?? -1;
      if (pa !== pb) return pb - pa;
      // Tiebreaker: more surveys → higher row.
      return Number(b.csat_total || 0) - Number(a.csat_total || 0);
    });
  // csat_by_topic.month is stored as text ("Apr-2026"), matching the
  // mtd_scores.month convention — NOT a date.
  const monthKey = selMonth || null;
  const topicKey = (email) => `${email}__${monthKey}`;

  const toggleRow = async (email) => {
    if (expandedEmail === email) { setExpandedEmail(null); return; }
    setExpandedEmail(email);
    const key = topicKey(email);
    if (topics[key] || !monthKey) return;
    setTopicsLoading(email);
    try {
      const rows = await sb.query("csat_by_topic", {
        select: "topic,csat_score,surveys_count",
        filters: `qa_email=eq.${encodeURIComponent(email)}&month=eq.${encodeURIComponent(monthKey)}`,
        token
      });
      // The import writes both a "bare" rollup row (e.g. "Billing & Repayment")
      // AND a no-sub-category variant ("Billing & Repayment -") whose surveys
      // are already counted inside the bare row. Summing them would double-count.
      // Keep the variant with the most surveys per normalized topic (= the
      // rollup when it exists, otherwise the only row we have).
      const pick = {};
      (rows || []).forEach(t => {
        const norm = normalizeTopic(t.topic);
        const surveys = Number(t.surveys_count || 0);
        const score = t.csat_score != null ? Number(t.csat_score) : null;
        if (!pick[norm] || surveys > pick[norm].surveys_count) {
          pick[norm] = { topic: norm, csat_score: score, surveys_count: surveys };
        }
      });
      const aggRows = Object.values(pick).sort((x, y) => {
        const diff = (y.csat_score ?? -1) - (x.csat_score ?? -1);
        if (diff !== 0) return diff;
        return (y.surveys_count || 0) - (x.surveys_count || 0);
      });
      setTopics(prev => ({ ...prev, [key]: aggRows }));
    } catch (e) { setTopics(prev => ({ ...prev, [key]: [] })); }
    setTopicsLoading(null);
  };

  const csatLeads = (() => {
    const map = {};
    csatSorted.forEach(r => {
      const tl = (r.qa_tl || "unknown").toLowerCase();
      if (!map[tl]) map[tl] = { tl: r.qa_tl || "Unknown", emails: [], count: 0, weightedSum: 0, weight: 0, simpleSum: 0, simpleCount: 0, surveys: 0, good: 0, bad: 0 };
      const l = map[tl];
      l.emails.push(r.qa_email);
      l.count++;
      const score = csatPctValue(r.csat_pct);
      if (score != null) {
        const surveys = Number(r.csat_total || 0);
        l.simpleSum += score; l.simpleCount++;
        if (surveys > 0) { l.weightedSum += score * surveys; l.weight += surveys; }
        l.surveys += surveys;
        l.good += Number(r.csat_good || 0);
        l.bad += Number(r.csat_bad || 0);
      }
    });
    // Prev-month weighted CSAT per lead — same formula as current,
    // restricted to last month's rows. Lets us drop a "Δ vs prev"
    // column next to each lead's CSAT %.
    const prevByTl = {};
    if (prevMonth) {
      data.filter(r => r.month === prevMonth).forEach(r => {
        const tl = (r.qa_tl || "unknown").toLowerCase();
        if (!prevByTl[tl]) prevByTl[tl] = { w: 0, n: 0, simpleSum: 0, simpleCount: 0 };
        const a = prevByTl[tl];
        const score = csatPctValue(r.csat_pct);
        if (score == null) return;
        const surveys = Number(r.csat_total || 0);
        a.simpleSum += score; a.simpleCount++;
        if (surveys > 0) { a.w += score * surveys; a.n += surveys; }
      });
    }
    return Object.values(map).map(l => {
      const tlKey = (l.tl || "unknown").toLowerCase();
      const p = prevByTl[tlKey];
      const prevCsat = p ? (p.n > 0 ? p.w / p.n : (p.simpleCount > 0 ? p.simpleSum / p.simpleCount : null)) : null;
      return {
        ...l,
        csat: l.weight > 0 ? l.weightedSum / l.weight : (l.simpleCount > 0 ? l.simpleSum / l.simpleCount : null),
        prevCsat,
      };
    }).sort((a, b) => {
      const ca = b.csat ?? -1, cb = a.csat ?? -1;
      if (ca !== cb) return ca - cb;
      return (b.surveys || 0) - (a.surveys || 0);
    });
  })();

  // Render helper for the Δ cell — keeps the JSX below readable.
  // Returns a <td> with an arrow + signed delta in pts, coloured
  // green/red/gray. "—" when either side is missing.
  const renderDelta = (cur, prev, { padding = "4px 8px" } = {}) => {
    if (cur == null || prev == null) {
      return <td style={{ textAlign: "right", fontSize: 12, color: "var(--tx3)", padding, fontVariantNumeric: "tabular-nums" }}>—</td>;
    }
    const d = cur - prev;
    const abs = Math.abs(d);
    // Treat sub-0.05pt swings as flat — avoids "↑ 0.0 pts" noise from
    // rounding when the underlying CSAT was effectively unchanged.
    const flat = abs < 0.05;
    const arrow = flat ? "→" : d > 0 ? "↑" : "↓";
    const color = flat ? "var(--tx3)" : d > 0 ? "var(--green)" : "var(--red)";
    return (
      <td style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color, padding, fontVariantNumeric: "tabular-nums" }}
          title={`Current ${cur.toFixed(1)}% vs prev ${prev.toFixed(1)}%`}>
        {arrow} {abs.toFixed(1)} pts
      </td>
    );
  };

  const toggleLeadRow = async (lead) => {
    const tlKey = (lead.tl || "unknown").toLowerCase();
    if (expandedLead === tlKey) { setExpandedLead(null); return; }
    setExpandedLead(tlKey);
    const key = `${tlKey}__${monthKey}`;
    if (leadTopics[key] || !monthKey || lead.emails.length === 0) return;
    setLeadTopicsLoading(tlKey);
    try {
      const emailList = lead.emails.map(e => `"${e}"`).join(",");
      const rows = await sb.query("csat_by_topic", {
        select: "qa_email,topic,csat_score,surveys_count",
        filters: `qa_email=in.(${emailList})&month=eq.${encodeURIComponent(monthKey)}`,
        token
      });
      // Step 1: dedupe variants per (qa, normalized topic) — keep the row
      // with the most surveys (= the bare rollup when present).
      const perQa = {};
      (rows || []).forEach(t => {
        const norm = normalizeTopic(t.topic);
        const surveys = Number(t.surveys_count || 0);
        const score = t.csat_score != null ? Number(t.csat_score) : null;
        const key2 = t.qa_email + "\u0000" + norm;
        if (!perQa[key2] || surveys > perQa[key2].surveys) {
          perQa[key2] = { topic: norm, score, surveys };
        }
      });
      // Step 2: aggregate across QAs by normalized topic (survey-weighted).
      const agg = {};
      Object.values(perQa).forEach(({ topic, score, surveys }) => {
        if (!agg[topic]) agg[topic] = { topic, w: 0, n: 0, s: 0, simpleSum: 0, simpleCount: 0 };
        const a = agg[topic];
        if (score != null) {
          a.simpleSum += score; a.simpleCount++;
          if (surveys > 0) { a.w += score * surveys; a.n += surveys; a.s += surveys; }
        }
      });
      const aggRows = Object.values(agg).map(a => ({
        topic: a.topic,
        csat_score: a.n > 0 ? a.w / a.n : (a.simpleCount > 0 ? a.simpleSum / a.simpleCount : null),
        surveys_count: a.s,
      })).sort((x, y) => {
        const sx = y.csat_score ?? -1, sy = x.csat_score ?? -1;
        if (sx !== sy) return sx - sy;
        return (y.surveys_count || 0) - (x.surveys_count || 0);
      });
      setLeadTopics(prev => ({ ...prev, [key]: aggRows }));
    } catch (e) { setLeadTopics(prev => ({ ...prev, [key]: [] })); }
    setLeadTopicsLoading(null);
  };

  // Matrix view: fetch all scoped csat_by_topic rows for the month, pivot
  // into { agent -> topic -> {score, surveys} }.
  const scopedEmailsKey = csatSorted.map(r => r.qa_email).join(",");
  useEffect(() => {
    if (csatView !== "topic" || !monthKey) return;
    const cached = topicMatrixByMonth[monthKey + "::" + scopedEmailsKey];
    if (cached) return;
    const emails = csatSorted.map(r => r.qa_email);
    if (emails.length === 0) {
      setTopicMatrixByMonth(prev => ({ ...prev, [monthKey + "::" + scopedEmailsKey]: { topics: [], cells: {}, totalsByTopic: {}, totalsByAgent: {} } }));
      return;
    }
    setTopicMatrixLoading(true);
    (async () => {
      const CHUNK = 80;
      const all = [];
      try {
        for (let i = 0; i < emails.length; i += CHUNK) {
          const slice = emails.slice(i, i + CHUNK);
          const emailList = slice.map(e => `"${e}"`).join(",");
          const rows = await sb.query("csat_by_topic", {
            select: "qa_email,topic,csat_score,surveys_count",
            filters: `qa_email=in.(${emailList})&month=eq.${encodeURIComponent(monthKey)}`,
            token
          });
          all.push(...(rows || []));
        }
        const topicsSet = new Set();
        // Step 1: dedupe variants per (agent, normalized topic) — keep the
        // row with the most surveys (= the bare rollup when it exists,
        // otherwise the only row). Summing variants double-counts the
        // subset rows the import writes alongside rollups.
        const pickByCell = {}; // key -> { score, surveys }
        all.forEach(r => {
          if (!r.topic) return;
          const topic = normalizeTopic(r.topic);
          topicsSet.add(topic);
          const score = r.csat_score != null ? Number(r.csat_score) : null;
          const surveys = Number(r.surveys_count || 0);
          const cellKey = r.qa_email + "\u0000" + topic;
          const prev = pickByCell[cellKey];
          if (!prev || surveys > prev.surveys) {
            pickByCell[cellKey] = { email: r.qa_email, topic, score, surveys };
          }
        });
        // Step 2: build cells + totals from the deduped picks.
        const cells = {};
        const totalsByTopic = {};
        const totalsByAgent = {};
        Object.entries(pickByCell).forEach(([k, v]) => {
          cells[k] = { score: v.score, surveys: v.surveys };
          if (v.score != null && v.surveys > 0) {
            const tt = totalsByTopic[v.topic] || (totalsByTopic[v.topic] = { w: 0, n: 0, s: 0 });
            tt.w += v.score * v.surveys; tt.n += v.surveys; tt.s += v.surveys;
            const ta = totalsByAgent[v.email] || (totalsByAgent[v.email] = { w: 0, n: 0, s: 0 });
            ta.w += v.score * v.surveys; ta.n += v.surveys; ta.s += v.surveys;
          }
        });
        const topicList = [...topicsSet].sort((a, b) => (totalsByTopic[b]?.s || 0) - (totalsByTopic[a]?.s || 0));
        setTopicMatrixByMonth(prev => ({ ...prev, [monthKey + "::" + scopedEmailsKey]: { topics: topicList, cells, totalsByTopic, totalsByAgent } }));
      } catch (e) {
        console.error("topic matrix:", e);
        setTopicMatrixByMonth(prev => ({ ...prev, [monthKey + "::" + scopedEmailsKey]: { topics: [], cells: {}, totalsByTopic: {}, totalsByAgent: {} } }));
      }
      setTopicMatrixLoading(false);
    })();
  }, [csatView, monthKey, scopedEmailsKey, token]);

  const matrix = topicMatrixByMonth[monthKey + "::" + scopedEmailsKey];
  if (loading) return <div className="page"><SkeletonPage /></div>;

  return <div className="page">
    <div className="page-header">
      <div className="page-title" style={{display:"flex",alignItems:"center",gap:10}}>
        <Icon d={icons.leaderboard} size={22}/>CSAT
      </div>
      {/* Generic subtitle ("explore By QA / By Lead / By Topic") was
          removed in the simplification pass — the view-switcher
          segmented control inside the filter strip already shows the
          three available views, so the subtitle was just noise. */}
    </div>

    {/* Unified PageFilters strip — filters on the left, the
        View segmented control (By QA / By Lead / By Topic) on
        the right. Mirrors the Individual / By team lead /
        Quarterly switcher on Leaderboard so users learn one
        pattern. Replaces the previous card-header view buttons
        which were easy to miss tucked inside the table card. */}
    <PageFilters
      onClear={() => { setSelDomain(""); setSelTeam([]); setSelTL([]); setSelQA([]); }}
    >
      <SearchableSelect options={months} value={selMonth} onChange={setSelMonth} placeholder="Select month"/>
      {hasRole(profile?.role,"admin") && (
        <SearchableSelect options={["","tabby.ai","tabby.sa"]} value={selDomain} onChange={setSelDomain} placeholder="All domains"/>
      )}
      <SearchableSelect multi options={scoreTeams} value={selTeam} onChange={setSelTeam} placeholder={`All teams (${scoreTeams.length})`}/>
      <SearchableSelect
        multi
        options={tlEmails.map(e => ({ value: e, label: nameFromEmail(e) }))}
        value={selTL}
        onChange={setSelTL}
        placeholder={`All leads (${tlEmails.length})`}
      />
      <SearchableSelect
        options={(() => {
          // Dedupe by local-part so QAs with both @tabby.ai and
          // @tabby.sa rows (cross-domain split) show up once. Option
          // value is the local-part; the filter above is local-part-
          // aware and accepts either format from legacy saved views.
          const seen = new Map();
          for (const r of filtered) {
            const e = r.qa_email;
            if (!e) continue;
            const lp = String(e).toLowerCase().split("@")[0];
            if (!seen.has(lp)) seen.set(lp, { value: lp, label: nameFromEmail(e) });
          }
          return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
        })()}
        value={selQA}
        onChange={setSelQA}
        placeholder={`All specialists (${filtered.length})`}
        multi
      />
      <div className="tabs" style={{display:"flex",gap:0}}>
        <button className={`tab ${csatView==="qa"?"active":""}`} onClick={()=>setCsatView("qa")}>By QA</button>
        <button className={`tab ${csatView==="lead"?"active":""}`} onClick={()=>setCsatView("lead")}>By Lead</button>
        <button className={`tab ${csatView==="topic"?"active":""}`} onClick={()=>setCsatView("topic")}>By Topic</button>
      </div>
    </PageFilters>

    {filtered.length === 0 ? (
      <div className="card">
        <EmptyState
          tone="warn"
          illus="chart"
          title={`No CSAT data for ${selMonth}`}
          description="Either no surveys have come in yet for this month, or your current filters exclude everything. Try widening the date range or clearing a filter."
        />
      </div>
    ) : (
      <div className="card">
        <div className="card-header">
          <span className="card-title">CSAT — {selMonth}</span>
          {/* The 3-button view switcher moved into the PageFilters
              strip above. Only the topic-view's "Min surveys" input
              and the per-row click hint stay here, since they are
              specific to whichever view is active. */}
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {csatView === "topic" ? (
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"var(--tx3)"}}>
                Min surveys
                <input type="number" min={0} value={topicMinSurveys} onChange={e=>setTopicMinSurveys(Math.max(0, parseInt(e.target.value)||0))} style={{width:50,padding:"3px 6px",fontSize:11,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:6,color:"var(--tx)",fontFamily:"var(--font)"}}/>
              </label>
            ) : (
              <span style={{fontSize:12,color:"var(--tx3)"}}>Click a row to see per-topic breakdown</span>
            )}
          </div>
        </div>
        {csatView !== "topic" && cutoffs.length > 0 && (() => {
          // QA-facing LOBs only — Collection / Social Media / agent-only
          // lines are filtered out. Ordered for a consistent layout.
          const LOB_LABEL = { general:"Front Line", disputes:"Dispute", escalations:"Escalation", partners:"Partners", customer_care_unit:"CCU" };
          const ORDER = ["general","disputes","escalations","partners","customer_care_unit"];
          const shown = cutoffs
            .filter(c => ORDER.includes(c.lob))
            .sort((a,b) => (ORDER.indexOf(a.lob) - ORDER.indexOf(b.lob)) || String(a.domain).localeCompare(String(b.domain)));
          if (shown.length === 0) return null;
          return (
            <div style={{ padding: "2px 14px 6px" }}>
              <details open>
                <summary style={{ cursor:"pointer", fontSize:11, color:"var(--tx3)", fontWeight:600, userSelect:"none", padding:"3px 0" }}>
                  Quartile thresholds · <strong style={{color:"var(--tx2)"}}>{selMonth}</strong> — a QA (≥5 surveys) is ranked vs the full population in their domain + LOB · <span style={{color:"#3CFFA5"}}>Q1 ≥ value</span>, below it → Q2 / Q3 / Q4
                  {quartilesUpdatedAt && (
                    <span
                      title={`Quartile population last loaded ${new Date(quartilesUpdatedAt).toLocaleString("en-GB")} · refreshes daily at 19:00 Riyadh`}
                      style={{ display:"inline-flex", alignItems:"center", gap:5, marginLeft:8, padding:"1px 8px", borderRadius:999, background:"var(--bg3)", border:"1px solid var(--bd)", color:"var(--tx2)", fontWeight:600, whiteSpace:"nowrap", verticalAlign:"middle" }}
                    >
                      <span style={{ width:6, height:6, borderRadius:999, background:"#3CFFA5", flex:"none" }} />
                      Quartiles updated {fmtAgo(quartilesUpdatedAt)}
                    </span>
                  )}
                </summary>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(212px, 1fr))", gap:10, marginTop:10 }}>
                  {shown.map(c => {
                    const dom = String(c.domain).toUpperCase();
                    const domColor = c.domain === "sa" ? "#8B5CF6" : "#60A5FA";
                    const tiers = [["Q1", c.p75, "#3CFFA5"], ["Q2", c.p50, "#60A5FA"], ["Q3", c.p25, "#F59E0B"]];
                    return (
                      <div key={`${c.domain}-${c.lob}`} style={{ borderRadius:10, padding:"11px 12px", background:"var(--bg3)", border:"1px solid var(--bd)", boxShadow:"0 1px 3px rgba(0,0,0,.14)" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:9 }}>
                          <span style={{ fontWeight:700, fontSize:13, color:"var(--tx)", letterSpacing:.2 }}>{LOB_LABEL[c.lob] || c.lob}</span>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:9, fontWeight:800, letterSpacing:.5, color:domColor, background:`${domColor}22`, borderRadius:5, padding:"2px 7px" }}>{dom}</span>
                            <span style={{ fontSize:10, color:"var(--tx3)", fontVariantNumeric:"tabular-nums" }}>{c.cohort_size}</span>
                          </span>
                        </div>
                        <div style={{ display:"flex", gap:5, fontVariantNumeric:"tabular-nums" }}>
                          {tiers.map(([q, v, col]) => (
                            <div key={q} style={{ flex:1, textAlign:"center", borderRadius:7, padding:"5px 2px", background:`${col}14`, border:`1px solid ${col}33` }}>
                              <div style={{ fontSize:8.5, fontWeight:800, color:col, letterSpacing:.4 }}>{q} ≥</div>
                              <div style={{ fontSize:12.5, fontWeight:700, color:"var(--tx)", marginTop:1 }}>{Number(v)}%</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          );
        })()}
        {csatView === "topic" ? (
          <CsatTopicMatrix
            matrix={matrix}
            csatSorted={csatSorted}
            topicSort={topicSort}
            setTopicSort={setTopicSort}
            topicMinSurveys={topicMinSurveys}
            setTopicMinSurveys={setTopicMinSurveys}
            topicMatrixLoading={topicMatrixLoading}
            selMonth={selMonth}
          />
        ) : csatView === "qa" ? (
          <div className="table-wrap table-wrap-sticky csat-compact">
            <table>
              <thead>
                <tr>
                  <th style={{width:22}}></th>
                  <th>Specialist</th>
                  <th>TL</th>
                  <th style={{width:90}} title="QA's primary Line of Business — drives the quartile cohort.">LOB</th>
                  <th style={{textAlign:"right",width:70}} title="Tickets touched during login time (this month)">Tickets</th>
                  <th style={{textAlign:"right",width:52,color:"var(--green)"}} title="Good (satisfied) surveys">Good</th>
                  <th style={{textAlign:"right",width:52,color:"var(--red)"}} title="Bad (dissatisfied) surveys">Bad</th>
                  <th style={{textAlign:"right",width:80}}>Surveys</th>
                  <th style={{textAlign:"right",width:90}}>CSAT %</th>
                  <th style={{textAlign:"center",width:80}} title="Per-domain CSAT quartile this month (Q1 = top 25%). Needs ≥5 surveys + ≥8 ranked QAs in the domain to assign.">Quartile</th>
                  <th style={{textAlign:"right",width:100}} title={prevMonth?`Change vs ${prevMonth}`:"No previous month available"}>Δ vs prev</th>
                  <th style={{textAlign:"right",width:64}} title="ABT — average, in minutes (from the login-time tickets feed)">ABT</th>
                </tr>
              </thead>
              <tbody>
                {csatSorted.map(r => {
                  const isExpanded = expandedEmail === r.qa_email;
                  const t = topics[topicKey(r.qa_email)];
                  const isLoading = topicsLoading === r.qa_email;
                  return <React.Fragment key={r.id+"-csat"}>
                    <tr onClick={()=>toggleRow(r.qa_email)} style={{cursor:"pointer",background:isExpanded?"var(--accent-light)":undefined}}>
                      <td style={{textAlign:"center",padding:"4px 0"}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{transform:isExpanded?"rotate(180deg)":"rotate(0)",transition:"transform .2s",color:"var(--tx3)",opacity:.6}}><path d="M6 9l6 6 6-6"/></svg>
                      </td>
                      <td style={{padding:"4px 8px"}} title={`Open ${r.qa_email}'s QA Profile`}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,letterSpacing:".3px"}}>
                            {nameFromEmail(r.qa_email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                          </div>
                          {/* QA name → QA Profile. Uses standard text
                              colour with a purple underline so the
                              name stays readable when the row is
                              expanded (which flips the background to
                              --accent-light, a near-purple that was
                              washing out the previous tabby-purple
                              text). The underline thickens on hover
                              to keep the click affordance obvious.
                              stopPropagation so the click doesn't
                              also fire the row-expand toggle. */}
                          <button
                            onClick={(e) => { e.stopPropagation(); goToProfile(r.qa_email); }}
                            style={{
                              background: "none", border: "none", padding: 0, cursor: "pointer",
                              color: "var(--tx)", fontFamily: "var(--font)",
                              fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap",
                              textAlign: "left",
                              textDecoration: "underline",
                              textDecorationColor: "var(--tabby-purple)",
                              textDecorationThickness: 1,
                              textUnderlineOffset: 2,
                              transition: "text-decoration-thickness .15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.textDecorationThickness = "2px"; }}
                            onMouseLeave={e => { e.currentTarget.style.textDecorationThickness = "1px"; }}
                          >{nameFromEmail(r.qa_email)}</button>
                        </div>
                      </td>
                      <td style={{fontSize:11.5,color:"var(--tx2)",padding:"4px 8px",whiteSpace:"nowrap"}} title={r.qa_tl||""}>{r.qa_tl?nameFromEmail(r.qa_tl):"—"}</td>
                      <td style={{fontSize:11.5,color:"var(--tx2)",padding:"4px 8px",whiteSpace:"nowrap"}} title={r.lob || "LOB not set in mtd_scores"}>{r.lob || "—"}</td>
                      <td style={{textAlign:"right",fontSize:12,color:"var(--tx2)",padding:"4px 8px",fontVariantNumeric:"tabular-nums"}} title="Tickets touched during login time">{r.tickets_touched ?? "—"}</td>
                      <td style={{textAlign:"right",fontSize:12,color:"var(--green)",opacity:.9,padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{r.csat_good ?? "—"}</td>
                      <td style={{textAlign:"right",fontSize:12,color:"var(--red)",opacity:.9,padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{r.csat_bad ?? "—"}</td>
                      <td style={{textAlign:"right",fontSize:12,color:"var(--tx2)",padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{r.csat_total ?? "—"}</td>
                      {(()=>{const v=csatPctValue(r.csat_pct);const s=Number(r.csat_total||0);const show=v!=null&&s>0;return <td style={{textAlign:"right",fontWeight:600,fontSize:12.5,color:csatColor(v,s),padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{show?v.toFixed(1)+"%":"—"}</td>;})()}
                      <td style={{textAlign:"center",padding:"4px 8px"}}><QuartilePill quartile={r.csat_quartile} lob={r.lob} /></td>
                      {(()=>{const v=csatPctValue(r.csat_pct);const s=Number(r.csat_total||0);const cur=(v!=null&&s>0)?v:null;const p=lookupPrev(r.qa_email);return renderDelta(cur, p?.v ?? null);})()}
                      <td style={{textAlign:"right",fontSize:12,color:"var(--tx2)",padding:"4px 8px",fontVariantNumeric:"tabular-nums"}} title={r.abt!=null?`ABT ${Number(r.abt).toFixed(1)} min`:"No ABT for this month"}>{r.abt!=null?Number(r.abt).toFixed(1):"—"}</td>
                    </tr>
                    {isExpanded && <tr>
                      <td colSpan={12} style={{padding:"0 12px 10px 42px",background:"var(--bg)"}}>
                        {isLoading ? <div style={{padding:"8px 0",fontSize:11.5,color:"var(--tx3)"}}>Loading topics…</div>
                         : !t || t.length === 0 ? <div style={{padding:"8px 0",fontSize:11.5,color:"var(--tx3)"}}>No per-topic CSAT data for {selMonth}.</div>
                         : <table style={{width:"100%",marginTop:4,borderCollapse:"collapse"}}>
                            <thead><tr style={{borderBottom:"1px solid var(--bd2)"}}>
                              <th style={{textAlign:"left",fontSize:10,color:"var(--tx3)",fontWeight:600,padding:"4px 6px",textTransform:"uppercase",letterSpacing:".4px"}}>Topic</th>
                              <th style={{textAlign:"right",fontSize:10,color:"var(--tx3)",fontWeight:600,padding:"4px 6px",textTransform:"uppercase",letterSpacing:".4px"}}>Surveys</th>
                              <th style={{textAlign:"right",fontSize:10,color:"var(--tx3)",fontWeight:600,padding:"4px 6px",textTransform:"uppercase",letterSpacing:".4px"}}>CSAT %</th>
                            </tr></thead>
                            <tbody>
                              {t.map((row,i)=>(<tr key={i} style={{borderBottom:i<t.length-1?"1px solid var(--bd2)":"none"}}>
                                <td style={{padding:"4px 6px",fontSize:12}}>{row.topic}</td>
                                <td style={{padding:"4px 6px",fontSize:12,textAlign:"right",color:"var(--tx2)",fontVariantNumeric:"tabular-nums"}}>{row.surveys_count ?? 0}</td>
                                {(()=>{const v=row.csat_score!=null?Number(row.csat_score):null;const s=Number(row.surveys_count||0);const show=v!=null&&s>0;return <td style={{padding:"4px 6px",fontSize:12,textAlign:"right",fontWeight:600,color:csatColor(v,s),fontVariantNumeric:"tabular-nums"}}>{show?v.toFixed(1)+"%":"—"}</td>;})()}
                              </tr>))}
                            </tbody>
                          </table>}
                      </td>
                    </tr>}
                  </React.Fragment>;
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap table-wrap-sticky csat-compact">
            <table>
              <thead>
                <tr>
                  <th style={{width:22}}></th>
                  <th>Lead</th>
                  <th style={{textAlign:"right",width:70}}>QAs</th>
                  <th style={{textAlign:"right",width:52,color:"var(--green)"}} title="Good (satisfied) surveys">Good</th>
                  <th style={{textAlign:"right",width:52,color:"var(--red)"}} title="Bad (dissatisfied) surveys">Bad</th>
                  <th style={{textAlign:"right",width:80}}>Surveys</th>
                  <th style={{textAlign:"right",width:90}}>CSAT %</th>
                  <th style={{textAlign:"right",width:100}} title={prevMonth?`Change vs ${prevMonth}`:"No previous month available"}>Δ vs prev</th>
                </tr>
              </thead>
              <tbody>
                {csatLeads.map(l => {
                  const tlKey = (l.tl || "unknown").toLowerCase();
                  const isExpanded = expandedLead === tlKey;
                  const t = leadTopics[`${tlKey}__${monthKey}`];
                  const isLoading = leadTopicsLoading === tlKey;
                  return <React.Fragment key={tlKey+"-csat-lead"}>
                    <tr onClick={()=>toggleLeadRow(l)} style={{cursor:"pointer",background:isExpanded?"var(--accent-light)":undefined}}>
                      <td style={{textAlign:"center",padding:"4px 0"}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{transform:isExpanded?"rotate(180deg)":"rotate(0)",transition:"transform .2s",color:"var(--tx3)",opacity:.6}}><path d="M6 9l6 6 6-6"/></svg>
                      </td>
                      <td style={{padding:"4px 8px"}} title={l.tl||""}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,letterSpacing:".3px"}}>
                            {nameFromEmail(l.tl).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                          </div>
                          <div style={{lineHeight:1.15}}>
                            <div style={{fontWeight:600,fontSize:12.5,whiteSpace:"nowrap"}}>{nameFromEmail(l.tl)}</div>
                            <div style={{fontSize:10,color:"var(--tx3)",marginTop:1}}>{l.count} QA{l.count!==1?"s":""}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{textAlign:"right",fontWeight:600,fontSize:12,padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{l.count}</td>
                      <td style={{textAlign:"right",fontSize:12,color:"var(--green)",opacity:.9,padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{l.good || "—"}</td>
                      <td style={{textAlign:"right",fontSize:12,color:"var(--red)",opacity:.9,padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{l.bad || "—"}</td>
                      <td style={{textAlign:"right",fontSize:12,color:"var(--tx2)",padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{l.surveys || "—"}</td>
                      {(()=>{const s=Number(l.surveys||0);const show=l.csat!=null&&s>0;return <td style={{textAlign:"right",fontWeight:600,fontSize:12.5,color:csatColor(l.csat,s),padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{show?l.csat.toFixed(1)+"%":"—"}</td>;})()}
                      {renderDelta(l.csat ?? null, l.prevCsat ?? null)}
                    </tr>
                    {isExpanded && <tr>
                      {/* Lead aggregation table — no quartile column, colSpan 8 (Good/Bad added) */}
                      <td colSpan={8} style={{padding:"0 12px 10px 42px",background:"var(--bg)"}}>
                        {isLoading ? <div style={{padding:"8px 0",fontSize:11.5,color:"var(--tx3)"}}>Loading topics…</div>
                         : !t || t.length === 0 ? <div style={{padding:"8px 0",fontSize:11.5,color:"var(--tx3)"}}>No per-topic CSAT data for {selMonth}.</div>
                         : <table style={{width:"100%",marginTop:4,borderCollapse:"collapse"}}>
                            <thead><tr style={{borderBottom:"1px solid var(--bd2)"}}>
                              <th style={{textAlign:"left",fontSize:10,color:"var(--tx3)",fontWeight:600,padding:"4px 6px",textTransform:"uppercase",letterSpacing:".4px"}}>Topic</th>
                              <th style={{textAlign:"right",fontSize:10,color:"var(--tx3)",fontWeight:600,padding:"4px 6px",textTransform:"uppercase",letterSpacing:".4px"}}>Surveys</th>
                              <th style={{textAlign:"right",fontSize:10,color:"var(--tx3)",fontWeight:600,padding:"4px 6px",textTransform:"uppercase",letterSpacing:".4px"}}>CSAT %</th>
                            </tr></thead>
                            <tbody>
                              {t.map((row,i)=>(<tr key={i} style={{borderBottom:i<t.length-1?"1px solid var(--bd2)":"none"}}>
                                <td style={{padding:"4px 6px",fontSize:12}}>{row.topic}</td>
                                <td style={{padding:"4px 6px",fontSize:12,textAlign:"right",color:"var(--tx2)",fontVariantNumeric:"tabular-nums"}}>{row.surveys_count ?? 0}</td>
                                {(()=>{const v=row.csat_score!=null?Number(row.csat_score):null;const s=Number(row.surveys_count||0);const show=v!=null&&s>0;return <td style={{padding:"4px 6px",fontSize:12,textAlign:"right",fontWeight:600,color:csatColor(v,s),fontVariantNumeric:"tabular-nums"}}>{show?v.toFixed(1)+"%":"—"}</td>;})()}
                              </tr>))}
                            </tbody>
                          </table>}
                      </td>
                    </tr>}
                  </React.Fragment>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}
  </div>;
}
