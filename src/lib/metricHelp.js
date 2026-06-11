// One-line explanations for every QA metric that appears in the UI.
// Used by HelpTip across Dashboard, Leaderboard, Score Entry, QA Profile,
// and the standalone Glossary page. Keep the wording tight — the
// tooltip box is ~220px wide.
//
// When adding a new metric to the app, register it here too so the
// glossary stays in sync and the tooltips don't drift.
export const metricHelp = {
  // Composite / rankings
  score:        "Composite monthly score — sum of all KPI sub-scores (Coaching, Calibration, RTR, Observation, Occupancy). Higher is better. Slabs drive what counts as Green / Amber / Red.",
  rank:         "Position by MTD score across the visible team for this month. Lower number = better. Ranks reshuffle live as data syncs.",
  jkq:          "Justified Knowledge Quiz — periodic skills test. Score and Pass/Fail are surfaced here; failing usually triggers re-training.",

  // CSAT family
  csat:         "% of customer survey responses rated positive (Good / Neutral) divided by total responses this month. 'No surveys' shows as '—' so a single bad rating doesn't tank the average.",
  csat_total:   "Number of CSAT survey responses received this month — both Good and Bad combined.",
  dsat:         "Count of dissatisfied (Bad) customer survey responses this month. Lower is better. Each DSAT typically triggers a coaching review.",

  // Productivity
  occupancy:    "% of paid working time spent on ticket / coaching work (vs idle or non-coded time). Target band is set per team; red below ~75%, green above ~88%.",
  ticket_per_day: "Average customer tickets handled per working day this month. Calculated as total tickets ÷ effective working days (deducts approved leave).",
  side_tasks:   "Hours spent on internal side tasks (training, projects, audits). Side-task hours are tracked separately so they don't deflate Occupancy.",
  pending_side: "Side-task hours submitted by the QA but not yet approved by their lead. These count toward Occupancy once approved.",
  working_days: "Working days counted this month, after subtracting approved leave (AL / Paid SL / PH) and public holidays.",
  wd_payable:   "Working Days Payable — sum of present (P), home (H), OT, PH, CDO days. Used by Finance for payroll. AL / SL / NSNC / OFF are excluded.",

  // Coaching
  coaching_pct: "% of coachings completed on time this month. Counts Weekly One-on-Ones and Monthly Performance Reviews. Skips QAs on full-period leave.",
  sbs:          "Side-by-Side — live ticket walk-through with the QA. Counted per session completed.",
  rtr:          "Real-Time Review — lead reviews tickets the QA is handling live and flags issues during the shift. Score is the average across the month's RTRs.",
  observation:  "Coaching Observation — a peer or supervisor sits in on the QA's coaching sessions and rates Empathy / Clarity / Specificity. Shows as %.",
  calibration:  "Calibration — alignment exercise where multiple leads grade the same ticket; score = how close the QA was to the calibrated answer.",

  // Attendance
  adherence:    "% of working days where the QA's actual attendance matched their planned location (P = Office, H = Home). AL / SL / PH and NSNC are excluded from both sides of the ratio.",
  attendance_health: "% of scheduled working days where the QA showed up (not absent / NSNC). Counts H, P, OT, PH, CDO as healthy. AL / SL / Maternity etc. are excluded.",
  nsnc:         "No Show, No Call — the QA was planned to work but didn't check in by shift_end + 1h. Auto-marked by the cron when enforcement is on, manually settable by leads.",
  shift_end:    "Latest clock-out time for the QA's shift. shift_end + 1 hour grace is the cutoff for the auto-NSNC sweep.",
  planned_code: "Lead-set expectation for the day: P (Office), H (Home), LD (Login Day — the QA's designated come-online day), OFF (Day off). What the QA actually does goes in 'status'.",
  checked_in_at: "Timestamp of the QA's own H/P check-in (via the Dashboard tile or calendar cell). NULL means they haven't checked in.",
};

// Convenience lookup with fallback so a missing key doesn't render
// an empty tooltip box.
export const helpFor = (key) => metricHelp[key] || "";
