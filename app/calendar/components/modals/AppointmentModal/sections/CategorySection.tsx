import { memo, useEffect } from 'react';
import styles from '../../../../page.module.css';
import { getCategoryColor, normalizeCategoryToKey, CATEGORY_CONFIG } from '@/lib/calendar-color-policy';
import {
  useAppointmentCategories,
  type AppointmentCategoryOption,
} from '@/app/calendar/hooks/useAppointmentCategories';

interface CategorySectionProps {
  isOpen: boolean;
  calendarId?: number | null;
  dentistUserId?: number | null;
  category: string;
  categoryId: number | null;
  categoryLabel?: string | null;
  categoryColor?: string | null;
  onChange: (category: string, categoryId: number | null) => void;
  autoSelectFirst?: boolean;
  disabled: boolean;
  readOnly: boolean;
}

function legacyCategoryPreview(category: string, categoryLabel?: string | null, categoryColor?: string | null) {
  const selectedKey = normalizeCategoryToKey(category);
  return {
    label: categoryLabel || (selectedKey ? CATEGORY_CONFIG[selectedKey]?.label : null) || category,
    color: categoryColor || getCategoryColor(category),
  };
}

function isCategoryActive(option: AppointmentCategoryOption, category: string, categoryId: number | null): boolean {
  if (categoryId !== null) return option.id === categoryId;
  return option.key === category;
}

function CategorySectionBase({
  isOpen,
  calendarId,
  dentistUserId,
  category,
  categoryId,
  categoryLabel,
  categoryColor,
  onChange,
  autoSelectFirst = false,
  disabled,
  readOnly,
}: CategorySectionProps) {
  const { categories, loading, error } = useAppointmentCategories({
    isOpen: isOpen && !readOnly,
    calendarId,
    dentistUserId,
  });

  useEffect(() => {
    if (!autoSelectFirst || readOnly || disabled) return;
    if (category || categoryId !== null || categories.length === 0) return;
    const first = categories[0];
    onChange(first.key, first.id);
  }, [autoSelectFirst, categories, category, categoryId, disabled, onChange, readOnly]);

  if (readOnly) {
    if (!category && !categoryLabel) return null;
    const preview = legacyCategoryPreview(category, categoryLabel, categoryColor);
    return (
      <div className={styles.modalField}>
        <label>Categorie</label>
        <div className={styles.previewValue}>
          <span
            className={styles.categoryChip}
            style={{ ['--chip-color' as string]: preview.color }}
          >
            <span className={styles.categoryDot} style={{ background: preview.color }} />
            {preview.label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modalField}>
      <label>Categorie</label>
      {loading ? (
        <p className={styles.fieldHint}>Se încarcă categoriile...</p>
      ) : error ? (
        <p className={styles.fieldHint}>{error}</p>
      ) : categories.length === 0 ? (
        <p className={styles.fieldHint}>
          Acest medic nu are categorii definite. Configurează-le în Setări - Calendare.
        </p>
      ) : (
        <div className={styles.categoryPicker} role="radiogroup" aria-label="Categorie programare">
          {categories.map((option) => {
            const isActive = isCategoryActive(option, category, categoryId);
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`${styles.categoryChip} ${isActive ? styles.categoryChipActive : ''}`}
                style={{ ['--chip-color' as string]: option.color }}
                onClick={() => {
                  if (isActive && autoSelectFirst) return;
                  onChange(isActive ? '' : option.key, isActive ? null : option.id);
                }}
                disabled={disabled}
              >
                <span className={styles.categoryDot} style={{ background: option.color }} />
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const CategorySection = memo(CategorySectionBase);
