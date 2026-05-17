import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Shared modal shell. All popups in the app should render through this
// rather than rolling their own overlay+card wrapper, because:
//
//   1. createPortal -> document.body  Lifts the modal out of any parent
//      transform / animation / filter context. .card has a mount
//      animation (cardSlideUp) that uses transform — combining that
//      with positional transforms anywhere up the tree shifted the
//      modal off-centre across multiple iterations.
//
//   2. Strict box-sizing border-box + maxHeight: calc(100vh - 40px)
//      The card mathematically cannot grow past the viewport. The
//      previous flex-centring + 85vh combo failed when content
//      overflowed because the centred child's top got pushed off-
//      screen and the overlay's overflow:auto gave a misleading scroll.
//
//   3. overflow-y: auto on the body (not the card) when no footer; on
//      a flex:1 body slot when a footer is provided. Tall modals scroll
//      inside the card, never off-screen, and the footer stays pinned.
//
// Accessibility:
//   - role="dialog" + aria-modal="true" + aria-labelledby (when title given)
//   - Focus trap: Tab / Shift+Tab cycle within the modal's focusable elements
//   - Initial focus moves to the first focusable element inside
//   - Return-focus to whatever was focused before the modal opened
//   - Body scroll-lock while open
//   - Esc-to-close (configurable)
//
// API:
//   <Modal onClose={fn}>           // closes when backdrop is clicked
//     ...children...
//   </Modal>
//
//   <Modal maxWidth={720}>                   // override default 520 px width
//   <Modal dismissOnBackdrop={false}>        // require explicit close
//   <Modal padding={0}>                      // for full-bleed content
//   <Modal closeOnEsc={false}>               // disable Esc-to-close
//   <Modal title="Heading"
//          footer={<><button>OK</button></>}> // sticky footer pattern
//   <Modal labelledBy="my-heading-id">       // explicit aria-labelledby

const OVERLAY_STYLE = {
  position: "fixed",
  top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
  padding: 20,
  overflow: "hidden",
  boxSizing: "border-box",
};

const CARD_STYLE_BASE = {
  width: "100%",
  margin: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxSizing: "border-box",
  background: "var(--bg3)",
  border: "1px solid var(--bd2)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-lg, 0 10px 30px rgba(0,0,0,.3))",
  color: "var(--tx)",
};

const BODY_STYLE = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};

const FOOTER_STYLE = {
  flexShrink: 0,
  borderTop: "1px solid var(--bd2)",
  padding: "12px 24px",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let _autoIdCounter = 0;
const nextAutoId = () => `modal-title-${++_autoIdCounter}`;

export default function Modal({
  onClose,
  maxWidth = 520,
  padding = 24,
  dismissOnBackdrop = true,
  closeOnEsc = true,
  zIndex = 10000,
  title,
  footer,
  labelledBy,
  children,
}) {
  const cardRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const titleIdRef = useRef(labelledBy || (title ? nextAutoId() : undefined));

  // Body scroll lock + focus management. Capture whoever had focus before
  // the modal opened so we can restore it on close.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the modal on next frame so React has rendered.
    const t = window.setTimeout(() => {
      const card = cardRef.current;
      if (!card) return;
      const first = card.querySelector(FOCUSABLE_SELECTOR);
      (first || card).focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === "function") {
        try { prev.focus({ preventScroll: true }); } catch { /* noop */ }
      }
    };
  }, []);

  // Esc-to-close + focus trap.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && closeOnEsc && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const focusables = card.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        e.preventDefault();
        card.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeOnEsc, onClose]);

  return createPortal(
    <div
      style={{ ...OVERLAY_STYLE, zIndex }}
      onClick={(dismissOnBackdrop && onClose) ? (e => { if (e.target === e.currentTarget) onClose(); }) : undefined}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleIdRef.current}
        tabIndex={-1}
        style={{ ...CARD_STYLE_BASE, maxWidth, maxHeight: "calc(100vh - 40px)" }}
      >
        {title !== undefined && (
          <div style={{
            flexShrink: 0,
            // Symmetric top/bottom padding so the header reads as its
            // own block. Bottom border mirrors FOOTER_STYLE's
            // border-top — gives every modal a clean three-band
            // layout (header / body / footer) without each consumer
            // having to roll their own card-header div.
            padding: "16px 24px",
            borderBottom: "1px solid var(--bd2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}>
            {/* Title size raised from 15 → 17 + letter-spacing
                tightened so the modal heading reads as a heading,
                not as a label. At fontSize 15 it was visually
                smaller than the body labels below it AND smaller
                than the 20px close button, which inverted the
                visual hierarchy (× drew the eye before the title). */}
            <h3 id={titleIdRef.current} style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-.3px", lineHeight: 1.3, color: "var(--tx)" }}>{title}</h3>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                title="Close (Esc)"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--tx3)",
                  fontSize: 20,
                  // Padding + minWidth give the close target a
                  // 28×28 hit area without making it visually huge.
                  // Hover bumps opacity for affordance.
                  padding: "2px 8px",
                  minWidth: 28,
                  minHeight: 28,
                  lineHeight: 1,
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.6,
                  transition: "opacity .15s ease, background .15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "var(--bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.background = "transparent"; }}
              >×</button>
            )}
          </div>
        )}
        <div style={{ ...BODY_STYLE, padding }}>
          {children}
        </div>
        {footer !== undefined && (
          <div style={FOOTER_STYLE}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
