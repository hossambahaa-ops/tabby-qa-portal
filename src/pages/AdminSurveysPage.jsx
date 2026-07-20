import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "../lib/AppContext.jsx";
import { nameFromEmail, safeError } from "../lib/utils.js";
import { SkeletonTable } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import AsyncSection from "../components/AsyncSection.jsx";
import {
  listAllSurveys, listResponsesForSurvey,
  createSurvey, closeSurvey, softDeleteSurvey,
} from "../api/surveys.js";

// Admin: send mandatory app-feedback surveys + view results.
//
// Layout:
//   ┌─ Compose card ─────────────────┐  ┌─ Past surveys list ─────┐
//   │ Title                          │  │ ★★★★☆ "May feedback"   │
//   │ Intro message (optional)       │  │   24/42 responses · open │
//   │ Expires (optional)             │  │ ★★★★★ "April pulse"     │
//   │  [Send to all users]           │  │   38/40 responses · closed│
//   └────────────────────────────────┘  └──────────────────────────┘
//
// Selecting a survey on the right opens its results below the list:
// avg rating + per-star bar chart + per-respondent feedback list.
//
// Sending a new "is_active=true" survey triggers the DB trigger that
// auto-closes any previously-active survey, so users only ever see
// one mandatory modal at a time.

function StarsRow({ value }) {
  return (
    <span style={{ display: "inline-flex", gap: 1, lineHeight: 1, verticalAlign: "middle" }}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width={12} height={12} viewBox="0 0 24 24"
             fill={value >= n ? "#F59E0B" : "transparent"}
             stroke={value >= n ? "#F59E0B" : "var(--tx3)"}
             strokeWidth={1.8}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
        </svg>
      ))}
    </span>
  );
}

function StarBar({ count, total, n }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
      <span style={{ width: 24, color: "var(--tx2)", display: "inline-flex", alignItems: "center", gap: 4 }}>
        {n}
        <svg width={11} height={11} viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth={1.5}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
        </svg>
      </span>
      <div style={{ flex: 1, height: 8, background: "var(--bg2)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: "linear-gradient(90deg, var(--tabby-purple-light,#8B4D99), var(--tabby-purple,#6A2C79))",
          transition: "width .5s ease-out",
        }}/>
      </div>
      <span style={{ width: 60, textAlign: "right", color: "var(--tx2)", fontVariantNumeric: "tabular-nums" }}>
        {count} · {pct}%
      </span>
    </div>
  );
}

export default function AdminSurveysPage() {
  const { token, profile, globalToast } = useApp();
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [responses, setResponses] = useState([]);
  const [respLoading, setRespLoading] = useState(false);

  // Compose form
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAllSurveys({ token });
      setSurveys(list || []);
      if (!selectedId && list?.length) setSelectedId(list[0].id);
      setLoadError(null);
    } catch (e) {
      // Without this the mount path left `loading` stuck true forever on a
      // failed fetch — a permanent spinner with no explanation.
      console.error("AdminSurveys:", e);
      setLoadError(e?.message || String(e));
    }
    setLoading(false);
  }, [token, selectedId]);

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) { setResponses([]); return; }
    setRespLoading(true);
    // .finally alone doesn't handle rejection — the chain still rejected
    // unhandled and left the responses list showing the previous survey's
    // rows as if they belonged to this one.
    listResponsesForSurvey({ token, surveyId: selectedId })
      .then(r => setResponses(r || []))
      .catch(e => { console.error("AdminSurveys responses:", e); setResponses([]); })
      .finally(() => setRespLoading(false));
  }, [token, selectedId]);

  const onCreate = async () => {
    if (!title.trim() || sending) return;
    setSending(true);
    try {
      const body = {
        title: title.trim(),
        intro_message: intro.trim() || null,
        created_by: profile?.email || "",
        is_active: true,
      };
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
      await createSurvey({ token, body });
      globalToast?.("success", "Survey sent to all users");
      setTitle(""); setIntro(""); setExpiresAt("");
      await reload();
    } catch (e) {
      globalToast?.("error", "Couldn't send: " + safeError(e));
    }
    setSending(false);
  };

  const onClose = async (id) => {
    try {
      await closeSurvey({ token, id });
      globalToast?.("success", "Survey closed");
      await reload();
    } catch (e) { globalToast?.("error", safeError(e)); }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Soft-delete this survey? Responses will be hidden from this view.")) return;
    try {
      await softDeleteSurvey({ token, id });
      globalToast?.("success", "Survey deleted");
      setSelectedId(null);
      await reload();
    } catch (e) { globalToast?.("error", safeError(e)); }
  };

  // Aggregate stats for the selected survey
  const selected = surveys.find(s => s.id === selectedId);
  const total = responses.length;
  const avg = total > 0 ? (responses.reduce((s, r) => s + r.rating, 0) / total) : 0;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  responses.forEach(r => { counts[r.rating] = (counts[r.rating] || 0) + 1; });

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <div className="page-title">Surveys</div>
          <div className="page-subtitle">Send a mandatory app-rating survey to every user and view the results.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* ── Compose card ── */}
        <div className="card">
          <div className="card-header"><span className="card-title">New survey</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--tx2)", marginBottom: 4, fontWeight: 600 }}>Title <span style={{ color: "var(--red)" }}>*</span></label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. May feedback round"
                className="form-input"
                maxLength={120}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--tx2)", marginBottom: 4, fontWeight: 600 }}>Intro message <span style={{ color: "var(--tx3)", fontWeight: 400 }}>(optional, shown above the stars)</span></label>
              <textarea
                value={intro}
                onChange={e => setIntro(e.target.value)}
                placeholder="e.g. Quick 30-second check — how are we doing this month?"
                rows={3}
                maxLength={500}
                className="form-input"
                style={{ width: "100%", resize: "vertical", fontFamily: "var(--font)", fontSize: 13 }}
              />
              <div style={{ textAlign: "right", fontSize: 10, color: "var(--tx3)" }}>{intro.length}/500</div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--tx2)", marginBottom: 4, fontWeight: 600 }}>Auto-close on <span style={{ color: "var(--tx3)", fontWeight: 400 }}>(optional)</span></label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="form-input"
                style={{ width: "100%" }}
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={!title.trim() || sending}
              onClick={onCreate}
              style={{ marginTop: 4 }}
            >{sending ? "Sending…" : "Send to all users"}</button>
            <div style={{ fontSize: 11, color: "var(--tx3)", lineHeight: 1.45 }}>
              Sending will <strong>auto-close</strong> any currently active survey. Every
              user gets a blocking modal next time they open Pulse, until they submit.
            </div>
          </div>
        </div>

        {/* ── Past surveys list ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Surveys</span>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>{surveys.length} total</span>
          </div>
          <AsyncSection
            loading={loading}
            error={loadError}
            isEmpty={surveys.length === 0}
            onRetry={reload}
            errorTitle="Couldn't load surveys"
            skeleton={<SkeletonTable/>}
            empty={{ illus: "empty", title: "No surveys yet", description: "Create the first one on the left — it'll appear here with response stats once people start answering." }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {surveys.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    textAlign: "left", background: selectedId === s.id ? "var(--accent-light)" : "transparent",
                    border: "1px solid " + (selectedId === s.id ? "var(--tabby-purple-light,#8B4D99)" : "var(--bd2)"),
                    borderRadius: 10, padding: "10px 12px", cursor: "pointer",
                    transition: "background .15s",
                    fontFamily: "var(--font)",
                  }}
                  onMouseEnter={e => { if (selectedId !== s.id) e.currentTarget.style.background = "var(--bg)"; }}
                  onMouseLeave={e => { if (selectedId !== s.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>{s.title}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700,
                      background: s.is_active ? "var(--green-bg)" : "var(--bg2)",
                      color: s.is_active ? "var(--green)" : "var(--tx3)",
                    }}>{s.is_active ? "OPEN" : "CLOSED"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>
                    Created {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" "}by {nameFromEmail(s.created_by)}
                  </div>
                </button>
              ))}
            </div>
          </AsyncSection>
        </div>
      </div>

      {/* ── Results for the selected survey ── */}
      {selected && (
        <div className="card">
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="card-title">Results · {selected.title}</span>
            <div style={{ display: "flex", gap: 8 }}>
              {selected.is_active && (
                <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => onClose(selected.id)}>
                  Close survey
                </button>
              )}
              <button className="btn btn-outline btn-sm" style={{ fontSize: 11, color: "var(--red)" }} onClick={() => onDelete(selected.id)}>
                Delete
              </button>
            </div>
          </div>
          {respLoading ? <SkeletonTable/> : total === 0 ? (
            <EmptyState illus="empty" title="No responses yet" description="As users respond, their rating and feedback will appear here in real time."/>
          ) : (
            <>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, alignItems: "center", marginBottom: 20, padding: "12px 0" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: "var(--tx)", letterSpacing: "-2px" }}>{avg.toFixed(1)}</div>
                  <div style={{ marginTop: 4 }}><StarsRow value={Math.round(avg)}/></div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 6 }}>{total} response{total === 1 ? "" : "s"}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[5, 4, 3, 2, 1].map(n => <StarBar key={n} n={n} count={counts[n] || 0} total={total}/>)}
                </div>
              </div>

              {/* Per-respondent feedback */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", letterSpacing: ".8px", textTransform: "uppercase", marginTop: 24, marginBottom: 12 }}>
                Individual responses
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {responses.map(r => (
                  <div key={r.id} style={{
                    padding: 14, background: "var(--bg)", borderRadius: 10,
                    border: "1px solid var(--bd2)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: r.feedback ? 8 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--tx)" }}>{nameFromEmail(r.user_email)}</span>
                        <StarsRow value={r.rating}/>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--tx3)" }} title={new Date(r.submitted_at).toLocaleString("en-GB")}>
                        {new Date(r.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    {r.feedback && (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {r.feedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
