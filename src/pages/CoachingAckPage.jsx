import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";
import { emailsMatchLoose } from "../lib/utils.js";

// Landing page for the "I've read this" link in coaching emails. The
// QA receiving the email clicks → the link opens the portal at
// /#/coaching/ack/<session_id>. This route then:
//   1. Confirms the signed-in user matches the session's qa_email
//   2. Inserts a row into coaching_session_acks (RLS enforces the same
//      check server-side via the insert_self policy)
//   3. Shows a confirmation, with a link back to the QA Profile
//
// If the user is not signed in, App.jsx already gates everything on a
// session; the QA will hit the login screen first, then return here.
export default function CoachingAckPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, profile, globalToast } = useApp();
  const [state, setState] = useState({ loading: true, error: null, alreadyAcked: false, session: null });

  useEffect(() => {
    if (!id || !token || !profile?.email) return;
    let cancelled = false;
    (async () => {
      try {
        // 1. Look up the session so we can show context + verify ownership.
        const rows = await sb.query("coaching_sessions", {
          token,
          select: "id,qa_email,sender_email,session_date,meeting_type,email_subject",
          filters: `id=eq.${id}`,
        }).catch(() => []);
        const sess = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (!sess) {
          if (!cancelled) setState({ loading: false, error: "We couldn't find this coaching session — the link may be expired.", alreadyAcked: false, session: null });
          return;
        }
        // Loose-match: a QA whose session was logged under @tabby.ai
        // but who's signed in via @tabby.sa (or vice versa) should
        // still be recognized as the legitimate recipient. RLS still
        // validates server-side via the insert_self policy.
        if (!emailsMatchLoose(sess.qa_email, profile.email)) {
          if (!cancelled) setState({ loading: false, error: "This acknowledgement link belongs to a different teammate. You're signed in as " + profile.email + ".", alreadyAcked: false, session: sess });
          return;
        }

        // 2. Check if already acked — show "thanks, you already confirmed".
        const existing = await sb.query("coaching_session_acks", {
          token,
          select: "session_id,acked_at",
          filters: `session_id=eq.${id}`,
        }).catch(() => []);
        if (existing && existing[0]) {
          if (!cancelled) setState({ loading: false, error: null, alreadyAcked: true, session: sess });
          return;
        }

        // 3. Insert the ack idempotently. Two simultaneous opens of
        //    the same email link (user clicks twice) used to both
        //    pass the "not yet acked" check above and then both POST,
        //    creating duplicate ack rows when the table doesn't have
        //    a uniqueness constraint on (session_id, member_email).
        //    Prefer: resolution=ignore-duplicates makes PostgREST
        //    no-op the second insert; RLS still enforces ownership.
        //    NOTE: the column is qa_email (renamed from member_email in
        //    commit 156d966); posting member_email 400s (PGRST204) and
        //    silently broke every coaching ack after the rename.
        const { error } = await sb.query("coaching_session_acks", {
          token,
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: { session_id: id, qa_email: profile.email },
        }).then(d => ({ error: null, data: d })).catch(e => ({ error: e?.message || String(e), data: null }));

        if (error) {
          if (!cancelled) setState({ loading: false, error, alreadyAcked: false, session: sess });
          return;
        }
        if (!cancelled) setState({ loading: false, error: null, alreadyAcked: true, session: sess });
        globalToast?.("success", "Thanks — your acknowledgement has been recorded.");
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e?.message || String(e), alreadyAcked: false, session: null });
      }
    })();
    return () => { cancelled = true; };
  }, [id, token, profile?.email, globalToast]);

  return (
    <div className="page" style={{ maxWidth: 560, margin: "40px auto" }}>
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        {state.loading ? (
          <div style={{ color: "var(--tx2)" }}>Recording your acknowledgement…</div>
        ) : state.error ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Couldn't record your acknowledgement</div>
            <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 16 }}>{state.error}</div>
            <button className="btn btn-outline" onClick={() => navigate("/dashboard")}>Back to dashboard</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {state.alreadyAcked ? "You've already confirmed this session." : "Thanks for confirming."}
            </div>
            {state.session && (
              <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 16 }}>
                {state.session.email_subject || "Coaching session"} on {new Date(state.session.session_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </div>
            )}
            <button className="btn btn-primary" onClick={() => navigate("/profile")}>Open my profile</button>
          </>
        )}
      </div>
    </div>
  );
}
