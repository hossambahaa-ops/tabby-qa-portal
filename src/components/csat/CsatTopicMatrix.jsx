import React from "react";

const nameFromEmail = (email) => {
  if (!email) return "—";
  const local = email.split("@")[0];
  return local.split(".").map(p => {
    const c = p.replace(/[\d]+$/, "");
    return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
  }).filter(Boolean).join(" ");
};

// Short topic label: split on " - " ("Category - Subcategory") and show
// the subcategory if present so the rotated header stays legible. Full
// label is in the tooltip.
const shortTopic = (t) => {
  const parts = t.split(" - ").map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];
  return t.length > 24 ? t.slice(0, 22) + "…" : t;
};

// Muted HSL gradient 0 (red) → 120 (green). Low-alpha tinted background
// + a medium-saturation mid-lightness foreground so the cells read on
// both the dark and the light app themes.
const cellStyle = (score, surveys) => {
  if (score == null || !surveys || surveys <= 0) {
    return { background: "transparent", color: "var(--tx3)", fontWeight: 400 };
  }
  const hue = Math.max(0, Math.min(120, Math.round((score / 100) * 120)));
  return {
    background: `hsla(${hue}, 55%, 50%, 0.18)`,
    color: `hsl(${hue}, 65%, 42%)`,
    fontWeight: 600,
  };
};

// Per-(specialist × topic) heatmap rendered when CSAT page is in "By Topic"
// mode. Owns its own sort + visible-rows derivation so the parent only
// passes raw inputs (matrix, csatSorted, sort state, threshold, loading).
export default function CsatTopicMatrix({
  matrix,
  csatSorted,
  topicSort,
  setTopicSort,
  topicMinSurveys,
  topicMatrixLoading,
  selMonth,
}) {
  if (topicMatrixLoading) {
    return <div className="placeholder" style={{ padding: 40, color: "var(--tx3)" }}>Loading topic matrix…</div>;
  }
  if (!matrix || matrix.topics.length === 0) {
    return <div className="placeholder" style={{ padding: 40, color: "var(--tx3)" }}>No per-topic CSAT data for {selMonth}.</div>;
  }

  const visibleTopics = matrix.topics.filter(t => (matrix.totalsByTopic[t]?.s || 0) >= Math.max(1, topicMinSurveys));

  // Only show specialists who have at least one survey in the visible
  // topics — otherwise the matrix is hundreds of blank rows.
  const visibleAgents = (() => {
    const base = csatSorted.filter(r => {
      const a = matrix.totalsByAgent[r.qa_email];
      if (!a || a.s <= 0) return false;
      return visibleTopics.some(t => matrix.cells[r.qa_email + "\u0000" + t]?.surveys > 0);
    });
    const dirMul = topicSort.dir === "asc" ? 1 : -1;
    const overallOf = (r) => {
      const t = matrix.totalsByAgent[r.qa_email];
      return t && t.n > 0 ? t.w / t.n : null;
    };
    if (topicSort.key === "__name__") {
      return base.sort((a, b) => dirMul * nameFromEmail(a.qa_email).localeCompare(nameFromEmail(b.qa_email)));
    }
    if (topicSort.key && topicSort.key !== "__overall__") {
      return base.sort((a, b) => {
        const ca = matrix.cells[a.qa_email + "\u0000" + topicSort.key];
        const cb = matrix.cells[b.qa_email + "\u0000" + topicSort.key];
        const sa = ca && ca.surveys > 0 ? ca.score : null;
        const sb = cb && cb.surveys > 0 ? cb.score : null;
        const na = ca?.surveys || 0;
        const nb = cb?.surveys || 0;
        if (sa == null && sb == null) return (overallOf(b) ?? -1) - (overallOf(a) ?? -1);
        if (sa == null) return 1;
        if (sb == null) return -1;
        // Primary: score (asc/desc per dirMul). Tiebreaker: survey count
        // descending — a 100% over 4 surveys ranks above 100% over 3.
        if (sa !== sb) return dirMul * (sa - sb);
        return nb - na;
      });
    }
    return base.sort((a, b) => {
      const oa = overallOf(a) ?? -1;
      const ob = overallOf(b) ?? -1;
      if (oa !== ob) return dirMul * (oa - ob);
      // Tiebreaker: more surveys → higher row (consistent with per-topic sort).
      return (matrix.totalsByAgent[b.qa_email]?.s || 0) - (matrix.totalsByAgent[a.qa_email]?.s || 0);
    });
  })();

  if (visibleTopics.length === 0) {
    return <div className="placeholder" style={{ padding: 40, color: "var(--tx3)" }}>No topics with ≥ {topicMinSurveys} surveys. Lower the threshold.</div>;
  }
  if (visibleAgents.length === 0) {
    return <div className="placeholder" style={{ padding: 40, color: "var(--tx3)" }}>No specialists have surveys in {selMonth}.</div>;
  }

  const sortArrow = (key) => {
    if (topicSort.key !== key) return null;
    return topicSort.dir === "asc" ? " ▲" : " ▼";
  };
  const toggleSort = (key) => {
    setTopicSort(prev => {
      if (prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return { key: null, dir: "desc" };
    });
  };

  return (
    <div style={{ padding: "0 0 12px" }}>
      <div style={{ overflow: "auto", maxHeight: "72vh", borderTop: "1px solid var(--bd2)" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 12, width: "100%" }}>
          <thead>
            <tr>
              <th onClick={() => toggleSort("__name__")} title="Sort by specialist name"
                  style={{ position: "sticky", left: 0, top: 0, zIndex: 3, background: "var(--bg2)", padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--bd2)", borderRight: "1px solid var(--bd2)", minWidth: 210, fontSize: 10, color: topicSort.key === "__name__" ? "var(--accent-text)" : "var(--tx3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", verticalAlign: "bottom", cursor: "pointer", userSelect: "none" }}>
                Specialist{sortArrow("__name__")}
              </th>
              {visibleTopics.map(t => {
                const isActive = topicSort.key === t;
                return <th key={t} onClick={() => toggleSort(t)}
                    title={`${t}\n${matrix.totalsByTopic[t]?.s || 0} surveys across team\nClick to sort`}
                    style={{ position: "sticky", top: 0, zIndex: 2, background: isActive ? "var(--accent-light)" : "var(--bg2)", padding: "6px 2px 8px", textAlign: "center", borderBottom: "1px solid var(--bd2)", verticalAlign: "bottom", height: 96, minWidth: 36, maxWidth: 36, width: 36, cursor: "pointer", userSelect: "none" }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", fontSize: 10, color: isActive ? "var(--accent-text)" : "var(--tx2)", fontWeight: isActive ? 700 : 600, letterSpacing: ".2px", maxHeight: 82, overflow: "hidden", textOverflow: "ellipsis" }}>{shortTopic(t)}{sortArrow(t)}</div>
                </th>;
              })}
              <th onClick={() => toggleSort("__overall__")} title="Sort by overall CSAT"
                  style={{ position: "sticky", top: 0, right: 0, zIndex: 3, background: "var(--bg2)", padding: "10px 12px", textAlign: "center", borderBottom: "1px solid var(--bd2)", borderLeft: "1px solid var(--bd2)", fontSize: 10, color: (topicSort.key === null || topicSort.key === "__overall__") ? "var(--accent-text)" : "var(--tx3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", minWidth: 72, verticalAlign: "bottom", cursor: "pointer", userSelect: "none" }}>
                Overall{sortArrow("__overall__")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleAgents.map((r, ri) => {
              const email = r.qa_email;
              const agentTot = matrix.totalsByAgent[email];
              const overall = agentTot && agentTot.n > 0 ? agentTot.w / agentTot.n : null;
              const rowBg = ri % 2 === 0 ? "var(--bg)" : "var(--bg2)";
              return <tr key={email}>
                <td style={{ position: "sticky", left: 0, zIndex: 1, background: rowBg, padding: "6px 12px", borderBottom: "1px solid var(--bd2)", borderRight: "1px solid var(--bd2)", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>
                      {nameFromEmail(email).split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--tx)" }}>{nameFromEmail(email)}</span>
                    <span style={{ fontSize: 10, color: "var(--tx3)" }}>· {agentTot.s}</span>
                  </div>
                </td>
                {visibleTopics.map(t => {
                  const cell = matrix.cells[email + "\u0000" + t];
                  const score = cell?.score ?? null;
                  const surveys = cell?.surveys ?? 0;
                  const st = cellStyle(score, surveys);
                  return <td key={t} title={score != null && surveys > 0 ? `${nameFromEmail(email)} · ${t}\n${score.toFixed(1)}% (${surveys} survey${surveys !== 1 ? "s" : ""})` : `${nameFromEmail(email)} · ${t}\nNo surveys`}
                             style={{ padding: 0, borderBottom: "1px solid var(--bd2)", textAlign: "center", minWidth: 36, maxWidth: 36, width: 36, height: 30, fontSize: 11, ...st, background: surveys > 0 ? st.background : rowBg }}>
                    {score != null && surveys > 0 ? Math.round(score) : ""}
                  </td>;
                })}
                <td style={{ padding: "0 10px", borderBottom: "1px solid var(--bd2)", borderLeft: "1px solid var(--bd2)", textAlign: "center", fontWeight: 700, fontSize: 12, ...cellStyle(overall, agentTot?.s || 0) }}
                    title={`${agentTot.s} survey${agentTot.s !== 1 ? "s" : ""} · weighted across topics`}>
                  {overall != null ? overall.toFixed(1) + "%" : "—"}
                </td>
              </tr>;
            })}
            <tr>
              <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--bg3,var(--bg2))", padding: "8px 12px", borderTop: "2px solid var(--bd2)", borderRight: "1px solid var(--bd2)", fontSize: 10, color: "var(--tx3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px" }}>Topic overall</td>
              {visibleTopics.map(t => {
                const tt = matrix.totalsByTopic[t];
                const avg = tt && tt.n > 0 ? tt.w / tt.n : null;
                return <td key={t} style={{ padding: 0, borderTop: "2px solid var(--bd2)", textAlign: "center", fontSize: 11, fontWeight: 700, minWidth: 36, maxWidth: 36, width: 36, height: 32, ...cellStyle(avg, tt?.s || 0) }}
                           title={`${t}\n${avg != null ? avg.toFixed(1) + "%" : "—"} · ${tt?.s || 0} surveys`}>
                  {avg != null ? Math.round(avg) : ""}
                </td>;
              })}
              <td style={{ padding: "8px 10px", borderTop: "2px solid var(--bd2)", borderLeft: "1px solid var(--bd2)", textAlign: "center", fontSize: 11, color: "var(--tx3)" }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 0", fontSize: 11, color: "var(--tx3)" }}>
        <span>{visibleAgents.length} of {csatSorted.length} specialists shown · {visibleTopics.length} of {matrix.topics.length} topics</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Low</span>
          {[0, 20, 40, 60, 80, 100].map(v => <span key={v} style={{ display: "inline-block", width: 18, height: 14, background: `hsla(${Math.round((v / 100) * 120)}, 55%, 50%, 0.35)`, borderRadius: 3 }} />)}
          <span>High</span>
        </div>
      </div>
    </div>
  );
}
