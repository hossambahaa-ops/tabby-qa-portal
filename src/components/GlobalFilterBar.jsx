import React, { useState, useEffect } from "react";
import { hasRole, defaultFilters } from "../lib/constants.js";
import SearchableSelect from "./SearchableSelect.jsx";

function GlobalFilterBar({ filters, setFilters, months, teams, roster, profile, role }) {
  const isSv = hasRole(role, "qa_supervisor") && !hasRole(role, "admin");
  const isQa = role === "qa";

  // Build people options from roster
  const peopleOptions = [...new Set(roster.map(r => r.email).filter(Boolean))].sort().map(e => ({
    value: e,
    label: e.split("@")[0].split(".").map(p => p.replace(/[\d]+$/, "")).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") + ` (${e.split("@")[1]})`,
  }));

  const teamOptions = [...new Set(roster.map(r => r.queue).filter(Boolean))].sort();
  const domainOptions = [{ value: "tabby.ai", label: "tabby.ai" }, { value: "tabby.sa", label: "tabby.sa" }];

  // Lock domain for supervisors
  useEffect(() => {
    if (isSv && !filters.domain) {
      const svDomain = profile?.operational_domain || profile?.domain || "tabby.ai";
      setFilters(f => ({ ...f, domain: svDomain }));
    }
  }, [isSv, profile]);

  if (isQa) return null; // QAs don't see global filters

  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 24px",
      borderBottom: "1px solid var(--bd2)", background: "var(--bg)", fontSize: 12,
    }}>
      <span style={{ color: "var(--tx3)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".8px" }}>Filters</span>
      <div style={{ width: 1, height: 16, background: "var(--bd)" }}/>

      <SearchableSelect
        options={domainOptions}
        value={filters.domain}
        onChange={v => setFilters(f => ({ ...f, domain: v, teams: [], people: [] }))}
        placeholder="All domains"
        disabled={isSv}
      />

      <SearchableSelect
        options={teamOptions}
        value={filters.teams}
        onChange={v => setFilters(f => ({ ...f, teams: v }))}
        placeholder="All teams"
        multi
      />

      {months.length > 0 && <SearchableSelect
        options={months}
        value={filters.month}
        onChange={v => setFilters(f => ({ ...f, month: v }))}
        placeholder="Latest month"
      />}

      <SearchableSelect
        options={peopleOptions}
        value={filters.people}
        onChange={v => setFilters(f => ({ ...f, people: v }))}
        placeholder="All people"
        multi
      />

      {(filters.domain || filters.teams.length > 0 || filters.month || filters.people.length > 0) &&
        <button onClick={() => setFilters({ ...defaultFilters, domain: isSv ? filters.domain : "" })} style={{
          background: "none", border: "none", color: "var(--red)", fontSize: 11, cursor: "pointer",
          fontFamily: "var(--font)", fontWeight: 500, padding: "4px 8px",
        }}>Clear all</button>
      }
    </div>
  );
}
export default GlobalFilterBar;
