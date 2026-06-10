'use client';

import { useMemo } from 'react';
import {
  FDI_DECIDUOUS,
  FDI_PERMANENT,
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
  /** Distribution is scoped to the active dentition, consistent with the chart above it. */
  dentition: Dentition;
}

export default function IssueDistributionChart({ toothStates, dentition }: Props) {
  // Percent = (teeth in THIS dentition with the issue) / (teeth in THIS
  // dentition). Computed client-side so the bars follow the Adult/Copil toggle
  // and use the correct denominator (32 permanent / 20 deciduous).
  const byType = useMemo(() => {
    const total = dentition === 'deciduous' ? FDI_DECIDUOUS.length : FDI_PERMANENT.length;
    const counts = new Map<IssueType, number>();
    for (const state of toothStates) {
      if (dentitionOf(state.tooth_fdi) !== dentition) continue;
      for (const issue of state.current_issues ?? []) {
        counts.set(issue.issue_type, (counts.get(issue.issue_type) || 0) + 1);
      }
    }
    const percentOf = (type: IssueType) =>
      Math.round(((counts.get(type) || 0) / total) * 1000) / 10;
    return new Map(ISSUE_TYPES.map((type) => [type, percentOf(type)]));
  }, [toothStates, dentition]);

  // Tallest bar = 100%; cap the scale at 25% so realistic numbers don't look flat.
  const maxPercent = Math.max(25, ...byType.values());

  return (
    <section className={styles.chartCard} aria-label="Distribuție diagnostice">
      <header className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>Distribuție diagnostice</h3>
      </header>
      <ul className={styles.chartBars}>
        {ISSUE_TYPES.map((type) => {
          const percent = byType.get(type) ?? 0;
          const heightPct = (percent / maxPercent) * 100;
          return (
            <li key={type} className={styles.chartBar}>
              <span className={styles.chartPercent}>{percent}%</span>
              <span
                className={styles.chartBarFill}
                style={{
                  height: `${Math.max(4, heightPct)}%`,
                  background: ISSUE_COLOR[type],
                  // Set color too so the inset `currentColor` shadow derives
                  // from the bar's own hue, not the inherited text color.
                  color: ISSUE_COLOR[type],
                }}
              />
              <span className={styles.chartBarLabel}>{ISSUE_LABEL_RO[type]}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
