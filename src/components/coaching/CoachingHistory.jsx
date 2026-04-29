import React, { useState } from "react";
import { hasRole } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { nameFromEmail, safeError } from "../../lib/utils.js";
import { useConfirm } from "../../lib/hooks.jsx";
import { Icon, icons } from "../Icons.jsx";
import { useApp } from "../../lib/AppContext.jsx";
import EmptyState from "../EmptyState.jsx";

const ENUM_TO_LABEL = {"weekly_1on1":"1:1 Meeting","performance_review":"MPR","ad_hoc":"Coaching Session","ap_checkin":"Action Plan Review","pip_checkin":"PIP Review","return_from_leave":"Return from Leave"};

export default function CoachingHistory({ sessions, onDelete }) {
  const { token, profile, globalToast } = useApp();
  const { ask: confirmAsk, el: confirmEl } = useConfirm();

  const [expandedSession, setExpandedSession] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilterBy, setHistoryFilterBy] = useState("all");

  const isLeadOnly = hasRole(profile?.role, "qa_lead") && !hasRole(profile?.role, "qa_supervisor");
  const myEmail = profile?.email?.toLowerCase() || "";

  const getScopedFiltered = () => {
    const scopedSessions = isLeadOnly ? sessions.filter(s => s.sender_email?.toLowerCase() === myEmail) : historyFilterBy === "my_sessions" ? sessions.filter(s => s.sender_email?.toLowerCase() === myEmail) : sessions;
    const q = historySearch.toLowerCase().trim();
    if (!q) return scopedSessions;
    return scopedSessions.filter(s => {
      const memberName = nameFromEmail(s.member_email).toLowerCase();
      const senderName = nameFromEmail(s.sender_email).toLowerCase();
      return (s.member_email || "").toLowerCase().includes(q) || memberName.includes(q) || (s.sender_email || "").toLowerCase().includes(q) || senderName.includes(q) || (s.email_subject || "").toLowerCase().includes(q) || (ENUM_TO_LABEL[s.meeting_type] || "").toLowerCase().includes(q);
    });
  };

  const filtered = getScopedFiltered();

  return (<div className="card">
    {/* Search and filter bar */}
    <div style={{padding:"14px 16px",borderBottom:"1px solid var(--bd2)",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:200,position:"relative"}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input className="form-input" placeholder="Search by QA name, QA Lead, or email..." value={historySearch} onChange={e=>setHistorySearch(e.target.value)} style={{paddingLeft:34,height:36,fontSize:13}}/>
      </div>
      {hasRole(profile?.role,"qa_supervisor")&&<div style={{display:"flex",gap:4}}>
        <button className={`btn btn-sm ${historyFilterBy==="all"?"btn-primary":"btn-outline"}`} onClick={()=>setHistoryFilterBy("all")} style={{fontSize:11}}>All sessions</button>
        <button className={`btn btn-sm ${historyFilterBy==="my_sessions"?"btn-primary":"btn-outline"}`} onClick={()=>setHistoryFilterBy("my_sessions")} style={{fontSize:11}}>My sessions</button>
      </div>}
      <div style={{fontSize:12,color:"var(--tx3)"}}>{filtered.length} session{filtered.length!==1?"s":""}</div>
    </div>

    {filtered.length === 0 ? (historySearch
      ? <EmptyState
          title="No matches"
          description={`No sessions match "${historySearch}". Try a different keyword or clear the search.`}
          icon="M21 21l-4.35-4.35M16 11a5 5 0 11-10 0 5 5 0 0110 0z"
          cta={{ label: "Clear search", onClick: () => setHistorySearch("") }}
        />
      : <EmptyState
          title="No coaching sessions yet"
          description={hasRole(profile?.role, "qa_lead") ? "Log your first session to start tracking your team's growth." : "Your lead hasn't logged any sessions yet."}
          icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          cta={hasRole(profile?.role, "qa_lead") ? { label: "Switch to Schedule tab →", onClick: () => window.dispatchEvent(new CustomEvent("qc-tab", { detail: "schedule" })) } : undefined}
        />
    ) :
    <div className="table-wrap"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Member</th><th>Sent by</th><th>Performance</th><th>Outcome</th>{hasRole(profile?.role,"super_admin")&&<th></th>}<th style={{width:30}}></th></tr></thead>
      <tbody>
        {filtered.map(s => {
          const isExp=expandedSession===s.id;
          return(<React.Fragment key={s.id}>
            <tr onClick={()=>setExpandedSession(isExp?null:s.id)} style={{cursor:"pointer"}}>
            <td style={{fontSize:13,whiteSpace:"nowrap"}}>{new Date(s.session_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"})}</td>
            <td><span style={{fontSize:11,padding:"2px 8px",borderRadius:12,fontWeight:500,background:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red-bg)":"var(--green-bg)",color:["ap_checkin","pip_checkin"].includes(s.meeting_type)?"var(--red)":"var(--green)"}}>{ENUM_TO_LABEL[s.meeting_type]||s.meeting_type}</span></td>
            <td style={{fontWeight:500}}>{nameFromEmail(s.member_email)}</td>
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
                confirmAsk("Delete coaching session?","This will permanently delete this session log.",async()=>{
                try{
                  await sb.query("coaching_sessions",{token,method:"DELETE",filters:`id=eq.${s.id}`});
                  onDelete(s.id);
                  globalToast("success","Session deleted");
                }catch(err){globalToast("error",safeError(err));}
              },"Delete","var(--red)");}}><Icon d={icons.trash} size={14}/></button>
            </td>}
            <td><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
          </tr>

          {/* Expanded session details */}
          {isExp&&<tr><td colSpan={hasRole(profile?.role,"super_admin")?8:7} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>To</div><div style={{fontSize:13}}>{s.member_email||"—"}</div></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>CC</div><div style={{fontSize:13}}>{s.cc_email||"—"}</div></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>From</div><div style={{fontSize:13}}>{s.sender_email||"—"}</div></div>
              <div><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Subject</div><div style={{fontSize:13}}>{s.email_subject||"—"}</div></div>
            </div>

            {s.topics&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Topics discussed</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.topics}</div></div>}

            {s.strengths&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--green)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Strengths</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.strengths}</div></div>}

            {s.weaknesses&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--red)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Areas for improvement</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.weaknesses}</div></div>}

            {s.goals&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Goals</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.goals}</div></div>}

            {s.action_items&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Action items</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.action_items}</div></div>}

            {s.next_steps&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Next steps</div><div style={{fontSize:13,color:"var(--tx2)",whiteSpace:"pre-line"}}>{s.next_steps}</div></div>}

            {s.target_data&&<div style={{marginBottom:12}}><div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Target data</div><div style={{fontSize:12,color:"var(--tx2)",fontFamily:"monospace",background:"var(--bg3)",padding:"8px 10px",borderRadius:6,overflowX:"auto"}}>{s.target_data}</div></div>}

            <div style={{display:"flex",gap:16,flexWrap:"wrap",paddingTop:12,borderTop:"1px solid var(--bd2)",fontSize:12,color:"var(--tx3)"}}>
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
