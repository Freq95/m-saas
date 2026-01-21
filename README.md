# OpsGenie pentru Micro-Servicii - MVP V1

SaaS pentru gestionarea mesajelor, programărilor și automatizări pentru micro-servicii (saloane, cabinete, ateliere).

## Funcționalități V1 (Toate implementate ✅)

### 1. Inbox unificat (beta)
- ✅ Listă conversații cu thread view
- ✅ Integrare email (Gmail/Outlook) prin webhook
- ✅ Integrare Facebook Page messages prin webhook
- ✅ Integrare formular site prin webhook
- ✅ Tagging automat: "Lead nou", "Întrebare preț", "Reprogramare", "Anulare"

### 2. Calendar de programări
- ✅ Vizualizare săptămânală cu sloturi orare
- ✅ Tipuri de servicii cu durată și preț
- ✅ Blocare automată când se adaugă programare
- ✅ Export Google Calendar (când este configurat)

### 3. Agent de răspuns semi-automat
- ✅ Sugestii de răspuns AI în română, personalizate
- ✅ Propune 2-3 ore libere pe baza calendarului
- ✅ Utilizatorul trebuie să aprobe înainte de trimitere (semi-automat)

### 4. Reminder automat
- ✅ Trimite reminder 24h înainte de programare
- ✅ Suport SMS/WhatsApp și email
- ✅ Reduce no-show → argument bun la vânzare

### 5. Dashboard simplu
- ✅ Număr mesaje / zi (ultimele 7 zile)
- ✅ Număr programări / zi (ultimele 7 zile)
- ✅ Rată no-show estimată
- ✅ Venit estimat (bazat pe prețuri servicii)

## Setup

1. **Instalează dependențele:**
```bash
npm install
```

2. **Configurează variabilele de mediu:**
```bash
cp .env.example .env
# Editează .env cu valorile tale
```

3. **Inițializează storage-ul JSON:**
```bash
npm run db:migrate
```

Aceasta creează directorul `data/` cu fișierul `data.json` care conține tag-urile implicite.

4. **Seed date de test (opțional):**
```bash
npm run db:seed
```

5. **Rulează aplicația:**
```bash
npm run dev
```

Aplicația va rula pe http://localhost:3000

## Structură

- `/app` - Next.js App Router (frontend + API routes)
  - `/api` - API endpoints pentru toate funcționalitățile
  - `/dashboard` - Pagina dashboard
  - `/inbox` - Pagina inbox unificat
  - `/calendar` - Pagina calendar
- `/lib` - Utilități și configurații
  - `storage.ts` - Sistem de stocare JSON (înlocuiește PostgreSQL)
  - `db.ts` - Wrapper pentru compatibilitate
  - `ai-agent.ts` - Agent AI pentru răspunsuri
  - `calendar.ts` - Logică calendar și sloturi
  - `reminders.ts` - Sistem reminder automat
  - `google-calendar.ts` - Export Google Calendar
- `/scripts` - Scripturi pentru stocare
  - `migrate.js` - Inițializează structura JSON
  - `seed.js` - Seed date de test
- `/data` - Date stocate în JSON (creat automat)

## Scripturi Utile

```bash
# Populează aplicația cu date de test (30 conversații + programări)
npm run db:populate

# Testează webhook-urile cu mock data (10 POST pe fiecare endpoint)
npm run test:webhooks
```

## Documentație

- [SETUP.md](./SETUP.md) - Instrucțiuni setup complete
- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Ghid integrare Gmail/Facebook
- [API_COSTS.md](./API_COSTS.md) - Costuri API-uri (spoiler: majoritatea sunt GRATUITE)

