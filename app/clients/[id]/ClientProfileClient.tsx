'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [notes, setNotes] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(initialStats);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'conversations' | 'files'>('overview');
  const [showAddNote, setShowAddNote] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [pendingDeleteFileId, setPendingDeleteFileId] = useState<number | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const { toasts, removeToast, error: toastError } = useToast();
  const addNoteBackdropPressStartedRef = useRef(false);
  const deleteFileBackdropPressStartedRef = useRef(false);

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
    fetchNotes();
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    if (activeTab === 'files') {
      fetchFiles();
    }
  }, [activeTab, clientId]);

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

  const fetchNotes = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/activities?type=notes`);
      if (!res.ok) throw new Error('Failed to fetch notes');
      const result = await res.json();
      setNotes(result.activities || []);
    } catch (error) {
      logger.error('Client profile: failed to fetch notes', error instanceof Error ? error : new Error(String(error)), {
        clientId,
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
        body: JSON.stringify({ content: noteContent }),
      });
      if (!response.ok) throw new Error('Failed to add note');
      setNoteContent('');
      setShowAddNote(false);
      fetchNotes();
      fetchClientData();
    } catch (error) {
      logger.error('Client profile: failed to add note', error instanceof Error ? error : new Error(String(error)), {
        clientId,
      });
      toastError('Eroare la adaugarea notei');
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesToUpload = Array.from(e.target.files || []);
    if (filesToUpload.length === 0) return;

    for (const file of filesToUpload) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`/api/clients/${clientId}/files`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
      } catch (error) {
        logger.error('Client profile: failed to upload file', error instanceof Error ? error : new Error(String(error)), {
          clientId,
          fileName: file.name,
        });
        toastError(`Eroare la incarcarea fisierului: ${file.name}`);
      }
    }

    e.target.value = '';
    fetchFiles();
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

  const formatAppointmentStatus = (status: string): string => {
    const normalizedStatus = status === 'no_show' ? 'no-show' : status;
    const labels: Record<string, string> = {
      completed: 'Finalizat',
      scheduled: 'Programat',
      cancelled: 'Anulat',
      'no-show': 'Absent',
    };
    return labels[normalizedStatus] ?? normalizedStatus;
  };

  const getAppointmentStatusClass = (status: string) => {
    switch (status === 'no_show' ? 'no-show' : status) {
      case 'completed':
        return styles.statusFinalizat;
      case 'scheduled':
        return styles.statusScheduled;
      case 'cancelled':
        return styles.statusAnulat;
      case 'no-show':
        return styles.statusAbsent;
      default:
        return styles.statusDefault;
    }
  };

  const handleAddNoteBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    addNoteBackdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleAddNoteBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (addNoteBackdropPressStartedRef.current && endedOnBackdrop) {
      setShowAddNote(false);
      setNoteContent('');
    }
    addNoteBackdropPressStartedRef.current = false;
  };

  const handleDeleteFileBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    deleteFileBackdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleDeleteFileBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (deleteFileBackdropPressStartedRef.current && endedOnBackdrop) {
      setPendingDeleteFileId(null);
    }
    deleteFileBackdropPressStartedRef.current = false;
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
          <Link href="/clients" className={styles.actionButton} prefetch>
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
          <nav className={styles.breadcrumb} aria-label="breadcrumb">
            <Link href="/clients" className={styles.breadcrumbLink} prefetch>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Clienti
            </Link>
            <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
            <span className={styles.breadcrumbCurrent}>{client.name}</span>
          </nav>
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
              <label className={styles.actionButton}>
                + Fisier
                <input type="file" multiple style={{ display: 'none' }} onChange={handleUploadFile} />
              </label>
              <Link href={`/calendar?contactId=${clientId}`} className={styles.actionButton} prefetch>
                + Programare
              </Link>
            </div>
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab}${activeTab === 'overview' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Prezentare
          </button>
          <button
            className={`${styles.tab}${activeTab === 'appointments' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setActiveTab('appointments')}
          >
            Programari ({appointments.length})
          </button>
          <button
            className={`${styles.tab}${activeTab === 'conversations' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setActiveTab('conversations')}
          >
            Conversatii ({conversations.length})
          </button>
          <button
            className={`${styles.tab}${activeTab === 'files' ? ` ${styles.tabActive}` : ''}`}
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
                <div className={styles.statsSecondary}>
                  <div className={`${styles.statItem} ${styles.statItemSecondary}`}>
                    <label>Email</label>
                    {client.email
                      ? <a href={`mailto:${client.email}`} className={styles.emailLink}>{client.email}</a>
                      : <p>N/A</p>}
                  </div>
                  <div className={`${styles.statItem} ${styles.statItemSecondary}`}>
                    <label>Telefon</label>
                    <p>{client.phone || 'N/A'}</p>
                  </div>
                  <div className={`${styles.statItem} ${styles.statItemSecondary}`}>
                    <label>Prima contactare</label>
                    <p>{formatDate(client.first_contact_date)}</p>
                  </div>
                </div>
                <div className={styles.statsDivider} />
                <h2>Statistici detaliate</h2>
                <div className={styles.statsPrimary}>
                  <div className={styles.statPrimaryCard}>
                    <label className={styles.statPrimaryLabel}>Total cheltuit</label>
                    <p className={styles.statPrimaryValue}>{formatCurrency(client.total_spent)}</p>
                  </div>
                  <div className={styles.statPrimaryCard}>
                    <label className={styles.statPrimaryLabel}>Programari</label>
                    <p className={styles.statPrimaryValue}>{client.total_appointments}</p>
                  </div>
                  <div className={styles.statPrimaryCard}>
                    <label className={styles.statPrimaryLabel}>Ultima vizita finalizata</label>
                    <p className={styles.statPrimaryValue}>{formatDate(client.last_appointment_date)}</p>
                  </div>
                </div>
                <div className={styles.statsDivider} />
                <div className={styles.statsSecondary}>
                  <div className={`${styles.statItem} ${styles.statItemSecondary}`}>
                    <label>Valoare medie programare</label>
                    <p>{formatCurrency(stats?.average_appointment_value || 0)}</p>
                  </div>
                  <div className={`${styles.statItem} ${styles.statItemSecondary}`}>
                    <label>Frecventa vizite</label>
                    <p>{stats?.visit_frequency?.toFixed(1) || 0} / luna</p>
                  </div>
                  <div className={`${styles.statItem} ${styles.statItemSecondary}`}>
                    <label>Rata no-show</label>
                    <p>{stats?.no_show_rate?.toFixed(1) || 0}%</p>
                  </div>
                  <div className={`${styles.statItem} ${styles.statItemSecondary}`}>
                    <label>Programari finalizate</label>
                    <p>{stats?.completed_appointments || 0}</p>
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2>Note</h2>
                  <button
                    type="button"
                    className={styles.sectionAction}
                    onClick={() => setShowAddNote(true)}
                  >
                    + Nota noua
                  </button>
                </div>
                {notes.length === 0 ? (
                  <p className={styles.emptyInline}>Nicio nota adaugata inca.</p>
                ) : (
                  <div className={styles.notesList}>
                    {notes.map((note) => (
                      <div key={note.id} className={styles.noteItem}>
                        <p className={styles.noteText}>{note.description || note.title}</p>
                        <span className={styles.noteMeta}>
                          {formatDate(note.activity_date || note.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                          {formatAppointmentStatus(apt.status)}
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

          {activeTab === 'files' && (
            <div className={styles.files}>
              {files.length === 0 ? (
                <div className={styles.empty}>Nu exista fisiere.</div>
              ) : (
                <div className={styles.list}>
                  {files.map((file) => (
                    <div key={file.id} className={styles.fileItem}>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={styles.itemIcon}
                        aria-hidden="true"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
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
          <div
            className={styles.modal}
            onPointerDown={handleAddNoteBackdropPointerDown}
            onClick={handleAddNoteBackdropClick}
          >
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
          <div
            className={styles.modal}
            onPointerDown={handleDeleteFileBackdropPointerDown}
            onClick={handleDeleteFileBackdropClick}
          >
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
