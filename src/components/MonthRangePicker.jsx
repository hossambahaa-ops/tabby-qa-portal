import React from "react";
import SearchableSelect from "./SearchableSelect.jsx";

// Shared From→To month range control used by MTD / CSAT / Leaderboard /
// QA Profile so the interaction is identical everywhere.
//
//   from === ""            → single-month mode (classic behaviour, unchanged)
//   from set and !== to    → range mode; the page rolls months up per QA
//
// Renders as TWO selects so it drops straight into the existing PageFilters
// strip without any layout change. `months` must be newest-first.
export default function MonthRangePicker({ months = [], from, to, onFrom, onTo, toPlaceholder = "Select month" }) {
  const fromOptions = [
    { value: "", label: "From: single month" },
    ...months.map((m) => ({ value: m, label: "From " + m })),
  ];
  const toOptions = months.map((m) => ({
    value: m,
    label: from && from !== m ? "To " + m : m,
  }));
  return (
    <>
      <SearchableSelect options={fromOptions} value={from} onChange={onFrom} placeholder="From (range)" />
      <SearchableSelect options={toOptions} value={to} onChange={onTo} placeholder={toPlaceholder} />
    </>
  );
}
