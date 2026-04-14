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

/* ═══ GLOBAL FILTER HELPERS ═══ */
export function applyGF(rows, gf, emailField = "qa_email") {
  if (!gf || !rows) return rows;
  let r = rows;
  if (gf.domain) r = r.filter(x => (x[emailField] || x.email || "").endsWith("@" + gf.domain));
  if (gf.people?.length > 0) r = r.filter(x => gf.people.includes((x[emailField] || x.email || "").toLowerCase()));
  if (gf.teams?.length > 0) {
    const rosterMap = window.__gfRoster || {};
    r = r.filter(x => {
      const em = (x[emailField] || x.email || "").toLowerCase();
      const q = rosterMap[em];
      return q && gf.teams.includes(q);
    });
  }
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
