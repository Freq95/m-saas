'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { authFetcher } from '@/lib/fetcher';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from './page.module.css';

interface Appointment {
  id: number;
  client_id: number | null;
  client_name: string;
  service_name: string;
  start_time: string;
  end_time: string;
  status: string;
  category: string | null;
  dentist_name: string | null;
}

interface Client {
  id: number;
  name: string;
}

interface DashboardData {
  messagesPerDay: Array<{ date: string; count: number }>;
  appointmentsPerDay: Array<{ date: string; count: number }>;
  today: {
    messages: number;
    appointments: number;
    urgentCount: number;
    totalClients: number;
    appointmentsList: Appointment[];
  };
  weekAppointments: number;
  weekChart: Array<{ label: string; count: number; isToday: boolean }>;
  monthRevenue: number;
  monthRevenueDeltaPct: number | null;
  noShowRate: number;
  noShowDeltaPct: number;
  estimatedRevenue: number;
  clients: {
    topClients: Client[];
    newClientsToday: number;
    newClientsWeek: number;
    inactiveClients: Client[];
    growth: Array<{ date: string; count: number }>;
  };
}

const fetchDashboard = (url: string) => authFetcher<DashboardData>(url);

const EMPTY_DASHBOARD: DashboardData = {
  messagesPerDay: [],
  appointmentsPerDay: [],
  today: { messages: 0, appointments: 0, urgentCount: 0, totalClients: 0, appointmentsList: [] },
  weekAppointments: 0,
  weekChart: [],
  monthRevenue: 0,
  monthRevenueDeltaPct: null,
  noShowRate: 0,
  noShowDeltaPct: 0,
  estimatedRevenue: 0,
  clients: { topClients: [], newClientsToday: 0, newClientsWeek: 0, inactiveClients: [], growth: [] },
};

interface DashboardPageClientProps {
  initialDashboard?: DashboardData | null;
  userName?: string;
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Bună dimineața';
  if (hour < 18) return 'Bună ziua';
  return 'Bună seara';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  // Skip a leading "Dr." so initials reflect the person, not the title.
  const usable = parts[0].toLowerCase().startsWith('dr') && parts.length > 1 ? parts.slice(1) : parts;
  const a = usable[0]?.[0] || '';
  const b = usable[1]?.[0] || '';
  return ((a + b).toUpperCase() || '?').slice(0, 2);
}

function formatRevenue(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k lei`;
  return `${Math.round(n)} lei`;
}

function statusInfo(status: string): { label: string; cls: string; dot: string } {
  switch (status) {
    case 'completed': return { label: 'Finalizat', cls: styles.stDone, dot: styles.dotDone };
    case 'cancelled': return { label: 'Anulat', cls: styles.stCancel, dot: styles.dotCancel };
    case 'no-show': return { label: 'Absent', cls: styles.stNoshow, dot: styles.dotNoshow };
    default: return { label: 'Urmează', cls: styles.stNext, dot: styles.dotNext };
  }
}

function UserIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function DashboardPageClient({ initialDashboard, userName }: DashboardPageClientProps = {}) {
  const key = '/api/dashboard?days=7';
  const { data, error, isLoading, mutate } = useSWR<DashboardData>(key, fetchDashboard, {
    revalidateOnFocus: false,
    revalidateOnMount: false,
    revalidateIfStale: false,
    dedupingInterval: 10000,
    fallbackData: initialDashboard ?? undefined,
  });

  if (isLoading && !initialDashboard) return null;

  if (error && !isLoading) {
    return (
      <div className={styles.feed}>
        <section className={styles.dayCard}>
          <h2 className={styles.cardHeadTitle}>Eroare la încărcarea dashboard-ului</h2>
          <p className={styles.dayEmpty}>Nu am putut încărca datele. Verifică conexiunea și încearcă din nou.</p>
          <button type="button" onClick={() => mutate()} className={styles.retryButton}>Reîncearcă</button>
        </section>
      </div>
    );
  }

  const dashboard = data ?? EMPTY_DASHBOARD;
  const displayName = (userName && userName.trim()) || 'doctor';
  const greeting = greetingFor(new Date().getHours());
  const todayCount = dashboard.today.appointments || 0;
  const urgent = dashboard.today.urgentCount || 0;
  const week = dashboard.weekAppointments || 0;

  const isNewTenant =
    dashboard.today.totalClients === 0 &&
    dashboard.today.appointments === 0 &&
    dashboard.clients.topClients.length === 0;

  if (isNewTenant) {
    return (
      <div className={styles.feed}>
        <header className={styles.greeting}>
          <h1 className={styles.greetingTitle}>{greeting}, {displayName}</h1>
          <p className={styles.greetingSub}>Hai să configurăm clinica ta.</p>
        </header>
        <div className={styles.onboardingItems}>
          {[
            { href: '/settings/services', icon: '⚕️', title: 'Adaugă primul serviciu', sub: 'Definește tipurile de consultații și durata lor.' },
            { href: '/settings/email', icon: '📧', title: 'Conectează email-ul clinicii', sub: 'Gestionează mesajele pacienților din inbox.' },
            { href: '/settings/team', icon: '👥', title: 'Invită echipa', sub: 'Adaugă colegi care gestionează programările.' },
            { href: '/calendar', icon: '📅', title: 'Creează prima programare', sub: 'Adaugă un pacient în calendar.' },
          ].map((step) => (
            <Link key={step.href} href={step.href} className={styles.onboardingItem}>
              <span className={styles.onboardingIcon}>{step.icon}</span>
              <div>
                <div className={styles.onboardingItemTitle}>{step.title}</div>
                <div className={styles.onboardingItemSub}>{step.sub}</div>
              </div>
              <span className={styles.onboardingArrow}>→</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...dashboard.today.appointmentsList].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  const now = Date.now();
  let heroIdx = sorted.findIndex(
    (a) => new Date(a.start_time).getTime() <= now && now < new Date(a.end_time).getTime()
  );
  const inProgress = heroIdx !== -1;
  if (heroIdx === -1) {
    heroIdx = sorted.findIndex((a) => new Date(a.start_time).getTime() > now);
  }
  const hero = heroIdx >= 0 ? sorted[heroIdx] : null;
  const rest = sorted.filter((_, i) => i !== heroIdx);

  const weekMax = Math.max(1, ...dashboard.weekChart.map((d) => d.count));
  const activePatients = dashboard.today.totalClients || 0;
  const newWeek = dashboard.clients.newClientsWeek || 0;
  const monthRevenue = dashboard.monthRevenue || 0;
  // null = no comparable prior month → omit the badge entirely (vs a real 0%).
  const revDelta = dashboard.monthRevenueDeltaPct;
  const noShow = dashboard.noShowRate || 0;
  const noShowDelta = dashboard.noShowDeltaPct || 0;

  return (
    <div className={styles.feed}>
      <header className={styles.greeting}>
        <h1 className={styles.greetingTitle}>{greeting}, {displayName}</h1>
        <p className={styles.greetingSub}>
          {todayCount} {todayCount === 1 ? 'programare' : 'programări'} astăzi
          {urgent > 0 && (
            <> · <span className={styles.greetingUrgent}>{urgent} {urgent === 1 ? 'urgență' : 'urgențe'}</span></>
          )}
        </p>
      </header>

      {hero && (
        <Link
          href={hero.client_id ? `/clients/${hero.client_id}` : '/calendar'}
          className={styles.nowCard}
        >
          <div className={styles.nowGlow} aria-hidden />
          <div className={styles.nowTop}>
            <span className={styles.nowLabel}>
              <span className={styles.nowDot} />
              {inProgress ? 'Acum în cabinet' : 'Următoarea programare'}
            </span>
            <span className={styles.nowTime}>
              {format(new Date(hero.start_time), 'HH:mm', { locale: ro })}
              {' · '}
              {Math.max(0, Math.round((new Date(hero.end_time).getTime() - new Date(hero.start_time).getTime()) / 60000))} min
            </span>
          </div>
          <div className={styles.nowPatient}>
            <span className={styles.nowAvatar}>{initials(hero.client_name)}</span>
            <div className={styles.nowPatientText}>
              <div className={styles.nowName}>{hero.client_name}</div>
              <div className={styles.nowService}>{hero.service_name}</div>
            </div>
          </div>
          <div className={styles.nowMeta}>
            {hero.dentist_name && (
              <span className={styles.nowMetaItem}><UserIcon /> {hero.dentist_name}</span>
            )}
            <span className={styles.nowOpen}>Deschide fișa <span aria-hidden>›</span></span>
          </div>
        </Link>
      )}

      <section className={styles.dayCard}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardHeadTitle}>Restul zilei</h2>
          <Link href="/calendar" className={styles.cardLink}>Agenda completă</Link>
        </div>
        {rest.length === 0 ? (
          <p className={styles.dayEmpty}>Nu mai sunt programări astăzi.</p>
        ) : (
          <ul className={styles.dayList}>
            {rest.map((a) => {
              const s = statusInfo(a.status);
              const done = a.status === 'completed' || a.status === 'cancelled';
              return (
                <li key={a.id}>
                  <Link
                    href={a.client_id ? `/clients/${a.client_id}` : '/calendar'}
                    className={`${styles.dayRow} ${done ? styles.dayRowMuted : ''}`}
                  >
                    <span className={styles.dayTime}>{format(new Date(a.start_time), 'HH:mm', { locale: ro })}</span>
                    <span className={`${styles.dayDot} ${s.dot}`} />
                    <span className={styles.dayMain}>
                      <span className={styles.dayName}>{a.client_name}</span>
                      <span className={styles.dayService}>{a.service_name}</span>
                    </span>
                    <span className={`${styles.dayStatus} ${s.cls}`}>{s.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.weekCard}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardHeadTitle}>Săptămâna aceasta</h2>
          <span className={styles.weekTotal}>{week} programări</span>
        </div>

        <div className={styles.weekChart}>
          {dashboard.weekChart.map((d, i) => {
            const h = weekMax > 0 ? Math.round((d.count / weekMax) * 100) : 0;
            return (
              <div key={i} className={styles.weekCol}>
                <div className={styles.weekBarTrack}>
                  <div
                    className={`${styles.weekBar} ${d.isToday ? styles.weekBarToday : ''}`}
                    style={{ height: `${d.count > 0 ? Math.max(10, h) : 6}%`, animationDelay: `${i * 55}ms` }}
                    title={`${d.count} ${d.count === 1 ? 'programare' : 'programări'}`}
                  />
                </div>
                <span className={`${styles.weekDay} ${d.isToday ? styles.weekDayToday : ''}`}>{d.label}</span>
              </div>
            );
          })}
        </div>

        <div className={styles.weekStats}>
          <div className={styles.weekStat}>
            <span className={styles.weekStatValue}>{activePatients}</span>
            <span className={styles.weekStatLabel}>Pacienți activi</span>
            {newWeek > 0 && <span className={styles.weekDeltaUp}>+{newWeek}</span>}
          </div>
          <div className={styles.weekStat}>
            <span className={styles.weekStatValue}>{formatRevenue(monthRevenue)}</span>
            <span className={styles.weekStatLabel}>Venituri · lună</span>
            {revDelta !== null && (
              <span className={revDelta >= 0 ? styles.weekDeltaUp : styles.weekDeltaDown}>
                {revDelta >= 0 ? '+' : ''}{revDelta}%
              </span>
            )}
          </div>
          <div className={styles.weekStat}>
            <span className={styles.weekStatValue}>{noShow}%</span>
            <span className={styles.weekStatLabel}>Neprezentări</span>
            {noShowDelta !== 0 && (
              <span className={noShowDelta <= 0 ? styles.weekDeltaUp : styles.weekDeltaDown}>
                {noShowDelta > 0 ? '+' : ''}{noShowDelta}%
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
