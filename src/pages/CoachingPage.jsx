import React, { useState, useEffect } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listCoachingSessions } from "../api/coachingSessions.js";
import { listPlans, listPlanWeeks } from "../api/plans.js";
import { listMtd } from "../api/mtd.js";
import { listDamFlags } from "../api/damFlags.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { useApp } from "../lib/AppContext.jsx";
import CoachingCompose from "../components/coaching/CoachingCompose.jsx";
import CoachingHistory from "../components/coaching/CoachingHistory.jsx";
import useKeyboard from "../lib/useKeyboard.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";

function CoachingPage() {
  const{token,profile,gf,rosterMap,globalToast}=useApp();
  const [tab, setTab] = useUrlState("coach_tab", "compose"); // compose | history
  useKeyboard({"1":()=>setTab("compose"),"2":()=>setTab("history")});
  const [sessions, setSessions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [activePlans, setActivePlans] = useState([]);
  const [planWeeks, setPlanWeeks] = useState([]);
  // pickerCandidates = roster + non-QA roles (leads, supervisors, manager,
  // HOD/Rija, admins). The compose form picks recipients from this combined
  // list so MPR emails can address leads/supervisors directly, not just QAs.
  const [pickerCandidates, setPickerCandidates] = useState([]);
  // mtdByQa / damFlagsByQa power the Compose member context strip — when
  // a member is selected, the strip pulls latest MTD KPI snapshot + most
  // recent DAM flag without an extra round trip.
  const [mtdByQa, setMtdByQa] = useState({});
  const [damFlagsByQa, setDamFlagsByQa] = useState({});
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  // Gmail OAuth state
  const [gmailAuthorized, setGmailAuthorized] = useState(false);
  const [gmailChecking, setGmailChecking] = useState(true);

  const GMAIL_EDGE_FN = `${SUPABASE_URL}/functions/v1/gmail-auth`;

  // Helper to call the gmail-auth edge function. Pulls the freshest
  // access_token via sb.auth.getSession() — which silently refreshes if
  // the JWT is within 60s of expiry — so an idle tab over an hour old
  // doesn't hit a 401 from the Edge Function's verifyUser path. Falls
  // back to the prop token if getSession returns nothing (offline, etc.).
  const callGmailFn = async (body) => {
    let bearer = token;
    try {
      const session = await sb.auth.getSession();
      if (session?.access_token) bearer = session.access_token;
    } catch { /* fall through to prop token */ }
    const r = await fetch(GMAIL_EDGE_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}`, apikey: SUPABASE_ANON },
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
            globalToast("success", "Gmail connected successfully! You can now send emails directly.");
          } else {
            globalToast("error", "Gmail authorization failed: " + (result.error || "Unknown error"));
          }
        } catch (e) {
          console.error("Gmail OAuth exchange:", e);
          globalToast("error", "Failed to complete Gmail authorization");
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
      } else if (/expired|invalid|authorization token/i.test(result.error || "")) {
        // verifyUser failed on the edge function — almost always a stale
        // Supabase session on a long-open tab. Surface the real cause and
        // tell the user how to recover instead of showing the unhelpful
        // "Could not get Gmail authorization URL" message.
        globalToast("error", "Your session expired — please refresh the page and try again.");
      } else {
        globalToast("error", `Could not get Gmail authorization URL${result.error ? ": " + result.error : ""}`);
      }
    } catch (e) {
      globalToast("error", "Failed to start Gmail authorization");
    }
  };

  // Disconnect Gmail
  const disconnectGmail = () => {
    confirmAsk("Disconnect Gmail?","You will need to re-authorize to send emails.",async()=>{
      try {
        await callGmailFn({ action: "disconnect" });
        setGmailAuthorized(false);
        globalToast("success", "Gmail disconnected");
      } catch (e) {
        globalToast("error", "Failed to disconnect Gmail");
      }
    },"Disconnect","var(--red)");
  };

  // Auto-refresh tick — bumped every minute so newly-submitted
  // coaching sessions / new DAM flags surface without the user having
  // to navigate away.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setReloadKey(k => k + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Load roster + history
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [r, s, ap, apw, profs, mtdRows, flags] = await Promise.all([
          listRoster({ token }),
          listCoachingSessions({ token }),
          listPlans({ token, filters: "status=eq.active" }),
          listPlanWeeks({ token }),
          listProfiles({ token, select: "email,display_name,role", filters: "" }).catch(() => []),
          listMtd({ token }).catch(() => []),
          listDamFlags({ token, filters: "order=triggered_at.desc" }).catch(() => []),
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
        // Slim global filter (Domain only — People + Teams dropped in unification).
        if(gf?.domain){filteredRoster=filteredRoster.filter(x=>x.email?.endsWith("@"+gf.domain));filteredSessions=filteredSessions.filter(x=>x.member_email?.endsWith("@"+gf.domain));filteredPlans=filteredPlans.filter(x=>x.qa_email?.endsWith("@"+gf.domain));}
        setRoster(filteredRoster);
        setSessions(filteredSessions);
        setActivePlans(filteredPlans);
        setPlanWeeks(apw);

        // Merge profiles into the recipient picker so the compose form
        // can address anyone with a portal account — leads, supervisors,
        // senior QAs, manager, HOD, auditor (Rija), admins. Roster entries
        // take precedence so QA queue / manager_email metadata (used by
        // CC resolution) is preserved. Plain "qa" rows from profiles are
        // skipped because they're already in the roster; everything else
        // is added. Adding new roles in the future is now zero-config.
        const merged = new Map();
        for (const r of filteredRoster) {
          const e = (r.email || "").toLowerCase();
          if (e) merged.set(e, r);
        }
        for (const p of (Array.isArray(profs) ? profs : [])) {
          const e = (p.email || "").toLowerCase();
          if (!e || merged.has(e)) continue;
          if (p.role === "qa") continue;
          merged.set(e, { email: p.email, display_name: p.display_name, role: p.role });
        }
        setPickerCandidates([...merged.values()]);

        // Build per-QA latest MTD + most-recent DAM flag indexes for the
        // member context strip on Compose. mtd.month is "MMM-YYYY" so we
        // can't sort it lexicographically — bump rows with the latest
        // synced_at, falling back to month string equality with the
        // current month label.
        const mtdMap = {};
        for (const row of (Array.isArray(mtdRows) ? mtdRows : [])) {
          const k = (row.qa_email || "").toLowerCase();
          if (!k) continue;
          const cur = mtdMap[k];
          const ts = row.synced_at ? new Date(row.synced_at).getTime() : 0;
          if (!cur || ts >= cur._ts) mtdMap[k] = { ...row, _ts: ts };
        }
        setMtdByQa(mtdMap);

        const flagMap = {};
        for (const f of (Array.isArray(flags) ? flags : [])) {
          const k = (f.qa_email || "").toLowerCase();
          if (!k) continue;
          if (!flagMap[k]) flagMap[k] = f; // already ordered desc by triggered_at
        }
        setDamFlagsByQa(flagMap);
      } catch (e) { console.error("Coaching load:", e); }
    })();
  }, [token, reloadKey]);

  // Reload sessions (called by CoachingCompose after send)
  const loadSessions = async () => {
    const s = await listCoachingSessions({ token });
    setSessions(s);
    return s;
  };

  // Handle session deletion from history
  const handleDeleteSession = (id) => {
    setSessions(sessions.filter(x => x.id !== id));
  };

  return (
    <div className="page">
      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {sessions.length>0&&<span style={{padding:"4px 12px",borderRadius:20,background:"var(--primary-light)",color:"var(--primary-text,var(--tabby-purple))",fontSize:12,fontWeight:600}}>{sessions.length} sessions</span>}
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

      <div className="tab-bar" style={{marginBottom:16}}>
        <button className={`tab-btn ${tab==="compose"?"active":""}`} onClick={()=>setTab("compose")}><Icon d={icons.coaching} size={16}/>Compose</button>
        <button className={`tab-btn ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}><Icon d={icons.scores} size={16}/>History ({sessions.length})</button>
      </div>

      {tab==="compose" && <CoachingCompose
        roster={roster}
        pickerCandidates={pickerCandidates}
        mtdByQa={mtdByQa}
        damFlagsByQa={damFlagsByQa}
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

      {confirmEl}
    </div>
  );
}


export default CoachingPage;
