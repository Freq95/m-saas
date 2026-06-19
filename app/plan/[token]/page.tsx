import type { Metadata } from 'next';
import { getPublicTreatmentPlanView } from '@/lib/server/treatment-plans';
import styles from './plan.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Share tokens must never be indexed.
export const metadata: Metadata = {
  title: 'Plan de tratament',
  robots: { index: false, follow: false, nocache: true },
};

function formatMoney(value: number, currency: string): string {
  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(value || 0)} ${currency}`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return value;
  }
}

export default async function PublicTreatmentPlanPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const view = await getPublicTreatmentPlanView(token);

  if (!view) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <div className={styles.invalidIcon} aria-hidden>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
          </div>
          <h1 className={styles.invalidTitle}>Link invalid sau expirat</h1>
          <p className={styles.invalidText}>
            Acest link nu mai este valabil. Contactați clinica pentru a primi un link nou.
          </p>
        </section>
      </main>
    );
  }

  const pdfUrl = `/api/treatment-plans/public/${encodeURIComponent(token)}`;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.brand}>
          {view.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.logoUrl} alt={view.clinicName} className={styles.logo} />
          ) : (
            <div className={styles.brandName}>{view.clinicName}</div>
          )}
        </header>

        <div className={styles.intro}>
          <span className={styles.eyebrow}>Plan de tratament</span>
          <h1 className={styles.title}>Pentru {view.patientFirstName}</h1>
          <p className={styles.meta}>
            {formatDate(view.planDate)}
            {view.doctorName ? ` · ${view.doctorName}` : ''}
          </p>
        </div>

        {view.recap.length > 0 && (
          <ul className={styles.recap}>
            {view.recap.map((line, i) => (
              <li key={i} className={styles.recapRow}>
                <span className={styles.recapLabel}>{line.label}</span>
                <span className={styles.recapAmount}>{formatMoney(line.amount, view.currency)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.totalRow}>
          <span>Total estimat</span>
          <strong>{formatMoney(view.total, view.currency)}</strong>
        </div>

        <a className={styles.cta} href={pdfUrl} target="_blank" rel="noopener noreferrer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          Deschide PDF-ul complet
        </a>

        {view.disclaimer && <p className={styles.disclaimer}>{view.disclaimer}</p>}

        <footer className={styles.footer}>
          <span>{view.clinicName}</span>
          <span>Link valabil până la {formatDate(view.expiresAt)}</span>
        </footer>
      </section>
    </main>
  );
}
