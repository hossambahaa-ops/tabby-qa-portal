import React, { useState } from "react";
import { hasRole } from "../../lib/constants.js";
import { sb } from "../../lib/supabase.js";
import { logActivity } from "../../lib/utils.js";
import SearchableSelect from "../SearchableSelect.jsx";
import SlideOver from "../SlideOver.jsx";
import { useApp } from "../../lib/AppContext.jsx";

// Renders the composer as a right-side slide-over so the dashboard
// stays visible underneath while the user picks their audience.
function AnnouncementForm({ roster, onClose, open = true }) {
  const { profile, token, globalToast } = useApp();
  const [annForm, setAnnForm] = useState({ title: "", message: "", priority: "normal", target_type: "my_team", target_value: "" });
  const [sending, setSending] = useState(false);

  const nameFromEmail = (email) => {
    if (!email) return "—";
    const local = email.split("@")[0];
    return local.split(".").map(p => { const c = p.replace(/[\d]+$/, ""); return c ? c.charAt(0).toUpperCase() + c.slice(1) : ""; }).filter(Boolean).join(" ");
  };

  const reset = () => setAnnForm({ title: "", message: "", priority: "normal", target_type: "my_team", target_value: "" });

  const sendAnnouncement = async () => {
    if (!annForm.title.trim() || !annForm.message.trim()) { globalToast("error", "Title and message are required"); return; }
    if (annForm.target_type !== "all" && annForm.target_type !== "my_team" && !annForm.target_value) { globalToast("error", "Please select a target"); return; }
    if (annForm.target_type === "individuals" && (!Array.isArray(annForm.target_value) || annForm.target_value.length === 0)) { globalToast("error", "Select at least one person"); return; }
    setSending(true);
    try {
      if (annForm.target_type === "individuals") {
        for (const em of annForm.target_value) {
          await sb.query("announcements", { token, method: "POST", body: { title: annForm.title, message: annForm.message, priority: annForm.priority, target_type: "individual", target_value: em, sent_by: profile?.email, requires_ack: true } });
        }
        logActivity(token, profile?.email, "announcement_sent", "announcements", null, `Title: ${annForm.title}, Target: ${annForm.target_value.length} individuals`);
        reset(); onClose();
        globalToast("success", `Announcement sent to ${annForm.target_value.length} people!`);
        return;
      }
      const targetValue = annForm.target_type === "all" ? null : annForm.target_type === "my_team" ? profile?.email : annForm.target_value;
      await sb.query("announcements", { token, method: "POST", body: { title: annForm.title, message: annForm.message, priority: annForm.priority, target_type: annForm.target_type, target_value: targetValue, sent_by: profile?.email, requires_ack: true } });
      logActivity(token, profile?.email, "announcement_sent", "announcements", null, `Title: ${annForm.title}, Target: ${annForm.target_type}${targetValue ? " (" + targetValue + ")" : ""}`);
      reset(); onClose();
      globalToast("success", "Announcement sent successfully!");
    } catch (e) {
      console.error("Announcement error:", e);
      globalToast("error", "Failed: " + (e.message || "Unknown error"));
    }
    setSending(false);
  };

  const footer = (
    <>
      <button className="btn btn-outline" onClick={onClose} disabled={sending}>Cancel</button>
      <button className="btn btn-primary" onClick={sendAnnouncement} disabled={sending}>{sending ? "Sending…" : "Send announcement"}</button>
    </>
  );

  return (
    <SlideOver open={open} title="📢 Send announcement" onClose={onClose} footer={footer} preventBackdropClose={sending}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group" style={{ gridColumn: "1/-1" }}>
          <label className="form-label">Title *</label>
          <input className="form-input" value={annForm.title} onChange={e => setAnnForm({ ...annForm, title: e.target.value })} placeholder="Announcement title..." autoFocus />
        </div>
        <div className="form-group" style={{ gridColumn: "1/-1" }}>
          <label className="form-label">Message *</label>
          <textarea className="form-input" rows={6} value={annForm.message} onChange={e => setAnnForm({ ...annForm, message: e.target.value })} placeholder="Write your message here..." style={{ resize: "vertical" }} />
        </div>
        <div className="form-group">
          <label className="form-label">Priority</label>
          <SearchableSelect options={[{ value: "normal", label: "ℹ️ Normal" }, { value: "important", label: "⚠️ Important" }, { value: "urgent", label: "🔴 Urgent" }]} value={annForm.priority} onChange={v => setAnnForm({ ...annForm, priority: v })} placeholder="Normal" />
        </div>
        <div className="form-group">
          <label className="form-label">Send to</label>
          <SearchableSelect options={[
            ...(hasRole(profile?.role, "qa_supervisor") ? [{ value: "all", label: "Everyone" }, { value: "domain", label: "Specific domain" }] : []),
            { value: "my_team", label: "My team" },
            { value: "team", label: "Specific team" },
            { value: "individual", label: "Individual person" },
            { value: "individuals", label: "Multiple people" },
          ]} value={annForm.target_type} onChange={v => setAnnForm({ ...annForm, target_type: v, target_value: v === "individuals" ? [] : "" })} placeholder="Select audience" />
        </div>
        {annForm.target_type === "domain" && <div className="form-group" style={{ gridColumn: "1/-1" }}>
          <label className="form-label">Domain</label>
          <SearchableSelect options={[{ value: "tabby.ai", label: "tabby.ai" }, { value: "tabby.sa", label: "tabby.sa" }]} value={annForm.target_value} onChange={v => setAnnForm({ ...annForm, target_value: v })} placeholder="Select domain" />
        </div>}
        {annForm.target_type === "team" && <div className="form-group" style={{ gridColumn: "1/-1" }}>
          <label className="form-label">Team</label>
          <SearchableSelect options={[...new Set(roster.map(r => r.queue).filter(Boolean))].sort()} value={annForm.target_value} onChange={v => setAnnForm({ ...annForm, target_value: v })} placeholder="Select team" />
        </div>}
        {annForm.target_type === "individual" && <div className="form-group" style={{ gridColumn: "1/-1" }}>
          <label className="form-label">Person</label>
          <SearchableSelect options={roster.map(r => ({ value: r.email, label: r.email + ` (${nameFromEmail(r.email)})` }))} value={annForm.target_value} onChange={v => setAnnForm({ ...annForm, target_value: v })} placeholder="Select person" />
        </div>}
        {annForm.target_type === "individuals" && <div className="form-group" style={{ gridColumn: "1/-1" }}>
          <label className="form-label">People ({Array.isArray(annForm.target_value) ? annForm.target_value.length : 0} selected)</label>
          <SearchableSelect multi options={roster.map(r => ({ value: r.email, label: nameFromEmail(r.email) + ` (${r.email})` }))} value={Array.isArray(annForm.target_value) ? annForm.target_value : []} onChange={v => setAnnForm({ ...annForm, target_value: v })} placeholder="Select multiple people..." />
        </div>}
      </div>
    </SlideOver>
  );
}

export default AnnouncementForm;
