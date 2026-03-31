import styles from '../privacy/page.module.css';
import Link from 'next/link';

export const metadata = {
  title: 'Termeni si conditii - densa',
};

export default function TermsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1>Termeni si conditii</h1>
        <p className={styles.updated}>Ultima actualizare: Martie 2026</p>

        <section>
          <h2>1. Descrierea serviciului</h2>
          <p>
            densa este o platforma SaaS de management pentru cabinete stomatologice
            care ofera: programarea pacientilor, gestionarea clientilor, sincronizarea
            email-urilor si instrumente de comunicare. Serviciul este furnizat de
            [NUMELE COMPANIEI], inregistrata in Romania.
          </p>
        </section>

        <section>
          <h2>2. Contul de utilizator</h2>
          <ul>
            <li>Fiecare cabinet primeste un cont principal (proprietar) si poate invita personal suplimentar.</li>
            <li>Sunteti responsabil pentru securitatea credentialelor contului.</li>
            <li>Un cont poate fi suspendat pentru incalcarea termenilor sau la cerere.</li>
          </ul>
        </section>

        <section>
          <h2>3. Obligatiile cabinetului</h2>
          <p>In calitate de operator de date (controller GDPR), cabinetul este responsabil pentru:</p>
          <ul>
            <li>Obtinerea consimtamantului pacientilor pentru prelucrarea datelor personale</li>
            <li>Informarea pacientilor despre drepturile lor GDPR</li>
            <li>Raspunsul la cererile pacientilor privind datele personale (acces, stergere, portabilitate)</li>
            <li>Asigurarea ca datele introduse in platforma sunt corecte si actualizate</li>
          </ul>
        </section>

        <section>
          <h2>4. Obligatiile noastre</h2>
          <p>In calitate de imputernicit (processor GDPR), ne angajam sa:</p>
          <ul>
            <li>Prelucram datele exclusiv conform instructiunilor cabinetului</li>
            <li>Asiguram securitatea tehnica a platformei</li>
            <li>Notificam cabinetul in cazul unui incident de securitate in maximum 24 de ore</li>
            <li>Oferim instrumente pentru exportul si stergerea datelor pacientilor</li>
            <li>Nu accesam datele pacientilor decat in scopuri tehnice de mentenanta</li>
          </ul>
        </section>

        <section>
          <h2>5. Protectia datelor</h2>
          <p>
            Prelucrarea datelor personale se face in conformitate cu GDPR.
            Detalii complete in <Link href="/privacy">Politica de confidentialitate</Link>.
          </p>
          <p>
            Un Acord de Prelucrare a Datelor (DPA) va fi semnat intre noi si
            fiecare cabinet inainte de activarea contului.
          </p>
        </section>

        <section>
          <h2>6. Disponibilitatea serviciului</h2>
          <p>
            Ne straduim sa mentinam serviciul disponibil 99.9% din timp.
            Mentenanta planificata va fi anuntata in avans. Nu raspundem pentru
            intreruperi cauzate de terti (furnizori de hosting, internet).
          </p>
        </section>

        <section>
          <h2>7. Incetarea contractului</h2>
          <ul>
            <li>Cabinetul poate solicita incetarea contului in orice moment.</li>
            <li>La incetare, datele vor fi pastrate 30 de zile, dupa care vor fi sterse definitiv.</li>
            <li>Cabinetul poate solicita un export complet al datelor inainte de stergere.</li>
          </ul>
        </section>

        <section>
          <h2>8. Contact</h2>
          <p>
            Pentru intrebari despre acesti termeni, contactati-ne la: <strong>[EMAIL CONTACT]</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
