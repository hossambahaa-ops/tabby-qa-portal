import React, { createContext, useContext, useState, useCallback } from "react";
import ReactDOM from "react-dom";

const ToastContext = createContext(null);

export function useGlobalToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useGlobalToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // show(type, msg, opts?) — opts can include { action: { label, onClick }, durationMs }
  // Backwards-compatible: previous (type, msg) calls work unchanged.
  const show = useCallback((type, msg, opts = {}) => {
    const id = Date.now() + Math.random();
    const duration = Math.max(1500, opts.durationMs || (opts.action ? 6000 : 3500));
    setToasts(prev => [...prev.slice(-4), { id, type, msg, action: opts.action || null }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const portal = toasts.length > 0
    ? ReactDOM.createPortal(
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 100000, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none" }}>
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`} style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              <span>{typeof t.msg === "object" ? JSON.stringify(t.msg) : t.msg}</span>
              {t.action && (
                <button
                  onClick={() => { try { t.action.onClick?.(); } catch (e) { console.error(e); } dismiss(t.id); }}
                  style={{
                    background: "rgba(255,255,255,.18)", color: "inherit",
                    border: "1px solid rgba(255,255,255,.25)", borderRadius: 6,
                    padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    fontFamily: "var(--font)", textTransform: "uppercase", letterSpacing: ".5px",
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <ToastContext.Provider value={show}>
      {children}
      {portal}
    </ToastContext.Provider>
  );
}
