import { sb, dataCache } from "./supabase.js";

export const monday=(d)=>{const dt=new Date(d);const day=dt.getDay();const diff=dt.getDate()-day+(day===0?-6:1);dt.setDate(diff);return dt.toISOString().split("T")[0];};
export const fmtWeek=(d)=>{if(!d)return"—";const dt=new Date(d+"T00:00:00");return`Week of ${dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;};
export const safeError=(e)=>{const m=e?.message||String(e);console.error("Error:",m);if(m.includes("duplicate key"))return"This record already exists.";if(m.includes("violates foreign key"))return"Related record not found.";if(m.includes("permission denied")||m.includes("new row violates"))return"You don't have permission for this action.";if(m.includes("JWT expired")||m.includes("Invalid JWT"))return"Session expired. Please refresh the page.";if(m.length>100)return"Something went wrong. Please try again.";return m;};

export const nameFromEmail = (email) => {
  if (!email) return "—";
  return email.split("@")[0].split(".").map(p => {
    const c = p.replace(/[\d]+$/, "");
    return c ? c.charAt(0).toUpperCase() + c.slice(1) : "";
  }).filter(Boolean).join(" ");
};

export const initialsFromEmail = (email) => {
  const name = nameFromEmail(email);
  const parts = name.split(" ");
  return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
};

/**
 * Cross-domain, case-insensitive email match. QAs can have both
 * @tabby.ai and @tabby.sa variants, and historical writes are
 * inconsistent — exact-equality matching silently misses data when
 * the row's domain differs from the user's. Compares the local part
 * (everything before @) so both variants resolve to the same person.
 *
 *   emailsMatchLoose("Asmaa.Mohamed@tabby.sa", "asmaa.mohamed@tabby.ai") → true
 *   emailsMatchLoose("a@x.com", "b@x.com") → false
 */
export const emailsMatchLoose = (a, b) => {
  if (!a || !b) return false;
  const al = String(a).toLowerCase();
  const bl = String(b).toLowerCase();
  if (al === bl) return true;
  return al.split("@")[0] === bl.split("@")[0];
};

// csat_pct comes in two shapes depending on which sync wrote it:
//   - new mtd-sync edge function:  "100.00%" / "75.00%"  (already a percent)
//   - legacy Apps-Script writes:    "0.875"               (fraction, ×100 to get %)
// Decide which by looking for the % suffix or the 0–1 magnitude.
export const csatPctValue = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const hasPercent = s.includes("%");
  const n = parseFloat(s.replace("%", "").replace(",", "."));
  if (isNaN(n)) return null;
  if (hasPercent) return n;          // already a percent
  if (n <= 1) return n * 100;        // 0–1 fraction → percent
  return n;                          // bare number ≥ 1 → already a percent
};

// Zero surveys means "no data", not "bad score" — gray it out instead of red.
// Pass (pctValue, surveysCount) — pctValue is already the 0-100 number.
export const csatColor = (v, surveys) => {
  if (v == null || !surveys || surveys <= 0) return "var(--tx3)";
  return v >= 90 ? "var(--green)" : v >= 75 ? "var(--amber)" : "var(--red)";
};

// The CSAT import writes topics as they appear in the source (e.g.
// "Card Status -", "Card Status", "General & Info", "General & Info -"),
// so the same concept lands as several rows. Collapse them by trimming
// whitespace, dropping trailing separators, and lower-casing for the
// grouping key. Rows that are just dashes / empty become "Uncategorized".
export const normalizeTopic = (t) => {
  if (!t) return "Uncategorized";
  const cleaned = String(t).trim().replace(/[\s\-–—]+$/g, "").replace(/^[\s\-–—]+/g, "").trim();
  return cleaned || "Uncategorized";
};

/* ═══ GLOBAL FILTER HELPERS ═══
 * Slim global filter: only domain (org scope) and month (time scope) live
 * on `gf` now. Teams + People used to be here too but were dropped in
 * the filter unification — they live on the page that uses them.
 * The `rosterMap` arg is kept for backwards compat but is no longer read.
 */
export function applyGF(rows, gf, emailField = "qa_email", _rosterMap) {
  if (!gf || !rows) return rows;
  let r = rows;
  if (gf.domain) r = r.filter(x => (x[emailField] || x.email || "").endsWith("@" + gf.domain));
  return r;
}
export function applyGFMonth(months, gf) {
  if (gf?.month) return gf.month;
  return months[0] || "";
}

/* ═══ ACTIVITY LOGGER ═══ */
export async function logActivity(token, actor, action, targetType, targetId, details) {
  try {
    await sb.query("activity_log", { token, method: "POST", body: { actor_email: actor, action, target_type: targetType || null, target_id: targetId || null, details: details || null } });
    if (targetType) dataCache.invalidate(targetType);
  } catch {}
}
