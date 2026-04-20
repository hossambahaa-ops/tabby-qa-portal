import React, { useState, useEffect, useCallback } from "react";
import { hasRole, ROLE_LABELS } from "../lib/constants.js";
import { sb, SUPABASE_URL, SUPABASE_ANON, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { listProfiles } from "../api/profiles.js";
import { listEscalations } from "../api/escalations.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import SkeletonPage from "../components/Skeleton.jsx";
import SearchableSelect from "../components/SearchableSelect.jsx";
import { useApp } from "../lib/AppContext.jsx";

const ESCALATION_CATEGORIES = [
  "Unfair treatment",
  "Communication issues",
  "Workload concerns",
  "Policy violation",
  "Harassment or bullying",
  "Performance evaluation dispute",
  "Schedule or attendance issue",
  "Other",
];

function smartRoute(aboutEmail, roster, supervisors, allProfiles) {
  const AMANDA = { label: "Amanda Souza (QA Manager)", email: "amanda.souza@tabby.ai" };

  if (!aboutEmail) return { label: "Select a person to determine routing", email: null };

  const ap = aboutEmail.toLowerCase();

  // Only exception: about Amanda → Imad
  if (ap.includes("amanda.souza")) return { label: "Imad Moussa (Head of QA)", email: "imad.moussa@tabby.ai" };

  // Look up person in profiles to get their role
  const profileMatch = allProfiles.find(p => p.email?.toLowerCase() === ap);

  // About a Supervisor or anyone above → route to Amanda
  if (profileMatch && (profileMatch.role === "qa_supervisor" || profileMatch.role === "admin" || profileMatch.role === "super_admin")) return AMANDA;

  // About a Team Lead → route to their supervisor (matched by operational_domain)
  if (profileMatch && profileMatch.role === "qa_lead") {
    const leadDomain = profileMatch.operational_domain || (profileMatch.email?.includes("tabby.sa") ? "tabby.sa" : "tabby.ai");
    const sv = supervisors.find(s => s.operational_domain === leadDomain);
    return sv
      ? { label: `${sv.email} (Supervisor)`, email: sv.email }
      : AMANDA;
  }

  // About a QA → route to their team lead (from roster manager_email)
  const rosterMatch = roster.find(r => r.email?.toLowerCase() === ap);
  if (rosterMatch && rosterMatch.manager_email) {
    return { label: `${rosterMatch.manager_email} (Team Lead)`, email: rosterMatch.manager_email.toLowerCase() };
  }

  // QA found in profiles but not in roster → fallback to Amanda
  if (profileMatch) return AMANDA;

  // Unknown person → Amanda as fallback
  return AMANDA;
}


function EscalationsPage() {
  const{token,profile,gf,globalToast}=useApp();
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState("my");
  const [roster, setRoster] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [viewEsc, setViewEsc] = useState(null);
  const [responseText, setResponseText] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const{ask:confirmAsk,el:confirmEl}=useConfirm();

  // Form state
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [ccReviewers, setCcReviewers] = useState([]);
  const [aboutPerson, setAboutPerson] = useState("");
  const [isAnonymous] = useState(true);

  const myEmail = profile?.email?.toLowerCase();
  const myRole = profile?.role || "qa";

  const nameFromEmail = (email) => {
    if (!email) return "—";
    return email.split("@")[0].split(".").map(p => {
      const c = p.replace(/[\d]+$/, "");
      return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
    }).filter(Boolean).join(" ");
  };

  const getRouting = () => smartRoute(aboutPerson, roster, supervisors, allProfiles);

  const load = useCallback(async () => {
    try {
      const [e, r, svProfs, profs] = await Promise.all([
        listEscalations({ token }),
        listRoster({ token }),
        listProfiles({ token, select: "email,display_name,role,operational_domain", filters: "role=eq.qa_supervisor&status=eq.active", cache: false }),
        listProfiles({ token, select: "email,display_name,role,domain", filters: "", cacheKey: "profiles_all" }),
      ]);
      setRoster(r);
      setSupervisors(svProfs);
      setAllProfiles(profs);

      // Filter: user sees their own submitted + ones routed to them
      const isAdmin = hasRole(myRole, "admin");
      const filtered = isAdmin ? e : e.filter(x =>
        x.submitted_by?.toLowerCase() === myEmail ||
        x.routed_to?.toLowerCase() === myEmail
      );
      setEscalations(filtered);
    } catch (e) { console.error("Escalations:", e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(()=>{const h=()=>{dataCache.invalidate();load();};window.addEventListener("data-changed",h);return()=>window.removeEventListener("data-changed",h);},[load]);

  const mySubmitted = escalations.filter(e => e.submitted_by?.toLowerCase() === myEmail);
  const routedToMe = escalations.filter(e => {
    return e.routed_to?.toLowerCase() === myEmail && e.submitted_by?.toLowerCase() !== myEmail;
  });

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 5 * 1024 * 1024; // 5MB per file
    const allowed = files.filter(f => f.size <= maxSize);
    if (allowed.length < files.length) globalToast("error", "Some files exceeded 5MB and were skipped");
    setAttachments(prev => [...prev, ...allowed].slice(0, 5)); // max 5 files
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const uploadAttachments = async (escId) => {
    const urls = [];
    for (const file of attachments) {
      const ext = file.name.split(".").pop();
      const path = `${escId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      try {
        const r = await fetch(`${SUPABASE_URL}/storage/v1/object/escalation-attachments/${path}`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
          body: file,
        });
        if (r.ok) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/escalation-attachments/${path}`;
          urls.push({ name: file.name, url: publicUrl, size: file.size, type: file.type });
        }
      } catch (e) { console.error("Upload error:", e); }
    }
    return urls;
  };

  const submitEscalation = async () => {
    if (!aboutPerson) { globalToast("error", "Select the person you're escalating about"); return; }
    if (!category) { globalToast("error", "Select a category"); return; }
    if (!description.trim()) { globalToast("error", "Description is required"); return; }

    const routing = getRouting();
    if (!routing.email) { globalToast("error", "Unable to determine routing — select a valid person"); return; }
    const routedTo = routing.email;

    try {
      setUploading(true);
      // Create escalation first
      const result = await sb.query("escalations", {
        token, method: "POST",
        body: {
          submitted_by: myEmail,
          submitted_role: myRole,
          is_anonymous: isAnonymous,
          about_person: aboutPerson.trim() || null,
          category,
          description: description.trim(),
          routed_to: routedTo,
          status: "open",
          attachments: [],
        },
        select: "id",
      });

      // Upload attachments if any
      if (attachments.length > 0 && result?.[0]?.id) {
        const urls = await uploadAttachments(result[0].id);
        if (urls.length > 0) {
          await sb.query("escalations", {
            token, method: "PATCH",
            body: { attachments: urls },
            filters: `id=eq.${result[0].id}`,
          });
        }
      }

      // Create copies for each CC reviewer so they see the escalation in their "routed to me" list
      if (Array.isArray(ccReviewers) && ccReviewers.length > 0) {
        for (const cc of ccReviewers) {
          if (!cc || cc.toLowerCase() === routedTo.toLowerCase()) continue;
          await sb.query("escalations", {
            token, method: "POST",
            body: {
              submitted_by: myEmail, submitted_role: myRole, is_anonymous: isAnonymous,
              about_person: aboutPerson.trim() || null,
              category, description: description.trim(),
              routed_to: cc, status: "open", attachments: [],
            },
          });
        }
      }
      const totalReviewers = 1 + (ccReviewers?.length || 0);
      globalToast("success", totalReviewers > 1 ? `Escalation sent to ${totalReviewers} reviewers` : `Escalation submitted — routed to ${nameFromEmail(routedTo)}`);
      logActivity(token, profile?.email, "escalation_created", "escalations", null, `Category: ${category}, Routed to: ${routing.email}${ccReviewers.length?", CC: "+ccReviewers.join(","):""}`);
      setShowForm(false);
      setCategory("");
      setDescription("");
      setAboutPerson("");
      setCcReviewers([]);
      setAttachments([]);
      // Optimistic: reload to get new escalation with ID
      load();
    } catch (e) { globalToast("error", safeError(e)); }
    setUploading(false);
  };

  const submitResponse = async (escId) => {
    if (!responseText.trim()) { globalToast("error", "Response is required"); return; }
    try {
      await sb.query("escalations", {
        token, method: "PATCH",
        body: { response: responseText.trim(), responded_by: myEmail, responded_at: new Date().toISOString(), status: "in_progress" },
        filters: `id=eq.${escId}`,
      });
      globalToast("success", "Response sent");
      setEscalations(prev => prev.map(e => e.id === escId ? { ...e, response: responseText.trim(), responded_by: myEmail, responded_at: new Date().toISOString(), status: "in_progress" } : e));
      setResponseText("");
      setViewEsc(null);
    } catch (e) { globalToast("error", safeError(e)); }
  };

  const resolveEscalation = async (escId) => {
    try {
      await sb.query("escalations", {
        token, method: "PATCH",
        body: { status: "resolved", resolution_note: resolutionNote.trim() || null, resolved_at: new Date().toISOString() },
        filters: `id=eq.${escId}`,
      });
      globalToast("success", "Escalation resolved");
      setEscalations(prev => prev.map(e => e.id === escId ? { ...e, status: "resolved", resolution_note: resolutionNote.trim() || null, resolved_at: new Date().toISOString() } : e));
      setResolutionNote("");
      setViewEsc(null);
    } catch (e) { globalToast("error", safeError(e)); }
  };

  const statusColor = (s) => {
    if (s === "open") return { bg: "var(--red-bg)", color: "var(--red)" };
    if (s === "in_progress") return { bg: "var(--amber-bg)", color: "var(--amber)" };
    if (s === "resolved") return { bg: "var(--green-bg)", color: "var(--green)" };
    return { bg: "var(--bg2)", color: "var(--tx3)" };
  };

  if (loading) return <div className="page"><SkeletonPage/></div>;

  const routing = getRouting();

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title">Escalations</div>
          <div className="page-subtitle">Raise concerns confidentially to leadership</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Icon d={icons.plus} size={16} />New escalation
        </button>
      </div>

      {/* New Escalation Form */}
      {showForm && <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--accent)" }}>
        <div className="card-header"><span className="card-title">Submit an Escalation</span></div>
        <div style={{ padding: "0 0 16px" }}>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">About (person you're escalating about) <span style={{ color: "var(--red)" }}>*</span></label>
            <SearchableSelect
              options={[
                ...roster.filter(r => r.email?.toLowerCase() !== myEmail).map(r => ({
                  value: r.email, label: `${r.email} — QA`
                })),
                ...allProfiles.filter(p =>
                  (p.role === "qa_lead" || p.role === "qa_supervisor" || p.role === "admin" || p.role === "super_admin")
                  && p.email?.toLowerCase() !== myEmail
                  && !p.email?.toLowerCase().includes("imad.moussa")
                  && !roster.find(rr => rr.email?.toLowerCase() === p.email?.toLowerCase())
                ).map(p => ({
                  value: p.email, label: `${p.email} — ${ROLE_LABELS[p.role] || p.role}`
                }))
              ].sort((a,b) => a.label.localeCompare(b.label))}
              value={aboutPerson}
              onChange={v => setAboutPerson(v)}
              placeholder="Search for a person..."
            />
          </div>

          {/* Live routing display */}
          <div style={{ padding: "10px 14px", background: routing.email ? "var(--bg)" : "var(--amber-bg)", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {routing.email
              ? <><span style={{color:"var(--tx3)"}}>Will be routed to: </span><strong style={{color:"var(--accent)"}}>{routing.label}</strong></>
              : <span style={{color:"var(--amber)"}}>{routing.label}</span>
            }
          </div>

          {/* Optional: CC additional reviewers */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label" style={{fontSize:12}}>Also notify <span style={{fontWeight:400,color:"var(--tx3)"}}>(optional — each gets a copy)</span></label>
            <SearchableSelect
              multi
              options={allProfiles.filter(p =>
                (p.role === "qa_lead" || p.role === "qa_supervisor" || p.role === "admin" || p.role === "super_admin")
                && p.email?.toLowerCase() !== myEmail
                && p.email?.toLowerCase() !== routing.email?.toLowerCase()
              ).map(p => ({ value: p.email, label: `${nameFromEmail(p.email)} (${ROLE_LABELS[p.role] || p.role})` }))}
              value={ccReviewers}
              onChange={v => setCcReviewers(Array.isArray(v) ? v : [])}
              placeholder="Add additional reviewers..."
            />
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Category <span style={{ color: "var(--red)" }}>*</span></label>
            <select className="select form-input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">— Select category —</option>
              {ESCALATION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Description <span style={{ color: "var(--red)" }}>*</span></label>
            <textarea className="form-input" rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue in detail..." style={{ resize: "vertical" }} />
          </div>

          <div style={{ padding: "8px 12px", background: "var(--green-bg)", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "var(--green)" }}>
            All escalations are submitted anonymously — your identity is hidden from the person you're escalating about.
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Attachments <span style={{fontWeight:400,color:"var(--tx3)"}}>(optional, max 5 files, 5MB each)</span></label>
            <label style={{display:"inline-flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:8,border:"1px dashed var(--border)",cursor:"pointer",fontSize:13,color:"var(--tx2)",transition:"border-color .2s"}}>
              <Icon d="M12 5v14M5 12h14" size={16}/>
              Add files
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx" onChange={handleFileSelect} style={{display:"none"}}/>
            </label>
            {attachments.length>0&&<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
              {attachments.map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",background:"var(--bg)",borderRadius:6,fontSize:12}}>
                <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                <span style={{color:"var(--tx3)",flexShrink:0}}>{(f.size/1024).toFixed(0)} KB</span>
                <button onClick={()=>removeAttachment(i)} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",padding:"2px",fontSize:14,lineHeight:1}}>×</button>
              </div>)}
            </div>}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={submitEscalation} disabled={!aboutPerson || !category || !description.trim() || uploading}>
              {uploading ? "Submitting..." : "Submit"}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowForm(false); setAttachments([]); }}>Cancel</button>
          </div>
        </div>
      </div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`tab-btn ${tab === "my" ? "active" : ""}`} onClick={() => setTab("my")}>
          My escalations ({mySubmitted.length})
        </button>
        {(hasRole(myRole, "qa_supervisor") || routedToMe.length > 0) && <button className={`tab-btn ${tab === "inbox" ? "active" : ""}`} onClick={() => setTab("inbox")}>
          Inbox ({routedToMe.filter(e => e.status !== "resolved" && e.status !== "dismissed").length})
        </button>}
        {hasRole(myRole, "admin") && <button className={`tab-btn ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
          All ({escalations.length})
        </button>}
      </div>

      {/* Escalation Cards */}
      {(()=>{
        const list = tab === "inbox" ? routedToMe : tab === "all" ? escalations : mySubmitted;
        if (list.length === 0) return <div className="card"><div className="placeholder" style={{ padding: 40 }}><p style={{ color: "var(--tx3)" }}>{tab === "my" ? "You haven't submitted any escalations." : "No escalations in your inbox."}</p></div></div>;

        return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.map(esc => {
            const sc = statusColor(esc.status);
            const isRoutedToMe = esc.routed_to?.toLowerCase() === myEmail || (hasRole(myRole, "qa_supervisor") && esc.routed_to?.includes("supervisor"));
            const submitterDisplay = esc.is_anonymous && isRoutedToMe && !hasRole(myRole, "admin") ? "Anonymous" : nameFromEmail(esc.submitted_by);

            return <div key={esc.id} className="card" style={{ cursor: "pointer", borderLeft: `4px solid ${sc.color}` }} onClick={() => { setViewEsc(esc); setResponseText(""); setResolutionNote(""); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, background: sc.bg, color: sc.color }}>
                      {esc.status.replace("_", " ")}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)" }}>{esc.category}</span>
                    {esc.is_anonymous && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--bg2)", color: "var(--tx3)" }}>Anonymous</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>
                    {esc.description}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--tx3)" }}>
                    From: {submitterDisplay} · About: {esc.about_person || "—"} · {new Date(esc.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                {esc.response && <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 500 }}>Has response</div>}
              </div>
            </div>;
          })}
        </div>;
      })()}

      {/* View/Respond Modal */}
      {viewEsc && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, overflowY: "auto" }} onClick={e => { if (e.target === e.currentTarget) setViewEsc(null); }}>
        <div className="card" style={{ width: "100%", maxWidth: 600, margin: 20, maxHeight: "80vh", overflow: "auto" }}>
          <div className="card-header">
            <span className="card-title">Escalation Details</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600, ...statusColor(viewEsc.status) }}>{viewEsc.status.replace("_", " ")}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13, marginBottom: 16 }}>
            <div><span style={{ color: "var(--tx3)" }}>From: </span><strong>{viewEsc.is_anonymous && !hasRole(myRole, "admin") && viewEsc.submitted_by?.toLowerCase() !== myEmail ? "Anonymous" : nameFromEmail(viewEsc.submitted_by)}</strong>{viewEsc.is_anonymous && <span style={{ fontSize: 10, color: "var(--tx3)", marginLeft: 4 }}>(anonymous)</span>}</div>
            <div><span style={{ color: "var(--tx3)" }}>About: </span><strong>{viewEsc.about_person || "—"}</strong></div>
            <div><span style={{ color: "var(--tx3)" }}>Category: </span><strong>{viewEsc.category}</strong></div>
            <div><span style={{ color: "var(--tx3)" }}>Date: </span>{new Date(viewEsc.created_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}</div>
            <div><span style={{ color: "var(--tx3)" }}>Routed to: </span>{nameFromEmail(viewEsc.routed_to)}</div>
            <div><span style={{ color: "var(--tx3)" }}>Role: </span>{ROLE_LABELS[viewEsc.submitted_role] || viewEsc.submitted_role}</div>
          </div>

          <div style={{ padding: "12px 16px", background: "var(--bg)", borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
            {viewEsc.description}
          </div>

          {/* Attachments */}
          {viewEsc.attachments && viewEsc.attachments.length > 0 && <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx2)", marginBottom: 6 }}>Attachments ({viewEsc.attachments.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {viewEsc.attachments.map((att, i) => <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg)", borderRadius: 6, fontSize: 12, color: "var(--blue)", textDecoration: "none", border: "1px solid var(--border)" }}>
                <Icon d={att.type?.startsWith("image") ? "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" : "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"} size={14}/>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                <span style={{ color: "var(--tx3)", flexShrink: 0 }}>{att.size ? (att.size / 1024).toFixed(0) + " KB" : ""}</span>
              </a>)}
            </div>
          </div>}

          {/* Response section */}
          {viewEsc.response && <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-text)", marginBottom: 4 }}>Response from {nameFromEmail(viewEsc.responded_by)}</div>
            <div style={{ padding: "12px 16px", background: "var(--green-bg)", borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
              {viewEsc.response}
            </div>
            {viewEsc.responded_at && <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>{new Date(viewEsc.responded_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}</div>}
          </div>}

          {/* Resolution */}
          {viewEsc.resolution_note && <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--green)", marginBottom: 4 }}>Resolution</div>
            <div style={{ padding: "12px 16px", background: "var(--green-bg)", borderRadius: 8, fontSize: 13 }}>{viewEsc.resolution_note}</div>
          </div>}

          {/* Actions for receiver */}
          {(viewEsc.routed_to?.toLowerCase() === myEmail || hasRole(myRole, "admin")) && viewEsc.status !== "resolved" && viewEsc.status !== "dismissed" && <>
            {!viewEsc.response && <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Your Response</label>
              <textarea className="form-input" rows={3} value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Respond to this escalation..." style={{ resize: "vertical" }} />
              <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => submitResponse(viewEsc.id)} disabled={!responseText.trim()}>Send Response</button>
            </div>}

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Resolve</label>
              <textarea className="form-input" rows={2} value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} placeholder="Resolution notes (optional)..." style={{ resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" style={{ background: "var(--green)" }} onClick={() => resolveEscalation(viewEsc.id)}>Mark Resolved</button>
                {hasRole(myRole, "admin") && <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => {
                  try {
                    await sb.query("escalations", { token, method: "PATCH", body: { status: "dismissed" }, filters: `id=eq.${viewEsc.id}` });
                    globalToast("success", "Dismissed");
                    setViewEsc(null);
                    load();
                  } catch (e) { globalToast("error", safeError(e)); }
                }}>Dismiss</button>}
              </div>
            </div>
          </>}

          {/* Super admin delete */}
          {hasRole(myRole, "super_admin") && <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 12, marginTop: 12 }}>
            <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={() => {
              confirmAsk("Delete escalation?","This will permanently delete this escalation.",async()=>{
                try {
                  await sb.query("escalations", { token, method: "DELETE", filters: `id=eq.${viewEsc.id}` });
                  globalToast("success", "Deleted");
                  setViewEsc(null);
                  load();
                } catch (e) { globalToast("error", safeError(e)); }
              },"Delete","var(--red)");
            }}><Icon d={icons.trash} size={14} /> Delete permanently</button>
          </div>}

          <div style={{ marginTop: 16 }}>
            <button className="btn btn-outline" onClick={() => setViewEsc(null)}>Close</button>
          </div>
        </div>
      </div>}

      {confirmEl}
    </div>
  );
}

export default EscalationsPage;
