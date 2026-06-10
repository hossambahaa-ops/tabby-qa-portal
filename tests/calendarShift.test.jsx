import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import CalendarDayCell from '../src/components/schedule/CalendarDayCell.jsx';
import { shiftBadge } from '../src/lib/attendance.js';

const noop = () => {};
const base = {
  day: 10, dateStr: '2026-06-10', st: 'P', planned: 'P',
  attType: { label: 'Present', color: '#22C55E', bg: '#22C55E20' },
  isWeekend: false, isToday: true, isEditing: false, canEdit: false,
  em: 'x@tabby.sa', dayNum: 10, isQA: false, canApprove: false,
  pickerStage: null, pendingReason: '', enhanced: true,
  onOpen: noop, onClose: noop, onSetAtt: noop, onApproveAtt: noop,
  onClearAtt: noop, setPendingReason: noop, setPickerStage: noop,
};

describe('shiftBadge', () => {
  it('compacts :00 and keeps real minutes in the label', () => {
    expect(shiftBadge('10:00:00', '19:00:00').label).toBe('10–19');
    expect(shiftBadge('08:00', '17:30').label).toBe('08–17:30');
    expect(shiftBadge(null, '19:00')).toBeNull();
    expect(shiftBadge('10:00', null)).toBeNull();
  });

  it('gives each distinct shift a stable, distinct colour', () => {
    const a = shiftBadge('10:00', '19:00');
    expect(a.color).toMatch(/^hsl\(/);
    // same shift → same colour, regardless of HH:MM vs HH:MM:SS format
    expect(a.color).toBe(shiftBadge('10:00:00', '19:00:00').color);
    // different shifts → different colours (no bucket collapse like before)
    expect(a.color).not.toBe(shiftBadge('09:00', '18:00').color);
    expect(shiftBadge('13:00', '22:00').color).not.toBe(shiftBadge('14:00', '22:00').color);
  });
});

describe('CalendarDayCell shift visibility', () => {
  it('keeps the assigned shift visible (as a compact pill) after check-in', () => {
    const { container } = render(<CalendarDayCell {...base}
      att={{ shift_start: '10:00:00', shift_end: '19:00:00', checked_in_at: '2026-06-10T08:03:13Z' }} />);
    expect(container.textContent).toContain('10–19');
    expect(container.textContent).toContain('✓');
  });

  it('shows the shift even with no check-in yet', () => {
    const { container } = render(<CalendarDayCell {...base} isToday={false}
      att={{ shift_start: '08:00:00', shift_end: '17:00:00' }} />);
    expect(container.textContent).toContain('08–17');
  });
});
