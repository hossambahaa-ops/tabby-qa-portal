import React, { useEffect } from "react";
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
//   3. overflow-y: auto on the card itself (not on the overlay)
//      Means a tall modal scrolls inside the card box, never sliding
//      its top above or bottom below the viewport.
//
// API:
//   <Modal onClose={fn}>           // closes when backdrop is clicked
//     ...children...
//   </Modal>
//
//   <Modal maxWidth={720}>         // override default 520 px width
//   <Modal dismissOnBackdrop={false}>  // require explicit close
//   <Modal padding={0}>            // for full-bleed content (e.g. tables)
//   <Modal closeOnEsc={false}>     // disable Esc-to-close
//
// For sticky-footer modals, set padding={0} on the Modal and lay out
// the children as flex column { header / body (overflow auto) / footer }
// inline. The simpler default (whole card scrolls) is enough for almost
// every popup in the app today.

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

export default function Modal({
  onClose,
  maxWidth = 520,
  padding = 24,
  dismissOnBackdrop = true,
  closeOnEsc = true,
  zIndex = 10000,
  children,
}) {
  useEffect(() => {
    if (!closeOnEsc || !onClose) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeOnEsc, onClose]);

  return createPortal(
    <div
      style={{ ...OVERLAY_STYLE, zIndex }}
      onClick={(dismissOnBackdrop && onClose) ? (e => { if (e.target === e.currentTarget) onClose(); }) : undefined}
    >
      <div style={{ ...CARD_STYLE_BASE, maxWidth, maxHeight: "calc(100vh - 40px)" }}>
        <div style={{ ...BODY_STYLE, padding }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
