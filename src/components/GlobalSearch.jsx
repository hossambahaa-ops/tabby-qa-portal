import React, { useState, useEffect, useRef } from "react";
import { ROLE_LABELS } from "../lib/constants.js";
import { sb } from "../lib/supabase.js";

function GlobalSearch({ token, onNavigate, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const q = query.toLowerCase();
        const [profiles, violations, damFlags, escalations] = await Promise.all([
          sb.query("profiles", { select: "id,email,display_name,role", filters: `or=(email.ilike.%${q}%,display_name.ilike.%${q}%)&limit=5`, token }).catch(() => []),
          sb.query("coaching_violations", { select: "id,qa_emails,violation_type,status", filters: `qa_emails.ilike.%${q}%&limit=5`, token }).catch(() => []),
          sb.query("dam_flags", { select: "id,qa_email,dam_rules(name)", filters: `qa_email.ilike.%${q}%&limit=5`, token }).catch(() => []),
          sb.query("escalations", { select: "id,category,about_person,status", filters: `or=(about_person.ilike.%${q}%,category.ilike.%${q}%)&limit=5`, token }).catch(() => []),
        ]);
        const all = [
          ...profiles.map(p => ({ id: p.id, type: "profile", label: p.display_name || p.email, sub: `${ROLE_LABELS[p.role]} · ${p.email}`, page: "admin" })),
          ...violations.map(v => ({ id: v.id, type: "violation", label: v.violation_type, sub: v.qa_emails?.split("\n")[0], page: "violations" })),
          ...damFlags.map(f => ({ id: f.id, type: "dam", label: f.dam_rules?.name || "DAM Flag", sub: f.qa_email, page: "dam" })),
          ...escalations.map(e => ({ id: e.id, type: "escalation", label: e.category, sub: e.about_person || "—", page: "escalations" })),
        ];
        setResults(all);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [query, token]);

  const typeColors = { profile: { bg: "var(--accent-light)", color: "var(--accent-text)" }, violation: { bg: "var(--red-bg)", color: "var(--red)" }, dam: { bg: "var(--amber-bg)", color: "var(--amber)" }, escalation: { bg: "#EDE9FE", color: "#7C3AED" } };

  return (
    <div className="search-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-box">
        <input ref={inputRef} className="search-input" placeholder="Search QAs, violations, flags, escalations..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Escape") onClose(); }} />
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
