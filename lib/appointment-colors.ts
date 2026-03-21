/**
 * Single source of truth for appointment category and status colors.
 * All calendar components import from here — never define colors locally.
 */

// ─── Categories ────────────────────────────────────────────────────────────

export const CATEGORY_CONFIG = {
  consultatie: { label: 'Consultatie', color: '#4f8ef7' },
  tratament:   { label: 'Tratament',   color: '#10b981' },
  control:     { label: 'Control',     color: '#8b5cf6' },
  urgenta:     { label: 'Urgenta',     color: '#f59e0b' },
  altele:      { label: 'Altele',      color: '#64748b' },
} as const;

export type CategoryKey = keyof typeof CATEGORY_CONFIG;

export const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG) as CategoryKey[];

/** Color used when no category is set. */
export const DEFAULT_CATEGORY_COLOR = '#6366f1';

// ─── Statuses ───────────────────────────────────────────────────────────────

export const STATUS_CONFIG = {
  scheduled: { label: 'Programat', dot: '#94a3b8', opacity: 1.00, strikethrough: false },
  completed: { label: 'Finalizat', dot: '#10b981', opacity: 0.60, strikethrough: false },
  cancelled: { label: 'Anulat',    dot: '#f43f5e', opacity: 0.35, strikethrough: true  },
  'no-show': { label: 'Absent',    dot: '#f59e0b', opacity: 0.45, strikethrough: false },
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalises any status string variant to the canonical StatusKey. */
export function normalizeStatus(status: string | undefined | null): StatusKey {
  if (status === 'no_show' || status === 'no-show') return 'no-show';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

/** Returns the STATUS_CONFIG entry for any status string. */
export function getStatusConfig(status: string | undefined | null) {
  return STATUS_CONFIG[normalizeStatus(status)];
}

/**
 * Resolves a category key or legacy label string to its hex color.
 * Handles both new keys ("consultatie") and old label values ("Consultatie")
 * that may still exist in the database.
 */
export function getCategoryColor(categoryKeyOrLabel: string | undefined | null): string {
  if (!categoryKeyOrLabel) return DEFAULT_CATEGORY_COLOR;
  if (categoryKeyOrLabel in CATEGORY_CONFIG) {
    return CATEGORY_CONFIG[categoryKeyOrLabel as CategoryKey].color;
  }
  // Backward compat: old DB entries stored the display label, not the key.
  const entry = Object.entries(CATEGORY_CONFIG).find(
    ([, v]) => v.label.toLowerCase() === categoryKeyOrLabel.toLowerCase(),
  );
  return entry?.[1].color ?? DEFAULT_CATEGORY_COLOR;
}

/**
 * Normalises a category key or legacy label to the canonical CategoryKey.
 * Returns '' if no match is found (means "no category selected").
 */
export function normalizeCategoryToKey(categoryKeyOrLabel: string | undefined | null): CategoryKey | '' {
  if (!categoryKeyOrLabel) return '';
  if (categoryKeyOrLabel in CATEGORY_CONFIG) return categoryKeyOrLabel as CategoryKey;
  const entry = Object.entries(CATEGORY_CONFIG).find(
    ([, v]) => v.label.toLowerCase() === categoryKeyOrLabel.toLowerCase(),
  );
  return (entry?.[0] as CategoryKey) ?? '';
}
