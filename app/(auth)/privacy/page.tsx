import styles from './page.module.css';

export const metadata = {
  title: 'Politica de confidențialitate - densa',
};

export default function PrivacyPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1>Politica de confidențialitate</h1>
        <p className={styles.updated}>Ultima actualizare: Martie 2026</p>

        <section>
          <h2>1. Cine suntem</h2>
          <p>
            <span className="brand-wordmark-inline">densa</span> este o platformă SaaS de management pentru cabinete stomatologice,
            operată de [NUMELE COMPANIEI], cu sediul în România. În calitate de operator
            al platformei, prelucrăm date cu caracter personal în conformitate cu
            Regulamentul General privind Protecția Datelor (GDPR - Regulamentul UE 2016/679).
          </p>
        </section>

        <section>
          <h2>2. Ce date colectăm</h2>
          <h3>De la utilizatorii platformei (personal cabinet)</h3>
          <ul>
            <li>Nume și prenume</li>
            <li>Adresă de email</li>
            <li>Număr de telefon (opțional, pentru urgențe)</li>
            <li>Parola (stocată criptat)</li>
          </ul>
          <h3>Date prelucrate în numele cabinetelor (date pacienți)</h3>
          <p>
            În calitate de <strong>împuternicit (processor)</strong>, prelucrăm datele
            pacienților exclusiv conform instrucțiunilor cabinetelor stomatologice
            (operatori de date). Aceste date pot include: nume, telefon, CNP, programări,
            fișiere medicale și documente de consimțământ.
          </p>
        </section>

        <section>
          <h2>3. Temeiul juridic</h2>
          <ul>
            <li><strong>Pentru utilizatorii platformei:</strong> Art. 6(1)(b) GDPR - executarea contractului de prestări servicii</li>
            <li><strong>Pentru date pacienți:</strong> Art. 28 GDPR - acord de prelucrare a datelor (DPA) între noi și cabinet</li>
          </ul>
        </section>

        <section>
          <h2>4. Cum utilizăm datele</h2>
          <ul>
            <li>Furnizarea și menținerea serviciului platformei</li>
            <li>Autentificarea și securitatea conturilor</li>
            <li>Trimiterea de email-uri tranzacționale (invitații, resetarea parolei)</li>
            <li>Monitorizarea performanței și rezolvarea problemelor tehnice</li>
          </ul>
        </section>

        <section>
          <h2>5. Partajarea datelor</h2>
          <p>Datele sunt partajate exclusiv cu următoarele categorii de sub-împuterniciți:</p>
          <ul>
            <li><strong>MongoDB Atlas</strong> (UE) - stocarea bazei de date</li>
            <li><strong>Cloudflare R2</strong> (UE) - stocarea fișierelor</li>
            <li><strong>Resend</strong> - email-uri tranzacționale</li>
            <li><strong>Upstash</strong> (UE) - cache și coada de joburi</li>
            <li><strong>Google Gmail API / Yahoo IMAP</strong> - sincronizare email (doar dacă este activată de cabinet)</li>
          </ul>
          <p>Nu vindem și nu partajăm date cu caracter personal în scopuri de marketing.</p>
        </section>

        <section>
          <h2>6. Durata stocării</h2>
          <p>
            Datele utilizatorilor sunt stocate pe durata contractului și 30 de zile
            după ștergerea contului. Datele pacienților sunt stocate conform instrucțiunilor
            cabinetului și pot fi șterse definitiv la cerere prin funcția de ștergere GDPR.
          </p>
        </section>

        <section>
          <h2>7. Drepturile dumneavoastră</h2>
          <p>Conform GDPR, aveți dreptul la:</p>
          <ul>
            <li><strong>Acces</strong> - să solicitați o copie a datelor dumneavoastră</li>
            <li><strong>Rectificare</strong> - să corectați datele inexacte</li>
            <li><strong>Stergere</strong> - să solicitați ștergerea datelor</li>
            <li><strong>Portabilitate</strong> - să primiți datele într-un format structurat</li>
            <li><strong>Opoziție</strong> - să vă opuneți prelucrării în anumite situații</li>
            <li><strong>Retragerea consimțământului</strong> - în orice moment, fără a afecta legalitatea prelucrării anterioare</li>
          </ul>
          <p>
            Pentru exercitarea acestor drepturi, contactați-ne la: <strong>[EMAIL CONTACT]</strong>
          </p>
        </section>

        <section>
          <h2>8. Securitate</h2>
          <p>
            Implementăm măsuri tehnice și organizatorice pentru protecția datelor:
            criptare, controlul accesului, jurnalizare, invalidarea sesiunilor,
            și notificări în caz de incident de securitate.
          </p>
        </section>

        <section>
          <h2>9. Contact</h2>
          <p>
            Pentru întrebări privind prelucrarea datelor personale, ne puteți contacta la:
          </p>
          <ul>
            <li>Email: <strong>[EMAIL CONTACT]</strong></li>
            <li>Adresă: <strong>[ADRESA COMPANIE]</strong></li>
          </ul>
          <p>
            Aveți dreptul de a depune o plângere la Autoritatea Națională de
            Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP) -
            <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer">www.dataprotection.ro</a>
          </p>
        </section>
      </div>
    </div>
  );
}
