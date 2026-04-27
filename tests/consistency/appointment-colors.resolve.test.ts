import { describe, expect, it } from 'vitest';
import { getAppointmentBlockStyle, resolveAppointmentColor } from '@/lib/calendar-color-policy';

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

describe('getAppointmentBlockStyle', () => {
  it('keeps the default style pastel with a darker edge', () => {
    expect(getAppointmentBlockStyle('#3b82f6', 'light')).toMatchObject({
      borderColor: 'color-mix(in srgb, #3b82f6 85%, black 15%)',
      bodyColor: 'color-mix(in srgb, #3b82f6 15%, var(--color-bg) 85%)',
    });
  });

  it('uses solid body and pastel edge for shared appointments', () => {
    expect(getAppointmentBlockStyle('#3b82f6', 'light', 'shared')).toMatchObject({
      borderColor: 'color-mix(in srgb, #3b82f6 80%, black 20%)',
      bodyColor: '#3b82f6',
      textColor: '#ffffff',
    });
  });
});
