'use client';

import { useState } from 'react';
import { CATEGORY_COLOR_PALETTE } from '@/lib/calendar-color-policy';
import styles from './page.module.css';

export interface AppointmentCategory {
  id: number;
  user_id?: number;
  key: string;
  label: string;
  color: string;
  position: number;
}

export interface CategoryDentistOption {
  userId: number;
  name: string;
}

interface AppointmentCategoriesSectionProps {
  dentists: CategoryDentistOption[];
  initialSelectedDentistUserId: number | null;
  initialCategories: AppointmentCategory[];
  embedded?: boolean;
  role?: string;
}

interface CategoryFormState {
  label: string;
  color: string;
}

const emptyForm: CategoryFormState = {
  label: '',
  color: CATEGORY_COLOR_PALETTE[0].hex,
};

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function validateForm(form: CategoryFormState): string | null {
  const label = form.label.trim();
  if (!label) return 'Numele categoriei este obligatoriu.';
  if (label.length > 50) return 'Numele categoriei trebuie sa aiba maximum 50 de caractere.';
  if (!CATEGORY_COLOR_PALETTE.some((color) => color.hex === form.color)) {
    return 'Alege o culoare din paleta.';
  }
  return null;
}

function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (color: string) => void; disabled?: boolean }) {
  return (
    <div className={styles.categorySwatches} role="group" aria-label="Culoare categorie">
      {CATEGORY_COLOR_PALETTE.map((color) => {
        const selected = color.hex === value;
        return (
          <button
            key={color.id}
            type="button"
            className={`${styles.categorySwatch} ${selected ? styles.categorySwatchSelected : ''}`}
            style={{ background: color.hex }}
            onClick={() => onChange(color.hex)}
            disabled={disabled}
            aria-label={`${color.label}${selected ? ' selectata' : ''}`}
            aria-pressed={selected}
            title={color.label}
          />
        );
      })}
    </div>
  );
}

export function AppointmentCategoriesSection({
  dentists,
  initialSelectedDentistUserId,
  initialCategories,
  embedded = false,
  role,
}: AppointmentCategoriesSectionProps) {
  const [categories, setCategories] = useState<AppointmentCategory[]>(initialCategories);
  const [selectedDentistUserId, setSelectedDentistUserId] = useState<number | null>(initialSelectedDentistUserId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<CategoryFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CategoryFormState>(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dentists.length === 0 || !selectedDentistUserId) {
    return null;
  }

  const showDentistSelector = dentists.length > 1;

  async function loadCategories(dentistUserId: number) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/appointment-categories?dentistUserId=${dentistUserId}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Nu am putut incarca categoriile.');
      setCategories(Array.isArray(data?.categories) ? data.categories : []);
      setSelectedDentistUserId(dentistUserId);
      setShowAddForm(false);
      setEditingId(null);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut incarca categoriile.');
    } finally {
      setSaving(false);
    }
  }

  async function addCategory() {
    const validationError = validateForm(addForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/appointment-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: addForm.label.trim(),
          color: addForm.color,
          dentistUserId: selectedDentistUserId,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.category) {
        throw new Error(data?.error || 'Nu am putut adauga categoria.');
      }
      setCategories((prev) => [...prev, data.category]);
      setAddForm(emptyForm);
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut adauga categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(id: number) {
    const validationError = validateForm(editForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/appointment-categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editForm.label.trim(),
          color: editForm.color,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.category) {
        throw new Error(data?.error || 'Nu am putut salva categoria.');
      }
      setCategories((prev) => prev.map((category) => (category.id === id ? data.category : category)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: number) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/appointment-categories/${id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Nu am putut sterge categoria.');
      }
      setCategories((prev) => prev.filter((category) => category.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut sterge categoria.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(category: AppointmentCategory) {
    setEditingId(category.id);
    setConfirmDeleteId(null);
    setEditForm({ label: category.label, color: category.color });
    setError(null);
  }

  return (
    <section className={embedded ? styles.embeddedCategorySection : styles.section}>
      <div className={styles.categoryHeader}>
        <div>
          <h3 className={styles.sectionTitle}>Categorii programari</h3>
          <p className={styles.sectionCaption}>
            {role === 'asistent'
              ? 'Etichete colorate care apar pe programarile medicului selectat.'
              : 'Etichete colorate care apar pe programarile din calendarul tau personal.'}
          </p>
        </div>
        <button
          type="button"
          className={styles.categoryAddButton}
          onClick={() => {
            setShowAddForm((value) => !value);
            setEditingId(null);
            setConfirmDeleteId(null);
            setError(null);
          }}
          disabled={saving}
        >
          {showAddForm ? 'Anuleaza' : '+ Adauga categorie'}
        </button>
      </div>

      {showDentistSelector && (
        <label className={styles.categoryDentistSelector}>
          <span>Pentru care medic gestionezi?</span>
          <select
            value={selectedDentistUserId}
            onChange={(event) => loadCategories(Number(event.target.value))}
            disabled={saving}
          >
            {dentists.map((dentist) => (
              <option key={dentist.userId} value={dentist.userId}>
                {dentist.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {showAddForm && (
        <div className={styles.categoryForm}>
          <label className={styles.categoryField}>
            <span>Nume categorie</span>
            <input
              type="text"
              maxLength={50}
              value={addForm.label}
              onChange={(event) => setAddForm((prev) => ({ ...prev, label: event.target.value }))}
              disabled={saving}
            />
            <small>{addForm.label.trim().length}/50</small>
          </label>
          <ColorPicker
            value={addForm.color}
            onChange={(color) => setAddForm((prev) => ({ ...prev, color }))}
            disabled={saving}
          />
          <div className={styles.categoryFormActions}>
            <button type="button" className={styles.acceptBtn} onClick={() => setShowAddForm(false)} disabled={saving}>
              Anuleaza
            </button>
            <button type="button" className={styles.categorySaveButton} onClick={addCategory} disabled={saving}>
              Salveaza
            </button>
          </div>
        </div>
      )}

      {error && <p className={styles.categoryError}>{error}</p>}

      <div className={styles.categoryList}>
        {categories.map((category) => {
          const isEditing = editingId === category.id;
          const isConfirming = confirmDeleteId === category.id;

          return (
            <div key={category.id} className={styles.categoryRow}>
              {isEditing ? (
                <div className={styles.categoryEdit}>
                  <label className={styles.categoryField}>
                    <span>Nume categorie</span>
                    <input
                      type="text"
                      maxLength={50}
                      value={editForm.label}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, label: event.target.value }))}
                      disabled={saving}
                    />
                    <small>{editForm.label.trim().length}/50</small>
                  </label>
                  <ColorPicker
                    value={editForm.color}
                    onChange={(color) => setEditForm((prev) => ({ ...prev, color }))}
                    disabled={saving}
                  />
                  <div className={styles.categoryFormActions}>
                    <button type="button" className={styles.acceptBtn} onClick={() => setEditingId(null)} disabled={saving}>
                      Anuleaza
                    </button>
                    <button type="button" className={styles.categorySaveButton} onClick={() => saveCategory(category.id)} disabled={saving}>
                      Salveaza
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.categoryInfo}>
                    <span className={styles.categoryDotLarge} style={{ background: category.color }} />
                    <span>{category.label}</span>
                  </div>
                  {isConfirming ? (
                    <div className={styles.categoryConfirm}>
                      <span>Sterge {category.label}? Programarile existente isi pastreaza culoarea.</span>
                      <button type="button" className={styles.acceptBtn} onClick={() => setConfirmDeleteId(null)} disabled={saving}>
                        Nu
                      </button>
                      <button type="button" className={styles.categoryDeleteButton} onClick={() => deleteCategory(category.id)} disabled={saving}>
                        Da
                      </button>
                    </div>
                  ) : (
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => startEdit(category)}
                        disabled={saving}
                        aria-label={`Editeaza ${category.label}`}
                        title="Editeaza"
                      >
                        <IconEdit />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButtonDanger}
                        onClick={() => {
                          setConfirmDeleteId(category.id);
                          setEditingId(null);
                        }}
                        disabled={saving}
                        aria-label={`Sterge ${category.label}`}
                        title="Sterge"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {categories.length === 0 && (
          <div className={styles.categoryEmpty}>
            Nu exista categorii. Programarile se pot salva si fara categorie.
          </div>
        )}
      </div>
    </section>
  );
}
