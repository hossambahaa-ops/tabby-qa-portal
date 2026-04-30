import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

/**
 * Hook + portal-rendered menu for right-click on table rows.
 *
 * Usage:
 *   const ctx = useRowContextMenu();
 *   <tr onContextMenu={(e) => ctx.openFor(e, [
 *     { label: "View profile", onClick: () => navigate(...) },
 *     { label: "Send announcement", onClick: () => ... },
 *     { divider: true },
 *     { label: "Copy email", onClick: () => navigator.clipboard.writeText(email) },
 *   ])}>
 *
 * Render the menu once at the page root: <ctx.Menu />
 *
 * Auto-closes on outside click, scroll, or escape key.
 */
export function useRowContextMenu() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const itemsRef = useRef([]);
  const menuRef = useRef(null);

  const openFor = (event, items) => {
    if (!event || !items || !items.length) return;
    event.preventDefault();
    itemsRef.current = items;
    setPos({ x: event.clientX, y: event.clientY });
    setOpen(true);
  };

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) close(); };
    const onScroll = () => close();
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Re-clamp the menu inside the viewport so it never falls off the right
  // or bottom edge.
  const clampedPos = (() => {
    if (typeof window === "undefined") return pos;
    const w = 220, h = Math.max(40, (itemsRef.current?.length || 1) * 32);
    const x = Math.min(pos.x, window.innerWidth - w - 8);
    const y = Math.min(pos.y, window.innerHeight - h - 8);
    return { x, y };
  })();

  const Menu = () => {
    if (!open) return null;
    return ReactDOM.createPortal(
      <div ref={menuRef} className="row-ctx-menu" style={{ left: clampedPos.x, top: clampedPos.y }}>
        {itemsRef.current.map((item, i) => {
          if (item.divider) return <div key={i} className="row-ctx-divider" />;
          return (
            <button
              key={i}
              className="row-ctx-item"
              disabled={item.disabled}
              onClick={() => { close(); try { item.onClick?.(); } catch (e) { console.error(e); } }}
            >
              {item.icon && <span style={{ width: 14, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{item.icon}</span>}
              <span>{item.label}</span>
              {item.shortcut && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx3)" }}>{item.shortcut}</span>}
            </button>
          );
        })}
      </div>,
      document.body,
    );
  };

  return { openFor, close, Menu, isOpen: open };
}
