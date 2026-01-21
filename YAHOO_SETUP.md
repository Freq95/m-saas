# Ghid Setup Yahoo Mail API

## Pași pentru a conecta Yahoo Mail

### 1. Activează "Less Secure Apps" sau creează App Password

**IMPORTANT:** Yahoo necesită un App Password pentru aplicații terțe (nu parola normală).

#### Opțiunea 1: App Password (RECOMANDAT - mai sigur)

1. Mergi la: https://login.yahoo.com/account/security
2. Loghează-te cu contul Yahoo
3. Scroll jos până la **"App passwords"** sau **"Generate app password"**
4. Click **"Generate app password"** sau **"Create app password"**
5. Alege un nume pentru aplicație (ex: "OpsGenie")
6. Click **"Generate"**
7. **Copiază parola generată** - vei vedea o parolă de 16 caractere (ex: `abcd-efgh-ijkl-mnop`)
8. **IMPORTANT:** Această parolă se afișează o singură dată! Salvează-o într-un loc sigur.

#### Opțiunea 2: Parola normală (NU RECOMANDAT - mai puțin sigur)

- Yahoo poate bloca conturile care folosesc parola normală
- Folosește doar pentru testare rapidă
- Pentru producție, folosește întotdeauna App Password

### 2. Configurează variabilele de mediu

1. Deschide fișierul `.env` în root-ul proiectului
2. Adaugă următoarele linii:

```env
YAHOO_EMAIL=your-email@yahoo.com
YAHOO_APP_PASSWORD=your-app-password-here
```

**Exemplu:**
```env
YAHOO_EMAIL=mybusiness@yahoo.com
YAHOO_APP_PASSWORD=abcd-efgh-ijkl-mnop
```

**Notă:** Dacă folosești parola normală (nu recomandat), folosește:
```env
YAHOO_EMAIL=your-email@yahoo.com
YAHOO_PASSWORD=your-normal-password
```

### 3. Testează conexiunea

1. Restart serverul: `npm run dev`
2. Testează conexiunea:
   ```bash
   curl http://localhost:3000/api/yahoo/sync
   ```
   Ar trebui să returneze: `{"connected": true, "email": "your-email@yahoo.com"}`

### 4. Sincronizează emailurile

#### Manual (prin API):
```bash
curl -X POST http://localhost:3000/api/yahoo/sync \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'
```

#### Automat (cron job):
Creează un script care rulează periodic (ex: la fiecare 5 minute):

```javascript
// scripts/sync-yahoo.js
const fetch = require('node-fetch');

async function syncYahoo() {
  try {
    const response = await fetch('http://localhost:3000/api/yahoo/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1 }),
    });
    const result = await response.json();
    console.log('Yahoo sync:', result);
  } catch (error) {
    console.error('Sync error:', error);
  }
}

syncYahoo();
```

Rulează cu cron:
```bash
# Sync la fiecare 5 minute
*/5 * * * * node /path/to/scripts/sync-yahoo.js
```

### 5. Trimite emailuri

```bash
curl -X POST http://localhost:3000/api/yahoo/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "client@example.com",
    "subject": "Răspuns la întrebarea ta",
    "text": "Mulțumim pentru mesaj!",
    "html": "<p>Mulțumim pentru mesaj!</p>"
  }'
```

## Troubleshooting

### Eroare: "Yahoo Mail not configured"
- Verifică că ai adăugat variabilele în `.env`
- Verifică că nu ai spații în jurul `=` în `.env`
- Restart serverul după modificări

### Eroare: "Invalid credentials" sau "Authentication failed"
- Verifică că folosești **App Password**, nu parola normală
- Verifică că email-ul este corect
- Încearcă să generezi un App Password nou

### Eroare: "Connection timeout"
- Verifică conexiunea la internet
- Verifică că firewall-ul permite conexiuni IMAP/SMTP
- Porturile necesare:
  - IMAP: 993 (SSL)
  - SMTP: 587 (TLS) sau 465 (SSL)

### Nu apar emailuri noi
- Verifică că ai emailuri necitite în inbox-ul Yahoo
- Verifică că sync-ul rulează (manual sau cron)
- Verifică consola serverului pentru erori

### Emailurile nu se trimit
- Verifică că folosești App Password
- Verifică că adresa destinatarului este validă
- Verifică că nu ai atins limitele Yahoo (ex: prea multe emailuri trimise)

## Configurare Yahoo Mail Servers

Aplicația folosește automat:
- **IMAP:** `imap.mail.yahoo.com:993` (SSL)
- **SMTP:** `smtp.mail.yahoo.com:587` (TLS)

Acestea sunt configurate în `lib/yahoo-mail.ts`.

## Limitări Yahoo

- **Rate limits:** Yahoo limitează numărul de request-uri
- **Storage:** Depinde de planul Yahoo
- **Security:** Yahoo poate bloca conturile suspecte - folosește App Password!

## Note importante

- **App Password** este mai sigur decât parola normală
- App Password expiră doar dacă o ștergi manual
- Pentru producție, folosește un cron job pentru sync automat
- Backup App Password într-un loc sigur (password manager)

## Resurse utile

- [Yahoo Account Security](https://login.yahoo.com/account/security)
- [Yahoo Mail Settings](https://mail.yahoo.com)
- [IMAP Configuration](https://help.yahoo.com/kb/SLN4075.html)

