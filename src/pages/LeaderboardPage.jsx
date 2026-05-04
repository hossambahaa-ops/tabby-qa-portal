import React, { useState, useEffect, useRef } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listMtd } from "../api/mtd.js";
import { parseRaw, KPI_SLABS, calcSlab, getKpiScores, getTotalScore, fmtRaw } from "../lib/leaderboardScore.js";
import { Icon, icons } from "../components/Icons.jsx";
import { ProgressRing } from "../components/Charts.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";
import LeaderboardCompareTable from "../components/leaderboard/LeaderboardCompareTable.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Badges from "../components/Badges.jsx";
import TitleBelt, { BeltHoverCard } from "../components/TitleBelt.jsx";
import Tooltip from "../components/Tooltip.jsx";
import { computeTitleHolders, holdersByEmail, TITLE_CATALOG, TITLE_KEYS, getLastCompletedMonth, getCurrentCalendarMonth, formatMonthLabel, monthBefore } from "../lib/titles.js";

function LeaderboardPage() {
  const{token,profile,gf,globalToast}=useApp();
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useUrlState("month", "");
  const [selTeam, setSelTeam] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [view, setView] = useUrlState("view", "individual");
  const [expandedRow, setExpandedRow] = useState(null);
  const [search, setSearch] = useState("");
  const [selQuarter, setSelQuarter] = useState("");
  const [selYear, setSelYear] = useState("");
  // For QAs viewing their own "My Performance" card: clicking a month bar
  // in Score history switches the KPIs above to that month, without
  // touching the page-level selMonth filter. null = current selMonth.
  const [histMonth, setHistMonth] = useState(null);
  // When the page-level month dropdown changes, drop any time-travel
  // selection so the card always returns to "current = page-level month".
  useEffect(() => { setHistMonth(null); }, [selMonth]);
  const [selQaQuarterly, setSelQaQuarterly] = useState("");
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [focusOnly, setFocusOnly] = useState(false);
  // Pinned QAs — float to top of any list, persisted per browser
  const [pinnedEmails, setPinnedEmails] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("lb_pinned_qas") || "[]")); } catch { return new Set(); }
  });
  const togglePin = (email) => setPinnedEmails(prev => {
    const e = email?.toLowerCase(); if (!e) return prev;
    const next = new Set(prev);
    next.has(e) ? next.delete(e) : next.add(e);
    try { localStorage.setItem("lb_pinned_qas", JSON.stringify([...next])); } catch {}
    return next;
  });
  // "Refreshed Xm ago" — set whenever data finishes loading
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  // Tick every minute so the relative timestamp advances live
  const [, setNowTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setNowTick(t => t + 1), 60000); return () => clearInterval(id); }, []);
  const fmtAge = (ts) => {
    if (!ts) return null;
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

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
          listMtd({ token, filters: "order=month.desc,final_performance.desc" }),
          listRoster({ token, select: "email,queue,manager_email" }),
          listProfiles({ token, select: "id,email,role", cacheKey: "profiles_slim" }),
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
        globalToast("error", "Failed to load leaderboard data");
      }
      setLastLoadedAt(Date.now());
      setLoading(false);
    })();
  }, [token]);

  // Prefetch all earned badges in ONE query so the per-row <Badges>
  // components can render off props (no N+1 fetches per QA).
  const [allBadges, setAllBadges] = useState([]);
  useEffect(() => {
    if (!token) return;
    sb.query("qa_badges_v", { select: "qa_email,badge_key,tier,month", filters: "order=month.desc", token })
      .then(rows => setAllBadges(Array.isArray(rows) ? rows : []))
      .catch(() => setAllBadges([]));
  }, [token]);
  // Group by lowercased email for O(1) lookup
  const badgesByEmail = React.useMemo(() => {
    const m = {};
    for (const b of allBadges) {
      const e = b.qa_email?.toLowerCase();
      if (!e) continue;
      (m[e] = m[e] || []).push(b);
    }
    return m;
  }, [allBadges]);

  // Belt titles (preview — Super Admin only). Belts only change hands at
  // the end of a month, so we always compute against the previous fully-
  // completed month — NOT the user's selected leaderboard month and NOT
  // the in-flight current month. April's champion keeps the belt all
  // through May; May's data only awards belts on June 1st.
  const isSuperAdmin = profile?.role === "super_admin";
  const beltMonth = React.useMemo(() => {
    const candidate = getLastCompletedMonth(); // "Apr-2026"
    if (months.includes(candidate)) return candidate;
    // Fallback: most recent month with data that is STRICTLY older than the
    // current calendar month — never the in-flight current month, even if
    // the previous month's data hasn't synced yet. `months` arrives already
    // sorted descending, so the first match is the latest closed month.
    const currentCal = getCurrentCalendarMonth();
    return months.find(m => monthBefore(m, currentCal)) || "";
  }, [months]);
  const titleHolders = React.useMemo(() => {
    if (!isSuperAdmin || !beltMonth) return null;
    return computeTitleHolders(data, beltMonth);
  }, [isSuperAdmin, data, beltMonth]);
  const beltsByEmail = React.useMemo(() => holdersByEmail(titleHolders), [titleHolders]);


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
          <div className="page-title" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            Leaderboard
            {lastLoadedAt && <span className="pill pill-tone-green" style={{fontSize:11,fontWeight:500,padding:"3px 9px"}} title={new Date(lastLoadedAt).toLocaleString()}>
              <span className="pill-dot"/> Refreshed {fmtAge(lastLoadedAt)}
            </span>}
          </div>
          <div className="page-subtitle">Performance rankings — {selMonth || "All months"}{pinnedEmails.size>0?` · ${pinnedEmails.size} pinned`:""}</div>
        </div>
        {hasRole(profile?.role,"qa_lead")&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <SearchableSelect options={months} value={selMonth} onChange={v=>{setSelMonth(v);setSelDomain("");setSelTeam("");}} placeholder="Select month"/>
          <SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={selDomain} onChange={v=>{setSelDomain(v);setSelTeam("");}} placeholder="All domains"/>
        </div>}
      </div>

      {loading ? <SkeletonPage/> : <>

      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
        <div className="tabs">
          <button className={`tab ${view==="individual"?"active":""}`} onClick={()=>setView("individual")}>Individual</button>
          {hasRole(profile?.role,"qa_supervisor")&&<button className={`tab ${view==="team"?"active":""}`} onClick={()=>setView("team")}>By team lead</button>}
          <button className={`tab ${view==="quarterly"?"active":""}`} onClick={()=>setView("quarterly")}>Quarterly</button>
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

      {/* Belts of the month — Super Admin preview only. Showcases the
          five championship titles for the selected month. Each belt
          can only be held by one QA at a time. Once validated this
          panel will be visible to everyone (gate lives on isSuperAdmin). */}
      {isSuperAdmin && titleHolders && view==="individual" && (
        <div className="card" style={{marginBottom:20,padding:16,borderLeft:"4px solid #F59E0B",background:"linear-gradient(135deg,var(--bg2) 0%,var(--bg3) 100%)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <span style={{fontSize:16,fontWeight:800,letterSpacing:"-.3px"}}>🏆 Reigning belts</span>
            <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",background:"#F59E0B",color:"#fff",borderRadius:10,letterSpacing:".5px"}}>SUPER ADMIN PREVIEW</span>
          </div>
          <div style={{fontSize:12,color:"var(--tx2)",marginBottom:14,lineHeight:1.5}}>
            Champions of <strong style={{color:"var(--tx)"}}>{formatMonthLabel(beltMonth)}</strong>. At the end of <strong style={{color:"var(--tx)"}}>{formatMonthLabel(getCurrentCalendarMonth())}</strong> the belts are recalculated — a new champion is crowned, or the current one defends the title.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
            {TITLE_KEYS.map(k=>{
              const cat = TITLE_CATALOG[k];
              const h = titleHolders[k];
              return (
                <Tooltip key={k} content={<BeltHoverCard cat={cat} holder={h} preview/>} maxWidth={300} padding="10px 12px" wrapperStyle={{display:"flex",width:"100%"}}>
                  <div style={{padding:"10px 12px",background:"var(--bg)",borderRadius:8,border:`1px solid ${cat.color}55`,display:"flex",alignItems:"center",gap:10,cursor:"help",width:"100%"}}>
                    <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${cat.color}33,${cat.color}11)`,border:`1.5px solid ${cat.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,boxShadow:`0 0 0 2px ${cat.color}1f`}}>{cat.emoji}</div>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontSize:11,fontWeight:800,color:cat.color,textTransform:"uppercase",letterSpacing:".4px"}}>{cat.label}</div>
                      {h ? (
                        <>
                          <div style={{fontSize:13,fontWeight:700,color:"var(--tx)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nameFromEmail(h.qa_email)}</div>
                          <div style={{fontSize:11,color:"var(--tx3)"}}>{cat.metricLabel}: {h.display}</div>
                        </>
                      ) : (
                        <div style={{fontSize:12,color:"var(--tx3)",fontStyle:"italic"}}>Unclaimed this month</div>
                      )}
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
          <div style={{marginTop:10,fontSize:11,color:"var(--tx3)",fontStyle:"italic"}}>
            Hover any belt for the criteria. Belts only change hands when a month closes — the current holder keeps the title until then.
          </div>
        </div>
      )}

      {view==="individual" && (()=>{
        const myEmailInd = profile?.email?.toLowerCase();
        const isQaInd = profile?.role === "qa" || profile?.role === "senior_qa";
        const isLeadInd = hasRole(profile?.role, "qa_lead") && !hasRole(profile?.role, "qa_supervisor");
        
        // For QA leads: filter to their team only (cross-domain)
        const myLocalInd = myEmailInd?.split("@")[0]||"";
        const myAltInd = myEmailInd?(myEmailInd.endsWith("@tabby.ai")?myLocalInd+"@tabby.sa":myLocalInd+"@tabby.ai"):"";
        const myTeamEmailsInd = roster.filter(r => {const m=r.manager_email?.toLowerCase();return m&&(m===myEmailInd||m===myAltInd||m===myLocalInd);}).map(r => r.email?.toLowerCase());
        
        let visibleRanked = ranked;
        if (profile?.role === "senior_qa") {
          // Senior QA: only their own row
          const myRankIdx = ranked.findIndex(r => r.qa_email?.toLowerCase() === myEmailInd);
          const myEntry = myRankIdx >= 0 ? ranked[myRankIdx] : null;
          visibleRanked = myEntry ? [{ ...myEntry, _myRank: myRankIdx + 1 }] : [];
        } else if (profile?.role === "qa") {
          // QA: top 3 + their own rank
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
        // Focus mode: only show selected QAs
        if (focusOnly && selectedEmails.size > 0) {
          visibleRanked = visibleRanked.filter(r => selectedEmails.has(r.qa_email?.toLowerCase()));
        }
        // Float pinned QAs to the top while preserving their relative
        // score order. The rank number shown in column # still reflects
        // the QA's actual leaderboard position, not their visual slot.
        if (pinnedEmails.size > 0) {
          visibleRanked = [...visibleRanked].sort((a, b) => {
            const aP = pinnedEmails.has(a.qa_email?.toLowerCase()) ? 1 : 0;
            const bP = pinnedEmails.has(b.qa_email?.toLowerCase()) ? 1 : 0;
            return bP - aP; // pinned first, otherwise stable
          });
        }

        return <>
        {isQaInd && <div style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8,marginBottom:12,fontSize:12,color:"var(--tx3)"}}>
          {profile?.role === "senior_qa"
            ? "Showing your position only. Full rankings are visible to team leads."
            : "Showing top 3 performers and your position. Full rankings are visible to team leads."}
        </div>}

        {/* ── QA Self-Service: My Performance Panel ── */}
        {isQaInd && (()=>{
          // Which month is the card actually displaying? `histMonth` lets
          // the user click a Score-history bar to time-travel within this
          // card without touching the page-level selMonth filter.
          const viewMonth = histMonth || selMonth;
          const isHistView = !!histMonth && histMonth !== selMonth;
          // Row + rank for the chosen month
          const monthRows = data.filter(r => r.month === viewMonth);
          const monthRanked = [...monthRows].sort((a, b) => getTotalScore(b) - getTotalScore(a));
          const myRankIdx = monthRanked.findIndex(r => r.qa_email?.toLowerCase() === myEmailInd);
          const myRow = myRankIdx >= 0 ? monthRanked[myRankIdx] : null;
          if (!myRow) return null;
          const myKpis = getKpiScores(myRow);
          const myTotal = myKpis.reduce((s,k) => s + k.score, 0);
          // Historical scores across months (always built from data, not
          // tied to the chosen view month — so the bars stay stable while
          // you hop around).
          const history = months.slice(0,6).reverse().map(m => {
            const row = data.find(r => r.month === m && r.qa_email?.toLowerCase() === myEmailInd);
            if (!row) return { month: m, score: null };
            const ks = getKpiScores(row);
            return { month: m, score: ks.reduce((s,k) => s + k.score, 0) };
          }).filter(h => h.score !== null);

          return <div className="card" style={{marginBottom:24,borderLeft:"4px solid var(--tabby-purple,#6A2C79)"}}>
            <div className="card-header">
              <span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>📊</span> My Performance — {viewMonth}
                {isHistView && <button
                  onClick={()=>setHistMonth(null)}
                  title="Back to current month"
                  style={{fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:8,border:"1px solid var(--bd)",background:"var(--bg)",color:"var(--tx2)",cursor:"pointer",fontFamily:"var(--font)"}}
                >← {selMonth}</button>}
              </span>
              <span style={{fontSize:22,fontWeight:800,letterSpacing:"-1px",color:scoreColor(myTotal)}}>
                {myTotal.toFixed(1)} <span style={{fontSize:13,fontWeight:400,color:"var(--tx3)"}}>/ {maxScore}</span>
                <span style={{fontSize:12,fontWeight:600,color:"var(--tx3)",marginLeft:8}}>Rank #{myRankIdx+1} of {monthRanked.length}</span>
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

            {/* Historical Trend — click any bar to view that month's KPIs */}
            {history.length >= 2 && <div>
              <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Score history <span style={{textTransform:"none",fontWeight:500,color:"var(--tx3)",letterSpacing:0,fontSize:10,marginLeft:4}}>· click a bar to view that month</span></div>
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:60}}>
                {history.map((h,i) => {
                  const pct = h.score / maxScore * 100;
                  const isActive = h.month === viewMonth;
                  const barColor = isActive ? scoreColor(h.score) : "var(--bd)";
                  return <button
                    key={h.month}
                    onClick={()=>setHistMonth(h.month === selMonth ? null : h.month)}
                    title={`View ${h.month}`}
                    style={{
                      display:"flex",flexDirection:"column",alignItems:"center",flex:1,gap:4,
                      cursor:"pointer",background:"transparent",border:"none",padding:"0 2px",
                      fontFamily:"var(--font)",borderRadius:6,transition:"background .15s",
                    }}
                    onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background="var(--bg)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}
                  >
                    <span style={{fontSize:10,fontWeight:isActive?700:400,color:isActive?scoreColor(h.score):"var(--tx3)"}}>{h.score.toFixed(1)}</span>
                    <div style={{width:"100%",height:`${Math.max(pct*0.5,4)}px`,borderRadius:4,background:barColor,transition:"height .3s, background .2s",boxShadow:isActive?`0 0 0 2px ${scoreColor(h.score)}33`:"none"}}/>
                    <span style={{fontSize:9,color:isActive?"var(--tx2)":"var(--tx3)",fontWeight:isActive?700:400}}>{h.month.split("-")[0]}</span>
                  </button>;
                })}
              </div>
            </div>}
          </div>;
        })()}

        {/* Podium top 3 — hidden for senior_qa (they see only their own row) */}
        {ranked.length >= 3 && profile?.role !== "senior_qa" && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:20,marginBottom:32,flexWrap:"wrap"}}>
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
              {hasRole(profile?.role,"qa_lead")&&<button className="btn btn-outline btn-sm" onClick={()=>{
                const kpiHeaders=Object.values(KPI_SLABS).map(k=>k.label);
                const header=["Rank","Specialist","Email","TL",...kpiHeaders,"Total"].join("\t");
                const rows=ranked.map((r,i)=>{
                  const kpis=getKpiScores(r);
                  return [i+1,nameFromEmail(r.qa_email),r.qa_email,r.qa_tl?nameFromEmail(r.qa_tl):"",...kpis.map(k=>k.score.toFixed(1)),getTotalScore(r).toFixed(1)].join("\t");
                });
                navigator.clipboard.writeText([header,...rows].join("\n")).then(()=>globalToast("success","Copied to clipboard — paste into Google Sheets"));
              }} style={{fontSize:11}}>
                <Icon d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" size={13}/>Copy for Sheets
              </button>}
            </div>
          </div>
          <LeaderboardCompareTable
            selectedEmails={compareMode ? selectedEmails : new Set()}
            ranked={ranked}
            maxScore={maxScore}
          />
          {visibleRanked.length === 0 ? <div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No data for {selMonth}.</p></div> :
          <>
          {/* Bulk action toolbar */}
          {selectedEmails.size > 0 && <div style={{padding:"10px 16px",marginBottom:8,background:"var(--accent-light)",borderRadius:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:600,color:"var(--accent-text)"}}>{selectedEmails.size} selected</span>
            <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={()=>{
              const emails=[...selectedEmails];
              window.dispatchEvent(new CustomEvent("navigate",{detail:"quality"}));
              setTimeout(()=>{
                window.dispatchEvent(new CustomEvent("qc-tab",{detail:"coaching"}));
                setTimeout(()=>{
                  window.dispatchEvent(new CustomEvent("prefill-coaching",{detail:{emails}}));
                },300);
              },200);
            }}>Send Coaching</button>
            <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>{
              const csv=["Name,Email,TL,Total Score"];
              [...selectedEmails].forEach(em=>{
                const row=ranked.find(r=>r.qa_email?.toLowerCase()===em);
                if(row)csv.push(`"${nameFromEmail(row.qa_email)}",${row.qa_email},"${row.qa_tl?nameFromEmail(row.qa_tl):""}",${getTotalScore(row).toFixed(1)}`);
              });
              const blob=new Blob([csv.join("\n")],{type:"text/csv"});
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");a.href=url;a.download=`selection-${selMonth||"latest"}.csv`;a.click();
              URL.revokeObjectURL(url);
            }}>Export CSV</button>
            <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setCompareMode(m=>!m)}>{compareMode?"✓ Comparing":"Compare"}</button>
            <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setFocusOnly(f=>!f)}>{focusOnly?"✓ Focused":"Focus on these"}</button>
            <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setSelectedEmails(new Set())}>Clear</button>
          </div>}
          <div className="table-wrap"><table><thead><tr>
            <th style={{width:32}}><input type="checkbox" style={{cursor:"pointer",accentColor:"var(--tabby-purple)"}} checked={visibleRanked.length>0&&visibleRanked.every(r=>selectedEmails.has(r.qa_email?.toLowerCase()))} onChange={()=>{const allSel=visibleRanked.every(r=>selectedEmails.has(r.qa_email?.toLowerCase()));setSelectedEmails(prev=>{const n=new Set(prev);visibleRanked.forEach(r=>{const e=r.qa_email?.toLowerCase();if(e){allSel?n.delete(e):n.add(e);}});return n;});}}/></th>
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
                <tr onClick={() => setExpandedRow(isExp ? null : r.id)} style={{cursor:"pointer",background:selectedEmails.has(r.qa_email?.toLowerCase())?"var(--accent-light)":isMe?"var(--accent-light)":"transparent"}}>
                  <td onClick={e=>e.stopPropagation()}><input type="checkbox" style={{cursor:"pointer",accentColor:"var(--tabby-purple)"}} checked={selectedEmails.has(r.qa_email?.toLowerCase())} onChange={()=>{const em=r.qa_email?.toLowerCase();setSelectedEmails(prev=>{const n=new Set(prev);n.has(em)?n.delete(em):n.add(em);return n;});}}/></td>
                  <td>{rank <= 3 ? <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:28,height:28,borderRadius:"50%",fontWeight:700,fontSize:12,background:rank===1?"linear-gradient(135deg,#FEF3C7,#FDE68A)":rank===2?"linear-gradient(135deg,#F3F4F6,#E5E7EB)":"linear-gradient(135deg,#FED7AA,#FDBA74)",color:rank===1?"#92400E":rank===2?"#374151":"#9A3412",boxShadow:rank===1?"0 2px 8px rgba(245,158,11,.3)":"none"}}>{rank}</span> : <span style={{color:"var(--tx3)",fontWeight:600,fontSize:13}}>{rank}</span>}</td>
                  <td><div style={{display:"flex",alignItems:"center",gap:10}}>
                    {/* Pin/star — visible always for leads+, click toggles. Pinned QAs float to the top of the list. */}
                    {hasRole(profile?.role,"qa_lead") && (()=>{const isPinned = pinnedEmails.has(r.qa_email?.toLowerCase()); return (
                      <button onClick={(e)=>{e.stopPropagation();togglePin(r.qa_email);}} title={isPinned?"Unpin from top":"Pin to top of list"} aria-label={isPinned?"Unpin":"Pin"} style={{background:"none",border:"none",padding:2,cursor:"pointer",lineHeight:0,opacity:isPinned?1:.35,transition:"opacity .15s, transform .15s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=isPinned?1:.35}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isPinned?"#F59E0B":"none"} stroke={isPinned?"#F59E0B":"var(--tx3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      </button>
                    );})()}
                    <div style={{width:34,height:34,borderRadius:"50%",flexShrink:0,background:"var(--primary-light)",color:"var(--tabby-purple-light,var(--accent-text))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,border:"2px solid var(--bd2)"}}>{initialsFromEmail(r.qa_email)}</div>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{fontWeight:600,fontSize:13.5,letterSpacing:"-.2px"}}>{nameFromEmail(r.qa_email)}</span>
                        {/* Belt titles — Super Admin preview only. Champion-tier
                            indicators rendered before badges so they pop first. */}
                        {isSuperAdmin && beltsByEmail[r.qa_email?.toLowerCase()]?.length > 0 && (
                          <TitleBelt holders={beltsByEmail[r.qa_email?.toLowerCase()]} compact preview/>
                        )}
                        {/* Top 3 medals only — keeps the row compact */}
                        <Badges qaEmail={r.qa_email} compact max={3} prefetched={badgesByEmail[r.qa_email?.toLowerCase()] || []}/>
                      </div>
                      <div style={{fontSize:11,color:"var(--tx3)"}}>{r.qa_email}</div>
                    </div>
                  </div></td>
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
          </tbody></table></div>
          </>}
        </div>
      </>;
      })()}

      {view==="team" && <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {teamData.length === 0 ? <EmptyState
          icon="M9 17v-2a4 4 0 014-4h4M3 10v6a2 2 0 002 2h4M9 7h6a2 2 0 012 2v6"
          title={`No team data for ${selMonth || "this month"}`}
          description={selDomain || selTeam ? "Try clearing the domain or team filter — the current selection may be empty." : "Performance data hasn't synced yet for this month, or no QAs are mapped to a team yet."}
        /> :
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
        const isQaQ = profile?.role === "qa" || profile?.role === "senior_qa";
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
          // Both qa and senior_qa see ONLY their own row in the quarterly
          // view — matches the requirement "just their own numbers". The
          // rank value still reflects their real position across the
          // whole roster, just without revealing other people's names.
          const myEntry = allQas.find(qa => qa.email?.toLowerCase() === myEmailQ);
          const myRankIdx = allQas.findIndex(qa => qa.email?.toLowerCase() === myEmailQ);
          visibleQas = myEntry ? [{ ...myEntry, _myRank: myRankIdx + 1 }] : [];
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
            {/* Search/pick is only useful for leads & up — QAs see only themselves. */}
            {!isQaQ && <div style={{position:"relative",minWidth:220,flex:1,maxWidth:320}}>
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
            </div>}
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
            {!isQaQ && allQas[0] && <div className="stat-card">
              <div className="stat-label">Top performer</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:4}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",color:"#92400E",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12}}>1</div>
                <div style={{fontWeight:700,fontSize:15,letterSpacing:"-.3px"}}>{nameFromEmail(allQas[0].email)}</div>
              </div>
            </div>}
          </div>

          {allQas.length >= 3 && !isQaQ && <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:20,marginBottom:32,flexWrap:"wrap"}}>
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
            Showing your position only. Full rankings are visible to team leads.
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
    </div>
  );
}

export default LeaderboardPage;
