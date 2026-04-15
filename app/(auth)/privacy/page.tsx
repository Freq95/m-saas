import styles from './page.module.css';

export const metadata = {
  title: 'Politica de confidentialitate - densa',
};

export default function PrivacyPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1>Politica de confidentialitate</h1>
        <p className={styles.updated}>Ultima actualizare: Martie 2026</p>

        <section>
          <h2>1. Cine suntem</h2>
          <p>
            <span className="brand-wordmark-inline">densa</span> este o platforma SaaS de management pentru cabinete stomatologice,
            operata de [NUMELE COMPANIEI], cu sediul in Romania. In calitate de operator
            al platformei, prelucram date cu caracter personal in conformitate cu
            Regulamentul General privind Protectia Datelor (GDPR - Regulamentul UE 2016/679).
          </p>
        </section>

        <section>
          <h2>2. Ce date colectam</h2>
          <h3>De la utilizatorii platformei (personal cabinet)</h3>
          <ul>
            <li>Nume si prenume</li>
            <li>Adresa de email</li>
            <li>Numar de telefon (optional, pentru urgente)</li>
            <li>Parola (stocata criptat)</li>
          </ul>
          <h3>Date prelucrate in numele cabinetelor (date pacienti)</h3>
          <p>
            In calitate de <strong>imputernicit (processor)</strong>, prelucram datele
            pacientilor exclusiv conform instructiunilor cabinetelor stomatologice
            (operatori de date). Aceste date pot include: nume, telefon, CNP, programari,
            fisiere medicale si documente de consimtamant.
          </p>
        </section>

        <section>
          <h2>3. Temeiul juridic</h2>
          <ul>
            <li><strong>Pentru utilizatori platforma:</strong> Art. 6(1)(b) GDPR - executarea contractului de prestari servicii</li>
            <li><strong>Pentru date pacienti:</strong> Art. 28 GDPR - acord de prelucrare a datelor (DPA) intre noi si cabinet</li>
          </ul>
        </section>

        <section>
          <h2>4. Cum utilizam datele</h2>
          <ul>
            <li>Furnizarea si mentinerea serviciului platformei</li>
            <li>Autentificarea si securitatea conturilor</li>
            <li>Trimiterea de email-uri tranzactionale (invitatii, resetare parola)</li>
            <li>Monitorizarea performantei si rezolvarea problemelor tehnice</li>
          </ul>
        </section>

        <section>
          <h2>5. Partajarea datelor</h2>
          <p>Datele sunt partajate exclusiv cu urmatoarele categorii de sub-imputerniciti:</p>
          <ul>
            <li><strong>MongoDB Atlas</strong> (UE) - stocarea bazei de date</li>
            <li><strong>Cloudflare R2</strong> (UE) - stocarea fisierelor</li>
            <li><strong>Resend</strong> - email-uri tranzactionale</li>
            <li><strong>Upstash</strong> (UE) - cache si coada de joburi</li>
            <li><strong>Google Gmail API / Yahoo IMAP</strong> - sincronizare email (doar daca este activata de cabinet)</li>
          </ul>
          <p>Nu vindem si nu partajam date cu caracter personal in scopuri de marketing.</p>
        </section>

        <section>
          <h2>6. Durata stocarii</h2>
          <p>
            Datele utilizatorilor sunt stocate pe durata contractului si 30 de zile
            dupa stergerea contului. Datele pacientilor sunt stocate conform instructiunilor
            cabinetului si pot fi sterse definitiv la cerere prin functia de stergere GDPR.
          </p>
        </section>

        <section>
          <h2>7. Drepturile dumneavoastra</h2>
          <p>Conform GDPR, aveti dreptul la:</p>
          <ul>
            <li><strong>Acces</strong> - sa solicitati o copie a datelor dumneavoastra</li>
            <li><strong>Rectificare</strong> - sa corectati datele inexacte</li>
            <li><strong>Stergere</strong> - sa solicitati stergerea datelor</li>
            <li><strong>Portabilitate</strong> - sa primiti datele intr-un format structurat</li>
            <li><strong>Opozitie</strong> - sa va opuneti prelucrarii in anumite situatii</li>
            <li><strong>Retragerea consimtamantului</strong> - in orice moment, fara a afecta legalitatea prelucrarii anterioare</li>
          </ul>
          <p>
            Pentru exercitarea acestor drepturi, contactati-ne la: <strong>[EMAIL CONTACT]</strong>
          </p>
        </section>

        <section>
          <h2>8. Securitate</h2>
          <p>
            Implementam masuri tehnice si organizatorice pentru protectia datelor:
            criptare, controlul accesului, jurnalizare, invalidarea sesiunilor,
            si notificari in caz de incident de securitate.
          </p>
        </section>

        <section>
          <h2>9. Contact</h2>
          <p>
            Pentru intrebari privind prelucrarea datelor personale, ne puteti contacta la:
          </p>
          <ul>
            <li>Email: <strong>[EMAIL CONTACT]</strong></li>
            <li>Adresa: <strong>[ADRESA COMPANIE]</strong></li>
          </ul>
          <p>
            Aveti dreptul de a depune o plangere la Autoritatea Nationala de
            Supraveghere a Prelucrarii Datelor cu Caracter Personal (ANSPDCP) -
            <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer">www.dataprotection.ro</a>
          </p>
        </section>
      </div>
    </div>
  );
}
