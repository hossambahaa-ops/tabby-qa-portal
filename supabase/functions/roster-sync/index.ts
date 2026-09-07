import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Distro source. Ops mirrors the restricted "QS Distribution" sheet into a
// public tab via IMPORTRANGE, then publishes that tab as CSV.
const DISTRO_CSV_URL = Deno.env.get("DISTRO_CSV_URL") || "https://docs.google.com/spreadsheets/d/e/2PACX-1vQvmHGP-sQqFN5KQrLHoyIYYkTkMEsCwNlJ6t6XpONoR2a7mGgOrswx5e4L_ZDcYz2_4YZll4UanFW4/pub?gid=2024284845&single=true&output=csv";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const PROJECT_REF = (SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1]) || "";

// Optional hard exclusion: emails listed here are never mirrored into qa_roster
// even if Ops lists them as QA in the Distribution sheet. Kept as an
// env-overridable capability but EMPTY by default.
//
// NOTE: hossam.bahaa@tabby.sa was previously excluded here to keep the Pulse
// super-admin out of attendance entirely. Per his later request he now needs to
// appear on the attendance TABLE, so he's back on the roster. He stays out of
// the attendance EMAIL via the digest's own profiles.role IN (qa,senior_qa)
// filter + NO_PLAN_EXCLUDE (his profiles.role is super_admin) — NOT via this set.
// Leavers are blocked in the DATABASE, not here — see the offboarded_emails
// table and the zz_block_offboarded_roster trigger on qa_roster. A guard at
// this layer only covers this one function; the trigger also stops a manual
// insert or any future writer re-creating a leaver's row.
const ROSTER_EXCLUDE = new Set(
  (Deno.env.get("ROSTER_EXCLUDE_EMAILS") || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchDistroCsv(url: string, maxAttempts = 8): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let lastReason = "unknown";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const bust = `${url}${url.includes("?") ? "&" : "?"}_cb=${Date.now()}_${attempt}`;
      const resp = await fetch(bust, { headers: { "Cache-Control": "no-cache" } });
      if (!resp.ok) { lastReason = `status ${resp.status}`; await sleep(1800); continue; }
      const text = await resp.text();
      const trimmed = text.trim();
      if (!trimmed || /^loading\.{0,3}$/i.test(trimmed)) { lastReason = "IMPORTRANGE still loading"; await sleep(2200); continue; }
      const firstLine = (trimmed.split(/\r?\n/)[0] || "").toLowerCase();
      if (firstLine.includes("<!doctype") || firstLine.includes("<html")) { lastReason = "got HTML (sheet not published / restricted)"; await sleep(1800); continue; }
      if (!firstLine.includes("name") || !firstLine.includes("lead") || !firstLine.includes("role")) { lastReason = "header row not ready"; await sleep(2200); continue; }
      return { ok: true, text };
    } catch (e) {
      lastReason = (e as Error).message || String(e);
      await sleep(1800);
    }
  }
  return { ok: false, error: `Distro CSV not ready after ${maxAttempts} attempts (${lastReason}).` };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}

async function authorize(req: Request, supabase: any): Promise<{ ok: true; userEmail?: string } | { ok: false; error: string; status: number }> {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return { ok: false, error: "Unauthorized", status: 401 };
  if (SUPABASE_SERVICE_ROLE_KEY && jwt === SUPABASE_SERVICE_ROLE_KEY) return { ok: true, userEmail: "cron" };
  const payload = decodeJwtPayload(jwt);
  if (payload && payload.role === "service_role" && (!PROJECT_REF || payload.ref === PROJECT_REF)) return { ok: true, userEmail: "cron" };
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } });
  if (!userResp.ok) return { ok: false, error: "Invalid token", status: 401 };
  const user = await userResp.json();
  if (!user?.id) return { ok: false, error: "Could not identify user", status: 401 };
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile) return { ok: false, error: "Profile not found", status: 403 };
  if (!["admin", "super_admin", "qa_supervisor", "manager", "hod"].includes(profile.role)) return { ok: false, error: "Forbidden", status: 403 };
  return { ok: true, userEmail: profile.email };
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuote = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuote = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v && v.trim()));
}

function normEmail(e: string | null | undefined): string { return (e || "").trim().toLowerCase(); }
function isValidEmail(e: string): boolean { return !!e && e.includes("@") && !e.includes(" "); }
function domainFromEmail(email: string): string { return email.endsWith("@tabby.sa") ? "tabby.sa" : "tabby.ai"; }
function isQARole(role: string): boolean {
  // QA and Senior QA both belong on the roster/calendar — they do the same
  // attendance + scoring. Ops writes Senior QA as "SrQA", "Sr QA",
  // "Senior QA", etc., so normalise away spaces/punctuation before matching.
  const r = (role || "").trim().toLowerCase().replace(/[\s._-]/g, "");
  return r === "qa" || r === "srqa" || r === "seniorqa";
}
function isQtlRole(role: string): boolean {
  const r = (role || "").toLowerCase();
  return r.includes("qtl") || r === "qa lead" || r === "lead";
}

async function runSync(supabase: any, triggeredBy: string): Promise<Record<string, unknown>> {
  const fetched = await fetchDistroCsv(DISTRO_CSV_URL);
  if (!fetched.ok) return { error: fetched.error };
  const csvText = fetched.text;
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { error: "CSV is empty or malformed" };

  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (label: string) => header.findIndex(h => h === label.toLowerCase());
  const iEmail = idx("name");
  const iLead = idx("lead");
  const iLob = idx("lob");
  const iCountry = idx("country");
  const iRole = idx("role");
  if (iEmail < 0 || iLead < 0 || iRole < 0) return { error: "CSV header missing required columns" };

  type CsvRow = { email: string; lead: string; lob: string; country: string; role: string };
  const csvByEmail = new Map<string, CsvRow>();
  let skippedExtensya = 0;
  for (const r of rows.slice(1)) {
    const email = normEmail(r[iEmail]);
    if (!isValidEmail(email)) continue;
    const lead = normEmail(r[iLead]);
    if (lead && !isValidEmail(lead)) { skippedExtensya++; continue; }
    csvByEmail.set(email, { email, lead, lob: (r[iLob] || "").trim(), country: (r[iCountry] || "").trim(), role: (r[iRole] || "").trim() });
  }

  // ===== qa_roster: rows where the CSV role is QA or Senior QA.
  // ROSTER_EXCLUDE emails are dropped here so they never enter qaEmails —
  // which also means the removal pass below will delete any stale row for them.
  const qaRows = [...csvByEmail.values()].filter(r => isQARole(r.role) && !ROSTER_EXCLUDE.has(r.email));
  const qaEmails = new Set(qaRows.map(r => r.email));

  const { data: existingRoster } = await supabase.from("qa_roster").select("email, manager_email, queue, country, role");
  const rosterByEmail = new Map<string, any>();
  for (const r of (existingRoster || [])) {
    const em = normEmail(r.email);
    if (em) rosterByEmail.set(em, r);
  }

  const rosterUpserts: any[] = [];
  let rosterAdded = 0, rosterUpdated = 0;
  for (const row of qaRows) {
    const cur = rosterByEmail.get(row.email);
    const next = { email: row.email, manager_email: row.lead || null, queue: row.lob || null, country: row.country || null, role: "QA", synced_at: new Date().toISOString() };
    if (!cur) { rosterAdded++; rosterUpserts.push(next); continue; }
    const same = (cur.manager_email || "") === (next.manager_email || "") && (cur.queue || "") === (next.queue || "") && (cur.country || "") === (next.country || "") && (cur.role || "") === (next.role || "");
    if (!same) { rosterUpdated++; rosterUpserts.push(next); }
  }
  if (rosterUpserts.length > 0) {
    const { error: upErr } = await supabase.from("qa_roster").upsert(rosterUpserts, { onConflict: "email" });
    if (upErr) return { error: `Roster upsert failed: ${upErr.message}` };
  }

  const toRemove: string[] = [];
  for (const em of rosterByEmail.keys()) {
    if (!qaEmails.has(em)) toRemove.push(em);
  }
  let rosterRemoved = 0;
  if (toRemove.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < toRemove.length; i += BATCH) {
      const slice = toRemove.slice(i, i + BATCH);
      const { error: delErr } = await supabase.from("qa_roster").delete().in("email", slice);
      if (!delErr) rosterRemoved += slice.length;
    }
  }

  // ===== Teams — data-driven from the actual QA distribution: one
  // (lead, queue, domain) team per queue each lead actually has QAs in.
  const qtlRows = [...csvByEmail.values()].filter(r => isQtlRole(r.role));

  const qaCountsByLeadQueue = new Map<string, Map<string, { ai: number; sa: number }>>();
  for (const row of qaRows) {
    if (!row.lead) continue;
    const queue = (row.lob || "").trim();
    if (!queue) continue;
    const dom = domainFromEmail(row.email) === "tabby.sa" ? "sa" : "ai";
    const queueMap = qaCountsByLeadQueue.get(row.lead) || new Map();
    const entry = queueMap.get(queue) || { ai: 0, sa: 0 };
    entry[dom]++;
    queueMap.set(queue, entry);
    qaCountsByLeadQueue.set(row.lead, queueMap);
  }

  const allEmails = new Set<string>();
  for (const r of qtlRows) {
    allEmails.add(r.email);
    if (r.lead) allEmails.add(r.lead);
  }
  const { data: profiles } = await supabase.from("profiles").select("id, email").in("email", [...allEmails]);
  const profileIdByEmail = new Map<string, string>();
  for (const p of (profiles || [])) {
    const em = normEmail(p.email);
    if (em && p.id) profileIdByEmail.set(em, p.id);
  }
  const qtlProfileIds = new Set(qtlRows.map(r => profileIdByEmail.get(r.email)).filter(Boolean) as string[]);

  type Want = { lead_id: string; name: string; domain: string; supervisor_id: string | null };
  const wanted: Want[] = [];
  const unmatched: string[] = [];
  for (const qtl of qtlRows) {
    const leadId = profileIdByEmail.get(qtl.email);
    if (!leadId) { unmatched.push(`QTL profile missing: ${qtl.email}`); continue; }
    const supId = qtl.lead ? profileIdByEmail.get(qtl.lead) || null : null;
    if (qtl.lead && !supId) unmatched.push(`Supervisor profile missing: ${qtl.lead} (lead ${qtl.email})`);

    const queueMap = qaCountsByLeadQueue.get(qtl.email);
    if (queueMap && queueMap.size > 0) {
      for (const [queue, counts] of queueMap.entries()) {
        if (counts.ai > 0) wanted.push({ lead_id: leadId, name: queue, domain: "tabby.ai", supervisor_id: supId });
        if (counts.sa > 0) wanted.push({ lead_id: leadId, name: queue, domain: "tabby.sa", supervisor_id: supId });
      }
    } else {
      const queues = (qtl.lob || "").split(",").map(s => s.trim()).filter(Boolean);
      if (queues.length === 0) queues.push("Team");
      const dom = domainFromEmail(qtl.email);
      for (const queue of queues) wanted.push({ lead_id: leadId, name: queue, domain: dom, supervisor_id: supId });
    }
  }

  const wantedKey = (w: { lead_id: string; name: string; domain: string }) => `${w.lead_id}:::${w.name}:::${w.domain}`;
  const wantedMap = new Map(wanted.map(w => [wantedKey(w), w]));

  const { data: existingTeams } = await supabase.from("teams").select("id, name, domain, lead_id, supervisor_id");
  const existingMap = new Map<string, any>();
  for (const t of (existingTeams || [])) {
    if (!t.lead_id) continue;
    existingMap.set(`${t.lead_id}:::${t.name}:::${t.domain}`, t);
  }

  let teamsAdded = 0, teamsUpdated = 0, teamsRemoved = 0;

  for (const w of wantedMap.values()) {
    const exists = existingMap.get(wantedKey(w));
    if (exists) {
      if (exists.supervisor_id !== w.supervisor_id) {
        await supabase.from("teams").update({ supervisor_id: w.supervisor_id }).eq("id", exists.id);
        teamsUpdated++;
      }
    } else {
      const adoptable = (existingTeams || []).find(t => !t.lead_id && t.name === w.name && t.domain === w.domain);
      if (adoptable) {
        await supabase.from("teams").update({ lead_id: w.lead_id, supervisor_id: w.supervisor_id }).eq("id", adoptable.id);
        adoptable.lead_id = w.lead_id;
        adoptable.supervisor_id = w.supervisor_id;
        teamsUpdated++;
      } else {
        await supabase.from("teams").insert({ name: w.name, domain: w.domain, lead_id: w.lead_id, supervisor_id: w.supervisor_id });
        teamsAdded++;
      }
    }
  }

  for (const t of (existingTeams || [])) {
    if (!t.lead_id) {
      await supabase.from("teams").delete().eq("id", t.id);
      teamsRemoved++;
      continue;
    }
    if (!qtlProfileIds.has(t.lead_id)) {
      await supabase.from("teams").delete().eq("id", t.id);
      teamsRemoved++;
      continue;
    }
    if (!wantedMap.has(`${t.lead_id}:::${t.name}:::${t.domain}`)) {
      await supabase.from("teams").delete().eq("id", t.id);
      teamsRemoved++;
    }
  }

  const summary = {
    csv_rows: csvByEmail.size, skipped_extensya: skippedExtensya,
    roster_added: rosterAdded, roster_updated: rosterUpdated, roster_removed: rosterRemoved, roster_total: qaEmails.size,
    teams_added: teamsAdded, teams_updated: teamsUpdated, teams_removed: teamsRemoved,
    unmatched,
  };

  await supabase.from("roster_sync_log").insert({
    triggered_by: triggeredBy, status: "ok",
    csv_rows: summary.csv_rows, roster_added: summary.roster_added, roster_updated: summary.roster_updated,
    roster_stale: 0,
    teams_added: summary.teams_added, teams_updated: summary.teams_updated,
    unmatched: unmatched.length > 0 ? unmatched : null,
  });

  return { success: true, ...summary };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = await authorize(req, supabase);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
    const result = await runSync(supabase, auth.userEmail || "unknown");
    if ((result as any).error) {
      await supabase.from("roster_sync_log").insert({ triggered_by: auth.userEmail || "unknown", status: "error", error: (result as any).error }).catch(() => {});
      return jsonResponse(result, 500);
    }
    return jsonResponse(result);
  } catch (err) {
    console.error("roster-sync error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
