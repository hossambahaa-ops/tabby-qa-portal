import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CSV_URL = Deno.env.get("PRODUCTIVITY_HISTORY_CSV_URL") || "https://docs.google.com/spreadsheets/d/e/2PACX-1vQvmHGP-sQqFN5KQrLHoyIYYkTkMEsCwNlJ6t6XpONoR2a7mGgOrswx5e4L_ZDcYz2_4YZll4UanFW4/pub?gid=985341354&single=true&output=csv";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const PROJECT_REF = (SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1]) || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

function decodeJwtPayload(j: string) { try { const p = j.split("."); if (p.length !== 3) return null; const b = p[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4))); } catch { return null; } }

async function authorize(req: Request, supabase: any): Promise<{ ok: true; userEmail?: string } | { ok: false; error: string; status: number }> {
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!auth) return { ok: false, error: "Unauthorized", status: 401 };
  if (SUPABASE_SERVICE_ROLE_KEY && auth === SUPABASE_SERVICE_ROLE_KEY) return { ok: true, userEmail: "cron" };
  const payload = decodeJwtPayload(auth) as any;
  if (payload?.role === "service_role" && (!PROJECT_REF || payload.ref === PROJECT_REF)) return { ok: true, userEmail: "cron" };
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${auth}` } });
  if (!u.ok) return { ok: false, error: "Invalid token", status: 401 };
  const user = await u.json();
  if (!user?.id) return { ok: false, error: "Could not identify user", status: 401 };
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).single();
  if (!profile) return { ok: false, error: "Profile not found", status: 403 };
  if (!["qa", "senior_qa", "qa_lead", "qa_supervisor", "admin", "super_admin", "manager", "hod"].includes(profile.role)) return { ok: false, error: "Forbidden", status: 403 };
  return { ok: true, userEmail: profile.email };
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
      else if (c === "\r") { /* skip */ }
      else f += c;
    }
  }
  if (f.length > 0 || row.length > 0) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(v => v && v.trim()));
}

function normEmail(e: string | null | undefined): string {
  // Lowercase/trim, and repair common domain typos (a missing dot, e.g.
  // "name@tabbyai" → "name@tabby.ai") so a mistyped source email can't fork a
  // QA into a phantom duplicate row.
  return (e || "").trim().toLowerCase().replace(/@tabbyai$/, "@tabby.ai").replace(/@tabbysa$/, "@tabby.sa");
}

// Daily occupancy is recomputed from the component counts rather than trusting
// the source's Occupancy column — a split/typo row (an eval that landed on a
// mistyped email) used to clobber the real value with a nonsense % (the Jun-2026
// "4%" case). Mirrors the in-app monthly recompute (SBS/Non-SBS evals at 20/15
// min, coaching 30 min, over a 480-min shift) so daily and monthly agree.
const SBS_DUR = 20, NSBS_DUR = 15, COACH_DUR = 30, SHIFT_MIN = 480;
function computeOccupancy(sbs: number, non: number, coach: number, side: number): number {
  const productive = sbs * SBS_DUR + non * NSBS_DUR + coach * COACH_DUR + side;
  return Math.round((productive / SHIFT_MIN) * 10000) / 100;
}

function toInt(v: string | undefined): number {
  if (v == null) return 0;
  const t = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (!t || t === "--" || t === "-") return 0;
  const n = parseFloat(t);
  return isNaN(n) ? 0 : Math.round(n);
}

function toPctNumeric(v: string | undefined): number | null {
  if (v == null) return null;
  const t = String(v).trim().replace(/\s/g, "").replace(",", ".").replace("%", "");
  if (!t || t === "--" || t === "-") return null;
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear(); const mo = String(d.getMonth() + 1).padStart(2, "0"); const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${mo}-${dd}`;
    }
  } catch { /* noop */ }
  return null;
}

function looksLikeLoading(text: string): boolean {
  const head = text.slice(0, 200).toLowerCase();
  return head.startsWith("loading...") || head.includes(",loading...,");
}

async function fetchCsvOnce(url: string): Promise<{ ok: boolean; text: string; status?: number }> {
  const bust = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
  const r = await fetch(bust, { headers: { "User-Agent": "Mozilla/5.0 (Tabby-QA-Portal Productivity-History-Sync)", "Accept": "text/csv,*/*", "Cache-Control": "no-cache" } });
  if (!r.ok) return { ok: false, status: r.status, text: "" };
  return { ok: true, status: r.status, text: await r.text() };
}

async function fetchCsvWithRetry(url: string): Promise<{ ok: true; text: string; attempts: number } | { ok: false; error: string; details: any }> {
  let lastPreview = ""; let lastStatus = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetchCsvOnce(url);
    lastPreview = r.text.slice(0, 200); lastStatus = r.status || 0;
    if (!r.ok) { await new Promise(res => setTimeout(res, 1500)); continue; }
    if (looksLikeLoading(r.text) || r.text.length < 50) { await new Promise(res => setTimeout(res, 1500 * attempt)); continue; }
    return { ok: true, text: r.text, attempts: attempt };
  }
  return { ok: false, error: "CSV not ready after retries", details: { lastStatus, lastPreview } };
}

async function runSync(supabase: any, triggeredBy: string): Promise<Record<string, unknown>> {
  const fetchRes = await fetchCsvWithRetry(CSV_URL);
  if (!fetchRes.ok) return { error: fetchRes.error, details: fetchRes.details };
  const rows = parseCSV(fetchRes.text);
  if (rows.length < 2) return { error: "CSV is empty or malformed" };

  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (label: string) => header.findIndex(h => h === label.toLowerCase());

  const iDate    = idx("date");
  const iEmail   = idx("qa_email");
  const iSbs     = idx("sbs");
  const iNonSbs  = idx("non-sbs") >= 0 ? idx("non-sbs") : idx("non_sbs");
  const iCoach   = idx("coaching_sessions");
  const iSt      = idx("side_task_minutes");
  const iOcc     = idx("occupancy");
  const iPending = idx("pending_side_minutes");
  if (iDate < 0 || iEmail < 0 || iSbs < 0 || iNonSbs < 0) {
    return { error: "CSV missing required columns", details: { header } };
  }

  const { data: rosterRows } = await supabase.from("qa_roster").select("email");
  // Bridge domain discrepancies: index the roster by local-part so a source
  // row keyed name@tabby.ai still matches a roster entry of name@tabby.sa
  // (or vice-versa). The record is then stored under the roster's canonical
  // email, so the import is consistent and orphan-cleanup doesn't wipe it.
  const rosterByLocal = new Map<string, string>();
  for (const r of (rosterRows || [])) { const e = (r.email || "").toLowerCase(); if (e.includes("@")) rosterByLocal.set(e.split("@")[0], e); }
  // The orphan-cleanup below NEVER
  // deletes a row for a roster QA (matched below by local-part) — active QAs are managed by the
  // upsert, so a row missing from one run (a partial/cached CSV read or a
  // racing concurrent run) must not wipe their data. Only genuinely
  // departed / non-roster emails are eligible for cleanup.

  // Stamp every record with the same sync timestamp so the freshness signal
  // refreshes on UPSERT (UPDATE path) as well as INSERT.
  const nowIso = new Date().toISOString();

  type Acc = {
    date: string; qa_email: string;
    sbs: number; non_sbs: number; coaching_sessions: number;
    side_task_minutes: number; pending_side_minutes: number;
    occupancy_pct: number | null;
    synced_at: string;
  };
  const acc = new Map<string, Acc>();
  const datesTouched = new Set<string>();
  let dropped = 0;
  let nonRoster = 0;
  let rejected = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const date = toIsoDate(row[iDate]);
    const rawEmail = normEmail(row[iEmail]);
    if (!date || !rawEmail || !rawEmail.includes("@")) { dropped++; continue; }
    const email = rosterByLocal.get(rawEmail.split("@")[0]);
    if (!email) { nonRoster++; continue; }
    datesTouched.add(date);
    const key = `${date}\u0000${email}`;
    const sbs     = toInt(row[iSbs]);
    const non     = toInt(row[iNonSbs]);
    const coach   = iCoach   >= 0 ? toInt(row[iCoach])   : 0;
    const st      = iSt      >= 0 ? toInt(row[iSt])      : 0;
    const pending = iPending >= 0 ? toInt(row[iPending]) : 0;
    const occ     = iOcc     >= 0 ? toPctNumeric(row[iOcc]) : null;
    // Sanity guard: drop physically-impossible daily values so one bad
    // source cell can't poison a QA's profile/occupancy (cf. the Jun-2026
    // feed: 700+ non-SBS, 28h side-tasks, 1200% occupancy).
    if (sbs > 100 || non > 100 || coach > 60 || st > 720 || (occ != null && occ > 250)) {
      rejected++;
      continue;
    }
    const cur = acc.get(key);
    if (cur) {
      cur.sbs += sbs; cur.non_sbs += non; cur.coaching_sessions += coach;
      cur.side_task_minutes += st; cur.pending_side_minutes += pending;
      if (occ != null) cur.occupancy_pct = occ;
    } else {
      acc.set(key, {
        date, qa_email: email,
        sbs, non_sbs: non, coaching_sessions: coach,
        side_task_minutes: st, pending_side_minutes: pending,
        occupancy_pct: occ,
        synced_at: nowIso,
      });
    }
  }

  const records = [...acc.values()];
  // Authoritative occupancy: recompute from the merged components so a
  // duplicate/typo split (or a bad source Occupancy cell) can't show a nonsense
  // daily value. This replaces whatever the source column held.
  for (const rec of records) {
    rec.occupancy_pct = computeOccupancy(rec.sbs, rec.non_sbs, rec.coaching_sessions, rec.side_task_minutes);
  }
  if (records.length === 0) return { error: "No valid rows to upsert" };

  const BATCH = 200;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const { error } = await supabase.from("productivity_history").upsert(chunk, { onConflict: "date,qa_email" });
    if (error) return { error: `Upsert failed: ${error.message}`, sample: chunk[0] };
  }

  const cleanupResults: Record<string, unknown> = {};
  for (const d of datesTouched) {
    const wantEmails = new Set(records.filter(r => r.date === d).map(r => r.qa_email));
    const orphanEmails: string[] = [];
    let from = 0;
    const PAGE = 1000;
    let fetchOk = true;
    while (true) {
      const { data, error } = await supabase.from("productivity_history").select("qa_email").eq("date", d).range(from, from + PAGE - 1);
      if (error) { cleanupResults[d] = { error: `fetch failed: ${error.message}` }; fetchOk = false; break; }
      if (!data || data.length === 0) break;
      // Only a NON-roster email is a true orphan. A roster QA missing from
      // this run's want-set (partial CSV / racing run) must be left alone.
      for (const row of data) if (!wantEmails.has(row.qa_email) && !rosterByLocal.has((row.qa_email || "").toLowerCase().split("@")[0])) orphanEmails.push(row.qa_email);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (!fetchOk) continue;
    let deleted = 0;
    let deleteErr: string | null = null;
    for (let i = 0; i < orphanEmails.length; i += BATCH) {
      const chunk = orphanEmails.slice(i, i + BATCH);
      const { error } = await supabase.from("productivity_history").delete().eq("date", d).in("qa_email", chunk);
      if (error) { deleteErr = error.message; break; }
      deleted += chunk.length;
    }
    cleanupResults[d] = deleteErr ? { error: `delete failed: ${deleteErr}`, deleted_so_far: deleted } : { orphans_deleted: deleted };
  }

  return {
    success: true,
    triggered_by: triggeredBy,
    csv_rows: rows.length - 1,
    rows_upserted: records.length,
    rows_dropped: dropped,
    rows_rejected: rejected,
    rows_non_roster: nonRoster,
    fetch_attempts: fetchRes.attempts,
    dates_touched: [...datesTouched].sort(),
    orphans_cleaned: cleanupResults,
    synced_at: nowIso,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = await authorize(req, supabase);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
    const result = await runSync(supabase, auth.userEmail || "unknown");
    if ((result as any).error) return jsonResponse(result, 500);
    return jsonResponse(result);
  } catch (err) {
    console.error("productivity-history-sync error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
