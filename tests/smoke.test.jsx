import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

import TabbyPulseWordmark from '../src/components/TabbyPulseWordmark.jsx';
import PulseMark from '../src/components/PulseMark.jsx';
import { hasRole, ROLE_LABELS, sortMonthsDesc } from '../src/lib/constants.js';

describe('TabbyPulseWordmark', () => {
  it('renders an SVG with role=img and aria-label', () => {
    const { container, getByRole } = render(<TabbyPulseWordmark height={32} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(getByRole('img').getAttribute('aria-label')).toBe('tabbyPulse');
  });

  it('honors a custom height prop and 4:1 aspect ratio', () => {
    const { container } = render(<TabbyPulseWordmark height={40} uid="t1" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('height')).toBe('40');
    expect(svg.getAttribute('width')).toBe('160');
  });

  it('namespaces gradient/filter ids per uid so multiple instances do not collide', () => {
    const { container } = render(
      <div>
        <TabbyPulseWordmark uid="alpha" />
        <TabbyPulseWordmark uid="beta" />
      </div>
    );
    expect(container.querySelector('#alpha-grad')).toBeTruthy();
    expect(container.querySelector('#beta-grad')).toBeTruthy();
  });

  it('skips the glow filter when not animated', () => {
    const { container } = render(<TabbyPulseWordmark uid="static" animated={false} />);
    expect(container.querySelector('#static-glow')).toBeFalsy();
  });
});

describe('PulseMark', () => {
  it('renders an SVG', () => {
    const { container } = render(<PulseMark size={24} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('lib/constants', () => {
  it('hasRole respects the role hierarchy', () => {
    expect(hasRole('admin', 'qa')).toBe(true);
    expect(hasRole('qa_lead', 'qa')).toBe(true);
    expect(hasRole('qa', 'qa_lead')).toBe(false);
    expect(hasRole(undefined, 'qa')).toBe(false);
  });

  it('ROLE_LABELS maps each role to a non-empty string', () => {
    for (const role of ['qa', 'qa_lead', 'qa_supervisor', 'admin']) {
      expect(typeof ROLE_LABELS[role]).toBe('string');
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });

  it('sortMonthsDesc puts newest months first (Mon-YYYY format)', () => {
    const months = ['Jan-2024', 'Jun-2025', 'Dec-2023'];
    const sorted = sortMonthsDesc(months);
    expect(sorted[0]).toBe('Jun-2025');
    expect(sorted[sorted.length - 1]).toBe('Dec-2023');
  });
});
