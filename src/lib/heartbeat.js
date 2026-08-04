// App utilization heartbeat. One row per (user, Riyadh-day) in user_activity.
//
// total_minutes counts ACTIVE minutes only — the tab has to be visible AND the
// user has to have touched something (mouse, key, scroll, touch) within
// IDLE_MS. Previously it credited ~5 minutes on every 5-minute interval
// regardless, so a tab left open all day recorded a full day of "usage" from
// somebody who wasn't there. That made the Utilization page a measure of who
// leaves Pulse open rather than who uses it.
//
// Mechanism: a short ticker accrues time in small slices, and a separate timer
// flushes whole minutes to the DB. Sub-minute remainders carry across flushes
// so nothing is lost to rounding. Time is also flushed when the tab is hidden
// or unloaded, so closing a laptop doesn't discard the last few minutes.
//
// Writes per active user stay ~12/hour, same as before.
//
// Returns a cleanup function. Bind from a useEffect:
//   useEffect(() => startHeartbeat({ token, email, getPagePath }), [token, email]);

import { sb, SUPABASE_URL, SUPABASE_ANON } from "./supabase.js";

const IDLE_MS  = 90 * 1000;       // no input for 90s → treat as away
const TICK_MS  = 15 * 1000;       // accrual resolution
const FLUSH_MS = 5 * 60 * 1000;   // how often whole minutes are written

// Passive so scroll/touch handling is never delayed by our listener.
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "wheel", "touchstart", "click"];

const todayRiyadh = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

export function startHeartbeat({ token, email, getPagePath }) {
  if (!token || !email) return () => {};
  const lower = email.toLowerCase();

  let lastActivity = Date.now();
  let activeMs = 0;    // accrued since the last flush
  let carrySec = 0;    // sub-minute remainder kept across flushes
  let stopped = false;

  const markActive = () => { lastActivity = Date.now(); };
  ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, markActive, { passive: true }));

  const isActive = () =>
    document.visibilityState === "visible" && (Date.now() - lastActivity) < IDLE_MS;

  const tickId = setInterval(() => { if (isActive()) activeMs += TICK_MS; }, TICK_MS);

  // `force` writes the row even when no whole minute was earned, so the very
  // first beat creates the row and "currently online" works immediately.
  const flush = async (force = false) => {
    if (stopped) return;
    try {
      const totalSec = Math.floor(activeMs / 1000) + carrySec;
      const mins = Math.floor(totalSec / 60);
      carrySec = totalSec % 60;
      activeMs = 0;
      if (mins <= 0 && !force) return;

      const date = todayRiyadh();
      const ua = (navigator?.userAgent || "").slice(0, 200);
      const pagePath = (getPagePath?.() || location.pathname.replace(/^\//, "") || "dashboard");

      // Read-modify-write — PostgREST doesn't expose a raw SQL increment.
      const existing = await sb.query("user_activity", {
        select: "total_minutes,page_visits,first_seen_at",
        filters: `user_email=eq.${encodeURIComponent(lower)}&date=eq.${date}`,
        token,
      }).catch(() => []);
      const cur = Array.isArray(existing) && existing[0] ? existing[0] : null;

      // Only count a page against someone who was actually active in this
      // window, so an idle tab parked on a page can't inflate its visit count.
      const visits = { ...(cur?.page_visits || {}) };
      if (mins > 0) visits[pagePath] = (visits[pagePath] || 0) + 1;

      const body = {
        user_email: lower,
        date,
        // last_seen_at is the last real interaction, not the last timer fire,
        // so "currently online" reflects presence rather than an open tab.
        last_seen_at: new Date(lastActivity).toISOString(),
        total_minutes: (cur?.total_minutes || 0) + mins,
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

  flush(true); // create today's row as soon as we have a session + profile
  const flushId = setInterval(() => flush(false), FLUSH_MS);

  // Don't lose the current partial window when the tab goes away.
  const onHide = () => { if (document.visibilityState === "hidden") flush(false); };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => flush(false));

  return () => {
    stopped = true;
    clearInterval(tickId);
    clearInterval(flushId);
    ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, markActive));
    document.removeEventListener("visibilitychange", onHide);
  };
}
