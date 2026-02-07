'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import navStyles from '../../dashboard/page.module.css';

interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  tags: string[];
  notes: string | null;
  total_spent: number;
  total_appointments: number;
  last_appointment_date: string | null;
  last_conversation_date: string | null;
  first_contact_date: string;
}

interface Appointment {
  id: number;
  service_name: string;
  service_price: number;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
}

interface Conversation {
  id: number;
  channel: string;
  subject: string;
  status: string;
  message_count: number;
  updated_at: string;
}

interface ClientProfileClientProps {
  clientId: string;
  initialClient: Client | null;
  initialAppointments: Appointment[];
  initialConversations: Conversation[];
  initialStats: any | null;
}

export default function ClientProfileClient({
  clientId,
  initialClient,
  initialAppointments,
  initialConversations,
  initialStats,
}: ClientProfileClientProps) {
  const [client, setClient] = useState<Client | null>(initialClient);
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [tasks, setTasks] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(initialStats);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'appointments' | 'conversations' | 'tasks' | 'files'>('overview');
  const [activityFilter, setActivityFilter] = useState<'all' | 'notes' | 'emails' | 'tasks' | 'appointments'>('all');
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showUploadFile, setShowUploadFile] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  useEffect(() => {
    setClient(initialClient);
    setAppointments(initialAppointments);
    setConversations(initialConversations);
    setStats(initialStats);
    setLoading(false);
  }, [clientId, initialClient, initialAppointments, initialConversations, initialStats]);

  useEffect(() => {
    if (!clientId) return;
    if (!initialClient) {
      fetchClientData();
    }
    if (!initialStats) {
      fetchStats();
    }
  }, [clientId, initialClient, initialStats]);

  useEffect(() => {
    if (!clientId) return;
    if (activeTab === 'activities') {
      fetchActivities();
    } else if (activeTab === 'tasks') {
      fetchTasks();
    } else if (activeTab === 'files') {
      fetchFiles();
    }
  }, [clientId, activeTab, activityFilter]);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/clients/${clientId}`);
      if (!response.ok) throw new Error('Failed to fetch client');

      const result = await response.json();
      setClient(result.client);
      setAppointments(result.appointments || []);
      setConversations(result.conversations || []);
    } catch (error) {
      console.error('Error fetching client:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/activities?type=${activityFilter}`);
      if (!response.ok) throw new Error('Failed to fetch activities');
      const result = await response.json();
      setActivities(result.activities || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      const response = await fetch(`/api/tasks?contactId=${clientId}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const result = await response.json();
      setTasks(result.tasks || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/files`);
      if (!response.ok) throw new Error('Failed to fetch files');
      const result = await response.json();
      setFiles(result.files || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const result = await response.json();
      setStats(result.stats || null);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    try {
      const response = await fetch(`/api/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 1, content: noteContent }),
      });
      if (!response.ok) throw new Error('Failed to add note');
      setNoteContent('');
      setShowAddNote(false);
      fetchClientData();
      if (activeTab === 'activities') fetchActivities();
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Eroare la adăugarea notei');
    }
  };

  const handleAddTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 1,
          contactId: parseInt(clientId),
          title: taskTitle,
          description: taskDescription,
          dueDate: taskDueDate || null,
          status: 'open',
        }),
      });
      if (!response.ok) throw new Error('Failed to add task');
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate('');
      setShowAddTask(false);
      fetchTasks();
      if (activeTab === 'activities') fetchActivities();
    } catch (error) {
      console.error('Error adding task:', error);
      alert('Eroare la adăugarea task-ului');
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/clients/${clientId}/files`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to upload file');
      setShowUploadFile(false);
      fetchFiles();
      if (activeTab === 'activities') fetchActivities();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Eroare la încărcarea fișierului');
    }
  };

  const handleCompleteTask = async (taskId: number) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!response.ok) throw new Error('Failed to complete task');
      fetchTasks();
      if (activeTab === 'activities') fetchActivities();
    } catch (error) {
      console.error('Error completing task:', error);
      alert('Eroare la finalizarea task-ului');
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Sigur vrei să ștergi acest fișier?')) return;
    try {
      const response = await fetch(`/api/clients/${clientId}/files/${fileId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete file');
      fetchFiles();
      if (activeTab === 'activities') fetchActivities();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Eroare la ștergerea fișierului');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Niciodată';
    const date = new Date(dateString);
    return date.toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
    }).format(amount);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'vip': return styles.badgeVip;
      case 'active': return styles.badgeActive;
      case 'lead': return styles.badgeLead;
      case 'inactive': return styles.badgeInactive;
      default: return styles.badgeDefault;
    }
  };

  const getAppointmentStatusClass = (status: string) => {
    switch (status) {
      case 'completed': return styles.statusCompleted;
      case 'scheduled': return styles.statusScheduled;
      case 'cancelled': return styles.statusCancelled;
      case 'no-show': return styles.statusNoShow;
      default: return styles.statusDefault;
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Se încarcă...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Clientul nu a fost găsit.</p>
          <Link href="/clients" className={styles.backButton} prefetch>
            Înapoi la listă
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={navStyles.container}>
      <nav className={navStyles.nav}>
        <Link href="/" prefetch>
          <h1 className={navStyles.logo}>OpsGenie</h1>
        </Link>
        <div className={navStyles.navLinks}>
          <Link href="/dashboard" prefetch>Dashboard</Link>
          <Link href="/inbox" prefetch>Inbox</Link>
          <Link href="/calendar" prefetch>Calendar</Link>
          <Link href="/clients" className={navStyles.active} prefetch>Clienți</Link>
          <Link href="/settings/email" prefetch>Setări</Link>
        </div>
      </nav>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/clients" className={styles.backLink} prefetch>
            ← Înapoi
          </Link>
        <div className={styles.headerContent}>
          <div>
            <h1>{client.name}</h1>
            <div className={styles.meta}>
              <span className={`${styles.badge} ${getStatusBadgeClass(client.status)}`}>
                {client.status.toUpperCase()}
              </span>
              {client.total_spent >= 1000 && (
                <span className={`${styles.badge} ${styles.badgeVip}`}>
                  VIP
                </span>
              )}
              {client.last_appointment_date && (() => {
                const lastApp = new Date(client.last_appointment_date);
                const daysSince = Math.floor((Date.now() - lastApp.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSince > 30) {
                  return <span className={`${styles.badge} ${styles.badgeInactive}`}>INACTIV</span>;
                }
                return null;
              })()}
              {(() => {
                const created = new Date(client.first_contact_date);
                const daysSince = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSince <= 7) {
                  return <span className={`${styles.badge} ${styles.badgeLead}`}>NOU</span>;
                }
                return null;
              })()}
              {client.email && <span className={styles.email}>{client.email}</span>}
              {client.phone && <span className={styles.phone}>{client.phone}</span>}
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link href={`/clients/${clientId}/edit`} className={styles.editButton} prefetch>
              Editează
            </Link>
            <button onClick={() => setShowAddNote(true)} className={styles.actionButton}>
              + Notă
            </button>
            <button onClick={() => setShowAddTask(true)} className={styles.actionButton}>
              + Task
            </button>
            <label className={styles.actionButton}>
              + Fișier
              <input type="file" style={{ display: 'none' }} onChange={handleUploadFile} />
            </label>
            <Link href={`/calendar?contactId=${clientId}`} className={styles.actionButton} prefetch>
              + Programare
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total cheltuit</div>
          <div className={styles.statValue}>{formatCurrency(client.total_spent)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Programări</div>
          <div className={styles.statValue}>{client.total_appointments}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Ultima vizită</div>
          <div className={styles.statValue}>
            {formatDate(client.last_appointment_date)}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Prima contactare</div>
          <div className={styles.statValue}>
            {formatDate(client.first_contact_date)}
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={activeTab === 'overview' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('overview')}
        >
          Prezentare generală
        </button>
        <button
          className={activeTab === 'activities' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('activities')}
        >
          Activitate ({activities.length})
        </button>
        <button
          className={activeTab === 'tasks' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('tasks')}
        >
          Task-uri ({tasks.filter(t => t.status === 'open').length})
        </button>
        <button
          className={activeTab === 'appointments' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('appointments')}
        >
          Programări ({appointments.length})
        </button>
        <button
          className={activeTab === 'conversations' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('conversations')}
        >
          Conversații ({conversations.length})
        </button>
        <button
          className={activeTab === 'files' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('files')}
        >
          Fișiere ({files.length})
        </button>
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'overview' && (
          <div className={styles.overview}>
            <div className={styles.section}>
              <h2>Informații de contact</h2>
              <div className={styles.infoGrid}>
                <div>
                  <label>Email</label>
                  <p>{client.email || 'N/A'}</p>
                </div>
                <div>
                  <label>Telefon</label>
                  <p>{client.phone || 'N/A'}</p>
                </div>
                <div>
                  <label>Sursă</label>
                  <p>{client.source}</p>
                </div>
                <div>
                  <label>Status</label>
                  <p>{client.status}</p>
                </div>
              </div>
            </div>

            {stats && (
              <div className={styles.section}>
                <h2>Statistici detaliate</h2>
                <div className={styles.statsGrid}>
                  <div className={styles.statItem}>
                    <label>Valoare medie programare</label>
                    <p>{formatCurrency(stats.average_appointment_value || 0)}</p>
                  </div>
                  <div className={styles.statItem}>
                    <label>Frecvență vizite</label>
                    <p>{stats.visit_frequency?.toFixed(1) || 0} / lună</p>
                  </div>
                  <div className={styles.statItem}>
                    <label>Rată no-show</label>
                    <p>{stats.no_show_rate?.toFixed(1) || 0}%</p>
                  </div>
                  <div className={styles.statItem}>
                    <label>Programări finalizate</label>
                    <p>{stats.completed_appointments || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {stats && stats.preferred_services && stats.preferred_services.length > 0 && (
              <div className={styles.section}>
                <h2>Servicii preferate</h2>
                <div className={styles.preferredServices}>
                  {stats.preferred_services.map((service: any, idx: number) => (
                    <div key={idx} className={styles.serviceItem}>
                      <div className={styles.serviceName}>{service.name}</div>
                      <div className={styles.serviceStats}>
                        <span>{service.count} programări</span>
                        <span>{formatCurrency(service.total_spent)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {client.tags && client.tags.length > 0 && (
              <div className={styles.section}>
                <h2>Tag-uri</h2>
                <div className={styles.tags}>
                  {client.tags.map((tag, idx) => (
                    <span key={idx} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className={styles.appointments}>
            {appointments.length === 0 ? (
              <div className={styles.empty}>Nu există programări.</div>
            ) : (
              <div className={styles.list}>
                {appointments.map((apt) => (
                  <div key={apt.id} className={styles.appointmentItem}>
                    <div className={styles.appointmentHeader}>
                      <h3>{apt.service_name}</h3>
                      <span className={`${styles.statusBadge} ${getAppointmentStatusClass(apt.status)}`}>
                        {apt.status}
                      </span>
                    </div>
                    <div className={styles.appointmentDetails}>
                      <p><strong>Data:</strong> {formatDate(apt.start_time)}</p>
                      <p><strong>Preț:</strong> {formatCurrency(apt.service_price)}</p>
                      {apt.notes && <p><strong>Notițe:</strong> {apt.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'conversations' && (
          <div className={styles.conversations}>
            {conversations.length === 0 ? (
              <div className={styles.empty}>Nu există conversații.</div>
            ) : (
              <div className={styles.list}>
                {conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/inbox?conversation=${conv.id}`}
                    className={styles.conversationItem}
                    prefetch
                  >
                    <div className={styles.conversationHeader}>
                      <h3>{conv.subject || 'Fără subiect'}</h3>
                      <span className={styles.channel}>{conv.channel}</span>
                    </div>
                    <div className={styles.conversationDetails}>
                      <p>{conv.message_count} mesaje</p>
                      <p>{formatDate(conv.updated_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'activities' && (
          <div className={styles.activities}>
            <div className={styles.activityFilters}>
              <button
                className={activityFilter === 'all' ? styles.filterActive : styles.filter}
                onClick={() => setActivityFilter('all')}
              >
                Toate
              </button>
              <button
                className={activityFilter === 'notes' ? styles.filterActive : styles.filter}
                onClick={() => setActivityFilter('notes')}
              >
                Notițe
              </button>
              <button
                className={activityFilter === 'emails' ? styles.filterActive : styles.filter}
                onClick={() => setActivityFilter('emails')}
              >
                Email-uri
              </button>
              <button
                className={activityFilter === 'tasks' ? styles.filterActive : styles.filter}
                onClick={() => setActivityFilter('tasks')}
              >
                Task-uri
              </button>
              <button
                className={activityFilter === 'appointments' ? styles.filterActive : styles.filter}
                onClick={() => setActivityFilter('appointments')}
              >
                Programări
              </button>
            </div>
            {activities.length === 0 ? (
              <div className={styles.empty}>Nu există activități.</div>
            ) : (
              <div className={styles.activityList}>
                {activities.map((activity) => (
                  <div key={`${activity.activity_type}-${activity.id}`} className={styles.activityItem}>
                    <div className={styles.activityIcon}>
                      {activity.activity_type === 'note' && '📝'}
                      {activity.activity_type === 'email' && '📧'}
                      {activity.activity_type === 'task' && '✓'}
                      {activity.activity_type === 'appointment' && '📅'}
                    </div>
                    <div className={styles.activityContent}>
                      <h4>{activity.title}</h4>
                      {activity.description && <p>{activity.description}</p>}
                      <span className={styles.activityDate}>
                        {formatDate(activity.activity_date || activity.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className={styles.tasks}>
            {tasks.length === 0 ? (
              <div className={styles.empty}>Nu există task-uri.</div>
            ) : (
              <>
                {tasks.filter(t => {
                  if (t.status === 'completed') return false;
                  if (!t.due_date) return false;
                  return new Date(t.due_date) < new Date();
                }).length > 0 && (
                  <div className={styles.overdueSection}>
                    <h3 className={styles.overdueTitle}>⚠️ Task-uri depășite</h3>
                    <div className={styles.list}>
                      {tasks
                        .filter(t => {
                          if (t.status === 'completed') return false;
                          if (!t.due_date) return false;
                          return new Date(t.due_date) < new Date();
                        })
                        .map((task) => (
                          <div key={task.id} className={`${styles.taskItem} ${styles.taskOverdue}`}>
                            <div className={styles.taskHeader}>
                              <h3>{task.title}</h3>
                              <span className={`${styles.statusBadge} ${styles.statusOverdue}`}>
                                Depășit
                              </span>
                            </div>
                            {task.description && <p>{task.description}</p>}
                            {task.due_date && (
                              <p><strong>Termen:</strong> {formatDate(task.due_date)}</p>
                            )}
                            {task.status !== 'completed' && (
                              <button
                                onClick={() => handleCompleteTask(task.id)}
                                className={styles.completeButton}
                              >
                                ✓ Marchează ca finalizat
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                <div className={styles.list}>
                  {tasks
                    .filter(t => {
                      if (t.status === 'completed') return false;
                      if (!t.due_date) return true;
                      return new Date(t.due_date) >= new Date();
                    })
                    .map((task) => (
                      <div key={task.id} className={styles.taskItem}>
                        <div className={styles.taskHeader}>
                          <h3>{task.title}</h3>
                          <span className={`${styles.statusBadge} ${task.status === 'completed' ? styles.statusCompleted : styles.statusScheduled}`}>
                            {task.status}
                          </span>
                        </div>
                        {task.description && <p>{task.description}</p>}
                        {task.due_date && (
                          <p><strong>Termen:</strong> {formatDate(task.due_date)}</p>
                        )}
                        {task.status !== 'completed' && (
                          <button
                            onClick={() => handleCompleteTask(task.id)}
                            className={styles.completeButton}
                          >
                            ✓ Marchează ca finalizat
                          </button>
                        )}
                      </div>
                    ))}
                </div>
                {tasks.filter(t => t.status === 'completed').length > 0 && (
                  <div className={styles.completedSection}>
                    <h3 className={styles.completedTitle}>✓ Task-uri finalizate</h3>
                    <div className={styles.list}>
                      {tasks
                        .filter(t => t.status === 'completed')
                        .map((task) => (
                          <div key={task.id} className={`${styles.taskItem} ${styles.taskCompleted}`}>
                            <div className={styles.taskHeader}>
                              <h3>{task.title}</h3>
                              <span className={`${styles.statusBadge} ${styles.statusCompleted}`}>
                                Finalizat
                              </span>
                            </div>
                            {task.description && <p>{task.description}</p>}
                            {task.due_date && (
                              <p><strong>Termen:</strong> {formatDate(task.due_date)}</p>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className={styles.files}>
            {files.length === 0 ? (
              <div className={styles.empty}>Nu există fișiere.</div>
            ) : (
              <div className={styles.list}>
                {files.map((file) => (
                  <div key={file.id} className={styles.fileItem}>
                    <div className={styles.fileIcon}>📎</div>
                    <div className={styles.fileContent}>
                      <h4>{file.original_filename}</h4>
                      {file.description && <p>{file.description}</p>}
                      <span className={styles.fileMeta}>
                        {formatDate(file.created_at)} • {(file.file_size / 1024).toFixed(2)} KB
                      </span>
                    </div>
                    <div className={styles.fileActions}>
                      {(file.mime_type?.startsWith('image/') ||
                        file.mime_type === 'application/pdf' ||
                        file.mime_type?.startsWith('text/')) && (
                        <a
                          href={`/api/clients/${clientId}/files/${file.id}/preview`}
                          target="_blank"
                          className={styles.previewButton}
                        >
                          👁 Preview
                        </a>
                      )}
                      <a
                        href={`/api/clients/${clientId}/files/${file.id}/download`}
                        target="_blank"
                        className={styles.downloadButton}
                      >
                        ⬇ Descarcă
                      </a>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className={styles.deleteButton}
                      >
                        🗑 Șterge
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddNote && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Adaugă Notă</h3>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Scrie notița aici..."
              rows={5}
              className={styles.modalTextarea}
            />
            <div className={styles.modalActions}>
              <button onClick={() => { setShowAddNote(false); setNoteContent(''); }} className={styles.cancelButton}>
                Anulează
              </button>
              <button onClick={handleAddNote} className={styles.submitButton}>
                Salvează
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddTask && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Adaugă Task</h3>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Titlu task..."
              className={styles.modalInput}
            />
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Descriere..."
              rows={3}
              className={styles.modalTextarea}
            />
            <input
              type="datetime-local"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              className={styles.modalInput}
            />
            <div className={styles.modalActions}>
              <button onClick={() => { setShowAddTask(false); setTaskTitle(''); setTaskDescription(''); setTaskDueDate(''); }} className={styles.cancelButton}>
                Anulează
              </button>
              <button onClick={handleAddTask} className={styles.submitButton}>
                Salvează
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
