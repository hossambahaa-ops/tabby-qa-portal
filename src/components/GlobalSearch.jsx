import React, { useState, useEffect, useRef } from "react";
import { ROLE_LABELS } from "../lib/constants.js";
import { sb } from "../lib/supabase.js";
import { listProfiles } from "../api/profiles.js";
import { listViolations } from "../api/violations.js";
import { listEscalations } from "../api/escalations.js";
import { useApp } from "../lib/AppContext.jsx";
import { nameFromEmail } from "../lib/utils.js";

function GlobalSearch({ onNavigate, onClose }) {
  const{token}=useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        // PostgREST: use * (not %) as the ilike wildcard — bare % in a
        // URL is mis-parsed as a percent-encoded byte by edges/CDNs
        // and the request is dropped before CORS headers are added.
        // Also drop any commas in the user's query because PostgREST
        // uses comma as the in/or separator inside filter values.
        const q = query.toLowerCase().replace(/,/g, " ");
        const [profiles, violations, damFlags, escalations] = await Promise.all([
          listProfiles({ token, filters: `or=(email.ilike.*${q}*,display_name.ilike.*${q}*)&limit=5`, cache: false }),
          listViolations({ token, select: "id,qa_email,violation_type,status", filters: `qa_email.ilike.*${q}*&limit=5` }),
          sb.query("dam_flags", { select: "id,qa_email,dam_rules(name)", filters: `qa_email.ilike.*${q}*&limit=5`, token }).catch(() => []),
          listEscalations({ token, select: "id,category,about_person,status", filters: `or=(about_person.ilike.*${q}*,category.ilike.*${q}*)&limit=5` }),
        ]);
        const all = [
          ...profiles.map(p => ({ id: p.id, type: "profile", label: nameFromEmail(p.email), sub: `${ROLE_LABELS[p.role]} · ${p.email}`, page: "profile" })),
          ...violations.map(v => ({ id: v.id, type: "violation", label: v.violation_type, sub: v.qa_email?.split("\n")[0], page: "quality" })),
          ...damFlags.map(f => ({ id: f.id, type: "dam", label: f.dam_rules?.name || "DAM Flag", sub: f.qa_email, page: "quality" })),
          ...escalations.map(e => ({ id: e.id, type: "escalation", label: e.category, sub: e.about_person || "—", page: "escalations" })),
        ];
        setResults(all);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [query, token]);

  const typeColors = { profile: { bg: "var(--accent-light)", color: "var(--accent-text)" }, violation: { bg: "var(--red-bg)", color: "var(--red)" }, dam: { bg: "var(--amber-bg)", color: "var(--amber)" }, escalation: { bg: "#EDE9FE", color: "#7C3AED" } };

  return (
    <div className="search-overlay" role="dialog" aria-label="Global search" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-box">
        <input ref={inputRef} className="search-input" aria-label="Search QAs, violations, flags, escalations" placeholder="Search QAs, violations, flags, escalations..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Escape") onClose(); }} />
        {/* Quick actions when no query */}
        {query.length < 2 && <div className="search-results">
          <div style={{padding:"8px 16px 4px",fontSize:10,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:".5px"}}>Quick actions</div>
          {[
            {icon:"📋",label:"Log Coaching",sub:"Open coaching composer",page:"quality",qcTab:"coaching"},
            {icon:"👤",label:"Check QA Profile",sub:"View any QA's performance",page:"profile"},
            {icon:"📊",label:"Leaderboard",sub:"See team rankings",page:"leaderboard"},
            {icon:"🎯",label:"MTD",sub:"Month-to-date team performance",page:"scores"},
            {icon:"⚠️",label:"DAM Flags",sub:"Review pending flags",page:"quality",qcTab:"dam"},
            {icon:"📅",label:"Attendance",sub:"Schedule & attendance for the month",page:"schedule"},
          ].map(a => (
            <div key={a.label} className="search-result" onClick={() => { onNavigate(a.page); if(a.qcTab) setTimeout(()=>window.dispatchEvent(new CustomEvent("qc-tab",{detail:a.qcTab})),100); onClose(); }}>
              <span style={{fontSize:18,width:28,textAlign:"center"}}>{a.icon}</span>
              <div><div style={{fontWeight:500}}>{a.label}</div><div style={{fontSize:11,color:"var(--tx3)"}}>{a.sub}</div></div>
            </div>
          ))}
        </div>}
        {results.length > 0 && <div className="search-results">
          {results.map(r => {
            const tc = typeColors[r.type] || {};
            return <div key={r.type + r.id} className="search-result" onClick={() => { onNavigate(r.page); onClose(); }}>
              <span className="search-result-type" style={{ background: tc.bg, color: tc.color }}>{r.type}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{r.label}</div>
                <div style={{ fontSize: 11, color: "var(--tx3)" }}>{r.sub}</div>
              </div>
            </div>;
          })}
        </div>}
        {query.length >= 2 && results.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>No results found</div>}
      </div>
    </div>
  );
}

export default GlobalSearch;
