import React, { useState, useEffect } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb } from "../lib/supabase.js";
import { csatPctValue, csatColor, normalizeTopic } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listMtd } from "../api/mtd.js";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import CsatTopicMatrix from "../components/csat/CsatTopicMatrix.jsx";
import { useApp } from "../lib/AppContext.jsx";

const nameFromEmail = (email) => {
  if (!email) return "—";
  const local = email.split("@")[0];
  return local.split(".").map(p => {
    const c = p.replace(/[\d]+$/, "");
    return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
  }).filter(Boolean).join(" ");
};

export default function CSATPage() {
  const { token, profile, gf } = useApp();
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [selTeam, setSelTeam] = useState("");
  const [selTL, setSelTL] = useState("");
  const [selQA, setSelQA] = useState([]);
  const [csatView, setCsatView] = useState("qa"); // qa | lead | topic
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

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows, profRows] = await Promise.all([
          listMtd({ token, filters: "order=month.desc,qa_email.asc" }),
          listRoster({ token, select: "email,queue,manager_email" }),
          listProfiles({ token, select: "id,email,role", cacheKey: "profiles_slim" }),
        ]);
        setRoster(rosterRows);
        // Mirror ScoreEntryPage filtering: exclude non-QA profiles and entries
        // not managed by a QA lead.
        const qaLeadSet = new Set();
        profRows.filter(p => p.role === "qa_lead").forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          qaLeadSet.add(email);
          const local = email.split("@")[0];
          qaLeadSet.add(local);
          if (email.endsWith("@tabby.ai")) qaLeadSet.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) qaLeadSet.add(local + "@tabby.ai");
        });
        const blacklist = new Set();
        profRows.filter(p => p.role !== "qa").forEach(p => {
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
        const filtered = rows.filter(r => {
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
        if (uniqueMonths.length > 0) setSelMonth(uniqueMonths[0]);
        // CSAT is intentionally unscoped by domain: every user — including
        // supervisors who are domain-locked at the global level — should
        // see the full dataset across By QA / By Lead / By Topic, and
        // narrow with the page's own filter dropdowns if they want.
        if (gf?.month && uniqueMonths.includes(gf.month)) setSelMonth(gf.month);
        if (gf?.teams?.length > 0) setSelTeam(gf.teams[0]);
      } catch (e) { console.error("CSAT:", e); }
      setLoading(false);
    })();
  }, [token, gf?.month, gf?.teams]);

  const monthData = data.filter(r => r.month === selMonth);
  const rosterMap = {}; roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  const scoreTeams = [...new Set(roster.filter(r => r.queue && (!selDomain || r.email?.endsWith("@" + selDomain))).map(r => r.queue))].sort();
  const tlEmails = [...new Set(monthData.map(r => r.qa_tl).filter(Boolean))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@" + selDomain));
  if (selTeam) filtered = filtered.filter(r => rosterMap[r.qa_email?.toLowerCase()]?.queue === selTeam);
  if (selTL) filtered = filtered.filter(r => r.qa_tl === selTL);
  if (selQA.length > 0) filtered = filtered.filter(r => selQA.includes(r.qa_email));
  if (gf?.people?.length > 0) filtered = filtered.filter(r => gf.people.includes(r.qa_email?.toLowerCase()));

  // A QA with zero surveys has no CSAT signal to report — hide them
  // from every view so the page only shows people with actual data.
  const csatSorted = [...filtered]
    .filter(r => Number(r.csat_total || 0) > 0)
    .sort((a, b) => (csatPctValue(b.csat_pct) ?? -1) - (csatPctValue(a.csat_pct) ?? -1));
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
      const aggRows = Object.values(pick).sort((x, y) => (y.csat_score ?? -1) - (x.csat_score ?? -1));
      setTopics(prev => ({ ...prev, [key]: aggRows }));
    } catch (e) { setTopics(prev => ({ ...prev, [key]: [] })); }
    setTopicsLoading(null);
  };

  const csatLeads = (() => {
    const map = {};
    csatSorted.forEach(r => {
      const tl = (r.qa_tl || "unknown").toLowerCase();
      if (!map[tl]) map[tl] = { tl: r.qa_tl || "Unknown", emails: [], count: 0, weightedSum: 0, weight: 0, simpleSum: 0, simpleCount: 0, surveys: 0 };
      const l = map[tl];
      l.emails.push(r.qa_email);
      l.count++;
      const score = csatPctValue(r.csat_pct);
      if (score != null) {
        const surveys = Number(r.csat_total || 0);
        l.simpleSum += score; l.simpleCount++;
        if (surveys > 0) { l.weightedSum += score * surveys; l.weight += surveys; }
        l.surveys += surveys;
      }
    });
    return Object.values(map).map(l => ({
      ...l,
      csat: l.weight > 0 ? l.weightedSum / l.weight : (l.simpleCount > 0 ? l.simpleSum / l.simpleCount : null),
    })).sort((a, b) => (b.csat ?? -1) - (a.csat ?? -1));
  })();

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
      })).sort((x, y) => (y.csat_score ?? -1) - (x.csat_score ?? -1));
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
      <div className="page-subtitle">CSAT % and surveys — explore By QA, By Lead, or the agent × topic heatmap under By Topic.</div>
    </div>

    <div className="card" style={{marginBottom:16}}>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div className="form-group" style={{minWidth:160}}>
          <label className="form-label">Month</label>
          <SearchableSelect options={months} value={selMonth} onChange={setSelMonth} placeholder="Select month"/>
        </div>
        {hasRole(profile?.role,"admin") && <div className="form-group" style={{minWidth:160}}>
          <label className="form-label">Domain</label>
          <SearchableSelect options={["","tabby.ai","tabby.sa"]} value={selDomain} onChange={setSelDomain} placeholder="All domains"/>
        </div>}
        <div className="form-group" style={{minWidth:160}}>
          <label className="form-label">Team</label>
          <SearchableSelect options={scoreTeams} value={selTeam} onChange={setSelTeam} placeholder={`All teams (${scoreTeams.length})`}/>
        </div>
        <div className="form-group" style={{minWidth:200}}>
          <label className="form-label">Lead</label>
          <SearchableSelect
            options={tlEmails.map(e=>({value:e,label:nameFromEmail(e)}))}
            value={selTL}
            onChange={setSelTL}
            placeholder={`All leads (${tlEmails.length})`}
          />
        </div>
        <div className="form-group" style={{flex:1,minWidth:200}}>
          <label className="form-label">Specialist</label>
          <SearchableSelect
            options={[...new Set(filtered.map(r=>r.qa_email))].sort().map(e=>({value:e,label:e+" ("+nameFromEmail(e)+")"}))}
            value={selQA}
            onChange={setSelQA}
            placeholder={`All (${filtered.length})`}
            multi
          />
        </div>
      </div>
    </div>

    {filtered.length === 0 ? (
      <div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No CSAT data for {selMonth}.</p></div></div>
    ) : (
      <div className="card">
        <div className="card-header">
          <span className="card-title">CSAT — {selMonth}</span>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",borderRadius:8,border:"1px solid var(--bd)",overflow:"hidden"}}>
              <button onClick={()=>setCsatView("qa")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:csatView==="qa"?"var(--tabby-purple)":"transparent",color:csatView==="qa"?"#fff":"var(--tx3)"}}>By QA</button>
              <button onClick={()=>setCsatView("lead")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:csatView==="lead"?"var(--tabby-purple)":"transparent",color:csatView==="lead"?"#fff":"var(--tx3)"}}>By Lead</button>
              <button onClick={()=>setCsatView("topic")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:csatView==="topic"?"var(--tabby-purple)":"transparent",color:csatView==="topic"?"#fff":"var(--tx3)"}}>By Topic</button>
            </div>
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
        {csatView === "topic" ? (
          <CsatTopicMatrix
            matrix={matrix}
            csatSorted={csatSorted}
            topicSort={topicSort}
            setTopicSort={setTopicSort}
            topicMinSurveys={topicMinSurveys}
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
                  <th style={{textAlign:"right",width:80}}>Surveys</th>
                  <th style={{textAlign:"right",width:90}}>CSAT %</th>
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
                      <td style={{padding:"4px 8px"}} title={r.qa_email}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:600,letterSpacing:".3px"}}>
                            {nameFromEmail(r.qa_email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                          </div>
                          <div style={{fontWeight:500,fontSize:12.5,whiteSpace:"nowrap"}}>{nameFromEmail(r.qa_email)}</div>
                        </div>
                      </td>
                      <td style={{fontSize:11.5,color:"var(--tx2)",padding:"4px 8px",whiteSpace:"nowrap"}} title={r.qa_tl||""}>{r.qa_tl?nameFromEmail(r.qa_tl):"—"}</td>
                      <td style={{textAlign:"right",fontSize:12,color:"var(--tx2)",padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{r.csat_total ?? "—"}</td>
                      {(()=>{const v=csatPctValue(r.csat_pct);const s=Number(r.csat_total||0);const show=v!=null&&s>0;return <td style={{textAlign:"right",fontWeight:600,fontSize:12.5,color:csatColor(v,s),padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{show?v.toFixed(1)+"%":"—"}</td>;})()}
                    </tr>
                    {isExpanded && <tr>
                      <td colSpan={5} style={{padding:"0 12px 10px 42px",background:"var(--bg)"}}>
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
                  <th style={{textAlign:"right",width:80}}>Surveys</th>
                  <th style={{textAlign:"right",width:90}}>CSAT %</th>
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
                      <td style={{textAlign:"right",fontSize:12,color:"var(--tx2)",padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{l.surveys || "—"}</td>
                      {(()=>{const s=Number(l.surveys||0);const show=l.csat!=null&&s>0;return <td style={{textAlign:"right",fontWeight:600,fontSize:12.5,color:csatColor(l.csat,s),padding:"4px 8px",fontVariantNumeric:"tabular-nums"}}>{show?l.csat.toFixed(1)+"%":"—"}</td>;})()}
                    </tr>
                    {isExpanded && <tr>
                      <td colSpan={5} style={{padding:"0 12px 10px 42px",background:"var(--bg)"}}>
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
