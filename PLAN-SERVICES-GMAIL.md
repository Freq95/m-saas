# Plan: Services Settings Tab + Gmail Integration

**Created:** 2026-03-04
**Workflow:** Cursor implements → Claude Code reviews → ship

---

## Feature 1: Services Settings Tab

### Context
Full CRUD API already exists. Only the UI is missing. Dentists need to manage their own service catalog (name, duration, price) without touching the DB.

### What already exists — reuse everything, build nothing new on the backend
- `GET /api/services` — list services (cached 30 min)
- `POST /api/services` — create service
- `GET /api/services/[id]` — single service
- `PATCH /api/services/[id]` — update service
- `DELETE /api/services/[id]` — delete (returns error if service is used in appointments)
- `createServiceSchema` + `updateServiceSchema` in `lib/validation.ts`
- Service fields: `id`, `name`, `duration_minutes`, `price`, `description`

### Files to create (3 files only)
```
app/settings/services/
  page.tsx                        ← server component: auth check + fetch initial services
  ServicesSettingsPageClient.tsx  ← client component: full CRUD UI
  page.module.css                 ← styles
```

### Server page (`page.tsx`) pattern
Follow exactly `app/settings/email/page.tsx`:
- Call `getAuthUser()` for auth check
- Fetch `GET /api/services` server-side for initial data
- Pass as `initialServices` prop to client component
- Export `revalidate = 0`

### Client component (`ServicesSettingsPageClient.tsx`)
Follow `app/settings/email/EmailSettingsPageClient.tsx` for patterns (useToast, fetch, state).

**State:**
```typescript
const [services, setServices] = useState<Service[]>(initialServices);
const [showAddForm, setShowAddForm] = useState(false);
const [editingId, setEditingId] = useState<number | null>(null);
const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Service interface:**
```typescript
interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price: number | null;
}
```

**UI layout (minimalistic):**
```
┌─────────────────────────────────────────────────┐
│ Servicii                        [+ Adauga]       │
├──────────────┬──────────────┬──────────┬────────┤
│ Nume         │ Durata (min) │ Pret RON │        │
├──────────────┼──────────────┼──────────┼────────┤
│ Consultatie  │ 30           │ 150      │ ✎  🗑  │
│ Detartraj    │ 60           │ 200      │ ✎  🗑  │
└──────────────┴──────────────┴──────────┴────────┘

[Add form — shown when + Adauga clicked]
┌─────────────────────────────────────────────────┐
│ Nume *        [____________________________]     │
│ Durata (min)* [____]   Pret (RON) [________]    │
│                              [Anuleaza] [Salveaza]│
└─────────────────────────────────────────────────┘
```

**Behaviors:**
- **Add:** `+ Adauga` button toggles inline form below header. POST to `/api/services`. On success: append to list, hide form, show success toast.
- **Edit:** Clicking ✎ icon replaces that row with inline input fields (same 3 fields). PATCH to `/api/services/[id]`. On success: update row in state, exit edit mode.
- **Delete:** Clicking 🗑 icon shows inline confirm on that row: `"Esti sigur? [Da] [Nu]"`. DELETE to `/api/services/[id]`. If API returns error (service in use): show inline error message on that row — `"Serviciul este folosit in programari si nu poate fi sters."`. On success: remove from list.
- **Empty state:** `"Niciun serviciu adaugat inca."` + `"+ Adauga primul serviciu"` button.
- **Loading:** disable buttons while `saving === true`.
- **No pagination** — services list will always be small.

**Form validation (client-side before API call):**
- Name: required, min 1 char, max 255
- Duration: required, positive integer
- Price: optional, non-negative number

### CSS (`page.module.css`)
Use only CSS variables — no hardcoded colors. Key variables:
`--color-text`, `--color-text-soft`, `--color-surface`, `--color-surface-muted`,
`--color-border`, `--color-accent`, `--space-2` through `--space-6`,
`--radius-md`, `--radius-lg`, `--transition-fast`

Table rows: hover state `background: var(--color-surface-muted)`.
Edit/delete icons: `color: var(--color-text-soft)`, hover `color: var(--color-text)`.
Confirm delete row: `background: rgba(239, 68, 68, 0.06)`, border `rgba(239, 68, 68, 0.2)`.

### Acceptance criteria
- [ ] `/settings/services` renders with existing services on load
- [ ] Add service → appears in list + appears in calendar appointment dropdown
- [ ] Edit service name/duration/price → updates immediately in list
- [ ] Delete service not in use → removed from list
- [ ] Delete service used in an appointment → shows inline error, not deleted
- [ ] Empty state renders when no services exist
- [ ] `npm run build && npx tsc --noEmit` — zero errors

---

## Feature 2: Gmail Integration (App Password — same pattern as Yahoo)

### Context
Gmail uses the same App Password + IMAP approach as Yahoo. No OAuth, no Google Cloud project, no environment variables. The user creates an App Password in their Google Account and pastes it into the platform. Credentials stored encrypted per-user in DB — identical to Yahoo.

**No new backend patterns needed — this is Yahoo with a different IMAP host.**

### How users get a Gmail App Password
1. Google Account → Security → enable 2-Step Verification (required)
2. Security → App passwords → Select app: "Mail" → Generate
3. Copy the 16-character password → paste into platform settings

### What already exists — reuse everything
- `lib/yahoo-mail.ts` — IMAP fetch + SMTP send pattern (copy, change host)
- `lib/email-integrations.ts` — `saveEmailIntegration()`, `getEmailIntegrationConfig()` (reuse unchanged)
- `lib/encryption.ts` — `encrypt()` / `decrypt()` (reuse unchanged)
- `app/api/settings/email-integrations/yahoo/route.ts` — connect route (copy pattern exactly)
- `app/api/settings/email-integrations/[id]/test/route.ts` — test route (extend for Gmail)
- `app/api/settings/email-integrations/[id]/route.ts` — DELETE (reuse unchanged)
- `app/settings/email/EmailSettingsPageClient.tsx` — Gmail shows "Coming Soon" (replace with form)
- `lib/validation.ts` — `createYahooIntegrationSchema` (reuse same schema for Gmail)

### Files to create (2 files)

**`lib/gmail.ts`**

Copy `lib/yahoo-mail.ts`, change only:
- IMAP host: `imap.gmail.com` (port 993, TLS true) — same as Yahoo
- SMTP host: `smtp.gmail.com` (port 587, secure false) — same as Yahoo
- Function names: `getGmailConfig`, `fetchGmailEmails`, `sendGmailEmail`, `testGmailConnection`
- Export `syncGmailInboxForIntegration` (same signature as `syncYahooInboxForIntegration`)

```typescript
// IMAP config
{
  user: config.email,
  password: config.appPassword,  // Gmail App Password
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
}

// SMTP config
{
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: email, pass: appPassword }
}
```

**`app/api/settings/email-integrations/gmail/route.ts`**

Copy `app/api/settings/email-integrations/yahoo/route.ts` exactly, change:
- Provider: `'gmail'` instead of `'yahoo'`
- Call `testGmailConnection()` instead of `testYahooConnection()`
- Validation schema: reuse `createYahooIntegrationSchema` (same fields: email + password)
- Help text in error messages: reference Gmail App Password setup

### Files to modify (3 files)

**`app/settings/email/EmailSettingsPageClient.tsx`**

Find Gmail "Coming Soon" section. Replace with a connect form identical to Yahoo's form:
- Same fields: Email + App Password
- Add a help link: `https://myaccount.google.com/apppasswords`
- Help text: `"Necesita autentificare in 2 pasi activata. Mergi la Contul Google → Securitate → Parole pentru aplicatii"`
- POST to `/api/settings/email-integrations/gmail`
- Connected state: same display as Yahoo (email, last sync, Test, Disconnect buttons)

**`app/api/settings/email-integrations/[id]/test/route.ts`**

Add Gmail case alongside existing Yahoo case:
```typescript
if (integration.provider === 'gmail') {
  const config = await getGmailConfig(integration.user_id, integration.tenant_id);
  if (!config) return createErrorResponse('Gmail not configured', 400);
  const result = await testGmailConnection(config);
  return NextResponse.json({ ok: result.ok, error: result.error });
}
```

**`app/api/cron/email-sync/route.ts`**

Add Gmail sync alongside Yahoo sync:
```typescript
// After Yahoo sync loop, add:
const gmailIntegrations = integrations.filter(i => i.provider === 'gmail' && i.is_active);
for (const integration of gmailIntegrations) {
  try {
    await syncGmailInboxForIntegration(integration);
  } catch (err) {
    logger.error('Gmail sync failed', { integrationId: integration.id, err });
  }
}
```

### Gmail vs Yahoo — only the host changes

| Aspect | Yahoo | Gmail |
|--------|-------|-------|
| Auth method | App Password | App Password (identical) |
| IMAP host | `imap.mail.yahoo.com:993` | `imap.gmail.com:993` |
| SMTP host | `smtp.mail.yahoo.com:587` | `smtp.gmail.com:587` |
| Credentials storage | `encrypted_password` in DB | `encrypted_password` in DB (identical) |
| UI connect form | Email + Password | Email + Password (identical) |
| User setup | Yahoo App Password | Gmail App Password |
| Provider value | `'yahoo'` | `'gmail'` |

No new environment variables. No Google Cloud project. No OAuth.

### Acceptance criteria
- [ ] Gmail connect form appears in `/settings/email` (same style as Yahoo)
- [ ] Entering email + Gmail App Password → connection tested → saved encrypted in DB
- [ ] "Test Connection" works for Gmail
- [ ] "Disconnect" removes Gmail integration
- [ ] Cron sync fetches Gmail inbox messages same as Yahoo
- [ ] Help link guides user to `myaccount.google.com/apppasswords`
- [ ] `npm run build && npx tsc --noEmit` — zero errors

---

## Implementation order

1. **Services tab** — self-contained, no dependencies, ship first
2. **`lib/gmail.ts`** — copy yahoo-mail.ts, swap hosts
3. **Gmail connect route** — copy yahoo route, change provider
4. **UI update** — replace Coming Soon with Gmail form
5. **Test + cron** — extend existing routes

---

## Out of scope (this phase)
- Outlook integration
- Gmail OAuth (App Password approach is sufficient)
- Service categories or ordering
- Service description field in UI
