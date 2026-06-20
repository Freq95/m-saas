'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import navStyles from '../../dashboard/page.module.css';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import ClientCreateModal from '@/components/ClientCreateModal';
import Spinner from '@/components/Spinner';
import { gdprStateOf, GDPR_COLOR, GDPR_FULL_LABEL } from '@/lib/client-gdpr';
import { logger } from '@/lib/logger';

// Dental tab is large (SVG odontogram + dialog + chart). Code-split it so users
// who never open the tab don't download it.
const DentalTab = dynamic(() => import('./dental/DentalTab'), {
  ssr: false,
  loading: () => <Spinner size={24} thickness={2.2} />,
});

const TreatmentPlansTab = dynamic(() => import('./treatment-plans/TreatmentPlansTab'), {
  ssr: false,
  loading: () => <Spinner size={24} thickness={2.2} />,
});

// Warm the lazy chunks so opening a tab waits only on data, not the JS download.
// import() is memoized by the bundler, so repeat calls are free.
const prefetchDentalTab = () => { void import('./dental/DentalTab'); };
const prefetchTreatmentPlansTab = () => { void import('./treatment-plans/TreatmentPlansTab'); };

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
  consent_given?: boolean;
  consent_date?: string | null;
  consent_method?: string | null;
  consent_document_key?: string | null;
  consent_withdrawn?: boolean;
  consent_withdrawn_date?: string | null;
  is_minor?: boolean;
  parent_guardian_name?: string | null;
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

interface Note {
  id: number;
  title?: string | null;
  description?: string | null;
  activity_type?: string | null;
  activity_date?: string | null;
  created_at?: string | null;
  note_collection?: string | null;
  start_time?: string | null;
  appointment_date?: string | null;
  appointment_service_name?: string | null;
}

interface ClientFile {
  id: number;
  name?: string | null;
  original_filename?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  created_at?: string | null;
}

interface ClientStats {
  completed_appointments?: number;
  no_show_rate?: number;
}

interface ClientProfileClientProps {
  clientId: string;
  initialClient: Client | null;
  initialAppointments: Appointment[];
  initialConversations: Conversation[];
  initialStats: ClientStats | null;
  canEditDental: boolean;
  canEditTreatmentPlans: boolean;
}

type ActiveTab = 'notes' | 'appointments' | 'conversations' | 'files' | 'dental' | 'treatment-plans';

function normalizeProfileTab(value: string | null): ActiveTab {
  if (value === 'appointments') return 'appointments';
  if (value === 'conversations') return 'conversations';
  if (value === 'files') return 'files';
  if (value === 'dental') return 'dental';
  if (value === 'plan' || value === 'treatment-plans') return 'treatment-plans';
  return 'notes';
}

function tabToQueryValue(tab: ActiveTab): string | null {
  if (tab === 'notes') return null;
  return tab === 'treatment-plans' ? 'plan' : tab;
}

export default function ClientProfileClient({
  clientId,
  initialClient,
  initialAppointments,
  initialConversations,
  initialStats,
  canEditDental,
  canEditTreatmentPlans,
}: ClientProfileClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const activeTabParam = searchParams.get('tab');
  const newPlanParam = searchParams.get('newPlan');
  const appointmentIdParam = searchParams.get('appointmentId');
  const [client, setClient] = useState<Client | null>(initialClient);
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState<ClientStats | null>(initialStats);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => normalizeProfileTab(searchParams.get('tab')));
  const [showAddNote, setShowAddNote] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [pendingDeleteFileId, setPendingDeleteFileId] = useState<number | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [pendingDeleteNote, setPendingDeleteNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');
  const [showGdprErase, setShowGdprErase] = useState(false);
  const [showConsentWithdraw, setShowConsentWithdraw] = useState(false);
  const [consentWithdrawing, setConsentWithdrawing] = useState(false);
  const [gdprErasing, setGdprErasing] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const { toasts, removeToast, error: toastError, success: toastSuccess } = useToast();
  const addNoteBackdropPressStartedRef = useRef(false);
  const editNoteBackdropPressStartedRef = useRef(false);
  const deleteNoteBackdropPressStartedRef = useRef(false);
  const deleteFileBackdropPressStartedRef = useRef(false);
  const gdprEraseBackdropRef = useRef(false);
  const consentWithdrawBackdropRef = useRef(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParamsKey);
    const tabValue = tabToQueryValue(tab);
    if (tabValue) params.set('tab', tabValue);
    else params.delete('tab');
    if (tab !== 'treatment-plans') {
      params.delete('newPlan');
      params.delete('appointmentId');
    }
    const query = params.toString();
    if (query === searchParamsKey) return;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParamsKey]);

  const fetchClientData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/clients/${clientId}`);
      if (!response.ok) throw new Error('Failed to fetch client');
      const result = await response.json();
      setClient(result.client);
      setAppointments(result.appointments || []);
      setConversations(result.conversations || []);
    } catch (error) {
      logger.error('Client profile: failed to fetch client data', error instanceof Error ? error : new Error(String(error)), { clientId });
      toastError('Eroare la încărcarea datelor pacientului');
    } finally {
      setLoading(false);
    }
  }, [clientId, toastError]);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/activities?type=notes`);
      if (!res.ok) throw new Error('Failed to fetch notes');
      const result = await res.json();
      setNotes(result.activities || []);
    } catch (error) {
      logger.error('Client profile: failed to fetch notes', error instanceof Error ? error : new Error(String(error)), { clientId });
      toastError('Eroare la încărcarea notelor');
    }
  }, [clientId, toastError]);

  const fetchFiles = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/files`);
      if (!response.ok) throw new Error('Failed to fetch files');
      const result = await response.json();
      setFiles(result.files || []);
    } catch (error) {
      logger.error('Client profile: failed to fetch files', error instanceof Error ? error : new Error(String(error)), { clientId });
      toastError('Eroare la încărcarea fișierelor');
    }
  }, [clientId, toastError]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const result = await response.json();
      setStats(result.stats || null);
    } catch (error) {
      logger.error('Client profile: failed to fetch stats', error instanceof Error ? error : new Error(String(error)), { clientId });
      toastError('Eroare la încărcarea statisticilor');
    }
  }, [clientId, toastError]);

  useEffect(() => {
    setClient(initialClient);
    setAppointments(initialAppointments);
    setConversations(initialConversations);
    setStats(initialStats);
    setLoading(false);
  }, [clientId, initialAppointments, initialClient, initialConversations, initialStats]);

  useEffect(() => {
    setActiveTab(normalizeProfileTab(activeTabParam));
  }, [activeTabParam]);

  // initialClient being null means the patient wasn't found (or scope check
  // failed) — the bailout below renders "Pacientul nu a fost gasit". Gate all
  // initial fetches on it so we don't fire 4 wasted 404 requests and pollute
  // the console with errors before the empty state shows.
  useEffect(() => {
    if (!clientId || !initialClient) return;
    if (!initialStats) void fetchStats();
  }, [clientId, fetchStats, initialClient, initialStats]);

  useEffect(() => {
    if (!clientId || !initialClient) return;
    // Notes are shown on the default tab — fetch immediately.
    // Files load lazily via the activeTab-gated effect below to save ~500ms
    // on every patient drill-down for users who don't open the Files tab.
    void fetchNotes();
  }, [clientId, fetchNotes, initialClient]);

  useEffect(() => {
    if (!clientId || !initialClient) return;
    if (activeTab === 'files') void fetchFiles();
  }, [activeTab, clientId, fetchFiles, initialClient]);

  // Prefetch the heavy Dental + Plan chunks during idle time after the profile
  // settles, so the first tap on either tab is JS-instant.
  useEffect(() => {
    const run = () => { prefetchDentalTab(); prefetchTreatmentPlansTab(); };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(run, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showOverflowMenu) return;
    const handler = (e: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOverflowMenu]);

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
      logger.error('Client profile: failed to add note', error instanceof Error ? error : new Error(String(error)), { clientId });
      toastError('Eroare la adaugarea notei');
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setEditNoteContent(note.description || note.title || '');
  };

  const handleUpdateNote = async () => {
    if (!editingNote || !editNoteContent.trim()) return;
    try {
      const response = editingNote.activity_type === 'appointment_note'
        ? await fetch(`/api/appointments/${editingNote.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: editNoteContent }),
          })
        : await fetch(`/api/clients/${clientId}/notes/${editingNote.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: editNoteContent,
              noteCollection: editingNote.note_collection,
            }),
          });
      if (!response.ok) throw new Error('Failed to update note');
      setEditingNote(null);
      setEditNoteContent('');
      fetchNotes();
    } catch (error) {
      logger.error('Client profile: failed to update note', error instanceof Error ? error : new Error(String(error)), { clientId, noteId: editingNote.id });
      toastError('Eroare la actualizarea notei');
    }
  };

  const handleDeleteNote = (note: Note) => setPendingDeleteNote(note);

  const confirmDeleteNote = async () => {
    if (!pendingDeleteNote) return;
    const note = pendingDeleteNote;
    setPendingDeleteNote(null);
    try {
      const response = note.activity_type === 'appointment_note'
        ? await fetch(`/api/appointments/${note.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: '' }),
          })
        : await fetch(`/api/clients/${clientId}/notes/${note.id}${note.note_collection ? `?noteCollection=${encodeURIComponent(note.note_collection)}` : ''}`, {
            method: 'DELETE',
          });
      if (!response.ok) throw new Error('Failed to delete note');
      fetchNotes();
      fetchClientData();
    } catch (error) {
      logger.error('Client profile: failed to delete note', error instanceof Error ? error : new Error(String(error)), { clientId, noteId: note.id });
      toastError('Eroare la ștergerea notei');
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesToUpload = Array.from(e.target.files || []);
    if (filesToUpload.length === 0) return;
    let successCount = 0;
    for (const file of filesToUpload) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`/api/clients/${clientId}/files`, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Failed to upload ${file.name}`);
        successCount++;
      } catch (error) {
        logger.error('Client profile: failed to upload file', error instanceof Error ? error : new Error(String(error)), { clientId, fileName: file.name });
        toastError(`Eroare la încărcarea fișierului: ${file.name}`);
      }
    }
    e.target.value = '';
    if (successCount > 0) fetchFiles();
  };

  const handleDeleteFile = (fileId: number) => setPendingDeleteFileId(fileId);

  const confirmDeleteFile = async () => {
    if (!pendingDeleteFileId) return;
    const fileId = pendingDeleteFileId;
    setPendingDeleteFileId(null);
    try {
      const response = await fetch(`/api/clients/${clientId}/files/${fileId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete file');
      fetchFiles();
    } catch (error) {
      logger.error('Client profile: failed to delete file', error instanceof Error ? error : new Error(String(error)), { clientId, fileId });
      toastError('Eroare la ștergerea fișierului');
    }
  };

  const handleGdprExport = async () => {
    try {
      window.open(`/api/clients/${clientId}/gdpr-export`, '_blank');
    } catch {
      toastError('Eroare la exportul datelor');
    }
  };

  const handleGdprErase = async () => {
    setGdprErasing(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/gdpr-erase`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) throw new Error('Failed to erase');
      window.location.href = '/clients';
    } catch {
      toastError('Eroare la ștergerea definitiva a datelor');
      setGdprErasing(false);
    }
  };

  const handleConsentWithdraw = async () => {
    setConsentWithdrawing(true);
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_withdrawn: true }),
      });
      if (!response.ok) throw new Error('Failed to withdraw consent');
      const result = await response.json();
      setClient(prev => prev ? { ...prev, ...result.client } : prev);
      setShowConsentWithdraw(false);
    } catch {
      toastError('Eroare la retragerea consimțământului');
    } finally {
      setConsentWithdrawing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('ro-RO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(amount);

  // Splits "1.150 RON" → { number: "1.150", unit: "RON" } for separate rendering
  const formatStatCurrency = (amount: number): { number: string; unit: string } => {
    const num = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(amount);
    return { number: num, unit: 'RON' };
  };

  const formatAppointmentStatus = (status: string): string => {
    const labels: Record<string, string> = {
      completed: 'Finalizat',
      scheduled: 'Programat',
      cancelled: 'Anulat',
      'no-show': 'Absent',
      no_show: 'Absent',
    };
    return labels[status] ?? status;
  };

  const formatConsentMethod = (method: string): string => {
    const labels: Record<string, string> = {
      digital_signature: 'Semnătură digitală',
      scanned_document: 'Document scanat',
      paper_on_file: 'Document fizic',
    };
    return labels[method] || method;
  };

  const getAppointmentStatusClass = (status: string) => {
    const s = status === 'no_show' ? 'no-show' : status;
    switch (s) {
      case 'completed': return styles.pillSuccess;
      case 'scheduled': return styles.pillNeutral;
      case 'cancelled': return styles.pillWarning;
      case 'no-show':   return styles.pillDanger;
      default:          return styles.pillNeutral;
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const getInactiveFlag = () => {
    if (!client?.last_appointment_date) return false;
    return Math.floor((Date.now() - new Date(client.last_appointment_date).getTime()) / 86400000) > 30;
  };

  const handleAddNoteBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    addNoteBackdropPressStartedRef.current = e.target === e.currentTarget;
  };
  const handleAddNoteBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (addNoteBackdropPressStartedRef.current && e.target === e.currentTarget) {
      setShowAddNote(false);
      setNoteContent('');
    }
    addNoteBackdropPressStartedRef.current = false;
  };
  const handleEditNoteBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    editNoteBackdropPressStartedRef.current = e.target === e.currentTarget;
  };
  const handleEditNoteBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editNoteBackdropPressStartedRef.current && e.target === e.currentTarget) {
      setEditingNote(null);
      setEditNoteContent('');
    }
    editNoteBackdropPressStartedRef.current = false;
  };
  const handleDeleteNoteBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    deleteNoteBackdropPressStartedRef.current = e.target === e.currentTarget;
  };
  const handleDeleteNoteBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (deleteNoteBackdropPressStartedRef.current && e.target === e.currentTarget) setPendingDeleteNote(null);
    deleteNoteBackdropPressStartedRef.current = false;
  };
  const handleDeleteFileBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    deleteFileBackdropPressStartedRef.current = e.target === e.currentTarget;
  };
  const handleDeleteFileBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (deleteFileBackdropPressStartedRef.current && e.target === e.currentTarget) setPendingDeleteFileId(null);
    deleteFileBackdropPressStartedRef.current = false;
  };

  if (loading) {
    return (
      <div className={navStyles.container}>
        <div className={styles.pageLoading}><Spinner size={28} thickness={2.5} /></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className={navStyles.container}>
        <div className={styles.pageLoading}>
          <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)' }}>Pacientul nu a fost găsit.</p>
          <Link href="/clients" className={styles.btnGhost} prefetch>← Înapoi la listă</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${navStyles.container} ${styles.mobileViewport}`}>
      <div className={styles.page}>

        {/* ── Header ─────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.identity}>
            {(() => {
              // Avatar tint mirrors the GDPR state used in the patients list
              // (green=given, orange=withdrawn, red=never asked). Same color
              // language across list + profile so a quick glance always means
              // the same thing.
              const gdprState = gdprStateOf(client);
              const gdprColor = GDPR_COLOR[gdprState];
              return (
                <div
                  className={styles.avatar}
                  style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, ${gdprColor} 24%, transparent) 0%, color-mix(in srgb, ${gdprColor} 14%, transparent) 100%)`,
                    borderColor: `color-mix(in srgb, ${gdprColor} 45%, transparent)`,
                    boxShadow: `0 0 0 4px color-mix(in srgb, ${gdprColor} 9%, transparent)`,
                    color: gdprColor,
                  }}
                  aria-label={GDPR_FULL_LABEL[gdprState]}
                  title={GDPR_FULL_LABEL[gdprState]}
                >
                  {getInitials(client.name)}
                </div>
              );
            })()}
            <div className={styles.identityInfo}>
              <div className={styles.nameRow}>
                <h1 className={styles.name}>{client.name}</h1>
                <div className={styles.badges}>
                  {/* GDPR badge — status only, actions live in ⋯ menu */}
                  <span className={`${styles.badge} ${
                    client.consent_given && !client.consent_withdrawn
                      ? styles.badgeSuccess
                      : client.consent_withdrawn
                        ? styles.badgeWarning
                        : styles.badgeDanger
                  }`}>
                    {client.consent_given && !client.consent_withdrawn
                      ? 'GDPR ✓'
                      : client.consent_withdrawn
                        ? 'Consimțământ retras'
                        : 'Fără consimțământ'
                    }
                  </span>
                  {client.is_minor && <span className={`${styles.badge} ${styles.badgeInfo}`}>Minor</span>}
                  {client.total_spent >= 1000 && <span className={`${styles.badge} ${styles.badgeVip}`}>VIP</span>}
                  {getInactiveFlag() && <span className={`${styles.badge} ${styles.badgeNeutral}`}>Inactiv</span>}
                </div>
              </div>
              <div className={styles.subInfo}>
                {client.phone && <span>{client.phone}</span>}
                {client.phone && client.email && <span className={styles.dot}>·</span>}
                {client.email && <a href={`mailto:${client.email}`} className={styles.subInfoLink}>{client.email}</a>}
                <span className={styles.dot}>·</span>
                <span className={styles.subInfoDate} title="Prima dată înregistrat ca pacient">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {formatDateShort(client.first_contact_date)}
                </span>
                {client.last_appointment_date && (
                  <>
                    <span className={styles.dot}>·</span>
                    <span className={styles.subInfoDate} title="Ultima vizită la cabinet">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {formatDateShort(client.last_appointment_date)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={styles.headerActions}>
            {/* ⋯ overflow menu */}
            <div className={styles.overflowWrap} ref={overflowMenuRef}>
              <button
                className={styles.btnIcon}
                onClick={() => setShowOverflowMenu(v => !v)}
                aria-label="Mai multe acțiuni"
                aria-expanded={showOverflowMenu}
                aria-haspopup="true"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                </svg>
              </button>
              {showOverflowMenu && (
                <div className={styles.overflowMenu} role="menu">
                  <button className={styles.overflowItem} role="menuitem" onClick={() => { setShowAddNote(true); setShowOverflowMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Notă nouă
                  </button>
                  <label className={styles.overflowItem} role="menuitem">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Încarcă fișier
                    <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { handleUploadFile(e); setShowOverflowMenu(false); }} />
                  </label>
                  <div className={styles.overflowDivider} />
                  <button className={styles.overflowItem} role="menuitem" onClick={() => { setShowEditClient(true); setShowOverflowMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Editează pacient
                  </button>
                  <div className={styles.overflowDivider} />
                  <span className={styles.overflowSectionLabel}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    GDPR
                  </span>
                  {client.consent_date && !client.consent_withdrawn && (
                    <span className={styles.overflowMeta}>
                      Consimțământ înregistrat {formatDateShort(client.consent_date)}
                      {client.consent_method && <> · {formatConsentMethod(client.consent_method)}</>}
                    </span>
                  )}
                  {client.consent_withdrawn_date && (
                    <span className={styles.overflowMeta}>Retras {formatDateShort(client.consent_withdrawn_date)}</span>
                  )}
                  <button className={styles.overflowItem} role="menuitem" onClick={() => { handleGdprExport(); setShowOverflowMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export date
                  </button>
                  {client.consent_given && !client.consent_withdrawn && (
                    <button className={styles.overflowItem} role="menuitem" onClick={() => { setShowConsentWithdraw(true); setShowOverflowMenu(false); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      Retrage consimțământ
                    </button>
                  )}
                  <button className={`${styles.overflowItem} ${styles.overflowItemDanger}`} role="menuitem" onClick={() => { setShowGdprErase(true); setShowOverflowMenu(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    Șterge definitiv
                  </button>
                </div>
              )}
            </div>
            <Link href={`/calendar?contactId=${clientId}`} className={styles.btnPrimary} prefetch>
              + Programare
            </Link>
          </div>
        </header>

        {/* ── Stats Strip ────────────────────────────────────── */}
        <div className={styles.statsStrip}>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {formatStatCurrency(client.total_spent).number}
              <span className={styles.statUnit}>{formatStatCurrency(client.total_spent).unit}</span>
            </span>
            <span className={styles.statLabel}>Total cheltuit</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statValue}>{client.total_appointments}</span>
            <span className={styles.statLabel}>Programări</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats?.completed_appointments ?? 0}</span>
            <span className={styles.statLabel}>Finalizate</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={`${styles.statValue} ${(stats?.no_show_rate ?? 0) > 20 ? styles.statValueWarn : ''}`}>
              {stats?.no_show_rate != null ? (
                <>{stats.no_show_rate.toFixed(1)}<span className={styles.statUnit}>%</span></>
              ) : '—'}
            </span>
            <span className={styles.statLabel}>No-show</span>
          </div>
        </div>

        {/* ── Tab Bar ────────────────────────────────────────── */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tab} ${activeTab === 'notes' ? styles.tabActive : ''}`}
            onClick={() => selectTab('notes')}
          >
            Note
            {notes.length > 0 && <span className={styles.tabCount}>({notes.length})</span>}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'appointments' ? styles.tabActive : ''}`}
            onClick={() => selectTab('appointments')}
          >
            Programări
            {appointments.length > 0 && <span className={styles.tabCount}>({appointments.length})</span>}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'conversations' ? styles.tabActive : ''}`}
            onClick={() => selectTab('conversations')}
          >
            Conversații
            {conversations.length > 0 && <span className={styles.tabCount}>({conversations.length})</span>}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'files' ? styles.tabActive : ''}`}
            onClick={() => selectTab('files')}
          >
            Fișiere
            {files.length > 0 && <span className={styles.tabCount}>({files.length})</span>}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'dental' ? styles.tabActive : ''}`}
            onClick={() => selectTab('dental')}
            onMouseEnter={prefetchDentalTab}
            onFocus={prefetchDentalTab}
          >
            Dental
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'treatment-plans' ? styles.tabActive : ''}`}
            onClick={() => selectTab('treatment-plans')}
            onMouseEnter={prefetchTreatmentPlansTab}
            onFocus={prefetchTreatmentPlansTab}
          >
            Plan de tratament
          </button>
        </div>

        {/* ── Tab Content ────────────────────────────────────── */}
        <div className={styles.tabContent}>

          {/* Notes tab */}
          {activeTab === 'notes' && (
            notes.length === 0 ? (
              <div className={styles.tableWrap}>
                <div className={styles.emptyState}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.3, marginBottom: '0.75rem' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                  Nu există note.
                </div>
              </div>
            ) : (
              <div className={styles.rowList}>
                {notes.map((note) => (
                  <div key={`${note.activity_type || 'note'}-${note.id}`} className={styles.noteRow}>
                    <span className={styles.noteDate}>{formatDate(note.activity_date || note.created_at || null)}</span>
                    <div className={styles.noteInfo}>
                      <span className={styles.noteText}>{note.description || note.title}</span>
                      {note.activity_type === 'appointment_note' && (
                        <span className={styles.noteMeta}>
                          {note.appointment_service_name || 'Programare'} - {formatDate(note.appointment_date || note.start_time || null)}
                        </span>
                      )}
                    </div>
                    <div className={styles.fileActions}>
                      <button
                        className={styles.btnIconSmall}
                        onClick={() => handleEditNote(note)}
                        aria-label="Editează nota"
                        data-tooltip="Editează"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        className={`${styles.btnIconSmall} ${styles.btnIconDanger}`}
                        onClick={() => handleDeleteNote(note)}
                        aria-label="Șterge nota"
                        data-tooltip="Șterge"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Appointments */}
          {activeTab === 'appointments' && (
            <div className={styles.tableWrap}>
              {appointments.length === 0 ? (
                <div className={styles.emptyState}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.3, marginBottom: '0.75rem' }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Nu există programări.
                </div>
              ) : (
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Serviciu</th>
                      <th>Data</th>
                      <th>Preț</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((apt) => (
                      <tr key={apt.id}>
                        <td className={styles.tdMain} data-label="Serviciu">
                          {apt.service_name}
                          {apt.notes && <span className={styles.tdSub}>{apt.notes}</span>}
                        </td>
                        <td className={styles.tdMono} data-label="Data">{formatDate(apt.start_time)}</td>
                        <td className={styles.tdMono} data-label="Preț">{formatCurrency(apt.service_price)}</td>
                        <td data-label="Status">
                          <span className={`${styles.pill} ${getAppointmentStatusClass(apt.status)}`}>
                            {formatAppointmentStatus(apt.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Conversations */}
          {activeTab === 'conversations' && (
            <div className={styles.tableWrap}>
              {conversations.length === 0 ? (
                <div className={styles.emptyState}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.3, marginBottom: '0.75rem' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Nu există conversații.
                </div>
              ) : (
                <div className={styles.rowList}>
                  {conversations.map((conv) => (
                    <Link key={conv.id} href={`/inbox?conversation=${conv.id}`} className={styles.rowItem} prefetch>
                      <div className={styles.convMain}>
                        <span className={styles.tdMain}>{conv.subject || 'Fără subiect'}</span>
                        <span className={styles.convMeta}>
                          <span className={`${styles.pill} ${styles.pillNeutral}`}>{conv.channel}</span>
                          <span className={styles.tdMeta}>{conv.message_count} mesaje · {formatDate(conv.updated_at)}</span>
                        </span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.rowChevron} aria-hidden="true">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Files */}
          {activeTab === 'files' && (
            <div className={styles.tableWrap}>
              {files.length === 0 ? (
                <div className={styles.emptyState}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.3, marginBottom: '0.75rem' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  Nu există fișiere.
                </div>
              ) : (
                <div className={styles.rowList}>
                  {files.map((file) => (
                    <div key={file.id} className={styles.fileRow}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.fileIcon} aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                      </svg>
                      <div className={styles.fileInfo}>
                        <span className={styles.fileName}>{file.original_filename}</span>
                        <span className={styles.fileMeta}>
                          {((file.file_size ?? 0) / 1024).toFixed(1)} KB · {formatDate(file.created_at ?? null)}
                        </span>
                      </div>
                      <div className={styles.fileActions}>
                        {(file.mime_type?.startsWith('image/') || file.mime_type === 'application/pdf' || file.mime_type?.startsWith('text/')) && (
                          <a href={`/api/clients/${clientId}/files/${file.id}/preview`} target="_blank" className={styles.btnIconSmall} aria-label="Previzualizare" data-tooltip="Previzualizare">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                            </svg>
                          </a>
                        )}
                        <a href={`/api/clients/${clientId}/files/${file.id}/download`} target="_blank" className={styles.btnIconSmall} aria-label="Descarcă" data-tooltip="Descarcă">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </a>
                        <button className={`${styles.btnIconSmall} ${styles.btnIconDanger}`} onClick={() => handleDeleteFile(file.id)} aria-label="Șterge fișier" data-tooltip="Șterge">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dental */}
          {activeTab === 'dental' && (
            <DentalTab
              clientId={clientId}
              canEdit={canEditDental}
              clientName={client?.name}
              isMinor={client?.is_minor}
              onToast={(kind, message) => (kind === 'success' ? toastSuccess(message) : toastError(message))}
            />
          )}

          {activeTab === 'treatment-plans' && (
            <TreatmentPlansTab
              clientId={clientId}
              canEdit={canEditTreatmentPlans}
              clientName={client?.name}
              clientEmail={client?.email}
              clientPhone={client?.phone}
              initialNewPlan={newPlanParam === '1'}
              seedAppointmentId={appointmentIdParam}
              onToast={(kind, message) => (kind === 'success' ? toastSuccess(message) : toastError(message))}
              onFilesChanged={fetchFiles}
            />
          )}
        </div>

        {/* ── Add Note Modal ──────────────────────────────────── */}
        {showAddNote && (
          <div className={styles.modalOverlay} onPointerDown={handleAddNoteBackdropPointerDown} onClick={handleAddNoteBackdropClick}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Notă nouă</h3>
                <button className={styles.modalClose} onClick={() => { setShowAddNote(false); setNoteContent(''); }} aria-label="Închide">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Scrie notița aici..."
                rows={5}
                className={styles.modalTextarea}
                autoFocus
              />
              <div className={styles.modalFooter}>
                <button onClick={() => { setShowAddNote(false); setNoteContent(''); }} className={styles.btnGhost}>Anulează</button>
                <button onClick={handleAddNote} className={styles.btnPrimary} disabled={!noteContent.trim()}>Salvează</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete File Confirm ─────────────────────────────── */}
        {editingNote && (
          <div className={styles.modalOverlay} onPointerDown={handleEditNoteBackdropPointerDown} onClick={handleEditNoteBackdropClick}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Editează nota</h3>
                <button className={styles.modalClose} onClick={() => { setEditingNote(null); setEditNoteContent(''); }} aria-label="Închide">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <textarea
                value={editNoteContent}
                onChange={(e) => setEditNoteContent(e.target.value)}
                placeholder="Scrie nota aici..."
                rows={5}
                className={styles.modalTextarea}
                autoFocus
              />
              <div className={styles.modalFooter}>
                <button onClick={() => { setEditingNote(null); setEditNoteContent(''); }} className={styles.btnGhost}>Anulează</button>
                <button onClick={handleUpdateNote} className={styles.btnPrimary} disabled={!editNoteContent.trim()}>Salvează</button>
              </div>
            </div>
          </div>
        )}

        {pendingDeleteNote && (
          <div className={styles.modalOverlay} onPointerDown={handleDeleteNoteBackdropPointerDown} onClick={handleDeleteNoteBackdropClick}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Confirmare ștergere</h3>
              </div>
              <p className={styles.modalBody}>Sigur vrei să ștergi această notă? Acțiunea nu poate fi anulată.</p>
              <div className={styles.modalFooter}>
                <button onClick={() => setPendingDeleteNote(null)} className={styles.btnGhost}>Anulează</button>
                <button onClick={confirmDeleteNote} className={styles.btnDanger}>Șterge</button>
              </div>
            </div>
          </div>
        )}

        {pendingDeleteFileId && (
          <div className={styles.modalOverlay} onPointerDown={handleDeleteFileBackdropPointerDown} onClick={handleDeleteFileBackdropClick}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Confirmare ștergere</h3>
              </div>
              <p className={styles.modalBody}>Sigur vrei să ștergi acest fișier? Acțiunea nu poate fi anulată.</p>
              <div className={styles.modalFooter}>
                <button onClick={() => setPendingDeleteFileId(null)} className={styles.btnGhost}>Anulează</button>
                <button onClick={confirmDeleteFile} className={styles.btnDanger}>Șterge</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Consent Withdraw Confirm ───────────────────────── */}
        {showConsentWithdraw && (
          <div
            className={styles.modalOverlay}
            onPointerDown={(e) => { consentWithdrawBackdropRef.current = e.target === e.currentTarget; }}
            onClick={(e) => {
              if (consentWithdrawBackdropRef.current && e.target === e.currentTarget) setShowConsentWithdraw(false);
              consentWithdrawBackdropRef.current = false;
            }}
          >
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Retrage consimțământ GDPR</h3>
              </div>
              <div className={styles.modalDangerBanner}>
                Această acțiune nu poate fi anulată
              </div>
              <p className={styles.modalBody}>
                Consimțământul pacientului va fi marcat ca retras. Datele rămân în sistem, dar nu mai pot fi prelucrate în baza acestui consimțământ.
              </p>
              <div className={styles.modalFooter}>
                <button onClick={() => setShowConsentWithdraw(false)} className={styles.btnGhost} disabled={consentWithdrawing}>Anulează</button>
                <button onClick={handleConsentWithdraw} disabled={consentWithdrawing} className={styles.btnDanger}>
                  {consentWithdrawing ? 'Se retrage...' : 'Retrage consimțământ'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── GDPR Erase Confirm ──────────────────────────────── */}
        {showGdprErase && (
          <div
            className={styles.modalOverlay}
            onPointerDown={(e) => { gdprEraseBackdropRef.current = e.target === e.currentTarget; }}
            onClick={(e) => {
              if (gdprEraseBackdropRef.current && e.target === e.currentTarget) setShowGdprErase(false);
              gdprEraseBackdropRef.current = false;
            }}
          >
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Ștergere definitivă (GDPR)</h3>
              </div>
              <div className={styles.modalDangerBanner}>
                Această acțiune este ireversibilă
              </div>
              <p className={styles.modalBody}>
                Toate datele pacientului vor fi șterse permanent: programări, conversații, mesaje, fișiere, note și toate informațiile asociate.
              </p>
              <div className={styles.modalFooter}>
                <button onClick={() => setShowGdprErase(false)} className={styles.btnGhost} disabled={gdprErasing}>Anulează</button>
                <button onClick={handleGdprErase} disabled={gdprErasing} className={styles.btnDanger}>
                  {gdprErasing ? 'Se șterge...' : 'Șterge definitiv'}
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
            consent_given: client.consent_given,
            consent_withdrawn: client.consent_withdrawn,
            consent_method: client.consent_method,
            is_minor: client.is_minor,
            parent_guardian_name: client.parent_guardian_name,
          }}
          title="Editează pacient"
          submitLabel="Salvează modificările"
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
