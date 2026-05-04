import { useState, useEffect, useMemo } from "react";
import { listMtd } from "../api/mtd.js";
import { useApp } from "./AppContext.jsx";
import {
  computeTitleHolders,
  holdersByEmail,
  getLastCompletedMonth,
  getCurrentCalendarMonth,
  monthBefore,
} from "./titles.js";

/**
 * useReigningBelts() → { loading, beltMonth, holders, myBelts }
 *
 * Centralized hook for everything belt-related — top-nav indicator, the
 * first-of-month announcement modal, and any future surfaces all read from
 * here so we only fetch MTD once per session and produce a single coherent
 * answer for "who reigns right now?".
 *
 *   beltMonth   the Mon-YYYY string the belts were awarded for (last
 *               completed calendar month, or fallback to most recent
 *               month with data older than the in-flight one)
 *   holders     map of { title_key: { qa_email, value, display } | null }
 *   myBelts     [{ title_key, value, display }, …] for the logged-in user
 *
 * Reuses listMtd's default dataCache so calling pages (Leaderboard,
 * Profile) and this hook share one fetch — first one to load wins,
 * the rest are instant.
 */
export function useReigningBelts() {
  const { token, profile } = useApp();
  const [mtd, setMtd] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let cancelled = false;
    listMtd({ token })
      .then((rows) => {
        if (cancelled) return;
        setMtd(Array.isArray(rows) ? rows : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMtd([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  return useMemo(() => {
    if (loading || !mtd) {
      return { loading: true, beltMonth: "", holders: null, myBelts: [] };
    }
    const allMonths = [...new Set(mtd.map((r) => r.month).filter(Boolean))];
    const candidate = getLastCompletedMonth();
    const beltMonth = allMonths.includes(candidate)
      ? candidate
      : allMonths.find((m) => monthBefore(m, getCurrentCalendarMonth())) || "";
    if (!beltMonth) {
      return { loading: false, beltMonth: "", holders: null, myBelts: [] };
    }
    const holders = computeTitleHolders(mtd, beltMonth);
    const map = holdersByEmail(holders);
    const myBelts = map[profile?.email?.toLowerCase()] || [];
    return { loading: false, beltMonth, holders, myBelts };
  }, [mtd, loading, profile?.email]);
}
