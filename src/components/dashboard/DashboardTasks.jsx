import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { hasRole, ROLE_LABELS } from "../../lib/constants.js";
import { sb, dataCache } from "../../lib/supabase.js";
import { safeError, logActivity } from "../../lib/utils.js";
import { listTasks } from "../../api/tasks.js";
import { useConfirm } from "../../lib/hooks.jsx";
import { Icon, icons } from "../Icons.jsx";
import SearchableSelect from "../SearchableSelect.jsx";
import { useApp } from "../../lib/AppContext.jsx";

function DashboardTasks({ roster, appProfiles, todayAttendance, dailyScores }){
  const { profile, token, globalToast } = useApp();

  const [userTasks, setUserTasks] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskView, setTaskView] = useState("list");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [taskForm, setTaskForm] = useState({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:[]});
  const [editingTask, setEditingTask] = useState(null);
  const [postponeModal, setPostponeModal] = useState(null);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeReason, setPostponeReason] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tplForm, setTplForm] = useState({title:"",description:"",priority:"medium",frequency:"daily",assign_to_type:"my_team",assign_to_value:"",target_metric:"",target_value:""});
  const [attWarning, setAttWarning] = useState(null);

  const { ask: confirmAsk, el: confirmEl } = useConfirm();

  const myEmail = profile?.email?.toLowerCase();

  const nameFromEmail=(email)=>{if(!email)return"—";const local=email.split("@")[0];return local.split(".").map(p=>{const c=p.replace(/[\d]+$/,"");return c?c.charAt(0).toUpperCase()+c.slice(1):"";}).filter(Boolean).join(" ");};

  // Load user tasks
  const loadTasks=useCallback(async()=>{try{
    const myEm=profile?.email?.toLowerCase();
    const t=await listTasks({ token, filters: "order=priority.asc,due_date.asc" });
    const mine=t.filter(tk=>tk.created_by?.toLowerCase()===myEm||tk.assigned_to?.toLowerCase()===myEm);
    setUserTasks(mine);
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
        const local=assignee.split("@")[0];
        const ds=dailyScores.find(d=>{
          const em=d.qa_email?.toLowerCase();
          return em===assignee||em?.split("@")[0]===local;
        });
        if(!ds)continue;
        const actual=parseFloat(ds[task.target_metric])||0;
        const target=parseFloat(task.target_value)||0;
        if(actual>=target){
          try{
            await sb.query("tasks",{token,method:"PATCH",body:{status:"done",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()},filters:`id=eq.${task.id}`});
            closed++;
          }catch(e){console.error("Auto-close task:",e);}
        }
      }
      if(closed>0){
        loadTasks();
        globalToast("success",`${closed} task${closed>1?"s":""} auto-completed from daily evaluations`);
      }
    })();
  },[dailyScores,userTasks.length]);

  // Create template
  const saveTemplate=async()=>{
    if(!tplForm.title.trim()){globalToast("error","Template title is required");return;}
    try{
      const body={title:tplForm.title,description:tplForm.description||null,priority:tplForm.priority,frequency:tplForm.frequency,
        created_by:profile?.email,assign_to_type:tplForm.assign_to_type,assign_to_value:tplForm.assign_to_type==="specific_person"?tplForm.assign_to_value:null,
        target_metric:tplForm.target_metric||null,target_value:tplForm.target_value?Number(tplForm.target_value):null,is_active:true};
      await sb.query("task_templates",{token,method:"POST",body});
      globalToast("success","Template created");setShowTemplateForm(false);
      setTplForm({title:"",description:"",priority:"medium",frequency:"daily",assign_to_type:"my_team",assign_to_value:"",target_metric:"",target_value:""});
      loadTasks();
    }catch(e){globalToast("error",safeError(e));}
  };

  // Generate tasks from template
  const generateFromTemplate=async(tpl)=>{
    try{
      const myEm=profile?.email?.toLowerCase();
      const leadProfs=appProfiles.filter(p=>p.role==="qa_lead").map(p=>p.email?.toLowerCase()).filter(Boolean);
      const leadSet=new Set(leadProfs);
      let assignees=[];
      if(tpl.assign_to_type==="specific_person"&&tpl.assign_to_value){
        assignees=[tpl.assign_to_value.toLowerCase()];
      }else if(tpl.assign_to_type==="my_team"){
        const myLocal=myEm.split("@")[0];
        const myTeam=roster.filter(r=>{const mgr=r.manager_email?.toLowerCase()||"";return mgr===myEm||mgr.split("@")[0]===myLocal;}).map(r=>r.email?.toLowerCase()).filter(Boolean);
        if(myTeam.length>0){
          assignees=myTeam;
        }else if(hasRole(profile?.role,"admin")){
          assignees=roster.filter(r=>leadSet.has(r.manager_email?.toLowerCase())).map(r=>r.email?.toLowerCase()).filter(Boolean);
        }
      }else if(tpl.assign_to_type==="my_leads"){
        const myLocal=myEm.split("@")[0];
        const myLeads=new Set();
        (window.__teamsData||[]).forEach(tm=>{
          const sv=tm.supervisor_email?.toLowerCase()||"";
          if(sv===myEm||sv.split("@")[0]===myLocal){if(tm.lead_email)myLeads.add(tm.lead_email.toLowerCase());}
        });
        assignees=[...myLeads];
      }else if(tpl.assign_to_type==="all_qa"){
        assignees=roster.filter(r=>leadSet.has(r.manager_email?.toLowerCase())).map(r=>r.email?.toLowerCase()).filter(Boolean);
      }
      if(assignees.length===0){globalToast("error","No QAs found to assign. Make sure you have team members or select 'All QAs'.");return;}
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
      globalToast("success",`Created ${created} task${created!==1?"s":""}${skipped>0?` (${skipped} skipped — on leave/off)`:""}`);
      logActivity(token,profile?.email,"tasks_generated","task_templates",tpl.id,`Template: ${tpl.title}, Created: ${created}, Skipped: ${skipped}`);
      loadTasks();
    }catch(e){globalToast("error",safeError(e));}
  };

  // Delete template
  const deleteTemplate=(id)=>{
    const tpl=taskTemplates.find(t=>t.id===id);
    confirmAsk("Delete template?",`Delete "${tpl?.title||"this template"}"? This won't delete tasks already generated from it.`,async()=>{
      try{await sb.query("task_templates",{token,method:"DELETE",filters:`id=eq.${id}`});globalToast("success","Template deleted");loadTasks();}catch(e){globalToast("error",safeError(e));}
    },"Delete","var(--red)");
  };

  // Delete all tasks I assigned to others
  const deleteAllAssignedTasks=()=>{
    const assignedOut=userTasks.filter(t=>t.created_by?.toLowerCase()===myEmail&&t.assigned_to&&t.assigned_to?.toLowerCase()!==myEmail&&t.status!=="done");
    if(assignedOut.length===0){globalToast("error","No assigned tasks to delete");return;}
    confirmAsk("Delete all assigned tasks?",`This will delete ${assignedOut.length} task${assignedOut.length!==1?"s":""} you assigned to other people. Tasks assigned to yourself will be kept.`,async()=>{
      try{
        let deleted=0;
        for(const t of assignedOut){
          await sb.query("tasks",{token,method:"DELETE",filters:`id=eq.${t.id}`});
          deleted++;
        }
        logActivity(token,profile?.email,"bulk_tasks_deleted","tasks",null,`Deleted ${deleted} assigned tasks`);
        globalToast("success",`Deleted ${deleted} assigned task${deleted!==1?"s":""}`);
        loadTasks();
      }catch(e){globalToast("error",safeError(e));}
    },"Delete all","var(--red)");
  };

  const toggleTemplate=async(tpl)=>{
    try{await sb.query("task_templates",{token,method:"PATCH",body:{is_active:!tpl.is_active,updated_at:new Date().toISOString()},filters:`id=eq.${tpl.id}`});loadTasks();}catch(e){globalToast("error",safeError(e));}
  };

  const priorityConfig={urgent:{label:"Urgent",color:"var(--red)",bg:"var(--red-bg)"},high:{label:"High",color:"var(--amber)",bg:"var(--amber-bg)"},medium:{label:"Medium",color:"var(--tabby-purple)",bg:"var(--primary-light)"},low:{label:"Low",color:"var(--tx3)",bg:"var(--bg2)"}};
  const activeTasks=userTasks.filter(t=>t.status!=="done");
  const doneTasks=userTasks.filter(t=>t.status==="done");

  // Task CRUD
  const saveTask=async(forceAssign)=>{
    if(!taskForm.title.trim()){globalToast("error","Task title is required");return;}
    const assignees = Array.isArray(taskForm.assigned_to) ? taskForm.assigned_to : (taskForm.assigned_to?[taskForm.assigned_to]:[]);
    if(assignees.length>0&&!editingTask&&!forceAssign){
      try{
        const todayStr=new Date().toISOString().split("T")[0];
        const absentStatuses=new Set(["AL","Paid SL","ML","UL","NSNC","OFF","X"]);
        for(const em of assignees){
          const attCheck=await sb.query("qa_attendance",{select:"status",filters:`email=eq.${em.toLowerCase()}&date=eq.${todayStr}`,token}).catch(()=>[]);
          const att=Array.isArray(attCheck)&&attCheck.length>0?attCheck[0]:null;
          if(att&&absentStatuses.has(att.status)){
            setAttWarning({name:nameFromEmail(em),status:att.status});
            return;
          }
        }
      }catch{}
    }
    try{
      if(editingTask){
        const body={title:taskForm.title,description:taskForm.description||null,priority:taskForm.priority,due_date:taskForm.due_date||null,eta_date:taskForm.eta_date||null,created_by:profile?.email,assigned_to:assignees[0]||null,updated_at:new Date().toISOString()};
        await sb.query("tasks",{token,method:"PATCH",body,filters:`id=eq.${editingTask.id}`});
        setUserTasks(prev=>prev.map(t=>t.id===editingTask.id?{...t,...body}:t));
        logActivity(token,profile?.email,"task_updated","tasks",editingTask.id,`Title: ${taskForm.title}`);
        globalToast("success","Task updated");
      }else{
        // Create one task per assignee (or one unassigned task)
        const targets = assignees.length>0 ? assignees : [null];
        const createdTasks = [];
        for(const em of targets){
          const body={title:taskForm.title,description:taskForm.description||null,priority:taskForm.priority,due_date:taskForm.due_date||null,eta_date:taskForm.eta_date||null,created_by:profile?.email,assigned_to:em||null,updated_at:new Date().toISOString()};
          const result = await sb.query("tasks",{token,method:"POST",body});
          const created = Array.isArray(result) ? result[0] : result;
          if(created?.id){createdTasks.push(created);}
          else{createdTasks.push({...body, id:"temp-"+Date.now()+"-"+Math.random(), status:"pending", created_at:new Date().toISOString()});}
          logActivity(token,profile?.email,"task_created","tasks",null,`Title: ${taskForm.title}${em?", Assigned to: "+em:""}`);
        }
        setUserTasks(prev=>[...createdTasks,...prev]);
        globalToast("success", assignees.length>1?`Task created for ${assignees.length} QAs`:assignees.length===1?`Task assigned to ${nameFromEmail(assignees[0])}`:"Task created");
      }
      setShowTaskForm(false);setEditingTask(null);setTaskForm({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:[]});
    }catch(e){globalToast("error",safeError(e));}
  };

  const toggleTaskDone=async(task)=>{
    const newStatus=task.status==="done"?"pending":"done";
    setUserTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:newStatus,completed_at:newStatus==="done"?new Date().toISOString():null}:t));
    try{
      await sb.query("tasks",{token,method:"PATCH",body:{status:newStatus,completed_at:newStatus==="done"?new Date().toISOString():null,updated_at:new Date().toISOString()},filters:`id=eq.${task.id}`});
      logActivity(token,profile?.email,newStatus==="done"?"task_completed":"task_reopened","tasks",task.id,`Title: ${task.title}`);
    }catch(e){globalToast("error",safeError(e));setUserTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:task.status}:t));}
  };

  const postponeTask=async()=>{
    if(!postponeDate){globalToast("error","Select a new date");return;}
    try{
      await sb.query("tasks",{token,method:"PATCH",body:{status:"postponed",postponed_to:postponeDate,postpone_reason:postponeReason||null,due_date:postponeDate,updated_at:new Date().toISOString()},filters:`id=eq.${postponeModal.id}`});
      setUserTasks(prev=>prev.map(t=>t.id===postponeModal.id?{...t,status:"postponed",eta_date:postponeDate}:t));
      logActivity(token,profile?.email,"task_postponed","tasks",postponeModal.id,`Title: ${postponeModal.title}, New date: ${postponeDate}`);
      globalToast("success","Task postponed");setPostponeModal(null);setPostponeDate("");setPostponeReason("");
    }catch(e){globalToast("error",safeError(e));}
  };

  const deleteTask=(task)=>{
    confirmAsk("Delete task?",`Are you sure you want to delete "${task.title}"?`,async()=>{
      setUserTasks(prev=>prev.filter(t=>t.id!==task.id));
      try{
        await sb.query("tasks",{token,method:"DELETE",filters:`id=eq.${task.id}`});
        logActivity(token,profile?.email,"task_deleted","tasks",task.id,`Title: ${task.title}`);
        globalToast("success","Task deleted");
      }catch(e){globalToast("error",safeError(e));loadTasks();}
    },"Delete","var(--red)");
  };

  return <>
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
          <button className="btn btn-primary btn-sm" onClick={()=>{setShowTaskForm(true);setEditingTask(null);setTaskForm({title:"",description:"",priority:"medium",due_date:"",eta_date:"",assigned_to:[]});}}>
            <Icon d={icons.plus} size={14}/>New task
          </button>
        </div>
      </div>

      {/* Task form */}
      {showTaskForm&&<div style={{marginBottom:16,padding:16,background:"var(--bg)",borderRadius:10,border:"1px solid var(--bd2)"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
          {!editingTask && hasRole(profile?.role,"qa_lead") && <div className="form-group">
            <label className="form-label" style={{fontSize:11}}>Quick template (optional)</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[
                {label:"📝 Daily Check-in",title:"Daily check-in",description:"Please share today's progress and any blockers.",priority:"medium"},
                {label:"🎯 Weekly Review",title:"Weekly performance review",description:"Review your metrics for the week and identify areas to improve.",priority:"medium"},
                {label:"📊 Coaching Follow-up",title:"Coaching follow-up",description:"Apply action items from our last coaching session.",priority:"high"},
                {label:"⚡ Hit Daily Target",title:"Hit today's eval target",description:"Focus on completing your daily SBS/Non-SBS target.",priority:"high"},
                {label:"🔍 Review DAM Flag",title:"Review flagged behavior",description:"Review the flagged behavior and respond to your lead.",priority:"urgent"},
              ].map(tpl=>(
                <button key={tpl.label} type="button" onClick={()=>setTaskForm({...taskForm,title:tpl.title,description:tpl.description,priority:tpl.priority})}
                  style={{padding:"5px 10px",fontSize:11,fontWeight:500,background:"var(--bg3)",border:"1px solid var(--bd)",borderRadius:6,cursor:"pointer",fontFamily:"var(--font)",color:"var(--tx2)"}}>
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>}
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
              if(myRole==="qa_lead"){
                roster.forEach(r=>{
                  const em=r.email?.toLowerCase();if(!em||seen.has(em))return;
                  const mgr=r.manager_email?.toLowerCase()||"";
                  if(mgr===myEm||mgr===myLocal||mgr.split("@")[0]===myLocal){
                    seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});
                  }
                });
              }
              else if(myRole==="qa_supervisor"){
                const myLeadEmails=new Set();
                const allTeams=window.__teamsData||[];
                allTeams.forEach(tm=>{
                  const svEm=tm.supervisor_email?.toLowerCase()||"";
                  if(svEm===myEm||svEm.split("@")[0]===myLocal){
                    if(tm.lead_email)myLeadEmails.add(tm.lead_email.toLowerCase());
                  }
                });
                myLeadEmails.forEach(leadEm=>{
                  if(!seen.has(leadEm)){
                    seen.add(leadEm);
                    const p=appProfiles.find(x=>x.email?.toLowerCase()===leadEm);
                    opts.push({value:leadEm,label:`${p?.display_name||nameFromEmail(leadEm)} — QA Lead`});
                  }
                });
                roster.forEach(r=>{
                  const em=r.email?.toLowerCase();if(!em||seen.has(em))return;
                  const mgr=r.manager_email?.toLowerCase()||"";
                  if(myLeadEmails.has(mgr)||myLeadEmails.has(mgr.split("@")[0])){
                    seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});
                  }
                });
              }
              else if(hasRole(myRole,"admin")){
                const isAmanda=myEm==="amanda.souza@tabby.ai";
                appProfiles.forEach(p=>{
                  const em=p.email?.toLowerCase();if(!em||seen.has(em))return;
                  if(em===myEm)return;
                  if(isAmanda&&em==="imad.moussa@tabby.ai")return;
                  seen.add(em);
                  opts.push({value:em,label:`${p.display_name||nameFromEmail(em)} — ${ROLE_LABELS[p.role]||p.role}`});
                });
                roster.forEach(r=>{
                  const em=r.email?.toLowerCase();if(!em||seen.has(em))return;
                  if(isAmanda&&em==="imad.moussa@tabby.ai")return;
                  seen.add(em);opts.push({value:em,label:`${nameFromEmail(em)} — ${r.queue||"QA"}`});
                });
              }
              return opts.sort((a,b)=>a.label.localeCompare(b.label));
            })()}
              value={taskForm.assigned_to} onChange={v=>setTaskForm({...taskForm,assigned_to:Array.isArray(v)?v:(v?[v]:[])})} placeholder="Assign to one or more people..." multi={!editingTask}/>
          </div>}
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button className="btn btn-primary btn-sm" onClick={()=>saveTask(false)}>{editingTask?"Update":"Create"}</button>
          <button className="btn btn-outline btn-sm" onClick={()=>{setShowTaskForm(false);setEditingTask(null);}}>Cancel</button>
        </div>
      </div>}

      {/* CALENDAR VIEW */}
      {taskView==="calendar"&&(()=>{
        const allTasks = hideCompleted ? activeTasks : userTasks;
        const today = new Date(); today.setHours(0,0,0,0);
        const todayStr = today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
        const fmtDate = (d) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");

        const baseDays = [];
        for(let i=0;i<5;i++){
          const d=new Date(today);d.setDate(d.getDate()+i);
          const dateStr=fmtDate(d);
          const dayTasks=allTasks.filter(t=>(t.eta_date||t.due_date)===dateStr);
          baseDays.push({date:d,dateStr,tasks:dayTasks,isToday:i===0});
        }

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

      {/* LIST VIEW */}
      {taskView==="list"&&<>
      {activeTasks.length===0&&!showTaskForm?<div style={{textAlign:"center",padding:"24px 0",color:"var(--tx3)",fontSize:13}}>No active tasks</div>:
        <div>
          {(()=>{
            const myOwnTasks=activeTasks.filter(t=>!t.assigned_to||t.assigned_to?.toLowerCase()===myEmail);
            const assignedOut=activeTasks.filter(t=>t.assigned_to&&t.assigned_to?.toLowerCase()!==myEmail&&t.created_by?.toLowerCase()===myEmail);
            const assignedToMe=activeTasks.filter(t=>t.assigned_to?.toLowerCase()===myEmail&&t.created_by?.toLowerCase()!==myEmail);
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
                  <button onClick={()=>{setEditingTask(task);setTaskForm({title:task.title,description:task.description||"",priority:task.priority,due_date:"",eta_date:task.eta_date||"",assigned_to:task.assigned_to?[task.assigned_to]:[]});setShowTaskForm(true);}} style={{background:"none",border:"none",cursor:"pointer",padding:5,borderRadius:6,color:"var(--tx3)"}} title="Edit"><Icon d={icons.edit} size={14}/></button>
                  <button onClick={()=>deleteTask(task)} style={{background:"none",border:"none",cursor:"pointer",padding:5,borderRadius:6,color:"var(--tx3)"}} title="Delete"><Icon d={icons.trash} size={14}/></button>
                </div>
              </div>;
            };

            return <>
              {assignedToMe.length>0&&<div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--amber)",textTransform:"uppercase",letterSpacing:".5px",padding:"0 14px",marginBottom:6}}>Assigned to me ({assignedToMe.length})</div>
                {assignedToMe.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderTask)}
              </div>}

              {myOwnTasks.length>0&&<div style={{marginBottom:16}}>
                {(assignedToMe.length>0||Object.keys(byPerson).length>0)&&<div style={{fontSize:11,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px",padding:"0 14px",marginBottom:6}}>My tasks ({myOwnTasks.length})</div>}
                {myOwnTasks.sort((a,b)=>{const po={urgent:0,high:1,medium:2,low:3};return(po[a.priority]??9)-(po[b.priority]??9);}).map(renderTask)}
              </div>}

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

      {/* Completed tasks */}
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

      {/* Task Templates Section */}
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

    {/* Attendance warning modal */}
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

    {/* Task Detail Modal */}
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
            <button className="btn btn-outline btn-sm" onClick={()=>{setEditingTask(t);setTaskForm({title:t.title,description:t.description||"",priority:t.priority,due_date:"",eta_date:t.eta_date||"",assigned_to:t.assigned_to?[t.assigned_to]:[]});setShowTaskForm(true);setSelectedTask(null);}}>
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

    {/* Postpone Modal */}
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

    {confirmEl}
  </>;
}

export default DashboardTasks;
