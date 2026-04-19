import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";

const TOUR_STEPS = [
  {
    title: "Welcome to Tabby Pulse! 👋",
    body: "You're a QA Lead here. Let's take a 60-second tour of the features that matter most for your daily workflow.",
    icon: "🎯",
  },
  {
    title: "Dashboard — Your Daily Hub",
    body: "Your team's performance overview, pending tasks, and alerts for QAs trending toward Action Plans. Check this first every morning.",
    icon: "🏠",
  },
  {
    title: "QA Profile — Deep-Dive Individual Performance",
    body: "Click any QA to see their full history: MTD metrics, coaching sessions, occupancy, evaluation history, and action plans.",
    icon: "👤",
  },
  {
    title: "Quality Control — Your Action Center",
    body: "4 tabs in one place: Violations, AP/PIP, Coaching, and DAM Flags. The natural flow: flag → violation → coaching → action plan.",
    icon: "🛡️",
  },
  {
    title: "Targets — Set Team Expectations",
    body: "Define KPIs for your team, or override them per individual QA (e.g., LLM monitors with different targets).",
    icon: "🎯",
  },
  {
    title: "Press ⌘K (Cmd+K) to Search Anything",
    body: "Find QAs, pages, or quick actions instantly. Also see the Leaderboard for rankings and the Schedule for attendance.",
    icon: "⚡",
  },
  {
    title: "You're all set! 🚀",
    body: "Click the (?) icons on any metric for help. For questions, use the feedback button in the top bar.",
    icon: "🎉",
  },
];

export default function OnboardingTour({ onDismiss }) {
  const [step, setStep] = useState(0);
  const isLast = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onDismiss();
      if (e.key === "ArrowRight") { if (!isLast) setStep(s => s + 1); else onDismiss(); }
      if (e.key === "ArrowLeft" && step > 0) setStep(s => s - 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, isLast, onDismiss]);

  return ReactDOM.createPortal(
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 20,
    }}>
      <div style={{
        background: "var(--bg3)", borderRadius: 16, padding: 32, maxWidth: 480, width: "100%",
        boxShadow: "var(--shadow)", border: "1px solid var(--bd)", position: "relative",
      }}>
        {/* Skip button */}
        <button onClick={onDismiss} style={{
          position: "absolute", top: 12, right: 12, background: "none", border: "none",
          color: "var(--tx3)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font)",
        }}>Skip tour ✕</button>

        {/* Icon */}
        <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>{current.icon}</div>

        {/* Content */}
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 12, color: "var(--tx)" }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 14, color: "var(--tx2)", lineHeight: 1.6, textAlign: "center", marginBottom: 24 }}>
          {current.body}
        </p>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {TOUR_STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4, cursor: "pointer",
              background: i === step ? "var(--tabby-purple)" : "var(--bd)", transition: "all .3s",
            }} />
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn btn-outline"
            style={{ opacity: step === 0 ? 0.4 : 1, fontSize: 13 }}
          >← Back</button>
          <button
            onClick={() => { if (isLast) onDismiss(); else setStep(s => s + 1); }}
            className="btn btn-primary"
            style={{ fontSize: 13 }}
          >{isLast ? "Get Started 🚀" : "Next →"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
