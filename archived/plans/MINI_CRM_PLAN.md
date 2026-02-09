# Mini-CRM Clienți - Plan de Implementare

## 📊 Analiza Situației Actuale

### Date Existente în Sistem

#### 1. **Conversations Table**
- `contact_name`, `contact_email`, `contact_phone`
- `channel` (email, facebook, form)
- `subject`, `status`
- `created_at`, `updated_at`

#### 2. **Appointments Table**
- `client_name`, `client_email`, `client_phone`
- `service_id` (legat la services)
- `start_time`, `end_time`
- `status` (scheduled, completed, cancelled, no-show)
- `notes`

#### 3. **Services Table**
- `name`, `duration_minutes`, `price`
- `description`

### Ce Lipsește pentru Mini-CRM

1. **Tabelă dedicată pentru Clienți** (clients)
   - Unificarea datelor din conversations și appointments
   - Identificare unică a clientului (după email/phone)
   - Metadata client (source, tags, notes)

2. **Istoric de Cumpărături/Servicii**
   - Legătura între client și servicii cumpărate
   - Istoric complet de programări
   - Calculare venit total per client

3. **Tracking "Ultima Dată"**
   - Ultima programare
   - Ultima conversație
   - Ultima interacțiune

4. **Pagina dedicată Client Profile**
   - View detaliat client
   - Istoric complet
   - Quick actions

---

## 🎯 Plan de Implementare

### Faza 1: Schema de Date (Database Schema)

#### 1.1. Tabelă `clients` (nouă)
```typescript
interface Client {
  id: number;
  user_id: number;
  
  // Contact Info (normalized)
  name: string;
  email: string | null;
  phone: string | null;
  
  // Metadata
  source: string; // 'email', 'facebook', 'form', 'walk-in'
  status: string; // 'lead', 'active', 'inactive', 'vip'
  tags: string[]; // Array de tag-uri
  
  // Notes & Custom Fields
  notes: string | null;
  custom_fields: Record<string, any>; // JSON pentru extensibilitate
  
  // Calculated Fields (updated automatically)
  total_spent: number; // Suma totală cheltuită
  total_appointments: number; // Număr total programări
  last_appointment_date: Date | null;
  last_conversation_date: Date | null;
  first_contact_date: Date;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
}
```

#### 1.2. Tabelă `client_appointments` (legătură)
```typescript
interface ClientAppointment {
  id: number;
  client_id: number;
  appointment_id: number;
  service_id: number;
  service_name: string;
  service_price: number;
  appointment_date: Date;
  status: string;
  amount_paid: number | null;
  notes: string | null;
}
```

#### 1.3. Modificări la tabele existente
- `appointments`: Adaugă `client_id` (FK către clients)
- `conversations`: Adaugă `client_id` (FK către clients)

---

### Faza 2: Logică de Unificare Clienți

#### 2.1. Funcție de Identificare Client
```typescript
// lib/client-matching.ts

/**
 * Găsește sau creează un client bazat pe email/phone
 * Logica de matching:
 * 1. Email exact match (prioritate)
 * 2. Phone exact match
 * 3. Name fuzzy match (dacă email/phone lipsesc)
 */
async function findOrCreateClient(
  userId: number,
  name: string,
  email?: string,
  phone?: string,
  source: string = 'unknown'
): Promise<Client>
```

#### 2.2. Auto-linking la Creare
- Când se creează o conversație → link la client (sau creează client nou)
- Când se creează o programare → link la client (sau creează client nou)
- Când se actualizează o programare → actualizează `last_appointment_date`

---

### Faza 3: API Endpoints

#### 3.1. `/api/clients` (GET, POST)
- **GET**: Lista clienților cu filtrare și sortare
  - Query params: `search`, `status`, `source`, `sortBy`, `sortOrder`
  - Returnează: lista cu statistici (total_spent, total_appointments, last_visit)
  
- **POST**: Creează client nou
  - Body: `name`, `email`, `phone`, `source`, `notes`, `tags`

#### 3.2. `/api/clients/[id]` (GET, PATCH, DELETE)
- **GET**: Detalii client complet
  - Include: istoric programări, conversații, statistici
  
- **PATCH**: Actualizează client
  - Body: `name`, `email`, `phone`, `status`, `tags`, `notes`
  
- **DELETE**: Șterge client (soft delete sau hard delete)

#### 3.3. `/api/clients/[id]/history` (GET)
- Returnează istoric complet:
  - Programări (scheduled, completed, cancelled)
  - Conversații (toate canalele)
  - Timeline cronologic

#### 3.4. `/api/clients/[id]/stats` (GET)
- Statistici client:
  - Total cheltuit
  - Număr programări
  - Servicii preferate
  - Frecvență vizite
  - No-show rate

---

### Faza 4: UI Components

#### 4.1. Pagina `/clients` (Lista Clienților)
**Features:**
- Tabel cu coloane:
  - Nume
  - Email / Phone
  - Status (badge)
  - Total cheltuit
  - Ultima vizită
  - Acțiuni (View, Edit, Delete)
  
- Filtre:
  - Search (nume, email, phone)
  - Status filter
  - Source filter
  - Date range (ultima vizită)
  
- Sortare:
  - După nume, ultima vizită, total cheltuit
  
- Actions:
  - Quick add client
  - Export CSV
  - Bulk actions

#### 4.2. Pagina `/clients/[id]` (Client Profile)
**Layout:**
```
┌─────────────────────────────────────┐
│ Header: Nume Client + Status Badge  │
│ Quick Actions: Edit, Add Note, etc  │
├─────────────────────────────────────┤
│ Stats Cards:                        │
│ - Total cheltuit                    │
│ - Programări totale                 │
│ - Ultima vizită                     │
│ - Servicii preferate                │
├─────────────────────────────────────┤
│ Tabs:                               │
│ - Overview (default)                │
│ - Programări                         │
│ - Conversații                       │
│ - Notițe                            │
└─────────────────────────────────────┘
```

**Overview Tab:**
- Informații de contact
- Tags
- Custom fields
- Quick stats

**Programări Tab:**
- Listă cronologică (cel mai recent primul)
- Filtrare după status
- Detalii: serviciu, dată, preț, status

**Conversații Tab:**
- Toate conversațiile (toate canalele)
- Grupate cronologic
- Quick reply

**Notițe Tab:**
- Notițe interne
- Timeline de activități

#### 4.3. Componente Reutilizabile
- `ClientCard` - card pentru lista de clienți
- `ClientStats` - statistici client
- `AppointmentHistory` - istoric programări
- `ConversationHistory` - istoric conversații
- `ClientTimeline` - timeline cronologic

---

### Faza 5: Integrare cu Funcționalitățile Existente

#### 5.1. Auto-linking în Sync Yahoo
- Când se sincronizează un email nou:
  1. Caută client după email
  2. Dacă nu există, creează client nou cu source='email'
  3. Link conversația la client

#### 5.2. Auto-linking în Calendar
- Când se creează o programare:
  1. Caută client după email/phone
  2. Dacă nu există, creează client nou
  3. Link programarea la client
  4. Actualizează `last_appointment_date`

#### 5.3. Actualizare Statistici
- Când se completează o programare:
  1. Actualizează `total_spent` (adună prețul serviciului)
  2. Incrementează `total_appointments`
  3. Actualizează `last_appointment_date`

#### 5.4. Dashboard Integration
- Adaugă secțiune "Top Clienți"
- Adaugă "Clienți noi astăzi/săptămâna"
- Adaugă "Clienți inactivi" (nu au venit de X zile)

---

### Faza 6: Funcționalități Avansate (V2)

#### 6.1. Client Segmentation
- Grupuri automate:
  - VIP (total_spent > threshold)
  - Inactivi (nu au venit de 30+ zile)
  - Noi (creați în ultimele 7 zile)
  - Frecvenți (X+ programări/lună)

#### 6.2. Client Notes & Tags
- Notițe interne (doar pentru user)
- Tags pentru organizare
- Custom fields pentru date specifice business-ului

#### 6.3. Client Communication History
- Timeline unificat:
  - Email-uri
  - Mesaje Facebook
  - Form submissions
  - Programări
  - Notițe

#### 6.4. Export & Reporting
- Export CSV clienți
- Raport "Top Clienți"
- Raport "Clienți inactivi"
- Raport "Clienți noi"

---

## 📋 Checklist Implementare

### Step 1: Database Schema
- [ ] Creează tabelă `clients`
- [ ] Creează tabelă `client_appointments` (sau view)
- [ ] Adaugă `client_id` la `appointments`
- [ ] Adaugă `client_id` la `conversations`
- [ ] Migration script pentru date existente

### Step 2: Core Logic
- [ ] Funcție `findOrCreateClient()`
- [ ] Funcție `updateClientStats()`
- [ ] Funcție `linkConversationToClient()`
- [ ] Funcție `linkAppointmentToClient()`

### Step 3: API Endpoints
- [ ] `GET /api/clients`
- [ ] `POST /api/clients`
- [ ] `GET /api/clients/[id]`
- [ ] `PATCH /api/clients/[id]`
- [ ] `DELETE /api/clients/[id]`
- [ ] `GET /api/clients/[id]/history`
- [ ] `GET /api/clients/[id]/stats`

### Step 4: UI Pages
- [ ] Pagina `/clients` (lista)
- [ ] Pagina `/clients/[id]` (profile)
- [ ] Componente reutilizabile
- [ ] Integrare în navigare

### Step 5: Auto-linking
- [ ] Auto-link în Yahoo sync
- [ ] Auto-link în calendar (create appointment)
- [ ] Auto-update stats când se completează programare

### Step 6: Migration Date Existente
- [ ] Script pentru a crea clienți din appointments existente
- [ ] Script pentru a crea clienți din conversations existente
- [ ] Link-are date existente la clienți

---

## 🎨 UI/UX Considerations

### Design Principles
1. **Simplitate** - Nu supraîncărca cu informații
2. **Quick Actions** - Acces rapid la acțiuni comune
3. **Context** - Informații relevante când sunt necesare
4. **Consistency** - Același stil cu restul aplicației (dark mode)

### Key Metrics to Display
- Total cheltuit (prominent)
- Ultima vizită (prominent)
- Număr programări
- Status (lead/active/inactive/vip)
- Servicii preferate

### Quick Actions
- Adaugă programare
- Trimite mesaj
- Adaugă notiță
- Editează client
- Marchează ca VIP

---

## 🔄 Data Flow

### Când se creează o conversație nouă:
```
Email sync → Extract contact info → findOrCreateClient() → 
Link conversation to client → Update last_conversation_date
```

### Când se creează o programare:
```
Create appointment → findOrCreateClient() → 
Link appointment to client → Update last_appointment_date
```

### Când se completează o programare:
```
Mark as completed → Update client.total_spent → 
Increment total_appointments → Update last_appointment_date
```

---

## 📊 Calcularea Statisticilor

### Total Spent
```sql
SELECT SUM(s.price) 
FROM appointments a
JOIN services s ON a.service_id = s.id
WHERE a.client_id = ? AND a.status = 'completed'
```

### Total Appointments
```sql
SELECT COUNT(*) 
FROM appointments 
WHERE client_id = ? AND status IN ('scheduled', 'completed')
```

### Last Appointment Date
```sql
SELECT MAX(start_time) 
FROM appointments 
WHERE client_id = ? AND status IN ('scheduled', 'completed')
```

### Last Conversation Date
```sql
SELECT MAX(updated_at) 
FROM conversations 
WHERE client_id = ?
```

### Preferred Services
```sql
SELECT s.name, COUNT(*) as count
FROM appointments a
JOIN services s ON a.service_id = s.id
WHERE a.client_id = ? AND a.status = 'completed'
GROUP BY s.id, s.name
ORDER BY count DESC
LIMIT 3
```

---

## 🚀 Prioritate Implementare

### MVP (Must Have)
1. ✅ Tabelă `clients` cu câmpuri de bază
2. ✅ Funcție `findOrCreateClient()`
3. ✅ Auto-linking în appointments și conversations
4. ✅ Pagina `/clients` (lista simplă)
5. ✅ Pagina `/clients/[id]` (profile de bază)
6. ✅ API endpoints de bază

### V1.1 (Should Have)
7. Statistici calculate automat
8. Istoric programări în profile
9. Istoric conversații în profile
10. Search și filtrare

### V1.2 (Nice to Have)
11. Tags și notițe
12. Export CSV
13. Dashboard integration
14. Client segmentation

---

## 💡 Best Practices

1. **Normalizare Date**: Unifică datele din conversations și appointments
2. **Deduplicare**: Identifică clienți duplicați și unifică-i
3. **Performance**: Index pe `email` și `phone` pentru căutare rapidă
4. **Privacy**: Respectă GDPR - permite ștergere date client
5. **Audit Trail**: Log modificări importante (opțional)

---

## 🔍 Research Findings

### Ce oferă CRM-urile pentru micro-businesses:
- **HubSpot CRM Free**: Contact management, deal tracking, email integration
- **Zoho CRM**: Client profiles, sales pipeline, reporting
- **Pipedrive**: Focus pe sales, contact history, activity tracking

### Features comune:
1. **Contact Management** - Centralizare date contact
2. **Activity History** - Timeline de interacțiuni
3. **Sales Tracking** - Urmărire vânzări/programări
4. **Reporting** - Statistici și rapoarte
5. **Integration** - Email, calendar, messaging

### Ce trebuie să evităm:
- Over-engineering (nu avem nevoie de sales pipeline complex)
- Prea multe features (focus pe esențial)
- UI complicat (simplitate este cheia)

---

## 📝 Next Steps

1. **Review plan** - Verifică dacă planul acoperă nevoile
2. **Prioritize features** - Decide ce e esențial pentru MVP
3. **Start implementation** - Începe cu schema de date
4. **Iterate** - Adaugă features pe măsură ce sunt necesare

