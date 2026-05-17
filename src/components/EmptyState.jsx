import React from "react";
import { Icon } from "./Icons.jsx";

/**
 * <EmptyState
 *   title="No coaching sessions yet"
 *   description="Schedule your first session to start tracking growth."
 *   icon="M12 4..."          // path-d for inner icon (legacy)
 *   illus="empty|check|search|chart"   // OR pick a built-in (newer)
 *   tone="neutral|good|warn"           // tints icon tile + shadow
 *   cta={{ label: "Schedule one →", onClick: ..., kind:"primary|outline" }}
 *   variant="card"           // "card" (default) or "compact"
 * />
 *
 * Replaces the bare "No data" / dim-text empty states scattered across the
 * app with a consistent, action-oriented placeholder. Reuses the existing
 * .placeholder CSS so it inherits the dark-mode + animation work already
 * baked into index.css.
 *
 * Tone tints the icon tile and its shadow:
 *   - neutral (default) — purple-ish "nothing here yet"
 *   - good              — green "all caught up / nothing to do"
 *   - warn              — amber "missing data / blocked / stale"
 * Pre-existing callers that don't pass `tone` keep the old purple look.
 */

// Inline SVG library — keeps EmptyState self-contained so callers don't
// need to import an icon path or know which library we use. Pick via
// the `illus` prop. Falls back to `icon` (path string) if provided for
// backward compatibility with existing call sites.
const ILLUS = {
  empty: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
  check: <><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>,
  chart: <path d="M3 3v18h18M7 14l4-4 4 4 5-5"/>,
};

export default function EmptyState({
  title,
  description,
  icon,
  illus,
  tone = "neutral",
  cta,
  variant = "card",
}) {
  const isCompact = variant === "compact";
  const toneCls = tone && tone !== "neutral" ? ` placeholder-${tone}` : "";
  const size = isCompact ? 22 : 28;

  // Choose what to render inside the icon tile, in this order of preference:
  // 1. `illus` shortcut (preferred, new code)
  // 2. raw `icon` path-d (legacy, keep working)
  let inner = null;
  if (illus && ILLUS[illus]) {
    inner = (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {ILLUS[illus]}
      </svg>
    );
  } else if (icon) {
    inner = <Icon d={icon} size={size} />;
  }

  return (
    <div className={`placeholder${isCompact ? " placeholder-compact" : ""}${toneCls}`}>
      {inner && <div className="placeholder-icon">{inner}</div>}
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {cta && (
        <div className="placeholder-cta">
          <button
            className={cta.kind === "outline" ? "btn btn-outline btn-sm" : "btn btn-primary btn-sm"}
            onClick={cta.onClick}
            disabled={cta.disabled}
            style={{ fontSize: 12 }}
          >
            {cta.label}
          </button>
        </div>
      )}
    </div>
  );
}
