// Regression guard for the QA self-service dashboard.
//
// On 2026-09-08 this widget crashed the whole Dashboard route with
// "whTarget is not defined". The occupancy refactor (dba1ac0) replaced the
// local duration constants with `ratesFrom()`, deleting `whTarget` but leaving
// three references to it — in the pace comparison and the working-hours tile.
// Nothing caught it: `vite build` does not resolve identifiers, there is no
// ESLint in this repo, and no test rendered the component. A ReferenceError at
// render time takes down the error boundary for every QA-role user.
//
// So the point of this file is coverage, not assertions: rendering the
// component AT ALL is what proves no identifier went missing. Keep the props
// realistic enough that the metric branches actually execute.

import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('../src/lib/supabase.js', () => ({
  sb: vi.fn(() => Promise.resolve([])),
  dataCache: { get: () => null, set: () => {}, clear: () => {} },
}));
vi.mock('../src/lib/AppContext.jsx', () => ({ useApp: () => ({ token: 'test-token' }) }));
vi.mock('../src/api/teamTargets.js', () => ({
  listTeamTargets: () => Promise.resolve([
    { team_name: 'Default', domain: 'all', metric: 'daily_working_hours', target_value: '8' },
    { team_name: 'Default', domain: 'all', metric: 'daily_sbs', target_value: '3' },
    { team_name: 'Default', domain: 'all', metric: 'daily_non_sbs', target_value: '10' },
  ]),
}));

import QASelfServiceDashboard from '../src/components/dashboard/QASelfServiceDashboard.jsx';

const baseProps = {
  myEmail: 'qa.person@tabby.ai',
  roster: [{ email: 'qa.person@tabby.ai', queue: 'Default', display_name: 'QA Person' }],
  ranked: [],
  myRank: null,
  maxScore: 55,
  getScore: () => 0,
  latestMonth: 'Sep-2026',
  myData: null,
};

// A day with work logged in every bucket the occupancy maths reads, so the
// shift-length, pace and working-hours branches all evaluate.
const workedDay = {
  qa_email: 'qa.person@tabby.ai',
  sbs_count: 2,
  non_sbs_count: 6,
  coaching_count: 1,
  side_task_minutes: 45,
  login_hours: 3.5,
  tickets_handled: 12,
  csat_score: 82,
  apt: 9.4,
  agpt: 11.2,
};

describe('QASelfServiceDashboard', () => {
  it('renders a worked day without throwing', async () => {
    const { container } = render(
      <QASelfServiceDashboard {...baseProps} dailyScores={[workedDay]} />
    );
    await waitFor(() => expect(container.textContent.length).toBeGreaterThan(0));
  });

  it('renders the not-started state when there is no row for today', async () => {
    const { container } = render(<QASelfServiceDashboard {...baseProps} dailyScores={[]} />);
    await waitFor(() => expect(container.textContent).toContain('Start your day'));
  });

  it('shows the shift length resolved from daily_working_hours', async () => {
    const { container } = render(
      <QASelfServiceDashboard {...baseProps} dailyScores={[workedDay]} />
    );
    // `whTarget` feeds this label. If it is undefined the render throws before
    // this ever appears, which is exactly the bug being guarded against.
    await waitFor(() => expect(container.textContent).toContain('8h shift'));
  });
});
