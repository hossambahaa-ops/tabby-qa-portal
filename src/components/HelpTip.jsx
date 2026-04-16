import React, { useState } from "react";

export default function HelpTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 4, cursor: "help" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--tx3)" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="var(--tx3)"/>
      </svg>
      {show && <div style={{
        position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
        background: "var(--bg3)", border: "1px solid var(--bd)", borderRadius: 8, padding: "8px 12px",
        fontSize: 11, color: "var(--tx2)", lineHeight: 1.5, whiteSpace: "normal", width: 220,
        boxShadow: "var(--shadow)", zIndex: 100, textAlign: "left", fontWeight: 400
      }}>{text}</div>}
    </span>
  );
}
