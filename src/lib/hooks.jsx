import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { dataCache } from "./supabase.js";

export function useToast(){const[t,setT]=useState(null);const show=(type,msg)=>{setT({type,msg});setTimeout(()=>setT(null),3500);};const el=t?<div className={`toast toast-${t.type}`}>{t.msg}</div>:null;return{show,el};}

/** Auto-refresh hook: re-runs loadFn on data-changed event + interval polling */
export function useAutoRefresh(loadFn, intervalMs = 120000) {
  const loadRef = useRef(loadFn);
  useEffect(() => { loadRef.current = loadFn; });
  useEffect(() => {
    const onChanged = () => { dataCache.invalidate(); loadRef.current?.(); };
    window.addEventListener("data-changed", onChanged);
    const timer = intervalMs > 0 ? setInterval(() => { dataCache.invalidate(); loadRef.current?.(); }, intervalMs) : null;
    return () => { window.removeEventListener("data-changed", onChanged); if (timer) clearInterval(timer); };
  }, [intervalMs]);
}

// In-app confirmation modal hook
export function useConfirm(){
  const[state,setState]=useState(null);
  const ask=(title,message,onYes,yesLabel="Confirm",yesColor="var(--tabby-purple)")=>{
    setState({title,message,onYes,yesLabel,yesColor});
  };
  const close=()=>setState(null);
  const modalContent=state?<div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.55)",display:"flex",justifyContent:"center",alignItems:"center"}} onClick={close}>
    <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg3)",borderRadius:16,border:"1px solid var(--bd)",boxShadow:"0 25px 50px rgba(0,0,0,0.5)",width:"100%",maxWidth:400,padding:24,textAlign:"center",margin:16}}>
      <div style={{width:44,height:44,borderRadius:"50%",background:"var(--amber-bg)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
      </div>
      <div id="confirm-dialog-title" style={{fontSize:15,fontWeight:700,marginBottom:6,color:"var(--tx)"}}>{state.title}</div>
      <div style={{fontSize:13,color:"var(--tx2)",marginBottom:20,lineHeight:1.6}}>{state.message}</div>
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        <button className="btn btn-sm" style={{background:state.yesColor,color:"#fff",border:"none",fontWeight:600,padding:"8px 20px"}} onClick={()=>{close();state.onYes();}}>{state.yesLabel}</button>
        <button className="btn btn-outline btn-sm" style={{padding:"8px 20px"}} onClick={close}>Cancel</button>
      </div>
    </div>
  </div>:null;
  const el=modalContent?ReactDOM.createPortal(modalContent,document.body):null;
  return{ask,el};
}
