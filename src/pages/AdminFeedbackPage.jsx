import React, { useState, useEffect, useCallback } from "react";
import { sb, dataCache } from "../lib/supabase.js";
import { safeError } from "../lib/utils.js";
import { useToast } from "../lib/hooks.jsx";
import { PulseLoader } from "../components/Charts.jsx";
import { useApp } from "../lib/AppContext.jsx";

function AdminFeedbackPage(){
  const{token}=useApp();
  const[items,setItems]=useState([]);const[loading,setLoading]=useState(true);const[expandedId,setExpandedId]=useState(null);
  const{show,el}=useToast();
  const load=useCallback(async()=>{try{
    const d=await sb.query("feedback",{select:"*",filters:"order=created_at.desc",token});
    setItems(d);
  }catch(e){console.error(e);}setLoading(false);},[token]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);
  const updateStatus=async(id,status)=>{try{
    await sb.query("feedback",{token,method:"PATCH",body:{status},filters:`id=eq.${id}`});
    setItems(prev=>prev.map(x=>x.id===id?{...x,status}:x));
    show("success","Updated");
  }catch(e){show("error",safeError(e));}};
  const catIcon={bug:"🐛",feature:"💡",improvement:"✨",general:"💬"};
  const catLabel={bug:"Bug",feature:"Feature",improvement:"Improvement",general:"General"};
  const statusColor={new:{bg:"var(--blue-bg)",color:"var(--blue)"},reviewed:{bg:"var(--amber-bg)",color:"var(--amber)"},planned:{bg:"var(--primary-light)",color:"var(--tabby-purple,#6A2C79)"},done:{bg:"var(--green-bg)",color:"var(--green)"},dismissed:{bg:"var(--bg2)",color:"var(--tx3)"}};
  const counts={new:items.filter(f=>f.status==="new").length,reviewed:items.filter(f=>f.status==="reviewed").length,planned:items.filter(f=>f.status==="planned").length};
  return(<div className="page">
    <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
      <div>
        <div className="page-title">User Feedback</div>
        <div className="page-subtitle">{items.length} total submissions</div>
      </div>
      {items.length>0&&<div style={{display:"flex",gap:12}}>
        {counts.new>0&&<div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:"var(--blue)"}}>{counts.new}</div><div style={{fontSize:10,color:"var(--tx3)",fontWeight:600}}>NEW</div></div>}
        {counts.reviewed>0&&<div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:"var(--amber)"}}>{counts.reviewed}</div><div style={{fontSize:10,color:"var(--tx3)",fontWeight:600}}>REVIEWED</div></div>}
        {counts.planned>0&&<div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:"var(--tabby-purple,#6A2C79)"}}>{counts.planned}</div><div style={{fontSize:10,color:"var(--tx3)",fontWeight:600}}>PLANNED</div></div>}
      </div>}
    </div>
    {loading?<PulseLoader/>:
    items.length===0?<div className="card"><div className="placeholder" style={{padding:40}}><p style={{color:"var(--tx3)"}}>No feedback yet.</p></div></div>:
    <div className="card"><div className="table-wrap"><table><thead><tr>
      <th style={{width:30}}></th>
      <th>User</th>
      <th>Category</th>
      <th>Preview</th>
      <th>Rating</th>
      <th>Page</th>
      <th>Date</th>
      <th>Status</th>
    </tr></thead><tbody>
      {items.map(f=>{
        const sc=statusColor[f.status]||statusColor.new;
        const isExp=expandedId===f.id;
        return <React.Fragment key={f.id}>
          <tr onClick={()=>setExpandedId(isExp?null:f.id)} style={{cursor:"pointer"}}>
            <td><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round" style={{transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}><path d="M6 9l6 6 6-6"/></svg></td>
            <td style={{fontWeight:500}}>{f.user_name||f.user_email?.split("@")[0]}</td>
            <td><span style={{fontSize:12}}>{catIcon[f.category]} {catLabel[f.category]}</span></td>
            <td style={{color:"var(--tx2)",fontSize:12,maxWidth:250,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.message?.slice(0,60)}{f.message?.length>60?"...":""}</td>
            <td>{f.rating?<span style={{fontSize:11}}>{"⭐".repeat(f.rating)}</span>:"—"}</td>
            <td style={{fontSize:12,color:"var(--tx3)"}}>{f.page}</td>
            <td style={{fontSize:12,color:"var(--tx3)",whiteSpace:"nowrap"}}>{new Date(f.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</td>
            <td><span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:sc.bg,color:sc.color,fontWeight:600,textTransform:"uppercase"}}>{f.status}</span></td>
          </tr>
          {isExp&&<tr><td colSpan={8} style={{padding:0,background:"var(--bg)"}}><div style={{padding:"16px 20px 16px 44px"}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--tx3)",marginBottom:4}}>{f.user_email}</div>
            <div style={{fontSize:13,color:"var(--tx)",lineHeight:1.7,whiteSpace:"pre-wrap",marginBottom:14,padding:"12px 16px",background:"var(--bg3)",borderRadius:8,border:"1px solid var(--bd2)"}}>{f.message}</div>
            <div style={{display:"flex",gap:6}}>
              {["new","reviewed","planned","done","dismissed"].map(s=>{
                const scc=statusColor[s]||statusColor.new;
                return <button key={s} onClick={(e)=>{e.stopPropagation();updateStatus(f.id,s);}} style={{
                  padding:"4px 12px",borderRadius:8,border:"1px solid "+(f.status===s?scc.color:"var(--bd)"),
                  background:f.status===s?scc.bg:"transparent",color:f.status===s?scc.color:"var(--tx3)",
                  fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"var(--font)",textTransform:"uppercase",
                }}>{s}</button>;
              })}
            </div>
          </div></td></tr>}
        </React.Fragment>;
      })}
    </tbody></table></div></div>}{el}
  </div>);
}

export default AdminFeedbackPage;
