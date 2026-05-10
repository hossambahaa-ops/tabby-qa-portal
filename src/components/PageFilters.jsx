import React from "react";

// Standard filter strip shown directly under the page title and above
// the first card on every filterable page. Replaces the per-page
// ad-hoc layouts (filters in card-headers, inline above tables, etc.)
// with one horizontal row that always sits in the same spot.
//
// Why this component exists:
//   * Before, each page rolled its own filter layout — some inside a
//     card, some above tabs, some as raw inputs. Visual scan failed.
//   * The "× Clear" button only existed on the global bar. Page-level
//     filters had no consistent reset, so users manually reverted each
//     dropdown.
//   * Search inputs were sometimes a SearchableSelect with no items,
//     sometimes a plain input, sometimes missing. Now there's one
//     `searchProps` slot, always rightmost.
//
// Usage:
//   <PageFilters onClear={() => { ... }} searchProps={{ value, onChange, placeholder }}>
//     <SearchableSelect ... />   // first slot — usually month
//     <SearchableSelect ... />   // second slot — usually domain
//     ...
//   </PageFilters>
//
// Props:
//   children       — the dropdowns / toggles for this page (left-to-right)
//   onClear        — called when the user clicks "× Clear". Pass null to hide.
//   searchProps    — { value, onChange, placeholder } for the rightmost
//                    search input. Pass null/undefined to omit the search.
//   sticky         — default true. Sticks just under the global bar.

export default function PageFilters({ children, onClear, searchProps, sticky = true }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "8px 24px",
        borderBottom: "1px solid var(--bd2)",
        background: "var(--bg)",
        fontSize: 12,
        position: sticky ? "sticky" : "static",
        top: sticky ? 0 : "auto",
        zIndex: 30,
      }}
    >
      {/* The slot row. Each child sits side-by-side at the left. */}
      {React.Children.toArray(children).filter(Boolean).map((child, i) => (
        <div key={i} style={{ minWidth: 0 }}>{child}</div>
      ))}

      {/* Right-aligned cluster: search input (always plain, always rightmost)
          + the standard "× Clear" button. */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {searchProps && (
          <input
            type="search"
            value={searchProps.value || ""}
            onChange={(e) => searchProps.onChange?.(e.target.value)}
            placeholder={searchProps.placeholder || "Search…"}
            style={{
              fontFamily: "var(--font)",
              fontSize: 12,
              padding: "5px 10px",
              border: "1px solid var(--bd)",
              borderRadius: "var(--radius)",
              background: "var(--bg3)",
              color: "var(--tx)",
              minWidth: 160,
            }}
          />
        )}
        {onClear && (
          <button
            type="button"
            onClick={onClear}
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
    </div>
  );
}
