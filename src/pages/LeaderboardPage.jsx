import React, { useState, useEffect, useRef } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail } from "../lib/utils.js";
import { useToast } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { ProgressRing, PulseLoader } from "../components/Charts.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";

function LeaderboardPage({token, profile, gf}) {
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selTeam, setSelTeam] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [view, setView] = useState("individual");
  const [expandedRow, setExpandedRow] = useState(null);
  const [search, setSearch] = useState("");
  const [selQuarter, setSelQuarter] = useState("");
  const [selYear, setSelYear] = useState("");
  const [selQaQuarterly, setSelQaQuarterly] = useState("");
  const {show, el} = useToast();

  // Sync global filters to local state — runs whenever global filters change
  useEffect(() => {
    if (gf?.domain) setSelDomain(gf.domain);
    else if (!gf?.domain && selDomain && !hasRole(profile?.role,"qa_supervisor")) setSelDomain("");
    if (gf?.month && months.includes(gf.month)) setSelMonth(gf.month);
    if (gf?.teams?.length > 0) setSelTeam(gf.teams[0]);
    else if (gf?.teams?.length === 0 && selTeam) setSelTeam("");
  }, [gf?.domain, gf?.month, JSON.stringify(gf?.teams), months.length]);

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows, profRows] = await Promise.all([
          dataCache.fetch("mtd_scores",()=>sb.query("mtd_scores", {select:"*",filters:"order=month.desc,final_performance.desc",token})),
          dataCache.fetch("qa_roster",()=>sb.query("qa_roster", {select:"email,queue,manager_email",token}).catch(()=>[])),
          dataCache.fetch("profiles_slim",()=>sb.query("profiles", {select:"id,email,role",filters:"status=eq.active",token}).catch(()=>[])),
        ]);
        setData(rows);
        setRoster(rosterRows);
        // Build set of non-QA emails to exclude from rankings
        // Build blacklist: for any non-QA user in profiles, block both @tabby.ai and @tabby.sa variants
        const nonQaProfiles = profRows.filter(p => p.role !== "qa");
        const blacklist = new Set();
        nonQaProfiles.forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          blacklist.add(email);
          // Also block the other domain variant
          const local = email.split("@")[0];
          if (email.endsWith("@tabby.ai")) blacklist.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) blacklist.add(local + "@tabby.ai");
        });
        const qaOnlyRows = rows.filter(r => !blacklist.has(r.qa_email?.toLowerCase()));
        setData(qaOnlyRows);
        const uniqueMonths = sortMonthsDesc([...new Set(qaOnlyRows.map(r => r.month))]);
        setMonths(uniqueMonths);
        // Global filter month takes priority, then default to latest
        if (gf?.month && uniqueMonths.includes(gf.month)) {
          setSelMonth(gf.month);
        } else if (uniqueMonths.length > 0 && !selMonth) {
          setSelMonth(uniqueMonths[0]);
        }
        // Global filter domain takes priority
        if (gf?.domain) {
          setSelDomain(gf.domain);
        } else if (hasRole(profile?.role,"qa_supervisor") && !hasRole(profile?.role,"admin") && !selDomain) {
          const svDomain = profile?.operational_domain || profile?.domain || "";
          if (svDomain) setSelDomain(svDomain);
        }
        if (gf?.teams?.length > 0) setSelTeam(gf.teams[0]);
      } catch (e) {
        console.error("Leaderboard:", e);
        show("error", "Failed to load leaderboard data");
      }
      setLoading(false);
    })();
  }, [token]);

  // ── Slab calculation engine ──
  // Parses raw value to a number (handles "94.46%", 0.944, 1.345, etc.)
  const parseRaw = (val) => {
    if (!val && val !== 0) return null;
    const s = String(val).trim().replace(",", ".");
    if (s.includes("%")) return parseFloat(s.replace("%", ""));
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    // If between 0 and 2, it's likely a decimal (0.944 = 94.4%)
    if (n >= 0 && n <= 2) return n * 100;
    return n;
  };

  // KPI slab definitions: { thresholds: [slab1, slab2, slab3], weight }
  // Slab 0 = below slab1 → 0%, Slab 1 = ≥slab1 → 50%, Slab 2 = ≥slab2 → 75%, Slab 3 = ≥slab3 → 100%
  const KPI_SLABS = {
    occupancy:    { label: "Occupancy",            weight: 15, thresholds: [95, 98, 100], rawKey: "occupancy_pct" },
    coaching:     { label: "Coaching on-time",     weight: 10, thresholds: [90, 93, 95],  rawKey: "ontime_coaching_pct" },
    calibration:  { label: "Calibration",          weight: 10, thresholds: [85, 90, 95],  rawKey: "avg_calibration_match_rate" },
    observation:  { label: "Coaching observation",  weight: 10, thresholds: [82, 85, 88],  rawKey: "avg_observation_score_pct" },
    rtr:          { label: "RTR score",            weight: 10, thresholds: [80, 85, 90],  rawKey: "avg_rtr_score" },
  };

  const calcSlab = (rawPct, thresholds) => {
    if (rawPct === null || rawPct === undefined) return { slab: 0, pct: 0, label: "No data" };
    if (rawPct >= thresholds[2]) return { slab: 3, pct: 100, label: "Slab 3" };
    if (rawPct >= thresholds[1]) return { slab: 2, pct: 75,  label: "Slab 2" };
    if (rawPct >= thresholds[0]) return { slab: 1, pct: 50,  label: "Slab 1" };
    return { slab: 0, pct: 0, label: "Slab 0" };
  };

  const getKpiScores = (row) => {
    return Object.entries(KPI_SLABS).map(([key, def]) => {
      const rawPct = parseRaw(row[def.rawKey]);
      const slab = calcSlab(rawPct, def.thresholds);
      const score = (def.weight * slab.pct) / 100; // weighted score
      return { key, label: def.label, weight: def.weight, rawPct, slab, score, thresholds: def.thresholds };
    });
  };

  const getTotalScore = (row) => {
    const kpis = getKpiScores(row);
    return kpis.reduce((sum, k) => sum + k.score, 0);
  };

  // Format raw percentage for display
  const fmtRaw = (val) => {
    if (val === null || val === undefined) return "—";
    return val.toFixed(1) + "%";
  };

  const monthData = data.filter(r => r.month === selMonth);
  const rosterMap = {};
  roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  const teams = [...new Set(roster.filter(r => r.queue && (!selDomain || r.email?.endsWith("@"+selDomain))).map(r => r.queue))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+selDomain));
  if (selTeam) filtered = filtered.filter(r => rosterMap[r.qa_email?.toLowerCase()]?.queue === selTeam);
  if (search.trim()) filtered = filtered.filter(r => r.qa_email?.toLowerCase().includes(search.toLowerCase()));
  // Apply global people filter
  if (gf?.people?.length > 0) filtered = filtered.filter(r => gf.people.includes(r.qa_email?.toLowerCase()));
  // Rank by calculated total score
  const ranked = [...filtered].sort((a, b) => getTotalScore(b) - getTotalScore(a));

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const initialsFromEmail = (email) => {
    const name = nameFromEmail(email);
    const parts = name.split(" ");
    return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
  };

  const teamData = (() => {
    const tlMap = {};
    ranked.forEach(r => {
      const tl = r.qa_tl || "Unassigned";
      if (!tlMap[tl]) tlMap[tl] = { tl, members: [], totalScore: 0 };
      tlMap[tl].members.push(r);
      tlMap[tl].totalScore += getTotalScore(r);
    });
    return Object.values(tlMap).map(t => ({
      ...t,
      avgScore: t.members.length ? (t.totalScore / t.members.length) : 0,
      highest: t.members.length ? Math.max(...t.members.map(m => getTotalScore(m))) : 0,
      lowest: t.members.length ? Math.min(...t.members.map(m => getTotalScore(m))) : 0,
      totalDsat: t.members.reduce((a, m) => a + (m.dsat || 0), 0),
    })).sort((a, b) => b.avgScore - a.avgScore);
  })();

  const maxScore = 55; // total weight of 5 non-CSAT KPIs
  const avgScore = ranked.length ? (ranked.reduce((a, r) => a + getTotalScore(r), 0) / ranked.length) : 0;
  const topPerson = ranked[0];
  const totalDsat = ranked.reduce((a, r) => a + (r.dsat || 0), 0);
  // Color based on score out of 55
  const scoreColor = (v) => v >= maxScore * 0.7 ? "var(--green)" : v >= maxScore * 0.4 ? "var(--amber)" : "var(--red)";
  const scoreBg = (v) => v >= maxScore * 0.7 ? "var(--green-bg)" : v >= maxScore * 0.4 ? "var(--amber-bg)" : "var(--red-bg)";

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Leaderboard</div>
          <div className="page-subtitle">Performance rankings — {selMonth || "All months"}</div>
        </div>
        {hasRole(profile?.role,"qa_lead")&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <SearchableSelect options={months} value={selMonth} onChange={v=>{setSelMonth(v);setSelDomain("");setSelTeam("");}} placeholder="Select month"/>
          <SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={selDomain} onChange={v=>{setSelDomain(v);setSelTeam("");}} placeholder="All domains"/>
        </div>}
      </div>

      {loading ? <PulseLoader/> : <>

      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
        <div className="tabs">
          <button className={`tab ${view==="individual"?"active":""}`} onClick={()=>setView("individual")}>Individual</button>
          {hasRole(profile?.role,"qa_supervisor")&&<button className={`tab ${view==="team"?"active":""}`} onClick={()=>setView("team")}>By team lead</button>}
          {hasRole(profile?.role,"qa_supervisor")&&<button className={`tab ${view==="quarterly"?"active":""}`} onClick={()=>setView("quarterly")}>Quarterly</button>}
        </div>
        {hasRole(profile?.role,"qa_lead")&&<SearchableSelect options={teams} value={selTeam} onChange={setSelTeam} placeholder={`All teams (${teams.length})`}/>}
        {view==="individual" && hasRole(profile?.role,"qa_lead") && <input className="input" placeholder="Search by name or email..." value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:220,marginLeft:"auto",fontSize:12}}/>}
      </div>

      {hasRole(profile?.role,"qa_lead")&&<div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">{view==="individual"?"Ranked":"Teams"}</div>
          <div className="stat-value">{view==="individual"?ranked.length:teamData.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg score</div>
          <ProgressRing value={avgScore} max={maxScore} size={48} stroke={4}
            color={scoreColor(avgScore)} label={avgScore.toFixed(1)} sublabel={`of ${maxScore}`}
          />
        </div>
        {topPerson && view==="individual" && <div className="stat-card">
          <div className="stat-label">Top performer</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:4}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",color:"#92400E",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12}}>1</div>
            <div style={{fontWeight:700,fontSize:15,letterSpacing:"-.3px"}}>{nameFromEmail(topPerson.qa_email)}</div>
          </div>
        </div>}
        <div className="stat-card">
          <div className="stat-label">Total DSAT</div>
          <div className="stat-value" style={{color:totalDsat>0?"var(--red)":"var(--tx)"}}>{totalDsat}</div>
        </div>
      </div>}

      {view==="individual" && (()=>{
        const myEmailInd = profile?.email?.toLowerCase();
        const isQaInd = profile?.role === "qa";
        const isLeadInd = hasRole(profile?.role, "qa_lead") && !hasRole(profile?.role, "qa_supervisor");
        
        // For QA leads: filter to their team only (cross-domain)
        const myLocalInd = myEmailInd?.split("@")[0]||"";
        const myAltInd = myEmailInd?(myEmailInd.endsWith("@tabby.ai")?myLocalInd+"@tabby.sa":myLocalInd+"@tabby.ai"):"";
        const myTeamEmailsInd = roster.filter(r => {const m=r.manager_email?.toLowerCase();return m&&(m===myEmailInd||m===myAltInd||m===myLocalInd);}).map(r => r.email?.toLowerCase());
        
        let visibleRanked = ranked;
        if (isQaInd) {
          // QAs: top 3 + their own rank
          const top3 = ranked.slice(0, 3);
          const myRankIdx = ranked.findIndex(r => r.qa_email?.toLowerCase() === myEmailInd);
          const myEntry = myRankIdx >= 0 ? ranked[myRankIdx] : null;
          visibleRanked = [...top3];
          if (myEntry && myRankIdx >= 3) visibleRanked.push({ ...myEntry, _myRank: myRankIdx + 1 });
          const seen = new Set();
          visibleRanked = visibleRanked.filter(r => { const e = r.qa_email?.toLowerCase(); if (seen.has(e)) return false; seen.add(e); return true; });
        } else if (isLeadInd && myTeamEmailsInd.length > 0) {
          // Leads: their team
          visibleRanked = ranked.filter(r => myTeamEmailsInd.includes(r.qa_email?.toLowerCase()) || r.qa_email?.toLowerCase() === myEmailInd);
        }

        return <>
        {isQaInd && <div style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8,marginBottom:12,fontSize:12,color:"var(--tx3)"}}>
          Showing top 3 performers and your position. Full rankings are visible to team leads.
        </div>}

        {/* ── QA Self-Service: My Performance Panel ── */}
        {isQaInd && (()=>{
          const myRankIdx = ranked.findIndex(r => r.qa_email?.toLowerCase() === myEmailInd);
          const myRow = myRankIdx >= 0 ? ranked[myRankIdx] : null;
          if (!myRow) return null;
          const myKpis = getKpiScores(myRow);
          const myTotal = myKpis.reduce((s,k) => s + k.score, 0);
          // Historical scores across months
          const history = months.slice(0,6).reverse().map(m => {
            const row = mtd.find(r => r.month === m && r.qa_email?.toLowerCase() === myEmailInd);
            if (!row) return { month: m, score: null };
            const ks = getKpiScores(row);
            return { month: m, score: ks.reduce((s,k) => s + k.score, 0) };
          }).filter(h => h.score !== null);

          return <div className="card" style={{marginBottom:24,borderLeft:"4px solid var(--tabby-purple,#6A2C79)"}}>
            <div className="card-header">
              <span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>📊</span> My Performance — {selMonth}
              </span>
              <span style={{fontSize:22,fontWeight:800,letterSpacing:"-1px",color:scoreColor(myTotal)}}>
                {myTotal.toFixed(1)} <span style={{fontSize:13,fontWeight:400,color:"var(--tx3)"}}>/ {maxScore}</span>
                <span style={{fontSize:12,fontWeight:600,color:"var(--tx3)",marginLeft:8}}>Rank #{myRankIdx+1} of {ranked.length}</span>
              </span>
            </div>

            {/* KPI Slab Breakdown */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 20px",marginBottom:16}}>
              {myKpis.map(k => (
                <div key={k.key} style={{padding:"10px 14px",background:"var(--bg)",borderRadius:10,border:"1px solid var(--bd2)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:600}}>{k.label}</span>
                    <span style={{fontSize:12,fontWeight:700,color:scoreColor(k.score/k.weight*maxScore)}}>{k.score.toFixed(1)} / {k.weight}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--tx2)",marginBottom:4}}>
                    <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</span>
                    <span style={{padding:"1px 6px",borderRadius:8,fontSize:9,fontWeight:600,
                      background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=75?"var(--blue-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",
                      color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"
                    }}>{k.slab.label} ({k.slab.pct}%)</span>
                  </div>
                  <div style={{height:5,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)",transition:"width .4s"}}/></div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"var(--tx3)",marginTop:3}}>
                    <span>Slab 1: ≥{k.thresholds[0]}%</span><span>Slab 2: ≥{k.thresholds[1]}%</span><span>Slab 3: ≥{k.thresholds[2]}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Extra metrics */}
            <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:16,paddingBottom:12,borderBottom:"1px solid var(--bd2)"}}>
              <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>DSAT: </span><span style={{fontWeight:600,color:"var(--tx)"}}>{myRow.dsat||0}</span></div>
              <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Tickets/day: </span><span style={{fontWeight:600}}>{myRow.ticket_per_day||"—"}</span></div>
              <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>JKQ: </span><span style={{fontWeight:600,color:myRow.jkq_result==="Pass"?"var(--green)":myRow.jkq_result==="Missed"?"var(--red)":"var(--tx2)"}}>{myRow.jkq_result||"—"}</span></div>
              <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Working days: </span><span style={{fontWeight:600}}>{myRow.working_days||"—"}</span></div>
            </div>

            {/* Historical Trend */}
            {history.length >= 2 && <div>
              <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Score history</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:60}}>
                {history.map((h,i) => {
                  const pct = h.score / maxScore * 100;
                  const isLatest = i === history.length - 1;
                  return <div key={h.month} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,gap:4}}>
                    <span style={{fontSize:10,fontWeight:isLatest?700:400,color:isLatest?scoreColor(h.score):"var(--tx3)"}}>{h.score.toFixed(1)}</span>
                    <div style={{width:"100%",height:`${Math.max(pct*0.5,4)}px`,borderRadius:4,background:isLatest?scoreColor(h.score):"var(--bd)",transition:"height .3s"}}/>
                    <span style={{fontSize:9,color:"var(--tx3)"}}>{h.month.split("-")[0]}</span>
                  </div>;
                })}
              </div>
            </div>}
          </div>;
        })()}

        {/* Podium top 3 */}
        {ranked.length >= 3 && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:20,marginBottom:32,flexWrap:"wrap"}}>
          {[1,0,2].map(idx => {
            const r = ranked[idx]; const rank = idx + 1; const isGold = rank === 1;
            const total = getTotalScore(r);
            const podiumColors = {
              1: { bg: "linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02))", border: "rgba(245,158,11,.3)", medal: "#F59E0B", ring: "#F59E0B" },
              2: { bg: "linear-gradient(135deg, rgba(156,163,175,.08), rgba(156,163,175,.02))", border: "rgba(156,163,175,.2)", medal: "#9CA3AF", ring: "#9CA3AF" },
              3: { bg: "linear-gradient(135deg, rgba(234,88,12,.06), rgba(234,88,12,.02))", border: "rgba(234,88,12,.2)", medal: "#EA580C", ring: "#EA580C" },
            }[rank];
            return (<div key={r.qa_email} style={{
              textAlign:"center", padding:isGold?"28px 32px":"22px 26px", minWidth:isGold?200:170,
              background: podiumColors.bg, border: `1px solid ${podiumColors.border}`,
              borderRadius: 16, transform:isGold?"translateY(-12px)":"none", transition:"all .3s cubic-bezier(.4,0,.2,1)",
              position: "relative", overflow: "hidden",
            }}
              onMouseEnter={e => e.currentTarget.style.transform = isGold ? "translateY(-16px) scale(1.02)" : "translateY(-4px) scale(1.02)"}
              onMouseLeave={e => e.currentTarget.style.transform = isGold ? "translateY(-12px)" : "none"}
            >
              {/* Rank badge */}
              <div style={{
                width: isGold?36:28, height: isGold?36:28, borderRadius: "50%", background: podiumColors.medal,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: isGold?16:13, margin: "0 auto 12px",
                boxShadow: `0 4px 12px ${podiumColors.medal}40`,
              }}>{rank}</div>
              {/* Avatar with score ring */}
              <div style={{position:"relative",margin:"0 auto 10px",width:isGold?64:52,height:isGold?64:52}}>
                <ProgressRing value={total} max={maxScore} size={isGold?64:52} stroke={3} color={podiumColors.ring} />
                <div style={{
                  position:"absolute",inset:isGold?8:6,borderRadius:"50%",background:"var(--primary-light)",
                  color:"var(--tabby-green)",display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:700,fontSize:isGold?16:13,letterSpacing:"-0.5px",
                }}>{initialsFromEmail(r.qa_email)}</div>
              </div>
              <div style={{fontWeight:700,fontSize:isGold?16:14,letterSpacing:"-.3px"}}>{nameFromEmail(r.qa_email)}</div>
              <div style={{fontSize:11,color:"var(--tx3)",marginBottom:10}}>{r.qa_email.split("@")[1]}</div>
              <div style={{fontSize:isGold?28:22,fontWeight:800,color:scoreColor(total),letterSpacing:"-1px",fontVariantNumeric:"tabular-nums"}}>{total.toFixed(1)}<span style={{fontSize:12,fontWeight:500,color:"var(--tx3)"}}> / {maxScore}</span></div>
              <div style={{fontSize:10,color:"var(--tx3)",marginTop:6,fontWeight:500}}>JKQ: {r.jkq_result||"—"} · {r.ticket_per_day} tickets/day</div>
            </div>);
          })}
        </div>}

        {/* Full ranking table */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Full rankings — {selMonth}</span>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:12,color:"var(--tx3)"}}>{visibleRanked.length} specialists · Scored out of {maxScore}</span>
              {hasRole(profile?.role,"qa_lead")&&<button className="btn btn-outline btn-sm" onClick={()=>{
                const kpiHeaders=Object.values(KPI_SLABS).map(k=>k.label);
                const csv=["Rank,Specialist,Email,TL,"+kpiHeaders.join(",")+",Total"];
                ranked.forEach((r,i)=>{
                  const kpis=getKpiScores(r);
                  csv.push(`${i+1},"${nameFromEmail(r.qa_email)}",${r.qa_email},"${r.qa_tl?nameFromEmail(r.qa_tl):""}",${kpis.map(k=>k.score.toFixed(1)).join(",")},${getTotalScore(r).toFixed(1)}`);
                });
                const blob=new Blob([csv.join("\n")],{type:"text/csv"});
                const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`leaderboard_${selMonth}.csv`;a.click();
              }} style={{fontSize:11}}>
                <Icon d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" size={13}/>Export CSV
              </button>}
            </div>
          </div>
          {visibleRanked.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {selMonth}.</p></div> :
          <div className="table-wrap"><table><thead><tr>
            <th style={{width:50}}>#</th>
            <th>Specialist</th>
            <th>TL</th>
            {Object.values(KPI_SLABS).map(k => <th key={k.label} style={{textAlign:"center",minWidth:100}}>{k.label}<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{k.weight}</span></th>)}
            <th style={{textAlign:"center",minWidth:80}}>Total<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{maxScore}</span></th>
            <th style={{width:40}}></th>
          </tr></thead><tbody>
            {visibleRanked.map((r, i) => {
              const rank = r._myRank || (ranked.findIndex(x => x.qa_email?.toLowerCase() === r.qa_email?.toLowerCase()) + 1);
              const isExp = expandedRow === r.id;
              const isMe = r.qa_email?.toLowerCase() === myEmailInd;
              const showGap = isQaInd && r._myRank && r._myRank > 4;
              const kpis = getKpiScores(r);
              const total = kpis.reduce((s, k) => s + k.score, 0);
              return (<React.Fragment key={r.id || r.qa_email}>
                {showGap && <tr><td colSpan={4 + Object.keys(KPI_SLABS).length} style={{textAlign:"center",padding:"6px",color:"var(--tx3)",fontSize:12,background:"var(--bg)"}}>···</td></tr>}
                <tr onClick={() => setExpandedRow(isExp ? null : r.id)} style={{cursor:"pointer",background:isMe?"var(--accent-light)":"transparent"}}>
                  <td>{rank <= 3 ? <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",fontWeight:700,fontSize:12,background:rank===1?"linear-gradient(135deg,#FEF3C7,#FDE68A)":rank===2?"linear-gradient(135deg,#F3F4F6,#E5E7EB)":"linear-gradient(135deg,#FED7AA,#FDBA74)",color:rank===1?"#92400E":rank===2?"#374151":"#9A3412",boxShadow:rank===1?"0 2px 8px rgba(245,158,11,.3)":"none"}}>{rank}</span> : <span style={{color:"var(--tx3)",fontWeight:600,fontSize:13}}>{rank}</span>}</td>
                  <td><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:34,height:34,borderRadius:"50%",flexShrink:0,background:"var(--primary-light)",color:"var(--tabby-purple-light,var(--accent-text))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,border:"2px solid var(--bd2)"}}>{initialsFromEmail(r.qa_email)}</div><div><div style={{fontWeight:600,fontSize:13.5,letterSpacing:"-.2px"}}>{nameFromEmail(r.qa_email)}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{r.qa_email}</div></div></div></td>
                  <td style={{fontSize:13,color:"var(--tx2)"}}>{r.qa_tl ? nameFromEmail(r.qa_tl) : "—"}</td>
                  {kpis.map(k => (
                    <td key={k.key} style={{textAlign:"center",padding:"8px 6px"}}>
                      <div style={{fontSize:13,fontWeight:600,color:scoreColor(k.score/k.weight*maxScore)}}>{k.score.toFixed(1)}</div>
                      <div style={{fontSize:10,color:"var(--tx3)"}}>{k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</div>
                      <div style={{height:3,background:"var(--bd2)",borderRadius:2,marginTop:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:2,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)",transition:"width .3s"}}/></div>
                    </td>
                  ))}
                  <td style={{textAlign:"center"}}>
                    <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:600,background:scoreBg(total),color:scoreColor(total)}}>{total.toFixed(1)}</span>
                  </td>
                  <td><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
                </tr>

                {/* Expanded KPI detail */}
                {isExp && <tr><td colSpan={9+Object.keys(KPI_SLABS).length} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px 16px 60px"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--tx2)",marginBottom:12,textTransform:"uppercase",letterSpacing:".5px"}}>KPI slab breakdown</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 24px"}}>
                    {kpis.map(k => (
                      <div key={k.key} style={{padding:"10px 12px",background:"var(--bg3)",borderRadius:8,border:"1px solid var(--bd2)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:13,fontWeight:600}}>{k.label}</span>
                          <span style={{fontSize:13,fontWeight:700,color:scoreColor(k.score/k.weight*maxScore)}}>{k.score.toFixed(1)} / {k.weight}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--tx2)",marginBottom:6}}>
                          <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "No data"}</span>
                          <span style={{padding:"1px 8px",borderRadius:10,fontSize:10,fontWeight:600,
                            background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=75?"var(--blue-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",
                            color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"
                          }}>{k.slab.label} ({k.slab.pct}%)</span>
                        </div>
                        <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)",transition:"width .4s"}}/></div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--tx3)",marginTop:4}}>
                          <span>Slab 1: ≥{k.thresholds[0]}%</span>
                          <span>Slab 2: ≥{k.thresholds[1]}%</span>
                          <span>Slab 3: ≥{k.thresholds[2]}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:16,paddingTop:12,borderTop:"1px solid var(--bd2)"}}>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Tickets/day: </span><span style={{fontWeight:600}}>{r.ticket_per_day}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>JKQ: </span><span style={{fontWeight:600,color:r.jkq_result==="Pass"?"var(--green)":r.jkq_result==="Missed"?"var(--red)":"var(--tx2)"}}>{r.jkq_result||"—"} {r.jkq_score>0?`(${r.jkq_score})`:""}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>DSAT: </span><span style={{fontWeight:600}}>{r.dsat||0}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>SBS: </span><span style={{fontWeight:600}}>{r.sbs||0}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Working days: </span><span style={{fontWeight:600}}>{r.working_days||0}{r.ramadan_wds ? ` (${r.ramadan_wds} Ramadan)` : ""}</span></div>
                    <div style={{fontSize:12}}><span style={{color:"var(--tx3)"}}>Total: </span><span style={{fontWeight:700,color:scoreColor(total)}}>{total.toFixed(1)} / {maxScore}</span></div>
                  </div>
                </div></td></tr>}
              </React.Fragment>);
            })}
          </tbody></table></div>}
        </div>
      </>;
      })()}

      {view==="team" && <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {teamData.length === 0 ? <div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {selMonth}.</p></div></div> :
        teamData.map((team, ti) => {
          const rank = ti + 1; const isGold = rank === 1;
          return (<div key={team.tl} className="card" style={{border:isGold?"2px solid var(--amber)":"1px solid var(--bd2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:isGold?"var(--amber-bg)":"var(--bg2)",color:isGold?"var(--amber)":"var(--tx2)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16}}>#{rank}</div>
                <div><div style={{fontWeight:600,fontSize:15}}>{nameFromEmail(team.tl)}</div><div style={{fontSize:12,color:"var(--tx3)"}}>{team.tl} · {team.members.length} member{team.members.length!==1?"s":""}</div></div>
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:700,color:scoreColor(team.avgScore)}}>{team.avgScore.toFixed(1)}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {maxScore}</span></div><div style={{fontSize:11,color:"var(--tx3)"}}>avg score</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,paddingTop:12,borderTop:"1px solid var(--bd2)",marginBottom:14}}>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Highest</div><div style={{fontSize:16,fontWeight:600,color:"var(--green)"}}>{team.highest.toFixed(1)} / {maxScore}</div></div>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Lowest</div><div style={{fontSize:16,fontWeight:600,color:scoreColor(team.lowest)}}>{team.lowest.toFixed(1)} / {maxScore}</div></div>
              <div><div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Total DSAT</div><div style={{fontSize:16,fontWeight:600,color:"var(--tx)"}}>{team.totalDsat}</div></div>
            </div>
            <div style={{fontSize:11,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Members</div>
            {team.members.sort((a,b)=>getTotalScore(b)-getTotalScore(a)).map((m,mi) => {
              const mScore = getTotalScore(m);
              return (
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:mi<team.members.length-1?"1px solid var(--bd2)":"none"}}>
                <span style={{fontSize:12,color:"var(--tx3)",width:20,textAlign:"right"}}>{mi+1}.</span>
                <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>{initialsFromEmail(m.qa_email)}</div>
                <span style={{fontSize:13,flex:1}}>{nameFromEmail(m.qa_email)}</span>
                <span style={{fontSize:13,fontWeight:600,color:scoreColor(mScore)}}>{mScore.toFixed(1)} / {maxScore}</span>
              </div>);
            })}
          </div>);
        })}
      </div>}

      {/* ═══ QUARTERLY VIEW ═══ */}
      {view==="quarterly" && (()=>{
        const parseMonth = (m) => {
          if (!m) return null;
          const parts = m.split("-");
          const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const mi = monthNames.indexOf(parts[0]);
          const yr = parseInt(parts[1]);
          if (mi === -1 || isNaN(yr)) return null;
          return { monthIndex: mi, year: yr, quarter: Math.floor(mi / 3) + 1 };
        };
        const allParsed = months.map(m => ({ raw: m, ...parseMonth(m) })).filter(p => p.monthIndex !== undefined);
        const quarterMap = {};
        allParsed.forEach(p => {
          const key = `Q${p.quarter}-${p.year}`;
          if (!quarterMap[key]) quarterMap[key] = { label: key, year: p.year, quarter: p.quarter, months: [] };
          quarterMap[key].months.push(p.raw);
        });
        const quarters = Object.values(quarterMap).sort((a, b) => b.year - a.year || b.quarter - a.quarter);
        const activeQ = selQuarter && quarters.find(q => q.label === selQuarter) ? selQuarter : (quarters[0]?.label || "");
        const qData = quarters.find(q => q.label === activeQ);
        // Sort months chronologically within the quarter
        const monthOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const qMonths = qData ? [...qData.months].sort((a, b) => {
          const ai = monthOrder.indexOf(a.split("-")[0]);
          const bi = monthOrder.indexOf(b.split("-")[0]);
          return ai - bi;
        }) : [];
        const qRows = data.filter(r => qMonths.includes(r.month));

        // For each QA, calculate their slab score per month (0-55), then sum across the quarter
        // Max per month = 55, so max per quarter = 55 × months (165 for 3 months)
        const qaMap = {};
        qRows.forEach(row => {
          const email = row.qa_email?.toLowerCase();
          if (!email) return;
          if (selDomain && !email.endsWith("@" + selDomain)) return;
          if (selTeam && rosterMap[email]?.queue !== selTeam) return;
          if (!qaMap[email]) qaMap[email] = { email: row.qa_email, months_present: 0, monthlyScores: [], tl: row.qa_tl, totalDsat: 0, totalTickets: 0, totalWorkingDays: 0 };
          qaMap[email].months_present++;
          qaMap[email].totalDsat += (row.dsat || 0);
          qaMap[email].totalTickets += (row.ticket_per_day || 0);
          qaMap[email].totalWorkingDays += (row.working_days || 0);
          // Raw slab score for this month (0-55)
          const monthScore = getTotalScore(row);
          qaMap[email].monthlyScores.push(monthScore);
        });

        // Quarterly total = sum of monthly raw scores
        const allQas = Object.values(qaMap).map(qa => {
          const totalScore = qa.monthlyScores.reduce((s, p) => s + p, 0);
          return { ...qa, totalScore };
        }).sort((a, b) => b.totalScore - a.totalScore);

        // Visibility
        const myEmailQ = profile?.email?.toLowerCase();
        const isQaQ = profile?.role === "qa";
        const isLeadQ = hasRole(profile?.role, "qa_lead");
        const isSupervisorQ = hasRole(profile?.role, "qa_supervisor");
        const isAdminQ = hasRole(profile?.role, "admin");
        const myDomainQ = profile?.operational_domain || profile?.domain || "tabby.ai";
        const myLocalQ = myEmailQ?.split("@")[0]||"";
        const myAltQ = myEmailQ?(myEmailQ.endsWith("@tabby.ai")?myLocalQ+"@tabby.sa":myLocalQ+"@tabby.ai"):"";
        const rosterTeamQ = roster.filter(r => {const m=r.manager_email?.toLowerCase?.();return m&&(m===myEmailQ||m===myAltQ||m===myLocalQ);}).map(r => r.email?.toLowerCase())
          .concat(qRows.filter(row=>{ const tl=row.qa_tl?.toLowerCase(); return tl&&(tl===myEmailQ||tl===myAltQ); }).map(r=>r.qa_email?.toLowerCase()));
        const teamEmailsQ = [...new Set(rosterTeamQ)];

        let visibleQas;
        if (isAdminQ) { visibleQas = allQas; }
        else if (isSupervisorQ) { visibleQas = allQas.filter(qa => qa.email?.endsWith("@" + myDomainQ)); }
        else if (isLeadQ) { visibleQas = allQas.filter(qa => teamEmailsQ.includes(qa.email?.toLowerCase()) || qa.email?.toLowerCase() === myEmailQ); }
        else {
          const top3 = allQas.slice(0, 3);
          const myEntry = allQas.find(qa => qa.email?.toLowerCase() === myEmailQ);
          const myRankIdx = allQas.findIndex(qa => qa.email?.toLowerCase() === myEmailQ);
          visibleQas = [...top3];
          if (myEntry && myRankIdx >= 3) visibleQas.push({ ...myEntry, _myRank: myRankIdx + 1 });
          const seen = new Set();
          visibleQas = visibleQas.filter(qa => { const e = qa.email?.toLowerCase(); if (seen.has(e)) return false; seen.add(e); return true; });
        }

        // Apply search/email filter
        if (selQaQuarterly) {
          const isExactEmail = allQas.some(qa => qa.email?.toLowerCase() === selQaQuarterly.toLowerCase());
          if (isExactEmail) {
            visibleQas = visibleQas.filter(qa => qa.email?.toLowerCase() === selQaQuarterly.toLowerCase());
          } else {
            const q = selQaQuarterly.toLowerCase();
            visibleQas = visibleQas.filter(qa => {
              const name = qa.email?.split("@")[0]?.split(".").map(p=>p.replace(/[\d]+$/,"")).filter(Boolean).join(" ").toLowerCase() || "";
              return name.includes(q) || qa.email.toLowerCase().includes(q);
            });
          }
        }

        return <div>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <select className="select" value={activeQ} onChange={e=>{setSelQuarter(e.target.value);setSelQaQuarterly("");}}>
              {quarters.map(q => <option key={q.label} value={q.label}>{q.label} ({q.months.length} month{q.months.length!==1?"s":""})</option>)}
            </select>
            <div style={{position:"relative",minWidth:220,flex:1,maxWidth:320}}>
              <input className="form-input" value={selQaQuarterly} onChange={e=>setSelQaQuarterly(e.target.value)} placeholder={`Search specialists (${allQas.length})...`} autoComplete="off" style={{fontSize:13}}/>
              {selQaQuarterly && !allQas.find(qa=>qa.email===selQaQuarterly) && (()=>{
                const q=selQaQuarterly.toLowerCase();
                const matches=allQas.filter(qa=>{
                  const name=qa.email?.split("@")[0]?.split(".").map(p=>p.replace(/[\d]+$/,"")).filter(Boolean).join(" ").toLowerCase()||"";
                  return name.includes(q)||qa.email.toLowerCase().includes(q);
                }).slice(0,8);
                if(!matches.length)return null;
                return <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:10,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:"0 0 var(--radius) var(--radius)",boxShadow:"var(--shadow-lg)",maxHeight:220,overflowY:"auto"}}>
                  {matches.map(qa=><div key={qa.email} onClick={()=>setSelQaQuarterly(qa.email)} style={{padding:"8px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid var(--bd2)",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background="var(--bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontWeight:500}}>{nameFromEmail(qa.email)}</span>
                    <span style={{fontSize:12,fontWeight:600}}>{qa.totalScore.toFixed(1)}%</span>
                  </div>)}
                </div>;
              })()}
              {selQaQuarterly && <button onClick={()=>setSelQaQuarterly("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:16,lineHeight:1}}>×</button>}
            </div>
            {qData && <span style={{fontSize:12,color:"var(--tx3)"}}>Months: {qMonths.join(", ")}</span>}
          </div>

          <div className="stats-grid" style={{marginBottom:20}}>
            <div className="stat-card"><div className="stat-label">Quarter</div><div className="stat-value">{activeQ}</div></div>
            <div className="stat-card"><div className="stat-label">QAs ranked</div><div className="stat-value">{allQas.length}</div></div>
            <div className="stat-card">
              <div className="stat-label">Avg score</div>
              <ProgressRing value={allQas.length?allQas.reduce((a,q)=>a+q.totalScore,0)/allQas.length:0} max={55*qMonths.length} size={48} stroke={4}
                color="var(--tabby-green)"
                label={allQas.length?(allQas.reduce((a,q)=>a+q.totalScore,0)/allQas.length).toFixed(1)+"%":"—"}
                sublabel={`of ${55*qMonths.length}%`}
              />
            </div>
            {allQas[0] && <div className="stat-card">
              <div className="stat-label">Top performer</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:4}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",color:"#92400E",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12}}>1</div>
                <div style={{fontWeight:700,fontSize:15,letterSpacing:"-.3px"}}>{nameFromEmail(allQas[0].email)}</div>
              </div>
            </div>}
          </div>

          {allQas.length >= 3 && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:20,marginBottom:32,flexWrap:"wrap"}}>
            {[1,0,2].map(idx => {
              const qa = allQas[idx]; const rank = idx + 1; const isGold = rank === 1;
              const podiumColors = {
                1: { bg: "linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02))", border: "rgba(245,158,11,.3)", medal: "#F59E0B" },
                2: { bg: "linear-gradient(135deg, rgba(156,163,175,.08), rgba(156,163,175,.02))", border: "rgba(156,163,175,.2)", medal: "#9CA3AF" },
                3: { bg: "linear-gradient(135deg, rgba(234,88,12,.06), rgba(234,88,12,.02))", border: "rgba(234,88,12,.2)", medal: "#EA580C" },
              }[rank];
              return (<div key={qa.email} style={{
                textAlign:"center",padding:isGold?"28px 32px":"22px 26px",minWidth:isGold?200:170,
                background:podiumColors.bg,border:`1px solid ${podiumColors.border}`,borderRadius:16,
                transform:isGold?"translateY(-12px)":"none",transition:"all .3s cubic-bezier(.4,0,.2,1)",
              }}
                onMouseEnter={e => e.currentTarget.style.transform = isGold ? "translateY(-16px) scale(1.02)" : "translateY(-4px) scale(1.02)"}
                onMouseLeave={e => e.currentTarget.style.transform = isGold ? "translateY(-12px)" : "none"}
              >
                <div style={{width:isGold?36:28,height:isGold?36:28,borderRadius:"50%",background:podiumColors.medal,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:isGold?16:13,margin:"0 auto 12px",boxShadow:`0 4px 12px ${podiumColors.medal}40`}}>{rank}</div>
                <div style={{width:isGold?52:40,height:isGold?52:40,borderRadius:"50%",background:"var(--primary-light)",color:"var(--tabby-green,var(--accent-text))",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:isGold?16:13,margin:"0 auto 10px",border:"2px solid var(--bd2)"}}>{initialsFromEmail(qa.email)}</div>
                <div style={{fontWeight:700,fontSize:isGold?16:14,letterSpacing:"-.3px"}}>{nameFromEmail(qa.email)}</div>
                <div style={{fontSize:11,color:"var(--tx3)",marginBottom:10}}>{activeQ}</div>
                <div style={{fontSize:isGold?28:22,fontWeight:800,letterSpacing:"-1px",fontVariantNumeric:"tabular-nums",color:"var(--accent-text)"}}>{qa.totalScore.toFixed(1)}%<span style={{fontSize:12,fontWeight:500,color:"var(--tx3)"}}> / {55*qMonths.length}%</span></div>
              </div>);
            })}
          </div>}

          {isQaQ && <div style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8,marginBottom:12,fontSize:12,color:"var(--tx3)"}}>
            Showing top 3 performers and your position. Full rankings are visible to team leads.
          </div>}

          <div className="card">
            <div className="card-header"><span className="card-title">Quarterly rankings — {activeQ}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{visibleQas.length} specialists</span></div>
            {visibleQas.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {activeQ}.</p></div> :
            <div className="table-wrap"><table><thead><tr>
              <th style={{width:50}}>#</th>
              <th>Specialist</th>
              {qMonths.map(m => <th key={m} style={{textAlign:"center",minWidth:80}}>{m}</th>)}
              <th style={{textAlign:"center",minWidth:80}}>Total<br/><span style={{fontWeight:400,fontSize:10,opacity:.6}}>/{55*qMonths.length}%</span></th>
            </tr></thead><tbody>
              {visibleQas.map((qa, i) => {
                const actualRank = qa._myRank || (allQas.findIndex(q => q.email === qa.email) + 1);
                const isMe = qa.email?.toLowerCase() === myEmailQ;
                const showGap = isQaQ && qa._myRank && qa._myRank > 4;
                return (<React.Fragment key={qa.email}>
                  {showGap && <tr><td colSpan={3 + qMonths.length} style={{textAlign:"center",padding:"6px",color:"var(--tx3)",fontSize:12,background:"var(--bg)"}}>···</td></tr>}
                  <tr style={{background:isMe?"var(--accent-light)":"transparent"}}>
                    <td>{actualRank <= 3 ? <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:"50%",fontWeight:600,fontSize:12,background:actualRank===1?"#FEF3C7":actualRank===2?"#F3F4F6":"#FED7AA",color:actualRank===1?"#92400E":actualRank===2?"#374151":"#9A3412"}}>{actualRank}</span> : <span style={{color:"var(--tx3)",fontWeight:500}}>{actualRank}</span>}</td>
                    <td><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600}}>{initialsFromEmail(qa.email)}</div><div><div style={{fontWeight:500,fontSize:14}}>{nameFromEmail(qa.email)}{isMe?" (You)":""}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{qa.email}</div></div></div></td>
                    {qMonths.map(m => {
                      const row = data.find(r => r.month === m && r.qa_email?.toLowerCase() === qa.email?.toLowerCase());
                      const monthScore = row ? getTotalScore(row) : null;
                      return <td key={m} style={{textAlign:"center",padding:"8px 6px"}}>
                        <div style={{fontSize:13,fontWeight:600,color:monthScore===null?"var(--tx3)":monthScore>=55*0.7?"var(--green)":monthScore>=55*0.4?"var(--amber)":"var(--red)"}}>{monthScore !== null ? monthScore.toFixed(1)+"%" : "—"}</div>
                      </td>;
                    })}
                    <td style={{textAlign:"center"}}><span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:700,background:"var(--accent-light)",color:"var(--accent-text)"}}>{qa.totalScore.toFixed(1)}%</span></td>
                  </tr>
                </React.Fragment>);
              })}
            </tbody></table></div>}
          </div>

        </div>;
      })()}

      </>}
      {el}
    </div>
  );
}

export default LeaderboardPage;
