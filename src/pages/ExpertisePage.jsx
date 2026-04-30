import React, { useState, useEffect, useMemo } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { nameFromEmail } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { useApp } from "../lib/AppContext.jsx";
import { fetchExpertise, fetchExpertiseMonths, renderStars, starColor, starLabel, productOf, productColor } from "../lib/expertise.js";
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
  const { token, profile, gf } = useApp();
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

  // Initial month + dropdowns
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [ms, r, ps] = await Promise.all([
          fetchExpertiseMonths({ token }),
          listRoster({ token, select: "email,queue,manager_email" }).catch(() => []),
          listProfiles({ token, select: "email,role" }).catch(() => []),
        ]);
        if (cancelled) return;
        const sorted = sortMonthsDesc(ms);
        setMonths(sorted);
        setRoster(Array.isArray(r) ? r : []);
        setProfiles(Array.isArray(ps) ? ps : []);
        const initial = (gf?.month && sorted.includes(gf.month)) ? gf.month : sorted[0] || "";
        setSelMonth(initial);
      } catch (e) { console.error("Expertise initial:", e); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    if (selStar !== "") r = r.filter(x => Number(x.star_level) === Number(selStar));
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

  const starCounts = useMemo(() => {
    const counts = { 3: 0, 2: 0, 1: 0, 0: 0 };
    visibleRows.forEach(r => { counts[r.star_level || 0]++; });
    return counts;
  }, [visibleRows]);

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
        <strong style={{ color: "var(--amber)" }}>Pilot version</strong> — based on {selMonth} data only. Threshold currently set to 5 surveys per topic — will be raised to 12, then 20, as the dataset grows. Expertise calls will become more accurate as 3+ months of data accumulate.
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
            <option value="0">No stars yet</option>
          </select>
          <div style={{ position: "relative", minWidth: 180, flex: 1, maxWidth: 240 }}>
            <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" style={{ fontSize: 12, padding: "6px 10px" }} />
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 14 }}>×</button>}
          </div>
          <div style={{ display: "flex", gap: 12, marginLeft: "auto", fontSize: 11, color: "var(--tx2)", fontWeight: 600 }}>
            {[3, 2, 1, 0].map(lv => (
              <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: starColor(lv) }}>{lv > 0 ? renderStars(lv) : "·"}</span>
                <span>{starCounts[lv]}</span>
              </span>
            ))}
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
                  <th style={{ minWidth: 180 }}>Specialist</th>
                  <th style={{ width: 100 }}>Stars</th>
                  <th style={{ width: 80, textAlign: "right" }}>Score</th>
                  <th style={{ minWidth: 200 }}>Champion topics</th>
                  <th style={{ minWidth: 200 }}>Solid topics</th>
                  <th style={{ width: 80, textAlign: "right" }}>BNPL</th>
                  <th style={{ width: 80, textAlign: "right" }}>Card</th>
                  <th style={{ width: 90, textAlign: "right" }}>Universal</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => {
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
                          <span title={starLabel(r.star_level)} style={{ fontSize: 14, color: starColor(r.star_level) }}>
                            {r.star_level > 0 ? renderStars(r.star_level) : <span style={{ color: "var(--tx3)", fontSize: 11 }}>·</span>}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: starColor(r.star_level), fontVariantNumeric: "tabular-nums" }}>{fmtScore(r.expertise_score)}</td>
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
                              <span style={{ fontSize: 12, color: "var(--tx3)" }}>No topic met the 5-survey threshold this month.</span>
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
