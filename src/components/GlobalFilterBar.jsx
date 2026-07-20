import React from "react";
import { defaultFilters } from "../lib/constants.js";
import SearchableSelect from "./SearchableSelect.jsx";

// Slim global bar — only the two dimensions that mean something on
// every filterable page: time scope (month) + org scope (domain).
// Per-page filters (team, people, lead, search, etc.) live in the new
// <PageFilters> strip directly under this bar so the location is
// always the same and there are no dead controls.
//
// Rendered ONLY on routes that actually consume gf — see the
// SHOW_GLOBAL_FILTER_PAGES allow-list in App.jsx. Everywhere else the
// bar is absent rather than inert, so there is never a global Month
// sitting next to a page's own month picker.

function GlobalFilterBar({ filters, setFilters, months, role }) {
  if (role === "qa") return null; // QAs don't see global filters

  const domainOptions = [
    { value: "tabby.ai", label: "tabby.ai" },
    { value: "tabby.sa", label: "tabby.sa" },
  ];

  const isDirty = !!filters.domain || !!filters.month;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "8px 24px",
        borderBottom: "1px solid var(--bd2)",
        background: "var(--bg)",
        fontSize: 12,
      }}
    >
      <span
        style={{
          color: "var(--tx3)",
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: ".8px",
        }}
      >
        Global
      </span>
      <div style={{ width: 1, height: 16, background: "var(--bd)" }} />

      {months?.length > 0 && (
        <SearchableSelect
          options={months}
          value={filters.month}
          onChange={(v) => setFilters((f) => ({ ...f, month: v }))}
          placeholder="Latest month"
        />
      )}

      <SearchableSelect
        options={domainOptions}
        value={filters.domain}
        onChange={(v) => setFilters((f) => ({ ...f, domain: v }))}
        placeholder="All domains"
      />

      {isDirty && (
        <button
          onClick={() => setFilters({ ...defaultFilters })}
          style={{
            background: "none",
            border: "none",
            color: "var(--red)",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "var(--font)",
            fontWeight: 500,
            padding: "4px 8px",
          }}
        >
          × Clear
        </button>
      )}
    </div>
  );
}

export default GlobalFilterBar;
