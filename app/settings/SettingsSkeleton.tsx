import SettingsTabs from './SettingsTabs';
import { SettingsMobileHeader } from './SettingsMobileHeader';
import type { SettingsTabKey } from './settings-tabs';
import Spinner from '@/components/Spinner';
import navStyles from '../dashboard/page.module.css';
import sharedStyles from './services/page.module.css';

const tabTitles: Record<SettingsTabKey, string> = {
  services: 'Servicii',
  calendars: 'Calendare',
  email: 'Email',
  team: 'Echipă',
  account: 'Cont',
  gdpr: 'GDPR',
};

export function SettingsSkeleton({ activeTab }: { activeTab: SettingsTabKey }) {
  return (
    <div className={navStyles.container}>
      <div className={sharedStyles.container}>
        <SettingsMobileHeader title={tabTitles[activeTab]} />
        <div className={`${sharedStyles.tabRow} ${sharedStyles.desktopTabRow}`}>
          <SettingsTabs activeTab={activeTab} />
        </div>
        <Spinner />
      </div>
    </div>
  );
}
