import React, { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { hasRole } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { logActivity, nameFromEmail } from "../../lib/utils.js";
import SearchableSelect from "../SearchableSelect.jsx";
import SlideOver from "../SlideOver.jsx";
import RichTextField from "../coaching/RichTextField.jsx";
import { useApp } from "../../lib/AppContext.jsx";
import {
  isLive, statusOf, recipientsFor, audienceLabel,
} from "../../lib/announcementUtils.js";
import { listProfiles } from "../../api/profiles.js";

// Slide-over composer + sender-side admin panel for announcements.
//
// Two tabs:
//   Compose — write a new one (title, message, audience, priority,
//             body_format plain/rich, dismiss_mode modal/banner,
//             schedule send_at, optional expires_at, templates).
//   Manage  — list everything you've sent. Per-row pill (active /
//             scheduled / expired / deleted), ack progress, click to
//             expand for the per-recipient ack table + delete.
//
// Drafts auto-save to localStorage keyed by user email so closing
// the slide-over doesn't lose work.

const DRAFT_KEY = (email) => `ann_draft_${email || "anon"}`;

// Canned starting points. Picking a template overwrites title +
// message; the rest of the form is untouched.
const TEMPLATES = [
  { id: "policy",   label: "📜 Policy change",
    title: "Policy update — [topic]",
    message: "Effective [date], the [policy] is changing.\n\nWhat's different:\n- \n- \n\nWhy: \n\nReach out to your TL if anything's unclear." },
  { id: "schedule", label: "📅 Schedule update",
    title: "Schedule change — [week]",
    message: "Heads-up: the schedule for [week] has been updated.\n\nChange: \n\nPlease re-check your shift in the Attendance page." },
  { id: "feature",  label: "✨ New feature",
    title: "New in Pulse: [feature]",
    message: "We just shipped [feature]. \n\nWhat it does: \n\nWhere to find it: \n\nFeedback welcome." },
  { id: "welcome",  label: "👋 Welcome",
    title: "Welcome to the team!",
    message: "Everyone — please welcome [name] who joins us as [role]. \n\nReporting to: \nStart date: \n\nSay hi when you get a chance!" },
];

function AnnouncementForm({ roster, onClose, open = true }) {
  const { profile, token, globalToast } = useApp();
  const myEmail = (profile?.email || "").toLowerCase();
  const isAdmin = hasRole(profile?.role, "admin");

  const [tab, setTab] = useState("compose"); // compose | manage

  // ── Compose state ──
  const blankForm = {
    title: "", message: "", priority: "normal",
    target_type: "my_team", target_value: "",
    body_format: "plain",     // plain | html
    dismiss_mode: "modal",    // modal | banner
    requires_ack: true,
    send_at: "",              // empty = send now
    expires_at: "",           // empty = never
  };
  const [annForm, setAnnForm] = useState(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(myEmail));
      if (raw) return { ...blankForm, ...JSON.parse(raw) };
    } catch {}
    return blankForm;
  });
  const [sending, setSending] = useState(false);

  // Autosave draft (debounced via React batching is fine here).
  useEffect(() => {
    if (!myEmail) return;
    try { localStorage.setItem(DRAFT_KEY(myEmail), JSON.stringify(annForm)); } catch {}
  }, [annForm, myEmail]);

  const resetForm = () => {
    setAnnForm(blankForm);
    try { localStorage.removeItem(DRAFT_KEY(myEmail)); } catch {}
  };

  const applyTemplate = (id) => {
    const t = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setAnnForm(prev => ({ ...prev, title: t.title, message: t.message }));
  };

  // Compose body editor — switches between plain textarea and the
  // existing RichTextField (sanitized HTML output).
  const renderBodyEditor = () => annForm.body_format === "html" ? (
    <RichTextField
      value={annForm.message}
      onChange={(html) => setAnnForm({ ...annForm, message: html })}
      placeholder="Write your message here…"
      maxChars={4000}
    />
  ) : (
    <textarea className="form-input" rows={6}
      value={annForm.message}
      onChange={e => setAnnForm({ ...annForm, message: e.target.value })}
      placeholder="Write your message here…"
      style={{ resize: "vertical" }}
    />
  );

  const sendAnnouncement = async () => {
    if (!annForm.title.trim() || !annForm.message.trim()) {
      globalToast("error", "Title and message are required");
      return;
    }
    if (annForm.target_type !== "all" && annForm.target_type !== "my_team" && !annForm.target_value) {
      globalToast("error", "Please select a target"); return;
    }
    if (annForm.target_type === "individuals" && (!Array.isArray(annForm.target_value) || annForm.target_value.length === 0)) {
      globalToast("error", "Select at least one person"); return;
    }
    setSending(true);
    // Common payload bits. Defensive defaults: any of the enum-ish
    // fields landing empty (e.g. user toggled the dropdown off) would
    // fail the DB check constraint, so fall back to the safe option.
    const baseBody = {
      title: annForm.title,
      message: annForm.message,
      priority: annForm.priority || "normal",
      sent_by: profile?.email,
      requires_ack: annForm.requires_ack !== false,
      body_format: annForm.body_format || "plain",
      dismiss_mode: annForm.dismiss_mode || "modal",
      send_at: annForm.send_at ? new Date(annForm.send_at).toISOString() : null,
      expires_at: annForm.expires_at ? new Date(annForm.expires_at).toISOString() : null,
      published: true,
    };
    try {
      if (annForm.target_type === "individuals") {
        for (const em of annForm.target_value) {
          await sb.query("announcements", { token, method: "POST", body: {
            ...baseBody, target_type: "individual", target_value: em,
          }});
        }
        logActivity(token, profile?.email, "announcement_sent", "announcements", null, `Title: ${annForm.title}, ${annForm.target_value.length} individuals`);
        globalToast("success", `Announcement sent to ${annForm.target_value.length} people`);
      } else {
        const tv = annForm.target_type === "all" ? null
                 : annForm.target_type === "my_team" ? profile?.email
                 : annForm.target_value;
        await sb.query("announcements", { token, method: "POST", body: {
          ...baseBody, target_type: annForm.target_type, target_value: tv,
        }});
        logActivity(token, profile?.email, "announcement_sent", "announcements", null, `Title: ${annForm.title}, ${annForm.target_type}${tv ? " ("+tv+")" : ""}`);
        globalToast("success", annForm.send_at
          ? `Scheduled for ${new Date(annForm.send_at).toLocaleString("en-GB")}`
          : "Announcement sent");
      }
      resetForm();
      onClose();
    } catch (e) {
      console.error("Announcement send:", e);
      globalToast("error", "Failed: " + (e.message || "Unknown error"));
    }
    setSending(false);
  };

  // ── Manage tab state ──
  const [mineLoading, setMineLoading] = useState(false);
  const [mine, setMine] = useState([]);           // announcements + ack rollups
  const [profiles, setProfiles] = useState([]);   // for recipient resolution
  const [expanded, setExpanded] = useState(null); // announcement id

  const loadMine = async () => {
    setMineLoading(true);
    try {
      // RLS gives us our own + (admin: everyone). Pull profiles for
      // recipient resolution (used by recipientsFor + ack table).
      const [anns, acks, profs] = await Promise.all([
        sb.query("announcements", {
          token,
          select: "id,title,message,priority,sent_by,target_type,target_value,requires_ack,body_format,dismiss_mode,send_at,expires_at,published,deleted_at,created_at",
          filters: isAdmin
            ? "order=created_at.desc"
            : `sent_by=eq.${profile?.email}&order=created_at.desc`,
        }).catch(() => []),
        sb.query("announcement_acks", {
          token, select: "announcement_id,user_email,acknowledged_at",
        }).catch(() => []),
        listProfiles({ token, select: "email,role,domain,operational_domain", cacheKey: "profiles_for_ann" }).catch(() => []),
      ]);
      // Index acks by announcement_id.
      const ackByAnn = new Map();
      for (const a of (acks || [])) {
        const list = ackByAnn.get(a.announcement_id) || [];
        list.push(a);
        ackByAnn.set(a.announcement_id, list);
      }
      setProfiles(profs || []);
      setMine((anns || []).map(a => ({
        ...a,
        acks: ackByAnn.get(a.id) || [],
      })));
    } catch (e) {
      console.error("Load mine:", e);
    }
    setMineLoading(false);
  };

  useEffect(() => { if (tab === "manage") loadMine(); /* eslint-disable-next-line */ }, [tab]);

  const deleteAnn = async (ann) => {
    if (!window.confirm(`Delete "${ann.title}"?\n\nThis removes it for all recipients and is irreversible.`)) return;
    try {
      await sb.query("announcements", {
        token, method: "DELETE", filters: `id=eq.${ann.id}`,
      });
      logActivity(token, profile?.email, "announcement_deleted", "announcements", ann.id, `Title: ${ann.title}`);
      setMine(prev => prev.filter(x => x.id !== ann.id));
      globalToast("success", "Deleted");
    } catch (e) {
      globalToast("error", "Delete failed: " + (e.message || "Unknown error"));
    }
  };

  // Aggregate analytics across the loaded set — total / live / avg-
  // ack-time / overall ack rate.
  const analytics = useMemo(() => {
    if (!mine.length) return null;
    const live = mine.filter(a => isLive(a));
    let recipientsTotal = 0, acksTotal = 0, ackTimes = [];
    for (const a of mine) {
      const recips = recipientsFor(a, roster || [], profiles).length;
      recipientsTotal += recips;
      acksTotal += a.acks.length;
      for (const ack of a.acks) {
        const dt = new Date(ack.acknowledged_at) - new Date(a.created_at);
        if (dt > 0) ackTimes.push(dt);
      }
    }
    const avgMs = ackTimes.length ? ackTimes.reduce((s, t) => s + t, 0) / ackTimes.length : 0;
    const fmt = (ms) => {
      if (!ms) return "—";
      const m = Math.round(ms / 60000);
      if (m < 60) return `${m}m`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ${m % 60}m`;
      const d = Math.floor(h / 24);
      return `${d}d ${h % 24}h`;
    };
    return {
      total: mine.length,
      live: live.length,
      acksRate: recipientsTotal ? Math.round((acksTotal / recipientsTotal) * 100) : 0,
      avgAck: fmt(avgMs),
    };
  }, [mine, profiles, roster]);

  // ── Render ──
  const footer = tab === "compose" ? (
    <>
      <button className="btn btn-outline" onClick={onClose} disabled={sending}>Cancel</button>
      <button className="btn btn-primary" onClick={sendAnnouncement} disabled={sending}>
        {sending ? "Sending…" : annForm.send_at ? "Schedule" : "Send now"}
      </button>
    </>
  ) : (
    <button className="btn btn-outline" onClick={onClose}>Close</button>
  );

  return (
    <SlideOver open={open} title="📢 Announcements" onClose={onClose} footer={footer} preventBackdropClose={sending}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--bg2)", padding: 4, borderRadius: 10, width: "fit-content" }}>
        {[
          { k: "compose", label: "Compose" },
          { k: "manage",  label: "Manage" },
        ].map(t => (
          <button key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: tab === t.k ? "var(--bg3)" : "transparent",
              color: tab === t.k ? "var(--tabby-purple)" : "var(--tx2)",
              fontWeight: tab === t.k ? 700 : 500, fontFamily: "var(--font)",
              fontSize: 12, cursor: "pointer",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "compose" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group" style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Start from a template (optional)</label>
            <SearchableSelect
              options={TEMPLATES.map(t => ({ value: t.id, label: t.label }))}
              value=""
              onChange={applyTemplate}
              placeholder="Pick a starting point…"
            />
          </div>

          <div className="form-group" style={{ gridColumn: "1/-1" }}>
            <label className="form-label">Title *</label>
            <input className="form-input"
              value={annForm.title}
              onChange={e => setAnnForm({ ...annForm, title: e.target.value })}
              placeholder="Announcement title…" autoFocus />
          </div>

          <div className="form-group" style={{ gridColumn: "1/-1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <label className="form-label" style={{ margin: 0 }}>Message *</label>
              <div style={{ display: "flex", gap: 6 }}>
                {["plain", "html"].map(f => (
                  <button key={f}
                    onClick={() => setAnnForm({ ...annForm, body_format: f })}
                    style={{
                      padding: "2px 8px", fontSize: 10, fontWeight: 600,
                      border: "1px solid var(--bd)",
                      background: annForm.body_format === f ? "var(--tabby-purple)" : "transparent",
                      color: annForm.body_format === f ? "#fff" : "var(--tx2)",
                      borderRadius: 6, cursor: "pointer", fontFamily: "var(--font)",
                    }}>
                    {f === "plain" ? "Plain" : "Rich"}
                  </button>
                ))}
              </div>
            </div>
            {renderBodyEditor()}
          </div>

          <div className="form-group">
            <label className="form-label">Priority</label>
            <SearchableSelect
              options={[
                { value: "normal", label: "ℹ️ Normal" },
                { value: "important", label: "⚠️ Important" },
                { value: "urgent", label: "🔴 Urgent" },
              ]}
              value={annForm.priority}
              /* SearchableSelect toggles the selected option off when re-
                 clicked, which would set priority to "" and fail the DB
                 check constraint. Guard with truthy check so re-clicking
                 keeps the existing value. Same pattern below. */
              onChange={v => v && setAnnForm({ ...annForm, priority: v })}
              placeholder="Normal" />
          </div>

          <div className="form-group">
            <label className="form-label">Display style</label>
            <SearchableSelect
              options={[
                { value: "modal",  label: "🛑 Blocking modal" },
                { value: "banner", label: "📌 Dashboard banner" },
              ]}
              value={annForm.dismiss_mode}
              onChange={v => v && setAnnForm({ ...annForm, dismiss_mode: v })}
              placeholder="Modal" />
          </div>

          <div className="form-group">
            <label className="form-label">Send to</label>
            <SearchableSelect
              options={[
                ...(hasRole(profile?.role, "qa_supervisor") ? [
                  { value: "all", label: "Everyone" },
                  { value: "domain", label: "Specific domain" },
                ] : []),
                { value: "my_team", label: "My team" },
                { value: "team", label: "Specific team" },
                { value: "individual", label: "Individual person" },
                { value: "individuals", label: "Multiple people" },
              ]}
              value={annForm.target_type}
              onChange={v => setAnnForm({ ...annForm, target_type: v, target_value: v === "individuals" ? [] : "" })}
              placeholder="Select audience" />
          </div>

          <div className="form-group">
            <label className="form-label">Requires acknowledgement?</label>
            <SearchableSelect
              options={[
                { value: "yes", label: "Yes — track who's seen it" },
                { value: "no",  label: "No — informational only" },
              ]}
              value={annForm.requires_ack ? "yes" : "no"}
              onChange={v => setAnnForm({ ...annForm, requires_ack: v === "yes" })}
              placeholder="Yes" />
          </div>

          {annForm.target_type === "domain" && (
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Domain</label>
              <SearchableSelect
                options={[{ value: "tabby.ai", label: "tabby.ai" }, { value: "tabby.sa", label: "tabby.sa" }]}
                value={annForm.target_value}
                onChange={v => setAnnForm({ ...annForm, target_value: v })}
                placeholder="Select domain" />
            </div>
          )}
          {annForm.target_type === "team" && (
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Team</label>
              <SearchableSelect
                options={[...new Set((roster || []).map(r => r.queue).filter(Boolean))].sort()}
                value={annForm.target_value}
                onChange={v => setAnnForm({ ...annForm, target_value: v })}
                placeholder="Select team" />
            </div>
          )}
          {annForm.target_type === "individual" && (
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Person</label>
              <SearchableSelect
                options={(roster || []).map(r => ({ value: r.email, label: r.email + ` (${nameFromEmail(r.email)})` }))}
                value={annForm.target_value}
                onChange={v => setAnnForm({ ...annForm, target_value: v })}
                placeholder="Select person" />
            </div>
          )}
          {annForm.target_type === "individuals" && (
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">People ({Array.isArray(annForm.target_value) ? annForm.target_value.length : 0} selected)</label>
              <SearchableSelect multi
                options={(roster || []).map(r => ({ value: r.email, label: nameFromEmail(r.email) + ` (${r.email})` }))}
                value={Array.isArray(annForm.target_value) ? annForm.target_value : []}
                onChange={v => setAnnForm({ ...annForm, target_value: v })}
                placeholder="Select multiple people…" />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Schedule for (optional)</label>
            <input className="form-input" type="datetime-local"
              value={annForm.send_at}
              onChange={e => setAnnForm({ ...annForm, send_at: e.target.value })} />
            <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 4 }}>Leave blank to send immediately.</div>
          </div>

          <div className="form-group">
            <label className="form-label">Expires (optional)</label>
            <input className="form-input" type="datetime-local"
              value={annForm.expires_at}
              onChange={e => setAnnForm({ ...annForm, expires_at: e.target.value })} />
            <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 4 }}>After this, the message stops surfacing to new users.</div>
          </div>

          <div className="form-group" style={{ gridColumn: "1/-1", textAlign: "right" }}>
            <button className="btn btn-outline btn-sm" onClick={resetForm} type="button" style={{ fontSize: 11 }}>
              Clear draft
            </button>
          </div>
        </div>
      )}

      {tab === "manage" && (
        <ManagePanel
          mine={mine} mineLoading={mineLoading} expanded={expanded} setExpanded={setExpanded}
          profiles={profiles} roster={roster} analytics={analytics}
          onDelete={deleteAnn} myEmail={myEmail} isAdmin={isAdmin}
        />
      )}
    </SlideOver>
  );
}

// ───────────────────────────────────────────────────────────────────
// Sender-side history + per-announcement recipients/ack table.
// ───────────────────────────────────────────────────────────────────
function ManagePanel({ mine, mineLoading, expanded, setExpanded, profiles, roster, analytics, onDelete, myEmail, isAdmin }) {
  if (mineLoading) return <div style={{ padding: 24, color: "var(--tx3)", fontSize: 13 }}>Loading…</div>;
  if (!mine.length) return <div style={{ padding: 24, color: "var(--tx3)", fontSize: 13 }}>Nothing sent yet.</div>;

  return (
    <div>
      {/* Analytics strip */}
      {analytics && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <Stat label="Sent total" value={analytics.total} />
          <Stat label="Active now" value={analytics.live} />
          <Stat label="Overall ack rate" value={`${analytics.acksRate}%`} />
          <Stat label="Avg ack time" value={analytics.avgAck} />
        </div>
      )}

      {/* Announcement list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {mine.map(ann => {
          const status = statusOf(ann);
          const recips = recipientsFor(ann, roster || [], profiles);
          const ackedSet = new Set(ann.acks.map(a => (a.user_email || "").toLowerCase()));
          const ackedRecipients = recips.filter(e => ackedSet.has(e));
          const ackPct = recips.length ? Math.round((ackedRecipients.length / recips.length) * 100) : 0;
          const isOpen = expanded === ann.id;
          const canDelete = isAdmin || (ann.sent_by || "").toLowerCase() === myEmail;
          return (
            <div key={ann.id} className="card" style={{ padding: 12, cursor: "pointer" }}
              onClick={() => setExpanded(isOpen ? null : ann.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 14 }}>{ann.title || "(no title)"}</strong>
                    <StatusPill status={status} />
                    <PriorityPill p={ann.priority} />
                    {ann.dismiss_mode === "banner" && <span style={{ fontSize: 10, padding: "2px 6px", background: "var(--bg)", color: "var(--tx3)", borderRadius: 6 }}>Banner</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>
                    {audienceLabel(ann)} · {new Date(ann.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {ann.send_at && status === "scheduled" && ` · publishes ${new Date(ann.send_at).toLocaleString("en-GB")}`}
                    {ann.expires_at && ` · expires ${new Date(ann.expires_at).toLocaleString("en-GB")}`}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ackPct >= 80 ? "var(--green)" : ackPct >= 50 ? "var(--amber)" : "var(--tx2)" }}>
                    {ackedRecipients.length} / {recips.length}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--tx3)" }}>{ackPct}% acked</div>
                </div>
              </div>

              {isOpen && (
                <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--bd2)" }}>
                  {/* Body preview */}
                  <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 12, padding: 10, background: "var(--bg)", borderRadius: 8 }}>
                    {ann.body_format === "html"
                      ? <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ann.message || "", { ALLOWED_TAGS: ["p","br","b","strong","i","em","u","ul","ol","li","a","div","span"], ALLOWED_ATTR: ["href","target","rel"] }) }} />
                      : <div style={{ whiteSpace: "pre-wrap" }}>{ann.message}</div>}
                  </div>
                  {/* Recipients table */}
                  <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--bd2)", borderRadius: 8 }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg)", position: "sticky", top: 0 }}>
                          <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--tx3)", fontWeight: 600 }}>Recipient</th>
                          <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--tx3)", fontWeight: 600 }}>Acked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recips.length === 0 && (
                          <tr><td colSpan={2} style={{ padding: 10, color: "var(--tx3)", fontStyle: "italic" }}>No recipients computed.</td></tr>
                        )}
                        {recips.map(em => {
                          const ack = ann.acks.find(a => (a.user_email || "").toLowerCase() === em);
                          return (
                            <tr key={em} style={{ borderTop: "1px solid var(--bd2)" }}>
                              <td style={{ padding: "6px 10px" }}>{nameFromEmail(em)} <span style={{ color: "var(--tx3)" }}>· {em}</span></td>
                              <td style={{ padding: "6px 10px", textAlign: "right" }}>
                                {ack
                                  ? <span style={{ color: "var(--green)", fontWeight: 600 }}>✓ {new Date(ack.acknowledged_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                                  : <span style={{ color: "var(--tx3)" }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                    {canDelete && (
                      <button className="btn btn-outline btn-sm" onClick={() => onDelete(ann)} style={{ fontSize: 11, color: "var(--red)", borderColor: "var(--red)" }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "10px 14px", background: "var(--bg3)", border: "1px solid var(--bd2)", borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    active:    { bg: "var(--green-bg)", color: "var(--green)", label: "Active" },
    scheduled: { bg: "var(--blue-bg)",  color: "var(--blue)",  label: "Scheduled" },
    expired:   { bg: "var(--bg)",       color: "var(--tx3)",   label: "Expired" },
    draft:     { bg: "var(--bg2)",      color: "var(--tx2)",   label: "Draft" },
    deleted:   { bg: "var(--red-bg)",   color: "var(--red)",   label: "Deleted" },
  }[status] || { bg: "var(--bg)", color: "var(--tx3)", label: status };
  return <span style={{ fontSize: 10, padding: "2px 8px", background: map.bg, color: map.color, borderRadius: 6, fontWeight: 700, letterSpacing: ".3px" }}>{map.label}</span>;
}

function PriorityPill({ p }) {
  const map = {
    urgent:    { bg: "var(--red-bg)",   color: "var(--red)",   label: "Urgent" },
    important: { bg: "var(--amber-bg)", color: "var(--amber)", label: "Important" },
    normal:    { bg: "var(--primary-light)", color: "var(--tabby-purple)", label: "Normal" },
  }[p] || { bg: "var(--bg)", color: "var(--tx3)", label: p || "Normal" };
  return <span style={{ fontSize: 10, padding: "2px 8px", background: map.bg, color: map.color, borderRadius: 6, fontWeight: 700 }}>{map.label}</span>;
}

export default AnnouncementForm;
