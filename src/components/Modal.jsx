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
          <div style={{ flexShrink: 0, padding: "16px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h3 id={titleIdRef.current} style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-.2px" }}>{title}</h3>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 20, padding: 0, lineHeight: 1 }}
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
