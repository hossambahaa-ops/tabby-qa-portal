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
        if (hasRole(profile?.role, "qa_supervisor") && !hasRole(profile?.role, "admin") && !selDomain) {
          const svDomain = profile?.operational_domain || profile?.domain || "";
          if (svDomain) setSelDomain(svDomain);
        }
        if (gf?.domain) setSelDomain(gf.domain);
        if (gf?.month && uniqueMonths.includes(gf.month)) setSelMonth(gf.month);
        if (gf?.teams?.length > 0) setSelTeam(gf.teams[0]);
      } catch (e) { console.error("CSAT:", e); }
      setLoading(false);
    })();
  }, [token, gf?.domain, gf?.month, gf?.teams]);

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

  const csatSorted = [...filtered].sort((a, b) => (csatPctValue(b.csat_pct) ?? -1) - (csatPctValue(a.csat_pct) ?? -1));
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
      // Collapse duplicated topic variants ("Card Status" vs "Card Status -" etc.)
      const agg = {};
      (rows || []).forEach(t => {
        const norm = normalizeTopic(t.topic);
        if (!agg[norm]) agg[norm] = { topic: norm, weightedSum: 0, weight: 0, simpleSum: 0, simpleCount: 0, surveys: 0 };
        const a = agg[norm];
        if (t.csat_score != null) {
          const score = Number(t.csat_score);
          const surveys = Number(t.surveys_count || 0);
          a.simpleSum += score; a.simpleCount++;
          if (surveys > 0) { a.weightedSum += score * surveys; a.weight += surveys; }
          a.surveys += surveys;
        }
      });
      const aggRows = Object.values(agg).map(a => ({
        topic: a.topic,
        csat_score: a.weight > 0 ? a.weightedSum / a.weight : (a.simpleCount > 0 ? a.simpleSum / a.simpleCount : null),
        surveys_count: a.surveys,
      })).sort((x, y) => (y.csat_score ?? -1) - (x.csat_score ?? -1));
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
        select: "topic,csat_score,surveys_count",
        filters: `qa_email=in.(${emailList})&month=eq.${encodeURIComponent(monthKey)}`,
        token
      });
      const agg = {};
      (rows || []).forEach(t => {
        const norm = normalizeTopic(t.topic);
        if (!agg[norm]) agg[norm] = { topic: norm, weightedSum: 0, weight: 0, simpleSum: 0, simpleCount: 0, surveys: 0 };
        const a = agg[norm];
        if (t.csat_score != null) {
          const score = Number(t.csat_score);
          const surveys = Number(t.surveys_count || 0);
          a.simpleSum += score; a.simpleCount++;
          if (surveys > 0) { a.weightedSum += score * surveys; a.weight += surveys; }
          a.surveys += surveys;
        }
      });
      const aggRows = Object.values(agg).map(a => ({
        topic: a.topic,
        csat_score: a.weight > 0 ? a.weightedSum / a.weight : (a.simpleCount > 0 ? a.simpleSum / a.simpleCount : null),
        surveys_count: a.surveys,
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
        // Raw row → (agent, normalized-topic) aggregate so topic variants
        // ("Card Status" vs "Card Status -") collapse into one cell.
        const cellAgg = {}; // key -> { w, n, s }
        const totalsByTopic = {};
        const totalsByAgent = {};
        all.forEach(r => {
          if (!r.topic) return;
          const topic = normalizeTopic(r.topic);
          topicsSet.add(topic);
          const score = r.csat_score != null ? Number(r.csat_score) : null;
          const surveys = Number(r.surveys_count || 0);
          if (score != null && surveys > 0) {
            const cellKey = r.qa_email + "\u0000" + topic;
            const c = cellAgg[cellKey] || (cellAgg[cellKey] = { w: 0, n: 0, s: 0 });
            c.w += score * surveys; c.n += surveys; c.s += surveys;
            const tt = totalsByTopic[topic] || (totalsByTopic[topic] = { w: 0, n: 0, s: 0 });
            tt.w += score * surveys; tt.n += surveys; tt.s += surveys;
            const ta = totalsByAgent[r.qa_email] || (totalsByAgent[r.qa_email] = { w: 0, n: 0, s: 0 });
            ta.w += score * surveys; ta.n += surveys; ta.s += surveys;
          }
        });
        const cells = {};
        Object.entries(cellAgg).forEach(([k, v]) => {
          cells[k] = { score: v.n > 0 ? v.w / v.n : null, surveys: v.s };
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
  const visibleTopics = matrix ? matrix.topics.filter(t => (matrix.totalsByTopic[t]?.s || 0) >= Math.max(1, topicMinSurveys)) : [];
  // Only show specialists who have at least one survey in the visible topics —
  // otherwise the matrix is hundreds of blank rows.
  const visibleAgents = matrix
    ? (() => {
        const base = csatSorted.filter(r => {
          const a = matrix.totalsByAgent[r.qa_email];
          if (!a || a.s <= 0) return false;
          return visibleTopics.some(t => matrix.cells[r.qa_email + "\u0000" + t]?.surveys > 0);
        });
        const dirMul = topicSort.dir === "asc" ? 1 : -1;
        const overallOf = (r) => {
          const t = matrix.totalsByAgent[r.qa_email];
          return t && t.n > 0 ? t.w / t.n : null;
        };
        if (topicSort.key === "__name__") {
          return base.sort((a, b) => dirMul * nameFromEmail(a.qa_email).localeCompare(nameFromEmail(b.qa_email)));
        }
        if (topicSort.key && topicSort.key !== "__overall__") {
          return base.sort((a, b) => {
            const ca = matrix.cells[a.qa_email + "\u0000" + topicSort.key];
            const cb = matrix.cells[b.qa_email + "\u0000" + topicSort.key];
            const sa = ca && ca.surveys > 0 ? ca.score : null;
            const sb = cb && cb.surveys > 0 ? cb.score : null;
            if (sa == null && sb == null) return (overallOf(b) ?? -1) - (overallOf(a) ?? -1);
            if (sa == null) return 1;   // no-survey rows always last
            if (sb == null) return -1;
            return dirMul * (sa - sb);
          });
        }
        // Default / overall sort
        return base.sort((a, b) => dirMul * ((overallOf(a) ?? -1) - (overallOf(b) ?? -1)));
      })()
    : [];

  const sortArrow = (key) => {
    if (topicSort.key !== key) return null;
    return topicSort.dir === "asc" ? " ▲" : " ▼";
  };
  const toggleSort = (key) => {
    setTopicSort(prev => {
      if (prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return { key: null, dir: "desc" };
    });
  };
  // Short topic label: split on separator ("Category - Subcategory"), show
  // subcategory if present so the header stays legible, full name in tooltip.
  const shortTopic = (t) => {
    const parts = t.split(" - ").map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
    return t.length > 24 ? t.slice(0, 22) + "…" : t;
  };

  // Muted HSL gradient 0 (red) → 120 (green). Low-alpha tinted background
  // + a medium-saturation mid-lightness foreground so the cells read on
  // both the dark and the light app themes without custom variants.
  const cellStyle = (score, surveys) => {
    if (score == null || !surveys || surveys <= 0) {
      return { background: "transparent", color: "var(--tx3)", fontWeight: 400 };
    }
    const hue = Math.max(0, Math.min(120, Math.round((score / 100) * 120)));
    return {
      background: `hsla(${hue}, 55%, 50%, 0.18)`,
      color: `hsl(${hue}, 65%, 42%)`,
      fontWeight: 600,
    };
  };

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
          topicMatrixLoading ? (
            <div className="placeholder" style={{padding:40,color:"var(--tx3)"}}>Loading topic matrix…</div>
          ) : !matrix || matrix.topics.length === 0 ? (
            <div className="placeholder" style={{padding:40,color:"var(--tx3)"}}>No per-topic CSAT data for {selMonth}.</div>
          ) : visibleTopics.length === 0 ? (
            <div className="placeholder" style={{padding:40,color:"var(--tx3)"}}>No topics with ≥ {topicMinSurveys} surveys. Lower the threshold.</div>
          ) : visibleAgents.length === 0 ? (
            <div className="placeholder" style={{padding:40,color:"var(--tx3)"}}>No specialists have surveys in {selMonth}.</div>
          ) : (
            <div style={{padding:"0 0 12px"}}>
              <div style={{overflow:"auto",maxHeight:"72vh",borderTop:"1px solid var(--bd2)"}}>
                <table style={{borderCollapse:"separate",borderSpacing:0,fontSize:12,width:"100%"}}>
                  <thead>
                    <tr>
                      <th onClick={()=>toggleSort("__name__")} title="Sort by specialist name"
                          style={{position:"sticky",left:0,top:0,zIndex:3,background:"var(--bg2)",padding:"10px 12px",textAlign:"left",borderBottom:"1px solid var(--bd2)",borderRight:"1px solid var(--bd2)",minWidth:210,fontSize:10,color:topicSort.key==="__name__"?"var(--accent-text)":"var(--tx3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",verticalAlign:"bottom",cursor:"pointer",userSelect:"none"}}>
                        Specialist{sortArrow("__name__")}
                      </th>
                      {visibleTopics.map(t => {
                        const isActive = topicSort.key === t;
                        return <th key={t} onClick={()=>toggleSort(t)}
                            title={`${t}\n${matrix.totalsByTopic[t]?.s || 0} surveys across team\nClick to sort`}
                            style={{position:"sticky",top:0,zIndex:2,background:isActive?"var(--accent-light)":"var(--bg2)",padding:"6px 2px 8px",textAlign:"center",borderBottom:"1px solid var(--bd2)",verticalAlign:"bottom",height:96,minWidth:36,maxWidth:36,width:36,cursor:"pointer",userSelect:"none"}}>
                          <div style={{writingMode:"vertical-rl",transform:"rotate(180deg)",whiteSpace:"nowrap",fontSize:10,color:isActive?"var(--accent-text)":"var(--tx2)",fontWeight:isActive?700:600,letterSpacing:".2px",maxHeight:82,overflow:"hidden",textOverflow:"ellipsis"}}>{shortTopic(t)}{sortArrow(t)}</div>
                        </th>;
                      })}
                      <th onClick={()=>toggleSort("__overall__")} title="Sort by overall CSAT"
                          style={{position:"sticky",top:0,right:0,zIndex:3,background:"var(--bg2)",padding:"10px 12px",textAlign:"center",borderBottom:"1px solid var(--bd2)",borderLeft:"1px solid var(--bd2)",fontSize:10,color:(topicSort.key===null||topicSort.key==="__overall__")?"var(--accent-text)":"var(--tx3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",minWidth:72,verticalAlign:"bottom",cursor:"pointer",userSelect:"none"}}>
                        Overall{sortArrow("__overall__")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAgents.map((r, ri) => {
                      const email = r.qa_email;
                      const agentTot = matrix.totalsByAgent[email];
                      const overall = agentTot && agentTot.n > 0 ? agentTot.w / agentTot.n : null;
                      const rowBg = ri % 2 === 0 ? "var(--bg)" : "var(--bg2)";
                      return <tr key={email}>
                        <td style={{position:"sticky",left:0,zIndex:1,background:rowBg,padding:"6px 12px",borderBottom:"1px solid var(--bd2)",borderRight:"1px solid var(--bd2)",whiteSpace:"nowrap"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>
                              {nameFromEmail(email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                            </div>
                            <span style={{fontSize:12,fontWeight:500,color:"var(--tx)"}}>{nameFromEmail(email)}</span>
                            <span style={{fontSize:10,color:"var(--tx3)"}}>· {agentTot.s}</span>
                          </div>
                        </td>
                        {visibleTopics.map(t => {
                          const cell = matrix.cells[email + "\u0000" + t];
                          const score = cell?.score ?? null;
                          const surveys = cell?.surveys ?? 0;
                          const st = cellStyle(score, surveys);
                          return <td key={t} title={score != null && surveys > 0 ? `${nameFromEmail(email)} · ${t}\n${score.toFixed(1)}% (${surveys} survey${surveys!==1?"s":""})` : `${nameFromEmail(email)} · ${t}\nNo surveys`}
                                     style={{padding:0,borderBottom:"1px solid var(--bd2)",textAlign:"center",minWidth:36,maxWidth:36,width:36,height:30,fontSize:11,...st,background:surveys>0?st.background:rowBg}}>
                            {score != null && surveys > 0 ? Math.round(score) : ""}
                          </td>;
                        })}
                        <td style={{padding:"0 10px",borderBottom:"1px solid var(--bd2)",borderLeft:"1px solid var(--bd2)",textAlign:"center",fontWeight:700,fontSize:12,...cellStyle(overall, agentTot?.s || 0)}}
                            title={`${agentTot.s} survey${agentTot.s!==1?"s":""} · weighted across topics`}>
                          {overall != null ? overall.toFixed(1) + "%" : "—"}
                        </td>
                      </tr>;
                    })}
                    <tr>
                      <td style={{position:"sticky",left:0,zIndex:1,background:"var(--bg3,var(--bg2))",padding:"8px 12px",borderTop:"2px solid var(--bd2)",borderRight:"1px solid var(--bd2)",fontSize:10,color:"var(--tx3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".6px"}}>Topic overall</td>
                      {visibleTopics.map(t => {
                        const tt = matrix.totalsByTopic[t];
                        const avg = tt && tt.n > 0 ? tt.w / tt.n : null;
                        return <td key={t} style={{padding:0,borderTop:"2px solid var(--bd2)",textAlign:"center",fontSize:11,fontWeight:700,minWidth:36,maxWidth:36,width:36,height:32,...cellStyle(avg, tt?.s || 0)}}
                                   title={`${t}\n${avg!=null?avg.toFixed(1)+"%":"—"} · ${tt?.s || 0} surveys`}>
                          {avg != null ? Math.round(avg) : ""}
                        </td>;
                      })}
                      <td style={{padding:"8px 10px",borderTop:"2px solid var(--bd2)",borderLeft:"1px solid var(--bd2)",textAlign:"center",fontSize:11,color:"var(--tx3)"}}>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px 0",fontSize:11,color:"var(--tx3)"}}>
                <span>{visibleAgents.length} of {csatSorted.length} specialists shown · {visibleTopics.length} of {matrix.topics.length} topics</span>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span>Low</span>
                  {[0,20,40,60,80,100].map(v => <span key={v} style={{display:"inline-block",width:18,height:14,background:`hsla(${Math.round((v/100)*120)}, 55%, 50%, 0.35)`,borderRadius:3}}/>)}
                  <span>High</span>
                </div>
              </div>
            </div>
          )
        ) : csatView === "qa" ? (
          <div className="table-wrap table-wrap-sticky">
            <table>
              <thead>
                <tr>
                  <th style={{width:32}}></th>
                  <th style={{minWidth:180}}>Specialist</th>
                  <th>TL</th>
                  <th style={{textAlign:"right"}}>CSAT %</th>
                  <th style={{textAlign:"right"}}>Surveys</th>
                </tr>
              </thead>
              <tbody>
                {csatSorted.map(r => {
                  const isExpanded = expandedEmail === r.qa_email;
                  const t = topics[topicKey(r.qa_email)];
                  const isLoading = topicsLoading === r.qa_email;
                  return <React.Fragment key={r.id+"-csat"}>
                    <tr onClick={()=>toggleRow(r.qa_email)} style={{cursor:"pointer",background:isExpanded?"var(--accent-light)":undefined}}>
                      <td style={{textAlign:"center"}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{transform:isExpanded?"rotate(180deg)":"rotate(0)",transition:"transform .2s",color:"var(--tx3)"}}><path d="M6 9l6 6 6-6"/></svg>
                      </td>
                      <td>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>
                            {nameFromEmail(r.qa_email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                          </div>
                          <div style={{fontWeight:500,fontSize:13,whiteSpace:"nowrap"}}>{nameFromEmail(r.qa_email)}</div>
                        </div>
                      </td>
                      <td style={{fontSize:12,color:"var(--tx2)",whiteSpace:"nowrap"}}>{r.qa_tl?nameFromEmail(r.qa_tl):"—"}</td>
                      {(()=>{const v=csatPctValue(r.csat_pct);const s=Number(r.csat_total||0);const show=v!=null&&s>0;return <td style={{textAlign:"right",fontWeight:600,color:csatColor(v,s)}}>{show?v.toFixed(1)+"%":"—"}</td>;})()}
                      <td style={{textAlign:"right"}}>{r.csat_total ?? "—"}</td>
                    </tr>
                    {isExpanded && <tr>
                      <td colSpan={5} style={{padding:"0 16px 16px 52px",background:"var(--bg)"}}>
                        {isLoading ? <div style={{padding:"12px 0",fontSize:12,color:"var(--tx3)"}}>Loading topics…</div>
                         : !t || t.length === 0 ? <div style={{padding:"12px 0",fontSize:12,color:"var(--tx3)"}}>No per-topic CSAT data for {selMonth}.</div>
                         : <table style={{width:"100%",marginTop:8}}>
                            <thead><tr style={{borderBottom:"1px solid var(--bd2)"}}>
                              <th style={{textAlign:"left",fontSize:11,color:"var(--tx3)",fontWeight:600,padding:"6px 8px"}}>Topic</th>
                              <th style={{textAlign:"right",fontSize:11,color:"var(--tx3)",fontWeight:600,padding:"6px 8px"}}>CSAT %</th>
                              <th style={{textAlign:"right",fontSize:11,color:"var(--tx3)",fontWeight:600,padding:"6px 8px"}}>Surveys</th>
                            </tr></thead>
                            <tbody>
                              {t.map((row,i)=>(<tr key={i}>
                                <td style={{padding:"6px 8px",fontSize:13}}>{row.topic}</td>
                                {(()=>{const v=row.csat_score!=null?Number(row.csat_score):null;const s=Number(row.surveys_count||0);const show=v!=null&&s>0;return <td style={{padding:"6px 8px",fontSize:13,textAlign:"right",fontWeight:600,color:csatColor(v,s)}}>{show?v.toFixed(1)+"%":"—"}</td>;})()}
                                <td style={{padding:"6px 8px",fontSize:13,textAlign:"right",color:"var(--tx2)"}}>{row.surveys_count ?? 0}</td>
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
          <div className="table-wrap table-wrap-sticky">
            <table>
              <thead>
                <tr>
                  <th style={{width:32}}></th>
                  <th style={{minWidth:180}}>Lead</th>
                  <th style={{textAlign:"right"}}>QAs</th>
                  <th style={{textAlign:"right"}}>CSAT %</th>
                  <th style={{textAlign:"right"}}>Surveys</th>
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
                      <td style={{textAlign:"center"}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{transform:isExpanded?"rotate(180deg)":"rotate(0)",transition:"transform .2s",color:"var(--tx3)"}}><path d="M6 9l6 6 6-6"/></svg>
                      </td>
                      <td>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>
                            {nameFromEmail(l.tl).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                          </div>
                          <div>
                            <div style={{fontWeight:600,fontSize:13}}>{nameFromEmail(l.tl)}</div>
                            <div style={{fontSize:10,color:"var(--tx3)"}}>{l.count} QA{l.count!==1?"s":""}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{textAlign:"right",fontWeight:600}}>{l.count}</td>
                      {(()=>{const s=Number(l.surveys||0);const show=l.csat!=null&&s>0;return <td style={{textAlign:"right",fontWeight:600,color:csatColor(l.csat,s)}}>{show?l.csat.toFixed(1)+"%":"—"}</td>;})()}
                      <td style={{textAlign:"right"}}>{l.surveys || "—"}</td>
                    </tr>
                    {isExpanded && <tr>
                      <td colSpan={5} style={{padding:"0 16px 16px 52px",background:"var(--bg)"}}>
                        {isLoading ? <div style={{padding:"12px 0",fontSize:12,color:"var(--tx3)"}}>Loading topics…</div>
                         : !t || t.length === 0 ? <div style={{padding:"12px 0",fontSize:12,color:"var(--tx3)"}}>No per-topic CSAT data for {selMonth}.</div>
                         : <table style={{width:"100%",marginTop:8}}>
                            <thead><tr style={{borderBottom:"1px solid var(--bd2)"}}>
                              <th style={{textAlign:"left",fontSize:11,color:"var(--tx3)",fontWeight:600,padding:"6px 8px"}}>Topic</th>
                              <th style={{textAlign:"right",fontSize:11,color:"var(--tx3)",fontWeight:600,padding:"6px 8px"}}>CSAT %</th>
                              <th style={{textAlign:"right",fontSize:11,color:"var(--tx3)",fontWeight:600,padding:"6px 8px"}}>Surveys</th>
                            </tr></thead>
                            <tbody>
                              {t.map((row,i)=>(<tr key={i}>
                                <td style={{padding:"6px 8px",fontSize:13}}>{row.topic}</td>
                                {(()=>{const v=row.csat_score!=null?Number(row.csat_score):null;const s=Number(row.surveys_count||0);const show=v!=null&&s>0;return <td style={{padding:"6px 8px",fontSize:13,textAlign:"right",fontWeight:600,color:csatColor(v,s)}}>{show?v.toFixed(1)+"%":"—"}</td>;})()}
                                <td style={{padding:"6px 8px",fontSize:13,textAlign:"right",color:"var(--tx2)"}}>{row.surveys_count ?? 0}</td>
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
