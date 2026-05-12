import React, { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { hasRole } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { nameFromEmail, safeError } from "../../lib/utils.js";
import { useConfirm } from "../../lib/hooks.jsx";
import { Icon, icons } from "../Icons.jsx";
import { useApp } from "../../lib/AppContext.jsx";
import EmptyState from "../EmptyState.jsx";

const ENUM_TO_LABEL = {"weekly_1on1":"WPR","performance_review":"MPR","ad_hoc":"Coaching Session","ap_checkin":"Action Plan Review","pip_checkin":"PIP Review","return_from_leave":"Return from Leave"};

// Coaching content fields (topics / strengths / weaknesses / goals /
// action_items / next_steps) are stored as raw HTML by the rich-text
// editor in CoachingCompose — `<div>...</div>`, `<ul><li>...</li></ul>`,
// `&nbsp;`, etc. Rendering them inside a plain `<div>{s.field}</div>`
// shows the markup as literal characters in the detail panel — the
// "<div>Achieving 124.6% occupancy.&nbsp;</div>" symbol soup the user
// reported. RichText detects markup and routes it through DOMPurify
// for safe HTML rendering; falls back to plain pre-line for legacy
// non-HTML drafts.
const hasMarkup = (text) => /<[a-z][^>]*>/i.test(String(text || ""));
const RichText = ({ text }) => {
  if (!text) return null;
  const str = String(text);
  if (hasMarkup(str)) {
    return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(str) }} />;
  }
  return <div style={{ whiteSpace: "pre-line" }}>{str}</div>;
};

export default function CoachingHistory({ sessions, onDelete }) {
  const { token, profile, globalToast } = useApp();
  const { ask: confirmAsk, el: confirmEl } = useConfirm();

  const [expandedSession, setExpandedSession] = useState(null);
  // Local mirror of observation edits so saves reflect instantly even
  // before the parent's sessions array is reloaded.
  const [obsLocal, setObsLocal] = useState({});
  // Tracks which session id is currently in "edit observation" mode.
  const [editingObs, setEditingObs] = useState(null);
  const [obsDraft, setObsDraft] = useState({ empathy: 3, clarity: 3, specificity: 3, note: "" });
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilterBy, setHistoryFilterBy] = useState("all");
  // New filter dropdowns — date range, meeting type, performance rating.
  // Empty string = no filter for that axis.
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterRating, setFilterRating] = useState("");
  // Per-session ack lookup: session_id -> acked_at. Loaded once on mount,
  // used to render ✓ / ⏳ on each row.
  const [ackBySession, setAckBySession] = useState({});
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    sb.query("coaching_session_acks", {
      token, select: "session_id,acked_at,qa_email",
    }).then(rows => {
      if (cancelled) return;
      const map = {};
      for (const r of (Array.isArray(rows) ? rows : [])) {
        if (r.session_id) map[r.session_id] = r.acked_at;
      }
      setAckBySession(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);
  // Click-to-sort state. Default: newest sessions first.
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
  };

  // Performance rating order so "Outstanding" sorts above "Needs Attention"
  // even though they're text values. Lower index = higher rating.
  const PERF_ORDER = { "Outstanding": 0, "Exceeds Expectations": 1, "Meets Expectations": 2, "Improvement Needed": 3, "Below Expectations": 3, "Needs Attention": 4 };

  // Build a "follow-up needed" set: a session has open action items if its
  // action_items field is non-empty AND no later session for the same
  // member exists. Computed once over the full sessions list (not the
  // filtered view) so the badge is correct even when the user filters.
  const followUpNeeded = (() => {
    const out = new Set();
    const byMember = new Map();
    for (const s of sessions) {
      const k = (s.qa_email || "").toLowerCase();
      if (!byMember.has(k)) byMember.set(k, []);
      byMember.get(k).push(s);
    }
    for (const [, list] of byMember) {
      const sorted = [...list].sort((a, b) => (a.session_date || "").localeCompare(b.session_date || ""));
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        const hasActions = !!(s.action_items && String(s.action_items).replace(/<[^>]+>/g, "").trim().length > 0);
        if (!hasActions) continue;
        const hasLater = i < sorted.length - 1;
        if (!hasLater) out.add(s.id);
      }
    }
    return out;
  })();

  // Per-column key extractors. Returned as comparable primitives so the
  // generic sort below works for every column without bespoke logic.
  const sortKeyFor = {
    date:        s => s.session_date || "",
    type:        s => (ENUM_TO_LABEL[s.meeting_type] || s.meeting_type || "").toLowerCase(),
    member:      s => nameFromEmail(s.qa_email).toLowerCase(),
    sender:      s => nameFromEmail(s.sender_email).toLowerCase(),
    performance: s => PERF_ORDER[s.performance_rating] ?? 99,
    outcome:     s => (s.outcome || "").toLowerCase(),
  };

  const isLeadOnly = hasRole(profile?.role, "qa_lead") && !hasRole(profile?.role, "qa_supervisor");
  const myEmail = profile?.email?.toLowerCase() || "";

  const getScopedFiltered = () => {
    let scopedSessions = isLeadOnly ? sessions.filter(s => s.sender_email?.toLowerCase() === myEmail) : historyFilterBy === "my_sessions" ? sessions.filter(s => s.sender_email?.toLowerCase() === myEmail) : sessions;
    // Apply structured filters (date range / type / rating). Empty string
    // means "any value" for that axis.
    if (filterFrom)   scopedSessions = scopedSessions.filter(s => (s.session_date || "") >= filterFrom);
    if (filterTo)     scopedSessions = scopedSessions.filter(s => (s.session_date || "") <= filterTo);
    if (filterType)   scopedSessions = scopedSessions.filter(s => s.meeting_type === filterType);
    if (filterRating) scopedSessions = scopedSessions.filter(s => (s.performance_rating || "") === filterRating);
    const q = historySearch.toLowerCase().trim();
    if (!q) return scopedSessions;
    return scopedSessions.filter(s => {
      const memberName = nameFromEmail(s.qa_email).toLowerCase();
      const senderName = nameFromEmail(s.sender_email).toLowerCase();
      return (s.qa_email || "").toLowerCase().includes(q) || memberName.includes(q) || (s.sender_email || "").toLowerCase().includes(q) || senderName.includes(q) || (s.email_subject || "").toLowerCase().includes(q) || (ENUM_TO_LABEL[s.meeting_type] || "").toLowerCase().includes(q);
    });
  };

  const ENUM_LABELS = Object.entries(ENUM_TO_LABEL); // for the type-filter dropdown
  const PERF_OPTIONS_FILTER = ["Outstanding", "Exceeds Expectations", "Meets Expectations", "Improvement Needed", "Needs Attention"];
  const anyFilterActive = !!(filterFrom || filterTo || filterType || filterRating);

  // Filter, then sort by the selected column. Sort is non-mutating so the
  // upstream sessions array stays untouched. session_date desc is the
  // secondary key so ties (e.g. two rows both rated "Improvement Needed",
  // or two rows on the same date) render in newest-first order rather than
  // depending on Array.sort stability across engines.
  const filtered = (() => {
    const list = [...getScopedFiltered()];
    const extractor = sortKeyFor[sortKey] || sortKeyFor.date;
    list.sort((a, b) => {
      const va = extractor(a), vb = extractor(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      const da = a.session_date || "", db = b.session_date || "";
      if (da < db) return 1;
      if (da > db) return -1;
      return 0;
    });
    return list;
  })();

  // Render a sortable column header. Clicking toggles asc/desc and shows
  // an arrow on the active column so the order is obvious.
  const SortableTh = ({ col, label, style }) => {
    const active = sortKey === col;
    return (
      <th
        onClick={() => toggleSort(col)}
        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...(style || {}) }}
        title={`Sort by ${label.toLowerCase()}`}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: active ? "var(--tabby-purple)" : undefined }}>
          {label}
          <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "▾"}
          </span>
        </span>
      </th>
    );
  };

  return (<div className="card">
    {/* Search and filter bar */}
    <div style={{padding:"14px 16px",borderBottom:"1px solid var(--bd2)",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:200,position:"relative"}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input className="form-input" placeholder="Search by QA name, QA Lead, or email..." value={historySearch} onChange={e=>setHistorySearch(e.target.value)} style={{paddingLeft:34,height:36,fontSize:13}}/>
      </div>
      {hasRole(profile?.role,"qa_supervisor")&&<div style={{display:"flex",gap:4}}>
        <button className={`btn btn-sm ${historyFilterBy==="all"?"btn-primary":"btn-outline"}`} onClick={()=>setHistoryFilterBy("all")} style={{fontSize:11}}>All coachings</button>
        <button className={`btn btn-sm ${historyFilterBy==="my_sessions"?"btn-primary":"btn-outline"}`} onClick={()=>setHistoryFilterBy("my_sessions")} style={{fontSize:11}}>My coachings</button>
      </div>}
      <div style={{fontSize:12,color:"var(--tx3)"}}>{filtered.length} coaching{filtered.length!==1?"s":""}</div>
    </div>

    {/* Structured filters: date range, meeting type, performance rating.
        Empty input/select = no filter for that axis. Clear-all link
        appears only when at least one filter is active. */}
    <div style={{padding:"10px 16px",borderBottom:"1px solid var(--bd2)",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",fontSize:12}}>
      <label style={{display:"flex",alignItems:"center",gap:6,color:"var(--tx3)"}}>
        From
        <input type="date" className="form-input" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} style={{padding:"4px 6px",fontSize:12,height:30,width:140}}/>
      </label>
      <label style={{display:"flex",alignItems:"center",gap:6,color:"var(--tx3)"}}>
        To
        <input type="date" className="form-input" value={filterTo} onChange={e=>setFilterTo(e.target.value)} style={{padding:"4px 6px",fontSize:12,height:30,width:140}}/>
      </label>
      <label style={{display:"flex",alignItems:"center",gap:6,color:"var(--tx3)"}}>
        Type
        <select className="select form-input" value={filterType} onChange={e=>setFilterType(e.target.value)} style={{padding:"4px 6px",fontSize:12,height:30,width:160}}>
          <option value="">All types</option>
          {ENUM_LABELS.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label style={{display:"flex",alignItems:"center",gap:6,color:"var(--tx3)"}}>
        Rating
        <select className="select form-input" value={filterRating} onChange={e=>setFilterRating(e.target.value)} style={{padding:"4px 6px",fontSize:12,height:30,width:170}}>
          <option value="">All ratings</option>
          {PERF_OPTIONS_FILTER.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      {anyFilterActive && (
        <button
          onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterType(""); setFilterRating(""); }}
          style={{background:"none",border:"none",color:"var(--tabby-purple)",fontSize:11,fontWeight:600,cursor:"pointer",padding:"4px 0"}}
        >Clear filters</button>
      )}
    </div>

    {filtered.length === 0 ? (historySearch
      ? <EmptyState
          title="No matches"
          description={`No coachings match "${historySearch}". Try a different keyword or clear the search.`}
          icon="M21 21l-4.35-4.35M16 11a5 5 0 11-10 0 5 5 0 0110 0z"
          cta={{ label: "Clear search", onClick: () => setHistorySearch("") }}
        />
      : <EmptyState
          title="No coachings yet"
          description={hasRole(profile?.role, "qa_lead") ? "Log your first coaching to start tracking your team's growth." : "Your lead hasn't logged any coachings yet."}
          icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          cta={hasRole(profile?.role, "qa_lead") ? { label: "Switch to Schedule tab →", onClick: () => window.dispatchEvent(new CustomEvent("qc-tab", { detail: "schedule" })) } : undefined}
        />
    ) :
    <div className="table-wrap"><table>
      <thead><tr>
        <SortableTh col="date" label="Date" />
        <SortableTh col="type" label="Type" />
        <SortableTh col="member" label="Member" />
        <SortableTh col="sender" label="Sent by" />
        <SortableTh col="performance" label="Performance" />
        <SortableTh col="outcome" label="Outcome" />
        {hasRole(profile?.role,"super_admin")&&<th></th>}
        <th style={{width:30}}></th>
      </tr></thead>
      <tbody>
        {filtered.map(s => {
          const isExp=expandedSession===s.id;
          return(<React.Fragment key={s.id}>
            <tr onClick={()=>setExpandedSession(isExp?null:s.id)} style={{cursor:"pointer"}}>
            <td style={{fontSize:13,whiteSpace:"nowrap"}}>{s.session_date ? new Date(s.session_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"}) : "—"}</td>
            <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red-bg)":"var(--green-bg)",color:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red)":"var(--green)"}}>{ENUM_TO_LABEL[s.meeting_type]||s.meeting_type}</span>
            {followUpNeeded.has(s.id) && <span title="Action items from this session have no follow-up session" style={{marginLeft:6,fontSize:10,padding:"1px 6px",borderRadius:8,background:"var(--amber-bg)",color:"var(--amber)",fontWeight:700,letterSpacing:.2}}>↻ Follow-up</span>}
            </td>
            <td style={{fontWeight:500}}>
              {nameFromEmail(s.qa_email)}
              {ackBySession[s.id]
                ? <span title={`Read ${new Date(ackBySession[s.id]).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}`} style={{marginLeft:6,fontSize:11,color:"var(--green)"}}>✓</span>
                : <span title="Not yet acknowledged by the member" style={{marginLeft:6,fontSize:11,color:"var(--tx3)"}}>⏳</span>}
            </td>
            <td style={{fontSize:13,color:"var(--tx2)"}}>{nameFromEmail(s.sender_email)}</td>
            <td>{s.performance_rating ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,
              background:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green-bg)":s.performance_rating==="Meets Expectations"?"var(--accent-light)":"var(--amber-bg)",
              color:s.performance_rating==="Outstanding"||s.performance_rating==="Exceeds Expectations"?"var(--green)":s.performance_rating==="Meets Expectations"?"var(--accent-text)":"var(--amber)"
            }}>{s.performance_rating}</span> : "—"}</td>
            <td>{s.outcome ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:600,
              background:s.outcome==="pass"?"var(--green-bg)":"var(--red-bg)",
              color:s.outcome==="pass"?"var(--green)":"var(--red)"
            }}>{s.outcome==="pass"?"Passed":"Failed"}</span> : "—"}</td>
            {hasRole(profile?.role,"super_admin")&&<td>
              <button className="btn btn-outline btn-sm" style={{color:"var(--red)"}} onClick={async(e)=>{
                e.stopPropagation();
                confirmAsk("Delete coaching?","This will permanently delete this coaching log.",async()=>{
                const snapshot = {...s};
                try{
                  await sb.query("coaching_sessions",{token,method:"DELETE",filters:`id=eq.${s.id}`});
                  onDelete(s.id);
                  globalToast("success","Session deleted",{
                    action: { label: "Undo", onClick: async () => {
                      try {
                        const restored = await sb.query("coaching_sessions", { token, method: "POST", body: snapshot });
                        const row = Array.isArray(restored) ? restored[0] : restored;
                        if (row && onDelete) {
                          // Notify parent so it can append the restored row.
                          // Re-using onDelete with a "restore" sentinel keeps
                          // the API minimal — parents can listen for the
                          // restored event via a separate prop or just refetch.
                          window.dispatchEvent(new CustomEvent("coaching-session-restored", { detail: row }));
                        }
                        globalToast("success", "Session restored");
                      } catch (e) { globalToast("error", `Restore failed: ${e?.message || "unknown"}`); }
                    }}
                  });
                }catch(err){globalToast("error",safeError(err));}
              },"Delete","var(--red)");}}><Icon d={icons.trash} size={14}/></button>
            </td>}
            <td><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
          </tr>

          {/* Expanded session details */}
          {isExp&&<tr><td colSpan={hasRole(profile?.role,"super_admin")?8:7} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>To</div><div style={{fontSize:13}}>{s.qa_email||"—"}</div></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>CC</div><div style={{fontSize:13}}>{s.cc_email||"—"}</div></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>From</div><div style={{fontSize:13}}>{s.sender_email||"—"}</div></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Subject</div><div style={{fontSize:13}}>{s.email_subject||"—"}</div></div>
            </div>

            {s.topics&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Topics discussed</div><div style={{fontSize:13,color:"var(--tx2)"}}><RichText text={s.topics}/></div></div>}

            {s.strengths&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--green)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Strengths</div><div style={{fontSize:13,color:"var(--tx2)"}}><RichText text={s.strengths}/></div></div>}

            {s.weaknesses&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--red)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Areas for improvement</div><div style={{fontSize:13,color:"var(--tx2)"}}><RichText text={s.weaknesses}/></div></div>}

            {s.goals&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Goals</div><div style={{fontSize:13,color:"var(--tx2)"}}><RichText text={s.goals}/></div></div>}

            {s.action_items&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Action items</div><div style={{fontSize:13,color:"var(--tx2)"}}><RichText text={s.action_items}/></div></div>}

            {s.next_steps&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Next steps</div><div style={{fontSize:13,color:"var(--tx2)"}}><RichText text={s.next_steps}/></div></div>}

            {s.target_data&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Target data</div><div style={{fontSize:12,color:"var(--tx2)",fontFamily:"monospace",background:"var(--bg3)",padding:"8px 10px",borderRadius:6,overflowX:"auto"}}>{s.target_data}</div></div>}

            {/* Observation panel — supervisors and above can rate the
                lead's coaching style on three axes (Empathy, Clarity,
                Specificity 1-5) plus a free-text note. Visible to
                everyone who can see the row; editable by qa_supervisor+. */}
            {(() => {
              const cur = obsLocal[s.id] || {
                empathy: s.observation_empathy,
                clarity: s.observation_clarity,
                specificity: s.observation_specificity,
                note: s.observation_note,
                observed_by: s.observed_by,
                observed_at: s.observed_at,
              };
              const hasObs = cur.empathy != null || cur.clarity != null || cur.specificity != null;
              const canEdit = hasRole(profile?.role, "qa_supervisor");
              const isEditing = editingObs === s.id;
              if (!hasObs && !canEdit) return null;
              // Compact mode: when there's no observation yet, render JUST a
              // small "+ Add observation" link instead of the whole panel
              // header. The form expands inline once clicked. Stops the
              // expanded row from showing an empty observation header for
              // every coaching that hasn't been observed yet.
              if (!hasObs && canEdit && !isEditing) {
                return (
                  <div style={{marginTop:10}}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditingObs(s.id); setObsDraft({ empathy: 3, clarity: 3, specificity: 3, note: "" }); }}
                      style={{background:"none",border:"none",padding:0,cursor:"pointer",fontSize:11,fontWeight:600,color:"var(--accent-text)",fontFamily:"var(--font)"}}
                    >+ Add observation</button>
                  </div>
                );
              }
              return (
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--bd2)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:11,fontWeight:600,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px"}}>
                      Coaching observation {hasObs && cur.observed_by ? <span style={{color:"var(--tx3)",fontWeight:500,textTransform:"none",letterSpacing:0}}> · by {nameFromEmail(cur.observed_by)}{cur.observed_at?` · ${new Date(cur.observed_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`:""}</span> : null}
                    </span>
                    {canEdit && !isEditing && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{fontSize:10,padding:"3px 8px"}}
                        onClick={(e) => { e.stopPropagation(); setEditingObs(s.id); setObsDraft({ empathy: cur.empathy ?? 3, clarity: cur.clarity ?? 3, specificity: cur.specificity ?? 3, note: cur.note || "" }); }}
                      >Edit</button>
                    )}
                  </div>

                  {isEditing ? (
                    <div onClick={(e) => e.stopPropagation()} style={{display:"flex",flexDirection:"column",gap:8}}>
                      {[["Empathy","empathy"],["Clarity","clarity"],["Specificity","specificity"]].map(([label,key]) => (
                        <div key={key} style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:12,minWidth:80,color:"var(--tx2)"}}>{label}</span>
                          {[1,2,3,4,5].map(n => (
                            <button key={n} type="button" onClick={() => setObsDraft(d => ({ ...d, [key]: n }))}
                              style={{width:28,height:28,borderRadius:6,border:obsDraft[key]===n?`2px solid var(--tabby-purple)`:"1px solid var(--bd)",background:obsDraft[key]===n?"var(--accent-light)":"var(--bg)",color:obsDraft[key]===n?"var(--accent-text)":"var(--tx2)",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"var(--font)"}}>{n}</button>
                          ))}
                        </div>
                      ))}
                      <textarea
                        className="form-input"
                        rows={2}
                        value={obsDraft.note}
                        onChange={(e) => setObsDraft(d => ({ ...d, note: e.target.value }))}
                        placeholder="Optional note on what stood out — coaching style, tone, evidence cited..."
                        style={{fontSize:12,resize:"vertical"}}
                      />
                      <div style={{display:"flex",gap:8}}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{fontSize:11,padding:"4px 12px"}}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const body = {
                                observation_empathy: obsDraft.empathy,
                                observation_clarity: obsDraft.clarity,
                                observation_specificity: obsDraft.specificity,
                                observation_note: obsDraft.note || null,
                                observed_by: profile?.email || null,
                                observed_at: new Date().toISOString(),
                              };
                              await sb.query("coaching_sessions", { token, method: "PATCH", body, filters: `id=eq.${s.id}` });
                              setObsLocal(prev => ({ ...prev, [s.id]: { ...body } }));
                              setEditingObs(null);
                              globalToast?.("success", "Observation saved.");
                            } catch (err) {
                              globalToast?.("error", safeError(err));
                            }
                          }}
                        >Save observation</button>
                        <button type="button" className="btn btn-outline btn-sm" style={{fontSize:11,padding:"4px 12px"}} onClick={(e) => { e.stopPropagation(); setEditingObs(null); }}>Cancel</button>
                      </div>
                    </div>
                  ) : hasObs ? (
                    <div style={{display:"flex",flexWrap:"wrap",gap:14,fontSize:12}}>
                      {[["Empathy",cur.empathy],["Clarity",cur.clarity],["Specificity",cur.specificity]].map(([label,val]) => (
                        <span key={label} style={{display:"inline-flex",alignItems:"center",gap:4}}>
                          <span style={{color:"var(--tx3)"}}>{label}:</span>
                          <strong style={{color:val>=4?"var(--green)":val>=3?"var(--accent-text)":"var(--amber)"}}>{val ?? "—"}/5</strong>
                        </span>
                      ))}
                      {cur.note && <span style={{flexBasis:"100%",color:"var(--tx2)",fontStyle:"italic",marginTop:4}}>"{cur.note}"</span>}
                    </div>
                  ) : null}
                </div>
              );
            })()}

            <div style={{display:"flex",gap:16,flexWrap:"wrap",paddingTop:12,borderTop:"1px solid var(--bd2)",fontSize:12,color:"var(--tx3)",marginTop:12}}>
              {s.sig_name&&<span>Signed by: <strong style={{color:"var(--tx)"}}>{s.sig_name}</strong>{s.sig_title?" — "+s.sig_title:""}</span>}
              {s.created_at&&<span>Logged: {new Date(s.created_at).toLocaleString("en-GB",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>}
            </div>
          </div></td></tr>}
          </React.Fragment>);
        })}
      </tbody>
    </table></div>}

    {confirmEl}
  </div>);
}
