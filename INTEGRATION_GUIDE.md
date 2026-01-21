# Ghid Integrare și Răspunsuri la Întrebări

## 1. Cum aduci inboxul de email Gmail/Yahoo și mesajele Facebook în platformă?

### Status actual:
- ✅ Webhook endpoints există: `/api/webhooks/email` și `/api/webhooks/facebook`
- ❌ Nu sunt conectate la API-urile reale (Gmail/Facebook)

### Pentru Gmail/Yahoo:

**Opțiunea 1: Gmail API cu Push Notifications**
1. Creează un proiect în Google Cloud Console
2. Activează Gmail API
3. Configurează OAuth 2.0
4. Folosește Gmail API pentru a citi mesajele
5. Trimite la webhook: `POST /api/webhooks/email` cu:
```json
{
  "userId": 1,
  "from": "client@example.com",
  "to": "your@email.com",
  "subject": "Subiect",
  "text": "Conținut mesaj"
}
```

**Opțiunea 2: Email forwarding + parsing**
- Configurează email forwarding către un serviciu care parsează și trimite la webhook
- Sau folosește un serviciu ca Zapier/Make.com pentru a conecta Gmail → webhook

**Opțiunea 3: IMAP polling (simplu pentru testare)**
- Creează un script care verifică periodic inboxul prin IMAP
- Trimite mesajele noi la webhook

### Pentru Facebook:

1. Mergi la [Meta for Developers](https://developers.facebook.com/)
2. Creează o aplicație
3. Adaugă "Messenger" product
4. Configurează Webhooks pentru Page Messages
5. URL webhook: `https://your-domain.com/api/webhooks/facebook`
6. Facebook va trimite automat mesajele la acest endpoint

**Testare manuală:**
```bash
curl -X POST http://localhost:3000/api/webhooks/facebook \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "senderId": "123456",
    "senderName": "Ion Popescu",
    "message": "Bună! Aveți loc mâine?"
  }'
```

---

## 2. Când apeși "Salvează programare" nu se întâmplă nimic

### Status:
- ✅ Slot blocking este implementat în `lib/calendar.ts` (funcția `isSlotAvailable`)
- ✅ Appointments API este complet dezvoltat
- ✅ Calendar UI este integrat
- ⚠️ **PROBLEMĂ REZOLVATĂ**: Slot-ul folosea durata fixă de 1 oră în loc de durata serviciului

### Ce am rezolvat:
- Slot-ul acum folosește durata serviciului selectat
- Adăugat mesaje de eroare dacă salvare eșuează
- Verificare disponibilitate slot înainte de salvare

### Cum funcționează:
1. Click pe un slot în calendar → deschide modal
2. Selectează serviciul (durata se calculează automat)
3. Completează datele clientului
4. Click "Salvează" → verifică disponibilitate → creează programare → blochează slot-ul

### Testare:
1. Rulează `npm run db:seed` pentru a avea servicii de test
2. Mergi la `/calendar`
3. Click pe un slot
4. Completează formularul și salvează

---

## 3. Unde găsești AI Agent? E dezvoltat și integrat?

### Status:
- ✅ **DA, este dezvoltat și integrat!**

### Unde îl găsești:
1. Mergi la pagina **Inbox** (`/inbox`)
2. Selectează o conversație
3. **AI Agent apare automat** sub mesaje ca "Răspuns sugerat de AI"
4. Apasă butonul **"Folosește"** pentru a copia răspunsul sugerat

### Cum funcționează:
- Citește ultimul mesaj inbound din conversație
- Generează răspuns personalizat în română
- Propune 2-3 ore libere din calendar
- Utilizatorul aprobă înainte de trimitere (semi-automat)

### Endpoint API:
`GET /api/conversations/[id]/suggest-response?userId=1`

### Configurare necesară:
- Adaugă `OPENAI_API_KEY` în `.env`
- Fără API key, funcționalitatea nu va funcționa

---

## 4. (Fără întrebări)

---

## 5. Toate metricile sunt 0. Cum sunt măsurate?

### Status:
- ✅ Metricile sunt **complet implementate** și funcționează
- ⚠️ Sunt 0 pentru că **nu există date în sistem**

### Cum sunt măsurate:

**1. Mesaje / zi:**
- Numără mesajele din tabelul `messages` grupate pe zi
- Query: `SELECT DATE(sent_at), COUNT(*) FROM messages GROUP BY DATE(sent_at)`

**2. Programări / zi:**
- Numără programările din tabelul `appointments` grupate pe zi
- Query: `SELECT DATE(start_time), COUNT(*) FROM appointments GROUP BY DATE(start_time)`

**3. Rată no-show:**
- Calculează: `(programări cu status='no_show' / total programări) * 100`
- Se bazează pe status-ul programărilor

**4. Venit estimat:**
- Sumă prețurile serviciilor pentru programările `scheduled` sau `completed`
- Query: `SUM(service.price) WHERE appointment.status IN ('scheduled', 'completed')`

### Cum să ai date pentru testare:

**Opțiunea 1: Seed date**
```bash
npm run db:seed
```
Aceasta adaugă:
- 1 utilizator de test
- 4 servicii (Tuns, Vopsit, Manichiură, Pedicură)
- 1 conversație cu 2 mesaje

**Opțiunea 2: Creează manual date**
1. Mergi la `/inbox` → creează conversații noi
2. Mergi la `/calendar` → creează programări
3. Dashboard-ul se va actualiza automat

**Opțiunea 3: Testează webhook-urile**
```bash
# Adaugă mesaje
curl -X POST http://localhost:3000/api/webhooks/email \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "from": "test@example.com",
    "to": "you@example.com",
    "subject": "Test",
    "text": "Mesaj de test"
  }'
```

### Verificare:
- După ce adaugi date, refresh dashboard-ul
- Metricile ar trebui să se actualizeze automat
- Datele sunt stocate în `data/data.json`

---

## Rezumat Status Implementare

| Feature | Status | Note |
|---------|--------|------|
| Inbox UI | ✅ Complet | Listă conversații + thread view |
| Email Webhook | ✅ Endpoint gata | Necesită integrare Gmail API |
| Facebook Webhook | ✅ Endpoint gata | Necesită config Facebook |
| Calendar UI | ✅ Complet | Vizualizare săptămânală |
| Slot Blocking | ✅ Funcțional | Verificare automată disponibilitate |
| Appointments CRUD | ✅ Complet | Create, read, update, delete |
| AI Agent | ✅ Integrat | Apare în inbox, necesită OpenAI API key |
| Reminders | ✅ Logică gata | Necesită cron job + SMS/email config |
| Dashboard Metrics | ✅ Funcțional | Măsurări corecte, necesită date |

---

## Pași Următori Recomandați

1. **Configurează OpenAI API key** pentru AI Agent
2. **Rulează `npm run db:seed`** pentru date de test
3. **Testează webhook-urile manual** pentru a adăuga conversații
4. **Creează programări** în calendar pentru a vedea metricile
5. **Configurează integrarea Gmail/Facebook** când ești gata pentru producție

