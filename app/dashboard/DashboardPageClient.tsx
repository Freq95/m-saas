'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { authFetcher } from '@/lib/fetcher';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from './page.module.css';

interface Appointment {
  id: number;
  client_name: string;
  service_name: string;
  start_time: string;
  end_time: string;
  status: string;
}

interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  total_spent: number;
  total_appointments: number;
  last_appointment_date: string | null;
}

interface DashboardData {
  messagesPerDay: Array<{ date: string; count: number }>;
  appointmentsPerDay: Array<{ date: string; count: number }>;
  today: {
    messages: number;
    appointments: number;
    totalClients: number;
    appointmentsList: Appointment[];
  };
  noShowRate: number;
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
  today: {
    messages: 0,
    appointments: 0,
    totalClients: 0,
    appointmentsList: [],
  },
  noShowRate: 0,
  estimatedRevenue: 0,
  clients: {
    topClients: [],
    newClientsToday: 0,
    newClientsWeek: 0,
    inactiveClients: [],
    growth: [],
  },
};

function DashboardSkeleton() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className="skeleton skeleton-line" style={{ width: '180px', height: '24px', marginBottom: '1.5rem' }} />

        <div className={styles.statsGrid}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="skeleton skeleton-stat" />
          ))}
        </div>

        <div className={styles.charts}>
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>

        <div className={styles.clientGrid}>
          <div className="skeleton skeleton-card" style={{ height: '260px' }} />
          <div className="skeleton skeleton-card" style={{ height: '260px' }} />
          <div className="skeleton skeleton-card" style={{ height: '260px' }} />
        </div>
      </main>
    </div>
  );
}

export default function DashboardPageClient() {
  const router = useRouter();
  const { status } = useSession();
  const key = status === 'authenticated' ? '/api/dashboard?days=7' : null;

  const { data, error, isLoading, mutate } = useSWR<DashboardData>(key, fetchDashboard, {
    revalidateOnFocus: false,
    dedupingInterval: 10000,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated' || isLoading) {
    return <DashboardSkeleton />;
  }

  if (error && !isLoading) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <h2 className={styles.title}>Eroare la incarcarea dashboard-ului</h2>
          <p>Nu am putut incarca datele. Verificati conexiunea si incercati din nou.</p>
          <button type="button" onClick={() => mutate()} className={styles.retryButton}>
            Reincearca
          </button>
        </main>
      </div>
    );
  }

  const dashboard = data ?? EMPTY_DASHBOARD;
  const messagesPerDayMaxCount = Math.max(...dashboard.messagesPerDay.map((item) => item.count || 0), 1);
  const clientGrowthMaxCount = Math.max(...dashboard.clients.growth.map((item) => item.count || 0), 1);

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Mesaje astazi</div>
            <div className={styles.statValue}>{dashboard.today.messages || 0}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Programari astazi</div>
            <div className={styles.statValue}>{dashboard.today.appointments || 0}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total clienti</div>
            <div className={styles.statValue}>{dashboard.today.totalClients || 0}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Clienti noi (saptamana)</div>
            <div className={styles.statValue}>{dashboard.clients.newClientsWeek || 0}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Rata no-show</div>
            <div className={styles.statValue}>{dashboard.noShowRate || 0}%</div>
          </div>

        </div>

        <div className={styles.charts}>
          <div className={styles.chartCard}>
            <h3>Mesaje pe zi (ultimele 7 zile)</h3>
            <div className={styles.barChart}>
              {dashboard.messagesPerDay.length > 0 ? (
                dashboard.messagesPerDay.map((item, idx) => {
                  const date = new Date(item.date);
                  const dateStr = Number.isNaN(date.getTime())
                    ? String(item.date || '').split('T')[0]
                    : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
                  const barHeight = messagesPerDayMaxCount > 0 ? ((item.count || 0) / messagesPerDayMaxCount) * 100 : 0;
                  return (
                    <div key={idx} className={styles.barItem}>
                      <div className={styles.barValue}>{item.count || 0}</div>
                      <div className={styles.barContainer}>
                        <div className={styles.bar} style={{ height: `${barHeight}%` }} />
                      </div>
                      <div className={styles.barLabel}>{dateStr}</div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Nu exista date pentru ultimele 7 zile
                </div>
              )}
            </div>
          </div>

          <div className={styles.chartCard}>
            <h3>Crestere Clienti (7 zile)</h3>
            <div className={styles.growthChart}>
              {dashboard.clients.growth.length > 0 ? (
                dashboard.clients.growth.map((item, idx) => {
                  const date = new Date(item.date);
                  const dateStr = Number.isNaN(date.getTime())
                    ? String(item.date || '').split('T')[0]
                    : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
                  const barHeight = clientGrowthMaxCount > 0 ? ((item.count || 0) / clientGrowthMaxCount) * 100 : 0;
                  return (
                    <div key={idx} className={styles.growthBar}>
                      <div className={styles.growthValue}>{item.count || 0}</div>
                      <div className={styles.growthBarContainer}>
                        <div className={styles.growthBarFill} style={{ height: `${barHeight}%` }} />
                      </div>
                      <div className={styles.growthLabel}>{dateStr}</div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.empty}>Nu exista date</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.clientsSection}>
          <div className={styles.clientGrid}>
            <div className={styles.clientCard}>
              <h4>Top Clienti</h4>
              {dashboard.clients.topClients.length > 0 ? (
                <div className={styles.clientList}>
                  {dashboard.clients.topClients.map((client) => (
                    <Link key={client.id} href={`/clients/${client.id}`} className={styles.clientItem}>
                      <div className={styles.clientName}>{client.name}</div>
                      <div className={styles.clientStats}>
                        <span>{(client.total_spent || 0).toFixed(2)} lei</span>
                        <span>{client.total_appointments || 0} programari</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>Nu exista clienti cu cheltuieli</div>
              )}
            </div>

            <div className={styles.clientCard}>
              <h4>Clienti Inactivi (30+ zile)</h4>
              {dashboard.clients.inactiveClients.length > 0 ? (
                <>
                  <div className={styles.clientList}>
                    {dashboard.clients.inactiveClients.slice(0, 5).map((client) => (
                      <Link key={client.id} href={`/clients/${client.id}`} className={styles.clientItem}>
                        <div className={styles.clientName}>{client.name}</div>
                        <div className={styles.clientMeta}>
                          {client.last_appointment_date
                            ? `Ultima vizita: ${format(new Date(client.last_appointment_date), 'dd MMM yyyy', { locale: ro })}`
                            : 'Fara programari'}
                        </div>
                      </Link>
                    ))}
                  </div>
                  {dashboard.clients.inactiveClients.length > 5 && (
                    <Link href="/clients?filter=inactive" className={styles.viewAllLink}>
                      Vezi toti ({dashboard.clients.inactiveClients.length})
                    </Link>
                  )}
                </>
              ) : (
                <div className={styles.empty}>Toti clientii sunt activi. Felicitari!</div>
              )}
            </div>

            <div className={styles.clientCard}>
              <h4>Programari astazi</h4>
              <div className={styles.appointmentsList}>
                {dashboard.today.appointmentsList.length > 0 ? (
                  dashboard.today.appointmentsList.map((apt) => {
                    const startTime = new Date(apt.start_time);
                    const endTime = new Date(apt.end_time);
                    const statusValue = apt.status === 'no_show' ? 'no-show' : (apt.status || 'scheduled');
                    const statusLabel = {
                      scheduled: 'Programat',
                      completed: 'Finalizat',
                      cancelled: 'Anulat',
                      'no-show': 'Absent',
                    }[statusValue] || statusValue;
                    const statusClass = {
                      scheduled: styles.statusScheduled,
                      completed: styles.statusCompleted,
                      cancelled: styles.statusCancelled,
                      'no-show': styles.statusNoShow,
                    }[statusValue] || '';

                    return (
                      <div key={apt.id} className={styles.appointmentItem}>
                        <div className={styles.appointmentTime}>
                          <span className={styles.timeStart}>
                            {format(startTime, 'HH:mm', { locale: ro })}
                          </span>
                          <span className={styles.timeSeparator}>-</span>
                          <span className={styles.timeEnd}>
                            {format(endTime, 'HH:mm', { locale: ro })}
                          </span>
                        </div>
                        <div className={styles.appointmentDetails}>
                          <div className={styles.appointmentClient}>{apt.client_name || 'Unknown'}</div>
                          <div className={styles.appointmentService}>{apt.service_name || 'Unknown'}</div>
                        </div>
                        <div className={`${styles.appointmentStatus} ${statusClass}`}>{statusLabel}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyAppointments}>
                    <p>Nu exista programari pentru astazi</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
