export type SettingsTabKey = 'account' | 'calendars' | 'email' | 'services' | 'gdpr' | 'team';

export const SETTINGS_TAB_STORAGE_KEY = 'settings:last-tab';

export const SETTINGS_TABS: Array<{ key: SettingsTabKey; href: string; label: string; ownerOnly?: boolean }> = [
  { key: 'services', href: '/settings/services', label: 'Servicii' },
  { key: 'calendars', href: '/settings/calendars', label: 'Calendare' },
  { key: 'email', href: '/settings/email', label: 'Email' },
  { key: 'team', href: '/settings/team', label: 'Echipă', ownerOnly: true },
  { key: 'account', href: '/settings/account', label: 'Cont' },
  { key: 'gdpr', href: '/settings/gdpr', label: 'GDPR', ownerOnly: true },
];

export function isSettingsTabKey(value: string | null | undefined): value is SettingsTabKey {
  return SETTINGS_TABS.some((tab) => tab.key === value);
}

export function getSettingsTabHref(tab: SettingsTabKey): string {
  return SETTINGS_TABS.find((item) => item.key === tab)?.href || '/settings/calendars';
}
