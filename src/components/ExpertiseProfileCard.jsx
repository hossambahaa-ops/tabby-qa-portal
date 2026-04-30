import React, { useState, useEffect } from "react";
import { useApp } from "../lib/AppContext.jsx";
import { fetchExpertise, renderStars, starColor, starLabel, productColor } from "../lib/expertise.js";

const fmtScore = (v) => Number(v || 0).toFixed(2);

const TopicChip = ({ topic, strength }) => {
  const tone = strength === "champion"
    ? { bg: "var(--green-bg)", color: "var(--green)" }
    : { bg: "var(--blue-bg)", color: "var(--blue)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 10,
      background: tone.bg, color: tone.color,
      whiteSpace: "nowrap",
    }}>{topic}</span>
  );
};

const ProductBar = ({ label, value, max = 3 }) => {
  const pct = Math.min(100, (Number(value || 0) / max) * 100);
  const c = productColor(label);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--tx2)" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>{fmtScore(value)}</span>
      </div>
      <div style={{ height: 5, background: "var(--bd)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: c, borderRadius: 3, transition: "width .3s" }} />
      </div>
    </div>
  );
};

/**
 * <ExpertiseProfileCard qaEmail="..." month="Apr-2026" />
 *
 * Drops onto the QA Profile page to show that QA's expertise snapshot
 * for the chosen month. Pulls a single qa_expertise row and renders
 * stars, score, champion/solid chips, and product sub-score bars.
 */
export default function ExpertiseProfileCard({ qaEmail, month }) {
  const { token } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !qaEmail || !month) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchExpertise({ token, month, qaEmail }).then(rows => {
      if (cancelled) return;
      setData(rows && rows[0] ? rows[0] : null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token, qaEmail, month]);

  if (loading) {
    return <div className="card" style={{ marginBottom: 16, padding: 20, color: "var(--tx3)", fontSize: 13 }}>Loading expertise…</div>;
  }
  if (!data) {
    return (
      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div className="card-header" style={{ padding: 0, marginBottom: 8 }}>
          <span className="card-title">Expertise — {month}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: "var(--amber-bg)", color: "var(--amber)", letterSpacing: ".5px" }}>PILOT</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>No expertise data for this month yet. Needs CSAT data with at least 5 surveys per topic.</div>
      </div>
    );
  }

  const lvl = Number(data.star_level) || 0;
  // Distinguish "no stars due to low rank" from "no stars due to no
  // sample" — the former is real performance signal, the latter is
  // just "we don't have enough surveys to evaluate yet".
  const hasSample = Array.isArray(data.topic_breakdown) && data.topic_breakdown.length > 0;
  const lowSample = lvl === 0 && !hasSample;
  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}>
      <div className="card-header" style={{ padding: 0, marginBottom: 12, display: "flex", alignItems: "center" }}>
        <span className="card-title">Expertise — {month}</span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: "var(--amber-bg)", color: "var(--amber)", letterSpacing: ".5px", marginLeft: "auto" }}>PILOT</span>
      </div>

      {/* Hero: big stars + score + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 14, borderBottom: "1px solid var(--bd2)", marginBottom: 14 }}>
        <div style={{ fontSize: 36, lineHeight: 1, color: starColor(lvl), filter: lvl === 0 ? "grayscale(1) opacity(0.4)" : "none" }}>
          {lvl > 0 ? renderStars(lvl) : "☆☆☆"}
        </div>
        <div style={{ flex: 1 }}>
          {lowSample ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--tx2)", letterSpacing: "-.2px" }}>Not enough sample yet</div>
              <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 2 }}>No topic met the survey threshold this month — keep handling chats and the score will follow.</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.5px", color: starColor(lvl), fontVariantNumeric: "tabular-nums" }}>
                {fmtScore(data.expertise_score)}
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--tx3)", marginLeft: 6 }}>expertise score</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--tx2)", marginTop: 2 }}>{starLabel(lvl)}</div>
            </>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>Qualified topics</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)" }}>{data.total_qualified_topics || 0}</div>
        </div>
      </div>

      {/* Topic chips */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>
          <span style={{ color: "var(--green)" }}>Champion</span> · top 10% on a topic
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {(data.champion_topics || []).length > 0
            ? data.champion_topics.map(t => <TopicChip key={t} topic={t} strength="champion" />)
            : <span style={{ fontSize: 12, color: "var(--tx3)" }}>None yet</span>}
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>
          <span style={{ color: "var(--blue)" }}>Solid</span> · top 30% on a topic
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {(data.solid_topics || []).length > 0
            ? data.solid_topics.map(t => <TopicChip key={t} topic={t} strength="solid" />)
            : <span style={{ fontSize: 12, color: "var(--tx3)" }}>None yet</span>}
        </div>
      </div>

      {/* Product sub-scores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, paddingTop: 12, borderTop: "1px solid var(--bd2)" }}>
        <ProductBar label="BNPL" value={data.bnpl_score} />
        <ProductBar label="Card" value={data.card_score} />
        <ProductBar label="Universal" value={data.universal_score} />
      </div>
    </div>
  );
}
