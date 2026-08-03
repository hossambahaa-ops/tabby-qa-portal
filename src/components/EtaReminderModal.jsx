import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "../lib/AppContext.jsx";
import { sb } from "../lib/supabase.js";
import { riyadhTodayStr } from "../lib/attendancePlan.js";
import { Icon, icons } from "./Icons.jsx";

/* ═══ TRACKER ETA REMINDER ═══
 * Mounted globally in App.jsx, so a task whose ETA has landed finds you
 * wherever you are in Pulse rather than only on the Tracker page.
 *
 * Fires for tasks assigned to me that aren't Done and whose ETA is
 * tomorrow, today, or already past. Each task can be snoozed for the rest
 * of the day; a still-late task comes back tomorrow, which is the point —
 * dismissing must not make a slipping task disappear for good.
 *
 * "Open task" deep-links to #/tracker?task=<seq>, which TrackerPage
 * resolves into an open detail panel.
 */

const DISMISS_KEY = (email) => `pulse_eta_snooze_v1_${(email || "").toLowerCase()}`;
// Re-check on this cadence so a tab left open overnight still fires the
// next morning instead of staying silent until a reload.
const RECHECK_MS = 15 * 60 * 1000;

// Riyadh-local "today" + day arithmetic on plain YYYY-MM-DD strings, so the
// browser's timezone can't shift which day an ETA belongs to.
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const daysBetween = (from, to) => {
  const ms = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(to) - ms(from)) / 86400000);
};

const readSnooze = (email) => {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY(email)) || "{}"); } catch { return {}; }
};
const writeSnooze = (email, map) => {
  try { localStorage.setItem(DISMISS_KEY(email), JSON.stringify(map)); } catch {}
};

export default function EtaReminderModal() {
  const { token, profile, impersonating } = useApp();
  const myEmail = profile?.email?.toLowerCase() || "";
  const [due, setDue] = useState([]);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), RECHECK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Never nag while viewing as someone else — those aren't your tasks, and
    // writing a snooze would pollute the real user's key.
    if (!token || !myEmail || impersonating) { setOpen(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const today = riyadhTodayStr();
        const horizon = addDays(today, 1); // include tomorrow
        const rows = await sb.query("initiatives", {
          token,
          select: "id,seq,title,status,priority,eta_date,created_by",
          filters: `assigned_to=eq.${encodeURIComponent(myEmail)}&status=neq.Done&eta_date=not.is.null&eta_date=lte.${horizon}&order=eta_date.asc`,
        }).catch(() => []);
        if (cancelled) return;
        const snoozed = readSnooze(myEmail);
        const list = (Array.isArray(rows) ? rows : [])
          .filter(r => r.eta_date && snoozed[r.id] !== today)
          .map(r => ({ ...r, offset: daysBetween(today, r.eta_date) }));
        setDue(list);
        setOpen(list.length > 0);
      } catch { if (!cancelled) setOpen(false); }
    })();
    return () => { cancelled = true; };
  }, [token, myEmail, impersonating, tick]);

  const snooze = useCallback((id) => {
    const today = riyadhTodayStr();
    const map = readSnooze(myEmail);
    map[id] = today;
    // Drop stale entries so the key can't grow without bound.
    Object.keys(map).forEach(k => { if (map[k] < today) delete map[k]; });
    writeSnooze(myEmail, map);
    setDue(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) setOpen(false);
      return next;
    });
  }, [myEmail]);

  const snoozeAll = useCallback(() => {
    const today = riyadhTodayStr();
    const map = readSnooze(myEmail);
    due.forEach(t => { map[t.id] = today; });
    Object.keys(map).forEach(k => { if (map[k] < today) delete map[k]; });
    writeSnooze(myEmail, map);
    setDue([]);
    setOpen(false);
  }, [due, myEmail]);

  const openTask = useCallback((t) => {
    snooze(t.id); // opening it counts as handling it for today
    window.location.hash = `#/tracker?task=${encodeURIComponent(t.seq ?? t.id)}`;
  }, [snooze]);

  if (!open || due.length === 0) return null;

  const label = (offset) => {
    if (offset > 0) return { text: "Due tomorrow", color: "var(--amber)" };
    if (offset === 0) return { text: "Due today", color: "var(--amber)" };
    const n = Math.abs(offset);
    return { text: `${n} day${n === 1 ? "" : "s"} overdue`, color: "var(--red)" };
  };
  const worst = due.reduce((a, t) => Math.min(a, t.offset), 99);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Task ETA reminder"
      style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(0,0,0,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) snoozeAll(); }}
    >
      <div className="card" style={{ width: "min(560px, 100%)", maxHeight: "80vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--bd2)", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: worst < 0 ? "var(--red)20" : "var(--amber)20", color: worst < 0 ? "var(--red)" : "var(--amber)" }}>
            <Icon d={icons.attendance} size={17} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>
              {due.length === 1 ? "A task needs your attention" : `${due.length} tasks need your attention`}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--tx2)", marginTop: 2 }}>
              Their ETA has arrived. Open one to see the full task and update it.
            </div>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "8px 12px 4px" }}>
          {due.map(t => {
            const l = label(t.offset);
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 8px", borderBottom: "1px solid var(--bd2)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.seq != null && <span style={{ color: "var(--tx3)", fontWeight: 500 }}>#{t.seq} </span>}{t.title}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 3, display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: l.color, fontWeight: 700 }}>{l.text}</span>
                    <span style={{ color: "var(--tx3)" }}>
                      ETA {new Date(t.eta_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {t.status ? ` · ${t.status}` : ""}
                    </span>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => openTask(t)}>Open task</button>
                <button className="btn btn-outline btn-sm" style={{ flexShrink: 0 }} title="Hide until tomorrow" onClick={() => snooze(t.id)}>Later</button>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--bd2)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11.5, color: "var(--tx3)" }}>Dismissed tasks return tomorrow if still open.</span>
          <button className="btn btn-outline btn-sm" onClick={snoozeAll}>Remind me tomorrow</button>
        </div>
      </div>
    </div>
  );
}
