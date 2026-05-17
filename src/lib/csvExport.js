// Shared CSV export utility. Used by pages that already had an
// inline implementation (Score Entry, Leaderboard, CSAT) and by the
// new exports on Tracker / Escalations / Coaching Violations /
// Audit Trail. Single source of truth so the escaping rules stay
// consistent — embedded commas, newlines, and quotes all handled.
//
// Usage:
//   const rows = filtered.map(r => ({ Date: r.date, Status: r.status, ... }));
//   downloadCsv("escalations_2026-05.csv", rows);
//
// Or with explicit columns when you want a specific order:
//   downloadCsv("violations.csv", filtered, [
//     { key: "qa_email", label: "QA" },
//     { key: "violation_type", label: "Type" },
//     ...
//   ]);

function escapeCell(v) {
  if (v == null) return "";
  let s = String(v);
  // Strip rich-text HTML before exporting — coaching session fields
  // can carry <p>, <ul>, etc. that look ugly in a spreadsheet.
  if (/<[a-z][^>]*>/i.test(s)) s = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // RFC 4180-ish: wrap in quotes if it contains comma, quote, newline.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows, columns) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  let cols = columns;
  if (!cols) {
    // Infer from first row's keys.
    cols = Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  }
  const header = cols.map((c) => escapeCell(c.label || c.key)).join(",");
  const body = rows.map((r) =>
    cols.map((c) => escapeCell(typeof c.value === "function" ? c.value(r) : r[c.key])).join(",")
  ).join("\n");
  return header + "\n" + body;
}

export function downloadCsv(filename, rows, columns) {
  const csv = rowsToCsv(rows, columns);
  // UTF-8 BOM so Excel opens accented chars correctly without
  // forcing the user into Data → From Text. Belt-and-suspenders.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
