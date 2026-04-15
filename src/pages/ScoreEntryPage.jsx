import React, { useState, useEffect, useRef } from "react";
import { hasRole, sortMonthsDesc } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, logActivity } from "../lib/utils.js";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";

function ScoreEntryPage(){
  const{token,profile,gf,globalToast}=useApp();
  const [data, setData] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [selMonth, setSelMonth] = useState("");
  const [selQA, setSelQA] = useState([]);
  const [selTL, setSelTL] = useState("");
  const [selDomain, setSelDomain] = useState("");
  const [selTeam, setSelTeam] = useState("");
  const [mtdView, setMtdView] = useState("qa"); // qa | lead
  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadStep, setUploadStep] = useState("config"); // config | preview | done
  const [uploadMonth, setUploadMonth] = useState("");
  const [uploadCols, setUploadCols] = useState([]);
  const [uploadOverwrite, setUploadOverwrite] = useState(false);
  const [uploadPreview, setUploadPreview] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [bulkTaskModal, setBulkTaskModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({title:"",description:"",priority:"medium",due_date:""});
  const [bulkSending, setBulkSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadLogs, setUploadLogs] = useState([]);
  const isUploadAllowed = hasRole(profile?.role,"admin");

  useEffect(() => {
    (async () => {
      try {
        const [rows, rosterRows, profRows] = await Promise.all([
          dataCache.fetch("mtd_scores",()=>sb.query("mtd_scores", {select:"*",filters:"order=month.desc,qa_email.asc",token})),
          dataCache.fetch("qa_roster",()=>sb.query("qa_roster", {select:"email,queue,manager_email",token}).catch(()=>[])),
          dataCache.fetch("profiles_slim",()=>sb.query("profiles", {select:"id,email,role",filters:"status=eq.active",token}).catch(()=>[])),
        ]);
        setRoster(rosterRows);
        // Build blacklist: exclude both domain variants of non-QA users
        const nonQaProfiles = profRows.filter(p => p.role !== "qa");
        const blacklist = new Set();
        // Only qa_lead role counts as valid manager (not supervisors/admins)
        const qaLeadSet = new Set();
        profRows.filter(p => p.role === "qa_lead").forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          qaLeadSet.add(email);
          const local = email.split("@")[0];
          if (email.endsWith("@tabby.ai")) qaLeadSet.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) qaLeadSet.add(local + "@tabby.ai");
          qaLeadSet.add(local);
        });
        nonQaProfiles.forEach(p => {
          const email = p.email?.toLowerCase();
          if (!email) return;
          blacklist.add(email);
          const local = email.split("@")[0];
          if (email.endsWith("@tabby.ai")) blacklist.add(local + "@tabby.sa");
          if (email.endsWith("@tabby.sa")) blacklist.add(local + "@tabby.ai");
        });
        // Filter MTD: exclude non-QA profiles AND entries NOT managed by a QA lead
        const rosterMgrValid = new Set(rosterRows.filter(r => {
          const mgr = r.manager_email?.toLowerCase();
          if (!mgr) return false;
          return qaLeadSet.has(mgr) || qaLeadSet.has(mgr.split("@")[0]);
        }).map(r => r.email?.toLowerCase()));
        const filtered = rows.filter(r => {
          const em = r.qa_email?.toLowerCase();
          if (blacklist.has(em)) return false;
          // Check qa_tl: must be a known QA lead
          const tl = r.qa_tl?.toLowerCase();
          if (tl && !qaLeadSet.has(tl) && !qaLeadSet.has(tl.split("@")[0])) return false;
          // If email is in roster, check if their manager is a QA lead
          if (rosterRows.some(x => x.email?.toLowerCase() === em)) {
            return rosterMgrValid.has(em);
          }
          return true;
        });
        setData(filtered);
        const uniqueMonths = sortMonthsDesc([...new Set(filtered.map(r => r.month))]);
        setMonths(uniqueMonths);
        if (uniqueMonths.length > 0) setSelMonth(uniqueMonths[0]);
        // Auto-scope supervisors to their domain
        if (hasRole(profile?.role,"qa_supervisor") && !hasRole(profile?.role,"admin") && !selDomain) {
          const svDomain = profile?.operational_domain || profile?.domain || "";
          if (svDomain) setSelDomain(svDomain);
        }
        // Sync from global filters
        if (gf?.domain) setSelDomain(gf.domain);
        if (gf?.month && uniqueMonths.includes(gf.month)) setSelMonth(gf.month);
        if (gf?.teams?.length > 0) setSelTeam(gf.teams[0]);
      } catch (e) { console.error("MTD Scores:", e); }
      setLoading(false);
    })();
  }, [token, gf?.domain, gf?.month, gf?.teams]);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => {
      const clean = p.replace(/[\d]+$/, "");
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  // Format percentage values — handles "94.46%", 0.9446, 1.345, "1", etc.
  const fmtPct = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    const s = String(val).trim();
    if (s.includes("%")) return s; // already formatted
    const n = parseFloat(s.replace(",", "."));
    if (isNaN(n)) return s;
    // If it looks like a 0-1 decimal, multiply by 100
    // If > 1 and < 2, it's likely a raw decimal like 1.345 meaning 134.5%
    // If > 2, it's already a percentage value like 94.46
    if (n >= 0 && n <= 2) return (n * 100).toFixed(1) + "%";
    return n.toFixed(1) + "%";
  };

  // === UPLOAD DATA LOGIC ===
  const SYSTEM_COLS = ["id","synced_at","manual_fields","qa_email","month","qa_tl"];
  const allMtdCols = data.length > 0 ? Object.keys(data[0]).filter(k => !SYSTEM_COLS.includes(k)).sort() : 
    ["sbs","non_sbs","dsat","late_count","never_count","valid_count","invalid_count","side_tasks_duration_mins",
     "coaching_sessions","total_coachings_by_coaching_created_date","total_coachings_by_eval_created_date",
     "total_ontime_coachings","coaching_eligibility_count","not_coached","rtr_count","avg_rtr_score",
     "observed_coaching_count","avg_observation_score_pct","calibration_count","avg_calibration_match_rate",
     "coaching_completion_pct","ontime_coaching_pct","jkq_score","jkq_result","jkq_episode",
     "working_days","ramadan_wds","occupancy_pct","coaching_ontime_score","ticket_per_day",
     "occupancy_score","calibration_score","coaching_observation_score","rtr_score","final_performance"];

  const COL_LABELS = {sbs:"SBS",non_sbs:"Non-SBS",dsat:"DSAT",late_count:"Late count",never_count:"Never count",
    valid_count:"Valid count",invalid_count:"Invalid count",side_tasks_duration_mins:"Side tasks (mins)",
    coaching_sessions:"Coaching sessions",total_coachings_by_coaching_created_date:"Total coachings (by coaching date)",
    total_coachings_by_eval_created_date:"Total coachings (by eval date)",total_ontime_coachings:"On-time coachings",
    coaching_eligibility_count:"Coaching eligibility",not_coached:"Not coached",rtr_count:"RTR count",
    avg_rtr_score:"RTR score",observed_coaching_count:"Observed coaching count",
    avg_observation_score_pct:"Coaching observation %",calibration_count:"Calibration count",
    avg_calibration_match_rate:"Calibration match rate",coaching_completion_pct:"Coaching completion %",
    ontime_coaching_pct:"On-time coaching %",jkq_score:"JKQ score",jkq_result:"JKQ result",jkq_episode:"JKQ episode",
    working_days:"Working days",ramadan_wds:"Ramadan WDs",occupancy_pct:"Occupancy %",
    coaching_ontime_score:"Coaching on-time score",ticket_per_day:"Tickets/day",occupancy_score:"Occupancy score",
    calibration_score:"Calibration score",coaching_observation_score:"CO score",rtr_score:"RTR score (calc)",
    final_performance:"Final performance"};

  const downloadTemplate = () => {
    if (!uploadMonth || uploadCols.length === 0) return;
    const allEmails = [...new Set(roster.map(r => r.email?.toLowerCase()).filter(Boolean))].sort();
    const header = ["qa_email", ...uploadCols].join(",");
    const rows = allEmails.map(email => [email, ...uploadCols.map(() => "")].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mtd_upload_${uploadMonth}_${uploadCols.join("-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(",");
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i]?.trim() || ""; });
      return obj;
    }).filter(r => r.qa_email);
  };

  const handleFileUpload = (file) => {
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      const preview = parsed.map(row => {
        const existing = data.find(d => d.qa_email?.toLowerCase() === row.qa_email?.toLowerCase() && d.month === uploadMonth);
        const changes = {};
        let hasChanges = false;
        uploadCols.forEach(col => {
          const newVal = row[col];
          if (newVal === "" || newVal === undefined) return;
          const oldVal = existing ? existing[col] : null;
          const willUpdate = uploadOverwrite || oldVal === null || oldVal === "" || oldVal === 0 || oldVal === "0";
          if (willUpdate) { changes[col] = { old: oldVal, new: newVal }; hasChanges = true; }
        });
        return { qa_email: row.qa_email, name: nameFromEmail(row.qa_email), existing: !!existing, changes, hasChanges, raw: row };
      }).filter(r => r.hasChanges);
      setUploadPreview(preview);
      setUploadStep("preview");
    };
    reader.readAsText(file);
  };

  const executeUpload = async () => {
    setUploading(true);
    let rowsAffected = 0, rowsCreated = 0, errors = [];
    try {
      for (const row of uploadPreview) {
        try {
          const body = {};
          const manualFields = {};
          Object.entries(row.changes).forEach(([col, { new: val }]) => {
            body[col] = val; manualFields[col] = true;
          });
          const existing = data.find(d => d.qa_email?.toLowerCase() === row.qa_email?.toLowerCase() && d.month === uploadMonth);
          if (existing) {
            const existingManual = existing.manual_fields || {};
            body.manual_fields = JSON.stringify({ ...existingManual, ...manualFields });
            await sb.query("mtd_scores", { token, method: "PATCH", body, filters: `id=eq.${existing.id}` });
            rowsAffected++;
          } else {
            // Use upsert via PostgREST Prefer header to handle duplicates
            const rosterEntry = roster.find(r => r.email?.toLowerCase() === row.qa_email?.toLowerCase());
            body.qa_email = row.qa_email;
            body.month = uploadMonth;
            body.qa_tl = rosterEntry?.manager_email || "";
            body.manual_fields = JSON.stringify(manualFields);
            const resp = await fetch(`${SUPABASE_URL}/rest/v1/mtd_scores`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_ANON,
                "Authorization": `Bearer ${token}`,
                "Prefer": "resolution=merge-duplicates,return=minimal",
              },
              body: JSON.stringify(body),
            });
            if (!resp.ok) {
              const errText = await resp.text();
              throw new Error(errText);
            }
            rowsCreated++;
          }
        } catch (rowErr) {
          errors.push(`${row.qa_email}: ${rowErr.message?.slice(0,80)}`);
        }
      }
      await sb.query("mtd_upload_log", { token, method: "POST", body: {
        uploaded_by: profile?.email, month: uploadMonth, columns_updated: uploadCols,
        rows_affected: rowsAffected, rows_created: rowsCreated,
        overwrite_enabled: uploadOverwrite, filename: uploadFile?.name || "unknown",
      }});
      logActivity(token, profile?.email, "mtd_csv_upload", "mtd_scores", null, 
        `Month: ${uploadMonth}, Columns: ${uploadCols.join(",")}, Updated: ${rowsAffected}, Created: ${rowsCreated}${errors.length>0?`, Errors: ${errors.length}`:""}`);
      if (errors.length > 0 && (rowsAffected + rowsCreated) === 0) {
        setUploadResult({ success: false, error: `All rows failed. First error: ${errors[0]}` });
      } else {
        setUploadResult({ success: true, rowsAffected, rowsCreated, errors: errors.length > 0 ? errors : null });
      }
      setUploadStep("done");
      dataCache.invalidate("mtd_scores");
      const newRows = await sb.query("mtd_scores", {select:"*",filters:"order=month.desc,qa_email.asc",token});
      dataCache.set("mtd_scores", newRows);
      setData(newRows);
    } catch (e) {
      setUploadResult({ success: false, error: e.message });
      setUploadStep("done");
    }
    setUploading(false);
  };

  const loadUploadLogs = async () => {
    try { const logs = await sb.query("mtd_upload_log", {select:"*",filters:"order=created_at.desc&limit=20",token}); setUploadLogs(logs); } catch(e) { console.error(e); }
  };

  const resetUpload = () => {
    setUploadStep("config"); setUploadCols([]); setUploadOverwrite(false);
    setUploadPreview([]); setUploadFile(null); setUploadResult(null); setUploadLogs([]);
    setUploadMonth(selMonth || (months.length > 0 ? months[0] : ""));
  };

  // Format general values
  const fmt = (val) => {
    if (val === null || val === undefined || val === "") return "—";
    if (typeof val === "string" && val.includes("%")) return val;
    if (typeof val === "number" && !Number.isInteger(val)) return val.toFixed(2);
    return String(val);
  };

  const monthData = data.filter(r => r.month === selMonth);
  const qaEmails = [...new Set(monthData.map(r => r.qa_email))].sort();
  const tlEmails = [...new Set(monthData.map(r => r.qa_tl).filter(Boolean))].sort();
  const rosterMap = {};
  roster.forEach(r => { rosterMap[r.email?.toLowerCase()] = r; });
  const scoreTeams = [...new Set(roster.filter(r => r.queue && (!selDomain || r.email?.endsWith("@"+selDomain))).map(r => r.queue))].sort();
  let filtered = monthData;
  if (selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+selDomain));
  if (selTeam) filtered = filtered.filter(r => rosterMap[r.qa_email?.toLowerCase()]?.queue === selTeam);
  if (selTL) filtered = filtered.filter(r => r.qa_tl === selTL);
  if (selQA.length > 0) filtered = filtered.filter(r => selQA.includes(r.qa_email));
  // Apply global filters
  if (gf?.people?.length > 0) filtered = filtered.filter(r => gf.people.includes(r.qa_email?.toLowerCase()));
  if (gf?.domain && !selDomain) filtered = filtered.filter(r => r.qa_email?.endsWith("@"+gf.domain));
  if (gf?.teams?.length > 0 && !selTeam) filtered = filtered.filter(r => { const q = rosterMap[r.qa_email?.toLowerCase()]?.queue; return q && gf.teams.includes(q); });
  if (gf?.month && !selMonth && gf.month !== selMonth) { /* month already handled by selMonth */ }
  const sorted = [...filtered].sort((a, b) => (b.final_performance || 0) - (a.final_performance || 0));

  const fpColor = (v) => v >= 0.4 ? "var(--green)" : v >= 0.25 ? "var(--amber)" : "var(--red)";
  const fpBg = (v) => v >= 0.4 ? "var(--green-bg)" : v >= 0.25 ? "var(--amber-bg)" : "var(--red-bg)";

  if (loading) return <div className="page"><SkeletonPage/></div>;

  return (<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div>
          <div className="page-title">MTD Scores</div>
          <div className="page-subtitle">MTD performance data — synced from Metabase hourly</div>
        </div>
        {isUploadAllowed&&<button className="btn btn-outline btn-sm" onClick={()=>{resetUpload();setShowUpload(true);loadUploadLogs();}} style={{fontSize:12,marginLeft:8}}>
          <Icon d={icons.upload} size={14}/>Upload data
        </button>}
      </div>
      {sorted.length>0&&<div style={{display:"flex",gap:16,alignItems:"center"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>Specialists</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-1px"}}>{sorted.length}</div>
        </div>
        <div style={{width:1,height:32,background:"var(--bd)"}}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>Avg Score</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-1px"}}>{(sorted.reduce((a,r)=>a+(r.final_performance||0),0)/sorted.length*100).toFixed(1)}%</div>
        </div>
        <div style={{width:1,height:32,background:"var(--bd)"}}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--tx3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>Total DSAT</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-1px",color:"var(--tx)"}}>{sorted.reduce((a,r)=>a+(r.dsat||0),0)}</div>
        </div>
      </div>}
    </div>

    <div className="card" style={{marginBottom:16,position:"relative",zIndex:50,overflow:"visible"}}>
      <div className="controls-row" style={{overflow:"visible"}}>
        <div className="form-group" style={{flex:1,position:"relative",zIndex:5}}>
          <label className="form-label">Month</label>
          <SearchableSelect
            options={months}
            value={selMonth}
            onChange={v=>{setSelMonth(v);setSelQA([]);setSelTL("");setSelDomain("");setSelTeam("");}}
            placeholder="Select month"
          />
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Domain</label>
          <SearchableSelect
            options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]}
            value={selDomain}
            onChange={v=>{setSelDomain(v);setSelQA([]);setSelTL("");setSelTeam("");}}
            placeholder="All domains"
          />
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">Team</label>
          <SearchableSelect
            options={scoreTeams}
            value={selTeam}
            onChange={v=>{setSelTeam(v);setSelQA([]);setSelTL("");}}
            placeholder="All teams"
          />
        </div>
        <div className="form-group" style={{flex:1}}>
          <label className="form-label">QA Lead</label>
          <SearchableSelect
            options={tlEmails.map(e=>({value:e,label:e+` (${nameFromEmail(e)})`}))}
            value={selTL}
            onChange={v=>{setSelTL(v);setSelQA([]);}}
            placeholder={`All leads (${tlEmails.length})`}
          />
        </div>
        <div className="form-group" style={{flex:1}}>
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

    {sorted.length === 0 ? (
      <div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No MTD data for {selMonth}. Check that the Google Sheet sync is running.</p></div></div>
    ) : (
      <div className="card">
        <div className="card-header">
          <span className="card-title">{selMonth} — {sorted.length} specialists</span>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",borderRadius:8,border:"1px solid var(--bd)",overflow:"hidden"}}>
              <button onClick={()=>setMtdView("qa")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:mtdView==="qa"?"var(--tabby-purple)":"transparent",color:mtdView==="qa"?"#fff":"var(--tx3)"}}>By QA</button>
              <button onClick={()=>setMtdView("lead")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:mtdView==="lead"?"var(--tabby-purple)":"transparent",color:mtdView==="lead"?"#fff":"var(--tx3)"}}>By Lead</button>
            </div>
            <span style={{fontSize:12,color:"var(--tx3)"}}>Synced: {sorted[0]?.synced_at ? new Date(sorted[0].synced_at).toLocaleString() : "—"}</span>
            <button className="btn btn-outline btn-sm" onClick={()=>{
              const csv=["Specialist,Email,TL,SBS,Non-SBS,DSAT,Late,Never,Valid,Invalid,Sessions,On-time Coaching,Eligible,Not Coached,RTR,RTR Score,Observations,Obs %,Calibrations,Calib %,Completion %,On-time %,JKQ,JKQ Result,Tickets/day,Occupancy %,Working Days,ST Time (mins),ST Time,Performance %"];
              sorted.forEach(r=>{
                const stMins=r.side_tasks_duration_mins||0;
                const stFormatted=stMins?`${Math.floor(stMins/60)}h ${stMins%60}m`:"";
                csv.push([
                  `"${nameFromEmail(r.qa_email)}"`,r.qa_email,`"${r.qa_tl?nameFromEmail(r.qa_tl):""}"`,
                  r.sbs||0,r.non_sbs||0,r.dsat||0,r.late_count||0,r.never_count||0,r.valid_count||0,r.invalid_count||0,
                  r.coaching_sessions||0,r.total_ontime_coachings||0,r.coaching_eligibility_count||0,r.not_coached||0,
                  r.rtr_count||0,r.avg_rtr_score||0,r.observed_coaching_count||0,r.avg_observation_score_pct||0,
                  r.calibration_count||0,r.avg_calibration_match_rate||0,
                  r.coaching_completion_pct||0,r.ontime_coaching_pct||0,
                  r.jkq_score||"",`"${r.jkq_result||""}"`,r.ticket_per_day||0,r.occupancy_pct||0,
                  r.working_days||0,stMins,`"${stFormatted}"`,((r.final_performance||0)*100).toFixed(1)
                ].join(","));
              });
              const blob=new Blob([csv.join("\n")],{type:"text/csv"});
              const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`performance_${selMonth}.csv`;a.click();
            }} style={{fontSize:11}}>
              <Icon d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" size={13}/>Export CSV
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>{
              const header="Specialist\tEmail\tTL\tSBS\tNon-SBS\tDSAT\tLate\tNever\tValid\tInvalid\tSessions\tOn-time Coaching\tEligible\tNot Coached\tRTR\tRTR Score\tObservations\tObs %\tCalibrations\tCalib %\tCompletion %\tOn-time %\tJKQ\tJKQ Result\tTickets/day\tOccupancy %\tWorking Days\tST Time (mins)\tST Time\tPerformance %";
              const rows=sorted.map(r=>{
                const stMins=r.side_tasks_duration_mins||0;
                const stFormatted=stMins?`${Math.floor(stMins/60)}h ${stMins%60}m`:"";
                return [
                  nameFromEmail(r.qa_email),r.qa_email,r.qa_tl?nameFromEmail(r.qa_tl):"",
                  r.sbs||0,r.non_sbs||0,r.dsat||0,r.late_count||0,r.never_count||0,r.valid_count||0,r.invalid_count||0,
                  r.coaching_sessions||0,r.total_ontime_coachings||0,r.coaching_eligibility_count||0,r.not_coached||0,
                  r.rtr_count||0,r.avg_rtr_score||0,r.observed_coaching_count||0,r.avg_observation_score_pct||0,
                  r.calibration_count||0,r.avg_calibration_match_rate||0,
                  r.coaching_completion_pct||0,r.ontime_coaching_pct||0,
                  r.jkq_score||"",r.jkq_result||"",r.ticket_per_day||0,r.occupancy_pct||0,
                  r.working_days||0,stMins,stFormatted,((r.final_performance||0)*100).toFixed(1)
                ].join("\t");
              });
              navigator.clipboard.writeText([header,...rows].join("\n")).then(()=>globalToast("success","Copied to clipboard — paste into Google Sheets"));
            }} style={{fontSize:11}}>
              <Icon d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" size={13}/>Copy for Sheets
            </button>
          </div>
        </div>
        {mtdView==="qa"&&<div className="table-wrap table-wrap-sticky">
          <table>
            <thead>
              <tr>
                <th style={{width:36,textAlign:"center"}}><input type="checkbox" checked={sorted.length>0&&selectedRows.size===sorted.length} onChange={e=>{if(e.target.checked){setSelectedRows(new Set(sorted.map(r=>r.qa_email)));}else{setSelectedRows(new Set());}}} style={{cursor:"pointer"}}/></th>
                <th style={{minWidth:160}}>Specialist</th>
                <th>TL</th>
                <th style={{textAlign:"right"}}>WDs</th>
                <th style={{textAlign:"right"}}>SBS</th>
                <th style={{textAlign:"right"}}>Non-SBS</th>
                <th style={{textAlign:"right"}}>DSAT</th>
                <th style={{textAlign:"right"}}>Late</th>
                <th style={{textAlign:"right"}}>Never</th>
                <th style={{textAlign:"right"}}>Valid</th>
                <th style={{textAlign:"right"}}>Invalid</th>
                <th style={{textAlign:"right"}}>Sessions</th>
                <th style={{textAlign:"right"}}>On-time</th>
                <th style={{textAlign:"right"}}>Eligible</th>
                <th style={{textAlign:"right"}}>Not coached</th>
                <th style={{textAlign:"right"}}>RTR</th>
                <th style={{textAlign:"right"}}>RTR score</th>
                <th style={{textAlign:"right"}}>Obs.</th>
                <th style={{textAlign:"right"}}>Obs. %</th>
                <th style={{textAlign:"right"}}>Calib.</th>
                <th style={{textAlign:"right"}}>Calib. %</th>
                <th style={{textAlign:"right"}}>Completion</th>
                <th style={{textAlign:"right"}}>On-time %</th>
                <th style={{textAlign:"center"}}>JKQ</th>
                <th style={{textAlign:"right"}}>Tickets/d</th>
                <th style={{textAlign:"right"}}>Occupancy</th>
                <th style={{textAlign:"right"}}>ST Time</th>
                <th style={{textAlign:"right"}}>Performance</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id} style={{background:selectedRows.has(r.qa_email)?"var(--primary-light)":undefined}}>
                  <td style={{textAlign:"center"}}><input type="checkbox" checked={selectedRows.has(r.qa_email)} onChange={e=>{const next=new Set(selectedRows);if(e.target.checked)next.add(r.qa_email);else next.delete(r.qa_email);setSelectedRows(next);}} style={{cursor:"pointer"}} onClick={e=>e.stopPropagation()}/></td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>
                        {nameFromEmail(r.qa_email).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                      </div>
                      <div>
                        <div style={{fontWeight:500,fontSize:13,whiteSpace:"nowrap"}}>{nameFromEmail(r.qa_email)}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{fontSize:12,color:"var(--tx2)",whiteSpace:"nowrap"}}>{r.qa_tl ? nameFromEmail(r.qa_tl) : "—"}</td>
                  <td style={{textAlign:"right"}}>{r.working_days ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.sbs ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.non_sbs ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.dsat ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.late_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.never_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.valid_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.invalid_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.coaching_sessions ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.total_ontime_coachings ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.coaching_eligibility_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.not_coached ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{r.rtr_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_rtr_score)}</td>
                  <td style={{textAlign:"right"}}>{r.observed_coaching_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_observation_score_pct)}</td>
                  <td style={{textAlign:"right"}}>{r.calibration_count ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.avg_calibration_match_rate)}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.coaching_completion_pct)}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.ontime_coaching_pct)}</td>
                  <td style={{textAlign:"center"}}>
                    {r.jkq_result && r.jkq_result !== "N/A" ? (
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:r.jkq_result==="Pass"?"var(--green-bg)":"var(--red-bg)",color:r.jkq_result==="Pass"?"var(--green)":"var(--red)"}}>{r.jkq_result}{r.jkq_score>0?` (${r.jkq_score})`:""}</span>
                    ) : <span style={{color:"var(--tx3)"}}>—</span>}
                  </td>
                  <td style={{textAlign:"right",color:"var(--blue)",fontWeight:500}}>{r.ticket_per_day ?? "—"}</td>
                  <td style={{textAlign:"right"}}>{fmtPct(r.occupancy_pct)}</td>
                  <td style={{textAlign:"right",fontSize:12,color:"var(--tx2)"}}>{r.side_tasks_duration_mins?`${Math.floor(r.side_tasks_duration_mins/60)}h ${r.side_tasks_duration_mins%60}m`:"—"}</td>
                  <td style={{textAlign:"right"}}>
                    <span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:fpBg(r.final_performance),color:fpColor(r.final_performance)}}>
                      {((r.final_performance||0)*100).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}

        {/* Lead Aggregation View */}
        {mtdView==="lead"&&(()=>{
          const leadMap={};
          sorted.forEach(r=>{
            const tl=(r.qa_tl||"unknown").toLowerCase();
            if(!leadMap[tl])leadMap[tl]={tl:r.qa_tl||"Unknown",count:0,sbs:0,non_sbs:0,dsat:0,late:0,never:0,valid:0,invalid:0,sessions:0,ontime:0,eligible:0,not_coached:0,rtr:0,rtr_scores:[],obs:0,obs_scores:[],calib:0,calib_scores:[],completion:[],ontime_pct:[],tickets:[],occupancy:[],days:0,st_mins:0,performance:[]};
            const l=leadMap[tl];
            l.count++;l.sbs+=(r.sbs||0);l.non_sbs+=(r.non_sbs||0);l.dsat+=(r.dsat||0);l.late+=(r.late_count||0);l.never+=(r.never_count||0);l.valid+=(r.valid_count||0);l.invalid+=(r.invalid_count||0);
            l.sessions+=(r.coaching_sessions||0);l.ontime+=(r.total_ontime_coachings||0);l.eligible+=(r.coaching_eligibility_count||0);l.not_coached+=(r.not_coached||0);
            l.rtr+=(r.rtr_count||0);if(r.avg_rtr_score)l.rtr_scores.push(parseFloat(r.avg_rtr_score)||0);
            l.obs+=(r.observed_coaching_count||0);if(r.avg_observation_score_pct)l.obs_scores.push(parseFloat(r.avg_observation_score_pct)||0);
            l.calib+=(r.calibration_count||0);if(r.avg_calibration_match_rate)l.calib_scores.push(parseFloat(r.avg_calibration_match_rate)||0);
            if(r.coaching_completion_pct)l.completion.push(parseFloat(r.coaching_completion_pct)||0);
            if(r.ontime_coaching_pct)l.ontime_pct.push(parseFloat(r.ontime_coaching_pct)||0);
            if(r.ticket_per_day)l.tickets.push(parseFloat(r.ticket_per_day)||0);
            if(r.occupancy_pct)l.occupancy.push(parseFloat(r.occupancy_pct)||0);
            l.days+=(r.working_days||0);l.st_mins+=(r.side_tasks_duration_mins||0);
            if(r.final_performance)l.performance.push(parseFloat(r.final_performance)||0);
          });
          const avg=(arr)=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
          const leads=Object.values(leadMap).sort((a,b)=>avg(b.performance)-avg(a.performance));
          return <div className="table-wrap table-wrap-sticky"><table>
            <thead><tr>
              <th style={{minWidth:160}}>Lead</th>
              <th style={{textAlign:"right"}}>QAs</th>
              <th style={{textAlign:"right"}}>SBS</th>
              <th style={{textAlign:"right"}}>Non-SBS</th>
              <th style={{textAlign:"right"}}>DSAT</th>
              <th style={{textAlign:"right"}}>Sessions</th>
              <th style={{textAlign:"right"}}>On-time</th>
              <th style={{textAlign:"right"}}>Not coached</th>
              <th style={{textAlign:"right"}}>RTR</th>
              <th style={{textAlign:"right"}}>Avg RTR</th>
              <th style={{textAlign:"right"}}>Obs.</th>
              <th style={{textAlign:"right"}}>Calib.</th>
              <th style={{textAlign:"right"}}>Avg Completion</th>
              <th style={{textAlign:"right"}}>Avg Tickets/d</th>
              <th style={{textAlign:"right"}}>Avg Occupancy</th>
              <th style={{textAlign:"right"}}>Total Days</th>
              <th style={{textAlign:"right"}}>ST Time</th>
              <th style={{textAlign:"right"}}>Avg Performance</th>
            </tr></thead>
            <tbody>
              {leads.map(l=>{
                const avgPerf=avg(l.performance);
                return <tr key={l.tl}>
                  <td><div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>
                      {nameFromEmail(l.tl).split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}
                    </div>
                    <div><div style={{fontWeight:600,fontSize:13}}>{nameFromEmail(l.tl)}</div><div style={{fontSize:10,color:"var(--tx3)"}}>{l.count} QA{l.count!==1?"s":""}</div></div>
                  </div></td>
                  <td style={{textAlign:"right",fontWeight:600}}>{l.count}</td>
                  <td style={{textAlign:"right"}}>{l.sbs}</td>
                  <td style={{textAlign:"right"}}>{l.non_sbs}</td>
                  <td style={{textAlign:"right",color:"var(--tx2)"}}>{l.dsat}</td>
                  <td style={{textAlign:"right"}}>{l.sessions}</td>
                  <td style={{textAlign:"right"}}>{l.ontime}</td>
                  <td style={{textAlign:"right",color:l.not_coached>0?"var(--amber)":"var(--tx3)"}}>{l.not_coached}</td>
                  <td style={{textAlign:"right"}}>{l.rtr}</td>
                  <td style={{textAlign:"right"}}>{avg(l.rtr_scores).toFixed(1)}</td>
                  <td style={{textAlign:"right"}}>{l.obs}</td>
                  <td style={{textAlign:"right"}}>{l.calib}</td>
                  <td style={{textAlign:"right"}}>{(avg(l.completion)*100).toFixed(1)}%</td>
                  <td style={{textAlign:"right"}}>{avg(l.tickets).toFixed(1)}</td>
                  <td style={{textAlign:"right"}}>{(avg(l.occupancy)*100).toFixed(1)}%</td>
                  <td style={{textAlign:"right"}}>{l.days}</td>
                  <td style={{textAlign:"right",fontSize:12,color:"var(--tx2)"}}>{l.st_mins?`${Math.floor(l.st_mins/60)}h ${l.st_mins%60}m`:"—"}</td>
                  <td style={{textAlign:"right"}}>
                    <span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:fpBg(avgPerf),color:fpColor(avgPerf)}}>
                      {(avgPerf*100).toFixed(1)}%
                    </span>
                  </td>
                </tr>;
              })}
            </tbody>
          </table></div>;
        })()}
      </div>
    )}

    {/* Upload Data Modal */}
    {showUpload&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 20px 20px"}} onClick={e=>{if(e.target===e.currentTarget)setShowUpload(false);}}>
      <div className="card" style={{width:"100%",maxWidth:720,maxHeight:"85vh",overflow:"auto",background:"var(--card-bg,var(--bg2))",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
        <div className="card-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}><Icon d={icons.upload} size={18}/>Upload data to MTD</span>
          <button className="btn btn-outline btn-sm" onClick={()=>setShowUpload(false)} style={{padding:"4px 8px"}}><Icon d="M6 18L18 6M6 6l12 12" size={16}/></button>
        </div>

        {uploadStep==="config"&&<div style={{padding:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div className="form-group">
              <label className="form-label">Month</label>
              <SearchableSelect options={months} value={uploadMonth} onChange={setUploadMonth} placeholder="Select month"/>
            </div>
            <div className="form-group">
              <label className="form-label" style={{display:"flex",alignItems:"center",gap:6}}>Overwrite existing values
                <span style={{fontSize:10,padding:"2px 6px",borderRadius:6,background:uploadOverwrite?"var(--red-bg)":"var(--bg3)",color:uploadOverwrite?"var(--red)":"var(--tx3)",fontWeight:600}}>{uploadOverwrite?"ON":"OFF"}</span>
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"var(--tx2)"}}>
                <input type="checkbox" checked={uploadOverwrite} onChange={e=>setUploadOverwrite(e.target.checked)} style={{width:16,height:16}}/>
                {uploadOverwrite?"Will replace existing synced data":"Only fills empty/null cells (safe mode)"}
              </label>
            </div>
          </div>

          <div className="form-group" style={{marginBottom:16}}>
            <label className="form-label">Columns to update (pick one or more)</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,maxHeight:240,overflow:"auto",padding:8,border:"1px solid var(--bd2)",borderRadius:8,background:"var(--bg)"}}>
              {allMtdCols.map(col=>(
                <label key={col} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:uploadCols.includes(col)?"var(--tx)":"var(--tx3)",padding:"4px 6px",borderRadius:6,background:uploadCols.includes(col)?"var(--accent-light)":"transparent"}}>
                  <input type="checkbox" checked={uploadCols.includes(col)} onChange={e=>{
                    if(e.target.checked)setUploadCols([...uploadCols,col]);
                    else setUploadCols(uploadCols.filter(c=>c!==col));
                  }} style={{width:14,height:14}}/>
                  {COL_LABELS[col]||col}
                </label>
              ))}
            </div>
          </div>

          <div style={{display:"flex",gap:8,marginBottom:20}}>
            <button className="btn btn-primary" disabled={!uploadMonth||uploadCols.length===0} onClick={downloadTemplate}>
              <Icon d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" size={16}/>Download CSV template
            </button>
            <label className="btn btn-outline" style={{cursor:!uploadMonth||uploadCols.length===0?"not-allowed":"pointer",opacity:!uploadMonth||uploadCols.length===0?.5:1}}>
              <Icon d={icons.upload} size={16}/>Upload filled CSV
              <input type="file" accept=".csv" style={{display:"none"}} disabled={!uploadMonth||uploadCols.length===0}
                onChange={e=>{if(e.target.files[0])handleFileUpload(e.target.files[0]);e.target.value="";}}/>
            </label>
          </div>

          {/* Upload history */}
          {uploadLogs.length>0&&<div>
            <div style={{fontSize:12,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Recent uploads</div>
            <div style={{fontSize:12,border:"1px solid var(--bd2)",borderRadius:8,overflow:"hidden"}}>
              {uploadLogs.map((log,i)=>(
                <div key={log.id} style={{padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:i<uploadLogs.length-1?"1px solid var(--bd)":"none",background:i%2===0?"var(--bg)":"transparent"}}>
                  <div>
                    <span style={{fontWeight:500,color:"var(--tx)"}}>{nameFromEmail(log.uploaded_by)}</span>
                    <span style={{color:"var(--tx3)",margin:"0 6px"}}>uploaded</span>
                    <span style={{fontWeight:500,color:"var(--accent-text)"}}>{(log.columns_updated||[]).join(", ")}</span>
                    <span style={{color:"var(--tx3)",margin:"0 6px"}}>for</span>
                    <span style={{fontWeight:500}}>{log.month}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:"var(--tx3)"}}>{log.rows_affected} updated{log.rows_created>0?`, ${log.rows_created} created`:""}</span>
                    {log.overwrite_enabled&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:"var(--red-bg)",color:"var(--red)",fontWeight:600}}>OVERWRITE</span>}
                    <span style={{fontSize:11,color:"var(--tx3)"}}>{new Date(log.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>}
        </div>}

        {uploadStep==="preview"&&<div style={{padding:16}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:"var(--tx)"}}>Preview — {uploadPreview.length} row{uploadPreview.length!==1?"s":""} will be {uploadOverwrite?"updated":"filled in"}</div>
              <div style={{fontSize:12,color:"var(--tx3)"}}>Month: {uploadMonth} | Columns: {uploadCols.map(c=>COL_LABELS[c]||c).join(", ")}{uploadOverwrite?" | Overwrite: ON":""}</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={()=>setUploadStep("config")}>Back</button>
          </div>
          {uploadPreview.length===0?<div className="placeholder" style={{padding:30}}><p style={{color:"var(--tx3)"}}>No changes to apply. {uploadOverwrite?"All values are identical.":"All cells already have values. Enable 'Overwrite existing values' to replace them."}</p></div>:
          <div style={{maxHeight:400,overflow:"auto",border:"1px solid var(--bd2)",borderRadius:8,marginBottom:16}}>
            <table><thead><tr><th>QA</th><th>Status</th>{uploadCols.map(c=><th key={c}>{COL_LABELS[c]||c}</th>)}<th style={{width:40}}></th></tr></thead>
            <tbody>{uploadPreview.map(row=>(
              <tr key={row.qa_email}>
                <td style={{fontWeight:500,fontSize:13}}>{row.name}</td>
                <td><span style={{fontSize:10,padding:"2px 6px",borderRadius:6,fontWeight:600,
                  background:row.existing?"var(--green-bg)":"var(--blue-bg)",color:row.existing?"var(--green)":"var(--blue)"
                }}>{row.existing?"Update":"New"}</span></td>
                {uploadCols.map(col=>{
                  const ch = row.changes[col];
                  return <td key={col} style={{fontSize:12}}>
                    {ch?<div>
                      {ch.old!=null&&ch.old!==""&&<span style={{textDecoration:"line-through",color:"var(--tx3)",marginRight:4}}>{ch.old}</span>}
                      <span style={{color:"var(--green)",fontWeight:600}}>{ch.new}</span>
                    </div>:<span style={{color:"var(--tx3)"}}>—</span>}
                  </td>;
                })}
                <td><button className="btn btn-outline btn-sm" style={{padding:"2px 6px",color:"var(--red)"}} onClick={()=>setUploadPreview(prev=>prev.filter(r=>r.qa_email!==row.qa_email))} title="Remove from upload"><Icon d={icons.trash} size={12}/></button></td>
              </tr>
            ))}</tbody></table>
          </div>}
          {uploadPreview.length>0&&<div style={{display:"flex",gap:8}}>
            <button className="btn btn-primary" disabled={uploading} onClick={executeUpload}>
              {uploading?<><div className="spinner" style={{width:14,height:14,borderWidth:2,marginRight:6}}/>Uploading...</>:"Confirm & apply changes"}
            </button>
            <button className="btn btn-outline" onClick={()=>setUploadStep("config")}>Cancel</button>
          </div>}
        </div>}

        {uploadStep==="done"&&<div style={{padding:24,textAlign:"center"}}>
          {uploadResult?.success?<>
            <div style={{width:48,height:48,borderRadius:"50%",background:"var(--green-bg)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"><path d={icons.check}/></svg>
            </div>
            <div style={{fontSize:16,fontWeight:600,marginBottom:4}}>Upload complete</div>
            <div style={{fontSize:13,color:"var(--tx2)",marginBottom:8}}>{uploadResult.rowsAffected} row{uploadResult.rowsAffected!==1?"s":""} updated{uploadResult.rowsCreated>0?`, ${uploadResult.rowsCreated} new row${uploadResult.rowsCreated!==1?"s":""} created`:""}</div>
            {uploadResult.errors&&<div style={{textAlign:"left",maxHeight:120,overflow:"auto",background:"var(--amber-bg)",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"var(--amber)"}}>
              <div style={{fontWeight:600,marginBottom:4}}>{uploadResult.errors.length} row{uploadResult.errors.length!==1?"s":""} had issues:</div>
              {uploadResult.errors.map((e,i)=><div key={i} style={{marginBottom:2}}>{e}</div>)}
            </div>}
          </>:<>
            <div style={{width:48,height:48,borderRadius:"50%",background:"var(--red-bg)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--red)",marginBottom:4}}>Upload failed</div>
            <div style={{fontSize:13,color:"var(--tx2)",marginBottom:16}}>{uploadResult?.error||"Unknown error"}</div>
          </>}
          <button className="btn btn-primary" onClick={()=>setShowUpload(false)}>Done</button>
        </div>}
      </div>
    </div>}
    {/* Floating action bar for bulk selection */}
    {selectedRows.size>0&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:1000,background:"rgba(13,11,16,.85)",backdropFilter:"blur(12px)",borderRadius:14,padding:"12px 20px",display:"flex",alignItems:"center",gap:16,boxShadow:"0 12px 40px rgba(0,0,0,.4)",border:"1px solid rgba(255,255,255,.08)"}}>
      <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>{selectedRows.size} selected</span>
      <button className="btn btn-primary btn-sm" onClick={()=>{setBulkTaskModal(true);setBulkForm({title:"",description:"",priority:"medium",due_date:""});}} style={{fontSize:12}}>
        <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" size={14}/>Assign Task
      </button>
      <button onClick={()=>setSelectedRows(new Set())} style={{background:"none",border:"1px solid rgba(255,255,255,.2)",borderRadius:8,padding:"5px 12px",fontSize:12,color:"rgba(255,255,255,.7)",cursor:"pointer",fontFamily:"var(--font)",fontWeight:500}}>Clear</button>
    </div>}

    {/* Bulk task creation modal */}
    {bulkTaskModal&&<div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.6)",backdropFilter:"blur(6px)",display:"flex",justifyContent:"center",alignItems:"center"}} onClick={()=>setBulkTaskModal(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"0 25px 50px rgba(0,0,0,.5)",width:"100%",maxWidth:480,padding:24,margin:16}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Assign Task to {selectedRows.size} QA{selectedRows.size!==1?"s":""}</div>
        <div style={{fontSize:12,color:"var(--tx3)",marginBottom:16}}>One task will be created for each selected specialist</div>
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Title</label>
          <input className="form-input" value={bulkForm.title} onChange={e=>setBulkForm({...bulkForm,title:e.target.value})} placeholder="Task title..."/>
        </div>
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Description</label>
          <textarea className="form-input" rows={3} value={bulkForm.description} onChange={e=>setBulkForm({...bulkForm,description:e.target.value})} placeholder="Optional description..." style={{resize:"vertical"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <select className="form-input" value={bulkForm.priority} onChange={e=>setBulkForm({...bulkForm,priority:e.target.value})}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Due date</label>
            <input type="date" className="form-input" value={bulkForm.due_date} onChange={e=>setBulkForm({...bulkForm,due_date:e.target.value})}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button className="btn btn-outline" onClick={()=>setBulkTaskModal(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={!bulkForm.title.trim()||bulkSending} onClick={async()=>{
            setBulkSending(true);
            let created=0;
            try{
              for(const email of selectedRows){
                await sb.query("tasks",{token,method:"POST",body:{
                  assigned_to:email,
                  created_by:profile?.email,
                  title:bulkForm.title.trim(),
                  description:bulkForm.description.trim()||null,
                  priority:bulkForm.priority,
                  due_date:bulkForm.due_date||null,
                  status:"pending",
                }});
                created++;
              }
              globalToast("success",`Created ${created} task${created!==1?"s":""}`);
              setBulkTaskModal(false);
              setSelectedRows(new Set());
            }catch(e){
              globalToast("error",`Created ${created}/${selectedRows.size} — ${e.message||"error"}`);
            }
            setBulkSending(false);
          }}>
            {bulkSending?"Creating...":"Create tasks"}
          </button>
        </div>
      </div>
    </div>}
  </div>);
}

export default ScoreEntryPage;
