export const CATEGORY_CONFIG = {
  consultatie: { label: 'Consultatie', color: '#4f8ef7' },
  tratament: { label: 'Tratament', color: '#10b981' },
  control: { label: 'Control', color: '#8b5cf6' },
  urgenta: { label: 'Urgenta', color: '#f59e0b' },
  altele: { label: 'Altele', color: '#64748b' },
} as const;

export type CategoryKey = keyof typeof CATEGORY_CONFIG;
export const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG) as CategoryKey[];
export const DEFAULT_CATEGORY_COLOR = '#6366f1';

export const DEFAULT_COLOR_MINE = '#2563EB';
export const DEFAULT_COLOR_OTHERS = '#64748B';

export const STATUS_CONFIG = {
  scheduled: { label: 'Programat', dot: '#94a3b8', opacity: 1, strikethrough: false },
  completed: { label: 'Finalizat', dot: '#10b981', opacity: 0.6, strikethrough: false },
  cancelled: { label: 'Anulat', dot: '#f43f5e', opacity: 0.35, strikethrough: true },
  'no-show': { label: 'Absent', dot: '#f59e0b', opacity: 0.45, strikethrough: false },
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;

export interface AppointmentColorInput {
  dentist_id?: number | null;
  color_mine?: string | null;
  color_others?: string | null;
  category?: string | null;
  color?: string | null;
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

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9A-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export function resolveAppointmentColor(
  appointment: AppointmentColorInput,
  viewerUserId: number | null
): string {
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
