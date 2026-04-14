import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { hasRole, ROLE_LABELS, sortMonthsDesc } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity } from "../lib/utils.js";
import { useToast, useAutoRefresh, useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { ProgressRing, MiniBarChart, SparkLine, SkeletonLoader, PulseLoader } from "../components/Charts.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";

function DashboardPage(){
  const{profile,token,gf}=useApp();
  const[mtd,setMtd]=useState([]);const[roster,setRoster]=useState([]);const[loading,setLoading]=useState(true);const[appProfiles,setAppProfiles]=useState([]);
  const[damCount,setDamCount]=useState(0);const[profileCount,setProfileCount]=useState({qas:0,leads:0,active:0});
  const[todayAttendance,setTodayAttendance]=useState([]);
  const[apPlans,setApPlans]=useState([]);const[apWeeks,setApWeeks]=useState([]);const[apDetections,setApDetections]=useState([]);
  const[apDismissals,setApDismissals]=useState([]);const[dismissModal,setDismissModal]=useState(null);const[dismissReason,setDismissReason]=useState("");
  const[userTasks,setUserTasks]=useState([]);const[showTaskForm,setShowTaskForm]=useState(false);const[taskView,setTaskView]=useState("list");const[hideCompleted,setHideCompleted]=useState(true);
  const[taskForm,setTaskForm]=useState({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:""});
  const[editingTask,setEditingTask]=useState(null);const[postponeModal,setPostponeModal]=useState(null);const[postponeDate,setPostponeDate]=useState("");const[postponeReason,setPostponeReason]=useState("");const[selectedTask,setSelectedTask]=useState(null);
  const[taskTemplates,setTaskTemplates]=useState([]);const[showTemplateForm,setShowTemplateForm]=useState(false);const[showTemplates,setShowTemplates]=useState(false);
  const[tplForm,setTplForm]=useState({title:"",description:"",priority:"medium",frequency:"daily",assign_to_type:"my_team",assign_to_value:"",target_metric:"",target_value:""});
  const[attWarning,setAttWarning]=useState(null);
  const[dailyScores,setDailyScores]=useState([]);
  const[showAnnForm,setShowAnnForm]=useState(false);
  const[annForm,setAnnForm]=useState({title:"",message:"",priority:"normal",target_type:"all",target_value:""});
  const isLead=hasRole(profile?.role,"qa_lead");
  const isAdmin=hasRole(profile?.role,"admin");
  const isSupervisor=hasRole(profile?.role,"qa_supervisor");
  const canAnnounce=hasRole(profile?.role,"senior_qa");
  const{show,el:toastEl}=useToast();
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  const sendAnnouncement=async()=>{
    if(!annForm.title.trim()||!annForm.message.trim()){show("error","Title and message are required");return;}
    if(annForm.target_type!=="all"&&annForm.target_type!=="my_team"&&!annForm.target_value){show("error","Please select a target");return;}
    try{
      const targetValue = annForm.target_type==="all"?null:annForm.target_type==="my_team"?profile?.email:annForm.target_value;
      const result = await sb.query("announcements",{token,method:"POST",body:{
        title:annForm.title,message:annForm.message,priority:annForm.priority,
        target_type:annForm.target_type,target_value:targetValue,
        sent_by:profile?.email,requires_ack:true,
      }});
      logActivity(token,profile?.email,"announcement_sent","announcements",null,`Title: ${annForm.title}, Target: ${annForm.target_type}${targetValue?" ("+targetValue+")":""}`);
      setShowAnnForm(false);
      setAnnForm({title:"",message:"",priority:"normal",target_type:"my_team",target_value:""});
      show("success","Announcement sent successfully!");
    }catch(e){
      console.error("Announcement error:", e);
      show("error","Failed: " + (e.message || "Unknown error"));
    }
  };

  const nameFromEmail=(email)=>{if(!email)return"—";const local=email.split("@")[0];return local.split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};
  const fmt=(val)=>{if(val===null||val===undefined||val==="")return"—";const s=String(val).trim();if(s.includes("%"))return s;const n=parseFloat(s.replace(",","."));if(isNaN(n))return s;if(n>=0&&n<=2)return(n*100).toFixed(1)+"%";if(n>2&&!Number.isInteger(n))return n.toFixed(1)+"%";return String(val);};

  // Slab engine for dashboard
  const parseRawD=(val)=>{if(!val&&val!==0)return null;const s=String(val).trim().replace(",",".");if(s.includes("%"))return parseFloat(s.replace("%",""));const n=parseFloat(s);if(isNaN(n))return null;if(n>=0&&n<=2)return n*100;return n;};
  const KPI_SLABS_D={occupancy:{weight:15,thresholds:[95,98,100],rawKey:"occupancy_pct"},coaching:{weight:10,thresholds:[90,93,95],rawKey:"ontime_coaching_pct"},calibration:{weight:10,thresholds:[85,90,95],rawKey:"avg_calibration_match_rate"},observation:{weight:10,thresholds:[82,85,88],rawKey:"avg_observation_score_pct"},rtr:{weight:10,thresholds:[80,85,90],rawKey:"avg_rtr_score"}};
  const calcSlabD=(rawPct,th)=>{if(rawPct===null)return 0;if(rawPct>=th[2])return 100;if(rawPct>=th[1])return 75;if(rawPct>=th[0])return 50;return 0;};
  const getScore=(row)=>{return Object.values(KPI_SLABS_D).reduce((sum,def)=>{const raw=parseRawD(row[def.rawKey]);return sum+(def.weight*calcSlabD(raw,def.thresholds))/100;},0);};
  const maxScore=55;
  const scoreColor=(v)=>v>=maxScore*0.7?"var(--green)":v>=maxScore*0.4?"var(--amber)":"var(--red)";
  const scoreBg=(v)=>v>=maxScore*0.7?"var(--green-bg)":v>=maxScore*0.4?"var(--amber-bg)":"var(--red-bg)";

  const loadDashboard=useCallback(async()=>{try{
    const[mtdRows,rosterRows,profs]=await Promise.all([
      dataCache.fetch("mtd_scores",()=>sb.query("mtd_scores",{select:"*",filters:"order=month.desc",token}).catch(()=>[])),
      dataCache.fetch("qa_roster",()=>sb.query("qa_roster",{select:"*",token}).catch(()=>[])),
      dataCache.fetch("profiles",()=>sb.query("profiles",{select:"id,email,display_name,role,status",filters:"status=eq.active",token}).catch(()=>[])),
    ]);
    // Phase 1b: Secondary data (non-blocking for initial render)
    const[damFlagsRaw,plans,planWeeks,dismissals,damStepsRaw]=await Promise.all([
      sb.query("dam_flags",{select:"id,profile_id,qa_email,rule_id,occurrence_number,status,profiles!dam_flags_profile_id_fkey(email,display_name),dam_rules(name,behavior_type)",filters:"order=triggered_at.desc",token}).catch(()=>[]),
      dataCache.fetch("action_plans",()=>sb.query("action_plans",{select:"*",filters:"order=created_at.desc",token}).catch(()=>[])),
      dataCache.fetch("action_plan_weeks",()=>sb.query("action_plan_weeks",{select:"*",filters:"order=plan_id.asc,week_number.asc",token}).catch(()=>[])),
      sb.query("ap_dismissals",{select:"*",filters:"order=created_at.desc",token}).catch(()=>[]),
      dataCache.fetch("dam_escalation_steps",()=>sb.query("dam_escalation_steps",{select:"id,rule_id,occurrence,action,includes_pip,pip_action",token}).catch(()=>[])),
    ]);
    // Build blacklist for non-QA users (both domain variants)
    const nonQaProfsD = profs.filter(p => p.role !== "qa");
    const blacklistD = new Set();
    nonQaProfsD.forEach(p => {
      const em = p.email?.toLowerCase(); if (!em) return;
      blacklistD.add(em);
      const local = em.split("@")[0];
      if (em.endsWith("@tabby.ai")) blacklistD.add(local + "@tabby.sa");
      if (em.endsWith("@tabby.sa")) blacklistD.add(local + "@tabby.ai");
    });
    // Build valid QA lead set — ONLY qa_lead role profiles (not supervisors/admins)
    const qaLeadEmails = new Set();
    profs.filter(p => p.role === "qa_lead").forEach(p => {
      const em = p.email?.toLowerCase(); if (!em) return;
      qaLeadEmails.add(em);
      const local = em.split("@")[0];
      if (em.endsWith("@tabby.ai")) qaLeadEmails.add(local + "@tabby.sa");
      if (em.endsWith("@tabby.sa")) qaLeadEmails.add(local + "@tabby.ai");
      qaLeadEmails.add(local);
    });
    // Filter roster: exclude non-QA profiles AND only include entries managed by actual QA leads
    const filteredRoster = rosterRows.filter(r => {
      if (blacklistD.has(r.email?.toLowerCase())) return false;
      const mgr = r.manager_email?.toLowerCase();
      if (!mgr) return false;
      if (qaLeadEmails.has(mgr)) return true;
      const mgrLocal = mgr.split("@")[0];
      if (qaLeadEmails.has(mgrLocal)) return true;
      return false;
    });
    const filteredMtd = mtdRows.filter(r => {
      const em = r.qa_email?.toLowerCase();
      if (blacklistD.has(em)) return false;
      // Also filter by qa_tl: must be a known QA lead
      const tl = r.qa_tl?.toLowerCase();
      if (!tl) return true; // keep rows without TL for safety
      return qaLeadEmails.has(tl) || qaLeadEmails.has(tl.split("@")[0]);
    });
    // Normalize cross-domain: if a QA exists in roster as @tabby.ai, normalize their @tabby.sa MTD records to @tabby.ai (and vice versa)
    const rosterEmailSet = new Set(filteredRoster.map(r=>r.email?.toLowerCase()));
    const normalizedMtd = filteredMtd.map(r => {
      const em = r.qa_email?.toLowerCase();
      if (!em) return r;
      if (rosterEmailSet.has(em)) return r; // already matches roster
      const local = em.split("@")[0];
      const alt = em.endsWith("@tabby.ai") ? local+"@tabby.sa" : local+"@tabby.ai";
      if (rosterEmailSet.has(alt)) return {...r, qa_email: alt}; // normalize to roster email
      return r;
    });
    // Also normalize qa_tl field
    const normalizedMtd2 = normalizedMtd.map(r => {
      const tl = r.qa_tl?.toLowerCase();
      if (!tl) return r;
      const tlLocal = tl.split("@")[0];
      const tlAlt = tl.endsWith("@tabby.ai") ? tlLocal+"@tabby.sa" : tlLocal+"@tabby.ai";
      // If the TL is in profiles under the alt email, normalize
      const profEmails = new Set(profs.map(p=>p.email?.toLowerCase()));
      if (!profEmails.has(tl) && profEmails.has(tlAlt)) return {...r, qa_tl: tlAlt};
      return r;
    });
    setMtd(normalizedMtd2);setRoster(filteredRoster);setAppProfiles(profs);setDamCount(damFlagsRaw.filter(f=>f.status==="pending").length);
    setProfileCount({qas:filteredRoster.length,leads:[...new Set(filteredRoster.map(r=>r.manager_email).filter(Boolean))].length,active:profs.length});
    setApPlans(plans);setApWeeks(planWeeks);setApDismissals(dismissals);
    // Load today's attendance + daily scores + teams for task assignment
    try{const todayStr=new Date().toISOString().split("T")[0];
      const[att,ds,teamsData]=await Promise.all([
        sb.query("qa_attendance",{select:"email,status",filters:`date=eq.${todayStr}`,token}).catch(()=>[]),
        sb.query("daily_scores",{select:"*",filters:`date=eq.${todayStr}`,token}).catch(()=>[]),
        dataCache.fetch("teams_hierarchy",()=>sb.query("teams",{select:"name,domain,profiles!fk_teams_lead(email),sup:profiles!fk_teams_supervisor(email)",token}).catch(()=>[])),
      ]);
      setTodayAttendance(Array.isArray(att)?att:[]);
      setDailyScores(Array.isArray(ds)?ds:[]);
      // Store teams data for supervisor→lead mapping in task assignment
      window.__teamsData=(Array.isArray(teamsData)?teamsData:[]).map(tm=>({
        name:tm.name,domain:tm.domain,
        lead_email:tm.profiles?.email||null,
        supervisor_email:tm.sup?.email||null,
      }));
    }catch{}

    // Auto-detection for TL dashboard alert — DAM-driven
    if(hasRole(profile?.role,"qa_lead")){
      const dismissedEmails=new Set(dismissals.map(d=>d.qa_email?.toLowerCase()));
      const activePlanEmails=plans.filter(p=>p.status==="active"||p.status==="pending_review").map(p=>p.qa_email?.toLowerCase());
      const pEmail=profile?.email?.toLowerCase()||"";
      const pLocal=pEmail.split("@")[0];
      const pAlt=pEmail.endsWith("@tabby.ai")?pLocal+"@tabby.sa":pLocal+"@tabby.ai";
      const myTeam=rosterRows.filter(r=>{const m=r.manager_email?.toLowerCase();return m&&(m===pEmail||m===pAlt||m===pLocal);}).map(r=>r.email.toLowerCase());
      const mnths=sortMonthsDesc([...new Set(mtdRows.map(r=>r.month))]);
      const latestMtd=mtdRows.filter(r=>r.month===mnths[0]);
      const myTlRows=latestMtd.filter(r=>{const tl=r.qa_tl?.toLowerCase();return tl&&(tl===pEmail||tl===pAlt);}).map(r=>r.qa_email?.toLowerCase());
      const teamEmails=[...new Set([...myTeam,...myTlRows])];

      const activeFlags=(damFlagsRaw||[]).filter(f=>f.status==="pending"||f.status==="acknowledged");
      const flagged=[];
      activeFlags.forEach(flag=>{
        const email=flag.profiles?.email||flag.qa_email?.toLowerCase();
        if(!email)return;
        if(activePlanEmails.includes(email))return;
        if(dismissedEmails.has(email))return;
        if(teamEmails.length>0&&!teamEmails.includes(email))return;
        if(flagged.find(f=>f.email?.toLowerCase()===email))return;

        const step=(damStepsRaw||[]).find(s=>s.rule_id===flag.rule_id&&s.occurrence===flag.occurrence_number);
        if(!step||!step.includes_pip)return;

        const row=latestMtd.find(r=>r.qa_email?.toLowerCase()===email);
        const score=row?getScore(row):0;
        const ruleName=flag.dam_rules?.name||"Unknown";
        const pipAction=step.pip_action||step.action||"AP required";
        flagged.push({email:flag.profiles?.email||flag.qa_email||email,name:flag.profiles?.display_name||nameFromEmail(email),score,reason:`DAM: ${ruleName} — #${flag.occurrence_number}: ${pipAction}`,slab0Count:0,planType:step.includes_pip?"pip":"ap"});
      });
      flagged.sort((a,b)=>a.score-b.score);
      setApDetections(flagged);
    }
  }catch(e){console.error("Dashboard:",e);}setLoading(false);},[token]);
  useEffect(()=>{loadDashboard();},[loadDashboard]);
  useAutoRefresh(loadDashboard, 120000);

  // Load user tasks
  const loadTasks=useCallback(async()=>{try{
    const myEmail=profile?.email?.toLowerCase();
    const t=await sb.query("tasks",{select:"*",filters:"order=priority.asc,due_date.asc",token}).catch(()=>[]);
    // Show tasks created by me OR assigned to me
    const mine=t.filter(tk=>tk.created_by?.toLowerCase()===myEmail||tk.assigned_to?.toLowerCase()===myEmail);
    setUserTasks(mine);
    // Load templates too
    if(hasRole(profile?.role,"qa_lead")){
      const tpls=await sb.query("task_templates",{select:"*",filters:"order=created_at.desc",token}).catch(()=>[]);
      setTaskTemplates(Array.isArray(tpls)?tpls:[]);
    }
  }catch(e){console.error("Tasks:",e);}},[token,profile?.email]);
  useEffect(()=>{if(profile?.email)loadTasks();},[loadTasks,profile?.email]);

  // Auto-close tasks based on daily_scores data
  useEffect(()=>{
    if(!dailyScores.length||!userTasks.length)return;
    const todayStr=new Date().toISOString().split("T")[0];
    const pendingAutoTasks=userTasks.filter(t=>t.auto_close&&t.target_metric&&t.target_value&&t.status==="pending"&&t.due_date===todayStr);
    if(!pendingAutoTasks.length)return;
    (async()=>{
      let closed=0;
      for(const task of pendingAutoTasks){
        const assignee=(task.assigned_to||task.created_by||"").toLowerCase();
        // Find daily score — match both domain variants
        const local=assignee.split("@")[0];
        const ds=dailyScores.find(d=>{
          const em=d.qa_email?.toLowerCase();
          return em===assignee||em?.split("@")[0]===local;
        });
        if(!ds)continue;
        const actual=parseFloat(ds[task.target_metric])||0;
        const target=parseFloat(task.target_value)||0;
        if(actual>=target){
          // Auto-close this task
          try{
            await sb.query("tasks",{token,method:"PATCH",body:{status:"done",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()},filters:`id=eq.${task.id}`});
            closed++;
          }catch(e){console.error("Auto-close task:",e);}
        }
      }
      if(closed>0){
        loadTasks();
        show("success",`${closed} task${closed>1?"s":""} auto-completed from daily evaluations`);
      }
    })();
  },[dailyScores,userTasks.length]);

  // Create template
  const saveTemplate=async()=>{
    if(!tplForm.title.trim()){show("error","Template title is required");return;}
    try{
      const body={title:tplForm.title,description:tplForm.description||null,priority:tplForm.priority,frequency:tplForm.frequency,
        created_by:profile?.email,assign_to_type:tplForm.assign_to_type,assign_to_value:tplForm.assign_to_type==="specific_person"?tplForm.assign_to_value:null,
        target_metric:tplForm.target_metric||null,target_value:tplForm.target_value?Number(tplForm.target_value):null,is_active:true};
      await sb.query("task_templates",{token,method:"POST",body});
      show("success","Template created");setShowTemplateForm(false);
      setTplForm({title:"",description:"",priority:"medium",frequency:"daily",assign_to_type:"my_team",assign_to_value:"",target_metric:"",target_value:""});
      loadTasks();
    }catch(e){show("error",safeError(e));}
  };

  // Generate tasks from template
  const generateFromTemplate=async(tpl)=>{
    try{
      const myEmail=profile?.email?.toLowerCase();
      const leadProfs=appProfiles.filter(p=>p.role==="qa_lead").map(p=>p.email?.toLowerCase()).filter(Boolean);
      const leadSet=new Set(leadProfs);
      let assignees=[];
      if(tpl.assign_to_type==="specific_person"&&tpl.assign_to_value){
        assignees=[tpl.assign_to_value.toLowerCase()];
      }else if(tpl.assign_to_type==="my_team"){
        const myLocal=myEmail.split("@")[0];
        const myTeam=roster.filter(r=>{const mgr=r.manager_email?.toLowerCase()||"";return mgr===myEmail||mgr.split("@")[0]===myLocal;}).map(r=>r.email?.toLowerCase()).filter(Boolean);
        if(myTeam.length>0){
          assignees=myTeam;
        }else if(hasRole(profile?.role,"admin")){
          assignees=roster.filter(r=>leadSet.has(r.manager_email?.toLowerCase())).map(r=>r.email?.toLowerCase()).filter(Boolean);
        }
      }else if(tpl.assign_to_type==="my_leads"){
        // Supervisor: assign to QA leads they supervise
        const myLocal=myEmail.split("@")[0];
        const myLeads=new Set();
        (window.__teamsData||[]).forEach(tm=>{
          const sv=tm.supervisor_email?.toLowerCase()||"";
          if(sv===myEmail||sv.split("@")[0]===myLocal){if(tm.lead_email)myLeads.add(tm.lead_email.toLowerCase());}
        });
        assignees=[...myLeads];
      }else if(tpl.assign_to_type==="all_qa"){
        assignees=roster.filter(r=>leadSet.has(r.manager_email?.toLowerCase())).map(r=>r.email?.toLowerCase()).filter(Boolean);
      }
      if(assignees.length===0){show("error","No QAs found to assign. Make sure you have team members or select 'All QAs'.");return;}
      // Check attendance — skip QAs who are on leave/off today
      const today=new Date().toISOString().split("T")[0];
      const absentStatuses=new Set(["AL","Paid SL","ML","UL","NSNC","OFF","X"]);
      let todayAtt=[];
      try{todayAtt=await sb.query("qa_attendance",{select:"email,status",filters:`date=eq.${today}`,token}).catch(()=>[]);}catch{}
      const absentSet=new Set((Array.isArray(todayAtt)?todayAtt:[]).filter(a=>absentStatuses.has(a.status)).map(a=>a.email?.toLowerCase()));
      const available=assignees.filter(em=>!absentSet.has(em));
      const skipped=assignees.length-available.length;
      let created=0;
      for(const em of available){
        const body={title:tpl.title,description:tpl.description||null,priority:tpl.priority,created_by:profile?.email,assigned_to:em,
          due_date:today,status:"pending",template_id:tpl.id,target_metric:tpl.target_metric||null,target_value:tpl.target_value||null,
          auto_close:!!tpl.target_metric,updated_at:new Date().toISOString()};
        await sb.query("tasks",{token,method:"POST",body});
        created++;
      }
      await sb.query("task_templates",{token,method:"PATCH",body:{last_generated_at:new Date().toISOString()},filters:`id=eq.${tpl.id}`});
      show("success",`Created ${created} task${created!==1?"s":""}${skipped>0?` (${skipped} skipped — on leave/off)`:""}`);
      logActivity(token,profile?.email,"tasks_generated","task_templates",tpl.id,`Template: ${tpl.title}, Created: ${created}, Skipped: ${skipped}`);
      loadTasks();
    }catch(e){show("error",safeError(e));}
  };

  // Delete template
  const deleteTemplate=(id)=>{
    const tpl=taskTemplates.find(t=>t.id===id);
    confirmAsk("Delete template?",`Delete "${tpl?.title||"this template"}"? This won't delete tasks already generated from it.`,async()=>{
      try{await sb.query("task_templates",{token,method:"DELETE",filters:`id=eq.${id}`});show("success","Template deleted");loadTasks();}catch(e){show("error",safeError(e));}
    },"Delete","var(--red)");
  };

  // Delete all tasks I assigned to others (not myself)
  const deleteAllAssignedTasks=()=>{
    const myEmail=profile?.email?.toLowerCase();
    const assignedOut=userTasks.filter(t=>t.created_by?.toLowerCase()===myEmail&&t.assigned_to&&t.assigned_to?.toLowerCase()!==myEmail&&t.status!=="done");
    if(assignedOut.length===0){show("error","No assigned tasks to delete");return;}
    confirmAsk("Delete all assigned tasks?",`This will delete ${assignedOut.length} task${assignedOut.length!==1?"s":""} you assigned to other people. Tasks assigned to yourself will be kept.`,async()=>{
      try{
        let deleted=0;
        for(const t of assignedOut){
          await sb.query("tasks",{token,method:"DELETE",filters:`id=eq.${t.id}`});
          deleted++;
        }
        logActivity(token,profile?.email,"bulk_tasks_deleted","tasks",null,`Deleted ${deleted} assigned tasks`);
        show("success",`Deleted ${deleted} assigned task${deleted!==1?"s":""}`);
        loadTasks();
      }catch(e){show("error",safeError(e));}
    },"Delete all","var(--red)");
  };
  const toggleTemplate=async(tpl)=>{
    try{await sb.query("task_templates",{token,method:"PATCH",body:{is_active:!tpl.is_active,updated_at:new Date().toISOString()},filters:`id=eq.${tpl.id}`});loadTasks();}catch(e){show("error",safeError(e));}
  };

  const months=sortMonthsDesc([...new Set(mtd.map(r=>r.month))]);
  const latestMonth=months[0]||"—";
  const prevMonth=months[1]||null;

  const current=mtd.filter(r=>r.month===latestMonth);
  const previous=prevMonth?mtd.filter(r=>r.month===prevMonth):[];

  const myEmail=profile?.email?.toLowerCase();
  const myData=current.find(r=>r.qa_email?.toLowerCase()===myEmail);
  const myPrevData=previous.find(r=>r.qa_email?.toLowerCase()===myEmail);

  // Rank by calculated score
  const ranked=[...current].sort((a,b)=>getScore(b)-getScore(a));
  const myRank=ranked.findIndex(r=>r.qa_email?.toLowerCase()===myEmail)+1;

  const myRoster=roster.find(r=>r.email.toLowerCase()===myEmail);

  // Team members — match both domain variants of myEmail
  const myEmailLocal=myEmail?myEmail.split("@")[0]:"";
  const myEmailAlt=myEmail?(myEmail.endsWith("@tabby.ai")?myEmailLocal+"@tabby.sa":myEmailLocal+"@tabby.ai"):"";
  const myTeamEmails=roster.filter(r=>{
    const mgr=r.manager_email?.toLowerCase();
    return mgr&&(mgr===myEmail||mgr===myEmailAlt||mgr===myEmailLocal);
  }).map(r=>r.email.toLowerCase());
  const myTlEmails=current.filter(r=>{
    const tl=r.qa_tl?.toLowerCase();
    return tl&&(tl===myEmail||tl===myEmailAlt||tl===myEmailLocal);
  }).map(r=>r.qa_email?.toLowerCase());
  const allTeamEmails=[...new Set([...myTeamEmails,...myTlEmails])];
  const teamCurrent=current.filter(r=>allTeamEmails.includes(r.qa_email?.toLowerCase()));
  const teamPrevious=previous.filter(r=>allTeamEmails.includes(r.qa_email?.toLowerCase()));
  const teamSorted=[...teamCurrent].sort((a,b)=>getScore(b)-getScore(a));

  // Team averages using calculated scores
  const teamAvgScore=teamCurrent.length?(teamCurrent.reduce((a,r)=>a+getScore(r),0)/teamCurrent.length):0;
  const teamAvgScorePrev=teamPrevious.length?(teamPrevious.reduce((a,r)=>a+getScore(r),0)/teamPrevious.length):0;
  const teamTrend=teamPrevious.length?(teamAvgScore-teamAvgScorePrev).toFixed(1):null;
  const teamDsat=teamCurrent.reduce((a,r)=>a+(r.dsat||0),0);

  // Performance trend sparkline using calculated scores
  const myHistory=months.slice(0,6).reverse().map(m=>{const row=mtd.find(r=>r.month===m&&r.qa_email?.toLowerCase()===myEmail);return{month:m,score:row?getScore(row):null};}).filter(d=>d.score!==null);

  const nav=(page)=>window.dispatchEvent(new CustomEvent("navigate",{detail:page}));

  // Task CRUD — optimistic updates
  const saveTask=async(forceAssign)=>{
    if(!taskForm.title.trim()){show("error","Task title is required");return;}
    // Check if assignee is off/on leave today (skip if force)
    if(taskForm.assigned_to&&!editingTask&&!forceAssign){
      try{
        const todayStr=new Date().toISOString().split("T")[0];
        const absentStatuses=new Set(["AL","Paid SL","ML","UL","NSNC","OFF","X"]);
        const attCheck=await sb.query("qa_attendance",{select:"status",filters:`email=eq.${taskForm.assigned_to.toLowerCase()}&date=eq.${todayStr}`,token}).catch(()=>[]);
        const att=Array.isArray(attCheck)&&attCheck.length>0?attCheck[0]:null;
        if(att&&absentStatuses.has(att.status)){
          const statusLabel=ATTENDANCE_TYPES?.find(t=>t.code===att.status)?.label||att.status;
          setAttWarning({name:nameFromEmail(taskForm.assigned_to),status:statusLabel});
          return;
        }
      }catch{}
    }
    try{
      const body={title:taskForm.title,description:taskForm.description||null,priority:taskForm.priority,due_date:taskForm.due_date||null,eta_date:taskForm.eta_date||null,created_by:profile?.email,assigned_to:taskForm.assigned_to||null,updated_at:new Date().toISOString()};
      if(editingTask){
        await sb.query("tasks",{token,method:"PATCH",body,filters:`id=eq.${editingTask.id}`});
        setUserTasks(prev=>prev.map(t=>t.id===editingTask.id?{...t,...body}:t));
        logActivity(token,profile?.email,"task_updated","tasks",editingTask.id,`Title: ${taskForm.title}`);
        show("success","Task updated");
      }else{
        const result = await sb.query("tasks",{token,method:"POST",body});
        const created = Array.isArray(result) ? result[0] : result;
        if(created?.id) {
          setUserTasks(prev=>[created,...prev]);
        } else {
          // Fallback: build task locally with temp id
          setUserTasks(prev=>[{...body, id:"temp-"+Date.now(), status:"pending", created_at:new Date().toISOString()}, ...prev]);
        }
        logActivity(token,profile?.email,"task_created","tasks",null,`Title: ${taskForm.title}${taskForm.assigned_to?", Assigned to: "+taskForm.assigned_to:""}`);
        show("success",taskForm.assigned_to?`Task created and assigned to ${nameFromEmail(taskForm.assigned_to)}`:"Task created");
      }
      setShowTaskForm(false);setEditingTask(null);setTaskForm({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:""});
    }catch(e){show("error",safeError(e));}
  };
  const toggleTaskDone=async(task)=>{
    const newStatus=task.status==="done"?"pending":"done";
    setUserTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:newStatus,completed_at:newStatus==="done"?new Date().toISOString():null}:t));
    try{
      await sb.query("tasks",{token,method:"PATCH",body:{status:newStatus,completed_at:newStatus==="done"?new Date().toISOString():null,updated_at:new Date().toISOString()},filters:`id=eq.${task.id}`});
      logActivity(token,profile?.email,newStatus==="done"?"task_completed":"task_reopened","tasks",task.id,`Title: ${task.title}`);
    }catch(e){show("error",safeError(e));setUserTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:task.status}:t));}
  };
  const postponeTask=async()=>{
    if(!postponeDate){show("error","Select a new date");return;}
    try{
      await sb.query("tasks",{token,method:"PATCH",body:{status:"postponed",postponed_to:postponeDate,postpone_reason:postponeReason||null,due_date:postponeDate,updated_at:new Date().toISOString()},filters:`id=eq.${postponeModal.id}`});
      setUserTasks(prev=>prev.map(t=>t.id===postponeModal.id?{...t,status:"postponed",eta_date:postponeDate}:t));
      logActivity(token,profile?.email,"task_postponed","tasks",postponeModal.id,`Title: ${postponeModal.title}, New date: ${postponeDate}`);
      show("success","Task postponed");setPostponeModal(null);setPostponeDate("");setPostponeReason("");
    }catch(e){show("error",safeError(e));}
  };
  const deleteTask=(task)=>{
    confirmAsk("Delete task?",`Are you sure you want to delete "${task.title}"?`,async()=>{
      setUserTasks(prev=>prev.filter(t=>t.id!==task.id));
      try{
        await sb.query("tasks",{token,method:"DELETE",filters:`id=eq.${task.id}`});
        logActivity(token,profile?.email,"task_deleted","tasks",task.id,`Title: ${task.title}`);
        show("success","Task deleted");
      }catch(e){show("error",safeError(e));loadTasks();}
    },"Delete","var(--red)");
  };
  const priorityConfig={urgent:{label:"Urgent",color:"var(--red)",bg:"var(--red-bg)"},high:{label:"High",color:"var(--amber)",bg:"var(--amber-bg)"},medium:{label:"Medium",color:"var(--tabby-purple)",bg:"var(--primary-light)"},low:{label:"Low",color:"var(--tx3)",bg:"var(--bg2)"}};
  const activeTasks=userTasks.filter(t=>t.status!=="done");
  const doneTasks=userTasks.filter(t=>t.status==="done");

  const[syncing,setSyncing]=useState(false);

  return(<div className="page">
    {/* Admin/Supervisor action bar */}
    {(hasRole(profile?.role,"super_admin")||canAnnounce)&&<div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:8}}>
      {canAnnounce&&<button className="btn btn-outline btn-sm" onClick={()=>setShowAnnForm(!showAnnForm)} style={{fontSize:12}}>
        <Icon d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" size={14}/>Send announcement
      </button>}
      {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" disabled={syncing} onClick={async()=>{
        setSyncing(true);
        try{
          const r=await fetch("https://script.google.com/macros/s/AKfycbwpQjACvkSQBkbJok5L00-jXNMJm9x8b5-cdd4c5imZXeXCD5eHu8_zCsRNgWIegzvZ/exec",{method:"POST",mode:"no-cors"});
          show("success","Sync triggered — data will update in ~30 seconds");
          logActivity(token, profile?.email, "mtd_sync_triggered", "mtd_scores", null, "Manual sync from dashboard");
        }catch(e){
          show("error","Sync request failed: "+e.message);
        }
        setSyncing(false);
      }} style={{fontSize:12}}>
        {syncing?<><div className="spinner" style={{width:14,height:14,borderWidth:2,marginRight:6}}/>Syncing...</>:<><Icon d={icons.upload} size={14}/>Sync MTD data</>}
      </button>}
    </div>}

    {/* Announcement form */}
    {showAnnForm&&<div className="card" style={{marginBottom:16,borderLeft:"4px solid var(--tabby-purple,#6A2C79)"}}>
      <div className="card-header"><span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>📢</span>Send Announcement</span></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div className="form-group" style={{gridColumn:"1/-1"}}>
          <label className="form-label">Title *</label>
          <input className="form-input" value={annForm.title} onChange={e=>setAnnForm({...annForm,title:e.target.value})} placeholder="Announcement title..." autoFocus/>
        </div>
        <div className="form-group" style={{gridColumn:"1/-1"}}>
          <label className="form-label">Message *</label>
          <textarea className="form-input" rows={4} value={annForm.message} onChange={e=>setAnnForm({...annForm,message:e.target.value})} placeholder="Write your message here..." style={{resize:"vertical"}}/>
        </div>
        <div className="form-group">
          <label className="form-label">Priority</label>
          <SearchableSelect options={[{value:"normal",label:"ℹ️ Normal"},{value:"important",label:"⚠️ Important"},{value:"urgent",label:"🔴 Urgent"}]} value={annForm.priority} onChange={v=>setAnnForm({...annForm,priority:v})} placeholder="Normal"/>
        </div>
        <div className="form-group">
          <label className="form-label">Send to</label>
          <SearchableSelect options={[
            ...(hasRole(profile?.role,"qa_supervisor")?[{value:"all",label:"Everyone"},{value:"domain",label:"Specific domain"}]:[]),
            {value:"my_team",label:"My team"},
            {value:"team",label:"Specific team"},
            {value:"individual",label:"Individual person"},
          ]} value={annForm.target_type} onChange={v=>setAnnForm({...annForm,target_type:v,target_value:""})} placeholder="Select audience"/>
        </div>
        {annForm.target_type==="domain"&&<div className="form-group">
          <label className="form-label">Domain</label>
          <SearchableSelect options={[{value:"tabby.ai",label:"tabby.ai"},{value:"tabby.sa",label:"tabby.sa"}]} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select domain"/>
        </div>}
        {annForm.target_type==="team"&&<div className="form-group">
          <label className="form-label">Team</label>
          <SearchableSelect options={[...new Set(roster.map(r=>r.queue).filter(Boolean))].sort()} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select team"/>
        </div>}
        {annForm.target_type==="individual"&&<div className="form-group">
          <label className="form-label">Person</label>
          <SearchableSelect options={roster.map(r=>({value:r.email,label:r.email+` (${nameFromEmail(r.email)})`}))} value={annForm.target_value} onChange={v=>setAnnForm({...annForm,target_value:v})} placeholder="Select person"/>
        </div>}
      </div>
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button className="btn btn-primary" onClick={sendAnnouncement}>Send announcement</button>
        <button className="btn btn-outline" onClick={()=>setShowAnnForm(false)}>Cancel</button>
      </div>
    </div>}
    <div className="welcome-banner">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:48,height:48,borderRadius:"50%",overflow:"hidden",flexShrink:0,border:"2px solid rgba(255,255,255,.2)"}}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{width:48,height:48,objectFit:"cover"}}/> :
            <div style={{width:48,height:48,background:"linear-gradient(135deg, var(--tabby-purple), var(--tabby-purple-light))",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700}}>{(profile?.display_name||"U").split(" ").map(p=>p[0]).join("").slice(0,2).toUpperCase()}</div>}
          </div>
          <div>
            <h2>Welcome back, {profile?.display_name?.split(" ")[0]||"there"}</h2>
            <p>{isLead?"Here's your team overview for "+latestMonth+".":"Here's your performance overview for "+latestMonth+"."}</p>
            <div className="welcome-role">{ROLE_LABELS[profile?.role]||"QA"} &middot; {profile?.domain}{myRoster?" · "+myRoster.queue:""}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",position:"relative",zIndex:1}}>
          <button onClick={()=>nav("leaderboard")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor="rgba(59,255,157,.3)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
          >Leaderboard →</button>
          <button onClick={()=>nav("profile")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(59,255,157,.25)",background:"rgba(59,255,157,.08)",color:"#3BFF9D",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(59,255,157,.16)";e.currentTarget.style.borderColor="rgba(59,255,157,.4)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(59,255,157,.08)";e.currentTarget.style.borderColor="rgba(59,255,157,.25)";}}
          >{isLead?"Team Profiles →":"My Profile →"}</button>
          {isLead&&<button onClick={()=>nav("scores")} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",transition:"all .2s",backdropFilter:"blur(4px)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor="rgba(59,255,157,.3)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.12)";}}
          >Performance →</button>}
        </div>
      </div>
    </div>
    {loading?<PulseLoader/>:<>

    {/* ── User Task Management ── */}
    <div className="card" style={{marginBottom:20}}>
      <div className="card-header">
        <span className="card-title" style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,var(--tabby-purple),#8B5CF6)",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
          My Tasks
          {activeTasks.length>0&&<span style={{fontSize:12,padding:"3px 10px",borderRadius:10,background:"var(--primary-light)",color:"var(--tabby-purple,var(--primary-text))",fontWeight:700}}>{activeTasks.length}</span>}
          {(()=>{const td=new Date();td.setHours(0,0,0,0);const todayLocal=td.getFullYear()+"-"+String(td.getMonth()+1).padStart(2,"0")+"-"+String(td.getDate()).padStart(2,"0");const cnt=activeTasks.filter(t=>{const eta=t.eta_date||t.due_date;return eta&&eta<todayLocal;}).length;return cnt>0?<span style={{fontSize:10,padding:"3px 10px",borderRadius:10,background:"var(--red-bg)",color:"var(--red)",fontWeight:700,display:"flex",alignItems:"center",gap:3}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 8v4m0 4h.01"/></svg>{cnt} overdue</span>:null;})()}
        </span>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{display:"flex",borderRadius:8,border:"1px solid var(--bd)",overflow:"hidden"}}>
            <button onClick={()=>setTaskView("calendar")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:taskView==="calendar"?"var(--tabby-purple)":"transparent",color:taskView==="calendar"?"#fff":"var(--tx3)"}}>Calendar</button>
            <button onClick={()=>setTaskView("list")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:taskView==="list"?"var(--tabby-purple)":"transparent",color:taskView==="list"?"#fff":"var(--tx3)"}}>List</button>
            {hasRole(profile?.role,"qa_lead")&&<button onClick={()=>setTaskView("templates")} style={{padding:"4px 10px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"var(--font)",background:taskView==="templates"?"var(--tabby-purple)":"transparent",color:taskView==="templates"?"#fff":"var(--tx3)"}}>Recurring{taskTemplates.length>0?` (${taskTemplates.length})`:""}</button>}
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>{setShowTaskForm(true);setEditingTask(null);setTaskForm({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:""});}}>
            <Icon d={icons.plus} size={14}/>New task
          </button>
        </div>
      </div>

      {/* Task form */}
      {showTaskForm&&<div style={{marginBottom:16,padding:16,background:"var(--bg)",borderRadius:10,border:"1px solid var(--bd2)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
          <div className="form-group"><label className="form-label">Title *</label><input className="form-input" value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} placeholder="What needs to be done?" autoFocus/></div>
          <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})} placeholder="Add details..." style={{resize:"vertical"}}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <SearchableSelect options={[{value:"urgent",label:"🔴 Urgent"},{value:"high",label:"🟠 High"},{value:"medium",label:"🟣 Medium"},{value:"low",label:"⚪ Low"}]} value={taskForm.priority} onChange={v=>setTaskForm({...taskForm,priority:v})} placeholder="Medium"/>
            </div>
            <div className="form-group"><label className="form-label">ETA</label><input type="date" className="form-input" value={taskForm.eta_date} onChange={e=>setTaskForm({...taskForm,eta_date:e.target.value})}/></div>
          </div>
          {(hasRole(profile?.role,"qa_lead"))&&<div className="form-group">
            <label className="form-label">Assign to</label>
            <SearchableSelect options={(()=>{
              const seen=new Set();const opts=[];
              const myEm=profile?.email?.toLowerCase()||"";
              const myRole=profile?.role;
              const myLocal=myEm.split("@")[0];
              // Build supervisor → leads mapping from teams table
              // QA Lead: only their team members from roster
              if(myRole==="qa_lead"){
                roster.forEach(r=>{
                  const em=r.email?.toLowerCase();if(!em||seen.has(em))return;
                  const mgr=r.manager_email?.toLowerCase()||"";
                  if(mgr===myEm||mgr===myLocal||mgr.split("@")[0]===myLocal){
                    seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});
                  }
                });
              }
              // QA Supervisor: their leads (from teams where supervisor = me) + those leads' QAs
              else if(myRole==="qa_supervisor"){
                // Find leads I supervise
                const myLeadEmails=new Set();
                const allTeams=window.__teamsData||[];
                allTeams.forEach(tm=>{
                  const svEm=tm.supervisor_email?.toLowerCase()||"";
                  if(svEm===myEm||svEm.split("@")[0]===myLocal){
                    if(tm.lead_email)myLeadEmails.add(tm.lead_email.toLowerCase());
                  }
                });
                // Add leads themselves
                myLeadEmails.forEach(leadEm=>{
                  if(!seen.has(leadEm)){
                    seen.add(leadEm);
                    const p=appProfiles.find(x=>x.email?.toLowerCase()===leadEm);
                    opts.push({value:leadEm,label:`${p?.display_name||nameFromEmail(leadEm)} — QA Lead`});
                  }
                });
                // Add QAs managed by those leads
                roster.forEach(r=>{
                  const em=r.email?.toLowerCase();if(!em||seen.has(em))return;
                  const mgr=r.manager_email?.toLowerCase()||"";
                  if(myLeadEmails.has(mgr)||myLeadEmails.has(mgr.split("@")[0])){
                    seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});
                  }
                });
              }
              // Admin/Super Admin: everyone (with Amanda exception for Imad)
              else if(hasRole(myRole,"admin")){
                const isAmanda=myEm==="amanda.souza@tabby.ai";
                appProfiles.forEach(p=>{
                  const em=p.email?.toLowerCase();if(!em||seen.has(em))return;
                  if(em===myEm)return; // Don't assign to yourself
                  if(isAmanda&&em==="imad.moussa@tabby.ai")return; // Amanda can't assign to Imad
                  seen.add(em);
                  opts.push({value:em,label:`${p.display_name||nameFromEmail(em)} — ${ROLE_LABELS[p.role]||p.role}`});
                });
                // Also add roster members not in profiles
                roster.forEach(r=>{
                  const em=r.email?.toLowerCase();if(!em||seen.has(em))return;
                  if(isAmanda&&em==="imad.moussa@tabby.ai")return;
                  seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});
                });
              }
              return opts.sort((a,b)=>a.label.localeCompare(b.label));
            })()}
              value={taskForm.assigned_to} onChange={v=>setTaskForm({...taskForm,assigned_to:v})} placeholder="Assign to someone..."/>
          </div>}
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button className="btn btn-primary btn-sm" onClick={()=>saveTask(false)}>{editingTask?"Update":"Create"}</button>
          <button className="btn btn-outline btn-sm" onClick={()=>{setShowTaskForm(false);setEditingTask(null);}}>Cancel</button>
        </div>
      </div>}

      {/* ── CALENDAR VIEW ── */}
      {taskView==="calendar"&&(()=>{
        const allTasks = hideCompleted ? activeTasks : userTasks;
        const today = new Date(); today.setHours(0,0,0,0);
        const todayStr = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
        const fmtDate = (d) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");

        // Build 5 base days
        const baseDays = [];
        for(let i=0;i<5;i++){
          const d=new Date(today);d.setDate(d.getDate()+i);
          const dateStr=fmtDate(d);
          const dayTasks=allTasks.filter(t=>(t.eta_date||t.due_date)===dateStr);
          baseDays.push({date:d,dateStr,tasks:dayTasks,isToday:i===0});
        }

        // Find urgent/high tasks beyond 5 days (up to 30 days out)
        const extraDays = [];
        for(let i=5;i<30;i++){
          const d=new Date(today);d.setDate(d.getDate()+i);
          const dateStr=fmtDate(d);
          const dayTasks=allTasks.filter(t=>(t.eta_date||t.due_date)===dateStr);
          const hasUrgent=dayTasks.some(t=>t.priority==="urgent"||t.priority==="high");
          if(hasUrgent) extraDays.push({date:d,dateStr,tasks:dayTasks,isToday:false,isExtra:true});
        }

        const noDateTasks=allTasks.filter(t=>!t.eta_date&&!t.due_date);
        const overdueTasks=activeTasks.filter(t=>{const eta=t.eta_date||t.due_date;return eta&&eta<todayStr;});
        const renderMini=(task)=>{const pc=priorityConfig[task.priority]||priorityConfig.medium;const isDone=task.status==="done";const isOverdue=!isDone&&task.eta_date&&task.eta_date<todayStr;return <div key={task.id} onClick={()=>setSelectedTask(task)} style={{padding:"10px 14px",borderRadius:10,background:isDone?"transparent":isOverdue?"rgba(239,68,68,.06)":"var(--bg3)",border:`1px solid ${isDone?"var(--bd)":isOverdue?"rgba(239,68,68,.15)":"var(--bd2)"}`,borderLeft:`4px solid ${isDone?"var(--green)":pc.color}`,marginBottom:6,display:"flex",alignItems:"center",gap:10,opacity:isDone?.45:1,cursor:"pointer",transition:"all .15s ease"}}>
          <button onClick={(e)=>{e.stopPropagation();toggleTaskDone(task);}} style={{width:22,height:22,borderRadius:7,border:`2px solid ${isDone?"var(--green)":pc.color}`,background:isDone?"var(--green)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,padding:0,transition:"all .15s ease"}}>
            {isDone&&<svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>}
          </button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,textDecoration:isDone?"line-through":"none",color:isDone?"var(--tx3)":"var(--tx)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{task.title}</div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:3,flexWrap:"wrap"}}>
              {task.assigned_to&&task.created_by?.toLowerCase()===myEmail&&<span style={{fontSize:10,color:"var(--accent-text)",fontWeight:500,display:"flex",alignItems:"center",gap:3}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>{nameFromEmail(task.assigned_to)}</span>}
              {isOverdue&&task.eta_date&&<span style={{fontSize:10,color:"var(--red)",fontWeight:600}}>{Math.ceil((new Date(todayStr)-new Date(task.eta_date))/(1000*60*60*24))}d overdue</span>}
              {!isOverdue&&task.eta_date&&<span style={{fontSize:10,color:"var(--tx3)"}}>{new Date(task.eta_date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>}
              <span style={{fontSize:9,padding:"1px 6px",borderRadius:6,background:pc.bg,color:pc.color,fontWeight:700,textTransform:"uppercase",letterSpacing:".3px"}}>{pc.label}</span>
            </div>
          </div>
        </div>;};
        return <div>
          {overdueTasks.length>0&&<div style={{marginBottom:16,padding:14,borderRadius:12,background:"rgba(239,68,68,.04)",border:"1px solid rgba(239,68,68,.12)"}}><div style={{fontSize:12,fontWeight:700,color:"var(--red)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:8,background:"rgba(239,68,68,.12)",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" size={16}/></div>Overdue <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"var(--red)",color:"#fff",fontWeight:700}}>{overdueTasks.length}</span></div>{overdueTasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderMini)}</div>}

          {/* 5-day strip */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
            {baseDays.map(day=><div key={day.dateStr} style={{minHeight:100,padding:10,borderRadius:12,background:day.isToday?"var(--primary-light)":"var(--bg)",border:day.isToday?"2px solid var(--tabby-purple)":"1px solid var(--bd2)",position:"relative",overflow:"hidden"}}>
              {day.isToday&&<div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"var(--tabby-purple)",borderRadius:"12px 12px 0 0"}}/>}
              <div style={{marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color:day.isToday?"var(--tabby-purple,var(--primary-text))":"var(--tx3)",textTransform:"uppercase",letterSpacing:".8px",fontWeight:700}}>{day.date.toLocaleDateString("en-GB",{weekday:"short"})}</div>
                  <div style={{fontSize:14,fontWeight:day.isToday?800:600,color:day.isToday?"var(--tabby-purple,var(--primary-text))":"var(--tx2)",lineHeight:1.2}}>{day.date.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</div>
                </div>
                {day.tasks.length>0&&<span style={{fontSize:10,width:20,height:20,borderRadius:6,background:day.isToday?"var(--tabby-purple)":"var(--bg3)",color:day.isToday?"#fff":"var(--tx3)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{day.tasks.length}</span>}
              </div>
              {day.tasks.length===0&&<div style={{fontSize:11,color:"var(--tx3)",opacity:.4,textAlign:"center",paddingTop:8}}>—</div>}
              {day.tasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(t=>{const pc=priorityConfig[t.priority]||priorityConfig.medium;const isDone=t.status==="done";return <div key={t.id} onClick={()=>setSelectedTask(t)} style={{padding:"5px 8px",borderRadius:7,marginBottom:4,cursor:"pointer",background:isDone?"transparent":pc.bg,borderLeft:`3px solid ${isDone?"var(--green)":pc.color}`,fontSize:11,fontWeight:600,color:isDone?"var(--tx3)":"var(--tx)",textDecoration:isDone?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",opacity:isDone?.4:1,transition:"all .15s ease"}}>{t.title}</div>;})}
            </div>)}
          </div>

          {/* Extra days with urgent tasks */}
          {extraDays.length>0&&<div style={{marginTop:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={14}/>Upcoming urgent ({extraDays.reduce((a,d)=>a+d.tasks.filter(t=>t.priority==="urgent"||t.priority==="high").length,0)})
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
              {extraDays.map(day=><div key={day.dateStr} style={{padding:8,borderRadius:10,background:"var(--bg)",border:"1px solid var(--amber)",borderColor:"rgba(245,158,11,.3)"}}>
                <div style={{fontSize:11,fontWeight:600,color:"var(--tx2)",marginBottom:6}}>
                  {day.date.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
                </div>
                {day.tasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(t=>{const pc=priorityConfig[t.priority]||priorityConfig.medium;const isDone=t.status==="done";return <div key={t.id} onClick={()=>setSelectedTask(t)} style={{padding:"4px 8px",borderRadius:6,marginBottom:3,cursor:"pointer",background:isDone?"transparent":pc.bg,borderLeft:`3px solid ${isDone?"var(--green)":pc.color}`,fontSize:11,fontWeight:500,color:isDone?"var(--tx3)":"var(--tx)",textDecoration:isDone?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",opacity:isDone?.5:1}}>{t.title}</div>;})}
              </div>)}
            </div>
          </div>}

          {noDateTasks.length>0&&<div style={{marginTop:16,padding:14,borderRadius:12,background:"var(--bg)",border:"1px dashed var(--bd2)"}}><div style={{fontSize:12,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:8,background:"var(--bg3)",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={14}/></div>No date set <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"var(--bg3)",color:"var(--tx3)",fontWeight:700}}>{noDateTasks.length}</span></div>{noDateTasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderMini)}</div>}
          {doneTasks.length>0&&<div style={{marginTop:12}}><button onClick={()=>setHideCompleted(!hideCompleted)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--tx3)",fontWeight:500,fontFamily:"var(--font)",padding:0}}>{hideCompleted?"Show":"Hide"} {doneTasks.length} completed</button></div>}
        </div>;
      })()}

      {/* ── LIST VIEW ── */}
      {taskView==="list"&&<>
      {activeTasks.length===0&&!showTaskForm?<div style={{textAlign:"center",padding:"24px 0",color:"var(--tx3)",fontSize:13}}>No active tasks</div>:
        <div>
          {/* Group tasks: My tasks vs Assigned to others */}
          {(()=>{
            const myOwnTasks=activeTasks.filter(t=>!t.assigned_to||t.assigned_to?.toLowerCase()===myEmail);
            const assignedOut=activeTasks.filter(t=>t.assigned_to&&t.assigned_to?.toLowerCase()!==myEmail&&t.created_by?.toLowerCase()===myEmail);
            const assignedToMe=activeTasks.filter(t=>t.assigned_to?.toLowerCase()===myEmail&&t.created_by?.toLowerCase()!==myEmail);
            // Group assigned-out tasks by person
            const byPerson={};
            assignedOut.forEach(t=>{const to=t.assigned_to?.toLowerCase()||"";if(!byPerson[to])byPerson[to]=[];byPerson[to].push(t);});

            const renderTask=(task)=>{
              const pc=priorityConfig[task.priority]||priorityConfig.medium;const todayDate=new Date();todayDate.setHours(0,0,0,0);const etaDate=task.eta_date?new Date(task.eta_date+"T00:00:00"):null;const isOverdue=etaDate&&etaDate<todayDate&&task.status!=="done";
              return <div key={task.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,background:isOverdue?"rgba(239,68,68,.04)":"transparent",borderBottom:"1px solid var(--bd)"}}>
                <button onClick={()=>toggleTaskDone(task)} style={{width:22,height:22,borderRadius:6,border:`2px solid ${pc.color}`,background:task.status==="done"?pc.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
                  {task.status==="done"&&<svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>}
                </button>
                <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setSelectedTask(task)}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--tx)",marginBottom:2}}>{task.title}</div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:9,padding:"2px 6px",borderRadius:6,background:pc.bg,color:pc.color,fontWeight:700,textTransform:"uppercase"}}>{pc.label}</span>
                    {task.eta_date&&<span style={{fontSize:10,color:isOverdue?"var(--red)":"var(--tx3)"}}>{isOverdue?`${Math.ceil((new Date()-new Date(task.eta_date+"T00:00:00"))/(1000*60*60*24))}d overdue`:new Date(task.eta_date+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span>}
                    {task.template_id&&<span style={{fontSize:9,color:"var(--accent-text)"}}>auto</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:2,flexShrink:0}}>
                  <button onClick={()=>{setEditingTask(task);setTaskForm({title:task.title,description:task.description||"",priority:task.priority,due_date:"",eta_date:task.eta_date||"",assigned_to:task.assigned_to||""});setShowTaskForm(true);}} style={{background:"none",border:"none",cursor:"pointer",padding:5,borderRadius:6,color:"var(--tx3)"}} title="Edit"><Icon d={icons.edit} size={14}/></button>
                  <button onClick={()=>deleteTask(task)} style={{background:"none",border:"none",cursor:"pointer",padding:5,borderRadius:6,color:"var(--tx3)"}} title="Delete"><Icon d={icons.trash} size={14}/></button>
                </div>
              </div>;
            };

            return <>
              {/* Tasks assigned TO me by others */}
              {assignedToMe.length>0&&<div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".5px",padding:"0 14px",marginBottom:6}}>Assigned to me ({assignedToMe.length})</div>
                {assignedToMe.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderTask)}
              </div>}

              {/* My own tasks */}
              {myOwnTasks.length>0&&<div style={{marginBottom:16}}>
                {(assignedToMe.length>0||Object.keys(byPerson).length>0)&&<div style={{fontSize:11,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",padding:"0 14px",marginBottom:6}}>My tasks ({myOwnTasks.length})</div>}
                {myOwnTasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderTask)}
              </div>}

              {/* Tasks I assigned to others — grouped by person */}
              {Object.keys(byPerson).length>0&&<div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--accent-text)",textTransform:"uppercase",letterSpacing:".5px",padding:"0 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Assigned to team ({assignedOut.length})</span>
                  <button onClick={deleteAllAssignedTasks} style={{fontSize:10,color:"var(--red)",background:"none",border:"none",cursor:"pointer",fontWeight:600,fontFamily:"var(--font)",padding:"2px 6px",borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background="var(--red-bg)"} onMouseLeave={e=>e.currentTarget.style.background="none"}>Delete all assigned</button>
                </div>
                {Object.entries(byPerson).sort((a,b)=>a[0].localeCompare(b[0])).map(([person,tasks])=>(
                  <div key={person} style={{marginBottom:8}}>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--tx2)",padding:"6px 14px",background:"var(--bg)",display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:"var(--accent-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:"var(--accent-text)"}}>{nameFromEmail(person).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                      {nameFromEmail(person)} <span style={{fontSize:10,color:"var(--tx3)"}}>({tasks.length})</span>
                    </div>
                    {tasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderTask)}
                  </div>
                ))}
              </div>}
            </>;
          })()}
        </div>}
      </>}

      {/* Completed tasks — collapsed by default, only in list/calendar */}
      {taskView!=="templates"&&doneTasks.length>0&&<div style={{marginTop:12}}>
        <button onClick={()=>setHideCompleted(!hideCompleted)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--green)",fontWeight:600,fontFamily:"var(--font)",padding:"8px 14px",display:"flex",alignItems:"center",gap:6,width:"100%",borderRadius:8,background:hideCompleted?"transparent":"var(--bg)"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d={icons.check}/></svg>
          {doneTasks.length} completed task{doneTasks.length!==1?"s":""}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{marginLeft:"auto",transition:"transform .2s",transform:hideCompleted?"rotate(-90deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {!hideCompleted&&<div style={{marginTop:4}}>
          {doneTasks.map(task=><div key={task.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 14px",opacity:.5}}>
            <button onClick={()=>toggleTaskDone(task)} style={{width:18,height:18,borderRadius:5,border:"2px solid var(--green)",background:"var(--green)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
              <svg width="9" height="9" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
            <span style={{flex:1,fontSize:12,textDecoration:"line-through",color:"var(--tx3)"}}>{task.title}</span>
            {task.assigned_to&&task.assigned_to?.toLowerCase()!==myEmail&&<span style={{fontSize:10,color:"var(--tx3)"}}>{nameFromEmail(task.assigned_to)}</span>}
            <span style={{fontSize:10,color:"var(--tx3)"}}>{task.completed_at?new Date(task.completed_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):""}</span>
          </div>)}
        </div>}
      </div>}

      {/* ── Task Templates Section ── */}
      {taskView==="templates"&&hasRole(profile?.role,"qa_lead")&&<div style={{padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--tx)"}}>Recurring Tasks</div>
            <div style={{fontSize:12,color:"var(--tx3)",marginTop:2}}>Set up tasks that auto-assign to your team on a schedule</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowTemplateForm(true)}><Icon d={icons.plus} size={14}/>New template</button>
        </div>

        {showTemplateForm&&<div style={{padding:16,background:"var(--bg)",borderRadius:12,border:"1px solid var(--bd2)",marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:12,color:"var(--tx)"}}>Create new template</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div className="form-group"><label className="form-label">Title</label>
              <input className="form-input" placeholder="e.g. Complete 3 SBS evaluations" value={tplForm.title} onChange={e=>setTplForm({...tplForm,title:e.target.value})}/>
            </div>
            <div className="form-group"><label className="form-label">Frequency</label>
              <select className="select form-input" value={tplForm.frequency} onChange={e=>setTplForm({...tplForm,frequency:e.target.value})}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Priority</label>
              <select className="select form-input" value={tplForm.priority} onChange={e=>setTplForm({...tplForm,priority:e.target.value})}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Assign to</label>
              <select className="select form-input" value={tplForm.assign_to_type} onChange={e=>setTplForm({...tplForm,assign_to_type:e.target.value,assign_to_value:""})}>
                <option value="my_team">My team (QAs I manage)</option>
                <option value="specific_person">Specific person</option>
                {hasRole(profile?.role,"qa_supervisor")&&<option value="my_leads">My QA leads</option>}
                {hasRole(profile?.role,"qa_supervisor")&&<option value="all_qa">All QAs</option>}
                {hasRole(profile?.role,"admin")&&<option value="all_qa">All QAs</option>}
              </select>
            </div>
            {tplForm.assign_to_type==="specific_person"&&<div className="form-group"><label className="form-label">Person</label>
              <SearchableSelect options={(()=>{
                const seen=new Set();const opts=[];
                const myEm=profile?.email?.toLowerCase()||"";const myLocal=myEm.split("@")[0];const myRole=profile?.role;
                if(myRole==="qa_lead"){
                  roster.forEach(r=>{const em=r.email?.toLowerCase();if(!em||seen.has(em))return;const mgr=r.manager_email?.toLowerCase()||"";if(mgr===myEm||mgr.split("@")[0]===myLocal){seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});}});
                } else if(myRole==="qa_supervisor"){
                  const myLeads=new Set();(window.__teamsData||[]).forEach(tm=>{const sv=tm.supervisor_email?.toLowerCase()||"";if(sv===myEm||sv.split("@")[0]===myLocal){if(tm.lead_email)myLeads.add(tm.lead_email.toLowerCase());}});
                  myLeads.forEach(le=>{if(!seen.has(le)){seen.add(le);opts.push({value:le,label:`${nameFromEmail(le)} — QA Lead`});}});
                  roster.forEach(r=>{const em=r.email?.toLowerCase();if(!em||seen.has(em))return;const mgr=r.manager_email?.toLowerCase()||"";if(myLeads.has(mgr)||myLeads.has(mgr.split("@")[0])){seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});}});
                } else if(hasRole(myRole,"admin")){
                  const isAmanda=myEm==="amanda.souza@tabby.ai";
                  appProfiles.forEach(p=>{const em=p.email?.toLowerCase();if(!em||seen.has(em)||em===myEm)return;if(isAmanda&&em==="imad.moussa@tabby.ai")return;seen.add(em);opts.push({value:em,label:`${p.display_name||nameFromEmail(em)} — ${ROLE_LABELS[p.role]||p.role}`});});
                  roster.forEach(r=>{const em=r.email?.toLowerCase();if(!em||seen.has(em))return;if(isAmanda&&em==="imad.moussa@tabby.ai")return;seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});});
                }
                return opts.sort((a,b)=>a.label.localeCompare(b.label));
              })()}
                value={tplForm.assign_to_value} onChange={v=>setTplForm({...tplForm,assign_to_value:v})} placeholder="Select person..."/>
            </div>}
            <div className="form-group"><label className="form-label">Description (optional)</label>
              <input className="form-input" placeholder="Details about the task..." value={tplForm.description} onChange={e=>setTplForm({...tplForm,description:e.target.value})}/>
            </div>
            <div className="form-group"><label className="form-label">Target metric (optional)</label>
              <select className="select form-input" value={tplForm.target_metric} onChange={e=>setTplForm({...tplForm,target_metric:e.target.value})}>
                <option value="">None (manual close)</option>
                <option value="sbs">SBS evaluations</option>
                <option value="non_sbs">Non-SBS evaluations</option>
                <option value="coaching_sessions">Coaching sessions</option>
                <option value="side_task_minutes">Side task minutes</option>
                <option value="rtr_count">RTR count</option>
                <option value="calibration_count">Calibration count</option>
              </select>
            </div>
            {tplForm.target_metric&&<div className="form-group"><label className="form-label">Target value</label>
              <input className="form-input" type="number" min="1" placeholder="e.g. 3" value={tplForm.target_value} onChange={e=>setTplForm({...tplForm,target_value:e.target.value})}/>
            </div>}
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button className="btn btn-primary btn-sm" onClick={saveTemplate}>Create template</button>
            <button className="btn btn-outline btn-sm" onClick={()=>setShowTemplateForm(false)}>Cancel</button>
          </div>
        </div>}

        {taskTemplates.length > 0 ? <div style={{display:"grid",gap:12}}>
          {taskTemplates.map(tpl=>(
            <div key={tpl.id} style={{padding:16,background:"var(--bg)",borderRadius:12,border:"1px solid var(--bd2)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:15,fontWeight:700,color:tpl.is_active?"var(--tx)":"var(--tx3)",textDecoration:tpl.is_active?"none":"line-through"}}>{tpl.title}</span>
                    <span style={{fontSize:10,padding:"3px 8px",borderRadius:8,fontWeight:600,
                      background:tpl.frequency==="daily"?"var(--blue-bg)":tpl.frequency==="weekly"?"var(--accent-light)":"var(--green-bg)",
                      color:tpl.frequency==="daily"?"var(--blue)":tpl.frequency==="weekly"?"var(--accent-text)":"var(--green)"
                    }}>{tpl.frequency}</span>
                    {!tpl.is_active&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:8,fontWeight:600,background:"var(--red-bg)",color:"var(--red)"}}>Paused</span>}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:12,color:"var(--tx2)"}}>
                    <span style={{display:"flex",alignItems:"center",gap:4}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                      {tpl.assign_to_type==="my_team"?"My team":tpl.assign_to_type==="specific_person"?nameFromEmail(tpl.assign_to_value):"All QAs"}
                    </span>
                    {tpl.target_metric&&<span style={{display:"flex",alignItems:"center",gap:4,color:"var(--amber)"}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      {tpl.target_value}× {tpl.target_metric.replace(/_/g," ")}
                    </span>}
                    {tpl.description&&<span style={{color:"var(--tx3)"}}>{tpl.description}</span>}
                  </div>
                  {tpl.last_generated_at&&<div style={{fontSize:11,color:"var(--tx3)",marginTop:6}}>Last run: {new Date(tpl.last_generated_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button className="btn btn-primary btn-sm" style={{fontSize:11}} onClick={()=>generateFromTemplate(tpl)} title="Generate tasks now">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5,3 19,12 5,21"/></svg>
                    Run now
                  </button>
                  <button className="btn btn-outline btn-sm" style={{padding:"6px 8px"}} onClick={()=>toggleTemplate(tpl)} title={tpl.is_active?"Pause template":"Activate template"}>
                    {tpl.is_active?<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    :<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><polygon points="5,3 19,12 5,21"/></svg>}
                  </button>
                  <button className="btn btn-outline btn-sm" style={{padding:"6px 8px",color:"var(--red)"}} onClick={()=>deleteTemplate(tpl.id)} title="Delete template"><Icon d={icons.trash} size={14}/></button>
                </div>
              </div>
            </div>
          ))}
        </div> : !showTemplateForm&&<div style={{textAlign:"center",padding:"40px 20px",color:"var(--tx3)"}}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="1.5" style={{marginBottom:12,opacity:0.5}}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>No templates yet</div>
          <div style={{fontSize:12,marginBottom:16}}>Create a template to auto-generate recurring tasks for your team</div>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowTemplateForm(true)}><Icon d={icons.plus} size={14}/>Create your first template</button>
        </div>}
      </div>}

    </div>

    {/* ── Attendance warning modal ── */}
    {attWarning&&ReactDOM.createPortal(<div style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.55)",display:"flex",justifyContent:"center",alignItems:"center"}} onClick={()=>setAttWarning(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"0 25px 50px rgba(0,0,0,0.5)",width:"100%",maxWidth:400,padding:24,textAlign:"center",margin:16}}>
        <div style={{width:48,height:48,borderRadius:"50%",background:"var(--amber-bg)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        </div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8,color:"var(--tx)"}}>{attWarning.name}</div>
        <div style={{fontSize:13,color:"var(--tx2)",marginBottom:20}}>is marked as <span style={{fontWeight:700,color:"var(--amber)"}}>{attWarning.status}</span> today. Do you still want to assign this task?</div>
        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          <button className="btn btn-primary btn-sm" style={{padding:"8px 20px"}} onClick={()=>{setAttWarning(null);saveTask(true);}}>Assign anyway</button>
          <button className="btn btn-outline btn-sm" style={{padding:"8px 20px"}} onClick={()=>setAttWarning(null)}>Cancel</button>
        </div>
      </div>
    </div>,document.body)}

    {/* ── Task Detail Modal ── */}
    {selectedTask&&(()=>{
      const t=userTasks.find(x=>x.id===selectedTask.id)||selectedTask;
      const pc=priorityConfig[t.priority]||priorityConfig.medium;
      const isDone=t.status==="done";
      const isOverdue=(()=>{if(!t.eta_date||isDone)return false;const td=new Date();td.setHours(0,0,0,0);return new Date(t.eta_date+"T00:00:00")<td;})();
      return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20,overflowY:"auto"}} onClick={e=>{if(e.target===e.currentTarget)setSelectedTask(null);}}>
        <div className="card" style={{width:"100%",maxWidth:440,margin:20,maxHeight:"85vh",overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:10,padding:"2px 10px",borderRadius:8,background:pc.bg,color:pc.color,fontWeight:700,textTransform:"uppercase"}}>{pc.label}</span>
              {isDone&&<span style={{fontSize:10,padding:"2px 10px",borderRadius:8,background:"var(--green-bg)",color:"var(--green)",fontWeight:700}}>Completed</span>}
              {isOverdue&&<span style={{fontSize:10,padding:"2px 10px",borderRadius:8,background:"var(--red-bg)",color:"var(--red)",fontWeight:700}}>Overdue</span>}
            </div>
            <button onClick={()=>setSelectedTask(null)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--tx3)",fontSize:18,padding:0,lineHeight:1}}>×</button>
          </div>
          <div style={{fontSize:18,fontWeight:700,color:"var(--tx)",marginBottom:8,textDecoration:isDone?"line-through":"none"}}>{t.title}</div>
          {t.description&&<div style={{fontSize:13,color:"var(--tx2)",marginBottom:16,lineHeight:1.6,padding:"10px 14px",background:"var(--bg)",borderRadius:8}}>{t.description}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16,fontSize:13}}>
            {t.eta_date&&<div><span style={{color:"var(--tx3)",fontSize:11}}>ETA</span><div style={{fontWeight:500,color:isOverdue?"var(--red)":"var(--tx)"}}>{new Date(t.eta_date+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</div></div>}
            {t.assigned_to&&<div><span style={{color:"var(--tx3)",fontSize:11}}>Assigned to</span><div style={{fontWeight:500}}>{nameFromEmail(t.assigned_to)}</div></div>}
            {t.created_by&&<div><span style={{color:"var(--tx3)",fontSize:11}}>Created by</span><div style={{fontWeight:500}}>{nameFromEmail(t.created_by)}</div></div>}
            {t.created_at&&<div><span style={{color:"var(--tx3)",fontSize:11}}>Created</span><div style={{fontWeight:500}}>{new Date(t.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div></div>}
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className={`btn ${isDone?"btn-outline":"btn-primary"} btn-sm`} style={isDone?{}:{background:"var(--green)"}} onClick={()=>{toggleTaskDone(t);setSelectedTask(null);}}>
              {isDone?"Reopen task":"Mark as done"}
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>{setEditingTask(t);setTaskForm({title:t.title,description:t.description||"",priority:t.priority,due_date:"",eta_date:t.eta_date||"",assigned_to:t.assigned_to||""});setShowTaskForm(true);setSelectedTask(null);}}>
              <Icon d={icons.edit} size={14}/>Edit
            </button>
            <button className="btn btn-outline btn-sm" onClick={()=>{setPostponeModal(t);setSelectedTask(null);}}>
              <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" size={14}/>Postpone
            </button>
            <button className="btn btn-outline btn-sm" style={{color:"var(--red)",marginLeft:"auto"}} onClick={()=>{deleteTask(t);setSelectedTask(null);}}>
              <Icon d={icons.trash} size={14}/>Delete
            </button>
          </div>
        </div>
      </div>;
    })()}

    {/* ── Postpone Modal ── */}
    {postponeModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20,overflowY:"auto"}} onClick={e=>{if(e.target===e.currentTarget){setPostponeModal(null);setPostponeDate("");setPostponeReason("");}}}>
      <div className="card" style={{width:"100%",maxWidth:400,margin:20,maxHeight:"85vh",overflowY:"auto"}}>
        <div className="card-header"><span className="card-title">Postpone: {postponeModal.title}</span></div>
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">New due date *</label>
          <input type="date" className="form-input" value={postponeDate} onChange={e=>setPostponeDate(e.target.value)} min={new Date().toISOString().split("T")[0]}/>
        </div>
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Reason (optional)</label>
          <textarea className="form-input" rows={2} value={postponeReason} onChange={e=>setPostponeReason(e.target.value)} placeholder="Why is this being postponed?" style={{resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-primary" onClick={postponeTask} disabled={!postponeDate}>Postpone</button>
          <button className="btn btn-outline" onClick={()=>{setPostponeModal(null);setPostponeDate("");setPostponeReason("");}}>Cancel</button>
        </div>
      </div>
    </div>}

    {/* ── AP/PIP Detection Alerts for TLs ── */}
    {isLead&&apDetections.length>0&&<div className="card" style={{marginBottom:16,borderLeft:"4px solid var(--amber)"}}>
      <div className="card-header" style={{cursor:"pointer"}} onClick={()=>nav("plans")}>
        <span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>⚠️</span>
          {apDetections.length} QA{apDetections.length!==1?"s":""} flagged for Action Plan
        </span>
        <span style={{fontSize:12,fontWeight:600,color:"var(--amber)"}}>View all →</span>
      </div>
      {apDetections.slice(0,5).map(d=>(
        <div key={d.email} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--bd2)",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"var(--accent-light)",color:"var(--accent-text)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,flexShrink:0}}>{d.name.split(" ").map(p=>p[0]).join("").toUpperCase().slice(0,2)}</div>
            <div>
              <div style={{fontSize:13,fontWeight:500}}>{d.name}</div>
              <div style={{fontSize:11,color:"var(--tx3)"}}>{d.reason} · Score: <span style={{fontWeight:600,color:scoreColor(d.score)}}>{d.score.toFixed(1)}/55</span></div>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-primary btn-sm" style={{fontSize:11,padding:"3px 10px",background:d.planType==="pip"?"var(--red)":"",color:d.planType==="pip"?"#fff":""}} onClick={(e)=>{e.stopPropagation();nav("plans");}}>Create {(d.planType||"pip").toUpperCase()}</button>
            {hasRole(profile?.role,"super_admin") ?
              <button className="btn btn-outline btn-sm" style={{fontSize:11,padding:"3px 10px"}} onClick={async(e)=>{e.stopPropagation();try{await sb.query("ap_dismissals",{token,method:"POST",body:{qa_email:d.email,dismissed_by:profile?.email,reason:"Dismissed by super admin",month:months[0]||"",detection_info:d.reason}});setApDetections(prev=>prev.filter(x=>x.email!==d.email));}catch(err){console.error(err);}}}>Dismiss</button> :
              <button className="btn btn-outline btn-sm" style={{fontSize:11,padding:"3px 10px"}} onClick={(e)=>{e.stopPropagation();setDismissModal(d);}}>Dismiss</button>
            }
          </div>
        </div>
      ))}
      {apDetections.length>5&&<div style={{fontSize:12,color:"var(--tx3)",marginTop:8}}>+{apDetections.length-5} more — view all in AP/PIP page</div>}
    </div>}

    {/* ── Dismiss Modal ── */}
    {dismissModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20,overflowY:"auto"}} onClick={e=>{if(e.target===e.currentTarget){setDismissModal(null);setDismissReason("");}}}>
      <div className="card" style={{width:"100%",maxWidth:480,margin:20,maxHeight:"85vh",overflowY:"auto"}}>
        <div className="card-header"><span className="card-title">Dismiss AP Detection — {dismissModal.name}</span></div>
        <div style={{fontSize:13,color:"var(--tx2)",marginBottom:12}}>{dismissModal.reason} · Score: {dismissModal.score.toFixed(1)}/55</div>
        <div className="form-group">
          <label className="form-label">Reason for dismissal (required)</label>
          <textarea className="form-input" rows={3} value={dismissReason} onChange={e=>setDismissReason(e.target.value)} placeholder="Explain why this detection is being dismissed — this will be visible to your supervisor..." style={{resize:"vertical"}}/>
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button className="btn btn-primary" disabled={!dismissReason.trim()} onClick={async()=>{
            try{
              await sb.query("ap_dismissals",{token,method:"POST",body:{
                qa_email:dismissModal.email,
                dismissed_by:profile?.email,
                reason:dismissReason.trim(),
                month:months[0]||"",
                detection_info:dismissModal.reason+" · Score: "+dismissModal.score.toFixed(1),
              }});
              setApDetections(prev=>prev.filter(x=>x.email!==dismissModal.email));
              setApDismissals(prev=>[{qa_email:dismissModal.email,dismissed_by:profile?.email,reason:dismissReason.trim(),month:months[0],detection_info:dismissModal.reason,created_at:new Date().toISOString()},...prev]);
              setDismissModal(null);setDismissReason("");
            }catch(err){console.error(err);}
          }}>Confirm dismissal</button>
          <button className="btn btn-outline" onClick={()=>{setDismissModal(null);setDismissReason("");}}>Cancel</button>
        </div>
      </div>
    </div>}

    {/* ── Supervisor: Recent dismissals by TLs (exclude super admin auto-dismissals) ── */}
    {hasRole(profile?.role,"qa_supervisor")&&(()=>{
      const leadDismissals=apDismissals.filter(d=>d.reason!=="Dismissed by super admin");
      if(leadDismissals.length===0)return null;
      return <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <span className="card-title">Recent AP dismissals by leads</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"var(--tx3)"}}>{leadDismissals.length} total</span>
            {hasRole(profile?.role,"super_admin")&&<button className="btn btn-outline btn-sm" style={{color:"var(--red)",fontSize:10}} onClick={async()=>{
              confirmAsk("Clear dismissal records?","This will allow dismissed QAs to be re-detected.",async()=>{
              try{
                for(const d of apDismissals){await sb.query("ap_dismissals",{token,method:"DELETE",filters:`id=eq.${d.id}`});}
                setApDismissals([]);
              }catch(e){console.error(e);}
            },"Clear all","var(--red)");}}>Clear all</button>}
          </div>
        </div>
        {leadDismissals.slice(0,10).map((d,i)=>(
          <div key={i} style={{padding:"8px 0",borderBottom:"1px solid var(--bd2)",fontSize:13}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div>
                <span style={{fontWeight:600}}>{nameFromEmail(d.qa_email)}</span>
                <span style={{color:"var(--tx3)",marginLeft:8}}>dismissed by <span style={{fontWeight:500,color:"var(--tx2)"}}>{nameFromEmail(d.dismissed_by)}</span></span>
              </div>
              <span style={{fontSize:11,color:"var(--tx3)",whiteSpace:"nowrap"}}>{d.created_at?new Date(d.created_at).toLocaleDateString("en-GB",{month:"short",day:"numeric"}):"—"}</span>
            </div>
            <div style={{marginTop:4,padding:"6px 10px",background:"var(--bg)",borderRadius:6,fontSize:12,color:"var(--tx2)"}}>{d.reason}</div>
          </div>
        ))}
      </div>;
    })()}

    {/* ── QA Self-View: My Active Plan (visible only after first coaching meeting) ── */}
    {!isLead&&(()=>{
      const myPlan=apPlans.find(p=>(p.qa_email?.toLowerCase()===myEmail)&&(p.status==="active"||p.status==="pending_review"));
      if(!myPlan)return null;
      const myPlanWeeks=apWeeks.filter(w=>w.plan_id===myPlan.id).sort((a,b)=>a.week_number-b.week_number);
      const hasCoachingSession=myPlanWeeks.some(w=>w.coaching_session_id)||myPlanWeeks.some(w=>w.actual_data);
      if(!hasCoachingSession)return null; // Only show after first meeting/review
      const filledWeeks=myPlanWeeks.filter(w=>w.actual_data);
      const metWeeks=myPlanWeeks.filter(w=>w.met_targets===true);
      const totalW=myPlan.duration_weeks||myPlanWeeks.length;
      const elapsed=filledWeeks.length;
      const successRate=filledWeeks.length?(metWeeks.length/filledWeeks.length*100):0;
      const daysLeft=myPlan.end_date?Math.max(0,Math.ceil((new Date(myPlan.end_date)-Date.now())/(1000*60*60*24))):null;
      const targets=(() => { try { const p=JSON.parse(myPlan.targets||"[]"); return Array.isArray(p)?p:p.metrics||[]; } catch { return []; } })();
      const progressPct=totalW?(elapsed/totalW)*100:0;
      return <div className="card" style={{marginBottom:20,borderLeft:`4px solid ${myPlan.type==="pip"?"var(--red)":"var(--amber)"}`}}>
        <div className="card-header"><span className="card-title" style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{padding:"2px 10px",borderRadius:10,fontSize:11,fontWeight:700,background:myPlan.type==="pip"?"var(--red-bg)":"var(--amber-bg)",color:myPlan.type==="pip"?"var(--red)":"var(--amber)"}}>{myPlan.type.toUpperCase()}</span>
          My {myPlan.type==="pip"?"Performance Improvement Plan":"Action Plan"}
        </span>
        {daysLeft!==null&&<span style={{fontSize:13,fontWeight:600,color:daysLeft<=7?"var(--red)":"var(--tx2)"}}>{daysLeft} days remaining</span>}
        </div>
        {/* Progress bar */}
        <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
          <div style={{width:`${progressPct}%`,height:"100%",borderRadius:3,background:successRate>=60?"var(--green)":"var(--amber)",transition:"width .4s"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--tx3)",marginBottom:14}}>
          <span>Week {elapsed} of {totalW}</span>
          <span>{metWeeks.length}/{elapsed} weeks met targets ({successRate.toFixed(0)}%)</span>
        </div>
        {/* Weekly breakdown */}
        {myPlanWeeks.length>0&&<div className="table-wrap"><table style={{fontSize:12}}><thead><tr><th>Week</th>{targets.map(t=><th key={t.kpi_key} style={{textAlign:"center"}}>{t.label}</th>)}<th style={{textAlign:"center"}}>Met?</th></tr></thead><tbody>
          {myPlanWeeks.map(week=>{
            const td=(()=>{try{return JSON.parse(week.target_data||"{}");}catch{return{};}})();
            const ad=(()=>{try{return JSON.parse(week.actual_data||"{}");}catch{return{};}})();
            const hasA=week.actual_data&&Object.keys(ad).length>0;
            return <tr key={week.id} style={{background:hasA?(week.met_targets?"var(--green-bg)":"var(--red-bg)"):"transparent"}}>
              <td style={{fontWeight:600}}>W{week.week_number}</td>
              {targets.map(t=>{const target=td[t.kpi_key];const actual=ad?.[t.kpi_key];const met=actual!==null&&actual!==undefined&&target!==undefined&&actual>=target;return <td key={t.kpi_key} style={{textAlign:"center"}}>
                <div style={{fontSize:11,color:"var(--tx3)"}}>T: {target!==undefined?target+"%":"—"}</div>
                {hasA&&<div style={{fontSize:12,fontWeight:600,color:met?"var(--green)":"var(--red)"}}>A: {actual!==null&&actual!==undefined?actual.toFixed(1)+"%":"—"}</div>}
              </td>;})}
              <td style={{textAlign:"center"}}>{hasA?(week.met_targets?<span style={{color:"var(--green)",fontWeight:700}}>✅</span>:<span style={{color:"var(--red)",fontWeight:700}}>❌</span>):<span style={{color:"var(--tx3)"}}>—</span>}</td>
            </tr>;
          })}
        </tbody></table></div>}
        <div style={{marginTop:10,fontSize:11,color:"var(--tx3)"}}>Started {myPlan.start_date?new Date(myPlan.start_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"}):"—"} · Ends {myPlan.end_date?new Date(myPlan.end_date).toLocaleDateString("en-GB",{month:"short",day:"numeric",year:"numeric"}):"—"}</div>
      </div>;
    })()}

    {/* ── Lead+ team overview ── */}
    {isLead&&<>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">My team</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{allTeamEmails.length}</div>
            <div style={{width:40,height:40,borderRadius:12,background:"var(--primary-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👥</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Team avg score</div>
          <ProgressRing value={teamAvgScore} max={maxScore} size={56} stroke={5}
            color={scoreColor(teamAvgScore)}
            label={teamAvgScore.toFixed(1)}
            sublabel={`of ${maxScore} pts`}
          />
          {teamTrend&&<div style={{fontSize:12,marginTop:8,color:Number(teamTrend)>=0?"var(--green)":"var(--red)",fontWeight:600}}>{Number(teamTrend)>=0?"↑":"↓"} {Math.abs(teamTrend)} pts vs {prevMonth}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Team DSAT</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{teamDsat}</div>
            <MiniBarChart data={months.slice(0,4).reverse().map(m=>{
              const mData=mtd.filter(r=>r.month===m&&allTeamEmails.includes(r.qa_email?.toLowerCase()));
              return {label:m.slice(0,3),value:mData.reduce((a,r)=>a+(r.dsat||0),0)};
            })} height={36} color="var(--red)" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending DAM flags</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value" style={{color:damCount>0?"var(--amber)":"var(--tx)"}}>{damCount}</div>
            {damCount>0&&<button className="btn btn-outline btn-sm" onClick={()=>nav("dam")} style={{fontSize:11}}>Review →</button>}
          </div>
        </div>
      </div>

      {/* Today's live activity */}
      {dailyScores.length>0&&<div className="card" style={{marginBottom:16}}>
        <div className="card-header"><span className="card-title">Today's activity</span><span style={{fontSize:11,color:"var(--tx3)"}}>{dailyScores.length} active · {new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,padding:"12px 16px"}}>
          {(()=>{
            const teamDs=dailyScores.filter(d=>allTeamEmails.includes(d.qa_email?.toLowerCase()));
            const totSbs=teamDs.reduce((a,d)=>a+(d.sbs||0),0);
            const totNon=teamDs.reduce((a,d)=>a+(d.non_sbs||0),0);
            const totCoach=teamDs.reduce((a,d)=>a+(d.coaching_sessions||0),0);
            const totST=teamDs.reduce((a,d)=>a+(parseFloat(d.side_task_minutes)||0),0);
            const avgOcc=teamDs.length?teamDs.reduce((a,d)=>a+(parseFloat(d.occupancy_pct)||0),0)/teamDs.length:0;
            const occPct=avgOcc>2?avgOcc:avgOcc*100;
            return [
              {label:"SBS",value:totSbs,color:"var(--green)",icon:"📋"},
              {label:"Non-SBS",value:totNon,color:"var(--blue)",icon:"📝"},
              {label:"Coaching",value:totCoach,color:"var(--amber)",icon:"🎯"},
              {label:"Side Tasks",value:totST>0?`${Math.floor(totST/60)}h ${Math.round(totST%60)}m`:"0",color:"var(--tx2)",icon:"⏱"},
              {label:"Avg Occ",value:occPct>0?occPct.toFixed(1)+"%":"—",color:"var(--tx2)",icon:"📊"},
            ].map((s,i)=><div key={i} style={{textAlign:"center"}}>
              <div style={{fontSize:18,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</div>
              <div style={{fontSize:10,color:"var(--tx3)",fontWeight:500}}>{s.label}</div>
            </div>);
          })()}
        </div>
      </div>}

      {/* Team availability today */}
      {(()=>{
        const presentStatuses=new Set(["P","H","L","EL","PH"]);
        const absentStatuses=new Set(["AL","Paid SL","ML","UL","NSNC"]);
        const teamAtt=todayAttendance.filter(a=>allTeamEmails.includes(a.email?.toLowerCase()));
        const present=teamAtt.filter(a=>presentStatuses.has(a.status)).length;
        const absent=teamAtt.filter(a=>absentStatuses.has(a.status)).length;
        const off=teamAtt.filter(a=>a.status==="OFF").length;
        const noData=allTeamEmails.length-teamAtt.length;
        if(allTeamEmails.length===0)return null;
        return <div className="card" style={{padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>Today's availability</div>
            <span style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:"var(--green-bg)",color:"var(--green)",fontWeight:700}}>{present} Present</span>
            {absent>0&&<span style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:"var(--red-bg)",color:"var(--red)",fontWeight:700}}>{absent} On leave</span>}
            {off>0&&<span style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:"var(--bg3)",color:"var(--tx3)",fontWeight:700}}>{off} Off</span>}
            {noData>0&&<span style={{fontSize:11,color:"var(--tx3)"}}>{noData} no schedule</span>}
          </div>
          <button className="btn btn-outline btn-sm" onClick={()=>nav("schedule")} style={{fontSize:11}}>Schedule →</button>
        </div>;
      })()}

      {/* Score Trend Chart */}
      {months.length>=2&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">Performance trend</span><span style={{fontSize:12,color:"var(--tx3)"}}>{months.length} months</span></div>
        <div style={{padding:"16px 16px 8px"}}>
          {(()=>{
            const trendMonths=months.slice(0,6).reverse();
            // Calculate team avg performance per month
            const teamData=trendMonths.map(mo=>{
              const monthRows=mtd.filter(r=>r.month===mo&&allTeamEmails.includes(r.qa_email?.toLowerCase()));
              const perfs=monthRows.map(r=>parseFloat(r.final_performance)||0).filter(v=>v>0);
              const avgPerf=perfs.length?perfs.reduce((a,b)=>a+b,0)/perfs.length:0;
              const totalDsat=monthRows.reduce((a,r)=>a+(r.dsat||0),0);
              const avgOcc=monthRows.map(r=>parseFloat(r.occupancy_pct)||0).filter(v=>v>0);
              return{month:mo,label:mo.split("-")[0].slice(0,3),avgPerf:avgPerf*100,dsat:totalDsat,avgOcc:avgOcc.length?avgOcc.reduce((a,b)=>a+b,0)/avgOcc.length:0,count:monthRows.length};
            });
            const maxPerf=Math.max(...teamData.map(d=>d.avgPerf),1);
            const maxDsat=Math.max(...teamData.map(d=>d.dsat),1);
            const chartH=120;const chartW=Math.max(400,trendMonths.length*80);
            const perfPoints=teamData.map((d,i)=>{const x=40+i*(chartW-60)/(trendMonths.length-1||1);const y=chartH-10-(d.avgPerf/maxPerf)*(chartH-30);return{x,y,...d};});
            const dsatPoints=teamData.map((d,i)=>{const x=40+i*(chartW-60)/(trendMonths.length-1||1);const y=chartH-10-(d.dsat/maxDsat)*(chartH-30);return{x,y,...d};});
            const perfLine=perfPoints.map((p,i)=>`${i===0?"M":"L"}${p.x} ${p.y}`).join(" ");
            const dsatLine=dsatPoints.map((p,i)=>`${i===0?"M":"L"}${p.x} ${p.y}`).join(" ");
            return <div style={{overflowX:"auto"}}>
              <svg width={chartW} height={chartH+30} viewBox={`0 0 ${chartW} ${chartH+30}`}>
                {/* Grid lines */}
                {[0,25,50,75,100].map(v=>{const y=chartH-10-(v/maxPerf)*(chartH-30);return <g key={v}><line x1="35" y1={y} x2={chartW-10} y2={y} stroke="var(--bd)" strokeWidth="0.5" strokeDasharray="4"/><text x="30" y={y+4} textAnchor="end" fill="var(--tx3)" fontSize="9">{v}%</text></g>})}
                {/* Performance line */}
                <path d={perfLine} fill="none" stroke="#3BFF9D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                {perfPoints.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="4" fill="#3BFF9D" stroke="var(--bg3)" strokeWidth="2"/><text x={p.x} y={p.y-10} textAnchor="middle" fill="#3BFF9D" fontSize="10" fontWeight="700">{p.avgPerf.toFixed(1)}%</text></g>)}
                {/* DSAT line */}
                <path d={dsatLine} fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4"/>
                {dsatPoints.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="3" fill="var(--amber)" stroke="var(--bg3)" strokeWidth="1.5"/></g>)}
                {/* X axis labels */}
                {perfPoints.map((p,i)=><text key={i} x={p.x} y={chartH+18} textAnchor="middle" fill="var(--tx3)" fontSize="10" fontWeight="500">{p.label}</text>)}
              </svg>
              <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:4,fontSize:11}}>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:3,borderRadius:2,background:"#3BFF9D",display:"inline-block"}}/>Avg Performance</span>
                <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:3,borderRadius:2,background:"var(--amber)",display:"inline-block",borderTop:"1px dashed var(--amber)"}}/>Total DSAT</span>
              </div>
            </div>;
          })()}
        </div>
      </div>}

      {/* Team members table */}
      {teamSorted.length>0&&<div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My team — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>{teamSorted.length} specialists</span></div>
        <div className="table-wrap"><table><thead><tr>
          <th>#</th>
          <th>Specialist</th>
          <th style={{textAlign:"right"}}>Score</th>
          <th style={{textAlign:"right"}}>Occupancy</th>
          <th style={{textAlign:"right"}}>Avg T/D</th>
          <th style={{textAlign:"right"}}>Coaching %</th>
          <th style={{textAlign:"right"}}>SBS</th>
          <th style={{textAlign:"right"}}>RTR</th>
          <th style={{textAlign:"right"}}>CO %</th>
          <th style={{textAlign:"right"}}>ST/Hr</th>
          <th style={{textAlign:"right"}}>WD</th>
        </tr></thead><tbody>
          {teamSorted.map((r,i)=>{
            const stHours = r.side_tasks_duration_mins ? (r.side_tasks_duration_mins / 60).toFixed(1) : "—";
            return (<tr key={r.id}>
            <td style={{fontWeight:500,color:i<3?"var(--amber)":"var(--tx3)"}}>{i+1}</td>
            <td style={{fontWeight:500}}>{nameFromEmail(r.qa_email)}</td>
            <td style={{textAlign:"right"}}><span style={{display:"inline-block",padding:"2px 10px",borderRadius:12,fontSize:12,fontWeight:600,background:scoreBg(getScore(r)),color:scoreColor(getScore(r))}}>{getScore(r).toFixed(1)} / {maxScore}</span></td>
            <td style={{textAlign:"right"}}>{fmt(r.occupancy_pct)}</td>
            <td style={{textAlign:"right",color:"var(--blue)",fontWeight:500}}>{r.ticket_per_day??0}</td>
            <td style={{textAlign:"right"}}>{fmt(r.coaching_completion_pct)}</td>
            <td style={{textAlign:"right"}}>{r.sbs??0}</td>
            <td style={{textAlign:"right"}}>{fmt(r.avg_rtr_score)}</td>
            <td style={{textAlign:"right"}}>{fmt(r.avg_observation_score_pct)}</td>
            <td style={{textAlign:"right"}}>{stHours}</td>
            <td style={{textAlign:"right"}}>{r.working_days??0}</td>
          </tr>);})}
        </tbody></table></div>
      </div>}
    </>}

    {/* ── Personal stats (everyone) ── */}
    {myData?<>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">My score</div>
          <ProgressRing value={myData?getScore(myData):0} max={maxScore} size={56} stroke={5}
            color={scoreColor(myData?getScore(myData):0)}
            label={myData?getScore(myData).toFixed(1):"0"}
            sublabel={`of ${maxScore} pts`}
          />
          {myPrevData&&<div style={{fontSize:12,marginTop:8,color:(getScore(myData)-getScore(myPrevData))>=0?"var(--green)":"var(--red)",fontWeight:600}}>{(getScore(myData)-getScore(myPrevData))>=0?"↑":"↓"} {Math.abs(getScore(myData)-getScore(myPrevData)).toFixed(1)} pts vs {prevMonth}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Rank</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{myRank>0?"#"+myRank:"—"}<span style={{fontSize:14,fontWeight:400,color:"var(--tx3)"}}> / {ranked.length}</span></div>
            {myHistory.length>=2&&<SparkLine data={myHistory.map(h=>h.score)} width={80} height={32} color={scoreColor(myData?getScore(myData):0)} />}
          </div>
          <div style={{fontSize:11,color:"var(--tx3)",marginTop:4}}>Performance trend</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Tickets / day</div>
          <div className="stat-value">{myData.ticket_per_day??0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">DSAT</div>
          <div className="stat-value">{myData.dsat??0}</div>
        </div>
      </div>

      {/* My KPI detail with slab calculation */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">My KPIs — {latestMonth}</span></div>
        {(()=>{
          const KPI_SLABS_DASH = {
            occupancy:{label:"Occupancy",weight:15,thresholds:[95,98,100],rawKey:"occupancy_pct"},
            coaching:{label:"Coaching on-time",weight:10,thresholds:[90,93,95],rawKey:"ontime_coaching_pct"},
            calibration:{label:"Calibration",weight:10,thresholds:[85,90,95],rawKey:"avg_calibration_match_rate"},
            observation:{label:"Coaching observation",weight:10,thresholds:[82,85,88],rawKey:"avg_observation_score_pct"},
            rtr:{label:"RTR score",weight:10,thresholds:[80,85,90],rawKey:"avg_rtr_score"},
          };
          const parseRawD = (val) => {
            if (!val && val !== 0) return null;
            const s = String(val).trim().replace(",",".");
            if (s.includes("%")) return parseFloat(s.replace("%",""));
            const n = parseFloat(s);
            if (isNaN(n)) return null;
            if (n >= 0 && n <= 2) return n * 100;
            return n;
          };
          const calcSlabD = (rawPct, th) => {
            if (rawPct === null) return {slab:0,pct:0,label:"No data"};
            if (rawPct >= th[2]) return {slab:3,pct:100,label:"Slab 3"};
            if (rawPct >= th[1]) return {slab:2,pct:75,label:"Slab 2"};
            if (rawPct >= th[0]) return {slab:1,pct:50,label:"Slab 1"};
            return {slab:0,pct:0,label:"Slab 0"};
          };
          const kpis = Object.entries(KPI_SLABS_DASH).map(([key,def])=>{
            const rawPct = parseRawD(myData[def.rawKey]);
            const slab = calcSlabD(rawPct, def.thresholds);
            const score = (def.weight * slab.pct) / 100;
            return {key,label:def.label,weight:def.weight,rawPct,slab,score,thresholds:def.thresholds};
          });
          const total = kpis.reduce((s,k)=>s+k.score,0);
          const scColor = (v) => v >= 55*0.7 ? "var(--green)" : v >= 55*0.4 ? "var(--amber)" : "var(--red)";
          return <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 20px"}}>
              {kpis.map(k=>(
                <div key={k.key} style={{padding:"10px 12px",background:"var(--bg)",borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600}}>{k.label}</span>
                    <span style={{fontSize:13,fontWeight:700,color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}>{k.score.toFixed(1)} / {k.weight}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--tx2)",marginBottom:4}}>
                    <span>Raw: {k.rawPct !== null ? k.rawPct.toFixed(1)+"%" : "—"}</span>
                    <span style={{padding:"1px 6px",borderRadius:8,fontSize:10,fontWeight:600,background:k.slab.pct===100?"var(--green-bg)":k.slab.pct>=75?"var(--blue-bg)":k.slab.pct>=50?"var(--amber-bg)":"var(--red-bg)",color:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}>{k.slab.label} ({k.slab.pct}%)</span>
                  </div>
                  <div style={{height:5,background:"var(--bd2)",borderRadius:3,overflow:"hidden"}}><div style={{width:`${(k.score/k.weight)*100}%`,height:"100%",borderRadius:3,background:k.slab.pct===100?"var(--green)":k.slab.pct>=75?"var(--blue)":k.slab.pct>=50?"var(--amber)":"var(--red)"}}/></div>
                </div>
              ))}
            </div>
            <div style={{marginTop:14,padding:"10px 14px",background:"var(--bg)",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:600}}>Total (non-CSAT)</span>
              <span style={{fontSize:18,fontWeight:700,color:scColor(total)}}>{total.toFixed(1)} / 55</span>
            </div>
            <div style={{marginTop:12}}>
              <div className="table-wrap"><table><thead><tr><th>Other metrics</th><th style={{textAlign:"right"}}>Value</th></tr></thead><tbody>
                {[
                  {label:"Coaching completion",value:fmt(myData.coaching_completion_pct)},
                  {label:"Tickets/day",value:myData.ticket_per_day??0},
                  {label:"Working days",value:(myData.working_days||0)+(myData.ramadan_wds?" ("+myData.ramadan_wds+" Ramadan)":"")},
                  {label:"DSAT evaluated",value:myData.dsat??0},
                  {label:"JKQ",value:myData.jkq_result&&myData.jkq_result!=="N/A"?myData.jkq_result+(myData.jkq_score>0?" ("+myData.jkq_score+")":""):"—"},
                ].map(row=>(<tr key={row.label}><td style={{color:"var(--tx2)"}}>{row.label}</td><td style={{textAlign:"right",fontWeight:500}}>{row.value}</td></tr>))}
              </tbody></table></div>
            </div>
          </>;
        })()}
      </div>

      {/* ── Peer Comparison — anonymous percentile rank ── */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header"><span className="card-title">Peer comparison — {latestMonth}</span><span style={{fontSize:12,color:"var(--tx3)"}}>How you compare (anonymous)</span></div>
        {(()=>{
          const metrics = [
            {key:"score",label:"Overall score",getValue:r=>getScore(r)},
            {key:"occupancy",label:"Occupancy",getValue:r=>parseFloat(String(r.occupancy_pct||0).replace("%",""))||0},
            {key:"coaching",label:"Coaching on-time",getValue:r=>parseFloat(String(r.ontime_coaching_pct||0).replace("%",""))||0},
            {key:"calibration",label:"Calibration",getValue:r=>parseFloat(String(r.avg_calibration_match_rate||0).replace("%",""))||0},
            {key:"observation",label:"Coaching observation",getValue:r=>parseFloat(String(r.avg_observation_score_pct||0).replace("%",""))||0},
            {key:"rtr",label:"RTR score",getValue:r=>parseFloat(String(r.avg_rtr_score||0).replace("%",""))||0},
            {key:"tpd",label:"Tickets/day",getValue:r=>parseFloat(r.ticket_per_day||0)||0},
          ];
          return <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {metrics.map(m=>{
              const allVals=current.map(r=>m.getValue(r)).filter(v=>v>0).sort((a,b)=>a-b);
              const myVal=m.getValue(myData);
              if(allVals.length<15||myVal<=0) return null;
              const belowMe=allVals.filter(v=>v<myVal).length;
              const pct=Math.round((belowMe/allVals.length)*100);
              const pctLabel=pct>=90?"Outstanding":pct>=75?"Above average":pct>=50?"Average":pct>=25?"Below average":"Needs improvement";
              const pctColor=pct>=75?"var(--green)":pct>=50?"var(--blue)":pct>=25?"var(--amber)":"var(--red)";
              return <div key={m.key} style={{padding:"8px 14px",background:"var(--bg)",borderRadius:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:13,fontWeight:500}}>{m.label}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:"var(--tx3)"}}>Top {100-pct}%</span>
                    <span style={{fontSize:12,fontWeight:600,color:pctColor,padding:"2px 8px",borderRadius:10,background:pct>=75?"var(--green-bg)":pct>=50?"rgba(59,130,246,.1)":pct>=25?"var(--amber-bg)":"var(--red-bg)"}}>{pctLabel}</span>
                  </div>
                </div>
                <div style={{height:6,background:"var(--bd2)",borderRadius:3,overflow:"hidden",position:"relative"}}>
                  <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:pctColor,transition:"width .5s"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,color:"var(--tx3)"}}>
                  <span>Your value: {m.key==="score"?myVal.toFixed(1):m.key==="tpd"?myVal.toFixed(1):myVal.toFixed(1)+"%"}</span>
                  <span>Better than {pct}% of peers</span>
                </div>
              </div>;
            }).filter(Boolean)}
          </div>;
        })()}
      </div>

      {/* Sparkline trend */}
      {myHistory.length>1&&<div className="card" style={{marginBottom:20}}><div className="card-header"><span className="card-title">Score trend</span></div>
        <svg width="100%" height="100" viewBox={`0 0 ${myHistory.length*100} 100`} style={{overflow:"visible"}}><polyline fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={myHistory.map((d,i)=>{const y=90-(d.score/maxScore)*70;return`${i*100+50},${Math.max(10,Math.min(90,y))}`;}).join(" ")}/>{myHistory.map((d,i)=>{const y=90-(d.score/maxScore)*70;const cy=Math.max(10,Math.min(90,y));return(<g key={i}><circle cx={i*100+50} cy={cy} r="4" fill="var(--accent-text)"/><text x={i*100+50} y={cy-12} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--tx)" fontFamily="var(--font)">{d.score.toFixed(1)}</text><text x={i*100+50} y={cy+18} textAnchor="middle" fontSize="10" fill="var(--tx3)" fontFamily="var(--font)">{d.month}</text></g>);})}</svg>
      </div>}
    </>:
    /* No personal MTD data */
    (!isLead&&!hasRole(profile?.role,"qa_supervisor"))?<div style={{padding:"16px 0",marginBottom:20,color:"var(--tx3)",fontSize:13}}>No performance data found for your email ({profile?.email}). Data syncs from Metabase hourly.</div>:null}

    {/* ── Global stats (for admins/supervisors) ── */}
    {hasRole(profile?.role,"qa_supervisor")&&(()=>{
      const svDomain=profile?.operational_domain||profile?.domain||"tabby.ai";
      const isAdminRole=hasRole(profile?.role,"admin");
      const svRoster=isAdminRole?roster:roster.filter(r=>r.email?.endsWith("@"+svDomain));
      const svCurrent=isAdminRole?current:current.filter(r=>r.qa_email?.endsWith("@"+svDomain));
      const svRanked=isAdminRole?ranked:[...svCurrent].sort((a,b)=>getScore(b)-getScore(a));
      const svAvg=svRanked.length?svRanked.reduce((a,r)=>a+getScore(r),0)/svRanked.length:0;
      const svTotalDsat=svCurrent.reduce((a,r)=>a+(r.dsat||0),0);
      return <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total QAs ({isAdminRole?"all":svDomain})</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{svRoster.length}</div>
            <div style={{width:40,height:40,borderRadius:12,background:"var(--primary-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👥</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Team leads</div>
          <div className="stat-value">{[...new Set(svRoster.map(r=>r.manager_email).filter(Boolean))].length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg score ({latestMonth})</div>
          <ProgressRing value={svAvg} max={maxScore} size={56} stroke={5}
            color={scoreColor(svAvg)}
            label={svAvg.toFixed(1)}
            sublabel={`of ${maxScore} pts`}
          />
        </div>
        <div className="stat-card">
          <div className="stat-label">Total DSAT ({latestMonth})</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="stat-value">{svTotalDsat}</div>
            <MiniBarChart data={months.slice(0,4).reverse().map(m=>{
              const md=mtd.filter(r=>r.month===m);
              const scoped=isAdminRole?md:md.filter(r=>r.qa_email?.endsWith("@"+svDomain));
              return {label:m.slice(0,3),value:scoped.reduce((a,r)=>a+(r.dsat||0),0)};
            })} height={36} color="var(--red)" />
          </div>
        </div>
      </div>;
    })()}

    </>}
    {toastEl}
    {confirmEl}
  </div>);
}
export default DashboardPage;
