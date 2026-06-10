'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { authFetcher } from '@/lib/fetcher';
import Odontogram from '../Odontogram';
import {
  DENTITION_LABEL_RO,
  ISSUE_COLOR,
  ISSUE_LABEL_RO,
  STATUS_LABEL_RO,
  dentitionOf,
  isUpper,
  surfaceLabel,
  type Dentition,
  type Surface,
} from '@/lib/dental/constants';
import type { DentalData } from '@/lib/server/dental';
import styles from './raport.module.css';

interface Props {
  clientId: string;
  clientName: string;
  clinicianName: string;
}

type DentalResponse = { dental: DentalData };

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function RaportClient({ clientId, clientName, clinicianName }: Props) {
  const { data, isLoading, error } = useSWR<DentalResponse>(
    `/api/clients/${clientId}/dental`,
    authFetcher
  );
  const [dentition, setDentition] = useState<Dentition>('permanent');

  const printedAt = new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  const dental = data?.dental;

  // Scope the table to the dentition shown on the chart above it.
  const affected = (dental?.tooth_states ?? [])
    .filter(
      (s) =>
        (s.current_issues.length > 0 || s.status !== 'present') &&
        dentitionOf(s.tooth_fdi) === dentition
    )
    .sort((a, b) => a.tooth_fdi - b.tooth_fdi);

  return (
    <div className={styles.screen}>
      {/* Print isolation: hide all app chrome, show only the report sheet.
          Injected globally because CSS modules can't target bare `body`. */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          [data-raport-sheet], [data-raport-sheet] * { visibility: visible !important; }
        }
      `}</style>

      {/* Screen-only toolbar — hidden in print */}
      <div className={styles.toolbar}>
        <Link href={`/clients/${clientId}`} className={styles.backBtn} prefetch>
          ← Înapoi la pacient
        </Link>
        <div className={styles.toolbarRight}>
          <div className={styles.dentitionToggle} role="tablist" aria-label="Tip dentiție">
            {(['permanent', 'deciduous'] as Dentition[]).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={dentition === d}
                className={`${styles.dentBtn} ${dentition === d ? styles.dentBtnActive : ''}`}
                onClick={() => setDentition(d)}
              >
                {DENTITION_LABEL_RO[d]}
              </button>
            ))}
          </div>
          <button type="button" className={styles.printBtn} onClick={() => window.print()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Tipărește / Salvează PDF
          </button>
        </div>
      </div>

      {/* The A4 sheet */}
      <article className={styles.sheet} data-raport-sheet>
        <header className={styles.docHeader}>
          <div>
            <p className={styles.eyebrow}>Fișă clinică · Schema dentară</p>
            <h1 className={styles.docTitle}>{clientName}</h1>
          </div>
          <dl className={styles.docMeta}>
            <div><dt>Data</dt><dd>{printedAt}</dd></div>
            <div><dt>Medic</dt><dd>{clinicianName}</dd></div>
            <div><dt>Dentiție</dt><dd>{DENTITION_LABEL_RO[dentition]}</dd></div>
          </dl>
        </header>

        {isLoading && <p className={styles.muted}>Se încarcă…</p>}
        {error && <p className={styles.muted}>Nu s-au putut încărca datele.</p>}

        {dental && (
          <>
            <section className={styles.chartSection}>
              <div className={styles.chartFrame}>
                <Odontogram
                  toothStates={dental.tooth_states}
                  selectedFdi={null}
                  onSelectTooth={() => {}}
                  surgeryGroups={dental.surgery_groups}
                  bridgeGroups={dental.bridge_groups}
                  dentition={dentition}
                  showMiniArch={false}
                />
              </div>
            </section>

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Dinți cu intervenții</h2>
              {affected.length === 0 ? (
                <p className={styles.muted}>Niciun dinte cu intervenții înregistrate.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Dinte</th>
                      <th>Arcadă</th>
                      <th>Stare</th>
                      <th>Diagnostice</th>
                      <th>Ultima modificare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affected.map((s) => (
                      <tr key={s.tooth_fdi}>
                        <td className={styles.fdiCell}>{s.tooth_fdi}</td>
                        <td>{isUpper(s.tooth_fdi) ? 'Maxilar' : 'Mandibulă'}</td>
                        <td>{STATUS_LABEL_RO[s.status]}</td>
                        <td>
                          {s.current_issues.length === 0 ? (
                            <span className={styles.muted}>—</span>
                          ) : (
                            <ul className={styles.issueCellList}>
                              {s.current_issues.map((iss) => (
                                <li key={iss.issue_type}>
                                  <span className={styles.swatch} style={{ background: ISSUE_COLOR[iss.issue_type] }} />
                                  {ISSUE_LABEL_RO[iss.issue_type]}
                                  <span className={styles.surfaceNote}>
                                    {iss.surfaces.length === 0
                                      ? ' · întreg dintele'
                                      : ` · ${iss.surfaces.map((x: Surface) => surfaceLabel(x, s.tooth_fdi)).join(', ')}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td>{fmtDate(s.last_manipulation_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {dental.surgery_groups.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Intervenții chirurgicale</h2>
                <ul className={styles.groupList}>
                  {dental.surgery_groups.map((g) => (
                    <li key={g.id}>
                      <span className={styles.groupTeeth}>{g.tooth_fdis.join(', ')}</span>
                      <span className={styles.groupComment}>{g.comment || '—'}</span>
                      <span className={styles.groupMeta}>{g.doctor_name_snapshot} · {fmtDate(g.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {dental.bridge_groups.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Punți</h2>
                <ul className={styles.groupList}>
                  {dental.bridge_groups.map((g) => (
                    <li key={g.id}>
                      <span className={styles.groupTeeth}>{g.tooth_fdis.join(', ')}</span>
                      <span className={styles.groupComment}>{g.comment || '—'}</span>
                      <span className={styles.groupMeta}>{g.doctor_name_snapshot} · {fmtDate(g.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className={styles.legendRow}>
              {Object.entries(ISSUE_LABEL_RO).map(([key, label]) => (
                <span key={key} className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: ISSUE_COLOR[key as keyof typeof ISSUE_COLOR] }} />
                  {label}
                </span>
              ))}
            </section>

            <footer className={styles.signatures}>
              <div className={styles.sigBlock}>
                <span className={styles.sigLine} />
                <span className={styles.sigLabel}>Semnătură medic — {clinicianName}</span>
              </div>
              <div className={styles.sigBlock}>
                <span className={styles.sigLine} />
                <span className={styles.sigLabel}>Semnătură pacient</span>
              </div>
            </footer>

            <p className={styles.disclaimer}>
              Document generat electronic din densa la {printedAt}. Schema reflectă starea înregistrată
              la momentul generării și are caracter informativ.
            </p>
          </>
        )}
      </article>
    </div>
  );
}
