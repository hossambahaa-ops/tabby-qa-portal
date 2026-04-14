import React, { useState } from "react";
import { hasRole } from "../../lib/constants.js";
import { Icon, icons } from "../Icons.jsx";
import { useApp } from "../../lib/AppContext.jsx";

export default function APDetectionTab({
  detections,
  startCreate,
  dismissDetectionDB,
  nameFromEmail,
  initialsFromEmail,
  scoreColor,
}) {
  const { profile } = useApp();
  const [dismissModalAP, setDismissModalAP] = useState(null);
  const [dismissReasonAP, setDismissReasonAP] = useState("");

  return (
    <div>
      {detections.length === 0 ? (
        <div className="card"><div className="placeholder" style={{ padding: "40px" }}>
          <div className="placeholder-icon"><Icon d={icons.check} size={28} /></div>
          <h3>No auto-detections</h3>
          <p>No QAs currently need an Action Plan.<br />AP/PIP detection is triggered by DAM escalation steps with "includes PIP" enabled.</p>
        </div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "10px 14px", background: "var(--amber-bg)", borderRadius: 8, fontSize: 13, color: "var(--amber)", fontWeight: 500 }}>
            ⚠️ {detections.length} QA specialist{detections.length !== 1 ? "s" : ""} flagged for potential Action Plan. Review and confirm below.
          </div>
          {detections.map(d => (
            <div key={d.email} className="card" style={{
              borderLeft: `4px solid ${d.severity === "critical" ? "var(--red)" : d.severity === "warning" ? "var(--amber)" : "var(--blue)"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
                    {initialsFromEmail(d.email)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: "var(--tx3)" }}>{d.email} · TL: {d.tl ? nameFromEmail(d.tl) : "—"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                    background: d.severity === "critical" ? "var(--red-bg)" : d.severity === "warning" ? "var(--amber-bg)" : "var(--green-bg)",
                    color: d.severity === "critical" ? "var(--red)" : d.severity === "warning" ? "var(--amber)" : "var(--green)",
                  }}>{d.severity.toUpperCase()}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(d.totalScore) }}>
                    {d.totalScore.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--tx3)" }}> / 55</span>
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg)", borderRadius: 6, fontSize: 13, color: "var(--tx2)" }}>
                {d.reason}
              </div>

              {/* KPI breakdown mini */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {d.kpis.map(k => (
                  <div key={k.key} style={{
                    padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                    background: k.slab.slab === 0 ? "var(--red-bg)" : k.slab.slab === 1 ? "var(--amber-bg)" : "var(--green-bg)",
                    color: k.slab.slab === 0 ? "var(--red)" : k.slab.slab === 1 ? "var(--amber)" : "var(--green)",
                  }}>
                    {k.label}: {k.rawPct !== null ? k.rawPct.toFixed(1) + "%" : "—"} ({k.slab.label})
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="btn btn-primary btn-sm" onClick={() => startCreate(d.email, d.planType || "pip")} style={d.planType === "pip" ? { background: "var(--red)", color: "#fff" } : {}}>
                  <Icon d={d.planType === "pip" ? icons.dam : icons.plan} size={14} />Create {(d.planType || "pip").toUpperCase()}
                </button>
                {hasRole(profile?.role, "super_admin") ?
                  <button className="btn btn-outline btn-sm" onClick={() => dismissDetectionDB(d.email, "")}>Dismiss</button> :
                  <button className="btn btn-outline btn-sm" onClick={() => { setDismissModalAP(d); setDismissReasonAP(""); }}>Dismiss</button>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dismiss reason modal for non-super-admins */}
      {dismissModalAP && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20,overflowY:"auto"}} onClick={e=>{if(e.target===e.currentTarget){setDismissModalAP(null);setDismissReasonAP("");}}}>
        <div className="card" style={{width:"100%",maxWidth:480,margin:20,maxHeight:"85vh",overflowY:"auto"}}>
          <div className="card-header"><span className="card-title">Dismiss Detection — {nameFromEmail(dismissModalAP.email)}</span></div>
          <div style={{fontSize:13,color:"var(--tx2)",marginBottom:12}}>{dismissModalAP.reason}</div>
          <div className="form-group">
            <label className="form-label">Reason for dismissal (required — visible to your supervisor)</label>
            <textarea className="form-input" rows={3} value={dismissReasonAP} onChange={e=>setDismissReasonAP(e.target.value)} placeholder="Why is this detection being dismissed?" style={{resize:"vertical"}}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button className="btn btn-primary" disabled={!dismissReasonAP.trim()} onClick={async()=>{
              await dismissDetectionDB(dismissModalAP.email, dismissReasonAP.trim());
              setDismissModalAP(null);setDismissReasonAP("");
            }}>Confirm dismissal</button>
            <button className="btn btn-outline" onClick={()=>{setDismissModalAP(null);setDismissReasonAP("");}}>Cancel</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
