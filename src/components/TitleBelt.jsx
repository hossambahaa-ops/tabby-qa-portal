import React from "react";
import { TITLE_CATALOG } from "../lib/titles.js";

/**
 * <TitleBelt holders={[...]} compact={false} preview={false} />
 *
 * holders: array of { title_key, value, display } — the belts a QA owns.
 * compact: render small icon-only chips (used in leaderboard rows).
 * preview: tag belts as a Super Admin preview (adds a tiny "BETA" pill).
 *
 * Belts use a slightly heavier visual treatment than badges — a gradient
 * pill with a darker border — so they read as "rare / champion-tier"
 * compared to the lighter monthly badges.
 */
export default function TitleBelt({ holders, compact = false, preview = false, max = 0 }) {
  if (!holders || holders.length === 0) return null;
  const list = max > 0 ? holders.slice(0, max) : holders;

  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center", verticalAlign: "middle" }}>
      {list.map((h) => <BeltPill key={h.title_key} holder={h} compact={compact} preview={preview} />)}
      {max > 0 && holders.length > max && (
        <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 500 }}>+{holders.length - max}</span>
      )}
    </span>
  );
}

function BeltPill({ holder, compact, preview }) {
  const cat = TITLE_CATALOG[holder.title_key];
  if (!cat) return null;
  const tip = `${cat.label} — ${cat.desc}${holder.display ? `\n${cat.metricLabel}: ${holder.display}` : ""}${preview ? "\n\n(Preview — visible to Super Admins only.)" : ""}`;

  if (compact) {
    return (
      <span
        title={tip}
        aria-label={cat.label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${cat.color}33 0%, ${cat.color}11 100%)`,
          border: `1.5px solid ${cat.color}`,
          fontSize: 14,
          lineHeight: 1,
          cursor: "default",
          boxShadow: `0 0 0 2px ${cat.color}1f, inset 0 0 4px ${cat.color}33`,
          flexShrink: 0,
        }}
      >
        {cat.emoji}
      </span>
    );
  }

  return (
    <span
      title={tip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        background: `linear-gradient(135deg, ${cat.color}29 0%, ${cat.color}10 100%)`,
        border: `1.5px solid ${cat.color}`,
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        color: cat.color,
        lineHeight: 1.2,
        cursor: "default",
        letterSpacing: ".3px",
        textTransform: "uppercase",
        boxShadow: `0 1px 3px ${cat.color}33, inset 0 1px 0 rgba(255,255,255,.15)`,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, filter: "drop-shadow(0 0 2px rgba(0,0,0,.2))" }}>{cat.emoji}</span>
      {cat.label}
      {holder.display && (
        <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.75, textTransform: "none", letterSpacing: 0 }}>
          · {holder.display}
        </span>
      )}
      {preview && (
        <span
          style={{
            fontSize: 8,
            fontWeight: 800,
            padding: "1px 4px",
            background: cat.color,
            color: "#fff",
            borderRadius: 4,
            letterSpacing: ".5px",
          }}
        >
          BETA
        </span>
      )}
    </span>
  );
}
