import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import CalendarDayCell from '../src/components/schedule/CalendarDayCell.jsx';

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

describe('CalendarDayCell shift visibility', () => {
  it('keeps the assigned shift visible after check-in (the fix)', () => {
    const { container } = render(<CalendarDayCell {...base}
      att={{ shift_start: '10:00:00', shift_end: '19:00:00', checked_in_at: '2026-06-10T08:03:13Z' }} />);
    expect(container.textContent).toContain('10:00'); // shift start shown
    expect(container.textContent).toContain('19:00'); // shift end shown
    expect(container.textContent).toContain('✓');     // check-in still shown alongside
  });

  it('shows the shift even with no check-in yet', () => {
    const { container } = render(<CalendarDayCell {...base} isToday={false}
      att={{ shift_start: '08:00:00', shift_end: '17:00:00' }} />);
    expect(container.textContent).toContain('08:00');
    expect(container.textContent).toContain('17:00');
  });
});
