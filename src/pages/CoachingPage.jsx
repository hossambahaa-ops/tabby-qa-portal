import React, { useState, useEffect } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { useToast, useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { useApp } from "../lib/AppContext.jsx";
import CoachingCompose from "../components/coaching/CoachingCompose.jsx";
import CoachingHistory from "../components/coaching/CoachingHistory.jsx";

function CoachingPage() {
  const{token,profile,gf,rosterMap}=useApp();
  const [tab, setTab] = useState("compose"); // compose | history
  const [sessions, setSessions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [activePlans, setActivePlans] = useState([]);
  const [planWeeks, setPlanWeeks] = useState([]);
  const {show, el} = useToast();
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  // Gmail OAuth state
  const [gmailAuthorized, setGmailAuthorized] = useState(false);
  const [gmailChecking, setGmailChecking] = useState(true);

  const GMAIL_EDGE_FN = `${SUPABASE_URL}/functions/v1/gmail-auth`;

  // Helper to call the gmail-auth edge function
  const callGmailFn = async (body) => {
    const r = await fetch(GMAIL_EDGE_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  // Check Gmail auth status on mount + handle OAuth callback
  useEffect(() => {
    (async () => {
      // Check if returning from Gmail OAuth
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      if (code && state === "gmail_oauth") {
        try {
          const result = await callGmailFn({ action: "exchange", code });
          if (result.success) {
            setGmailAuthorized(true);
            show("success", "Gmail connected successfully! You can now send emails directly.");
          } else {
            show("error", "Gmail authorization failed: " + (result.error || "Unknown error"));
          }
        } catch (e) {
          console.error("Gmail OAuth exchange:", e);
          show("error", "Failed to complete Gmail authorization");
        }
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      }
      try {
        const status = await callGmailFn({ action: "check" });
        setGmailAuthorized(status.authorized === true);
      } catch (e) {
        console.error("Gmail check:", e);
      }
      setGmailChecking(false);
    })();
  }, [token]);

  // Start Gmail OAuth flow
  const connectGmail = async () => {
    try {
      const result = await callGmailFn({ action: "get_auth_url" });
      if (result.authUrl) {
        sessionStorage.setItem("gmail_oauth_return", "coaching");
        window.location.href = result.authUrl;
      } else {
        show("error", "Could not get Gmail authorization URL");
      }
    } catch (e) {
      show("error", "Failed to start Gmail authorization");
    }
  };

  // Disconnect Gmail
  const disconnectGmail = () => {
    confirmAsk("Disconnect Gmail?","You will need to re-authorize to send emails.",async()=>{
      try {
        await callGmailFn({ action: "disconnect" });
        setGmailAuthorized(false);
        show("success", "Gmail disconnected");
      } catch (e) {
        show("error", "Failed to disconnect Gmail");
      }
    },"Disconnect","var(--red)");
  };

  // Load roster + history
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [r, s, ap, apw] = await Promise.all([
          dataCache.fetch("qa_roster",()=>sb.query("qa_roster", {select:"email,display_name,manager_email,queue",token}).catch((e)=>{console.error("roster err:",e);return[];})),
          sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch((e)=>{console.error("sessions err:",e);return[];}),
          sb.query("action_plans", {select:"*",filters:"status=eq.active",token}).catch((e)=>{console.error("ap err:",e);return[];}),
          sb.query("action_plan_weeks", {select:"*",filters:"order=plan_id.asc,week_number.asc",token}).catch((e)=>{console.error("apw err:",e);return[];}),
        ]);
        const sessionsArr = Array.isArray(s) ? s : [];
        const rosterArr = Array.isArray(r) ? r : [];
        const plansArr = Array.isArray(ap) ? ap : [];
        const svDomainC=profile?.operational_domain||profile?.domain||"tabby.ai";
        const isAdminC=hasRole(profile?.role,"admin");
        const isSvC=hasRole(profile?.role,"qa_supervisor")&&!isAdminC;
        let filteredRoster=isSvC?rosterArr.filter(x=>x.email?.endsWith("@"+svDomainC)):rosterArr;
        let filteredSessions=isSvC?sessionsArr.filter(x=>x.member_email?.endsWith("@"+svDomainC)):sessionsArr;
        let filteredPlans=isSvC?plansArr.filter(x=>x.qa_email?.endsWith("@"+svDomainC)):plansArr;
        if(gf?.domain){filteredRoster=filteredRoster.filter(x=>x.email?.endsWith("@"+gf.domain));filteredSessions=filteredSessions.filter(x=>x.member_email?.endsWith("@"+gf.domain));filteredPlans=filteredPlans.filter(x=>x.qa_email?.endsWith("@"+gf.domain));}
        if(gf?.people?.length>0){filteredRoster=filteredRoster.filter(x=>gf.people.includes(x.email?.toLowerCase()));filteredSessions=filteredSessions.filter(x=>gf.people.includes(x.member_email?.toLowerCase()));filteredPlans=filteredPlans.filter(x=>gf.people.includes(x.qa_email?.toLowerCase()));}
        if(gf?.teams?.length>0){filteredRoster=filteredRoster.filter(x=>{const q=rosterMap[x.email?.toLowerCase()];return q&&gf.teams.includes(q);});}
        setRoster(filteredRoster);
        setSessions(filteredSessions);
        setActivePlans(filteredPlans);
        setPlanWeeks(apw);
      } catch (e) { console.error("Coaching load:", e); }
    })();
  }, [token]);

  // Reload sessions (called by CoachingCompose after send)
  const loadSessions = async () => {
    const s = await sb.query("coaching_sessions", {select:"*",filters:"order=created_at.desc&limit=100",token}).catch(()=>[]);
    setSessions(s);
    return s;
  };

  // Handle session deletion from history
  const handleDeleteSession = (id) => {
    setSessions(sessions.filter(x => x.id !== id));
  };

  return (
    <div className="page">
      <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <div className="page-title">Coaching sessions</div>
          <div className="page-subtitle">1:1 coaching email generator and session tracking</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {sessions.length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--primary-light)",color:"var(--primary-text,var(--tabby-purple))",fontSize:12,fontWeight:600}}>{sessions.length} sessions logged</span>}
          {!gmailChecking && (gmailAuthorized ?
            <span onClick={disconnectGmail} title="Click to disconnect Gmail" style={{padding:"4px 12px",borderRadius:20,background:"var(--green-bg)",color:"var(--green)",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Gmail connected
            </span> :
            <button onClick={connectGmail} style={{padding:"4px 12px",borderRadius:20,background:"var(--amber-bg)",color:"var(--amber)",fontSize:12,fontWeight:600,border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Connect Gmail
            </button>
          )}
        </div>
      </div>

      <div className="tab-bar" style={{marginBottom:16}}>
        <button className={`tab-btn ${tab==="compose"?"active":""}`} onClick={()=>setTab("compose")}><Icon d={icons.coaching} size={16}/>Compose</button>
        <button className={`tab-btn ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}><Icon d={icons.scores} size={16}/>History ({sessions.length})</button>
      </div>

      {tab==="compose" && <CoachingCompose
        roster={roster}
        sessions={sessions}
        plans={activePlans}
        planWeeks={planWeeks}
        gmailAuthorized={gmailAuthorized}
        setGmailAuthorized={setGmailAuthorized}
        gmailChecking={gmailChecking}
        connectGmail={connectGmail}
        callGmailFn={callGmailFn}
        loadSessions={loadSessions}
      />}

      {tab==="history" && <CoachingHistory
        sessions={sessions}
        onDelete={handleDeleteSession}
      />}

      {el}
      {confirmEl}
    </div>
  );
}


export default CoachingPage;
