import React, { useState, useEffect } from "react";
import { sb } from "../lib/supabase.js";
import { useApp } from "../lib/AppContext.jsx";
import { BADGE_CATALOG, sortBadges, seenKey } from "../lib/badges.js";

/**
 * <Badges qaEmail={...} compact={false} max={0} celebrate={false} />
 *
 * Renders a strip of earned-badge pills for one QA. Reads from the
 * `qa_badges_v` view, dedupes by badge_key (keeping the most recent month),
 * sorts gold-first.
 *
 * Props:
 *   - qaEmail   email to look up
 *   - compact   true → emoji-only mini pills (used in tight spots like
 *               leaderboard rows). false (default) → full pill with label.
 *   - max       cap the number of badges shown. 0 = no cap.
 *   - celebrate when true AND the QA email matches the logged-in user,
 *               fires a toast for any badge that's new since last visit.
 */
export default function Badges({ qaEmail, compact = false, max = 0, celebrate = false, prefetched = null }) {
  const { token, profile, globalToast } = useApp();
  // If prefetched is provided, use it directly — this avoids the N+1
  // query problem when rendering Badges in long lists (Leaderboard).
  // Callers can pass an array of {badge_key,tier,month} pre-filtered to
  // this qaEmail; pass [] to mean "I checked, nothing earned".
  const [rows, setRows] = useState(prefetched);

  useEffect(() => {
    if (prefetched !== null) { setRows(prefetched); return; }
    if (!qaEmail || !token) { setRows([]); return; }
    let cancelled = false;
    sb.query("qa_badges_v", {
      select: "badge_key,tier,month",
      filters: `qa_email=eq.${encodeURIComponent(qaEmail.toLowerCase())}&order=month.desc`,
      token,
    })
      .then(data => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [qaEmail, token, prefetched]);

  // Dedupe by badge_key — keep the most-recent month for each
  const unique = {};
  (rows || []).forEach(b => {
    if (!unique[b.badge_key] || (b.month || "") > (unique[b.badge_key].month || "")) {
      unique[b.badge_key] = b;
    }
  });
  const list = sortBadges(Object.values(unique));
  const visible = max > 0 ? list.slice(0, max) : list;

  // Celebration toast — only when viewing your own profile and the data
  // arrives. Marks each badge as "seen" so it doesn't re-toast next time.
  useEffect(() => {
    if (!celebrate || !rows || rows.length === 0) return;
    const myEmail = profile?.email?.toLowerCase();
    if (!myEmail || myEmail !== qaEmail?.toLowerCase()) return;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(seenKey(myEmail)) || "[]"); } catch {}
    const seenSet = new Set(seen);
    const fresh = list.filter(b => !seenSet.has(b.badge_key + "@" + b.month));
    if (fresh.length === 0) return;
    // Toast the highest-tier first; cap at 2 so we don't spam
    fresh.slice(0, 2).forEach((b, i) => {
      const cat = BADGE_CATALOG[b.badge_key];
      if (!cat) return;
      setTimeout(() => {
        globalToast?.("success", `${cat.emoji} New badge — ${cat.label}!`);
      }, 600 + i * 1800);
    });
    // Mark every fresh badge as seen so the next visit is silent
    const merged = Array.from(new Set([...seen, ...fresh.map(b => b.badge_key + "@" + b.month)]));
    try { localStorage.setItem(seenKey(myEmail), JSON.stringify(merged)); } catch {}
  }, [rows, celebrate, profile?.email, qaEmail]);

  if (rows === null) return null; // loading
  if (visible.length === 0) return null;

  return (
    <div className="badges-strip" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {visible.map(b => <BadgePill key={b.badge_key} earned={b} compact={compact} />)}
      {max > 0 && list.length > max && (
        <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 500 }}>+{list.length - max}</span>
      )}
    </div>
  );
}

function BadgePill({ earned, compact }) {
  const cat = BADGE_CATALOG[earned.badge_key];
  if (!cat) return null;
  const monthLabel = earned.month
    ? new Date(earned.month + "-01T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "";
  const title = `${cat.label} — ${cat.desc}${monthLabel ? ` (${monthLabel})` : ""}`;
  if (compact) {
    return (
      <span title={title} style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        background: `${cat.color}1a`, border: `1px solid ${cat.color}55`,
        fontSize: 13, lineHeight: 1, cursor: "default",
      }}>{cat.emoji}</span>
    );
  }
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px",
      background: `${cat.color}18`,
      border: `1px solid ${cat.color}55`,
      borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      color: cat.color,
      lineHeight: 1.2,
      cursor: "default",
      letterSpacing: ".1px",
    }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{cat.emoji}</span>
      {cat.label}
    </span>
  );
}
