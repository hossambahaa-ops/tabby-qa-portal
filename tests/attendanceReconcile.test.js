import { describe, it, expect } from 'vitest';
import { reconcileAttendanceEmails } from '../src/lib/attendance.js';

const roster = [
  { email: 'ahmed.soliman.6@tabby.ai', display_name: 'Ahmed Soliman' },
  { email: 'sameh.ahmed@tabby.ai', display_name: 'Sameh Ahmed' },
  { email: 'normal.qa@tabby.ai', display_name: 'Normal QA' },
];

describe('reconcileAttendanceEmails', () => {
  it('remaps cross-domain attendance onto the roster alias, preserving id + fields', () => {
    const att = [
      { id: 'a1', email: 'ahmed.soliman.6@tabby.sa', date: '2026-06-01', status: 'P' },
      { id: 'a2', email: 'SAMEH.AHMED@tabby.sa', date: '2026-06-01', status: 'AL' },
      { id: 'a3', email: 'normal.qa@tabby.ai', date: '2026-06-01', status: 'P' },
    ];
    const out = reconcileAttendanceEmails(att, roster);
    expect(out[0].email).toBe('ahmed.soliman.6@tabby.ai'); // the soliman fix
    expect(out[0].id).toBe('a1');                          // id preserved -> edits PATCH right row
    expect(out[0].status).toBe('P');                       // other fields preserved
    expect(out[1].email).toBe('sameh.ahmed@tabby.ai');     // case-insensitive cross-domain match
    expect(out[2].email).toBe('normal.qa@tabby.ai');       // already matches -> untouched
  });

  it('leaves rows with no roster match untouched', () => {
    const att = [{ id: 'x', email: 'stranger@tabby.sa', date: '2026-06-01', status: 'P' }];
    expect(reconcileAttendanceEmails(att, roster)[0].email).toBe('stranger@tabby.sa');
  });

  it('is a no-op for empty inputs', () => {
    expect(reconcileAttendanceEmails([], roster)).toEqual([]);
    const att = [{ id: '1', email: 'a@b.com' }];
    expect(reconcileAttendanceEmails(att, [])).toBe(att);
  });
});
