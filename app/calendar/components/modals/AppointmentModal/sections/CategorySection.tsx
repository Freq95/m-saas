import styles from '../../../../page.module.css';
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  getCategoryColor,
  normalizeCategoryToKey,
} from '@/lib/calendar-color-policy';

interface CategorySectionProps {
  category: string;
  onChange: (category: string) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function CategorySection({ category, onChange, disabled, readOnly }: CategorySectionProps) {
  const selectedKey = normalizeCategoryToKey(category);

  if (readOnly) {
    if (!category) return null;
    const label = selectedKey ? CATEGORY_CONFIG[selectedKey].label : category;
    const color = getCategoryColor(category);
    return (
      <div className={styles.modalField}>
        <label>Categorie</label>
        <div className={styles.previewValue}>
          <span
            className={styles.categoryChip}
            style={{ ['--chip-color' as string]: color }}
          >
            <span className={styles.categoryDot} style={{ background: color }} />
            {label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modalField}>
      <label>Categorie</label>
      <div className={styles.categoryPicker} role="radiogroup" aria-label="Categorie programare">
        {CATEGORY_KEYS.map((key) => {
          const config = CATEGORY_CONFIG[key];
          const isActive = selectedKey === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`${styles.categoryChip} ${isActive ? styles.categoryChipActive : ''}`}
              style={{ ['--chip-color' as string]: config.color }}
              onClick={() => onChange(isActive ? '' : key)}
              disabled={disabled}
            >
              <span className={styles.categoryDot} style={{ background: config.color }} />
              {config.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
