import React from "react";
import EmptyState from "./EmptyState.jsx";

/**
 * Renders the three states of an async region as three DISTINCT things:
 * loading, failed, and genuinely-empty.
 *
 * Why this exists — the 2026-07-20 attendance outage. Every `list*` helper
 * did `.catch(() => [])`, so an RLS statement timeout (HTTP 500) arrived at
 * the UI as an empty array and the grid rendered a confident "0 team members"
 * for every QA Lead in the org. Nobody could tell "nothing is scheduled" from
 * "we couldn't reach the database", and the outage stayed invisible for hours.
 *
 * The rule this component enforces: **never claim there is nothing here unless
 * a request actually succeeded and came back empty.** An error is an error,
 * and it always offers a way out (Retry).
 *
 * <AsyncSection
 *   loading={loading}          // first load in flight
 *   error={loadError}          // string | Error | null
 *   isEmpty={rows.length === 0}
 *   onRetry={load}
 *   skeleton={<SkeletonTable/>}          // shown while loading (keeps layout height)
 *   empty={{ title: "...", description: "...", illus: "empty" }}
 * >
 *   {children}
 * </AsyncSection>
 *
 * Partial failures matter too. When `error` is set but we still have something
 * to show (isEmpty === false), the children render underneath a compact banner
 * instead of being replaced — losing already-loaded data to report a problem
 * with one slice of it is its own kind of lie.
 */

export const errorText = (e) => {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (Array.isArray(e)) return e.map(errorText).filter(Boolean).join(" · ");
  return e.message || String(e);
};

/** Compact inline banner — used on its own for partial failures. */
export function LoadErrorBanner({ error, onRetry, note }) {
  const msg = errorText(error);
  if (!msg) return null;
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        marginBottom: 12,
        border: "1px solid var(--red)",
        borderLeft: "3px solid var(--red)",
        borderRadius: "var(--radius)",
        background: "var(--red-bg)",
        color: "var(--red)",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: "18px" }}>⚠</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>Couldn't load everything on this page</div>
        <div style={{ opacity: 0.9, wordBreak: "break-word" }}>{msg}</div>
        {note !== null && (
          <div style={{ opacity: 0.75, marginTop: 2 }}>
            {note || "Showing what did load — this is a loading problem, not missing data."}
          </div>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-outline btn-sm"
          style={{ fontSize: 11, flexShrink: 0 }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** Full-region failure card — used when there is no data to fall back on. */
export function ErrorState({ error, onRetry, title = "Couldn't load this" }) {
  return (
    <div className="card" style={{ padding: 28, textAlign: "center" }}>
      <div
        style={{
          width: 44,
          height: 44,
          margin: "0 auto 12px",
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          background: "var(--red-bg)",
          color: "var(--red)",
          fontSize: 22,
        }}
        aria-hidden="true"
      >
        ⚠
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{title}</h3>
      <p style={{ margin: "0 auto", maxWidth: 460, fontSize: 12.5, color: "var(--tx3)", lineHeight: 1.6, wordBreak: "break-word" }}>
        {errorText(error)}
      </p>
      <p style={{ margin: "8px auto 0", maxWidth: 460, fontSize: 12, color: "var(--tx3)" }}>
        Your data is still there — we just couldn't fetch it.
      </p>
      {onRetry && (
        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={onRetry} style={{ fontSize: 12 }}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export default function AsyncSection({
  loading,
  error,
  isEmpty,
  onRetry,
  skeleton,
  empty,
  errorTitle,
  partialNote,
  children,
}) {
  // Loading wins only on the FIRST load. Once there's data on screen a
  // background refresh must not rip it away — callers pass loading=false
  // for refreshes (or keep their previous rows), and this stays put.
  if (loading) {
    return skeleton || null;
  }

  // Hard failure: nothing usable to render. Never fall through to the
  // empty state here — that's the exact confusion this component exists
  // to prevent.
  if (error && isEmpty) {
    return <ErrorState error={error} onRetry={onRetry} title={errorTitle} />;
  }

  if (isEmpty) {
    return empty ? <EmptyState {...empty} /> : null;
  }

  // Data present. If part of the load failed, say so above it rather than
  // discarding what we have.
  return (
    <>
      {error && <LoadErrorBanner error={error} onRetry={onRetry} note={partialNote} />}
      {children}
    </>
  );
}
