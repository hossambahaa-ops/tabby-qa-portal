import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";

/**
 * <Tooltip content="..." placement="top|bottom"> children </Tooltip>
 *
 * Drop-in replacement for the native `title` attribute. Renders the bubble
 * via a portal so it's never clipped by overflow:hidden parents. Multi-line
 * content (\n) is preserved. ~250 ms hover delay so it doesn't feel jumpy.
 */
export default function Tooltip({ content, placement = "top", children, delay = 250 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wrapRef = useRef(null);
  const timerRef = useRef(null);

  // Position the bubble relative to the wrapped element each time it opens.
  const measure = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const y = placement === "bottom" ? r.bottom + 8 : r.top - 8;
    setPos({ x: cx, y });
  };

  const show = () => {
    if (!content) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { measure(); setOpen(true); }, delay);
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Re-measure on scroll / resize so the bubble follows the anchor.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <span
        ref={wrapRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: "inline-flex" }}
      >
        {children}
      </span>
      {open && content && ReactDOM.createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            transform: placement === "bottom"
              ? "translate(-50%, 0)"
              : "translate(-50%, -100%)",
            background: "rgba(20, 18, 24, .96)",
            color: "#fff",
            fontSize: 11,
            lineHeight: 1.5,
            padding: "6px 10px",
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,.25)",
            whiteSpace: "pre-line",
            maxWidth: 240,
            pointerEvents: "none",
            zIndex: 10000,
            animation: "fadeIn .15s var(--ease)",
            fontFamily: "var(--font)",
            fontWeight: 500,
          }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
