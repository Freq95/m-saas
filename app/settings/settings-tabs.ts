export type SettingsTabKey = 'account' | 'calendars' | 'email' | 'services' | 'gdpr' | 'team' | 'treatment-plan';

export const SETTINGS_EXIT_PATH_STORAGE_KEY = 'settings:last-exit-path';

export const SETTINGS_TABS: Array<{
  key: SettingsTabKey;
  href: string;
  label: string;
  // Visible only to the clinic account holder. Team management is the
  // primary use case (invite/remove staff, switch roles).
  ownerOnly?: boolean;
  // Visible to clinical staff (owner + dentists). Hides the tab from
  // asistents and receptionists who shouldn't configure clinic
  // infrastructure like the connected email account.
  clinicalOnly?: boolean;
}> = [
  { key: 'services', href: '/settings/services', label: 'Servicii' },
  { key: 'treatment-plan', href: '/settings/treatment-plan', label: 'Plan de tratament', clinicalOnly: true },
  { key: 'calendars', href: '/settings/calendars', label: 'Calendare' },
  { key: 'email', href: '/settings/email', label: 'Email', clinicalOnly: true },
  { key: 'team', href: '/settings/team', label: 'Echipă' },
  { key: 'account', href: '/settings/account', label: 'Cont' },
  { key: 'gdpr', href: '/settings/gdpr', label: 'GDPR' },
];
