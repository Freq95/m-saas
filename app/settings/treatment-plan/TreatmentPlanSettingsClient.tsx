'use client';

import { useRef, useState } from 'react';
import navStyles from '../../dashboard/page.module.css';
import SettingsTabs from '../SettingsTabs';
import { SettingsMobileHeader } from '../SettingsMobileHeader';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/lib/useToast';
import styles from './treatment-plan.module.css';

type SettingsPayload = {
  settings: {
    clinic_name: string;
    logo_storage_key: string | null;
    disclaimer: string;
    signature_label_doctor: string;
    signature_label_patient: string;
    currency: string;
  };
  doctorSubtitle: string;
  doctorSpecialty: string;
};

type Props = {
  initialPayload: SettingsPayload;
  isOwner: boolean;
};

export default function TreatmentPlanSettingsClient({ initialPayload, isOwner }: Props) {
  const [form, setForm] = useState({
    clinic_name: initialPayload.settings.clinic_name,
    disclaimer: initialPayload.settings.disclaimer,
    signature_label_doctor: initialPayload.settings.signature_label_doctor,
    signature_label_patient: initialPayload.settings.signature_label_patient,
    currency: initialPayload.settings.currency,
    doctorSubtitle: initialPayload.doctorSubtitle || '',
    doctorSpecialty: initialPayload.doctorSpecialty || '',
  });
  const [logoKey, setLogoKey] = useState(initialPayload.settings.logo_storage_key);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  function updateField(name: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/treatment-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut salva setarile.');
      toast.success('Setarile planului de tratament au fost salvate.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut salva setarile.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/settings/treatment-plan/logo', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut încărca logo-ul.');
      setLogoKey(data.settings?.logo_storage_key || null);
      toast.success('Logo-ul a fost încărcat.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut încărca logo-ul.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <SettingsMobileHeader title="Plan de tratament" />
        <div className={styles.tabRow}>
          <SettingsTabs activeTab="treatment-plan" isOwner={isOwner} />
        </div>

        <div className={styles.grid}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Branding clinică</h2>
              {!isOwner && <span>Doar proprietarul poate edita aceste câmpuri.</span>}
            </div>
            <label className={styles.field}>
              <span>Nume clinică</span>
              <input value={form.clinic_name} onChange={(event) => updateField('clinic_name', event.target.value)} disabled={!isOwner || saving} />
            </label>
            <label className={styles.field}>
              <span>Disclaimer</span>
              <textarea rows={4} value={form.disclaimer} onChange={(event) => updateField('disclaimer', event.target.value)} disabled={!isOwner || saving} />
            </label>
            <div className={styles.twoCols}>
              <label className={styles.field}>
                <span>Semnătură medic</span>
                <input value={form.signature_label_doctor} onChange={(event) => updateField('signature_label_doctor', event.target.value)} disabled={!isOwner || saving} />
              </label>
              <label className={styles.field}>
                <span>Semnătură pacient</span>
                <input value={form.signature_label_patient} onChange={(event) => updateField('signature_label_patient', event.target.value)} disabled={!isOwner || saving} />
              </label>
            </div>
            <label className={styles.field}>
              <span>Monedă</span>
              <input value={form.currency} onChange={(event) => updateField('currency', event.target.value)} disabled={!isOwner || saving} />
            </label>
            <div className={styles.logoRow}>
              <div>
                <strong>Logo</strong>
                <span>{logoKey ? 'Logo încărcat pentru PDF.' : 'Fără logo. Se folosește numele clinicii.'}</span>
              </div>
              {isOwner && (
                <label className={styles.secondaryButton}>
                  {uploading ? 'Se încarcă...' : 'Încarcă logo'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadLogo(file);
                    }}
                  />
                </label>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Semnătura mea</h2>
              <span>Aceste linii apar pe planurile generate de tine.</span>
            </div>
            <label className={styles.field}>
              <span>Linie doctor</span>
              <input value={form.doctorSubtitle} onChange={(event) => updateField('doctorSubtitle', event.target.value)} disabled={saving} placeholder="BY DR. ANDREEA NICOLESCU" />
            </label>
            <label className={styles.field}>
              <span>Specialitate</span>
              <input value={form.doctorSpecialty} onChange={(event) => updateField('doctorSpecialty', event.target.value)} disabled={saving} placeholder="CHIRURG MAXILO FACIAL" />
            </label>
          </section>
        </div>

        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={saveSettings} disabled={saving}>
            {saving ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
        <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      </div>
    </div>
  );
}
