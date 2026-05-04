import React, { useState, useMemo, useEffect } from "react";
import { sb, SUPABASE_URL, SUPABASE_ANON } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { nameFromEmail, safeError, emailsMatchLoose } from "../../lib/utils.js";
import { hasRole } from "../../lib/constants.js";
import { isPlanEditableDate, PLAN_FEATURE_START } from "../../lib/attendancePlan.js";
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
export default function AttendancePlanGrid({ attendance, qaList, roster, selMonth, onSaved, monthIsLocked }) {
  const { token, profile, globalToast } = useApp();
  const myEmail = profile?.email?.toLowerCase() || "";

  // Filter UI: domain → team → QA Lead → search
  const [selDomain, setSelDomain] = useState("");
  const [selTeam, setSelTeam] = useState("");
  const [selLead, setSelLead] = useState("");
  const [search, setSearch] = useState("");

  // pendingChanges: { [email__date]: 'H' | 'P' | null }  (null = clear)
  const [pendingChanges, setPendingChanges] = useState({});
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
      list = list.filter((q) => leadEmails.has(q.email?.toLowerCase()));
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (qa) =>
          (qa.email || "").toLowerCase().includes(q) ||
          nameFromEmail(qa.email).toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
  }, [qaList, roster, selDomain, selTeam, selLead, search]);

  // Effective planned_code for a cell — considers pending changes first
  const cellPlan = (email, date) => {
    const key = `${email}__${date}`;
    if (Object.prototype.hasOwnProperty.call(pendingChanges, key)) {
      return pendingChanges[key];
    }
    return attMap[key]?.planned_code || null;
  };

  // Click handler: empty → H → P → OFF → empty
  const cycleCell = (email, date) => {
    if (!isPlanEditableDate(date)) return;
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
  const applyBulkFromModal = ({ value, dates, qaEmails }) => {
    if (!Array.isArray(dates) || !Array.isArray(qaEmails)) return;
    const next = { ...pendingChanges };
    let count = 0;
    qaEmails.forEach((em) => {
      if (!em) return;
      dates.forEach((d) => {
        if (!isPlanEditableDate(d)) return;
        next[`${em}__${d}`] = value; // null = clear plan
        count++;
      });
    });
    setPendingChanges(next);
    if (count > 0) {
      globalToast(
        "success",
        `Queued ${count.toLocaleString()} cell${count !== 1 ? "s" : ""} — click Save to commit.`,
      );
    } else {
      globalToast("info", "Nothing to queue (all targeted cells were past or unchanged).");
    }
  };

  const pendingCount = Object.keys(pendingChanges).filter((k) => {
    const [em, dt] = k.split("__");
    const old = attMap[`${em}__${dt}`]?.planned_code || null;
    return pendingChanges[k] !== old;
  }).length;

  const discard = () => {
    if (pendingCount === 0) return;
    if (!window.confirm(`Discard ${pendingCount} unsaved change${pendingCount !== 1 ? "s" : ""}?`)) return;
    setPendingChanges({});
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
      // Build rows to upsert. We need email+date as PK and either set
      // planned_code to the new value or null. For null we do PATCH on
      // any existing row; for non-null we POST upsert. created_by is
      // NOT NULL on the table, so we must include it on inserts — for
      // upserts that hit an existing row, the merge-duplicates
      // resolution preserves the original created_by anyway.
      const creator = profile?.email || myEmail;
      const rows = [];
      const clears = [];
      Object.entries(pendingChanges).forEach(([key, value]) => {
        const [email, date] = key.split("__");
        const existing = attMap[key];
        const oldVal = existing?.planned_code || null;
        if (value === oldVal) return;
        if (value === null) {
          if (existing) clears.push({ id: existing.id });
        } else {
          rows.push({ email, date, planned_code: value, created_by: creator });
        }
      });

      // Upsert non-null plans
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

      // Clear plans on rows that should now be empty
      if (clears.length > 0) {
        const ids = clears.map((c) => c.id);
        await sb.query("qa_attendance", {
          token,
          method: "PATCH",
          body: { planned_code: null },
          filters: `id=in.(${ids.join(",")})`,
        });
      }

      const totalChanged = rows.length + clears.length;
      const qaSet = new Set(Object.keys(pendingChanges).map((k) => k.split("__")[0]));
      globalToast(
        "success",
        `Saved ${totalChanged} cell${totalChanged !== 1 ? "s" : ""} across ${qaSet.size} QA${qaSet.size !== 1 ? "s" : ""}. They'll see a bell notification.`,
      );
      setPendingChanges({});
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
      </div>

      <AttendancePlanBulkModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        visibleQAs={visibleQAs}
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
                      background: "var(--bg)",
                      zIndex: 2,
                      padding: "6px 12px",
                      fontSize: 12,
                      borderRight: "1px solid var(--bd2)",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{nameFromEmail(em)}</div>
                    <div style={{ fontSize: 10, color: "var(--tx3)" }}>{em}</div>
                  </td>
                  {days.map((d) => {
                    // Fri/Sat are styled lighter but still editable —
                    // some QAs work weekends.
                    const editable = isPlanEditableDate(d.date);
                    const planned = cellPlan(em, d.date);
                    const original = attMap[`${em}__${d.date}`]?.planned_code || null;
                    const isPending = planned !== original;
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
                    return (
                      <td
                        key={d.date}
                        onClick={() => editable && cycleCell(em, d.date)}
                        title={
                          !editable
                            ? "Past day — read-only"
                            : planned === "H"
                              ? `H — Work from Home${d.isWeekend ? " (weekend)" : ""}. Click for P (Office).`
                              : planned === "P"
                                ? `P — Office${d.isWeekend ? " (weekend)" : ""}. Click for OFF (planned off-day).`
                                : planned === "OFF"
                                  ? `OFF — Planned off-day${d.isWeekend ? " (weekend)" : ""}. Click to clear.`
                                  : `Click to set H (Home)${d.isWeekend ? " (weekend day)" : ""}`
                        }
                        style={{
                          textAlign: "center",
                          padding: 0,
                          height: 36,
                          background: bg,
                          cursor: editable ? "pointer" : "default",
                          opacity: editable ? 1 : 0.55,
                          // Always 1px solid border so the cell box-size
                          // never changes when toggling pending state. The
                          // amber dashed pending hint is layered as an
                          // outline (zero layout cost) instead.
                          border: "1px solid var(--bd2)",
                          outline: isPending ? "2px dashed var(--amber)" : "none",
                          outlineOffset: -2,
                          fontSize: planned === "OFF" ? 11 : 13,
                          fontWeight: 700,
                          color: txtColor,
                          userSelect: "none",
                          position: "relative",
                          letterSpacing: planned === "OFF" ? ".3px" : 0,
                        }}
                      >
                        {txt}
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
