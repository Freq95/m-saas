'use client';

import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { DEFAULT_USER_ID } from '@/lib/constants';
import { emailSchema } from '@/lib/validation';
import { fetchWithRetry } from '@/lib/retry';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './page.module.css';
import navStyles from '../../dashboard/page.module.css';

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
}

function EmailSettingsPageContent({ initialIntegrations }: EmailSettingsPageContentProps) {
  const [integrations, setIntegrations] = useState<EmailIntegration[]>(initialIntegrations);
  const [loading, setLoading] = useState(initialIntegrations.length === 0);
  const [showYahooForm, setShowYahooForm] = useState(false);
  const [yahooEmail, setYahooEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const yahooPasswordRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [fetchingEmail, setFetchingEmail] = useState<number | null>(null);
  const [lastEmail, setLastEmail] = useState<EmailMessage | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const toast = useToast();
  
  // Store AbortControllers for cleanup
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    if (initialIntegrations.length === 0) {
      loadIntegrations();
    } else {
      setLoading(false);
    }

    // Cleanup function to abort all pending requests on unmount
    return () => {
      abortControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      abortControllersRef.current.clear();
    };
  }, [initialIntegrations.length]);

  async function loadIntegrations() {
    try {
      // TODO: Replace DEFAULT_USER_ID with actual userId from session/auth context
      // For now, using DEFAULT_USER_ID as fallback until authentication is implemented
      const response = await fetchWithRetry(
        `/api/settings/email-integrations?userId=${DEFAULT_USER_ID}`,
        {},
        { maxRetries: 2, initialDelay: 500 }
      );
      
      if (!response.ok) {
        toast.error('Failed to load integrations');
        return;
      }
      
      const data = await response.json();
      const integrationsList = data.integrations || [];
      setIntegrations(integrationsList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to load integrations: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

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
    const password = yahooPasswordRef.current?.value || '';
    
    if (!yahooEmail || !password) {
      setError('Please enter both email and password');
      return;
    }

    // Validate email format
    if (!validateEmail(yahooEmail)) {
      return;
    }

    setSaving(true);
    setError(null);
    
    const passwordToSend = password;
    
    if (yahooPasswordRef.current) {
      yahooPasswordRef.current.value = '';
    }
    
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
            userId: DEFAULT_USER_ID, // TODO: Get from session/auth context
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
      
      toast.success('Yahoo Mail integration connected successfully!');
      
      setShowYahooForm(false);
      setYahooEmail('');
      setError(null);
      setEmailError(null);
      
      // Single reload - update state directly from response
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
        toast.error('Connection timeout. Please try again.');
      } else {
        const errorMsg = error.message || 'Failed to save integration';
        setError(errorMsg);
        toast.error(errorMsg);
      }
      if (yahooPasswordRef.current) {
        yahooPasswordRef.current.value = '';
      }
    } finally {
      setSaving(false);
      if (yahooPasswordRef.current) {
        yahooPasswordRef.current.value = '';
      }
    }
  }

  async function deleteIntegration(id: number) {
    if (!window.confirm('Are you sure you want to disconnect this integration?')) {
      return;
    }
    
    setDeleting(id);
    try {
      const response = await fetchWithRetry(
        `/api/settings/email-integrations/${id}?userId=${DEFAULT_USER_ID}`, // TODO: Get from session
        { method: 'DELETE' },
        { maxRetries: 2, initialDelay: 500 }
      );
      
      if (!response.ok) {
        throw new Error('Failed to delete integration');
      }
      
      toast.success('Integration disconnected successfully');
      await loadIntegrations();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to delete integration: ${errorMessage}`);
    } finally {
      setDeleting(null);
    }
  }

  async function testConnection(id: number) {
    setTesting(id);
    try {
      const response = await fetchWithRetry(
        `/api/settings/email-integrations/${id}/test?userId=${DEFAULT_USER_ID}`, // TODO: Get from session
        { method: 'POST' },
        { maxRetries: 2, initialDelay: 500 }
      );
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Connection test successful!');
      } else {
        toast.error('Connection test failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to test connection: ${errorMessage}`);
    } finally {
      setTesting(null);
    }
  }

  async function fetchLastEmail(id: number) {
    setFetchingEmail(id);
    setLastEmail(null);
    try {
      const response = await fetchWithRetry(
        `/api/settings/email-integrations/${id}/fetch-last-email?userId=${DEFAULT_USER_ID}`, // TODO: Get from session
        { method: 'POST' },
        { maxRetries: 2, initialDelay: 1000 }
      );
      
      const data = await response.json();
      
      if (data.success) {
        if (data.email) {
          setLastEmail(data.email);
          toast.success('Email fetched successfully');
        } else {
          toast.info(data.message || 'No emails found');
        }
      } else {
        toast.error('Failed to fetch email: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to fetch email: ${errorMessage}`);
    } finally {
      setFetchingEmail(null);
    }
  }

  const yahooIntegration = integrations.find(i => i.provider === 'yahoo');

  if (loading) {
    return (
      <div className={navStyles.container}>
        <div className={styles.container}>
          <div role="status" aria-live="polite" aria-label="Loading integrations">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // Enhanced DOMPurify configuration for better security
  const sanitizeHtml = (html: string): string => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'a', 'ul', 'ol', 'li',
        'img', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'blockquote',
        'hr', 'pre', 'code', 'center', 'font'
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
        'class', 'id', 'colspan', 'rowspan', 'align', 'valign',
        'bgcolor', 'color', 'border', 'cellpadding', 'cellspacing'
      ],
      // Security enhancements
      ALLOW_DATA_ATTR: false, // Disable data attributes
      ALLOW_UNKNOWN_PROTOCOLS: false, // Only allow known protocols (http, https, mailto)
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'], // Explicitly forbid dangerous tags
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'], // Forbid event handlers
      KEEP_CONTENT: true, // Keep text content even if tags are removed
      RETURN_DOM: false, // Return string, not DOM
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: false,
      SAFE_FOR_TEMPLATES: false, // Not using in templates, so false is safer
      SANITIZE_DOM: true, // Sanitize DOM
      WHOLE_DOCUMENT: false, // Not a full document
    });
  };

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <h1>Email Integrations</h1>
        <p className={styles.description}>
          Connect your email accounts to sync messages and manage conversations.
        </p>
        
        {/* Yahoo Mail */}
        <div className={styles.integrationCard} role="region" aria-label="Yahoo Mail integration">
          <div className={styles.integrationHeader}>
            <div>
              <h2>Yahoo Mail</h2>
              <p className={styles.providerDescription}>
                Connect your Yahoo Mail account using an App Password. 
                <a 
                  href="https://help.yahoo.com/kb/generate-third-party-passwords-sln15241.html" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={styles.link}
                  aria-label="Learn how to generate an App Password for Yahoo Mail"
                >
                  Learn how to generate an App Password
                </a>
              </p>
            </div>
            {yahooIntegration ? (
              <span 
                className={yahooIntegration.is_active ? styles.statusConnected : styles.statusDisconnected}
                role="status"
                aria-live="polite"
                aria-label={yahooIntegration.is_active ? 'Yahoo Mail connected' : 'Yahoo Mail disconnected'}
              >
                {yahooIntegration.is_active ? 'Connected' : 'Disconnected'}
              </span>
            ) : (
              <span 
                className={styles.statusDisconnected}
                role="status"
                aria-label="Yahoo Mail not connected"
              >
                Not Connected
              </span>
            )}
          </div>
          
          {yahooIntegration ? (
            <div className={styles.integrationDetails}>
              <p><strong>Email:</strong> {yahooIntegration.email}</p>
              {yahooIntegration.last_sync_at && (
                <p><strong>Last Sync:</strong> {new Date(yahooIntegration.last_sync_at).toLocaleString()}</p>
              )}
              <div className={styles.actions} role="group" aria-label="Integration actions">
                <button 
                  onClick={() => testConnection(yahooIntegration.id)} 
                  className={styles.testButton}
                  disabled={testing === yahooIntegration.id || fetchingEmail === yahooIntegration.id || deleting === yahooIntegration.id}
                  aria-label="Test Yahoo Mail connection"
                  aria-busy={testing === yahooIntegration.id}
                >
                  {testing === yahooIntegration.id ? 'Testing...' : 'Test Connection'}
                </button>
                <button 
                  onClick={() => fetchLastEmail(yahooIntegration.id)} 
                  className={styles.fetchButton}
                  disabled={testing === yahooIntegration.id || fetchingEmail === yahooIntegration.id || deleting === yahooIntegration.id}
                  aria-label="Fetch last email from Yahoo Mail"
                  aria-busy={fetchingEmail === yahooIntegration.id}
                >
                  {fetchingEmail === yahooIntegration.id ? 'Fetching...' : 'Fetch Last Email'}
                </button>
                <button 
                  onClick={() => deleteIntegration(yahooIntegration.id)} 
                  className={styles.deleteButton}
                  disabled={testing === yahooIntegration.id || fetchingEmail === yahooIntegration.id || deleting === yahooIntegration.id}
                  aria-label="Disconnect Yahoo Mail integration"
                  aria-busy={deleting === yahooIntegration.id}
                >
                  {deleting === yahooIntegration.id ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
              {lastEmail && (
                <div className={styles.emailPreview} role="article" aria-label="Last email preview">
                  <div className={styles.emailHeader}>
                    <h3>Last Email Received</h3>
                    <button 
                      onClick={() => setLastEmail(null)} 
                      className={styles.closeButton}
                      title="Close"
                      aria-label="Close email preview"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.emailMeta}>
                    <p><strong>From:</strong> {lastEmail.from}</p>
                    <p><strong>To:</strong> {lastEmail.to}</p>
                    <p><strong>Subject:</strong> {lastEmail.subject || '(No subject)'}</p>
                    <p><strong>Date:</strong> {new Date(lastEmail.date).toLocaleString()}</p>
                  </div>
                  <div className={styles.emailContent}>
                    {lastEmail.html ? (
                      <div 
                        className={styles.emailHtml}
                        dangerouslySetInnerHTML={{ 
                          __html: sanitizeHtml(lastEmail.html)
                        }}
                        aria-label="Email content"
                      />
                    ) : (
                      <div className={styles.emailText} aria-label="Email text content">
                        <pre>{lastEmail.text || lastEmail.cleanText || '(No content)'}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {!showYahooForm ? (
                <button 
                  onClick={() => setShowYahooForm(true)} 
                  className={styles.connectButton}
                  aria-label="Connect Yahoo Mail account"
                >
                  Connect Yahoo Mail
                </button>
              ) : (
                <div className={styles.form} role="form" aria-label="Yahoo Mail connection form">
                  {error && (
                    <div 
                      className={styles.error} 
                      role="alert" 
                      aria-live="assertive"
                      aria-atomic="true"
                    >
                      {error}
                    </div>
                  )}
                  <label htmlFor="yahoo-email" className="sr-only">
                    Yahoo Email Address
                  </label>
                  <input
                    id="yahoo-email"
                    type="email"
                    placeholder="Yahoo Email"
                    value={yahooEmail}
                    onChange={(e) => {
                      setYahooEmail(e.target.value);
                      if (emailError) {
                        validateEmail(e.target.value);
                      }
                    }}
                    onBlur={(e) => validateEmail(e.target.value)}
                    className={styles.input}
                    aria-label="Yahoo email address"
                    aria-required="true"
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'email-error' : undefined}
                  />
                  {emailError && (
                    <div 
                      id="email-error"
                      className={styles.error} 
                      role="alert"
                      aria-live="polite"
                    >
                      {emailError}
                    </div>
                  )}
                  <label htmlFor="yahoo-password" className="sr-only">
                    Yahoo App Password
                  </label>
                  <input
                    id="yahoo-password"
                    type="password"
                    placeholder="App Password (recommended)"
                    ref={yahooPasswordRef}
                    className={styles.input}
                    aria-label="Yahoo App Password"
                    aria-required="true"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !saving) {
                        e.preventDefault();
                        saveYahooIntegration();
                      }
                    }}
                  />
                  <div className={styles.formActions} role="group" aria-label="Form actions">
                    <button 
                      type="button"
                      onClick={saveYahooIntegration} 
                      disabled={saving || !yahooEmail || !yahooPasswordRef.current?.value || !!emailError} 
                      className={styles.saveButton}
                      aria-label="Save Yahoo Mail integration"
                      aria-busy={saving}
                    >
                      {saving ? 'Connecting...' : 'Save'}
                    </button>
                    <button 
                      onClick={() => {
                        setShowYahooForm(false);
                        setError(null);
                        setEmailError(null);
                        if (yahooPasswordRef.current) {
                          yahooPasswordRef.current.value = '';
                        }
                      }} 
                      className={styles.cancelButton}
                      aria-label="Cancel Yahoo Mail connection"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Gmail - Placeholder */}
        <div className={styles.integrationCard} role="region" aria-label="Gmail integration">
          <div className={styles.integrationHeader}>
            <div>
              <h2>Gmail</h2>
              <p className={styles.providerDescription}>
                Connect your Gmail account using OAuth 2.0 (coming soon)
              </p>
            </div>
            <span className={styles.statusDisconnected} aria-label="Gmail not connected">Not Connected</span>
          </div>
          <button disabled className={styles.connectButton} aria-label="Gmail connection coming soon">
            Connect with Google (Coming Soon)
          </button>
        </div>

        {/* Outlook - Placeholder */}
        <div className={styles.integrationCard} role="region" aria-label="Outlook integration">
          <div className={styles.integrationHeader}>
            <div>
              <h2>Outlook</h2>
              <p className={styles.providerDescription}>
                Connect your Outlook account using OAuth 2.0 (coming soon)
              </p>
            </div>
            <span className={styles.statusDisconnected} aria-label="Outlook not connected">Not Connected</span>
          </div>
          <button disabled className={styles.connectButton} aria-label="Outlook connection coming soon">
            Connect with Microsoft (Coming Soon)
          </button>
        </div>
      </div>
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}

export default function EmailSettingsPageClient({ initialIntegrations }: EmailSettingsPageContentProps) {
  return (
    <ErrorBoundary>
      <EmailSettingsPageContent initialIntegrations={initialIntegrations} />
    </ErrorBoundary>
  );
}
