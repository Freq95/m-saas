'use client';

import { useMemo } from 'react';
import {
  ISSUE_COLOR,
  ISSUE_LABEL_RO,
  ISSUE_TYPES,
  dentitionOf,
  type Dentition,
  type IssueType,
} from '@/lib/dental/constants';
import type { ToothStateDoc } from '@/lib/server/dental';
import styles from './DentalTab.module.css';

interface Props {
  toothStates: ToothStateDoc[];
  /** Scoped to the active dentition, consistent with the chart above it. */
  dentition: Dentition;
}

export default function IssueDistributionChart({ toothStates, dentition }: Props) {
  // Count = number of teeth in THIS dentition carrying each diagnosis. Bars are
  // drawn relative to the most common diagnosis, so widths reflect real counts.
  const { rows, max, total } = useMemo(() => {
    const counts = new Map<IssueType, number>();
    for (const state of toothStates) {
      if (dentitionOf(state.tooth_fdi) !== dentition) continue;
      for (const issue of state.current_issues ?? []) {
        counts.set(issue.issue_type, (counts.get(issue.issue_type) || 0) + 1);
      }
    }
    const rows = ISSUE_TYPES
      .map((type) => ({ type, count: counts.get(type) || 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
    const max = Math.max(1, ...rows.map((row) => row.count));
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return { rows, max, total };
  }, [toothStates, dentition]);

  return (
    <section className={styles.chartCard} aria-label="Distribuție diagnostice">
      <header className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>Distribuție diagnostice</h3>
        {total > 0 && (
          <span className={styles.chartTotal}>{total} {total === 1 ? 'dinte afectat' : 'dinți afectați'}</span>
        )}
      </header>
      {rows.length === 0 ? (
        <p className={styles.chartEmpty}>Niciun diagnostic înregistrat încă.</p>
      ) : (
        <ul className={styles.chartList}>
          {rows.map(({ type, count }) => (
            <li key={type} className={styles.chartRow}>
              <div className={styles.chartRowHead}>
                <span className={styles.chartRowLabel}>
                  <span className={styles.chartDot} style={{ background: ISSUE_COLOR[type] }} aria-hidden="true" />
                  {ISSUE_LABEL_RO[type]}
                </span>
                <span className={styles.chartCount}>{count}</span>
              </div>
              <span className={styles.chartTrack}>
                <span
                  className={styles.chartFill}
                  style={{ width: `${(count / max) * 100}%`, background: ISSUE_COLOR[type] }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
