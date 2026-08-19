import React from "react";
import SearchableSelect from "../SearchableSelect.jsx";
import { ATTENDANCE_TYPES, pickerCodesForDate } from "../../lib/attendance.js";
import { hasRole } from "../../lib/constants.js";
import { nameFromEmail } from "../../lib/utils.js";
import Modal from "../Modal.jsx";

// Bulk-set attendance modal. Stateful inputs live on the parent
// (SchedulePage) so the same selection state can be reused by the
// "Apply to selected QAs" trigger from the team-selection banner.
export default function AttendanceBulkModal({
  open,
  onClose,
  bulkStatus, setBulkStatus,
  bulkDayFilter, setBulkDayFilter,
  bulkFrom, setBulkFrom,
  bulkTo, setBulkTo,
  bulkScope, setBulkScope,
  bulkPerson, setBulkPerson,
  selMonth,
  daysInMonth,
  isLead,
  profile,
  selectedQAs,
  visibleQAs,
  applyBulk,
}) {
  if (!open) return null;
  return (
    <Modal onClose={onClose} maxWidth={520} padding={20} title="Bulk set attendance">

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, background: bulkStatus === "P" && bulkDayFilter === "weekdays" ? "var(--green)" : "var(--green-bg)", color: bulkStatus === "P" && bulkDayFilter === "weekdays" ? "#fff" : "var(--green)", border: "1px solid var(--green)", fontWeight: 600 }}
            onClick={() => { setBulkStatus("P"); setBulkDayFilter("weekdays"); setBulkFrom(`${selMonth}-01`); setBulkTo(`${selMonth}-${String(daysInMonth).padStart(2, "0")}`); }}
          >Set P for Sun–Thu</button>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, background: bulkStatus === "OFF" && bulkDayFilter === "weekends" ? "var(--tx2)" : "rgba(156,163,175,0.1)", color: bulkStatus === "OFF" && bulkDayFilter === "weekends" ? "var(--bg3)" : "var(--tx2)", border: "1px solid var(--bd)", fontWeight: 600 }}
            onClick={() => { setBulkStatus("OFF"); setBulkDayFilter("weekends"); setBulkFrom(`${selMonth}-01`); setBulkTo(`${selMonth}-${String(daysInMonth).padStart(2, "0")}`); }}
          >Set OFF for Fri–Sat</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="form-group">
            <label className="form-label">From</label>
            <input type="date" className="form-input" value={bulkFrom} onChange={e => setBulkFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">To</label>
            <input type="date" className="form-input" value={bulkTo} onChange={e => setBulkTo(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            {/* Use the start of the range to decide which picker list to
                show. If the lead is bulk-setting May (or earlier), they
                still get the full granular list; June 1 onwards is the
                simplified 6-code set. */}
            <select className="select form-input" value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
              {pickerCodesForDate(bulkFrom).map(t => <option key={t.code} value={t.code}>{t.code} — {t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Apply on days</label>
            <select className="select form-input" value={bulkDayFilter} onChange={e => setBulkDayFilter(e.target.value)}>
              <option value="all">All days in range</option>
              <option value="weekdays">Sun–Thu only</option>
              <option value="weekends">Fri–Sat only</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Apply to</label>
            <select className="select form-input" value={bulkScope} onChange={e => setBulkScope(e.target.value)}>
              <option value="my_team">{isLead && !hasRole(profile?.role, "qa_supervisor") ? "My team (direct reports)" : hasRole(profile?.role, "qa_supervisor") ? "All QAs in my domain" : "All QAs"}</option>
              <option value="specific">Specific person</option>
              {selectedQAs.size > 0 && <option value="selected">Selected QAs ({selectedQAs.size})</option>}
            </select>
          </div>
          {bulkScope === "specific" && (
            <div className="form-group">
              <label className="form-label">Person</label>
              <SearchableSelect
                options={visibleQAs.map(r => ({ value: r.email, label: r.email + " — " + nameFromEmail(r.email) }))}
                value={bulkPerson}
                onChange={setBulkPerson}
                placeholder="Select person..."
              />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={applyBulk}>Apply</button>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
        </div>
    </Modal>
  );
}
