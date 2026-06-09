import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

import {
  QUALITY_PRINCIPLES,
  QUALITY_VALUES,
  QUALITY_TOV,
  principleOfTheDay,
} from '../src/lib/qualityPrinciples.js';
import QualityPrinciple from '../src/components/QualityPrinciple.jsx';
import QualityDNAPage from '../src/pages/QualityDNAPage.jsx';

describe('qualityPrinciples lib', () => {
  it('exposes 16 bite-size principles (10 values + 6 TOV), all non-empty', () => {
    expect(QUALITY_VALUES.length).toBe(10);
    expect(QUALITY_TOV.length).toBe(6);
    expect(QUALITY_PRINCIPLES.length).toBe(16);
    for (const p of QUALITY_PRINCIPLES) {
      expect(typeof p.text).toBe('string');
      expect(p.text.length).toBeGreaterThan(0);
      expect(typeof p.tag).toBe('string');
    }
  });

  it('principleOfTheDay is deterministic for a given date', () => {
    const d = new Date('2026-06-09T10:00:00Z');
    expect(principleOfTheDay(d)).toEqual(principleOfTheDay(d));
  });

  it('rotates through the whole list over 16 consecutive days', () => {
    const seen = new Set();
    for (let i = 0; i < 16; i++) {
      seen.add(principleOfTheDay(new Date(2026, 0, 1 + i)).text);
    }
    expect(seen.size).toBe(16);
  });
});

describe('QualityPrinciple component', () => {
  it('renders the "Always remember" eyebrow + text in strip variant', () => {
    const { getByText } = render(
      <QualityPrinciple variant="strip" principle={{ kind: 'Value', tag: 'Test', text: 'stay sharp' }} />
    );
    expect(getByText('Always remember')).toBeTruthy();
    expect(getByText('stay sharp')).toBeTruthy();
  });

  it('falls back to the principle of the day when none is passed', () => {
    const { container } = render(<QualityPrinciple variant="inline" principle={null} />);
    expect(container.textContent).toContain('Always remember');
  });
});

describe('QualityDNAPage', () => {
  it('renders the vision, a value, and a tone-of-voice principle without crashing', () => {
    const { getByText, container } = render(<QualityDNAPage />);
    expect(getByText('Quality DNA')).toBeTruthy();
    expect(container.textContent).toContain('trusted, data-driven partner');
    expect(container.textContent).toContain('Data-Driven');
    expect(container.textContent).toContain('Privacy & Trust');
  });
});
