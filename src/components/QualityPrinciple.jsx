import React, { useState } from "react";
import { principleOfTheDay } from "../lib/qualityPrinciples.js";

// Rotating "Always remember…" principle, chosen deterministically per day
// (everyone sees the same one). `variant` controls the chrome:
//   "login"   — quiet line on the sign-in screen (dark background)
//   "loading" — centered, for slow page-transition fallbacks
//   "strip"   — dismissible banner for the dashboard (dismissed per day)
//   "inline"  — bare "Always remember: …" text
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EYEBROW = "Always remember";

export default function QualityPrinciple({ variant = "inline", principle }) {
  const p = principle || principleOfTheDay();
  const dismissId = `qp_strip_dismissed_${todayKey()}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return variant === "strip" && localStorage.getItem(dismissId) === "1"; } catch { return false; }
  });
  if (!p || dismissed) return null;

  if (variant === "login") {
    return (
      <p className="login-v2-principle" style={{ marginTop: 20, maxWidth: 400, fontFamily: "var(--font)", fontSize: 12.5, lineHeight: 1.65, color: "rgba(255,255,255,.5)" }}>
        <span style={{ display: "block", textTransform: "uppercase", letterSpacing: ".8px", fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.35)", marginBottom: 4 }}>{EYEBROW}</span>
        <span style={{ fontStyle: "italic" }}>{p.text}</span>
      </p>
    );
  }

  if (variant === "loading") {
    return (
      <div style={{ marginTop: 20, maxWidth: 440, textAlign: "center", fontFamily: "var(--font)" }}>
        <div style={{ textTransform: "uppercase", letterSpacing: ".9px", fontSize: 9.5, fontWeight: 700, color: "var(--muted, #94a3b8)", marginBottom: 6 }}>{EYEBROW}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-soft, #475569)", fontStyle: "italic" }}>{p.text}</div>
      </div>
    );
  }

  if (variant === "strip") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, background: "linear-gradient(90deg, rgba(99,102,241,.09), rgba(99,102,241,.02))", border: "1px solid rgba(99,102,241,.16)", fontFamily: "var(--font)", marginBottom: 16 }}>
        <span aria-hidden style={{ fontSize: 15, lineHeight: 1, color: "rgba(99,102,241,.85)" }}>✦</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ textTransform: "uppercase", letterSpacing: ".6px", fontSize: 9.5, fontWeight: 700, color: "rgba(99,102,241,.9)", marginRight: 8 }}>{EYEBROW}</span>
          <span style={{ fontSize: 13, color: "var(--text, #1e293b)" }}>{p.text}</span>
          <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)", marginLeft: 8, whiteSpace: "nowrap" }}>· {p.tag}</span>
        </div>
        <button
          onClick={() => { try { localStorage.setItem(dismissId, "1"); } catch {} setDismissed(true); }}
          aria-label="Dismiss for today"
          title="Dismiss for today"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted, #94a3b8)", fontSize: 17, lineHeight: 1, padding: "2px 4px" }}
        >×</button>
      </div>
    );
  }

  return (
    <span style={{ fontFamily: "var(--font)" }}><strong>{EYEBROW}:</strong> {p.text}</span>
  );
}
