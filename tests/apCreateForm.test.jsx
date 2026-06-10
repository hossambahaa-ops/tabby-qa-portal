import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import APCreateForm from '../src/components/actionplan/APCreateForm.jsx';

const noop = () => {};
const baseProps = {
  selQaEmail: 'munirah',
  planType: 'pip', planDuration: 8, planStartDate: '', planReason: '',
  planTargets: [], selectedKpis: [], followUpMode: 'weekly', customMetrics: [],
  loading: false,
  roster: [
    { email: 'qa.one@tabby.sa', display_name: 'QA One' },
    { email: 'munirah.alfhaid.97@tabby.sa', display_name: 'munirah alfhaid', roleLabel: 'Lead' },
  ],
  mtd: [], KPI_SLABS: {},
  handleQaEmailChange: noop, setPlanType: noop, setPlanDuration: noop, setPlanStartDate: noop,
  setPlanReason: noop, setPlanTargets: noop, setFollowUpMode: noop, setCustomMetrics: noop,
  toggleKpi: noop, addCustomMetric: noop, removeCustomMetric: noop, savePlan: noop, onCancel: noop,
  nameFromEmail: (e) => (e || '').split('@')[0], parseRaw: () => null,
};

describe('APCreateForm picker', () => {
  it('suggests an in-scope lead with a role badge when typing their name', () => {
    const { getByText } = render(<APCreateForm {...baseProps} />);
    expect(getByText('munirah.alfhaid.97@tabby.sa')).toBeTruthy(); // lead now appears
    expect(getByText('Lead')).toBeTruthy();                         // role badge shown
  });
});
