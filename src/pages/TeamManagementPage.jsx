import React, { useState, useEffect, useCallback } from "react";
import { hasRole } from "../lib/constants.js";
import { sb, dataCache } from "../lib/supabase.js";
import { nameFromEmail, safeError, logActivity } from "../lib/utils.js";
import { listRoster } from "../api/roster.js";
import { useConfirm } from "../lib/hooks.jsx";
import { Icon, icons } from "../components/Icons.jsx";
import { SkeletonTable } from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { useApp } from "../lib/AppContext.jsx";
import { callEdgeFunction } from "../lib/edgeSync.js";

function TeamManagementPage(){
  // realProfile = the actual signed-in user even when impersonating.
  // Used as audit-log actor so View-As mode doesn't attribute team
  // create / edit / delete to the impersonated user.
  const { token, profile, realProfile, globalToast } = useApp();
  const actorEmail = realProfile?.email || profile?.email;
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "tabby.ai", lead_id: "", supervisor_id: "" });
  const [editId, setEditId] = useState(null);
  const [expandedLead, setExpandedLead] = useState(null);
  const [filterDomain, setFilterDomain] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const { ask: confirmAsk, el: confirmEl } = useConfirm();

  const load = useCallback(async () => {
    try {
      const [t, u, r] = await Promise.all([
        sb.query("teams", {
          select: "id,name,domain,lead_id,supervisor_id,profiles!fk_teams_lead(display_name,email),sup:profiles!fk_teams_supervisor(display_name,email)",
          token,
        }),
        sb.query("profiles", { select: "id,display_name,email,role,domain", token }),
        listRoster({ token, cache: false }),
      ]);
      setTeams(t || []);
      setUsers(u || []);
      setRoster(r || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => { dataCache.invalidate(); load(); };
    window.addEventListener("data-changed", h);
    return () => window.removeEventListener("data-changed", h);
  }, [load]);

  // Roster-sync log: surfaces the latest run + any unmatched warnings.
  useEffect(() => {
    sb.query("roster_sync_log", {
      token,
      select: "ran_at,triggered_by,status,csv_rows,roster_added,roster_updated,roster_stale,teams_added,teams_updated,unmatched,error",
      filters: "order=ran_at.desc&limit=1",
    }).then(rows => { if (Array.isArray(rows) && rows.length > 0) setLastSync(rows[0]); }).catch(() => {});
  }, [token]);

  const leads = users.filter(u => hasRole(u.role, "qa_lead"));
  const supervisors = users.filter(u => hasRole(u.role, "qa_supervisor"));
  const isSrQa = (r) => /^(sr\.?|senior)\s*qa$/i.test((r?.role || "").trim());
  const teamRoster = roster.filter(r => !isSrQa(r));

  const save = async () => {
    try {
      const b = { name: form.name, domain: form.domain, lead_id: form.lead_id || null, supervisor_id: form.supervisor_id || null };
      if (editId) {
        await sb.query("teams", { token, method: "PATCH", body: b, filters: `id=eq.${editId}` });
        logActivity(token, actorEmail, "team_updated", "teams", editId, `Name: ${form.name}`);
        globalToast("success", "Team updated");
      } else {
        await sb.query("teams", { token, method: "POST", body: b });
        logActivity(token, actorEmail, "team_created", "teams", null, `Name: ${form.name}, Domain: ${form.domain}`);
        globalToast("success", "Team created");
      }
      setShowForm(false); setEditId(null);
      setForm({ name: "", domain: "tabby.ai", lead_id: "", supervisor_id: "" });
      load();
    } catch (e) { globalToast("error", safeError(e)); }
  };
  const startEdit = (t) => {
    setForm({ name: t.name, domain: t.domain, lead_id: t.lead_id || "", supervisor_id: t.supervisor_id || "" });
    setEditId(t.id); setShowForm(true);
  };
  const del = (id) => {
    const t = teams.find(x => x.id === id);
    confirmAsk("Delete team?", `Delete "${t?.name || "this team"}"?`, async () => {
      try {
        await sb.query("teams", { token, method: "DELETE", filters: `id=eq.${id}` });
        logActivity(token, actorEmail, "team_deleted", "teams", id, `Name: ${t?.name || "?"}`);
        globalToast("success", "Deleted"); load();
      } catch (e) { globalToast("error", safeError(e)); }
    }, "Delete", "var(--red)");
  };

  const runSync = async () => {
    if (syncing) return;
    setSyncing(true);
    const r = await callEdgeFunction("roster-sync", { token });
    if (r.ok && r.data?.success) {
      const data = r.data;
      const parts = [];
      if (data.roster_added) parts.push(`+${data.roster_added} added`);
      if (data.roster_updated) parts.push(`${data.roster_updated} updated`);
      if (data.roster_removed) parts.push(`${data.roster_removed} removed`);
      if (data.teams_added) parts.push(`${data.teams_added} teams added`);
      if (data.teams_updated) parts.push(`${data.teams_updated} teams updated`);
      if (data.teams_removed) parts.push(`${data.teams_removed} teams removed`);
      const msg = parts.length > 0 ? `Synced — ${parts.join(", ")}` : "Synced — no changes";
      globalToast("success", msg);
      setLastSync({ ran_at: new Date().toISOString(), triggered_by: profile?.email, status: "ok", ...data });
      load();
    } else {
      globalToast("error", r.error || "Sync failed");
    }
    setSyncing(false);
  };

  // ===== Group teams rows by lead. Each lead becomes one card row;
  // their N (queue, domain) team rows collapse into a per-queue summary.
  const groupedLeads = (() => {
    const byLead = new Map();
    for (const t of teams) {
      if (!t.lead_id) continue;
      if (filterDomain && t.domain !== filterDomain) continue;
      if (!byLead.has(t.lead_id)) {
        byLead.set(t.lead_id, {
          leadId: t.lead_id,
          leadName: nameFromEmail(t.profiles?.email),
          leadEmail: (t.profiles?.email || "").toLowerCase(),
          supervisorName: t.sup?.email ? nameFromEmail(t.sup.email) : null,
          supervisorEmail: t.sup?.email || null,
          teamsByName: new Map(),
        });
      }
      const lead = byLead.get(t.lead_id);
      const group = lead.teamsByName.get(t.name) || { name: t.name, domains: [], dbRows: [], members: [] };
      group.dbRows.push(t);
      if (!group.domains.includes(t.domain)) group.domains.push(t.domain);
      // Members on this (lead, queue, domain) — only QAs (Sr QA filtered)
      const myEmail = lead.leadEmail;
      const localMembers = teamRoster.filter(r => {
        const mgr = (r.manager_email || "").toLowerCase();
        const isMine = mgr === myEmail || mgr.split("@")[0] === myEmail.split("@")[0];
        return isMine && r.queue === t.name && (r.email || "").toLowerCase().endsWith("@" + t.domain);
      });
      for (const m of localMembers) {
        if (!group.members.find(x => x.email === m.email)) group.members.push(m);
      }
      lead.teamsByName.set(t.name, group);
    }
    // Convert Map → array and sort
    return Array.from(byLead.values()).map(lead => {
      const teamsArr = Array.from(lead.teamsByName.values()).sort((a, b) => a.name.localeCompare(b.name));
      const totalMembers = teamsArr.reduce((s, g) => s + g.members.length, 0);
      return { ...lead, teams: teamsArr, totalMembers };
    }).sort((a, b) => a.leadName.localeCompare(b.leadName));
  })();

  return (<div className="page">
    {confirmEl}
    <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div className="page-title">Team management</div>
        <div className="page-subtitle">{groupedLeads.length} leads · {teams.length} team rows · {teamRoster.length} QAs{lastSync?.ran_at ? ` · last synced ${new Date(lastSync.ran_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-outline" disabled={syncing} onClick={runSync} title="Pull the latest QA Roster Distro from the Google Sheet and apply any changes to roster + teams">
          {syncing ? "Syncing…" : "🔄 Sync from Distro"}
        </button>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: "", domain: "tabby.ai", lead_id: "", supervisor_id: "" }); }}>
          <Icon d={icons.plus} size={16} />New team
        </button>
      </div>
    </div>

    {lastSync && (lastSync.unmatched || lastSync.error) && (
      <div className="card" style={{ padding: "10px 14px", marginBottom: 12, borderLeft: `3px solid ${lastSync.error ? "var(--red)" : "var(--amber)"}`, background: lastSync.error ? "var(--red-bg)" : "var(--amber-bg)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: lastSync.error ? "var(--red)" : "var(--amber)", marginBottom: 4 }}>
          {lastSync.error ? "Last sync error" : `Last sync had ${(lastSync.unmatched || []).length} unmatched row${(lastSync.unmatched || []).length === 1 ? "" : "s"}`}
        </div>
        <div style={{ fontSize: 11, color: "var(--tx2)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {lastSync.error || (lastSync.unmatched || []).join("\n")}
        </div>
      </div>
    )}

    {/* Domain filter */}
    <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
      <select className="select" value={filterDomain} onChange={e => setFilterDomain(e.target.value)}>
        <option value="">All domains</option>
        <option value="tabby.ai">tabby.ai</option>
        <option value="tabby.sa">tabby.sa</option>
      </select>
      {filterDomain && <span style={{ fontSize: 12, color: "var(--tx3)" }}>Showing leads with at least one team in {filterDomain}</span>}
    </div>

    {showForm && <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header"><span className="card-title">{editId ? "Edit team" : "Create team"}</span></div>
      <div className="form-grid">
        <div className="form-group"><label className="form-label">Team name</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Payments QA" /></div>
        <div className="form-group"><label className="form-label">Domain</label><select className="select form-input" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })}><option value="tabby.ai">tabby.ai</option><option value="tabby.sa">tabby.sa</option></select></div>
        <div className="form-group"><label className="form-label">Lead</label><select className="select form-input" value={form.lead_id} onChange={e => setForm({ ...form, lead_id: e.target.value })}><option value="">— Select —</option>{leads.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Supervisor</label><select className="select form-input" value={form.supervisor_id} onChange={e => setForm({ ...form, supervisor_id: e.target.value })}><option value="">— Select —</option>{supervisors.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}</select></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={save}><Icon d={icons.check} size={16} />{editId ? "Update" : "Create"}</button>
        <button className="btn btn-outline" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
      </div>
    </div>}

    <div className="card">
      {loading ? <SkeletonTable /> : groupedLeads.length === 0 ? (
        <EmptyState illus="empty" title="No teams yet" description="Hit 🔄 Sync from Distro above to pull the team structure from the QA Roster sheet."/>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr>
            <th style={{ width: 24 }}></th>
            <th>Lead</th>
            <th>Supervisor</th>
            <th style={{ textAlign: "center" }}>Members</th>
            <th>Teams</th>
            <th style={{ width: 32 }}></th>
          </tr></thead>
          <tbody>
            {groupedLeads.map(lead => {
              const isExp = expandedLead === lead.leadId;
              const initials = (lead.leadName || "").split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
              return (<React.Fragment key={lead.leadId}>
                <tr onClick={() => setExpandedLead(isExp ? null : lead.leadId)} style={{ cursor: "pointer" }}>
                  <td style={{ textAlign: "center", padding: "8px 4px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExp ? "rotate(180deg)" : "rotate(0)", transition: "transform var(--d2)", color: "var(--tx3)" }}><path d="M6 9l6 6 6-6" /></svg>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials || "?"}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>{lead.leadName}</div>
                        <div style={{ fontSize: 10, color: "var(--tx3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.leadEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--tx2)" }}>{lead.supervisorName || <span style={{ color: "var(--tx3)" }}>—</span>}</td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 12, background: "var(--accent-light)", color: "var(--accent-text)", fontWeight: 700 }}>{lead.totalMembers}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {lead.teams.map(tg => (
                        <span key={tg.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--bd2)", fontSize: 11, fontWeight: 500 }}>
                          {tg.name}
                          <span style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600 }}>{tg.members.length}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {/* Edit / delete buttons live in the expanded view per-team to avoid ambiguity */}
                  </td>
                </tr>
                {isExp && (
                  <tr><td colSpan={6} style={{ padding: 0, background: "var(--bg)" }}>
                    <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                      {lead.teams.map(tg => (
                        <div key={tg.name}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx)", textTransform: "uppercase", letterSpacing: ".5px" }}>{tg.name}</div>
                            <div style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 600 }}>{tg.members.length} member{tg.members.length === 1 ? "" : "s"}</div>
                            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                              {/* Dedupe by domain. The DB now has a UNIQUE
                                  (lead_id, name, domain) constraint, but the
                                  UI is still defensive: if a duplicate ever
                                  sneaks in we render one button pair per
                                  domain, not one per dbRow. Domains with
                                  >1 row keep the earliest id (it's the one
                                  with FK references in user_teams /
                                  profiles in the only known case). */}
                              {Array.from(
                                tg.dbRows.reduce((m, t) => {
                                  if (!m.has(t.domain)) m.set(t.domain, t);
                                  return m;
                                }, new Map()).values()
                              ).map(t => (
                                <React.Fragment key={t.id}>
                                  <button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); startEdit(t); }} title={`Edit ${t.name} / ${t.domain}`}><Icon d={icons.edit} size={12} /></button>
                                  <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={(e) => { e.stopPropagation(); del(t.id); }} title={`Delete ${t.name} / ${t.domain}`}><Icon d={icons.trash} size={12} /></button>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                          {tg.members.length === 0 ? (
                            <div style={{ fontSize: 11, color: "var(--tx3)", fontStyle: "italic", padding: "4px 0" }}>No QAs yet on this team.</div>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
                              {tg.members.sort((a, b) => nameFromEmail(a.email).localeCompare(nameFromEmail(b.email))).map(m => {
                                const dom = (m.email || "").endsWith("@tabby.sa") ? "sa" : "ai";
                                return (
                                  <div key={m.email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", background: "var(--bg3)", borderRadius: 6, fontSize: 12 }}>
                                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, flexShrink: 0 }}>
                                      {nameFromEmail(m.email).split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)}
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameFromEmail(m.email)}</div>
                                      <div style={{ fontSize: 10, color: "var(--tx3)" }}>{m.email}</div>
                                    </div>
                                    <span className={`domain-badge domain-${dom}`} style={{ fontSize: 9 }}>{dom}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </td></tr>
                )}
              </React.Fragment>);
            })}
          </tbody>
        </table></div>
      )}
    </div>
  </div>);
}

export default TeamManagementPage;
