import React from "react";
import { Icon } from "./Icons.jsx";

/**
 * <EmptyState
 *   title="No coaching sessions yet"
 *   description="Schedule your first session to start tracking growth."
 *   icon="M12 4..."   // optional path-d for inner icon
 *   cta={{ label: "Schedule one →", onClick: ... }}
 *   variant="card"     // "card" (default) or "compact"
 * />
 *
 * Replaces the bare "No data" / dim-text empty states scattered across the
 * app with a consistent, action-oriented placeholder. Reuses the existing
 * .placeholder CSS so it inherits the dark-mode + animation work already
 * baked into index.css.
 */
export default function EmptyState({
  title,
  description,
  icon,
  cta,
  variant = "card",
}) {
  const isCompact = variant === "compact";
  return (
    <div className={`placeholder${isCompact ? " placeholder-compact" : ""}`}>
      {icon && (
        <div className="placeholder-icon">
          <Icon d={icon} size={isCompact ? 22 : 28} />
        </div>
      )}
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {cta && (
        <div className="placeholder-cta">
          <button
            className="btn btn-primary btn-sm"
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
