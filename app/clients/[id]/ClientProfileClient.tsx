'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import navStyles from '../../dashboard/page.module.css';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import ClientCreateModal from '@/components/ClientCreateModal';
import { logger } from '@/lib/logger';

interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
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
  const [files, setFiles] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(initialStats);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'appointments' | 'conversations' | 'files'>('overview');
  const [activityFilter, setActivityFilter] = useState<'all' | 'notes' | 'emails' | 'appointments'>('all');
  const [showAddNote, setShowAddNote] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [pendingDeleteFileId, setPendingDeleteFileId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const { toasts, removeToast, error: toastError } = useToast();

  useEffect(() => {
    setClient(initialClient);
    setAppointments(initialAppointments);
    setConversations(initialConversations);
    setStats(initialStats);
    setLoading(false);
  }, [clientId, initialAppointments, initialClient, initialConversations, initialStats]);

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
    fetchFiles();
    fetchActivities();
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    if (activeTab === 'activities') {
      fetchActivities();
    } else if (activeTab === 'files') {
      fetchFiles();
    }
  }, [activeTab, activityFilter, clientId]);

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
      logger.error('Client profile: failed to fetch client data', error instanceof Error ? error : new Error(String(error)), {
        clientId,
      });
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
      logger.error('Client profile: failed to fetch activities', error instanceof Error ? error : new Error(String(error)), {
        clientId,
        filter: activityFilter,
      });
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/files`);
      if (!response.ok) throw new Error('Failed to fetch files');
      const result = await response.json();
      setFiles(result.files || []);
    } catch (error) {
      logger.error('Client profile: failed to fetch files', error instanceof Error ? error : new Error(String(error)), {
        clientId,
      });
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const result = await response.json();
      setStats(result.stats || null);
    } catch (error) {
      logger.error('Client profile: failed to fetch stats', error instanceof Error ? error : new Error(String(error)), {
        clientId,
      });
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
      logger.error('Client profile: failed to add note', error instanceof Error ? error : new Error(String(error)), {
        clientId,
      });
      toastError('Eroare la adaugarea notei');
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
      fetchFiles();
      if (activeTab === 'activities') fetchActivities();
    } catch (error) {
      logger.error('Client profile: failed to upload file', error instanceof Error ? error : new Error(String(error)), {
        clientId,
      });
      toastError('Eroare la incarcarea fisierului');
    }
  };

  const handleDeleteFile = (fileId: number) => {
    setPendingDeleteFileId(fileId);
  };

  const confirmDeleteFile = async () => {
    if (!pendingDeleteFileId) return;
    const fileId = pendingDeleteFileId;
    setPendingDeleteFileId(null);
    try {
      const response = await fetch(`/api/clients/${clientId}/files/${fileId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete file');
      fetchFiles();
      if (activeTab === 'activities') fetchActivities();
    } catch (error) {
      logger.error('Client profile: failed to delete file', error instanceof Error ? error : new Error(String(error)), {
        clientId,
        fileId,
      });
      toastError('Eroare la stergerea fisierului');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Niciodata';
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

  const getAppointmentStatusClass = (status: string) => {
    switch (status) {
      case 'completed':
        return styles.statusCompleted;
      case 'scheduled':
        return styles.statusScheduled;
      case 'cancelled':
        return styles.statusCancelled;
      case 'no-show':
        return styles.statusNoShow;
      default:
        return styles.statusDefault;
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Se incarca...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Clientul nu a fost gasit.</p>
          <Link href="/clients" className={styles.backButton} prefetch>
            Inapoi la lista
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/clients" className={styles.backLink} prefetch>
            Inapoi
          </Link>
          <div className={styles.headerContent}>
            <div>
              <h1>{client.name}</h1>
              <div className={styles.meta}>
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
              <button
                type="button"
                className={styles.editButton}
                onClick={() => setShowEditClient(true)}
              >
                Editeaza
              </button>
              <button onClick={() => setShowAddNote(true)} className={styles.actionButton}>
                + Nota
              </button>
              <label className={styles.actionButton}>
                + Fisier
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
            <div className={styles.statLabel}>Programari</div>
            <div className={styles.statValue}>{client.total_appointments}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Ultima vizita</div>
            <div className={styles.statValue}>{formatDate(client.last_appointment_date)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Prima contactare</div>
            <div className={styles.statValue}>{formatDate(client.first_contact_date)}</div>
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            className={activeTab === 'overview' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('overview')}
          >
            Prezentare generala
          </button>
          <button
            className={activeTab === 'activities' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('activities')}
          >
            Activitate ({activities.length})
          </button>
          <button
            className={activeTab === 'appointments' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('appointments')}
          >
            Programari ({appointments.length})
          </button>
          <button
            className={activeTab === 'conversations' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('conversations')}
          >
            Conversatii ({conversations.length})
          </button>
          <button
            className={activeTab === 'files' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('files')}
          >
            Fisiere ({files.length})
          </button>
        </div>

        <div className={styles.tabContent}>
          {activeTab === 'overview' && (
            <div className={styles.overview}>
              <div className={styles.section}>
                <h2>Informatii de contact</h2>
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
                    <label>Prima contactare</label>
                    <p>{formatDate(client.first_contact_date)}</p>
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
                      <label>Frecventa vizite</label>
                      <p>{stats.visit_frequency?.toFixed(1) || 0} / luna</p>
                    </div>
                    <div className={styles.statItem}>
                      <label>Rata no-show</label>
                      <p>{stats.no_show_rate?.toFixed(1) || 0}%</p>
                    </div>
                    <div className={styles.statItem}>
                      <label>Programari finalizate</label>
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
                          <span>{service.count} programari</span>
                          <span>{formatCurrency(service.total_spent)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {activeTab === 'appointments' && (
            <div className={styles.appointments}>
              {appointments.length === 0 ? (
                <div className={styles.empty}>Nu exista programari.</div>
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
                        <p><strong>Pret:</strong> {formatCurrency(apt.service_price)}</p>
                        {apt.notes && <p><strong>Notite:</strong> {apt.notes}</p>}
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
                <div className={styles.empty}>Nu exista conversatii.</div>
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
                        <h3>{conv.subject || 'Fara subiect'}</h3>
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
                  Notite
                </button>
                <button
                  className={activityFilter === 'emails' ? styles.filterActive : styles.filter}
                  onClick={() => setActivityFilter('emails')}
                >
                  Email-uri
                </button>
                <button
                  className={activityFilter === 'appointments' ? styles.filterActive : styles.filter}
                  onClick={() => setActivityFilter('appointments')}
                >
                  Programari
                </button>
              </div>
              {activities.length === 0 ? (
                <div className={styles.empty}>Nu exista activitati.</div>
              ) : (
                <div className={styles.activityList}>
                  {activities.map((activity) => (
                    <div key={`${activity.activity_type}-${activity.id}`} className={styles.activityItem}>
                      <div className={styles.activityIcon}>
                        {activity.activity_type === 'note' && '??'}
                        {activity.activity_type === 'email' && '??'}
                        {activity.activity_type === 'task' && '?'}
                        {activity.activity_type === 'appointment' && '??'}
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

          {activeTab === 'files' && (
            <div className={styles.files}>
              {files.length === 0 ? (
                <div className={styles.empty}>Nu exista fisiere.</div>
              ) : (
                <div className={styles.list}>
                  {files.map((file) => (
                    <div key={file.id} className={styles.fileItem}>
                      <div className={styles.fileIcon}>??</div>
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
                            Preview
                          </a>
                        )}
                        <a
                          href={`/api/clients/${clientId}/files/${file.id}/download`}
                          target="_blank"
                          className={styles.downloadButton}
                        >
                          Descarca
                        </a>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className={styles.deleteButton}
                        >
                          Sterge
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
              <h3>Adauga nota</h3>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Scrie notita aici..."
                rows={5}
                className={styles.modalTextarea}
              />
              <div className={styles.modalActions}>
                <button onClick={() => { setShowAddNote(false); setNoteContent(''); }} className={styles.cancelButton}>
                  Anuleaza
                </button>
                <button onClick={handleAddNote} className={styles.submitButton}>
                  Salveaza
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingDeleteFileId && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <h3>Confirmare stergere</h3>
              <p>Sigur vrei sa stergi acest fisier? Actiunea nu poate fi anulata.</p>
              <div className={styles.modalActions}>
                <button onClick={() => setPendingDeleteFileId(null)} className={styles.cancelButton}>
                  Anuleaza
                </button>
                <button onClick={confirmDeleteFile} className={styles.deleteButton}>
                  Sterge
                </button>
              </div>
            </div>
          </div>
        )}

        <ClientCreateModal
          isOpen={showEditClient}
          mode="edit"
          clientId={client.id}
          initialData={{
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            notes: client.notes,
          }}
          title="Editeaza client"
          submitLabel="Salveaza modificarile"
          onClose={() => setShowEditClient(false)}
          onUpdated={(updatedClient) => {
            setClient((prev) => (prev ? { ...prev, ...updatedClient } : prev));
            setShowEditClient(false);
          }}
        />

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    </div>
  );
}
