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

  const show = useCallback((type, msg) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { id, type, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const portal = toasts.length > 0
    ? ReactDOM.createPortal(
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 100000, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none" }}>
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`} style={{ pointerEvents: "auto" }}>{t.msg}</div>
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
