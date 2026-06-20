'use client';

import { useState } from 'react';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/lib/useToast';
import navStyles from '../../dashboard/page.module.css';
import styles from './page.module.css';
import SettingsTabs from '../SettingsTabs';
import { SettingsMobileHeader } from '../SettingsMobileHeader';
interface AccountSettingsPageClientProps {
  initialName: string;
  initialEmail: string;
  isOwner?: boolean;
}

export default function AccountSettingsPageClient({ initialName, initialEmail, isOwner }: AccountSettingsPageClientProps) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName.trim());
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const toast = useToast();
  const normalizedName = name.trim();
  const profileDirty = normalizedName !== savedName;

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Nu am putut salva profilul.');
      }
      toast.success('Profil actualizat.');
      setSavedName(normalizedName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva profilul.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (!currentPassword) {
      toast.error('Introdu parola curenta.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Noua parola trebuie să aiba cel puțin 8 caractere.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Parolele nu coincid.');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Nu am putut schimba parola.');
      }
      toast.success('Parola a fost schimbata. Alte sesiuni au fost deconectate.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut schimba parola.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <SettingsMobileHeader title="Cont" />
        <div className={`${styles.tabRow} ${styles.desktopTabRow}`}>
          <SettingsTabs activeTab="account" isOwner={isOwner} />
        </div>

        {/* Profile section */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Profil</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Nume</span>
              <input
                type="text"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={savingProfile}
                placeholder="Numele tau"
              />
            </label>
            <label className={styles.field}>
              <span>Email</span>
              <input
                type="email"
                maxLength={255}
                value={initialEmail}
                readOnly
                aria-readonly="true"
              />
            </label>
          </div>
          <div className={styles.sectionActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={saveProfile}
              disabled={savingProfile || !profileDirty}
            >
              {savingProfile ? 'Se salvează...' : 'Salvează profilul'}
            </button>
          </div>
        </section>

        {/* Password section */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Schimba parola</h3>
          <div className={styles.formStack}>
            <label className={styles.field}>
              <span>Parola curentă</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={savingPassword}
                autoComplete="current-password"
              />
            </label>
            <label className={styles.field}>
              <span>Parola noua</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={savingPassword}
                autoComplete="new-password"
                placeholder="Minimum 8 caractere"
              />
            </label>
            <label className={styles.field}>
              <span>Confirma parola noua</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={savingPassword}
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className={styles.sectionActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={changePassword}
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {savingPassword ? 'Se schimba...' : 'Schimba parola'}
            </button>
          </div>
        </section>
      </div>

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
