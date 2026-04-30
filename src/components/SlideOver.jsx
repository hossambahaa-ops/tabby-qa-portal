import React, { useEffect } from "react";
import ReactDOM from "react-dom";

/**
 * <SlideOver open title onClose width>{children}</SlideOver>
 *
 * Right-side panel that slides in over the app, used in place of full-screen
 * modals for create/edit flows. The underlying content stays visible behind a
 * dim backdrop so users keep the table / profile / context they were looking
 * at while they fill out a form.
 *
 * - Auto-closes on Escape and on backdrop click.
 * - Width defaults to 480 px; pass a number or a CSS string to override.
 * - Children render inside a flex column with the title bar fixed at top —
 *   typical pattern: header (auto), scrollable body (flex:1), footer with
 *   action buttons (auto).
 */
export default function SlideOver({
  open,
  title,
  onClose,
  width = 480,
  children,
  footer = null,
  // When true, the backdrop click is ignored (use for in-progress submits).
  preventBackdropClose = false,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape" && !preventBackdropClose) onClose?.(); };
    document.addEventListener("keydown", onKey);
    // Lock background scroll while the panel is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, preventBackdropClose]);

  if (!open) return null;

  const w = typeof width === "number" ? `${width}px` : width;

  return ReactDOM.createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 9990,
      display: "flex", justifyContent: "flex-end",
      animation: "slideOverFade .15s var(--ease)",
    }}>
      <div
        onClick={() => { if (!preventBackdropClose) onClose?.(); }}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)", backdropFilter: "blur(2px)" }}
      />
      <aside
        role="dialog"
        aria-label={title || "Panel"}
        style={{
          position: "relative",
          width: w, maxWidth: "100vw",
          height: "100vh",
          background: "var(--bg3)",
          borderLeft: "1px solid var(--bd)",
          boxShadow: "-12px 0 32px rgba(0,0,0,.18)",
          display: "flex", flexDirection: "column",
          animation: "slideOverIn .22s var(--ease) both",
          fontFamily: "var(--font)",
        }}
      >
        <header style={{
          padding: "14px 20px", borderBottom: "1px solid var(--bd2)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.2px", color: "var(--tx)" }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--tx3)", fontSize: 20, padding: 4, lineHeight: 1,
          }}>×</button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>{children}</div>
        {footer && (
          <footer style={{
            padding: "12px 20px", borderTop: "1px solid var(--bd2)",
            display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0, background: "var(--bg2)",
          }}>{footer}</footer>
        )}
      </aside>
      <style>{`
        @keyframes slideOverIn {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideOverFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
}
