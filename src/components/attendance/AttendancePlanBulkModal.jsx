import React, { useState, useEffect, useMemo } from "react";
import SearchableSelect from "../SearchableSelect.jsx";
import { nameFromEmail } from "../../lib/utils.js";
import { PLAN_FEATURE_START } from "../../lib/attendancePlan.js";

// Day-of-week labels — index matches Date.getDay() (0=Sun..6=Sat).
const DOW = [
  { idx: 0, label: "Sun", full: "Sunday" },
  { idx: 1, label: "Mon", full: "Monday" },
  { idx: 2, label: "Tue", full: "Tuesday" },
  { idx: 3, label: "Wed", full: "Wednesday" },
  { idx: 4, label: "Thu", full: "Thursday" },
  { idx: 5, label: "Fri", full: "Friday" },
  { idx: 6, label: "Sat", full: "Saturday" },
];

// Generate the weeks (Sun→Sat) that overlap with [from, to]. Each entry
// is { start, end, label, dates: [...] } where dates only contain those
// inside the original range.
function getWeeksInRange(fromStr, toStr) {
  if (!fromStr || !toStr || fromStr > toStr) return [];
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  const out = [];
  const cur = new Date(from);
  cur.setDate(cur.getDate() - cur.getDay()); // walk back to Sunday
  while (cur <= to) {
    const wkEnd = new Date(cur);
    wkEnd.setDate(wkEnd.getDate() + 6);
    const dates = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(cur);
      day.setDate(day.getDate() + d);
      if (day >= from && day <= to) {
        dates.push(day.toISOString().split("T")[0]);
      }
    }
    if (dates.length > 0) {
      const fmt = (dt) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      out.push({
        startStr: dates[0],
        endStr: dates[dates.length - 1],
        label: `${fmt(new Date(dates[0]+"T00:00:00"))} – ${fmt(new Date(dates[dates.length-1]+"T00:00:00"))}`,
        dates,
      });
    }
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

/**
 * <AttendancePlanBulkModal open onClose visibleQAs onApply />
 *
 * Modal-driven bulk planner. Mirrors the AttendanceBulkModal pattern but
 * scoped to the plan layer (H/P/Off) and adds two extras the user asked
 * for: arbitrary weekday selection (any combination) and per-week
 * selection within the date range.
 *
 * onApply receives:
 *   { value: 'H'|'P'|null, dates: string[], qaEmails: string[], scope }
 * dates are already filtered by weekday + week filters and bounded to
 * [PLAN_FEATURE_START..]; the caller just maps QAs × dates.
 */
export default function AttendancePlanBulkModal({ open, onClose, visibleQAs, onApply }) {
  const [value, setValue] = useState("P");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState(new Set([0, 1, 2, 3, 4])); // Sun-Thu by default (Saudi work week)
  const [selectedWeeks, setSelectedWeeks] = useState(new Set()); // empty = all
  const [scope, setScope] = useState("visible");
  const [specificEmail, setSpecificEmail] = useState("");

  // Default the from/to to the current month when opening
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    if (!from) setFrom(`${y}-${m}-01`);
    if (!to) setTo(`${y}-${m}-${String(lastDay).padStart(2, "0")}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const weeks = useMemo(() => getWeeksInRange(from, to), [from, to]);

  // Reset week selection if the weeks list changes (and any chosen
  // weeks are no longer in the new range).
  useEffect(() => {
    setSelectedWeeks((prev) => {
      const valid = new Set(weeks.map((w) => w.startStr));
      const next = new Set([...prev].filter((s) => valid.has(s)));
      return next;
    });
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  // ALL hooks must run on every render regardless of `open` to keep the
  // hook order stable across mounts (React error #310 otherwise).
  // Targets — list of QA emails the modal will apply to.
  const targetEmails = useMemo(() => {
    if (scope === "specific") return specificEmail ? [specificEmail.toLowerCase()] : [];
    return (visibleQAs || []).map((q) => q.email?.toLowerCase()).filter(Boolean);
  }, [scope, specificEmail, visibleQAs]);

  if (!open) return null;

  const toggleDay = (idx) => {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const toggleWeek = (startStr) => {
    setSelectedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(startStr)) next.delete(startStr); else next.add(startStr);
      return next;
    });
  };

  // Quick presets — opinionated combos covering the common cases.
  const presetFullMonthSunThu = () => {
    setValue("P");
    setDays(new Set([0, 1, 2, 3, 4]));
    setSelectedWeeks(new Set());
  };
  const presetHomeSunThu = () => {
    setValue("H");
    setDays(new Set([0, 1, 2, 3, 4]));
    setSelectedWeeks(new Set());
  };
  const presetClearWeekend = () => {
    setValue("OFF");
    setDays(new Set([5, 6]));
    setSelectedWeeks(new Set());
  };

  const computeDates = () => {
    if (!from || !to) return [];
    const all = [];
    const ws = selectedWeeks.size === 0 ? weeks : weeks.filter((w) => selectedWeeks.has(w.startStr));
    const minDate = PLAN_FEATURE_START;
    for (const w of ws) {
      for (const d of w.dates) {
        if (d < minDate) continue;
        const dt = new Date(d + "T00:00:00");
        if (!days.has(dt.getDay())) continue;
        all.push(d);
      }
    }
    return all;
  };
  const dateCount = computeDates().length;

  const apply = () => {
    const dates = computeDates();
    if (dates.length === 0 || targetEmails.length === 0) return;
    onApply?.({
      value: value === "OFF" ? null : value,
      dates,
      qaEmails: targetEmails,
    });
    onClose?.();
  };

  const totalCells = dateCount * targetEmails.length;
  const canApply = !!value && from && to && dateCount > 0 && targetEmails.length > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg3)",
          borderRadius: 16,
          border: "1px solid var(--bd)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          overflow: "auto",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--tx)" }}>📋 Bulk set attendance plan</div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--tx3)" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Quick presets */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green)", fontWeight: 600 }}
            onClick={presetFullMonthSunThu}
          >
            Set P for Sun–Thu
          </button>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, background: "rgba(59,130,246,.12)", color: "var(--blue)", border: "1px solid var(--blue)", fontWeight: 600 }}
            onClick={presetHomeSunThu}
          >
            Set H for Sun–Thu
          </button>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, background: "rgba(156,163,175,0.1)", color: "var(--tx2)", border: "1px solid var(--bd)", fontWeight: 600 }}
            onClick={presetClearWeekend}
          >
            Clear plan for Fri–Sat
          </button>
        </div>

        {/* From / To */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">From</label>
            <input
              type="date"
              className="form-input"
              value={from}
              min={PLAN_FEATURE_START}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">To</label>
            <input
              type="date"
              className="form-input"
              value={to}
              min={PLAN_FEATURE_START}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {/* Status (H/P/Off) */}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Status</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { code: "H", label: "H — Work from Home", color: "#3B82F6", bg: "rgba(59,130,246,.15)" },
              { code: "P", label: "P — Office", color: "#16A34A", bg: "rgba(34,197,94,.15)" },
              { code: "OFF", label: "Off — Clear plan", color: "var(--tx2)", bg: "rgba(156,163,175,.1)" },
            ].map((opt) => {
              const active = value === opt.code;
              return (
                <button
                  key={opt.code}
                  onClick={() => setValue(opt.code)}
                  className="btn btn-sm"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "8px 14px",
                    background: active ? opt.color : opt.bg,
                    color: active ? "#fff" : opt.color,
                    border: `1.5px solid ${opt.color}`,
                    flex: 1,
                    minWidth: 140,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day-of-week picker — any combination */}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Apply on days</span>
            <span style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setDays(new Set([0, 1, 2, 3, 4]))}
                style={{ fontSize: 10, padding: "2px 8px", background: "transparent", border: "1px solid var(--bd)", borderRadius: 4, cursor: "pointer", color: "var(--tx3)" }}
              >
                Sun–Thu
              </button>
              <button
                onClick={() => setDays(new Set([1, 2, 3, 4, 5]))}
                style={{ fontSize: 10, padding: "2px 8px", background: "transparent", border: "1px solid var(--bd)", borderRadius: 4, cursor: "pointer", color: "var(--tx3)" }}
              >
                Mon–Fri
              </button>
              <button
                onClick={() => setDays(new Set([0, 1, 2, 3, 4, 5, 6]))}
                style={{ fontSize: 10, padding: "2px 8px", background: "transparent", border: "1px solid var(--bd)", borderRadius: 4, cursor: "pointer", color: "var(--tx3)" }}
              >
                All
              </button>
              <button
                onClick={() => setDays(new Set())}
                style={{ fontSize: 10, padding: "2px 8px", background: "transparent", border: "1px solid var(--bd)", borderRadius: 4, cursor: "pointer", color: "var(--tx3)" }}
              >
                None
              </button>
            </span>
          </label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DOW.map((d) => {
              const checked = days.has(d.idx);
              return (
                <button
                  key={d.idx}
                  onClick={() => toggleDay(d.idx)}
                  className="btn btn-sm"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "6px 12px",
                    background: checked ? "var(--tabby-purple)" : "var(--bg)",
                    color: checked ? "#fff" : "var(--tx3)",
                    border: `1.5px solid ${checked ? "var(--tabby-purple)" : "var(--bd)"}`,
                    minWidth: 50,
                  }}
                  title={d.full}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Per-week selection */}
        {weeks.length > 0 && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Weeks {selectedWeeks.size === 0 ? "— all weeks in range" : `(${selectedWeeks.size}/${weeks.length})`}</span>
              <span style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setSelectedWeeks(new Set())}
                  style={{ fontSize: 10, padding: "2px 8px", background: "transparent", border: "1px solid var(--bd)", borderRadius: 4, cursor: "pointer", color: "var(--tx3)" }}
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedWeeks(new Set(weeks.map((w) => w.startStr)))}
                  style={{ fontSize: 10, padding: "2px 8px", background: "transparent", border: "1px solid var(--bd)", borderRadius: 4, cursor: "pointer", color: "var(--tx3)" }}
                >
                  Pick all
                </button>
              </span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto", border: "1px solid var(--bd2)", borderRadius: 6, padding: 6, background: "var(--bg)" }}>
              {weeks.map((w, i) => {
                const checked = selectedWeeks.size === 0 || selectedWeeks.has(w.startStr);
                return (
                  <label
                    key={w.startStr}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 8px",
                      cursor: "pointer",
                      background: selectedWeeks.has(w.startStr) ? "rgba(106,44,121,.1)" : "transparent",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedWeeks.has(w.startStr)}
                      onChange={() => toggleWeek(w.startStr)}
                      style={{ accentColor: "var(--tabby-purple)" }}
                    />
                    <span style={{ fontWeight: 600, color: "var(--tx)" }}>Week {i + 1}</span>
                    <span style={{ color: "var(--tx3)" }}>{w.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx3)" }}>
                      {w.dates.length} day{w.dates.length !== 1 ? "s" : ""}
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 4, fontStyle: "italic" }}>
              Leave all unchecked to apply to every week in range. Otherwise only the picked weeks count.
            </div>
          </div>
        )}

        {/* Scope */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Apply to</label>
            <select
              className="select form-input"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="visible">All visible QAs ({(visibleQAs || []).length})</option>
              <option value="specific">Specific person</option>
            </select>
          </div>
          {scope === "specific" && (
            <div className="form-group">
              <label className="form-label">Person</label>
              <SearchableSelect
                options={(visibleQAs || []).map((r) => ({ value: r.email, label: r.email + " — " + nameFromEmail(r.email) }))}
                value={specificEmail}
                onChange={setSpecificEmail}
                placeholder="Select person..."
              />
            </div>
          )}
        </div>

        {/* Summary + actions */}
        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg)",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 12,
            border: "1px solid var(--bd2)",
          }}
        >
          {canApply ? (
            <>
              Will queue <strong style={{ color: "var(--tx)" }}>{totalCells.toLocaleString()}</strong> cell change{totalCells !== 1 ? "s" : ""}{" "}
              ({dateCount} day{dateCount !== 1 ? "s" : ""} × {targetEmails.length} QA{targetEmails.length !== 1 ? "s" : ""}) — value:{" "}
              <strong style={{ color: value === "H" ? "var(--blue)" : value === "P" ? "var(--green)" : "var(--tx3)" }}>
                {value === "OFF" ? "Off (clear)" : value}
              </strong>. Click Apply to stage. Save (in the grid) commits to the database.
            </>
          ) : (
            <span style={{ color: "var(--tx3)" }}>
              Pick a status, date range, at least one weekday, and at least one QA target to enable Apply.
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={apply} disabled={!canApply}>
            Apply
          </button>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
