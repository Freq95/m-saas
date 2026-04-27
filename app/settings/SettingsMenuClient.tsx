'use client';

import Link from 'next/link';
import styles from './SettingsMenu.module.css';
import navStyles from '../dashboard/page.module.css';

interface SettingsMenuClientProps {
  role: string;
}

const MENU_GROUPS = [
  {
    label: 'Clinică',
    items: [
      {
        key: 'servicii',
        href: '/settings/services',
        label: 'Servicii Medicale',
        sub: 'Tipuri de consultații, durată și preț',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        ),
        ownerOnly: false,
      },
      {
        key: 'team',
        href: '/settings/team',
        label: 'Echipă',
        sub: 'Membri, roluri și invitații',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ),
        ownerOnly: true,
      },
    ],
  },
  {
    label: 'Comunicare',
    items: [
      {
        key: 'calendare',
        href: '/settings/calendars',
        label: 'Calendare',
        sub: 'Partajare și permisiuni calendar',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        ),
        ownerOnly: false,
      },
      {
        key: 'email',
        href: '/settings/email',
        label: 'Email',
        sub: 'Conturi conectate și sincronizare',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        ),
        ownerOnly: false,
      },
    ],
  },
  {
    label: 'Cont & Legal',
    items: [
      {
        key: 'account',
        href: '/settings/account',
        label: 'Contul meu',
        sub: 'Profil, email și parolă',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        ),
        ownerOnly: false,
      },
      {
        key: 'gdpr',
        href: '/settings/gdpr',
        label: 'GDPR',
        sub: 'Export date și conformitate',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        ),
        ownerOnly: true,
      },
    ],
  },
];

export default function SettingsMenuClient({ role }: SettingsMenuClientProps) {
  const isOwner = role === 'owner';

  return (
    <div className={navStyles.container}>
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Setări</h1>
        <div className={styles.groups}>
          {MENU_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => !item.ownerOnly || isOwner);
            if (visibleItems.length === 0) return null;
            return (
              <section key={group.label} className={styles.group}>
                <h2 className={styles.groupLabel}>{group.label}</h2>
                <div className={styles.groupItems}>
                  {visibleItems.map((item) => (
                    <Link key={item.key} href={item.href} className={styles.item}>
                      <span className={styles.itemIcon}>{item.icon}</span>
                      <span className={styles.itemText}>
                        <span className={styles.itemLabel}>{item.label}</span>
                        <span className={styles.itemSub}>{item.sub}</span>
                      </span>
                      <svg className={styles.itemArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
