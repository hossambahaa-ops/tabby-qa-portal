import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useApp } from "../lib/AppContext.jsx";
import { useReigningBelts } from "../lib/useReigningBelts.js";
import { TITLE_CATALOG, TITLE_KEYS, formatMonthLabel } from "../lib/titles.js";
import { nameFromEmail, initialsFromEmail } from "../lib/utils.js";

// localStorage key — one entry per email so the same browser shared across
// users still announces independently.
const seenKey = (email) => `belt_announced_v1_${(email || "").toLowerCase()}`;

/**
 * <BeltAnnouncementModal />
 *
 * Mounted globally. Fires once per QA per new "belt month": when the last
 * completed calendar month rolls over (e.g. April → May), every QA sees a
 * splash on their next login revealing all five championship belt holders
 * with a staggered entrance, special highlight if they personally won
 * anything, then "Got it" stores the month so it never re-fires.
 *
 * Renders nothing until data is ready and unseen → no flicker on every
 * page load.
 */
export default function BeltAnnouncementModal() {
  const { profile } = useApp();
  const { loading, beltMonth, holders, myBelts } = useReigningBelts();
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(0);

  // Decide whether this user should see the splash for the current beltMonth.
  useEffect(() => {
    if (loading || !beltMonth || !holders || !profile?.email) return;
    let seen = "";
    try { seen = localStorage.getItem(seenKey(profile.email)) || ""; } catch {}
    if (seen === beltMonth) return; // already saw this month's announcement
    setOpen(true);
    setRevealed(0);
  }, [loading, beltMonth, holders, profile?.email]);

  // Staggered reveal — one belt at a time so the announcement feels earned.
  useEffect(() => {
    if (!open) return;
    const timers = TITLE_KEYS.map((_, i) =>
      setTimeout(() => setRevealed((n) => Math.max(n, i + 1)), 350 + i * 550)
    );
    return () => timers.forEach(clearTimeout);
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dismiss = () => {
    if (profile?.email && beltMonth) {
      try { localStorage.setItem(seenKey(profile.email), beltMonth); } catch {}
    }
    setOpen(false);
  };

  if (!open || !holders) return null;

  const myEmailLc = profile?.email?.toLowerCase();
  const won = myBelts && myBelts.length > 0;

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="belt-announce-title"
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse at center, rgba(20,18,24,.85) 0%, rgba(20,18,24,.96) 100%)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        animation: "beltOverlayIn .35s var(--ease)",
        overflowY: "auto",
        fontFamily: "var(--font)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "linear-gradient(180deg, var(--bg2) 0%, var(--bg) 100%)",
          borderRadius: 16,
          boxShadow: "0 30px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(245,158,11,.25)",
          padding: "28px 24px 20px",
          position: "relative",
          animation: "beltCardIn .55s cubic-bezier(.16,1,.3,1)",
        }}
      >
        {/* Crown burst at the top */}
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 44, lineHeight: 1, animation: "beltCrown .9s cubic-bezier(.34,1.56,.64,1)" }}>
            🏆
          </div>
        </div>

        <h2
          id="belt-announce-title"
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-.4px",
            color: "var(--tx)",
          }}
        >
          The {formatMonthLabel(beltMonth)} title fights are settled
        </h2>
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "var(--tx3)",
            marginTop: 6,
            marginBottom: 18,
          }}
        >
          {won
            ? `🎉 You're walking out of ${formatMonthLabel(beltMonth)} with ${myBelts.length} belt${myBelts.length > 1 ? "s" : ""} — congratulations, champion.`
            : "Here's who's wearing the gold this month."}
        </div>

        {/* The five belts — staggered reveal */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TITLE_KEYS.map((k, i) => {
            const cat = TITLE_CATALOG[k];
            const h = holders[k];
            const isMine = h?.qa_email?.toLowerCase() === myEmailLc;
            const visible = revealed > i;
            return (
              <div
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: isMine
                    ? `linear-gradient(135deg, ${cat.color}29, ${cat.color}10)`
                    : "var(--bg3)",
                  border: `1.5px solid ${isMine ? cat.color : "var(--bd2)"}`,
                  borderRadius: 12,
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0) scale(1)" : "translateY(8px) scale(.98)",
                  transition: "opacity .45s var(--ease), transform .45s cubic-bezier(.16,1,.3,1)",
                  boxShadow: isMine ? `0 4px 16px ${cat.color}33` : "none",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Sweep accent for "your" belts */}
                {isMine && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `linear-gradient(120deg, transparent 30%, ${cat.color}22 50%, transparent 70%)`,
                      transform: "translateX(-100%)",
                      animation: visible ? "beltSweep 1.6s ease-out .2s 1" : "none",
                      pointerEvents: "none",
                    }}
                  />
                )}

                {/* Big belt medallion */}
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${cat.color}44 0%, ${cat.color}11 100%)`,
                    border: `2px solid ${cat.color}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    flexShrink: 0,
                    boxShadow: `0 0 0 3px ${cat.color}22, inset 0 0 6px ${cat.color}33`,
                  }}
                >
                  {cat.emoji}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: cat.color,
                      letterSpacing: ".4px",
                      textTransform: "uppercase",
                      marginBottom: 1,
                    }}
                  >
                    {cat.label}
                  </div>
                  {h ? (
                    <>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--tx)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {nameFromEmail(h.qa_email)}
                        {isMine && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 9,
                              fontWeight: 800,
                              color: "#fff",
                              background: cat.color,
                              padding: "2px 6px",
                              borderRadius: 4,
                              letterSpacing: ".4px",
                              verticalAlign: "middle",
                            }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--tx3)" }}>
                        {cat.metricLabel}: <strong style={{ color: cat.color }}>{h.display}</strong>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--tx3)", fontStyle: "italic" }}>
                      Vacant — no QA met the criteria this month
                    </div>
                  )}
                </div>

                {/* Avatar bubble — only when there's a holder */}
                {h && (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--primary-light)",
                      color: "var(--accent-text)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      border: `2px solid ${isMine ? cat.color : "var(--bd2)"}`,
                      flexShrink: 0,
                    }}
                  >
                    {initialsFromEmail(h.qa_email)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--tx3)", fontStyle: "italic", maxWidth: 320 }}>
            Belts only change hands when a month closes. Defend yours — or come and take one.
          </div>
          <button
            className="btn btn-primary"
            onClick={dismiss}
            style={{
              minWidth: 120,
              fontSize: 13,
              fontWeight: 700,
              padding: "8px 18px",
            }}
          >
            Got it
          </button>
        </div>
      </div>

      {/* Scoped keyframes */}
      <style>{`
        @keyframes beltOverlayIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes beltCardIn   { from { opacity: 0; transform: translateY(20px) scale(.96) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes beltCrown    { 0% { transform: scale(.4) rotate(-12deg); opacity: 0 }
                                  60% { transform: scale(1.15) rotate(8deg); opacity: 1 }
                                  100% { transform: scale(1) rotate(0); opacity: 1 } }
        @keyframes beltSweep    { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
      `}</style>
    </div>,
    document.body,
  );
}
