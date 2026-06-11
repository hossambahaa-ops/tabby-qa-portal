import React, { useState } from "react";
import Modal from "../Modal.jsx";
import { sb, dataCache } from "../../lib/supabase.js";
import { useApp } from "../../lib/AppContext.jsx";
import { logActivity } from "../../lib/utils.js";

// Super-admin-only inline editor for the headline KPI columns on a
// single mtd_scores row. Wired into the QA Profile Performance card
// header.
//
// What it does, plain-English:
//   1. Shows one input per editable KPI column. The user types either a
//      raw number ("85") or a percent string ("85.5%"). We don't reformat
//      while they type.
//   2. On save, PATCHes mtd_scores with only the columns that actually
//      changed. The matching mtd_scores_v view passes those columns
//      through unchanged, so the overridden value becomes the official
//      number across Leaderboard / Dashboard / Profile / Compare without
//      any view rewrite.
//   3. Records every change in mtd_scores.manual_fields (JSONB) so we
//      have an audit trail of what was overridden, by whom, and when.
//      This trail is what lets us tell apart a synced number from a
//      manual override.
//   4. Logs to activity_log too, since super-admin overrides on KPIs
//      are sensitive.
//   5. Invalidates the dataCache key the dashboard / profile fetch from
//      so the new value lands without a hard reload.
//
// RLS does the real authorization: only super_admin can UPDATE
// mtd_scores. The role check here is just so the rest of the UI doesn't
// even render the button.

// Editable fields. Order matches how they appear on the QA Profile
// Performance card so the user's mental model stays consistent.
const FIELDS = [
  { key: "occupancy_pct",              label: "Occupancy %",        suffix: "%" },
  { key: "avg_rtr_score",              label: "RTR Score %",        suffix: "%" },
  { key: "ontime_coaching_pct",        label: "Coaching on-time %", suffix: "%" },
  { key: "avg_observation_score_pct",  label: "CO / Observation %", suffix: "%" },
  { key: "avg_calibration_match_rate", label: "Calibration %",      suffix: "%" },
  { key: "csat_pct",                   label: "CSAT %",             suffix: "%" },
  { key: "coaching_completion_pct",    label: "Coaching completion %", suffix: "%" },
  { key: "jkq_score",                  label: "JKQ score",          suffix: "",  numeric: true },
  { key: "final_performance",          label: "Final performance (0–1)", suffix: "", numeric: true,
    hint: "Decimal between 0 and 1 — e.g. 0.45 means 45%." },
];

export default function MtdAdjustModal({ row, onClose, onSaved }) {
  const { token, profile, globalToast } = useApp();
  const [vals, setVals] = useState(() => {
    const init = {};
    FIELDS.forEach(f => { init[f.key] = row?.[f.key] != null ? String(row[f.key]) : ""; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (key, v) => setVals(prev => ({ ...prev, [key]: v }));

  const save = async () => {
    if (!row?.id) return;
    // Diff: only PATCH the columns that actually changed.
    const patch = {};
    const audit = { ...(row.manual_fields || {}) };
    let changed = 0;
    for (const f of FIELDS) {
      const cur = row[f.key] != null ? String(row[f.key]) : "";
      const next = (vals[f.key] || "").trim();
      if (next === cur) continue;
      if (f.numeric) {
        const n = parseFloat(next);
        patch[f.key] = isNaN(n) ? null : n;
      } else {
        patch[f.key] = next === "" ? null : next;
      }
      audit[f.key] = {
        value: patch[f.key],
        prev: row[f.key] ?? null,
        by: profile?.email,
        at: new Date().toISOString(),
      };
      changed++;
    }
    if (changed === 0) {
      globalToast("info", "Nothing to save — no values changed.");
      onClose();
      return;
    }
    patch.manual_fields = audit;

    setSaving(true);
    try {
      await sb.query("mtd_scores", {
        token, method: "PATCH", body: patch,
        filters: `id=eq.${row.id}`,
      });
      logActivity(token, profile?.email, "mtd_adjust", "mtd_scores", row.id,
        `Month: ${row.month} · QA: ${row.qa_email} · Fields: ${Object.keys(patch).filter(k => k !== "manual_fields").join(",")}`);
      // Bust both the cached list and the per-row cache so consumers
      // re-fetch on next render. listMtd / useDashboardData / etc. read
      // from "mtd_scores" key.
      dataCache.invalidate("mtd_scores");
      globalToast("success", `Saved — ${changed} value${changed === 1 ? "" : "s"} updated.`);
      onSaved?.();
      onClose();
    } catch (e) {
      globalToast("error", `Save failed: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!row) return null;

  return (
    <Modal
      onClose={onClose}
      title={`Adjust MTD — ${row.qa_email} · ${row.month}`}
      maxWidth={620}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save & make official"}
          </button>
        </>
      }
    >
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: "var(--tx3)", marginBottom: 14 }}>
          Values you change here overwrite the synced number and become the official figure used by the Leaderboard, Dashboard, QA Profile and any KPI roll-ups. Each change is recorded in <code>manual_fields</code> with your email and the previous value, so we can always see what was overridden.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {FIELDS.map(f => {
            const original = row[f.key];
            const current = vals[f.key];
            const dirty = (current || "").trim() !== (original != null ? String(original) : "");
            return (
              <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <span style={{ color: "var(--tx2)", fontWeight: 600 }}>
                  {f.label}
                  {dirty && <span style={{ color: "var(--amber)", marginLeft: 6 }}>●</span>}
                </span>
                <input
                  className="form-input"
                  value={current}
                  onChange={e => handleChange(f.key, e.target.value)}
                  placeholder={original != null ? `Synced: ${original}${f.suffix}` : "—"}
                  inputMode={f.numeric ? "decimal" : "text"}
                />
                {f.hint && <span style={{ color: "var(--tx3)", fontSize: 10 }}>{f.hint}</span>}
                {original != null && (
                  <span style={{ color: "var(--tx3)", fontSize: 10 }}>
                    Synced value: <strong>{String(original)}{f.suffix}</strong>
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
