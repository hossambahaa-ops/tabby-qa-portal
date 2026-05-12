import { useState, useEffect } from "react";
import { sb } from "./supabase.js";

// Returns YYYY-MM-DD for today in Riyadh time.
const todayRiyadh = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

/**
 * useFreshness(token, refreshKey)
 *
 * Fetches MAX(synced_at) from daily_scores (today), mtd_scores, and
 * csat_by_topic. Increments to `refreshKey` re-trigger the fetch so
 * pages can bump it after a manual sync.
 *
 * Returns { daily, mtd, csat } — each is an ISO timestamp string or null.
 */
export function useFreshness(token, refreshKey = 0) {
  const [ts, setTs] = useState({ daily: null, mtd: null, csat: null });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const today = todayRiyadh();

    Promise.all([
      sb.query("daily_scores", {
        select: "synced_at",
        filters: `date=eq.${today}&order=synced_at.desc&limit=1`,
        token,
      }).catch(() => []),
      sb.query("mtd_scores", {
        select: "synced_at",
        filters: "order=synced_at.desc&limit=1",
        token,
      }).catch(() => []),
      // csat_by_topic was never given a synced_at column — the table
      // tracks freshness via the auto-maintained updated_at trigger.
      // Querying synced_at threw "column does not exist" 500s on
      // every Dashboard mount.
      sb.query("csat_by_topic", {
        select: "updated_at",
        filters: "order=updated_at.desc&limit=1",
        token,
      }).catch(() => []),
    ]).then(([daily, mtd, csat]) => {
      if (!cancelled) {
        setTs({
          daily: daily?.[0]?.synced_at || null,
          mtd:   mtd?.[0]?.synced_at   || null,
          csat:  csat?.[0]?.updated_at  || null,
        });
      }
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, refreshKey]);

  return ts;
}
