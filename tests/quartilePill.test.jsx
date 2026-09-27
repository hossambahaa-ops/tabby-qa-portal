// QuartilePill — the two reasons a quartile can be missing are NOT the same,
// and conflating them blames the QA for an Ops publishing gap.
//
// Found 2026-09-27 during a QA Profile audit: csat_population had no Sep-2026
// rows, so every September quartile was null and the pill told all 46 QAs
// "you need ≥5 CSAT surveys this month to be ranked" — false for the 27 who
// had 5 or more. The survey-count message is only correct when the population
// EXISTS and the QA fell short of it.
//
// These tests pin the distinction: same null quartile, two different messages.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import QuartilePill from '../src/components/QuartilePill.jsx';

const titleOf = (c) => c.container.querySelector('span')?.getAttribute('title') || '';

describe('QuartilePill — a real quartile', () => {
  it('renders Q1..Q4 with the ranking explained', () => {
    for (const q of [1, 2, 3, 4]) {
      const c = render(<QuartilePill quartile={q} lob="Front Line" />);
      expect(c.container.textContent).toBe(`Q${q}`);
      expect(titleOf(c)).toContain('Front Line');
    }
  });

  it('ignores populationMissing when a quartile actually exists', () => {
    const c = render(<QuartilePill quartile={2} populationMissing />);
    expect(c.container.textContent).toBe('Q2');
  });
});

describe('QuartilePill — missing quartile', () => {
  it('blames the survey count ONLY when the population was published', () => {
    const c = render(<QuartilePill quartile={null} lob="Dispute" />);
    expect(c.container.textContent).toBe('— n/a');
    expect(titleOf(c)).toContain('5 CSAT surveys');
  });

  it('says ranking is pending when the population was never published', () => {
    const c = render(<QuartilePill quartile={null} lob="Dispute" populationMissing />);
    expect(c.container.textContent).toBe('— pending');
    // The QA must NOT be told their survey count is the problem.
    expect(titleOf(c)).not.toContain('5 CSAT surveys');
    expect(titleOf(c)).toContain("haven't been published");
  });

  it('defaults to the survey-count message, so existing callers are unchanged', () => {
    const c = render(<QuartilePill quartile={null} />);
    expect(c.container.textContent).toBe('— n/a');
  });
});
