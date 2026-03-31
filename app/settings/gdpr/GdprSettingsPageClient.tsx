'use client';

import { useState } from 'react';
import SettingsTabs from '../SettingsTabs';
import styles from '../services/page.module.css';
import navStyles from '../../dashboard/page.module.css';

interface GdprSettingsPageClientProps {
  initialText: string;
}

export default function GdprSettingsPageClient({ initialText }: GdprSettingsPageClientProps) {
  const [text, setText] = useState(initialText);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirty = text.trim() !== initialText.trim();

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/settings/gdpr', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gdpr_privacy_notice_text: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Eroare la salvare');
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError('Eroare de retea');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <SettingsTabs activeTab="gdpr" />

        <header className={styles.header}>
          <div>
            <h1>Setari GDPR</h1>
            <p className={styles.description}>
              Personalizeaza textul notificarii GDPR afisate pacientilor la inregistrarea consimtamantului.
            </p>
          </div>
        </header>

        <div className={styles.formCard}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label
              htmlFor="privacyNotice"
              style={{ fontSize: '0.88rem', color: 'var(--color-text-soft)', fontWeight: 600 }}
            >
              Text notificare GDPR afisata pacientilor
            </label>
            <textarea
              id="privacyNotice"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={2000}
              style={{
                width: '100%',
                background: 'var(--color-surface-muted)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text)',
                padding: 'var(--space-3)',
                fontSize: '0.95rem',
                lineHeight: 1.6,
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>
              {text.length} / 2000 caractere
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              Acest text este afisat pacientilor atunci cand cabinetul inregistreaza consimtamantul GDPR.
              Editarea este disponibila doar pentru proprietarul cabinetului.
            </p>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.formActions}>
            {saved && (
              <span style={{ fontSize: '0.9rem', color: 'var(--color-success)', alignSelf: 'center' }}>
                Salvat cu succes
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={styles.primaryButton}
            >
              {saving ? 'Se salveaza...' : 'Salveaza'}
            </button>
          </div>
        </div>

        <div className={styles.formCard}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
            Resurse GDPR
          </h2>
          <ul style={{ fontSize: '0.9rem', color: 'var(--color-text-soft)', lineHeight: 2, paddingLeft: 'var(--space-4)' }}>
            <li>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
                Politica de confidentialitate a platformei
              </a>
            </li>
            <li>
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
                Termeni si conditii
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
