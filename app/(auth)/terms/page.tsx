import styles from '../privacy/page.module.css';
import Link from 'next/link';

export const metadata = {
  title: 'Termeni și condiții - densa',
};

export default function TermsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1>Termeni și condiții</h1>
        <p className={styles.updated}>Ultima actualizare: Martie 2026</p>

        <section>
          <h2>1. Descrierea serviciului</h2>
          <p>
            <span className="brand-wordmark-inline">densa</span> este o platformă SaaS de management pentru cabinete stomatologice
            care oferă: programarea pacienților, gestionarea pacienților, sincronizarea
            email-urilor și instrumente de comunicare. Serviciul este furnizat de
            [NUMELE COMPANIEI], înregistrată în România.
          </p>
        </section>

        <section>
          <h2>2. Contul de utilizator</h2>
          <ul>
            <li>Fiecare cabinet primește un cont principal (proprietar) și poate invita personal suplimentar.</li>
            <li>Sunteți responsabil pentru securitatea credențialelor contului.</li>
            <li>Un cont poate fi suspendat pentru încălcarea termenilor sau la cerere.</li>
          </ul>
        </section>

        <section>
          <h2>3. Obligațiile cabinetului</h2>
          <p>În calitate de operator de date (controller GDPR), cabinetul este responsabil pentru:</p>
          <ul>
            <li>Obținerea consimțământului pacienților pentru prelucrarea datelor personale</li>
            <li>Informarea pacienților despre drepturile lor GDPR</li>
            <li>Răspunsul la cererile pacienților privind datele personale (acces, ștergere, portabilitate)</li>
            <li>Asigurarea că datele introduse în platformă sunt corecte și actualizate</li>
          </ul>
        </section>

        <section>
          <h2>4. Obligațiile noastre</h2>
          <p>În calitate de împuternicit (processor GDPR), ne angajăm să:</p>
          <ul>
            <li>Prelucrăm datele exclusiv conform instrucțiunilor cabinetului</li>
            <li>Asigurăm securitatea tehnică a platformei</li>
            <li>Notificăm cabinetul în cazul unui incident de securitate în maximum 24 de ore</li>
            <li>Oferim instrumente pentru exportul și ștergerea datelor pacienților</li>
            <li>Nu accesăm datele pacienților decât în scopuri tehnice de mentenanță</li>
          </ul>
        </section>

        <section>
          <h2>5. Protecția datelor</h2>
          <p>
            Prelucrarea datelor personale se face în conformitate cu GDPR.
            Detalii complete în <Link href="/privacy">Politica de confidențialitate</Link>.
          </p>
          <p>
            Un Acord de Prelucrare a Datelor (DPA) va fi semnat între noi și
            fiecare cabinet înainte de activarea contului.
          </p>
        </section>

        <section>
          <h2>6. Disponibilitatea serviciului</h2>
          <p>
            Ne străduim să menținem serviciul disponibil 99.9% din timp.
            Mentenanța planificată va fi anunțată în avans. Nu răspundem pentru
            întreruperi cauzate de terți (furnizori de hosting, internet).
          </p>
        </section>

        <section>
          <h2>7. Încetarea contractului</h2>
          <ul>
            <li>Cabinetul poate solicita încetarea contului în orice moment.</li>
            <li>La încetare, datele vor fi păstrate 30 de zile, după care vor fi șterse definitiv.</li>
            <li>Cabinetul poate solicita un export complet al datelor înainte de ștergere.</li>
          </ul>
        </section>

        <section>
          <h2>8. Contact</h2>
          <p>
            Pentru întrebări despre acești termeni, contactați-ne la: <strong>[EMAIL CONTACT]</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
