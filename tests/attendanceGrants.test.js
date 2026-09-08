// attendance_view_grants — the cross-domain matching rule.
//
// The whole point of this mechanism is letting someone see a QA who is on the
// OTHER tabby domain (Shahat is @tabby.sa; the LLM squad he reviews is
// @tabby.ai). So the one behaviour that must not regress is that a grant
// written against one domain still matches the same person under the other.
// Matching on the full address instead of the local part is the recurring bug
// this guards against.

import { describe, it, expect } from 'vitest';
import { grantedLocalPartsFrom, isGranted, localPartOf } from '../src/api/attendanceGrants.js';

// Shape returned by listMyAttendanceGrants — RLS has already scoped it to one viewer.
const shahatGrants = [
  { viewer_email: 'abdelrahman.shahat@tabby.sa', qa_email: 'rana.salah@tabby.ai' },
  { viewer_email: 'abdelrahman.shahat@tabby.sa', qa_email: 'peter.mikhail@tabby.ai' },
  { viewer_email: 'abdelrahman.shahat@tabby.sa', qa_email: 'sohaila.adel@tabby.ai' },
];

describe('localPartOf', () => {
  it('strips the domain, lowercases and trims', () => {
    expect(localPartOf('  Rana.Salah@Tabby.AI ')).toBe('rana.salah');
  });

  it('is total — null, undefined and empty give an empty string, not a throw', () => {
    expect(localPartOf(null)).toBe('');
    expect(localPartOf(undefined)).toBe('');
    expect(localPartOf('')).toBe('');
  });

  it('keeps dotted and numeric suffixes, which distinguish real people', () => {
    // ahmed.soliman.6 vs ahmed.soliman, esraa.ibrahim.786 vs esraa.ibrahim —
    // truncating at the first dot would merge different QAs.
    expect(localPartOf('ahmed.soliman.6@tabby.sa')).toBe('ahmed.soliman.6');
    expect(localPartOf('esraa.ibrahim.786@tabby.sa')).toBe('esraa.ibrahim.786');
  });
});

describe('grantedLocalPartsFrom', () => {
  it('reduces grant rows to their local parts', () => {
    expect(grantedLocalPartsFrom(shahatGrants)).toEqual(
      new Set(['rana.salah', 'peter.mikhail', 'sohaila.adel'])
    );
  });

  it('survives a failed or empty fetch without throwing', () => {
    expect(grantedLocalPartsFrom([]).size).toBe(0);
    expect(grantedLocalPartsFrom(null).size).toBe(0);
    expect(grantedLocalPartsFrom(undefined).size).toBe(0);
  });

  it('drops rows with no qa_email rather than adding an empty key', () => {
    // An empty key would make isGranted('') true and could widen a view.
    const s = grantedLocalPartsFrom([{ qa_email: '' }, { qa_email: null }, {}]);
    expect(s.size).toBe(0);
  });
});

describe('isGranted', () => {
  const granted = grantedLocalPartsFrom(shahatGrants);

  it('matches the granted QA on their own domain', () => {
    expect(isGranted('rana.salah@tabby.ai', granted)).toBe(true);
  });

  it('matches ACROSS domains — the reason this mechanism exists', () => {
    expect(isGranted('rana.salah@tabby.sa', granted)).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isGranted(' Peter.Mikhail@TABBY.AI ', granted)).toBe(true);
  });

  it('does not match anyone who was not granted', () => {
    expect(isGranted('hussam.khaled@tabby.ai', granted)).toBe(false);
    expect(isGranted('mariam.gad@tabby.ai', granted)).toBe(false);
  });

  it('does not match on a prefix — a different person must not slip through', () => {
    expect(isGranted('rana.salah.2@tabby.ai', granted)).toBe(false);
    expect(isGranted('rana@tabby.ai', granted)).toBe(false);
  });

  it('never matches on empty input or an empty grant set', () => {
    expect(isGranted('', granted)).toBe(false);
    expect(isGranted(null, granted)).toBe(false);
    expect(isGranted('rana.salah@tabby.ai', new Set())).toBe(false);
    // A failed fetch leaves the set undefined in some render paths — that must
    // deny, not throw and blank the grid.
    expect(isGranted('rana.salah@tabby.ai', undefined)).toBe(false);
  });
});
