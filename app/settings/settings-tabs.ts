export type SettingsTabKey = 'account' | 'calendars' | 'email' | 'services' | 'gdpr' | 'team';

export const SETTINGS_EXIT_PATH_STORAGE_KEY = 'settings:last-exit-path';

export const SETTINGS_TABS: Array<{ key: SettingsTabKey; href: string; label: string; ownerOnly?: boolean }> = [
  { key: 'services', href: '/settings/services', label: 'Servicii' },
  { key: 'calendars', href: '/settings/calendars', label: 'Calendare' },
  { key: 'email', href: '/settings/email', label: 'Email' },
  { key: 'team', href: '/settings/team', label: 'Echipă' },
  { key: 'account', href: '/settings/account', label: 'Cont' },
  { key: 'gdpr', href: '/settings/gdpr', label: 'GDPR' },
];
