// MTD column metadata used by ScoreEntryPage and the MTD upload modal.
// Kept here so the page file stays focused on routing/filter UX and
// future consumers (e.g. an export utility) can reuse the same labels.

// Columns auto-managed by the database — never offered as user-editable
// upload targets and stripped before downloading the template.
export const SYSTEM_COLS = ["id", "synced_at", "manual_fields", "qa_email", "month", "qa_tl"];

// Default upload-target column list when there's no MTD data loaded yet
// (cold-start). Once data exists, ScoreEntryPage derives the real list
// from the row keys minus SYSTEM_COLS.
export const DEFAULT_MTD_COLS = [
  "sbs", "non_sbs", "dsat", "late_count", "never_count", "valid_count", "invalid_count", "side_tasks_duration_mins",
  "coaching_sessions", "total_coachings_by_coaching_created_date", "total_coachings_by_eval_created_date",
  "total_ontime_coachings", "coaching_eligibility_count", "not_coached", "rtr_count", "avg_rtr_score",
  "observed_coaching_count", "avg_observation_score_pct", "calibration_count", "avg_calibration_match_rate",
  "coaching_completion_pct", "ontime_coaching_pct", "jkq_score", "jkq_result", "jkq_episode",
  "working_days", "ramadan_wds", "occupancy_pct", "coaching_ontime_score", "ticket_per_day",
  "occupancy_score", "calibration_score", "coaching_observation_score", "rtr_score", "final_performance",
  "csat_pct", "csat_total", "csat_good", "csat_bad",
];

// Friendly labels for the MTD column keys. Anything missing falls back
// to the raw key in the UI.
export const COL_LABELS = {
  sbs: "SBS", non_sbs: "Non-SBS", dsat: "DSAT", late_count: "Late count", never_count: "Never count",
  valid_count: "Valid count", invalid_count: "Invalid count", side_tasks_duration_mins: "Side tasks (mins)",
  coaching_sessions: "Coaching sessions", total_coachings_by_coaching_created_date: "Total coachings (by coaching date)",
  total_coachings_by_eval_created_date: "Total coachings (by eval date)", total_ontime_coachings: "On-time coachings",
  coaching_eligibility_count: "Coaching eligibility", not_coached: "Not coached", rtr_count: "RTR count",
  avg_rtr_score: "RTR score", observed_coaching_count: "Observed coaching count",
  avg_observation_score_pct: "Coaching observation %", calibration_count: "Calibration count",
  avg_calibration_match_rate: "Calibration match rate", coaching_completion_pct: "Coaching completion %",
  ontime_coaching_pct: "On-time coaching %", jkq_score: "JKQ score", jkq_result: "JKQ result", jkq_episode: "JKQ episode",
  working_days: "Working days", ramadan_wds: "Ramadan WDs", occupancy_pct: "Occupancy %",
  coaching_ontime_score: "Coaching on-time score", ticket_per_day: "Tickets/day", occupancy_score: "Occupancy score",
  calibration_score: "Calibration score", coaching_observation_score: "CO score", rtr_score: "RTR score (calc)",
  final_performance: "Final performance", csat_pct: "CSAT %", csat_total: "Surveys", csat_good: "CSAT good", csat_bad: "CSAT bad",
};
