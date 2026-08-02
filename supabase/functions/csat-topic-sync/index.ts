import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CSV_URL = Deno.env.get("CSAT_TOPIC_CSV_URL") || "https://docs.google.com/spreadsheets/d/e/2PACX-1vQXRnIghymNLeQ2FUHP7ObNQGgHOtUpZvJ3qW_p2O3QaZD3vvJjPQxxMEbecUCFAL-7q1dmtBdiYstf/pub?gid=442745427&single=true&output=csv";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const PROJECT_REF = (SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1]) || "";

// Key separator for in-memory maps. Emails / months / topics never contain it. Written as an escape,
// not a raw byte, so the source stays plain text to grep/diff.
const SEP = "\u0000";

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

function normEmail(e: string | null | undefined): string { return (e || "").trim().toLowerCase(); }

function toInt(v: string | undefined): number {
  if (v == null) return 0;
  const t = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (!t || t === "--" || t === "-") return 0;
  const n = parseFloat(t);
  return isNaN(n) ? 0 : Math.round(n);
}

function looksLikeLoading(text: string): boolean {
  const head = text.slice(0, 200).toLowerCase();
  return head.startsWith("loading...") || head.includes(",loading...,");
}

async function fetchCsvOnce(url: string): Promise<{ ok: boolean; text: string; status?: number }> {
  const bust = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
  const r = await fetch(bust, { headers: { "User-Agent": "Mozilla/5.0 (Tabby-QA-Portal CSAT-Topic-Sync)", "Accept": "text/csv,*/*", "Cache-Control": "no-cache" } });
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

  const iEmail = idx("resolver");
  const iTopic = idx("human_topic");
  const iGood = idx("good");
  const iBad = idx("bad");
  const iTotal = idx("total_csat");
  const iMonthCell = idx("month");
  if (iEmail < 0 || iTopic < 0 || iGood < 0 || iBad < 0) return { error: "CSV missing required columns", details: { header } };

  // Bridge domain discrepancies: index the roster by local-part. A source
  // resolver keyed name@tabby.ai is stored under the roster's canonical
  // email (name@tabby.sa) so it matches the csat_by_topic canonicalize
  // trigger AND the orphan-cleanup below (which would otherwise treat the
  // trigger-rewritten .sa row as an orphan of the .ai source key and delete
  // it). Resolvers not in the roster (agents) keep their own email.
  const { data: rosterRows } = await supabase.from("qa_roster").select("email");
  const rosterByLocal = new Map<string, string>();
  for (const rr of (rosterRows || [])) { const e = (rr.email || "").toLowerCase(); if (e.includes("@")) rosterByLocal.set(e.split("@")[0], e); }

  type Acc = { qa_email: string; month: string; topic: string; good: number; bad: number; surveys: number };
  const acc = new Map<string, Acc>();
  const monthsTouched = new Set<string>();
  let dropped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawEmail = normEmail(row[iEmail]);
    if (!rawEmail || !rawEmail.includes("@")) { dropped++; continue; }
    const email = rosterByLocal.get(rawEmail.split("@")[0]) || rawEmail;
    const topic = (row[iTopic] || "").trim() || "-";
    const monthRaw = (iMonthCell >= 0 ? row[iMonthCell] : "") || "";
    const month = (monthRaw.includes("|") ? monthRaw.split("|").pop() : monthRaw).trim();
    if (!month) { dropped++; continue; }
    monthsTouched.add(month);

    const good = toInt(row[iGood]);
    const bad = toInt(row[iBad]);
    const surveys = iTotal >= 0 ? toInt(row[iTotal]) : (good + bad);

    const key = `${email}${SEP}${month}${SEP}${topic}`;
    const cur = acc.get(key);
    if (cur) {
      cur.good += good;
      cur.bad += bad;
      cur.surveys += surveys;
    } else {
      acc.set(key, { qa_email: email, month, topic, good, bad, surveys });
    }
  }

  const now = new Date().toISOString();
  const records = [...acc.values()].map(a => {
    const score = a.surveys > 0 ? (a.good * 100) / a.surveys : 0;
    return {
      qa_email: a.qa_email,
      month: a.month,
      topic: a.topic,
      good: a.good,
      bad: a.bad,
      surveys_count: a.surveys,
      csat_score: Number(score.toFixed(2)),
      updated_at: now,
    };
  });
  if (records.length === 0) return { error: "No valid rows to upsert" };

  const BATCH = 200;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const { error } = await supabase.from("csat_by_topic").upsert(chunk, { onConflict: "qa_email,month,topic" });
    if (error) return { error: `Upsert failed: ${error.message}`, sample: chunk[0] };
  }

  // Orphan cleanup deletes stored rows a month's feed no longer lists. It has
  // always been scoped to months PRESENT in the CSV, so months the source
  // query stopped emitting (Apr–Jun 2026, after the Jul-2026 cutover) are
  // never touched. The guard below covers the remaining hazard: a single
  // stray row for an old month would put that month back in scope and wipe
  // everything else stored for it. Skipping a shrink is recoverable;
  // deleting history is not. A genuine large shrink is reported, not hidden.
  const SHRINK_FLOOR = 20;   // months smaller than this are cheap to rebuild
  const SHRINK_RATIO = 0.5;  // feed must cover >=50% of what is stored
  const cleanupResults: Record<string, unknown> = {};
  for (const m of monthsTouched) {
    const incoming = records.filter(r => r.month === m).length;
    const { count: storedCount, error: countErr } = await supabase
      .from("csat_by_topic").select("id", { count: "exact", head: true }).eq("month", m);
    if (countErr) { cleanupResults[m] = { error: `count failed: ${countErr.message}` }; continue; }
    const stored = storedCount || 0;
    if (stored >= SHRINK_FLOOR && incoming < stored * SHRINK_RATIO) {
      cleanupResults[m] = { skipped: "shrink_guard", incoming, stored };
      console.warn(`csat-topic-sync: skipped cleanup for ${m} — feed had ${incoming} rows vs ${stored} stored`);
      continue;
    }
    const wantKeys = new Set(records.filter(r => r.month === m).map(r => `${r.qa_email}${SEP}${r.topic}`));
    const orphanIds: number[] = [];
    let from = 0;
    const PAGE = 1000;
    let fetchOk = true;
    while (true) {
      const { data, error } = await supabase.from("csat_by_topic").select("id, qa_email, topic").eq("month", m).range(from, from + PAGE - 1);
      if (error) { cleanupResults[m] = { error: `fetch failed: ${error.message}` }; fetchOk = false; break; }
      if (!data || data.length === 0) break;
      for (const row of data) if (!wantKeys.has(`${row.qa_email}${SEP}${row.topic}`)) orphanIds.push(row.id);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (!fetchOk) continue;
    let deleted = 0;
    let deleteErr: string | null = null;
    for (let i = 0; i < orphanIds.length; i += BATCH) {
      const chunk = orphanIds.slice(i, i + BATCH);
      const { error } = await supabase.from("csat_by_topic").delete().in("id", chunk);
      if (error) { deleteErr = error.message; break; }
      deleted += chunk.length;
    }
    cleanupResults[m] = deleteErr ? { error: `delete failed: ${deleteErr}`, deleted_so_far: deleted } : { orphans_deleted: deleted };
  }

  const expertiseResults: Record<string, unknown> = {};
  for (const m of monthsTouched) {
    try {
      const { data, error } = await supabase.rpc("recalculate_qa_expertise", { target_month: m });
      if (error) {
        console.warn(`expertise recalc for ${m} failed:`, error.message);
        expertiseResults[m] = { error: error.message };
      } else {
        expertiseResults[m] = data;
      }
    } catch (e) {
      console.warn(`expertise recalc for ${m} threw:`, e);
      expertiseResults[m] = { error: String(e) };
    }
  }

  return {
    success: true,
    triggered_by: triggeredBy,
    csv_rows: rows.length - 1,
    rows_dropped: dropped,
    rows_aggregated: records.length,
    months_in_feed: [...monthsTouched],
    fetch_attempts: fetchRes.attempts,
    orphans_cleaned: cleanupResults,
    expertise: expertiseResults,
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
    console.error("csat-topic-sync error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
