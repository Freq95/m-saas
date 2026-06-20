/**
 * GDPR consent visual language — shared between the patients list and the
 * patient profile page so the same color always means the same thing.
 *
 *   green  → consent given and not withdrawn (compliant — data can be processed)
 *   orange → consent explicitly withdrawn (was given, then pulled back — must stop)
 *   red    → never asked (no lawful basis on file)
 *
 * Withdrawn is the warning state, not the danger state: the patient took
 * action that requires our response. Never-asked is danger because we have
 * no lawful basis at all.
 */

export type GdprState = 'green' | 'orange' | 'red';

export interface GdprStatusClient {
  consent_given?: boolean;
  consent_withdrawn?: boolean;
}

export function gdprStateOf(client: GdprStatusClient): GdprState {
  if (client.consent_withdrawn === true) return 'orange';
  if (client.consent_given === true) return 'green';
  return 'red';
}

/** Concrete hex colors used for avatar/border/glow tints. Match Tailwind's
 *  emerald-400 / amber-500 / red-400 to stay readable on the app's dark bg. */
export const GDPR_COLOR: Record<GdprState, string> = {
  green:  '#34d399',
  orange: '#f59e0b',
  red:    '#f87171',
};

/** Long, descriptive label — used in tooltips and aria-label so screen readers
 *  always announce the full meaning of a colored avatar. */
export const GDPR_FULL_LABEL: Record<GdprState, string> = {
  green:  'Consimțământ GDPR acordat',
  orange: 'Consimțământ GDPR retras',
  red:    'Fără consimțământ GDPR',
};

/** Short label suitable for compact pills/badges in headers and list rows. */
export const GDPR_SHORT_LABEL: Record<GdprState, string> = {
  green:  'GDPR ✓',
  orange: 'Consimțământ retras',
  red:    'Fără consimțământ',
};
