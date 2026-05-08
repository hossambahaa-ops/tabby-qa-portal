// App utilization heartbeat. One row per (user, Riyadh-day) in
// user_activity. On mount and every 5 minutes, upsert: bump
// last_seen_at, add ~5 minutes (capped to wall-clock gap so an idle
// tab doesn't inflate totals), record current page in page_visits.
//
// Total writes per active user ≈ 12/hour — well under the free-plan
// ceiling. Pulled out of App.jsx 2026-05-08 to keep the shell focused
// on routing + layout.
//
// Returns a cleanup function. Bind from a useEffect:
//   useEffect(() => startHeartbeat({ token, email, getPagePath }), [token, email]);

import { sb, SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";

const todayRiyadh = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

export function startHeartbeat({ token, email, getPagePath }) {
  if (!token || !email) return () => {};
  const lower = email.toLowerCase();
  let lastBeat = 0;

  const beat = async () => {
    try {
      const now = Date.now();
      const gapMin = lastBeat ? Math.max(0, Math.min(6, Math.round((now - lastBeat) / 60000))) : 1;
      lastBeat = now;
      const date = todayRiyadh();
      const ua = (navigator?.userAgent || "").slice(0, 200);
      const pagePath = (getPagePath?.() || location.pathname.replace(/^\//, "") || "dashboard");

      // Read-modify-write — PostgREST doesn't expose raw SQL increment.
      // The jsonb merge keeps existing visit counts and adds 1 to the
      // current page.
      const existing = await sb.query("user_activity", {
        select: "total_minutes,page_visits,first_seen_at",
        filters: `user_email=eq.${encodeURIComponent(lower)}&date=eq.${date}`,
        token,
      }).catch(() => []);
      const cur = Array.isArray(existing) && existing[0] ? existing[0] : null;
      const visits = { ...(cur?.page_visits || {}), [pagePath]: ((cur?.page_visits || {})[pagePath] || 0) + 1 };
      const totalMin = (cur?.total_minutes || 0) + gapMin;
      const body = {
        user_email: lower,
        date,
        last_seen_at: new Date().toISOString(),
        total_minutes: totalMin,
        page_visits: visits,
        last_page: pagePath,
        user_agent: ua,
        ...(cur ? {} : { first_seen_at: new Date().toISOString() }),
      };
      await fetch(`${SUPABASE_URL}/rest/v1/user_activity?on_conflict=user_email,date`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${token}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(body),
      }).catch(() => {});
    } catch {
      // utilization is best-effort
    }
  };

  beat(); // first beat as soon as we have a session+profile
  const id = setInterval(beat, 5 * 60 * 1000); // every 5 min
  // Also beat on tab refocus so "currently online" doesn't go stale
  // when a user comes back to a tab they had in the background.
  const onFocus = () => beat();
  window.addEventListener("focus", onFocus);
  return () => {
    clearInterval(id);
    window.removeEventListener("focus", onFocus);
  };
}
