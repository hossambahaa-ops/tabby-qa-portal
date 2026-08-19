import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "../lib/AppContext.jsx";
import { listActiveSurvey, listMyResponse, submitSurveyResponse } from "../api/surveys.js";

// Mandatory in-app survey modal. Same blocking-UI pattern as the
// announcement-ack modal:
//
//   - On mount (and whenever session/profile changes): fetch the
//     single active survey. If one exists AND the current user hasn't
//     responded, render the modal.
//   - The modal cannot be dismissed (no X, no Esc, no backdrop close).
//   - Submit writes to survey_responses (RLS allows insert of own row,
//     unique constraint blocks dupes) then unmounts the modal.
//
// Why this lives in its own component instead of inlined in App.jsx
// (like the announcement modal): the survey has stateful inputs
// (rating + free-text) that benefit from local state. Keeping App.jsx
// from carrying yet another useState is worth the extra import.

const STAR_SIZE = 40;

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      style={{ display: "flex", gap: 8, justifyContent: "center", margin: "8px 0 4px" }}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 4, lineHeight: 0,
            transform: display >= n ? "scale(1.05)" : "scale(1)",
            transition: "transform var(--d1)",
          }}
        >
          <svg width={STAR_SIZE} height={STAR_SIZE} viewBox="0 0 24 24"
               fill={display >= n ? "#F59E0B" : "transparent"}
               stroke={display >= n ? "#F59E0B" : "var(--tx3)"}
               strokeWidth={1.6} strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
          </svg>
        </button>
      ))}
    </div>
  );
}

const STAR_LABELS = { 1: "Poor", 2: "Could be better", 3: "OK", 4: "Good", 5: "Excellent" };

export default function MandatorySurveyModal() {
  const { token, profile, globalToast, impersonating } = useApp();
  const [survey, setSurvey] = useState(null);
  const [hasResponded, setHasResponded] = useState(null); // null=unknown, true/false=resolved
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    // Skip entirely while super-admin is viewing-as another user. The
    // useApp().profile we'd otherwise check is the *impersonated* user's
    // profile, so we'd be popping the modal on every QA the admin
    // inspects — and blocking the admin from doing the inspection at
    // all. The real user (Hossam) will see their own modal later when
    // they're operating as themselves.
    if (impersonating) { setSurvey(null); setHasResponded(null); return; }
    if (!token || !profile?.email) return;
    // Failing closed is the right call for a BLOCKING modal: if we can't
    // read the survey or the user's existing response, we must not guess.
    // Guessing "no response yet" would re-prompt someone who already
    // answered and hold the whole app hostage behind a modal they can't
    // dismiss. Staying quiet costs one skipped prompt; the next load
    // catches it.
    try {
      const surveys = await listActiveSurvey({ token });
      const s = surveys?.[0];
      if (!s) { setSurvey(null); setHasResponded(null); return; }
      // Check expiry client-side too — RLS doesn't filter by expires_at.
      if (s.expires_at && new Date(s.expires_at) < new Date()) {
        setSurvey(null); setHasResponded(null); return;
      }
      const mine = await listMyResponse({ token, surveyId: s.id, userEmail: profile.email });
      setSurvey(s);
      setHasResponded((mine?.length || 0) > 0);
    } catch (e) {
      console.error("MandatorySurvey:", e);
      setSurvey(null);
      setHasResponded(null);
    }
  }, [token, profile?.email, impersonating]);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async () => {
    if (rating < 1 || rating > 5 || submitting) return;
    setSubmitting(true);
    try {
      await submitSurveyResponse({
        token,
        body: {
          survey_id: survey.id,
          user_email: profile.email,
          rating,
          feedback: feedback.trim() || null,
        },
      });
      globalToast?.("success", "Thanks for the feedback!");
      setHasResponded(true);
    } catch (e) {
      // Duplicate (unique constraint) → treat as already-responded.
      const msg = String(e?.message || e);
      if (/duplicate|unique/i.test(msg)) {
        setHasResponded(true);
      } else {
        globalToast?.("error", "Couldn't submit. " + msg.slice(0, 120));
        setSubmitting(false);
      }
    }
  };

  // Don't render anything until we know the user's state. Prevents a
  // flash of the modal when the response check is still in flight.
  if (!survey || hasResponded !== false) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Survey" style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.7)",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10002, animation: "fadeIn .3s cubic-bezier(.4,0,.2,1)",
    }}>
      <div style={{
        width: "100%", maxWidth: 540, margin: 20,
        background: "var(--bg3)", borderRadius: 20,
        boxShadow: "0 32px 64px rgba(0,0,0,.4)",
        border: "1px solid var(--bd)",
        overflow: "hidden",
      }}>
        {/* Purple gradient header matching the announcement-ack modal */}
        <div style={{
          padding: "20px 24px",
          background: "linear-gradient(135deg, var(--tabby-purple-dark,#4A1B56), var(--tabby-purple,#6A2C79))",
          color: "#fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>✨</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{survey.title}</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)" }}>
            We'd love your input · takes &lt; 30 seconds
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "24px" }}>
          {survey.intro_message && (
            <p style={{
              fontSize: 14, color: "var(--tx2)", lineHeight: 1.6,
              margin: "0 0 20px", whiteSpace: "pre-wrap",
            }}>{survey.intro_message}</p>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: "block", fontSize: 13, fontWeight: 600,
              color: "var(--tx)", marginBottom: 4,
            }}>How would you rate Tabby Pulse overall?</label>
            <StarPicker value={rating} onChange={setRating}/>
            <div style={{
              textAlign: "center", fontSize: 12,
              color: rating ? "var(--tabby-purple-light,#8B4D99)" : "var(--tx3)",
              fontWeight: 600, minHeight: 16,
            }}>{rating ? STAR_LABELS[rating] : "Tap a star to rate"}</div>
          </div>

          <div>
            <label htmlFor="survey-feedback" style={{
              display: "block", fontSize: 13, fontWeight: 600,
              color: "var(--tx)", marginBottom: 6,
            }}>What's working well or could be better? <span style={{ color: "var(--tx3)", fontWeight: 400 }}>(optional)</span></label>
            <textarea
              id="survey-feedback"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Anything you'd like the team to know…"
              rows={4}
              maxLength={2000}
              className="form-input"
              style={{ width: "100%", resize: "vertical", fontFamily: "var(--font)", fontSize: 13, lineHeight: 1.5 }}
            />
            <div style={{ textAlign: "right", fontSize: 10, color: "var(--tx3)", marginTop: 4 }}>
              {feedback.length}/2000
            </div>
          </div>
        </div>

        {/* Footer — must submit */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid var(--bd2)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>You must submit to continue</span>
          <button
            className="mo-ctl"
            onClick={onSubmit}
            disabled={!rating || submitting}
            style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: !rating || submitting ? "var(--bg2)" : "var(--tabby-purple,#6A2C79)",
              color: !rating || submitting ? "var(--tx3)" : "#fff",
              fontSize: 13, fontWeight: 700,
              cursor: !rating || submitting ? "not-allowed" : "pointer",
              fontFamily: "var(--font)",
            }}
            onMouseEnter={e => {
              if (rating && !submitting) {
                e.currentTarget.style.background = "var(--tabby-purple-light,#8B4D99)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={e => {
              if (rating && !submitting) {
                e.currentTarget.style.background = "var(--tabby-purple,#6A2C79)";
                e.currentTarget.style.transform = "translateY(0)";
              }
            }}
          >{submitting ? "Submitting…" : "Submit feedback"}</button>
        </div>
      </div>
    </div>
  );
}
