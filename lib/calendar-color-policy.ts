export const CATEGORY_CONFIG = {
  consultatie: { label: 'Consultatie', color: '#4f8ef7' },
  tratament: { label: 'Tratament', color: '#10b981' },
  control: { label: 'Control', color: '#8b5cf6' },
  urgenta: { label: 'Urgenta', color: '#f59e0b' },
  altele: { label: 'Altele', color: '#64748b' },
} as const;

export type CategoryKey = keyof typeof CATEGORY_CONFIG;
export const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG) as CategoryKey[];
const DEFAULT_CATEGORY_COLOR = '#6366f1';

export const DEFAULT_COLOR_MINE = '#2563EB';
export const DEFAULT_COLOR_OTHERS = '#64748B';

/**
 * 8-color palette for dentists. Each dentist picks one color; within a set of
 * dentists who share a calendar, two dentists cannot pick the same color.
 * The id is the canonical identifier (stable across themes); the hex is the
 * rendered color used everywhere the dentist's appointments appear.
 */
export const DENTIST_COLOR_PALETTE = [
  { id: 'blue',   hex: '#3b82f6', label: 'Albastru' },
  { id: 'pink',   hex: '#ec4899', label: 'Roz' },
  { id: 'green',  hex: '#10b981', label: 'Verde' },
  { id: 'purple', hex: '#a855f7', label: 'Mov' },
  { id: 'orange', hex: '#f97316', label: 'Portocaliu' },
  { id: 'teal',   hex: '#14b8a6', label: 'Turcoaz' },
  { id: 'amber',  hex: '#eab308', label: 'Galben' },
  { id: 'red',    hex: '#ef4444', label: 'Rosu' },
] as const;

export type DentistColorId = typeof DENTIST_COLOR_PALETTE[number]['id'];

export function isDentistColorId(value: unknown): value is DentistColorId {
  return typeof value === 'string' && DENTIST_COLOR_PALETTE.some((c) => c.id === value);
}

export function getDentistColorHex(colorId: string | null | undefined): string | null {
  if (!colorId) return null;
  const entry = DENTIST_COLOR_PALETTE.find((c) => c.id === colorId);
  return entry ? entry.hex : null;
}

export const STATUS_CONFIG = {
  scheduled: { label: 'Programat', dot: '#94a3b8', opacity: 1, strikethrough: false },
  completed: { label: 'Finalizat', dot: '#10b981', opacity: 0.6, strikethrough: false },
  cancelled: { label: 'Anulat', dot: '#f43f5e', opacity: 0.35, strikethrough: true },
  'no-show': { label: 'Absent', dot: '#f59e0b', opacity: 0.45, strikethrough: false },
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;

export interface AppointmentColorInput {
  dentist_id?: number | null;
  /** Dentist's personal palette color (resolved server-side from users.color). */
  dentist_color?: string | null;
  color_mine?: string | null;
  color_others?: string | null;
  category?: string | null;
  color?: string | null;
  is_default_calendar?: boolean | null;
}

export function normalizeStatus(status: string | undefined | null): StatusKey {
  if (status === 'no_show' || status === 'no-show') return 'no-show';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

export function getStatusConfig(status: string | undefined | null) {
  return STATUS_CONFIG[normalizeStatus(status)];
}

export function getCategoryColor(categoryKeyOrLabel: string | undefined | null): string {
  if (!categoryKeyOrLabel) return DEFAULT_CATEGORY_COLOR;
  if (categoryKeyOrLabel in CATEGORY_CONFIG) {
    return CATEGORY_CONFIG[categoryKeyOrLabel as CategoryKey].color;
  }

  const entry = Object.entries(CATEGORY_CONFIG).find(
    ([, value]) => value.label.toLowerCase() === categoryKeyOrLabel.toLowerCase()
  );
  return entry?.[1].color ?? DEFAULT_CATEGORY_COLOR;
}

export function normalizeCategoryToKey(categoryKeyOrLabel: string | undefined | null): CategoryKey | '' {
  if (!categoryKeyOrLabel) return '';
  if (categoryKeyOrLabel in CATEGORY_CONFIG) return categoryKeyOrLabel as CategoryKey;

  const entry = Object.entries(CATEGORY_CONFIG).find(
    ([, value]) => value.label.toLowerCase() === categoryKeyOrLabel.toLowerCase()
  );
  return (entry?.[0] as CategoryKey) ?? '';
}

export function resolveAppointmentColor(
  appointment: AppointmentColorInput,
  viewerUserId: number | null
): string {
  // Default (auto-created) personal calendar: appointment color is always
  // driven by the service category. The calendar itself has no color.
  if (appointment.is_default_calendar) {
    return getCategoryColor(appointment.category);
  }

  // Preferred: the dentist's personal palette color. This makes the same
  // appointment look the same color to every viewer, and on a shared
  // calendar each dentist's appointments are visually distinct.
  if (appointment.dentist_color && typeof appointment.dentist_color === 'string' && appointment.dentist_color.length > 0) {
    return appointment.dentist_color;
  }

  // Legacy fallbacks (for older appointments before per-dentist colors landed).
  const isMine =
    typeof appointment.dentist_id === 'number' &&
    typeof viewerUserId === 'number' &&
    appointment.dentist_id === viewerUserId;

  const primary = isMine ? appointment.color_mine : appointment.color_others;
  if (primary && typeof primary === 'string' && primary.length > 0) {
    return primary;
  }

  if (appointment.color && typeof appointment.color === 'string' && appointment.color.length > 0) {
    return appointment.color;
  }

  return getCategoryColor(appointment.category);
}

/**
 * Teams-style block styling: solid light body + darker left border + text
 * color chosen by relative luminance of the body color.
 *
 * The body and border are returned as CSS `color-mix()` expressions — the
 * browser computes them against the live `--color-bg` token so the block
 * remains opaque in both light and dark themes.
 */
export interface AppointmentBlockStyle {
  borderColor: string;
  bodyColor: string;
  textColor: string;
}

export function getAppointmentBlockStyle(
  baseColor: string,
  theme: 'dark' | 'light' = 'dark',
  variant: 'default' | 'shared' = 'default'
): AppointmentBlockStyle {
  if (variant === 'shared') {
    const borderColor = `color-mix(in srgb, ${baseColor} 80%, black 20%)`;
    const bodyColor = baseColor;
    const textColor = isColorLight(baseColor) ? '#0f172a' : '#ffffff';
    return { borderColor, bodyColor, textColor };
  }

  const borderColor = `color-mix(in srgb, ${baseColor} 85%, black 15%)`;
  const bodyColor = `color-mix(in srgb, ${baseColor} 15%, var(--color-bg) 85%)`;
  // `--color-bg` is #06080d on dark and #f0f4f8 on light. Pre-compute the
  // blended body color in JS using those hex values to pick readable text.
  const bgHex = theme === 'light' ? '#f0f4f8' : '#06080d';
  const textColor = isBlendLight(baseColor, bgHex) ? '#0f172a' : '#e6edf8';
  return { borderColor, bodyColor, textColor };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = Number.parseInt(clean[0] + clean[0], 16);
    const g = Number.parseInt(clean[1] + clean[1], 16);
    const b = Number.parseInt(clean[2] + clean[2], 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number): number => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function isBlendLight(baseHex: string, bgHex: string): boolean {
  const base = hexToRgb(baseHex);
  const bg = hexToRgb(bgHex);
  if (!base || !bg) return false;
  // Mirrors the color-mix(in srgb, base 15%, bg 85%) blend.
  const r = base[0] * 0.15 + bg[0] * 0.85;
  const g = base[1] * 0.15 + bg[1] * 0.85;
  const b = base[2] * 0.15 + bg[2] * 0.85;
  return relativeLuminance(r, g, b) > 0.55;
}

function isColorLight(baseHex: string): boolean {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return false;
  return relativeLuminance(rgb[0], rgb[1], rgb[2]) > 0.45;
}
