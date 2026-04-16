import { describe, expect, it } from 'vitest';
import { resolveAppointmentColor } from '@/lib/calendar-color-policy';

describe('resolveAppointmentColor', () => {
  it("uses color_mine when viewer is the appointment's dentist", () => {
    expect(
      resolveAppointmentColor(
        {
          dentist_id: 42,
          color_mine: '#2563EB',
          color_others: '#F59E0B',
          category: 'consultatie',
        },
        42
      )
    ).toBe('#2563EB');
  });

  it('uses color_others when viewer is a different dentist', () => {
    expect(
      resolveAppointmentColor(
        {
          dentist_id: 42,
          color_mine: '#2563EB',
          color_others: '#F59E0B',
          category: 'consultatie',
        },
        7
      )
    ).toBe('#F59E0B');
  });

  it('falls back to plain color when per-calendar colors are missing', () => {
    expect(
      resolveAppointmentColor(
        {
          dentist_id: 42,
          color: '#10B981',
          category: 'consultatie',
        },
        42
      )
    ).toBe('#10B981');
  });

  it('derives from category when no color is available', () => {
    expect(
      resolveAppointmentColor(
        {
          category: 'tratament',
        },
        null
      )
    ).toBe('#10b981');
  });
});
