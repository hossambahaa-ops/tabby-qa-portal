import React, { useState, useEffect } from "react";
import { SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";
import { hasRole } from "../../lib/constants.js";

const nameFromEmail = (email) => {
  if (!email) return "—";
  const local = email.split("@")[0];
  return local.split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
};

function BalanceBar({ used, total, color }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const remaining = total - used;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "var(--bd)", borderRadius: 3, overflow: "hidden", minWidth: 80 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: remaining <= 3 ? 700 : 400, color: remaining <= 0 ? "var(--red)" : remaining <= 3 ? "var(--amber)" : "var(--tx3)", minWidth: 44, textAlign: "right", whiteSpace: "nowrap" }}>
        {remaining} / {total}
      </span>
    </div>
  );
}

export default function LeaveBalances({ visibleQAs, token, profile, myEmail, globalToast }) {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const isQARole = profile?.role === "qa" || profile?.role === "senior_qa";

  useEffect(() => {
    if (!visibleQAs.length) { setBalances([]); setLoading(false); return; }
    setLoading(true);
    const emails = visibleQAs.map(q => q.email?.toLowerCase()).filter(Boolean);
    // build in.(a,b,c) — values don't need URL-encoding inside the parens for PostgREST
    const inList = emails.map(e => `"${e}"`).join(",");
    fetch(
      `${SUPABASE_URL}/rest/v1/qa_leave_balance_v?year=eq.${year}&qa_email=in.(${inList})&order=qa_email.asc`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } }
    )
      .then(r => r.json())
      .then(data => { setBalances(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(e => { console.error("Leave balances:", e); globalToast?.("error", "Could not load balances"); setLoading(false); });
  }, [token, year, visibleQAs.length]);

  const rows = isQARole ? balances.filter(b => b.qa_email?.toLowerCase() === myEmail) : balances;

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--tx)" }}>Leave Balances</div>
          <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 2 }}>Annual leave and Tabby Day — approved usage only</div>
        </div>
        <select
          className="form-input"
          style={{ width: 90, fontSize: 12 }}
          value={year}
          onChange={e => setYear(Number(e.target.value))}
        >
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: "36px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--tx3)" }}>
            No balance data for {year}.{" "}
            {!isQARole && <span>Allowances are seeded from the roster — contact admin if missing.</span>}
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--bd)", background: "var(--bg3)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>QA</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 600, color: "var(--tx2)", fontSize: 11 }}>AL used</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--tx2)", fontSize: 11, minWidth: 160 }}>Annual leave remaining</th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 600, color: "#A855F7", fontSize: 11 }}>Tabby Day</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(b => {
                const alRemaining = (b.al_allowance || 21) - (b.al_used || 0);
                const tdRemaining = (b.tabby_day_allowance || 1) - (b.tabby_day_used || 0);
                return (
                  <tr key={b.qa_email} style={{ borderBottom: "1px solid var(--bd)" }}>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--accent-text)", flexShrink: 0 }}>
                          {nameFromEmail(b.qa_email).split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{nameFromEmail(b.qa_email)}</div>
                          <div style={{ fontSize: 10, color: "var(--tx3)" }}>{b.qa_email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: (b.al_used || 0) > 0 ? "var(--red)" : "var(--tx3)" }}>
                        {b.al_used || 0}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--tx3)" }}> / {b.al_allowance || 21}</span>
                    </td>
                    <td style={{ padding: "13px 16px", paddingRight: 24 }}>
                      <BalanceBar used={b.al_used || 0} total={b.al_allowance || 21} color="var(--red)" />
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "center" }}>
                      <span style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 10,
                        background: tdRemaining > 0 ? "#A855F720" : "var(--bg3)",
                        color: tdRemaining > 0 ? "#A855F7" : "var(--tx3)",
                        fontWeight: 700,
                        border: `1px solid ${tdRemaining > 0 ? "#A855F740" : "var(--bd)"}`,
                      }}>
                        {b.tabby_day_used || 0} / {b.tabby_day_allowance || 1}
                        {tdRemaining > 0 && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>✓ available</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "var(--tx3)" }}>
        AL allowance: 21 days/year · Tabby Day: 1 day/year · Counts approved records only
      </div>
    </div>
  );
}
