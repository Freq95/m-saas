'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import DOMPurify from 'dompurify';
import { emailSchema } from '@/lib/validation';
import { fetchWithRetry } from '@/lib/retry';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './page.module.css';
import navStyles from '../../dashboard/page.module.css';
import SettingsTabs from '../SettingsTabs';

interface EmailIntegration {
  id: number;
  provider: 'yahoo' | 'gmail' | 'outlook';
  email: string;
  is_active: boolean;
  last_sync_at: string | null;
}

interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cleanText?: string;
  date: string;
  messageId?: string;
}

interface EmailSettingsPageContentProps {
  initialIntegrations: EmailIntegration[];
  initialUserId: number;
}

function EmailSettingsPageContent({ initialIntegrations, initialUserId }: EmailSettingsPageContentProps) {
  const [integrations, setIntegrations] = useState<EmailIntegration[]>(initialIntegrations);
  const [loading, setLoading] = useState(initialIntegrations.length === 0);
  const [showYahooForm, setShowYahooForm] = useState(false);
  const [yahooEmail, setYahooEmail] = useState('');
  const [yahooPassword, setYahooPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const yahooPasswordRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [fetchingEmail, setFetchingEmail] = useState<number | null>(null);
  const [lastEmailByIntegration, setLastEmailByIntegration] = useState<Record<number, EmailMessage | null>>({});
  const [deleting, setDeleting] = useState<number | null>(null);
  const [disconnectTargetId, setDisconnectTargetId] = useState<number | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const disconnectBackdropPressRef = useRef(false);
  const {
    toasts,
    removeToast,
    success: toastSuccess,
    error: toastError,
    info: toastInfo,
  } = useToast();

  // Store AbortControllers for cleanup
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const loadIntegrations = useCallback(async () => {
    try {
      const response = await fetchWithRetry(
        '/api/settings/email-integrations',
        {},
        { maxRetries: 2, initialDelay: 500 }
      );

      if (!response.ok) {
        toastError('Failed to load integrations');
        return;
      }

      const data = await response.json();
      setIntegrations(data.integrations || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toastError(`Failed to load integrations: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    if (initialIntegrations.length === 0) {
      void loadIntegrations();
    } else {
      setLoading(false);
    }

    return () => {
      abortControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      abortControllersRef.current.clear();
    };
  }, [initialIntegrations.length, loadIntegrations]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const errorCode = params.get('error');

    if (connected === 'gmail') {
      toastSuccess('Gmail conectat cu succes!');
      void loadIntegrations();
      window.history.replaceState({}, '', '/settings/email');
      return;
    }

    if (errorCode) {
      toastError('Conectarea Gmail a esuat. Incearca din nou.');
      window.history.replaceState({}, '', '/settings/email');
    }
  }, [loadIntegrations, toastError, toastSuccess]);

  function validateEmail(email: string): boolean {
    setEmailError(null);
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setEmailError(result.error.errors[0]?.message || 'Invalid email format');
      return false;
    }
    return true;
  }

  async function saveYahooIntegration() {
    const password = yahooPassword;

    if (!yahooEmail || !password) {
      setError('Please enter both email and password');
      return;
    }

    if (!validateEmail(yahooEmail)) return;

    setSaving(true);
    setError(null);

    const passwordToSend = password;

    if (yahooPasswordRef.current) yahooPasswordRef.current.value = '';
    setYahooPassword('');

    const requestId = 'save-yahoo';
    const controller = new AbortController();
    abortControllersRef.current.set(requestId, controller);

    try {
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetchWithRetry(
        '/api/settings/email-integrations/yahoo',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: initialUserId,
            email: yahooEmail.trim(),
            password: passwordToSend,
          }),
          signal: controller.signal,
        },
        { maxRetries: 2, initialDelay: 1000 }
      );

      clearTimeout(timeoutId);
      abortControllersRef.current.delete(requestId);

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || data.message || data.details || 'Failed to save integration';
        throw new Error(errorMsg);
      }

      toastSuccess('Yahoo Mail conectat cu succes!');
      setShowYahooForm(false);
      setYahooEmail('');
      setError(null);
      setEmailError(null);

      if (data.integration) {
        setIntegrations((prev) => {
          const existing = prev.findIndex(i => i.provider === 'yahoo');
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = {
              id: data.integration.id,
              provider: data.integration.provider,
              email: data.integration.email,
              is_active: data.integration.is_active,
              last_sync_at: data.integration.last_sync_at,
            };
            return updated;
          } else {
            return [...prev, {
              id: data.integration.id,
              provider: data.integration.provider,
              email: data.integration.email,
              is_active: data.integration.is_active,
              last_sync_at: data.integration.last_sync_at,
            }];
          }
        });
      } else {
        await loadIntegrations();
      }
    } catch (err) {
      abortControllersRef.current.delete(requestId);
      const error = err instanceof Error ? err : new Error('Unknown error');
      if (error.name === 'AbortError') {
        setError('Connection timeout. The connection test took too long. Please try again.');
        toastError('Connection timeout. Please try again.');
      } else {
        const errorMsg = error.message || 'Failed to save integration';
        setError(errorMsg);
        toastError(errorMsg);
      }
      if (yahooPasswordRef.current) yahooPasswordRef.current.value = '';
      setYahooPassword('');
    } finally {
      setSaving(false);
      if (yahooPasswordRef.current) yahooPasswordRef.current.value = '';
      setYahooPassword('');
    }
  }

  const handleDisconnectBackdropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    disconnectBackdropPressRef.current = e.target === e.currentTarget;
  };

  const handleDisconnectBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDisconnecting) return;
    const endedOnBackdrop = e.target === e.currentTarget;
    if (disconnectBackdropPressRef.current && endedOnBackdrop) {
      setDisconnectTargetId(null);
      setDisconnectError(null);
    }
    disconnectBackdropPressRef.current = false;
  };

  const handleDisconnectConfirm = async () => {
    if (isDisconnecting || disconnectTargetId === null) return;
    setDisconnectError(null);
    setIsDisconnecting(true);
    setDeleting(disconnectTargetId);
    try {
      const response = await fetchWithRetry(
        `/api/settings/email-integrations/${disconnectTargetId}`,
        { method: 'DELETE' },
        { maxRetries: 2, initialDelay: 500 }
      );
      if (!response.ok) throw new Error('Failed to delete integration');
      setDisconnectTargetId(null);
      toastSuccess('Integrare deconectată');
      await loadIntegrations();
    } catch {
      setDisconnectError('Nu s-a putut deconecta integrarea. Încearcă din nou.');
    } finally {
      setIsDisconnecting(false);
      setDeleting(null);
    }
  };

  async function testConnection(id: number) {
    setTesting(id);
    try {
      const response = await fetchWithRetry(
        `/api/settings/email-integrations/${id}/test`,
        { method: 'POST' },
        { maxRetries: 2, initialDelay: 500 }
      );

      const data = await response.json();

      if (data.success) {
        toastSuccess('Conexiune funcțională!');
      } else {
        toastError('Test eșuat: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toastError(`Failed to test connection: ${errorMessage}`);
    } finally {
      setTesting(null);
    }
  }

  async function fetchLastEmail(id: number) {
    setFetchingEmail(id);
    setLastEmailByIntegration((prev) => ({ ...prev, [id]: null }));
    try {
      const response = await fetchWithRetry(
        `/api/settings/email-integrations/${id}/fetch-last-email`,
        { method: 'POST' },
        { maxRetries: 2, initialDelay: 1000 }
      );

      const data = await response.json();

      if (data.success) {
        if (data.email) {
          setLastEmailByIntegration((prev) => ({ ...prev, [id]: data.email }));
          toastSuccess('Email preluat cu succes');
        } else {
          toastInfo(data.message || 'Niciun email găsit');
        }
      } else {
        toastError('Eroare la preluare: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toastError(`Failed to fetch email: ${errorMessage}`);
    } finally {
      setFetchingEmail(null);
    }
  }

  const yahooIntegration = integrations.find(i => i.provider === 'yahoo');
  const gmailIntegration = integrations.find(i => i.provider === 'gmail');
  const yahooLastEmail = yahooIntegration ? lastEmailByIntegration[yahooIntegration.id] : null;
  const gmailLastEmail = gmailIntegration ? lastEmailByIntegration[gmailIntegration.id] : null;
  const activeIntegrations = integrations.filter((integration) => integration.is_active);
  const latestSyncAt = activeIntegrations
    .map((integration) => integration.last_sync_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  const disconnectTarget = disconnectTargetId !== null
    ? integrations.find(i => i.id === disconnectTargetId)
    : null;

  if (loading) {
    return (
      <div className={navStyles.container}>
        <div className={styles.container}>
          <div role="status" aria-live="polite">Încărcare...</div>
        </div>
      </div>
    );
  }

  const sanitizeHtml = (html: string): string => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'a', 'ul', 'ol', 'li',
        'img', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'blockquote',
        'hr', 'pre', 'code', 'center', 'font',
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
        'class', 'id', 'colspan', 'rowspan', 'align', 'valign',
        'bgcolor', 'color', 'border', 'cellpadding', 'cellspacing',
      ],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: false,
      SAFE_FOR_TEMPLATES: false,
      SANITIZE_DOM: true,
      WHOLE_DOCUMENT: false,
    });
  };

  // Shared SVG icons
  // Test connection: wifi signal icon
  const IconWifi = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
  // Fetch last email: refresh/sync icon
  const IconRefresh = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
  const IconX = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
  const IconClock = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <div className={styles.tabRow}>
          <SettingsTabs activeTab="email" />
          {activeIntegrations.length > 0 && (
            <span className={styles.tabStatus}>
              <span className={styles.tabStatusDot} />
              {activeIntegrations.map((i) => i.provider).join(', ')}
              {latestSyncAt && (
                <span className={styles.tabStatusSync}>
                  · {format(new Date(latestSyncAt), 'dd MMM HH:mm', { locale: ro })}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Integrations table */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Furnizor</th>
                <th className={styles.colEmail}>Cont conectat</th>
                <th className={styles.colSync}>Ultima sincronizare</th>
                <th className={styles.colActions} />
              </tr>
            </thead>
            <tbody>
              {/* Yahoo Mail */}
              <tr className={styles.row}>
                <td>
                  <div className={styles.providerRow}>
                    <span className={yahooIntegration?.is_active ? styles.statusDot : styles.statusDotOff} />
                    <span className={styles.providerName}>Yahoo Mail</span>
                  </div>
                </td>
                <td className={styles.colEmail}>
                  {yahooIntegration
                    ? <span className={styles.cellMuted}>{yahooIntegration.email}</span>
                    : <span className={styles.cellEmpty}>—</span>
                  }
                </td>
                <td className={styles.colSync}>
                  {yahooIntegration?.last_sync_at
                    ? <span className={styles.cellMuted}>{format(new Date(yahooIntegration.last_sync_at), 'dd MMM HH:mm', { locale: ro })}</span>
                    : <span className={styles.cellEmpty}>—</span>
                  }
                </td>
                <td>
                  <div className={styles.actionGroup}>
                    {yahooIntegration ? (
                      <>
                        <button
                          className={styles.iconButton}
                          onClick={() => testConnection(yahooIntegration.id)}
                          disabled={testing === yahooIntegration.id || fetchingEmail === yahooIntegration.id || deleting === yahooIntegration.id}
                          title="Test conexiune"
                          aria-label="Test Yahoo Mail connection"
                        >
                          {testing === yahooIntegration.id ? <IconClock /> : <IconWifi />}
                        </button>
                        <button
                          className={styles.iconButton}
                          onClick={() => fetchLastEmail(yahooIntegration.id)}
                          disabled={testing === yahooIntegration.id || fetchingEmail === yahooIntegration.id || deleting === yahooIntegration.id}
                          title="Preia ultimul email"
                          aria-label="Fetch last email from Yahoo Mail"
                        >
                          {fetchingEmail === yahooIntegration.id ? <IconClock /> : <IconRefresh />}
                        </button>
                        <button
                          className={styles.iconButtonDanger}
                          onClick={() => setDisconnectTargetId(yahooIntegration.id)}
                          disabled={testing === yahooIntegration.id || fetchingEmail === yahooIntegration.id || deleting === yahooIntegration.id}
                          title="Deconectează"
                          aria-label="Disconnect Yahoo Mail"
                        >
                          <IconX />
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.connectBtn}
                        onClick={() => setShowYahooForm(!showYahooForm)}
                        aria-label="Conectează Yahoo Mail"
                      >
                        {showYahooForm ? 'Anulează' : 'Conectează'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {/* Gmail */}
              <tr className={styles.row}>
                <td>
                  <div className={styles.providerRow}>
                    <span className={gmailIntegration?.is_active ? styles.statusDot : styles.statusDotOff} />
                    <span className={styles.providerName}>Gmail</span>
                  </div>
                </td>
                <td className={styles.colEmail}>
                  {gmailIntegration
                    ? <span className={styles.cellMuted}>{gmailIntegration.email}</span>
                    : <span className={styles.cellEmpty}>—</span>
                  }
                </td>
                <td className={styles.colSync}>
                  {gmailIntegration?.last_sync_at
                    ? <span className={styles.cellMuted}>{format(new Date(gmailIntegration.last_sync_at), 'dd MMM HH:mm', { locale: ro })}</span>
                    : <span className={styles.cellEmpty}>—</span>
                  }
                </td>
                <td>
                  <div className={styles.actionGroup}>
                    {gmailIntegration ? (
                      <>
                        <button
                          className={styles.iconButton}
                          onClick={() => testConnection(gmailIntegration.id)}
                          disabled={testing === gmailIntegration.id || fetchingEmail === gmailIntegration.id || deleting === gmailIntegration.id}
                          title="Test conexiune"
                          aria-label="Test Gmail connection"
                        >
                          {testing === gmailIntegration.id ? <IconClock /> : <IconWifi />}
                        </button>
                        <button
                          className={styles.iconButton}
                          onClick={() => fetchLastEmail(gmailIntegration.id)}
                          disabled={testing === gmailIntegration.id || fetchingEmail === gmailIntegration.id || deleting === gmailIntegration.id}
                          title="Preia ultimul email"
                          aria-label="Fetch last Gmail email"
                        >
                          {fetchingEmail === gmailIntegration.id ? <IconClock /> : <IconRefresh />}
                        </button>
                        <button
                          className={styles.iconButtonDanger}
                          onClick={() => setDisconnectTargetId(gmailIntegration.id)}
                          disabled={testing === gmailIntegration.id || fetchingEmail === gmailIntegration.id || deleting === gmailIntegration.id}
                          title="Deconectează"
                          aria-label="Disconnect Gmail"
                        >
                          <IconX />
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.connectBtn}
                        onClick={() => { window.location.href = '/api/auth/google/email'; }}
                        aria-label="Conectează Gmail"
                      >
                        Conectează
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {/* Outlook */}
              <tr className={styles.row}>
                <td>
                  <div className={styles.providerRow}>
                    <span className={styles.statusDotOff} />
                    <span className={styles.providerName}>Outlook</span>
                  </div>
                </td>
                <td className={styles.colEmail}>
                  <span className={styles.cellEmpty}>—</span>
                </td>
                <td className={styles.colSync}>
                  <span className={styles.cellEmpty}>—</span>
                </td>
                <td>
                  <div className={styles.actionGroup}>
                    <button className={styles.connectBtn} disabled aria-label="Outlook în curând">
                      În curând
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Yahoo connect form */}
        {showYahooForm && !yahooIntegration && (
          <div className={styles.formCard}>
            <h3>Conectează Yahoo Mail</h3>
            <p className={styles.formNote}>
              Folosește o parolă pentru aplicații Yahoo.{' '}
              <a href="https://login.yahoo.com/myaccount/security/" target="_blank" rel="noopener noreferrer">
                Creează o parolă pentru aplicații
              </a>
            </p>
            {error && (
              <div className={styles.error} role="alert" aria-live="assertive">
                {error}
              </div>
            )}
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="yahoo-email">Adresă email</label>
                <input
                  id="yahoo-email"
                  type="email"
                  placeholder="utilizator@yahoo.com"
                  value={yahooEmail}
                  onChange={(e) => {
                    setYahooEmail(e.target.value);
                    if (emailError) validateEmail(e.target.value);
                  }}
                  onBlur={(e) => validateEmail(e.target.value)}
                  aria-required="true"
                  aria-invalid={!!emailError}
                />
                {emailError && (
                  <span className={styles.fieldError} role="alert">{emailError}</span>
                )}
              </div>
              <div className={styles.field}>
                <label htmlFor="yahoo-password">Parolă aplicație</label>
                <input
                  id="yahoo-password"
                  type="password"
                  placeholder="xxxx xxxx xxxx xxxx"
                  ref={yahooPasswordRef}
                  value={yahooPassword}
                  onChange={(e) => setYahooPassword(e.target.value)}
                  aria-required="true"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !saving) {
                      e.preventDefault();
                      saveYahooIntegration();
                    }
                  }}
                />
              </div>
            </div>
            <div className={styles.formActions}>
              <button
                type="button"
                onClick={() => {
                  setShowYahooForm(false);
                  setError(null);
                  setEmailError(null);
                  setYahooEmail('');
                  setYahooPassword('');
                  if (yahooPasswordRef.current) yahooPasswordRef.current.value = '';
                }}
                className={styles.secondaryButton}
              >
                Anulează
              </button>
              <button
                type="button"
                onClick={saveYahooIntegration}
                disabled={saving || !yahooEmail.trim() || !yahooPassword || !!emailError}
                className={styles.primaryButton}
              >
                {saving ? 'Se conectează...' : 'Conectează'}
              </button>
            </div>
          </div>
        )}

        {/* Email previews */}
        {yahooLastEmail && yahooIntegration && (
          <div className={styles.emailPreview} role="article" aria-label="Yahoo Mail — ultimul email">
            <div className={styles.emailHeader}>
              <h3>Ultimul email — Yahoo Mail</h3>
              <button
                onClick={() => setLastEmailByIntegration((prev) => ({ ...prev, [yahooIntegration.id]: null }))}
                className={styles.closeButton}
                title="Închide"
                aria-label="Close email preview"
              >
                <IconX />
              </button>
            </div>
            <div className={styles.emailMeta}>
              <p><strong>De la:</strong> {yahooLastEmail.from}</p>
              <p><strong>Către:</strong> {yahooLastEmail.to}</p>
              <p><strong>Subiect:</strong> {yahooLastEmail.subject || '(fără subiect)'}</p>
              <p><strong>Data:</strong> {new Date(yahooLastEmail.date).toLocaleString('ro-RO')}</p>
            </div>
            <div className={styles.emailContent}>
              {yahooLastEmail.html ? (
                <div
                  className={styles.emailHtml}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(yahooLastEmail.html) }}
                  aria-label="Email content"
                />
              ) : (
                <div className={styles.emailText} aria-label="Email text content">
                  <pre>{yahooLastEmail.text || yahooLastEmail.cleanText || '(fără conținut)'}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {gmailLastEmail && gmailIntegration && (
          <div className={styles.emailPreview} role="article" aria-label="Gmail — ultimul email">
            <div className={styles.emailHeader}>
              <h3>Ultimul email — Gmail</h3>
              <button
                onClick={() => setLastEmailByIntegration((prev) => ({ ...prev, [gmailIntegration.id]: null }))}
                className={styles.closeButton}
                title="Închide"
                aria-label="Close email preview"
              >
                <IconX />
              </button>
            </div>
            <div className={styles.emailMeta}>
              <p><strong>De la:</strong> {gmailLastEmail.from}</p>
              <p><strong>Către:</strong> {gmailLastEmail.to}</p>
              <p><strong>Subiect:</strong> {gmailLastEmail.subject || '(fără subiect)'}</p>
              <p><strong>Data:</strong> {new Date(gmailLastEmail.date).toLocaleString('ro-RO')}</p>
            </div>
            <div className={styles.emailContent}>
              {gmailLastEmail.html ? (
                <div
                  className={styles.emailHtml}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(gmailLastEmail.html) }}
                  aria-label="Email content"
                />
              ) : (
                <div className={styles.emailText} aria-label="Email text content">
                  <pre>{gmailLastEmail.text || gmailLastEmail.cleanText || '(fără conținut)'}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Disconnect confirmation modal */}
        {disconnectTargetId !== null && (
          <div
            className={styles.overlay}
            onPointerDown={handleDisconnectBackdropPointerDown}
            onClick={handleDisconnectBackdropClick}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !isDisconnecting) {
                setDisconnectTargetId(null);
                setDisconnectError(null);
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disconnect-modal-title"
          >
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3 id="disconnect-modal-title">Deconectare integrare</h3>
              <p className={styles.modalBody}>
                Sigur vrei să deconectezi integrarea pentru <strong>{disconnectTarget?.email || disconnectTarget?.provider}</strong>?
              </p>
              {disconnectError && (
                <p className={styles.modalError}>{disconnectError}</p>
              )}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  autoFocus
                  onClick={() => { setDisconnectTargetId(null); setDisconnectError(null); }}
                  disabled={isDisconnecting}
                >
                  Renunță
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  disabled={isDisconnecting}
                  onClick={handleDisconnectConfirm}
                >
                  {isDisconnecting ? 'Se deconectează...' : 'Deconectează'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

export default function EmailSettingsPageClient({ initialIntegrations, initialUserId }: EmailSettingsPageContentProps) {
  return (
    <ErrorBoundary>
      <EmailSettingsPageContent initialIntegrations={initialIntegrations} initialUserId={initialUserId} />
    </ErrorBoundary>
  );
}
