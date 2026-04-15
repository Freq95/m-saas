export type CalendarColorMode = 'category' | 'dentist';
export interface CalendarColorSettings {
  color_mode?: CalendarColorMode;
}

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

export const STATUS_CONFIG = {
  scheduled: { label: 'Programat', dot: '#94a3b8', opacity: 1, strikethrough: false },
  completed: { label: 'Finalizat', dot: '#10b981', opacity: 0.6, strikethrough: false },
  cancelled: { label: 'Anulat', dot: '#f43f5e', opacity: 0.35, strikethrough: true },
  'no-show': { label: 'Absent', dot: '#f59e0b', opacity: 0.45, strikethrough: false },
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;

export const DENTIST_COLOR_PALETTE = [
  '#2563EB',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
] as const;

export type DentistPaletteColor = (typeof DENTIST_COLOR_PALETTE)[number];

type ReservedShareColorInput = {
  id?: number | null;
  status?: unknown;
  dentistColor?: unknown;
};

export interface AppointmentColorInput {
  category?: string | null;
  color?: string | null;
  calendar_color?: string | null;
  calendar_is_default?: boolean | null;
  dentist_color?: string | null;
  calendar_settings?: CalendarColorSettings | null;
}

const DENTIST_COLOR_SET = new Set<string>(DENTIST_COLOR_PALETTE);

export function normalizeStatus(status: string | undefined | null): StatusKey {
  if (status === 'no_show' || status === 'no-show') return 'no-show';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

export function getStatusConfig(status: string | undefined | null) {
  return STATUS_CONFIG[normalizeStatus(status)];
}

export function normalizeCalendarColorMode(value: unknown): CalendarColorMode | undefined {
  if (value === 'dentist') {
    return 'dentist';
  }
  if (value === 'category') {
    return 'category';
  }
  return undefined;
}

export function normalizeCalendarColorSettings(value: unknown): CalendarColorSettings | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const colorMode = normalizeCalendarColorMode((value as CalendarColorSettings).color_mode);
  return colorMode ? { color_mode: colorMode } : null;
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

export function resolveAppointmentColor(appointment: AppointmentColorInput): string {
  if (appointment.calendar_settings?.color_mode === 'dentist') {
    return appointment.dentist_color || appointment.calendar_color || getCategoryColor(appointment.category);
  }

  if (appointment.calendar_is_default === false && appointment.calendar_color) {
    return appointment.calendar_color;
  }

  return appointment.color || getCategoryColor(appointment.category);
}

export function normalizeDentistColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

export function isDentistPaletteColor(value: unknown): value is DentistPaletteColor {
  const normalized = normalizeDentistColor(value);
  return normalized ? DENTIST_COLOR_SET.has(normalized) : false;
}

export function isReservedDentistShareStatus(status: unknown): boolean {
  return status === 'pending' || status === 'accepted';
}

export function getReservedDentistColors(options: {
  ownerColor?: unknown;
  shares?: ReservedShareColorInput[];
  excludeShareId?: number | null;
}): string[] {
  const reserved = new Set<string>();
  const normalizedOwnerColor = normalizeDentistColor(options.ownerColor);

  if (normalizedOwnerColor) {
    reserved.add(normalizedOwnerColor);
  }

  for (const share of options.shares || []) {
    if (typeof options.excludeShareId === 'number' && share.id === options.excludeShareId) {
      continue;
    }
    if (!isReservedDentistShareStatus(share.status)) {
      continue;
    }

    const normalizedShareColor = normalizeDentistColor(share.dentistColor);
    if (normalizedShareColor) {
      reserved.add(normalizedShareColor);
    }
  }

  return Array.from(reserved);
}

export function getReservedDentistPaletteColors(options: {
  ownerColor?: unknown;
  shares?: ReservedShareColorInput[];
  excludeShareId?: number | null;
}): DentistPaletteColor[] {
  return getReservedDentistColors(options).filter((color): color is DentistPaletteColor => isDentistPaletteColor(color));
}

export function getAvailableDentistPaletteColors(usedColors: Iterable<unknown>): DentistPaletteColor[] {
  const normalizedUsed = new Set(
    Array.from(usedColors)
      .map((value) => normalizeDentistColor(value))
      .filter((value): value is string => Boolean(value))
  );

  return DENTIST_COLOR_PALETTE.filter((color) => !normalizedUsed.has(color));
}

export function getDefaultDentistPaletteColor(options: {
  ownerColor?: unknown;
  shares?: ReservedShareColorInput[];
  excludeShareId?: number | null;
  fallbackColor?: DentistPaletteColor;
}): DentistPaletteColor {
  return (
    getAvailableDentistPaletteColors(
      getReservedDentistPaletteColors(options)
    )[0] || options.fallbackColor || DENTIST_COLOR_PALETTE[0]
  );
}

export function requiresDentistPaletteNormalization(
  colorMode: CalendarColorMode | undefined,
  ownerColor: unknown
): boolean {
  return colorMode === 'dentist' && !isDentistPaletteColor(ownerColor);
}

export function buildDentistPaletteState(options: {
  ownerColor?: unknown;
  colorMode?: unknown;
  shares?: ReservedShareColorInput[];
  excludeShareId?: number | null;
}) {
  const reservedColors = getReservedDentistColors(options);
  const reservedPaletteColors = reservedColors.filter((color): color is DentistPaletteColor => isDentistPaletteColor(color));

  return {
    reservedColors,
    reservedPaletteColors,
    availablePaletteColors: getAvailableDentistPaletteColors(reservedPaletteColors),
    ownerNeedsPaletteNormalization: requiresDentistPaletteNormalization(
      normalizeCalendarColorMode(options.colorMode),
      options.ownerColor
    ),
  };
}
