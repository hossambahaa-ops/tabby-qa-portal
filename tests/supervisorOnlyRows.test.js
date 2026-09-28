// SUPERVISOR-ONLY QA rows — the restriction hides these numbers from QA LEADS,
// never from the QA herself.
//
// Found 2026-09-28: canSeeQaRow tested the viewer's ROLE only. Yara is a
// senior_qa (level 2) and the gate is qa_supervisor (level 4), so the rule that
// was meant to keep her figures away from leads also hid her own MTD, CSAT and
// leaderboard rows from her. She could not see her own numbers at all.
//
// The identity is split across domains (yara.ashraf.786@tabby.sa and
// yara.ashraf@tabby.ai are one person), so self-recognition has to work under
// either spelling — matching on the full address would reintroduce the bug.

import { describe, it, expect } from 'vitest';
import { canSeeQaRow, visibleQaRows } from '../src/lib/constants.js';

const HER_SA = 'yara.ashraf.786@tabby.sa';
const HER_AI = 'yara.ashraf@tabby.ai';
const SOMEONE_ELSE = 'pola.emad@tabby.ai';

describe('restricted rows stay hidden from leads', () => {
  it('a qa_lead cannot see a restricted QA, with or without an email', () => {
    expect(canSeeQaRow('qa_lead', HER_SA)).toBe(false);
    expect(canSeeQaRow('qa_lead', HER_SA, 'mahmoud.ahmed@tabby.ai')).toBe(false);
  });

  it('another QA cannot see a restricted QA', () => {
    expect(canSeeQaRow('qa', HER_SA, SOMEONE_ELSE)).toBe(false);
    expect(canSeeQaRow('senior_qa', HER_AI, SOMEONE_ELSE)).toBe(false);
  });

  it('supervisor and above still see them', () => {
    for (const role of ['qa_supervisor', 'manager', 'admin', 'super_admin']) {
      expect(canSeeQaRow(role, HER_SA)).toBe(true);
    }
  });
});

describe('a restricted QA can always see herself', () => {
  it('sees her own row under her own address', () => {
    expect(canSeeQaRow('senior_qa', HER_SA, HER_SA)).toBe(true);
  });

  it('sees it across the domain split, either direction', () => {
    expect(canSeeQaRow('senior_qa', HER_AI, HER_SA)).toBe(true);
    expect(canSeeQaRow('senior_qa', HER_SA, HER_AI)).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(canSeeQaRow('senior_qa', HER_SA, '  Yara.Ashraf.786@Tabby.SA ')).toBe(true);
  });

  it('still only sees HERSELF, not other restricted rows or the whole table', () => {
    const rows = [{ qa_email: HER_SA }, { qa_email: SOMEONE_ELSE }];
    const seen = visibleQaRows('senior_qa', rows, 'qa_email', HER_SA).map(r => r.qa_email);
    expect(seen).toEqual([HER_SA, SOMEONE_ELSE]); // her own + unrestricted others
  });
});

describe('unrestricted QAs are unaffected', () => {
  it('everyone can see a normal QA row', () => {
    expect(canSeeQaRow('qa', SOMEONE_ELSE, 'anyone@tabby.ai')).toBe(true);
    expect(canSeeQaRow('qa_lead', SOMEONE_ELSE)).toBe(true);
  });

  it('a missing viewer email keeps the old strict behaviour', () => {
    expect(canSeeQaRow('senior_qa', HER_SA)).toBe(false);
    expect(canSeeQaRow('senior_qa', HER_SA, null)).toBe(false);
    expect(canSeeQaRow('senior_qa', HER_SA, '')).toBe(false);
  });
});
