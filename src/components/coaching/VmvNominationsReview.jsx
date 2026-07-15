import React, { useState, useEffect } from "react";
import { sb } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { nameFromEmail } from "../../lib/utils.js";
import EmptyState from "../EmptyState.jsx";
import { currentMonthLabel } from "./VmvNominationSection.jsx";

// Leadership roll-up of VMV nominations. RLS lets supervisors/admins read
// everything (leads only their own — this tab is gated to supervisor+).
// Grouped by nominee so reviewers can see who's been nominated, by whom,
// and why, when picking the month's VMV recognition.
export default function VmvNominationsReview() {
  const { token } = useApp();
  const [rows, setRows] = useState([]);
  const [month, setMonth] = useState(currentMonthLabel());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (async () => {
      const data = await sb.query("vmv_nominations", {
        token, select: "id,nominee_email,nominated_by,reason,month,created_at",
        filters: "order=created_at.desc&limit=500",
      }).catch(() => []);
      setRows(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
  }, [token]);

  // Months present in the data (recency order via created_at desc), current first.
  const months = [];
  for (const r of rows) if (!months.includes(r.month)) months.push(r.month);
  if (!months.includes(currentMonthLabel())) months.unshift(currentMonthLabel());

  const forMonth = rows.filter(r => r.month === month);
  // Group by nominee.
  const byNominee = {};
  for (const r of forMonth) (byNominee[r.nominee_email.toLowerCase()] = byNominee[r.nominee_email.toLowerCase()] || []).push(r);
  const nominees = Object.keys(byNominee).sort((a, b) => byNominee[b].length - byNominee[a].length || a.localeCompare(b));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🌟 VMV Nominations</span>
        <select className="select form-input" value={month} onChange={e => setMonth(e.target.value)} style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {forMonth.length > 0 && <span style={{ padding: "2px 10px", borderRadius: 12, background: "var(--primary-light)", color: "var(--primary-text,var(--tabby-purple))", fontSize: 12, fontWeight: 600 }}>{forMonth.length} nomination{forMonth.length > 1 ? "s" : ""} · {nominees.length} {nominees.length > 1 ? "people" : "person"}</span>}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 20, color: "var(--tx3)", fontSize: 13, textAlign: "center" }}>Loading…</div>
      ) : forMonth.length === 0 ? (
        <div className="card"><EmptyState illus="check" title={`No VMV nominations for ${month}`} description="Nominations leads submit during their Monthly Performance Reviews will appear here." /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {nominees.map(key => {
            const list = byNominee[key];
            return (
              <div key={key} className="card" style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{nameFromEmail(list[0].nominee_email)}</span>
                  <span style={{ fontSize: 11, color: "var(--tx3)" }}>{list[0].nominee_email}</span>
                  {list.length > 1 && <span style={{ padding: "1px 8px", borderRadius: 10, background: "var(--green-bg)", color: "var(--green)", fontSize: 11, fontWeight: 700 }}>{list.length} nominations</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {list.map(n => (
                    <div key={n.id} style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--bd2)" }}>
                      <div style={{ fontSize: 13, color: "var(--tx1)", lineHeight: 1.5 }}>{n.reason || "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Nominated by {nameFromEmail(n.nominated_by)} · {new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
