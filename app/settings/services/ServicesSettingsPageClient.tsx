'use client';

import { Fragment, useRef, useState } from 'react';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/lib/useToast';
import navStyles from '../../dashboard/page.module.css';
import styles from './page.module.css';
import SettingsTabs from '../SettingsTabs';

export interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price: number | null;
}

interface ServicesSettingsPageClientProps {
  initialServices: Service[];
}

interface ServiceFormState {
  name: string;
  durationMinutes: string;
  price: string;
}

const EMPTY_FORM: ServiceFormState = {
  name: '',
  durationMinutes: '',
  price: '',
};

function formatPrice(value: number | null): string {
  if (value === null || value === undefined) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function validateForm(form: ServiceFormState): string | null {
  const name = form.name.trim();
  if (name.length < 1 || name.length > 255) {
    return 'Numele este obligatoriu si trebuie sa aiba maximum 255 caractere.';
  }

  const duration = Number.parseInt(form.durationMinutes, 10);
  if (!Number.isInteger(duration) || duration <= 0) {
    return 'Durata trebuie sa fie un numar intreg pozitiv.';
  }

  if (form.price.trim() !== '') {
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      return 'Pretul trebuie sa fie un numar mai mare sau egal cu 0.';
    }
  }

  return null;
}

export default function ServicesSettingsPageClient({ initialServices }: ServicesSettingsPageClientProps) {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addForm, setAddForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteBackdropPressRef = useRef(false);
  const toast = useToast();

  function openAddForm() {
    setShowAddForm(true);
    setError(null);
    setConfirmDeleteId(null);
  }

  function closeAddForm() {
    setShowAddForm(false);
    setAddForm(EMPTY_FORM);
    setError(null);
  }

  function startEdit(service: Service) {
    setEditingId(service.id);
    setConfirmDeleteId(null);
    setError(null);
    setEditForm({
      name: service.name,
      durationMinutes: String(service.duration_minutes),
      price: service.price === null ? '' : String(service.price),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
    setError(null);
  }

  async function handleAddService() {
    const validationError = validateForm(addForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: addForm.name.trim(),
        durationMinutes: Number.parseInt(addForm.durationMinutes, 10),
        ...(addForm.price.trim() !== '' ? { price: Number(addForm.price) } : {}),
      };

      const response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { service?: Service; error?: string };

      if (!response.ok || !data.service) {
        throw new Error(data.error || 'Nu am putut adauga serviciul.');
      }

      setServices((prev) => [...prev, data.service as Service]);
      closeAddForm();
      toast.success('Serviciu adaugat cu succes.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nu am putut adauga serviciul.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: number) {
    const validationError = validateForm(editForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: editForm.name.trim(),
        durationMinutes: Number.parseInt(editForm.durationMinutes, 10),
        ...(editForm.price.trim() !== '' ? { price: Number(editForm.price) } : {}),
      };

      const response = await fetch(`/api/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { service?: Service; error?: string };

      if (!response.ok || !data.service) {
        throw new Error(data.error || 'Nu am putut actualiza serviciul.');
      }

      setServices((prev) => prev.map((service) => (service.id === id ? data.service as Service : service)));
      setEditingId(null);
      setEditForm(EMPTY_FORM);
      toast.success('Serviciu actualizat.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nu am putut actualiza serviciul.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteService(id: number) {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/services/${id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        const message =
          response.status === 400
            ? 'Serviciul este folosit in programari si nu poate fi sters.'
            : data.error || 'Nu am putut sterge serviciul.';
        setDeleteError(message);
        return;
      }

      setServices((prev) => prev.filter((service) => service.id !== id));
      setConfirmDeleteId(null);
      setDeleteError(null);
      toast.success('Serviciu sters.');
    } catch {
      setDeleteError('Nu am putut sterge serviciul.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <div className={styles.tabRow}>
          <SettingsTabs activeTab="services" />
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => (showAddForm ? closeAddForm() : openAddForm())}
            disabled={saving}
          >
            {showAddForm ? 'Anuleaza' : '+ Manopera'}
          </button>
        </div>

        {showAddForm && (
          <div className={styles.formCard}>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Serviciu *</span>
                <input
                  type="text"
                  maxLength={255}
                  value={addForm.name}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))}
                  disabled={saving}
                />
              </label>
              <label className={styles.field}>
                <span>Durata (min) *</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={addForm.durationMinutes}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, durationMinutes: event.target.value }))}
                  disabled={saving}
                />
              </label>
              <label className={styles.field}>
                <span>Pret (RON)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={addForm.price}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, price: event.target.value }))}
                  disabled={saving}
                />
              </label>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.secondaryButton} onClick={closeAddForm} disabled={saving}>
                Anuleaza
              </button>
              <button type="button" className={styles.primaryButton} onClick={handleAddService} disabled={saving}>
                {saving ? 'Se salveaza...' : 'Salveaza'}
              </button>
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {services.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Niciun serviciu adaugat inca.</p>
            <button type="button" className={styles.primaryButton} onClick={openAddForm} disabled={saving}>
              + Adauga prima manopera
            </button>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Servicii Medicale</th>
                  <th>Durata (min)</th>
                  <th>Pret RON</th>
                  <th aria-label="Actiuni" />
                </tr>
              </thead>
              <tbody>
                {services.map((service) => {
                  const isEditing = editingId === service.id;

                  return (
                    <Fragment key={service.id}>
                      <tr className={styles.row}>
                        {isEditing ? (
                          <>
                            <td>
                              <input
                                type="text"
                                maxLength={255}
                                value={editForm.name}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                                disabled={saving}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={editForm.durationMinutes}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                                }
                                disabled={saving}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={editForm.price}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, price: event.target.value }))}
                                disabled={saving}
                              />
                            </td>
                            <td>
                              <div className={styles.actionGroup}>
                                <button
                                  type="button"
                                  className={styles.actionButton}
                                  onClick={() => handleSaveEdit(service.id)}
                                  disabled={saving}
                                >
                                  Salveaza
                                </button>
                                <button
                                  type="button"
                                  className={styles.actionButton}
                                  onClick={cancelEdit}
                                  disabled={saving}
                                >
                                  Anuleaza
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{service.name}</td>
                            <td>{service.duration_minutes}</td>
                            <td>{formatPrice(service.price)}</td>
                            <td>
                              <div className={styles.actionGroup}>
                                <button
                                  type="button"
                                  className={styles.iconButton}
                                  onClick={() => startEdit(service)}
                                  disabled={saving}
                                  aria-label="Editeaza serviciu"
                                  title="Editeaza"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button
                                  type="button"
                                  className={styles.iconButton}
                                  onClick={() => {
                                    setConfirmDeleteId(service.id);
                                    setEditingId(null);
                                  }}
                                  disabled={saving}
                                  aria-label="Sterge serviciu"
                                  title="Sterge"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirmDeleteId !== null && (() => {
        const serviceToDelete = services.find((s) => s.id === confirmDeleteId);
        return (
          <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !isDeleting) {
                setConfirmDeleteId(null);
                setDeleteError(null);
              }
            }}
            onPointerDown={(e) => { deleteBackdropPressRef.current = e.target === e.currentTarget; }}
            onClick={(e) => {
              if (isDeleting) return;
              const endedOnBackdrop = e.target === e.currentTarget;
              if (deleteBackdropPressRef.current && endedOnBackdrop) {
                setConfirmDeleteId(null);
                setDeleteError(null);
              }
              deleteBackdropPressRef.current = false;
            }}
          >
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h3 id="delete-modal-title">Ștergere serviciu</h3>
              <p className={styles.modalBody}>
                Sigur vrei să ștergi serviciul <strong>{serviceToDelete?.name}</strong>?
              </p>
              {deleteError && <p className={styles.modalError}>{deleteError}</p>}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  autoFocus
                  onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                  disabled={isDeleting}
                >
                  Renunță
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  disabled={isDeleting}
                  onClick={() => handleDeleteService(confirmDeleteId)}
                >
                  {isDeleting ? 'Se șterge...' : 'Șterge'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
