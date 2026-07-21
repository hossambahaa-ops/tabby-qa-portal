import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// quality-tasks-sync
// Mirrors two published Google sheets into public.qa_quality_tasks, one
// row per (canonical qa_email, month):
//
//   ABT SBS        - the "SBS AGBT/ABT" form. One row per side-by-side
//                    session. QA = "Email Address", date = "Timestamp".
//                    Minutes = sessions x 20 (Front Line) / 25 (non-FL).
//                    DISTINCT from productivity_history.sbs / mtd_scores.sbs.
//
//   ABT Validation - the "ABT Weekly Validation Checklist". One row per
//                    validated ticket. The QA is the "QA Specialist" column
//                    (NOT "Agent Email"). Counts 15 min ONLY when "Root Cause"
//                    is non-blank; blank Root Cause is skipped. Date =
//                    "Validation Date".
//
// ALL activity is ingested as a display FIGURE (abt_*_count / abt_*_minutes),
// regardless of date. But only activity dated on/after QUALITY_TASKS_START_DATE
// (default 2026-07-22, "tomorrow") is COUNTABLE (countable_count /
// countable_minutes) toward occupancy + ticket/day. Earlier activity was
// already folded into side_tasks_duration_mins, so counting it again would
// double-count - hence the split: the past shows as a figure but contributes
// 0 to the calculations.
//
// FL vs non-FL comes from qa_roster.queue = 'Front Line'. QAs not on the
// roster are skipped and reported in `unmatched`.
//
// Cron: hourly. Idempotent - each run fully re-derives every (qa, month) and
// upserts, overwriting.

const SBS_CSV_URL = Deno.env.get("ABT_SBS_CSV_URL") ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSuxBVULxfBaQ0Z4u0se88_YYRAHflObrW4fUHpheILZU-s84ZjuW9CCxy10qJkurpzdPqHc5xB-O-h/pub?output=csv";
const ABT_VAL_CSV_URL = Deno.env.get("ABT_VALIDATION_CSV_URL") ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTpJ_gJ3g2ySkgqh2IR1lQdqzkZYt0OOceAMM11OsE2mVT_OR1DESDhvZeo2iPp-tGFmlwJ24zJOoBT/pub?gid=656272246&single=true&output=csv";

// Activity strictly before this date is a display-only figure (already in
// Side Tasks); on/after it is countable toward occupancy + ticket/day.
const START_DATE = Deno.env.get("QUALITY_TASKS_START_DATE") || "2026-07-22";

// Per-session / per-validation minute rates.
const SBS_MIN_FL = Number(Deno.env.get("ABT_SBS_MIN_FL") || "20");
const SBS_MIN_NONFL = Number(Deno.env.get("ABT_SBS_MIN_NONFL") || "25");
const VAL_MIN = Number(Deno.env.get("ABT_VALIDATION_MIN") || "15");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const PROJECT_REF = (SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1]) || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function decodeJwtPayload(j: string): Record<string, unknown> | null {
  try { const p = j.split("."); if (p.length !== 3) return null; const b = p[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4))); } catch { return null; }
}
async function authorize(req: Request, supabase: any) {
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!auth) return { ok: false, error: "Unauthorized", status: 401 };
  if (SUPABASE_SERVICE_ROLE_KEY && auth === SUPABASE_SERVICE_ROLE_KEY) return { ok: true, userEmail: "cron" };
  const payload = decodeJwtPayload(auth);
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
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c === "\r") { /* skip */ } else f += c; }
  }
  if (f.length > 0 || row.length > 0) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(v => v && v.trim()));
}
async function fetchCsv(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const bust = url + (url.includes("?") ? "&" : "?") + "_=" + Date.now();
      const r = await fetch(bust, { headers: { "User-Agent": "Mozilla/5.0 (Tabby-QA-Portal quality-tasks-sync)", "Accept": "text/csv,*/*", "Cache-Control": "no-cache" } });
      if (!r.ok) { await new Promise(res => setTimeout(res, 1500)); continue; }
      const text = await r.text();
      const head = text.slice(0, 200).toLowerCase();
      if (text.length < 50 || head.startsWith("loading...")) { await new Promise(res => setTimeout(res, 1500 * attempt)); continue; }
      return { ok: true, text };
    } catch { await new Promise(res => setTimeout(res, 1500)); }
  }
  return { ok: false, error: "CSV not ready after retries" };
}

const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NUM: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const norm = (s: string) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
const findCol = (header: string[], name: string) => header.findIndex(h => norm(h) === norm(name));
const monthLabel = (d: Date) => `${MONTHS3[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

function parseSlashDate(v: string): Date | null {
  const m = String(v || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
}
function parseDashDate(v: string): Date | null {
  const s = String(v || "").replace(/\s+/g, " ").trim();
  const m = s.match(/(\d{1,2})\s*-\s*([A-Za-z]{3,})\s*-\s*(\d{4})/);
  if (!m) return null;
  const mon = MONTH_NUM[m[2].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  return new Date(Date.UTC(+m[3], mon, +m[1]));
}

async function runSync(supabase: any, triggeredBy: string) {
  const cutoff = new Date(`${START_DATE}T00:00:00Z`);

  const { data: idRows } = await supabase.from("profiles").select("email");
  const { data: rosterRows } = await supabase.from("qa_roster").select("email, queue");
  const saIdentities = new Set<string>(); const byLocal = new Map<string, string>();
  for (const rr of [...(idRows || []), ...(rosterRows || [])]) {
    const e = (rr.email || "").trim().toLowerCase();
    if (!e.includes("@")) continue;
    if (e.endsWith("@tabby.sa")) saIdentities.add(e);
    const lp = e.split("@")[0]; if (!byLocal.has(lp)) byLocal.set(lp, e);
  }
  const canon = (e: string) => {
    const lc = (e || "").trim().toLowerCase();
    if (lc.endsWith("@tabby.ai")) { const sa = lc.split("@")[0] + "@tabby.sa"; if (saIdentities.has(sa)) return sa; }
    return lc;
  };
  const rosterEmails = new Set<string>();
  const isFL = new Set<string>();
  for (const rr of (rosterRows || [])) {
    const ce = canon(rr.email || "");
    if (!ce.includes("@")) continue;
    rosterEmails.add(ce);
    if (norm(rr.queue || "") === "front line") isFL.add(ce);
  }

  // (qa, month) -> counts. sbs/val = FULL (all dates); sbs_c/val_c = COUNTABLE
  // subset (on/after cutoff).
  const agg = new Map<string, { qa: string; month: string; sbs: number; val: number; sbs_c: number; val_c: number }>();
  const bump = (qa: string, month: string, field: "sbs" | "val", countable: boolean) => {
    const key = `${qa} ${month}`;
    const e = agg.get(key) || { qa, month, sbs: 0, val: 0, sbs_c: 0, val_c: 0 };
    e[field]++;
    if (countable) e[(field + "_c") as "sbs_c" | "val_c"]++;
    agg.set(key, e);
  };
  const unmatched = new Set<string>();

  // ABT SBS sheet
  const sbsRes = await fetchCsv(SBS_CSV_URL);
  if (!sbsRes.ok) return { error: `ABT SBS: ${sbsRes.error}` };
  const sbsRows = parseCSV(sbsRes.text);
  const sbsHdr = (sbsRows[0] || []);
  const sQa = findCol(sbsHdr, "email address");
  const sDate = findCol(sbsHdr, "timestamp");
  if (sQa < 0 || sDate < 0) return { error: "ABT SBS: missing 'Email Address' / 'Timestamp' columns" };
  let sbsSeen = 0, sbsCountable = 0;
  for (let i = 1; i < sbsRows.length; i++) {
    const row = sbsRows[i];
    const raw = (row[sQa] || "").trim().toLowerCase();
    if (!raw.includes("@")) continue;
    const d = parseSlashDate(row[sDate] || "");
    if (!d) continue;
    sbsSeen++;
    const qa = canon(raw);
    if (!rosterEmails.has(qa)) { unmatched.add(raw); continue; }
    const countable = d >= cutoff;
    if (countable) sbsCountable++;
    bump(qa, monthLabel(d), "sbs", countable);
  }

  // ABT Validation sheet (row 0 = title banner, row 1 = real header)
  const valRes = await fetchCsv(ABT_VAL_CSV_URL);
  if (!valRes.ok) return { error: `ABT Validation: ${valRes.error}` };
  const valRows = parseCSV(valRes.text);
  const vHdr = (valRows[1] || []);
  const vQa = findCol(vHdr, "qa specialist");
  const vDate = findCol(vHdr, "validation date");
  const vRoot = findCol(vHdr, "root cause");
  if (vQa < 0 || vDate < 0 || vRoot < 0) return { error: "ABT Validation: missing 'QA Specialist' / 'Validation Date' / 'Root Cause' columns" };
  let valSeen = 0, valBlankRoot = 0, valCountable = 0;
  for (let i = 2; i < valRows.length; i++) {
    const row = valRows[i];
    const raw = (row[vQa] || "").trim().toLowerCase();
    if (!raw.includes("@")) continue;
    if (!(row[vRoot] || "").trim()) { valBlankRoot++; continue; }  // blank Root Cause -> skip
    const d = parseDashDate(row[vDate] || "");
    if (!d) continue;
    valSeen++;
    const qa = canon(raw);
    if (!rosterEmails.has(qa)) { unmatched.add(raw); continue; }
    const countable = d >= cutoff;
    if (countable) valCountable++;
    bump(qa, monthLabel(d), "val", countable);
  }

  // build records: FULL figures + COUNTABLE subset, FL-aware minutes
  const now = new Date().toISOString();
  const records = [...agg.values()].map(e => {
    const rate = isFL.has(e.qa) ? SBS_MIN_FL : SBS_MIN_NONFL;
    return {
      qa_email: e.qa, month: e.month,
      abt_sbs_count: e.sbs, abt_sbs_minutes: e.sbs * rate,
      abt_validation_count: e.val, abt_validation_minutes: e.val * VAL_MIN,
      countable_count: e.sbs_c + e.val_c,
      countable_minutes: e.sbs_c * rate + e.val_c * VAL_MIN,
      synced_at: now,
    };
  });

  let upserted = 0;
  const BATCH = 200;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const { error } = await supabase.from("qa_quality_tasks").upsert(chunk, { onConflict: "qa_email,month" });
    if (error) return { error: `Upsert failed: ${error.message}`, sample: chunk[0] };
    upserted += chunk.length;
  }

  return {
    success: true, triggered_by: triggeredBy, countable_from: START_DATE,
    rows_upserted: upserted,
    abt_sbs: { rows_seen: sbsSeen, countable: sbsCountable },
    abt_validation: { rows_seen: valSeen, blank_root_cause_skipped: valBlankRoot, countable: valCountable },
    unmatched_qas: [...unmatched],
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
    console.error("quality-tasks-sync error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
