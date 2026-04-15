import { describe, expect, it } from 'vitest';
import { resolveAppointmentColor } from '@/lib/calendar-color-policy';

describe('resolveAppointmentColor', () => {
  it('uses dentist color for shared appointments in dentist mode', () => {
    expect(resolveAppointmentColor({
      category: 'consultatie',
      calendar_color: '#2563eb',
      dentist_color: '#ef4444',
      calendar_settings: { color_mode: 'dentist' },
    })).toBe('#ef4444');
  });

  it('falls back to calendar color for owner appointments in dentist mode', () => {
    expect(resolveAppointmentColor({
      category: 'consultatie',
      calendar_color: '#2563eb',
      dentist_color: null,
      calendar_settings: { color_mode: 'dentist' },
    })).toBe('#2563eb');
  });

  it('uses category-derived color in category mode', () => {
    expect(resolveAppointmentColor({
      category: 'tratament',
      calendar_color: '#2563eb',
      calendar_is_default: true,
      dentist_color: '#ef4444',
      calendar_settings: { color_mode: 'category' },
    })).toBe('#10b981');
  });

  it('uses calendar color for non-default calendars in category mode', () => {
    expect(resolveAppointmentColor({
      category: 'tratament',
      color: '#10b981',
      calendar_color: '#ec4899',
      calendar_is_default: false,
      dentist_color: '#ef4444',
      calendar_settings: { color_mode: 'category' },
    })).toBe('#ec4899');
  });
});
