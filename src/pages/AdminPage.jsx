import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";
import AdminUsersPage from "./AdminUsersPage.jsx";
import TeamManagementPage from "./TeamManagementPage.jsx";
import AdminFeedbackPage from "./AdminFeedbackPage.jsx";
import AdminSurveysPage from "./AdminSurveysPage.jsx";
import AdminErrorsPage from "./AdminErrorsPage.jsx";
import AdminMigrationsPage from "./AdminMigrationsPage.jsx";
import AuditTrailPage from "./AuditTrailPage.jsx";
import Glossary from "../components/Glossary.jsx";
import { useUrlState } from "../lib/useUrlState.jsx";

function AdminPage(){
  const{token}=useApp();
  // Namespaced key (was "tab") so cross-page navigation doesn't
  // carry an unknown tab value over from /quality or /schedule and
  // leave Admin with no tab content active.
  const[tab,setTab]=useUrlState("admin_tab","users");const[teams,setTeams]=useState([]);
  useEffect(()=>{sb.query("teams",{select:"id,name,domain",token}).then(setTeams).catch(()=>{});},[token]);
  return(<div><div className="page" style={{paddingBottom:0}}><div className="page-header" style={{marginBottom:16}}><div className="page-title">Admin panel</div></div>
    <div className="tab-bar" style={{marginBottom:0}}><button className={`tab-btn ${tab==="users"?"active":""}`} onClick={()=>setTab("users")}>Users</button><button className={`tab-btn ${tab==="teams"?"active":""}`} onClick={()=>setTab("teams")}>Teams</button><button className={`tab-btn ${tab==="migrations"?"active":""}`} onClick={()=>setTab("migrations")}>Migrations</button><button className={`tab-btn ${tab==="audit"?"active":""}`} onClick={()=>setTab("audit")}>Audit trail</button><button className={`tab-btn ${tab==="surveys"?"active":""}`} onClick={()=>setTab("surveys")}>Surveys</button><button className={`tab-btn ${tab==="feedback"?"active":""}`} onClick={()=>setTab("feedback")}>Feedback</button><button className={`tab-btn ${tab==="errors"?"active":""}`} onClick={()=>setTab("errors")}>Errors</button><button className={`tab-btn ${tab==="glossary"?"active":""}`} onClick={()=>setTab("glossary")}>Glossary</button></div></div>
    {tab==="users"&&<AdminUsersPage teams={teams}/>}{tab==="teams"&&<TeamManagementPage/>}{tab==="migrations"&&<AdminMigrationsPage/>}{tab==="audit"&&<AuditTrailPage/>}{tab==="surveys"&&<AdminSurveysPage/>}{tab==="feedback"&&<AdminFeedbackPage/>}{tab==="errors"&&<AdminErrorsPage/>}{tab==="glossary"&&<div className="page"><Glossary/></div>}</div>);
}
export default AdminPage;
