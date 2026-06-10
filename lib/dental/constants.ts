/**
 * Dental chart constants — FDI numbering, issue palette, surface and status labels.
 * Single source of truth shared by API validation, server aggregates, and the
 * Odontogram UI. Edits here must stay aligned with the migration and Zod schemas.
 */

/** FDI permanent dentition: 11–18 upper right, 21–28 upper left, 31–38 lower left, 41–48 lower right. */
export const FDI_PERMANENT: readonly number[] = [
  // Upper right (Q1, distal → mesial reading left-to-right in mouth view)
  18, 17, 16, 15, 14, 13, 12, 11,
  // Upper left (Q2)
  21, 22, 23, 24, 25, 26, 27, 28,
  // Lower left (Q3)
  38, 37, 36, 35, 34, 33, 32, 31,
  // Lower right (Q4)
  41, 42, 43, 44, 45, 46, 47, 48,
];

export const FDI_PERMANENT_SET: ReadonlySet<number> = new Set(FDI_PERMANENT);

/** Display order on the chart: upper arch left→right (patient view), then lower arch left→right. */
export const FDI_UPPER_ARCH_DISPLAY: readonly number[] = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
];
export const FDI_LOWER_ARCH_DISPLAY: readonly number[] = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

/** FDI deciduous (primary) dentition: 5 teeth per quadrant — incisors, canine, two molars (no premolars). */
export const FDI_DECIDUOUS: readonly number[] = [
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
  85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
];

export const FDI_DECIDUOUS_SET: ReadonlySet<number> = new Set(FDI_DECIDUOUS);

export const FDI_DECIDUOUS_UPPER_ARCH_DISPLAY: readonly number[] = [
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
];
export const FDI_DECIDUOUS_LOWER_ARCH_DISPLAY: readonly number[] = [
  85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
];

export type Dentition = 'permanent' | 'deciduous';

export const DENTITION_LABEL_RO: Record<Dentition, string> = {
  permanent: 'Adult',
  deciduous: 'Copil',
};

export function fdiIsValid(fdi: number): boolean {
  return FDI_PERMANENT_SET.has(fdi) || FDI_DECIDUOUS_SET.has(fdi);
}

export function dentitionOf(fdi: number): Dentition {
  return FDI_DECIDUOUS_SET.has(fdi) ? 'deciduous' : 'permanent';
}

export type Quadrant = 1 | 2 | 3 | 4;
export type ToothCategory = 'incisor' | 'canine' | 'premolar' | 'molar';

/** Surfaces — short codes used in storage; UI labels live in SURFACE_LABEL_RO. */
export const SURFACES = ['M', 'D', 'O', 'L', 'B'] as const;
export type Surface = typeof SURFACES[number];

/**
 * Romanian surface labels.
 * O = Ocluzal (posterior) / Incizal (anterior) — same code, label resolved by tooth category.
 * L = Lingual (mandibular) / Palatinal (maxillary).
 * B = Vestibular (universally accepted RO term; Bucal also used).
 */
export const SURFACE_LABEL_RO: Record<Surface, string> = {
  M: 'Mezial',
  D: 'Distal',
  O: 'Ocluzal',
  L: 'Lingual',
  B: 'Vestibular',
};

export function surfaceLabel(surface: Surface, fdi: number): string {
  if (surface === 'O') {
    return isAnterior(fdi) ? 'Incizal' : 'Ocluzal';
  }
  if (surface === 'L') {
    return isUpper(fdi) ? 'Palatinal' : 'Lingual';
  }
  return SURFACE_LABEL_RO[surface];
}

export const ISSUE_TYPES = [
  'caries',
  'surgery',
  'implantation',
  'gingivitis',
  'periodontitis',
  'removal',
  'periostitis',
] as const;
export type IssueType = typeof ISSUE_TYPES[number];

export const ISSUE_LABEL_RO: Record<IssueType, string> = {
  caries: 'Carii',
  surgery: 'Chirurgie',
  implantation: 'Implant',
  gingivitis: 'Gingivită',
  periodontitis: 'Parodontită',
  removal: 'Extracție',
  periostitis: 'Periostită',
};

/** Palette tuned to feel clinical, not toy-like. Each color has a 12%-alpha fill variant. */
export const ISSUE_COLOR: Record<IssueType, string> = {
  caries:        '#7cc594', // sage green
  surgery:       '#e76e7a', // muted coral
  implantation:  '#b18cd9', // lavender
  gingivitis:    '#e15a5a', // red — fixed cervical arc, not per-surface
  periodontitis: '#4d8bd4', // blue — fixed sub-cervical band, not per-surface
  removal:       '#a8a29e', // stone grey
  periostitis:   '#8a6d52', // mocha
};

/** Tooth statuses beyond per-surface issues. Phase 2 adds root_canal + bridge. */
export const TOOTH_STATUSES = [
  'present',
  'missing',
  'implant',
  'crown',
  'root_canal',
  'bridge',
] as const;
export type ToothStatus = typeof TOOTH_STATUSES[number];

export const STATUS_LABEL_RO: Record<ToothStatus, string> = {
  present: 'Prezent',
  missing: 'Lipsă',
  implant: 'Implant',
  crown: 'Coroană',
  root_canal: 'Tratament canal',
  bridge: 'Punte',
};

export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type Severity = typeof SEVERITIES[number];

export const SEVERITY_LABEL_RO: Record<Severity, string> = {
  mild: 'Ușor',
  moderate: 'Moderat',
  severe: 'Sever',
};

/** Event actions — append-only history. */
export const EVENT_ACTIONS = [
  'diagnosed',
  'treated',
  'resolved',
  'status_changed',
] as const;
export type EventAction = typeof EVENT_ACTIONS[number];

export const EVENT_ACTION_LABEL_RO: Record<EventAction, string> = {
  diagnosed: 'Diagnosticat',
  treated: 'Tratat',
  resolved: 'Rezolvat',
  status_changed: 'Stare modificată',
};

// ── FDI helpers ────────────────────────────────────────────────────────────────

export function quadrantOf(fdi: number): Quadrant {
  return Math.floor(fdi / 10) as Quadrant;
}

export function positionOf(fdi: number): number {
  return fdi % 10;
}

export function isUpper(fdi: number): boolean {
  // Permanent upper = quadrants 1,2; deciduous upper = quadrants 5,6.
  // (Computed as a plain number so deciduous quadrants 5–8 are handled — the
  // Quadrant type only enumerates the permanent 1–4.)
  const q = Math.floor(fdi / 10);
  return q === 1 || q === 2 || q === 5 || q === 6;
}

export function isLower(fdi: number): boolean {
  return !isUpper(fdi);
}

export function categoryOf(fdi: number): ToothCategory {
  const p = positionOf(fdi);
  if (p <= 2) return 'incisor';
  if (p === 3) return 'canine';
  if (p <= 5) return 'premolar';
  return 'molar';
}

export function isAnterior(fdi: number): boolean {
  return positionOf(fdi) <= 3;
}
