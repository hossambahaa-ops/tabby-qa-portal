import React, { useState, useEffect } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb } from "../lib/supabase.js";
import { csatPctValue } from "../lib/utils.js";
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
  const [csatView, setCsatView] = useState("qa"); // qa | lead
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [expandedLead, setExpandedLead] = useState(null);
  const [topics, setTopics] = useState({}); // key: `${email}__${month}`
  const [leadTopics, setLeadTopics] = useState({}); // key: `${leadKey}__${month}`
  const [topicsLoading, setTopicsLoading] = useState(null);
  const [leadTopicsLoading, setLeadTopicsLoading] = useState(null);

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

  if (loading) return <div className="page"><SkeletonPage /></div>;

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
  const csatColor = (v) => v == null ? "var(--tx3)" : v >= 90 ? "var(--green)" : v >= 75 ? "var(--amber)" : "var(--red)";
  const monthDate = selMonth ? `${selMonth}-01` : null;
  const topicKey = (email) => `${email}__${monthDate}`;

  const toggleRow = async (email) => {
    if (expandedEmail === email) { setExpandedEmail(null); return; }
    setExpandedEmail(email);
    const key = topicKey(email);
    if (topics[key] || !monthDate) return;
    setTopicsLoading(email);
    try {
      const rows = await sb.query("csat_by_topic", {
        select: "topic,csat_score,surveys_count",
        filters: `qa_email=eq.${encodeURIComponent(email)}&month=eq.${monthDate}&order=csat_score.desc.nullslast`,
        token
      });
      setTopics(prev => ({ ...prev, [key]: rows || [] }));
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
    const key = `${tlKey}__${monthDate}`;
    if (leadTopics[key] || !monthDate || lead.emails.length === 0) return;
    setLeadTopicsLoading(tlKey);
    try {
      const emailList = lead.emails.map(e => `"${e}"`).join(",");
      const rows = await sb.query("csat_by_topic", {
        select: "topic,csat_score,surveys_count",
        filters: `qa_email=in.(${emailList})&month=eq.${monthDate}`,
        token
      });
      const agg = {};
      (rows || []).forEach(t => {
        if (!agg[t.topic]) agg[t.topic] = { topic: t.topic, weightedSum: 0, weight: 0, simpleSum: 0, simpleCount: 0, surveys: 0 };
        const a = agg[t.topic];
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

  return <div className="page">
    <div className="page-header">
      <div className="page-title" style={{display:"flex",alignItems:"center",gap:10}}>
        <Icon d={icons.leaderboard} size={22}/>CSAT
      </div>
      <div className="page-subtitle">CSAT % and surveys, with per-topic drilldown. Click any row to expand.</div>
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
            </div>
            <span style={{fontSize:12,color:"var(--tx3)"}}>Click a row to see per-topic breakdown</span>
          </div>
        </div>
        {csatView === "qa" ? (
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
                      {(()=>{const v=csatPctValue(r.csat_pct);return <td style={{textAlign:"right",fontWeight:600,color:csatColor(v)}}>{v!=null?v.toFixed(1)+"%":"—"}</td>;})()}
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
                                <td style={{padding:"6px 8px",fontSize:13,textAlign:"right",fontWeight:600,color:csatColor(row.csat_score)}}>{row.csat_score!=null?Number(row.csat_score).toFixed(1)+"%":"—"}</td>
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
                  const t = leadTopics[`${tlKey}__${monthDate}`];
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
                      <td style={{textAlign:"right",fontWeight:600,color:csatColor(l.csat)}}>{l.csat!=null?l.csat.toFixed(1)+"%":"—"}</td>
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
                                <td style={{padding:"6px 8px",fontSize:13,textAlign:"right",fontWeight:600,color:csatColor(row.csat_score)}}>{row.csat_score!=null?Number(row.csat_score).toFixed(1)+"%":"—"}</td>
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
