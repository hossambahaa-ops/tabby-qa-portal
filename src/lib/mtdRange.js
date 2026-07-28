// Roll up several months of a QA's mtd_scores rows into ONE row for a From→To
// month range. Counts SUM; rates are WEIGHTED (by the right denominator);
// score-style rates are RECOMPUTED from the summed parts; point-in-time fields
// (phase scores/status, quartile, calibration label) keep the LATEST month's
// value. Single-month ranges return the row unchanged (zero behaviour change).

const num = (v) => {
  if (v == null || v === "") return null;
  const x = parseFloat(String(v).replace("%", "").replace(",", "."));
  return isNaN(x) ? null : x;
};

// Additive fields (raw counts / minutes / hours).
const SUM_FIELDS = [
  "sbs", "non_sbs", "dsat", "late_count", "never_count", "valid_count", "invalid_count",
  "side_tasks_duration_mins", "coaching_sessions", "total_ontime_coachings",
  "coaching_eligibility_count", "not_coached", "rtr_count", "observed_coaching_count",
  "calibration_count", "working_days", "ramadan_wds", "csat_good", "csat_bad",
  "csat_total", "total_surveys", "tickets_touched", "login_hours",
  "abt_sbs_count", "abt_validation_count", "q_sessions", "q_session_deduct", "q_session_hours",
];

// rows = all rows for ONE QA within the range. monthsDesc = the page's month
// list (newest first) so we can pick the "latest" row for point-in-time fields.
export function rollupMtdRange(rows, monthsDesc) {
  if (!rows || rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  const idxOf = (m) => { const i = monthsDesc.indexOf(m); return i < 0 ? 9999 : i; };
  const latest = [...rows].sort((a, b) => idxOf(a.month) - idxOf(b.month))[0]; // smallest index = newest
  const out = { ...latest, _range: true, _rangeMonths: rows.length };

  for (const f of SUM_FIELDS) {
    let s = 0, any = false;
    for (const r of rows) { const v = num(r[f]); if (v != null) { s += v; any = true; } }
    out[f] = any ? +s.toFixed(2) : null;
  }

  // Weighted average with a graceful fallback to a plain mean.
  const wavg = (valF, wF) => {
    let n = 0, d = 0, sm = 0, cnt = 0;
    for (const r of rows) {
      const v = num(r[valF]); if (v == null) continue;
      sm += v; cnt++;
      const w = num(r[wF]) || 0; if (w > 0) { n += v * w; d += w; }
    }
    return d > 0 ? n / d : (cnt > 0 ? sm / cnt : null);
  };

  const evals = (out.sbs || 0) + (out.non_sbs || 0);
  const csGood = out.csat_good || 0, csBad = out.csat_bad || 0;

  out.csat_pct = (csGood + csBad) > 0 ? (csGood / (csGood + csBad) * 100).toFixed(2) + "%" : null;
  out.ticket_per_day = (out.working_days || 0) > 0 ? +(evals / out.working_days).toFixed(2) : num(latest.ticket_per_day);
  out.occupancy_pct = wavg("occupancy_pct", "working_days");
  out.abt = wavg("abt", "tickets_touched");
  out.avg_rtr_score = wavg("avg_rtr_score", "rtr_count");
  out.avg_observation_score_pct = wavg("avg_observation_score_pct", "observed_coaching_count");
  out.coaching_completion_pct = (out.coaching_eligibility_count || 0) > 0
    ? +((out.total_ontime_coachings || 0) / out.coaching_eligibility_count * 100).toFixed(2)
    : wavg("coaching_completion_pct", "coaching_eligibility_count");
  out.final_performance = wavg("final_performance", "working_days");
  // phase_1/2 score+status, csat_quartile, avg_calibration_match_rate, lob, qa_tl
  // all keep the latest month's value (carried by {...latest}).
  return out;
}

// Group all rows across a month range by QA and roll each QA up to one row.
export function aggregateMtdRange(rows, rangeMonths, monthsDesc, excludeEmails) {
  const inRange = new Set(rangeMonths);
  const byQa = new Map();
  for (const r of rows || []) {
    if (!inRange.has(r.month)) continue;
    const em = (r.qa_email || "").toLowerCase();
    if (!em || (excludeEmails && excludeEmails.has(em))) continue;
    (byQa.get(em) || byQa.set(em, []).get(em)).push(r);
  }
  const out = [];
  for (const list of byQa.values()) {
    const agg = rollupMtdRange(list, monthsDesc);
    if (agg) out.push(agg);
  }
  return out;
}
