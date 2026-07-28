import React from "react";
import SearchableSelect from "./SearchableSelect.jsx";

// Shared From→To month range control used by MTD / CSAT / Leaderboard /
// QA Profile so the interaction is identical everywhere.
//
//   from === ""            → single-month mode (classic behaviour, unchanged)
//   from set and !== to    → range mode; the page rolls months up per QA
//
// IMPORTANT: this renders ONE element, not two sibling selects. PageFilters
// wraps every child in its own flex slot and the strip has flex-wrap, so a
// fragment of two selects could break across lines (the "From" ending up on a
// row above the month). Keeping them in a single nowrap group means they always
// travel together and read as one "From → To" control.
export default function MonthRangePicker({ months = [], from, to, onFrom, onTo, toPlaceholder = "Select month" }) {
  const fromOptions = [
    { value: "", label: "Single month" },
    ...months.map((m) => ({ value: m, label: m })),
  ];
  const toOptions = months.map((m) => ({ value: m, label: m }));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
      <SearchableSelect options={fromOptions} value={from} onChange={onFrom} placeholder="Single month" />
      <span aria-hidden="true" style={{ flex: "none", fontSize: 12, color: "var(--tx3)", lineHeight: 1 }}>→</span>
      <SearchableSelect options={toOptions} value={to} onChange={onTo} placeholder={toPlaceholder} />
    </div>
  );
}
