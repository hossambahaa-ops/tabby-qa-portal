import React, { useState, useMemo, useEffect } from "react";
import { sb, SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { nameFromEmail, safeError, emailsMatchLoose } from "../../lib/utils.js";
import { hasRole } from "../../lib/constants.js";
import { isPlanEditableDate, PLAN_FEATURE_START, riyadhTodayStr } from "../../lib/attendancePlan.js";
import SearchableSelect from "../SearchableSelect.jsx";
import AttendancePlanBulkModal from "./AttendancePlanBulkModal.jsx";

/**
 * <AttendancePlanGrid attendance={...} qaList={...} roster={...} selMonth="2026-05" onSaved={...} />
 *
 * Lead/admin-only editor for the planned attendance layer. Renders a
 * grid of QA × workday for the selected month, two-state cells (H/P),
 * a bulk-fill bar, and a single Save button — nothing commits until
 * Save. Past dates are read-only. Pre-May-2026 dates are not editable.
 *
 * On save, upserts qa_attendance rows by (email, date) and bumps
 * plan_updated_at automatically (DB trigger). Manager-of-lead
 * notifications fire from the bell, derived from plan_updated_at.
 */
export default function AttendancePlanGrid({ attendance, qaList, roster, selMonth, onSaved, monthIsLocked, isSuperAdmin }) {
  const { token, profile, globalToast } = useApp();
  const myEmail = profile?.email?.toLowerCase() || "";

  // Filter UI: domain → team → QA Lead → search
  const [selDomain, setSelDomain] = useState("");
  const [selTeam, setSelTeam] = useState("");
  const [selLead, setSelLead] = useState("");
  const [search, setSearch] = useState("");

  // pendingChanges: { [email__date]: 'H' | 'P' | null }  (null = clear)
  const [pendingChanges, setPendingChanges] = useState({});
  // pendingShifts: { [email__date]: { start: 'HH:MM', end: 'HH:MM' } | null }
  // null = clear shift on save. Independent of pendingChanges so a row
  // can have a shift change without a status change (and vice-versa).
  // Currently only populated by the bulk modal — per-cell editing of
  // shifts is intentionally not exposed because the user reported it
  // as too tedious for daily/weekly/monthly cadences.
  const [pendingShifts, setPendingShifts] = useState({});
  const [saving, setSaving] = useState(false);

  // Bulk modal state — opens via the 📋 Bulk set button.
  const [bulkOpen, setBulkOpen] = useState(false);

  // Build month days
  const days = useMemo(() => {
    if (!selMonth) return [];
    const [y, mo] = selMonth.split("-").map(Number);
    const daysCount = new Date(y, mo, 0).getDate();
    const out = [];
    for (let d = 1; d <= daysCount; d++) {
      const dt = new Date(y, mo - 1, d);
      const dateStr = `${selMonth}-${String(d).padStart(2, "0")}`;
      const wd = dt.getDay();
      out.push({
        date: dateStr,
        day: d,
        // Friday/Saturday are styled as weekends but still editable —
        // some teams (especially tabby.ai) work weekends.
        isWeekend: wd === 5 || wd === 6,
        weekdayShort: dt.toLocaleDateString("en-US", { weekday: "short" }),
      });
    }
    return out;
  }, [selMonth]);

  // Index attendance by email + date for fast cell lookup
  const attMap = useMemo(() => {
    const m = {};
    (attendance || []).forEach((a) => {
      const e = a.email?.toLowerCase();
      if (!e || !a.date) return;
      m[`${e}__${a.date}`] = a;
    });
    return m;
  }, [attendance]);

  // QA Lead options — derived from roster manager_email values
  const leadOptions = useMemo(() => {
    const set = new Set();
    (roster || []).forEach((r) => {
      const m = r.manager_email?.toLowerCase();
      if (m) set.add(m);
    });
    return [...set].sort().map((m) => ({ value: m, label: nameFromEmail(m) }));
  }, [roster]);

  // Domain / team options
  const domainOptions = [
    { value: "tabby.ai", label: "tabby.ai" },
    { value: "tabby.sa", label: "tabby.sa" },
  ];
  const teamOptions = useMemo(() => {
    const set = new Set();
    (roster || []).forEach((r) => {
      if (r.queue && (!selDomain || r.email?.toLowerCase().endsWith("@" + selDomain))) {
        set.add(r.queue);
      }
    });
    return [...set].sort().map((t) => ({ value: t, label: t }));
  }, [roster, selDomain]);

  // Apply filters → visible QAs
  const visibleQAs = useMemo(() => {
    let list = qaList || [];
    if (selDomain) list = list.filter((q) => q.email?.toLowerCase().endsWith("@" + selDomain));
    if (selTeam) {
      const teamEmails = new Set(
        (roster || []).filter((r) => r.queue === selTeam).map((r) => r.email?.toLowerCase()),
      );
      list = list.filter((q) => teamEmails.has(q.email?.toLowerCase()));
    }
    if (selLead) {
      const leadEmails = new Set(
        (roster || [])
          .filter((r) => emailsMatchLoose(r.manager_email, selLead))
          .map((r) => r.email?.toLowerCase()),
      );
      // Include the lead's own row too (synthesized in qaList with
      // manager_email = null), so the team header still appears when
      // the lead filter is active.
      const selLeadLc = selLead.toLowerCase();
      list = list.filter((q) => {
        const em = q.email?.toLowerCase();
        return leadEmails.has(em) || em === selLeadLc;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (qa) =>
          (qa.email || "").toLowerCase().includes(q) ||
          nameFromEmail(qa.email).toLowerCase().includes(q),
      );
    }
    // Re-group: lead rows first, their team members sorted alphabetically
    // beneath. Orphan QAs (whose lead isn't in the filtered list) fall to
    // the bottom. Mirrors the Calendar tab's layout so leads see the same
    // team blocks in the same order on both tabs.
    const leadRows = list.filter((q) => q.__isLead);
    const memberRows = list.filter((q) => !q.__isLead);
    const sortedLeads = [...leadRows].sort((a, b) =>
      (a.email || "").localeCompare(b.email || ""),
    );
    const grouped = [];
    const used = new Set();
    for (const lead of sortedLeads) {
      const le = (lead.email || "").toLowerCase();
      grouped.push(lead);
      used.add(le);
      const team = memberRows
        .filter((m) => {
          const mgr = (m.manager_email || "").toLowerCase();
          return (
            mgr === le ||
            (mgr && le && mgr.split("@")[0] === le.split("@")[0])
          );
        })
        .sort((a, b) =>
          (a.display_name || a.email || "").localeCompare(
            b.display_name || b.email || "",
          ),
        );
      for (const t of team) {
        grouped.push(t);
        used.add((t.email || "").toLowerCase());
      }
    }
    for (const m of memberRows) {
      if (!used.has((m.email || "").toLowerCase())) grouped.push(m);
    }
    return grouped;
  }, [qaList, roster, selDomain, selTeam, selLead, search]);

  // Effective planned_code for a cell — considers pending changes first
  const cellPlan = (email, date) => {
    const key = `${email}__${date}`;
    if (Object.prototype.hasOwnProperty.call(pendingChanges, key)) {
      return pendingChanges[key];
    }
    return attMap[key]?.planned_code || null;
  };

  // Effective shift for a cell — pendingShifts wins, then DB row, else null.
  // Returns { start, end } in HH:MM form or null/{ start: null, end: null }
  // when clearing.
  const cellShift = (email, date) => {
    const key = `${email}__${date}`;
    if (Object.prototype.hasOwnProperty.call(pendingShifts, key)) {
      const v = pendingShifts[key];
      if (!v) return null;
      return { start: v.start, end: v.end };
    }
    const row = attMap[key];
    if (row?.shift_start && row?.shift_end) {
      return { start: String(row.shift_start).slice(0, 5), end: String(row.shift_end).slice(0, 5) };
    }
    return null;
  };

  // Click handler: empty → H → P → OFF → empty
  const cycleCell = (email, date) => {
    if (!isPlanEditableDate(date, undefined, { allowPast: isSuperAdmin })) return;
    const current = cellPlan(email, date);
    let next;
    if (current === null || current === undefined) next = "H";
    else if (current === "H") next = "P";
    else if (current === "P") next = "OFF";
    else next = null; // OFF → clear
    setPendingChanges((prev) => ({ ...prev, [`${email}__${date}`]: next }));
  };

  // Modal-driven bulk apply. Receives a fully-resolved set of dates and
  // QA emails from the modal — we just iterate and stage into pendingChanges.
  // The optional `valueChanged` flag lets the modal queue a shift-only
  // change without forcing a planned_code update (when the lead opens
  // the modal just to set a shift on existing planned cells).
  const applyBulkFromModal = ({ value, valueChanged = true, dates, qaEmails, shiftStart, shiftEnd, clearShift }) => {
    if (!Array.isArray(dates) || !Array.isArray(qaEmails)) return;
    const nextChanges = { ...pendingChanges };
    const nextShifts = { ...pendingShifts };
    const hasShift = !!(shiftStart && shiftEnd);
    // Defensive guard — bulk apply ALWAYS skips today's date so a stray
    // future-only schedule can't overwrite today's already-recorded
    // attendance row (which has its own status / approval lifecycle and
    // would error on the upsert). The modal's date picker also enforces
    // a `min={tomorrow}`; this is the belt-and-braces back-stop.
    const todayBulkSkip = riyadhTodayStr();
    let skippedTodayCount = 0;
    let planCount = 0;
    let shiftCount = 0;
    qaEmails.forEach((em) => {
      if (!em) return;
      dates.forEach((d) => {
        if (d === todayBulkSkip) { skippedTodayCount++; return; }
        if (!isPlanEditableDate(d, undefined, { allowPast: isSuperAdmin })) return;
        if (valueChanged) {
          nextChanges[`${em}__${d}`] = value; // null = clear plan
          planCount++;
        }
        if (clearShift) {
          nextShifts[`${em}__${d}`] = null;
          shiftCount++;
        } else if (hasShift) {
          nextShifts[`${em}__${d}`] = { start: shiftStart, end: shiftEnd };
          shiftCount++;
        }
      });
    });
    setPendingChanges(nextChanges);
    setPendingShifts(nextShifts);
    const total = planCount + shiftCount;
    if (total > 0) {
      const parts = [];
      if (planCount > 0) parts.push(`${planCount.toLocaleString()} plan cell${planCount !== 1 ? "s" : ""}`);
      if (shiftCount > 0) parts.push(`${shiftCount.toLocaleString()} shift cell${shiftCount !== 1 ? "s" : ""}`);
      const todayNote = skippedTodayCount > 0 ? ` · skipped today (${skippedTodayCount} cell${skippedTodayCount === 1 ? "" : "s"})` : "";
      globalToast("success", `Queued ${parts.join(" + ")}${todayNote} — click Save to commit.`);
    } else {
      globalToast("info", "Nothing to queue (all targeted cells were past, today, or unchanged).");
    }
  };

  const planChangeCount = Object.keys(pendingChanges).filter((k) => {
    const [em, dt] = k.split("__");
    const old = attMap[`${em}__${dt}`]?.planned_code || null;
    return pendingChanges[k] !== old;
  }).length;
  const shiftChangeCount = Object.keys(pendingShifts).filter((k) => {
    const [em, dt] = k.split("__");
    const row = attMap[`${em}__${dt}`];
    const oldStart = row?.shift_start ? String(row.shift_start).slice(0, 5) : null;
    const oldEnd = row?.shift_end ? String(row.shift_end).slice(0, 5) : null;
    const v = pendingShifts[k];
    const newStart = v?.start || null;
    const newEnd = v?.end || null;
    return oldStart !== newStart || oldEnd !== newEnd;
  }).length;
  const pendingCount = planChangeCount + shiftChangeCount;

  const discard = () => {
    if (pendingCount === 0) return;
    if (!window.confirm(`Discard ${pendingCount} unsaved change${pendingCount !== 1 ? "s" : ""}?`)) return;
    setPendingChanges({});
    setPendingShifts({});
  };

  // Save — upserts every changed row in batches.
  const save = async () => {
    if (pendingCount === 0) {
      globalToast("info", "No changes to save");
      return;
    }
    if (monthIsLocked) {
      globalToast("error", "Month is locked. Unlock first.");
      return;
    }
    setSaving(true);
    try {
      // Build rows to upsert. Combines plan and shift edits per-cell so a
      // cell that changed both gets a single round-trip. Each upserted row
      // only carries the columns that actually changed — merge-duplicates
      // preserves the rest.
      //
      // IMPORTANT: status is intentionally NOT auto-synced from
      // planned_code anymore (removed 2026-05-17 after it produced 356
      // phantom-P rows that fooled the check-in widget and the auto-
      // NSNC cron). The plan and the actual outcome are now fully
      // independent — only the QA's self-check-in (DailyCheckInWidget /
      // calendar cell) or the auto-NSNC cron writes `status`.
      const creator = profile?.email || myEmail;
      const todayStr = riyadhTodayStr();
      const allKeys = new Set([...Object.keys(pendingChanges), ...Object.keys(pendingShifts)]);
      const rows = [];
      const clearPlanIds = [];
      const clearShiftIds = [];
      allKeys.forEach((key) => {
        const [email, date] = key.split("__");
        const existing = attMap[key];
        const oldPlan = existing?.planned_code || null;
        const oldShiftStart = existing?.shift_start ? String(existing.shift_start).slice(0, 5) : null;
        const oldShiftEnd = existing?.shift_end ? String(existing.shift_end).slice(0, 5) : null;
        const planPending = Object.prototype.hasOwnProperty.call(pendingChanges, key);
        const newPlan = planPending ? pendingChanges[key] : oldPlan;
        const planChanged = planPending && newPlan !== oldPlan;
        const shiftPending = Object.prototype.hasOwnProperty.call(pendingShifts, key);
        const sv = shiftPending ? pendingShifts[key] : null;
        const newShiftStart = shiftPending ? (sv?.start || null) : oldShiftStart;
        const newShiftEnd = shiftPending ? (sv?.end || null) : oldShiftEnd;
        const shiftChanged = shiftPending && (newShiftStart !== oldShiftStart || newShiftEnd !== oldShiftEnd);
        if (!planChanged && !shiftChanged) return;

        // Pure clear-only on an existing row → PATCH (avoids needing
        // created_by on a row that already has it). Mixed changes go
        // through the merged upsert path below.
        if (existing) {
          if (planChanged && !shiftChanged && newPlan === null) {
            clearPlanIds.push(existing.id);
            return;
          }
          if (shiftChanged && !planChanged && newShiftStart === null && newShiftEnd === null) {
            clearShiftIds.push(existing.id);
            return;
          }
        }

        const row = { email, date, created_by: creator };
        if (planChanged) {
          row.planned_code = newPlan;
          // status auto-sync removed 2026-05-17 — see block comment above.
        }
        if (shiftChanged) {
          row.shift_start = newShiftStart;
          row.shift_end = newShiftEnd;
        }
        rows.push(row);
      });

      // Upsert merged plan + shift changes
      if (rows.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const resp = await fetch(`${SUPABASE_URL}/rest/v1/qa_attendance?on_conflict=email,date`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON,
              Authorization: `Bearer ${token}`,
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(batch),
          });
          if (!resp.ok) throw new Error(await resp.text());
        }
      }

      // PATCH the pure-clear rows in one shot per column.
      if (clearPlanIds.length > 0) {
        await sb.query("qa_attendance", {
          token,
          method: "PATCH",
          body: { planned_code: null },
          filters: `id=in.(${clearPlanIds.join(",")})`,
        });
      }
      if (clearShiftIds.length > 0) {
        await sb.query("qa_attendance", {
          token,
          method: "PATCH",
          body: { shift_start: null, shift_end: null },
          filters: `id=in.(${clearShiftIds.join(",")})`,
        });
      }

      const totalChanged = rows.length + clearPlanIds.length + clearShiftIds.length;
      const qaSet = new Set([...Object.keys(pendingChanges), ...Object.keys(pendingShifts)].map((k) => k.split("__")[0]));
      globalToast(
        "success",
        `Saved ${totalChanged} cell${totalChanged !== 1 ? "s" : ""} across ${qaSet.size} QA${qaSet.size !== 1 ? "s" : ""}. They'll see a bell notification.`,
      );
      setPendingChanges({});
      setPendingShifts({});
      onSaved?.();
    } catch (e) {
      globalToast("error", safeError(e));
    }
    setSaving(false);
  };

  if (!hasRole(profile?.role, "qa_lead")) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--tx3)" }}>
        Plan editor is available to QA Leads and above.
      </div>
    );
  }

  if (selMonth < PLAN_FEATURE_START.slice(0, 7)) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Plans start from May 2026</div>
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>
          Switch the month picker to May 2026 or later to start planning.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Super-admin backfill banner — surfaces the past-date override
          so it's obvious why cells normally locked are clickable, and
          so nobody mistakes it for a UI bug. */}
      {isSuperAdmin && (
        <div className="card" style={{
          padding: "8px 12px", marginBottom: 12,
          borderLeft: "3px solid var(--tabby-purple)",
          background: "rgba(106,44,121,.08)",
          display: "flex", alignItems: "center", gap: 10, fontSize: 12,
        }}>
          <span style={{ fontSize: 14 }}>🔓</span>
          <span style={{ color: "var(--tx)" }}>
            <strong>Super-admin backfill mode.</strong> You can edit any date from 2026-05-01 forward. Past-day edits update planned_code only — today's recorded status / approval lifecycle is still protected.
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <SearchableSelect options={domainOptions} value={selDomain} onChange={setSelDomain} placeholder="All domains" />
        <SearchableSelect options={teamOptions} value={selTeam} onChange={setSelTeam} placeholder={`All teams (${teamOptions.length})`} />
        <SearchableSelect options={leadOptions} value={selLead} onChange={setSelLead} placeholder={`All QA leads (${leadOptions.length})`} />
        <input
          className="input"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 220, fontSize: 12 }}
        />
        <span style={{ fontSize: 11, color: "var(--tx3)", marginLeft: "auto" }}>
          {visibleQAs.length} QA{visibleQAs.length !== 1 ? "s" : ""} visible
        </span>
      </div>

      {/* Bulk set — opens the modal for H/P/Off across selected days/weeks/QAs. */}
      <div
        className="card"
        style={{ padding: 12, marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderLeft: "3px solid var(--tabby-purple)" }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--tx)", textTransform: "uppercase", letterSpacing: ".5px" }}>
          📋 Bulk set
        </span>
        <span style={{ fontSize: 11, color: "var(--tx3)", flex: 1 }}>
          Apply H, P, or Off to any date range — pick specific weekdays (e.g. Sun + Tue) and/or specific weeks within the range.
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setBulkOpen(true)}
          style={{ fontSize: 12, fontWeight: 700, minWidth: 140 }}
        >
          Open bulk set
        </button>
        {/* Quick action: stamp the org-default 9:00–18:00 window onto
            every planned-P row in this month that doesn't already have
            shift times. Without shift_end set, the auto-NSNC cron skips
            the row entirely, so this is the one-click "turn on NSNC
            enforcement for this team this month" button. */}
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            const next = { ...pendingShifts };
            let touched = 0;
            for (const qa of visibleQAs) {
              const em = (qa.email || "").toLowerCase();
              for (const d of days) {
                if (!isPlanEditableDate(d.date, undefined, { allowPast: isSuperAdmin })) continue;
                // Determine the planned status for this cell — pending change wins, then DB row.
                const key = `${em}__${d.date}`;
                const dbRow = attendance.find(a => a.email?.toLowerCase() === em && a.date === d.date);
                let planned = dbRow?.planned_code;
                if (Object.prototype.hasOwnProperty.call(pendingChanges, key)) planned = pendingChanges[key];
                if (planned !== "P") continue;
                // Skip if shifts are already set (DB or pending)
                const existingShift = (() => {
                  if (Object.prototype.hasOwnProperty.call(pendingShifts, key)) return pendingShifts[key];
                  if (dbRow?.shift_start && dbRow?.shift_end) return { start: String(dbRow.shift_start).slice(0,5), end: String(dbRow.shift_end).slice(0,5) };
                  return null;
                })();
                if (existingShift) continue;
                next[key] = { start: "09:00", end: "18:00" };
                touched++;
              }
            }
            setPendingShifts(next);
            globalToast("success", `Default 9:00–18:00 shift queued for ${touched} planned-P cell${touched === 1 ? "" : "s"} · click Save to commit`);
          }}
          style={{ fontSize: 11, fontWeight: 600 }}
          title="Stamp 9:00–18:00 shift on every planned-P cell that has no shift set. Required for auto-NSNC enforcement."
        >
          ⏱ Apply default 9:00–18:00 to planned-P
        </button>
      </div>

      <AttendancePlanBulkModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        visibleQAs={visibleQAs}
        isSuperAdmin={isSuperAdmin}
        // qa_lead+ can now set bulk shift_start/shift_end times.
        // Previously gated to super_admin; widened so every lead can
        // turn on auto-NSNC enforcement for their team.
        canEditShift={hasRole(profile?.role, "qa_lead")}
        onApply={applyBulkFromModal}
      />

      {/* Save bar — sticky for visibility */}
      <div
        style={{
          position: "sticky",
          top: 8,
          zIndex: 5,
          background: "var(--bg2)",
          borderRadius: 8,
          padding: "8px 12px",
          marginBottom: 12,
          border: `1px solid ${pendingCount > 0 ? "var(--amber)" : "var(--bd2)"}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {pendingCount > 0 ? `${pendingCount} unsaved change${pendingCount !== 1 ? "s" : ""}` : "All changes saved"}
        </span>
        <span style={{ fontSize: 11, color: "var(--tx3)", marginRight: "auto" }}>
          Click cells to cycle: empty → 🏠 → 🏢 → empty. Past days are read-only.
        </span>
        {pendingCount > 0 && (
          <button className="btn btn-outline btn-sm" onClick={discard}>
            Discard
          </button>
        )}
        <button
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={pendingCount === 0 || saving}
          style={{ minWidth: 100 }}
        >
          {saving ? "Saving…" : `Save${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
        </button>
      </div>

      {/* Grid */}
      <div className="table-wrap" style={{ maxHeight: "65vh", overflow: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg2)", zIndex: 3 }}>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "var(--bg2)", zIndex: 4, minWidth: 200, textAlign: "left", padding: "8px 12px" }}>
                QA
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  style={{
                    minWidth: 36,
                    textAlign: "center",
                    padding: "4px 2px",
                    fontSize: 10,
                    color: d.isWeekend ? "var(--tx3)" : "var(--tx2)",
                    background: d.isWeekend ? "var(--bg3)" : "var(--bg2)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{d.day}</div>
                  <div style={{ fontSize: 9, opacity: 0.7 }}>{d.weekdayShort}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleQAs.map((qa) => {
              const em = qa.email?.toLowerCase();
              return (
                <tr key={em}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      background: qa.__isLead ? "rgba(106,44,121,.10)" : "var(--bg)",
                      zIndex: 2,
                      padding: "6px 12px",
                      fontSize: 12,
                      borderRight: "1px solid var(--bd2)",
                      borderLeft: qa.__isLead ? "3px solid var(--tabby-purple)" : "none",
                    }}
                  >
                    <div style={{ fontWeight: qa.__isLead ? 800 : 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {nameFromEmail(em)}
                      {qa.__isLead && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(60,255,165,.18)", color: "#3CFFA5", letterSpacing: ".4px", textTransform: "uppercase" }}>
                          Lead
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--tx3)" }}>{em}</div>
                  </td>
                  {days.map((d) => {
                    // Fri/Sat are styled lighter but still editable —
                    // some QAs work weekends.
                    const editable = isPlanEditableDate(d.date, undefined, { allowPast: isSuperAdmin });
                    const planned = cellPlan(em, d.date);
                    const original = attMap[`${em}__${d.date}`]?.planned_code || null;
                    const isPending = planned !== original;
                    // Show shift times to every viewer (was super_admin
                    // only). With auto-NSNC enforcement gated on
                    // shift_end being set, leads need to see at a glance
                    // which of their planned-P cells will trigger NSNC
                    // versus which are still in the "no shift, no
                    // enforcement" loose mode.
                    const shift = cellShift(em, d.date);
                    const cellKey = `${em}__${d.date}`;
                    const origRow = attMap[cellKey];
                    const origShiftStart = origRow?.shift_start ? String(origRow.shift_start).slice(0, 5) : null;
                    const origShiftEnd = origRow?.shift_end ? String(origRow.shift_end).slice(0, 5) : null;
                    const isShiftPending = Object.prototype.hasOwnProperty.call(pendingShifts, cellKey)
                      && ((shift?.start || null) !== origShiftStart || (shift?.end || null) !== origShiftEnd);
                    let bg = "transparent";
                    let txt = "";
                    let txtColor = "var(--tx2)";
                    if (planned === "H") {
                      bg = "rgba(59,130,246,.18)";
                      txt = "H";
                      txtColor = "#3B82F6";
                    } else if (planned === "P") {
                      bg = "rgba(34,197,94,.18)";
                      txt = "P";
                      txtColor = "#16A34A";
                    } else if (planned === "OFF") {
                      bg = "rgba(156,163,175,.20)";
                      txt = "OFF";
                      txtColor = "var(--tx3)";
                    }
                    // Weekend gets a subtler background only when nothing
                    // is planned — once a plan is set the H/P color wins.
                    if (d.isWeekend && !planned) bg = "var(--bg3)";
                    const shiftLabel = shift ? `${shift.start.replace(":00", "")}–${shift.end.replace(":00", "")}` : "";
                    const titleBase =
                      !editable
                        ? "Past day — read-only"
                        : planned === "H"
                          ? `H — Work from Home${d.isWeekend ? " (weekend)" : ""}. Click for P (Office).`
                          : planned === "P"
                            ? `P — Office${d.isWeekend ? " (weekend)" : ""}. Click for OFF (planned off-day).`
                            : planned === "OFF"
                              ? `OFF — Planned off-day${d.isWeekend ? " (weekend)" : ""}. Click to clear.`
                              : `Click to set H (Home)${d.isWeekend ? " (weekend day)" : ""}`;
                    const title = shift ? `${titleBase} · Shift ${shift.start}–${shift.end}` : titleBase;
                    return (
                      <td
                        key={d.date}
                        onClick={() => editable && cycleCell(em, d.date)}
                        title={title}
                        style={{
                          textAlign: "center",
                          padding: shift ? "2px 0" : 0,
                          height: shift ? 44 : 36,
                          background: bg,
                          cursor: editable ? "pointer" : "default",
                          opacity: editable ? 1 : 0.55,
                          border: "1px solid var(--bd2)",
                          outline: (isPending || isShiftPending) ? "2px dashed var(--amber)" : "none",
                          outlineOffset: -2,
                          fontSize: planned === "OFF" ? 11 : 13,
                          fontWeight: 700,
                          color: txtColor,
                          userSelect: "none",
                          position: "relative",
                          letterSpacing: planned === "OFF" ? ".3px" : 0,
                          lineHeight: 1.1,
                        }}
                      >
                        {txt}
                        {shift && (
                          <div style={{ fontSize: 8, color: "var(--tabby-purple)", fontWeight: 600, marginTop: 1, letterSpacing: ".2px" }}>
                            {shiftLabel}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {visibleQAs.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} style={{ padding: 24, textAlign: "center", color: "var(--tx3)" }}>
                  No QAs match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
