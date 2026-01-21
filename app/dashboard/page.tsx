'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard?userId=1&days=7');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      
      // Ensure all required fields exist with defaults
      setData({
        messagesPerDay: result.messagesPerDay || [],
        appointmentsPerDay: result.appointmentsPerDay || [],
        today: {
          messages: result.today?.messages || 0,
          appointments: result.today?.appointments || 0,
          totalClients: result.today?.totalClients || 0,
          appointmentsList: result.today?.appointmentsList || [],
        },
        noShowRate: result.noShowRate || 0,
        estimatedRevenue: result.estimatedRevenue || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Set default data on error
      setData({
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
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.container}>Se încarcă...</div>;
  }

  if (!data) {
    return <div className={styles.container}>Eroare la încărcarea datelor</div>;
  }

  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <Link href="/">
          <h1 className={styles.logo}>OpsGenie</h1>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/dashboard" className={styles.active}>Dashboard</Link>
          <Link href="/inbox">Inbox</Link>
          <Link href="/calendar">Calendar</Link>
          <Link href="/clients">Clienți</Link>
        </div>
      </nav>

      <main className={styles.main}>
        <h2 className={styles.title}>Dashboard</h2>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Mesaje astăzi</div>
            <div className={styles.statValue}>{data.today?.messages || 0}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Programări astăzi</div>
            <div className={styles.statValue}>{data.today?.appointments || 0}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total clienți</div>
            <div className={styles.statValue}>{data.today?.totalClients || 0}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Rată no-show</div>
            <div className={styles.statValue}>{data.noShowRate || 0}%</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Venit estimat (7 zile)</div>
            <div className={styles.statValue}>{((data.estimatedRevenue || 0)).toFixed(2)} lei</div>
          </div>
        </div>

        <div className={styles.charts}>
          <div className={styles.chartCard}>
            <h3>Mesaje pe zi (ultimele 7 zile)</h3>
            <div className={styles.barChart}>
              {data.messagesPerDay && data.messagesPerDay.length > 0 ? (
                data.messagesPerDay.map((item, idx) => {
                  const maxCount = Math.max(...data.messagesPerDay.map(m => m.count || 0), 1);
                  let dateStr = '';
                  try {
                    const date = item.date ? new Date(item.date) : null;
                    if (date && !isNaN(date.getTime())) {
                      dateStr = date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
                    } else {
                      dateStr = String(item.date || '').split('T')[0];
                    }
                  } catch (e) {
                    dateStr = String(item.date || '');
                  }
                  const barHeight = maxCount > 0 ? ((item.count || 0) / maxCount) * 100 : 0;
                  return (
                    <div key={idx} className={styles.barItem}>
                      <div className={styles.barValue}>{item.count || 0}</div>
                      <div className={styles.barContainer}>
                        <div
                          className={styles.bar}
                          style={{ height: `${barHeight}%` }}
                        />
                      </div>
                      <div className={styles.barLabel}>{dateStr}</div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                  Nu există date pentru ultimele 7 zile
                </div>
              )}
            </div>
          </div>

          <div className={styles.chartCard}>
            <h3>Programări astăzi</h3>
            <div className={styles.appointmentsList}>
              {data.today?.appointmentsList && data.today.appointmentsList.length > 0 ? (
                data.today.appointmentsList.map((apt) => {
                  const startTime = new Date(apt.start_time);
                  const endTime = new Date(apt.end_time);
                  const status = apt.status || 'scheduled';
                  const statusClass = status 
                    ? styles[`status${status.charAt(0).toUpperCase() + status.slice(1).replace('_', '')}`] || ''
                    : '';
                  
                  return (
                    <div key={apt.id} className={styles.appointmentItem}>
                      <div className={styles.appointmentTime}>
                        <span className={styles.timeStart}>
                          {format(startTime, 'HH:mm', { locale: ro })}
                        </span>
                        <span className={styles.timeSeparator}>–</span>
                        <span className={styles.timeEnd}>
                          {format(endTime, 'HH:mm', { locale: ro })}
                        </span>
                      </div>
                      <div className={styles.appointmentDetails}>
                        <div className={styles.appointmentClient}>{apt.client_name || 'Unknown'}</div>
                        <div className={styles.appointmentService}>{apt.service_name || 'Unknown'}</div>
                      </div>
                      <div className={`${styles.appointmentStatus} ${statusClass}`}>
                        {status}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.emptyAppointments}>
                  <p>Nu există programări pentru astăzi</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

