import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";
import AdminUsersPage from "./AdminUsersPage.jsx";
import TeamManagementPage from "./TeamManagementPage.jsx";
import AdminFeedbackPage from "./AdminFeedbackPage.jsx";

function AdminPage(){
  const{token}=useApp();
  const[tab,setTab]=useState("users");const[teams,setTeams]=useState([]);
  useEffect(()=>{sb.query("teams",{select:"id,name,domain",token}).then(setTeams).catch(()=>{});},[token]);
  return(<div><div className="page" style={{paddingBottom:0}}><div className="page-header" style={{marginBottom:16}}><div className="page-title">Admin panel</div></div>
    <div className="tab-bar" style={{marginBottom:0}}><button className={`tab-btn ${tab==="users"?"active":""}`} onClick={()=>setTab("users")}>Users</button><button className={`tab-btn ${tab==="teams"?"active":""}`} onClick={()=>setTab("teams")}>Teams</button><button className={`tab-btn ${tab==="feedback"?"active":""}`} onClick={()=>setTab("feedback")}>Feedback</button></div></div>
    {tab==="users"&&<AdminUsersPage teams={teams}/>}{tab==="teams"&&<TeamManagementPage/>}{tab==="feedback"&&<AdminFeedbackPage/>}</div>);
}
export default AdminPage;
