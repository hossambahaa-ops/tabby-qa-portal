import React from "react";
import {
  QUALITY_VISION,
  QUALITY_MISSION,
  QUALITY_VALUES,
  QUALITY_TOV,
  principleOfTheDay,
} from "../lib/qualityPrinciples.js";

// Uses the app's design tokens (var(--tx*), --bg3, --bd, --accent) so the
// page follows the active light/dark theme instead of hardcoded colors.
const card = {
  border: "1px solid var(--bd)",
  borderRadius: 14,
  background: "var(--bg3)",
  padding: "18px 20px",
};

function Grid({ items, accent }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
      {items.map((it) => (
        <div key={it.name} style={{ ...card, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, flex: "none" }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--tx)", letterSpacing: "-.1px" }}>{it.name}</h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--tx2)" }}>{it.text}</p>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ kicker, title }) {
  return (
    <div style={{ margin: "30px 0 14px" }}>
      <div style={{ textTransform: "uppercase", letterSpacing: ".9px", fontSize: 10.5, fontWeight: 700, color: "var(--tx3)", marginBottom: 3 }}>{kicker}</div>
      <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "var(--tx)", letterSpacing: "-.3px" }}>{title}</h2>
    </div>
  );
}

export default function QualityDNAPage() {
  const p = principleOfTheDay();
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "6px 2px 56px", fontFamily: "var(--font)" }}>
      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.5px", color: "var(--tx)" }}>Quality DNA</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--tx2)", maxWidth: 640, lineHeight: 1.6 }}>
          Our vision, mission, values, and tone of voice — the standard we hold ourselves to, and the way we work with each other and our stakeholders.
        </p>
      </div>

      {/* Principle of the day */}
      {p && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, padding: "12px 16px", borderRadius: 12, background: "var(--bg3)", border: "1px solid var(--bd)", borderLeft: "3px solid var(--accent)" }}>
          <span aria-hidden style={{ fontSize: 16, color: "var(--accent)" }}>✦</span>
          <div>
            <span style={{ textTransform: "uppercase", letterSpacing: ".6px", fontSize: 10, fontWeight: 700, color: "var(--accent-text)", marginRight: 8 }}>Always remember</span>
            <span style={{ fontSize: 13.5, color: "var(--tx)" }}>{p.text}</span>
          </div>
        </div>
      )}

      {/* Vision */}
      <SectionTitle kicker={QUALITY_VISION.tagline} title={QUALITY_VISION.title} />
      <div style={{ ...card, borderLeft: "3px solid var(--accent)" }}>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: "var(--tx)", fontWeight: 500 }}>{QUALITY_VISION.text}</p>
      </div>

      {/* Mission */}
      <SectionTitle kicker={QUALITY_MISSION.tagline} title={QUALITY_MISSION.title} />
      <div style={card}>
        {QUALITY_MISSION.paragraphs.map((para, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : "10px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--tx2)" }}>{para}</p>
        ))}
      </div>

      {/* Values */}
      <SectionTitle kicker="A reflection not just of what we do, but how we do it" title="Quality Values" />
      <Grid items={QUALITY_VALUES} accent="var(--accent)" />

      {/* Tone of Voice */}
      <SectionTitle kicker="How we communicate, a mirror of our values" title="Tone of Voice" />
      <Grid items={QUALITY_TOV} accent="var(--tabby-purple)" />
    </div>
  );
}
