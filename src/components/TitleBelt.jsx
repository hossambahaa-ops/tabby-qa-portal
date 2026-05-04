import React from "react";
import { TITLE_CATALOG } from "../lib/titles.js";
import { nameFromEmail } from "../lib/utils.js";
import Tooltip from "./Tooltip.jsx";

/**
 * <TitleBelt holders={[...]} compact={false} preview={false} />
 *
 * holders: array of { title_key, value, display } — the belts a QA owns.
 * compact: render small icon-only chips (used in leaderboard rows).
 * preview: tag belts as a Super Admin preview (adds a tiny "BETA" pill).
 *
 * Hovering any belt opens a portal-rendered card explaining what it is,
 * who holds it, and how it was won — much richer than the native
 * `title` attribute Chrome shows after a long delay.
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

// Rich hover card content — rendered into the Tooltip portal.
// Exported so other surfaces (e.g. the leaderboard "Reigning belts"
// showcase panel) can wrap their own cards with the same tooltip.
export function BeltHoverCard({ cat, holder, preview }) {
  return (
    <div style={{ minWidth: 240, fontFamily: "var(--font)", whiteSpace: "normal" }}>
      {/* Header — emoji + belt name in the belt color */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{cat.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: cat.color, letterSpacing: ".3px", textTransform: "uppercase" }}>
          {cat.label}
        </span>
        {preview && (
          <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", background: cat.color, color: "#fff", borderRadius: 4, marginLeft: "auto", letterSpacing: ".5px" }}>
            BETA
          </span>
        )}
      </div>

      {/* Description — what the belt represents */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.85)", marginBottom: 8, lineHeight: 1.5 }}>
        {cat.desc}
      </div>

      {/* Holder — name + the metric value that earned it */}
      {holder?.qa_email && (
        <div style={{ padding: "6px 8px", background: "rgba(255,255,255,.06)", borderRadius: 6, borderLeft: `3px solid ${cat.color}`, marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 2 }}>
            Current holder
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
            {nameFromEmail(holder.qa_email)}
          </div>
          {holder.display && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.7)", marginTop: 2 }}>
              {cat.metricLabel}: <span style={{ fontWeight: 700, color: cat.color }}>{holder.display}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer — when belts change hands */}
      <div style={{ fontSize: 9, color: "rgba(255,255,255,.5)", fontStyle: "italic", textAlign: "center" }}>
        Belts only transfer when a month closes.
      </div>
    </div>
  );
}

function BeltPill({ holder, compact, preview }) {
  const cat = TITLE_CATALOG[holder.title_key];
  if (!cat) return null;

  const tooltipContent = <BeltHoverCard cat={cat} holder={holder} preview={preview} />;

  if (compact) {
    return (
      <Tooltip content={tooltipContent} maxWidth={300} padding="10px 12px">
        <span
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
      </Tooltip>
    );
  }

  return (
    <Tooltip content={tooltipContent} maxWidth={300} padding="10px 12px">
      <span
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
    </Tooltip>
  );
}
