// Shared helpers for the announcement feature — used by the composer,
// the sender-side admin panel, and the consumer filters in App.jsx.

/** Should this announcement currently surface to a recipient? */
export function isLive(ann, now = new Date()) {
  if (!ann) return false;
  if (ann.deleted_at) return false;
  if (!ann.published) return false;
  if (ann.send_at && new Date(ann.send_at) > now) return false;
  if (ann.expires_at && new Date(ann.expires_at) <= now) return false;
  return true;
}

/** Human-readable lifecycle status — used in the admin panel pills. */
export function statusOf(ann, now = new Date()) {
  if (!ann) return "unknown";
  if (ann.deleted_at) return "deleted";
  if (!ann.published) return "draft";
  if (ann.send_at && new Date(ann.send_at) > now) return "scheduled";
  if (ann.expires_at && new Date(ann.expires_at) <= now) return "expired";
  return "active";
}

/** Match a single user against an announcement's audience.
 *
 * me      = { email, domain | operational_domain, queue (from roster) }
 * mgr     = manager_email lookup (rosterMgrMap)
 * Returns true if `me` is in the audience of `ann`. */
export function matchesAudience(ann, me, mgrMap = {}) {
  const myEmail = (me?.email || "").toLowerCase();
  if (!myEmail) return false;
  const t = ann.target_type;
  const v = ann.target_value;
  if (t === "all") return true;
  if (t === "domain") return myEmail.endsWith("@" + v);
  if (t === "team")   return (me?.queue || "") === v;
  if (t === "individual") return myEmail === (v || "").toLowerCase();
  if (t === "my_team") {
    const target = (v || "").toLowerCase();
    const myMgr = (mgrMap[myEmail] || "").toLowerCase();
    return myEmail === target
        || myMgr === target
        || (target.split("@")[0] && myMgr.split("@")[0] === target.split("@")[0]);
  }
  return false;
}

/** Compute the expected recipient email list for one announcement.
 *
 *   roster    = [{ email, queue, manager_email }]   (qa_roster rows)
 *   profiles  = [{ email, role, domain | operational_domain }]
 *
 * Returns a unique, lowercased array of emails. Used by the admin
 * panel to render the recipients table and compute % acked. */
export function recipientsFor(ann, roster = [], profiles = []) {
  if (!ann) return [];
  const t = ann.target_type;
  const v = ann.target_value;
  const all = [...roster, ...profiles]
    .map(r => (r?.email || "").toLowerCase())
    .filter(Boolean);
  const uniq = (xs) => [...new Set(xs)];

  if (t === "all") return uniq(all);
  if (t === "individual") return v ? [v.toLowerCase()] : [];
  if (t === "domain") return uniq(all.filter(e => e.endsWith("@" + v)));
  if (t === "team") {
    return uniq(
      roster.filter(r => r.queue === v).map(r => (r.email || "").toLowerCase())
    );
  }
  if (t === "my_team") {
    const target = (v || "").toLowerCase();
    const targetLocal = target.split("@")[0] || "";
    const reports = roster
      .filter(r => {
        const m = (r.manager_email || "").toLowerCase();
        if (!m) return false;
        if (m === target) return true;
        if (targetLocal && m.split("@")[0] === targetLocal) return true;
        return false;
      })
      .map(r => (r.email || "").toLowerCase());
    // The sender themselves is part of "my_team" — matchesAudience
    // counts them via the `myEmail === target` clause, so the recipient
    // list must include them too. Without this the denominator drops to
    // 0 for senders who have no direct reports in the roster (e.g.
    // super_admins), making the panel render an ack count like "1 / 0"
    // or "0 / 0" even though the sender saw + acked the announcement.
    return uniq([...(target ? [target] : []), ...reports]);
  }
  return [];
}

/** Short audience label for the admin panel row.
 *   target_type='team', target_value='BNPL'   →  'Team: BNPL'
 *   target_type='all'                         →  'Everyone'
 *   target_type='my_team', target_value=...   →  'My team' */
export function audienceLabel(ann) {
  if (!ann) return "";
  const t = ann.target_type;
  const v = ann.target_value;
  if (t === "all") return "Everyone";
  if (t === "my_team") return "My team";
  if (t === "domain") return `Domain: ${v || "—"}`;
  if (t === "team")   return `Team: ${v || "—"}`;
  if (t === "individual") return v || "—";
  return String(t || "");
}
