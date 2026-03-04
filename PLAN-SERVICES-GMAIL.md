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

## Feature 2: Gmail Integration (OAuth 2.0 — `gmail.readonly` scope, Testing mode)

### Context

Gmail uses OAuth 2.0, not App Passwords. This is the modern standard Google recommends.

**Architecture:**
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — set **once** in `.env` by the developer (platform-level, not per-user)
- Per-user tokens (`access_token` + `refresh_token`) — stored encrypted in MongoDB per user, same as Yahoo passwords
- Scope: `gmail.readonly` only (read emails, no sending in this phase)
- MVP deployment: Google Cloud app stays in **Testing mode** — developer whitelists user email addresses in Google Cloud Console (no code changes needed, no Google verification process needed)

**`googleapis` npm package is already installed. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` already exist in `.env` (used by Google Calendar). Do NOT add new Google Cloud credentials — reuse the same project, just add the Gmail OAuth redirect URI and `gmail.readonly` scope.**

---

### One-time Google Cloud setup (done by developer, not Cursor)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → existing project
2. **Enable Gmail API:** APIs & Services → Library → search "Gmail API" → Enable
3. **Add redirect URI:** APIs & Services → Credentials → click existing OAuth 2.0 Client → Authorized redirect URIs → Add:
   - `http://localhost:3000/api/auth/google/email/callback` (dev)
   - `https://yourdomain.com/api/auth/google/email/callback` (production)
4. **Stay in Testing mode:** OAuth consent screen → Testing → Add Test Users (add dentist email addresses here before they connect)
5. Add to `.env`:
   ```
   GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/google/email/callback
   ```

> **Note:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` already exist in `.env`. Only `GMAIL_REDIRECT_URI` is new.

---

### What already exists — reuse everything

- `googleapis` npm package — already installed
- `lib/google-calendar.ts` — has `google.auth.OAuth2` client setup pattern (read for reference, do NOT modify)
- `lib/email-integrations.ts` — `saveEmailIntegration(userId, tenantId, provider, email, password?, refreshToken?, accessToken?)` — already supports `refreshToken` and `accessToken` params
- `lib/encryption.ts` — `encrypt()` / `decrypt()` (reuse unchanged)
- `email_integrations` MongoDB collection — already has `encrypted_access_token`, `encrypted_refresh_token` fields in the schema
- `app/api/settings/email-integrations/[id]/route.ts` — DELETE handler (reuse unchanged)
- `app/settings/email/EmailSettingsPageClient.tsx` — Gmail section currently shows "Coming Soon" disabled button (replace it)

---

### Gmail OAuth client (important: separate from Calendar OAuth client)

`lib/google-calendar.ts` uses `GOOGLE_REDIRECT_URI` pointing to `/api/auth/google/callback`.
Gmail needs a **different** redirect URI (`GMAIL_REDIRECT_URI` → `/api/auth/google/email/callback`).

**Do NOT modify `lib/google-calendar.ts`.** Create `initGmailOAuthClient()` inside `lib/gmail.ts`:

```typescript
import { google } from 'googleapis';

export function initGmailOAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth not configured');
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/auth/google/email/callback'
  );
}

export function getGmailAuthUrl(): string {
  const client = initGmailOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent', // force refresh_token on every auth (required for offline access)
  });
}
```

---

### OAuth flow

```
User clicks "Connect with Google"
  → GET /api/auth/google/email
      - Generate random state: crypto.randomUUID()
      - Store state in httpOnly cookie: google_oauth_state (maxAge: 600s, sameSite: lax)
      - Redirect to Google consent URL (gmail.readonly scope)

  → Google redirects to /api/auth/google/email/callback?code=CODE&state=STATE
      - Verify state cookie matches query param (CSRF protection)
      - Clear state cookie
      - Exchange code for { access_token, refresh_token, expiry_date }
      - Get user email: gmail.users.getProfile({ userId: 'me' })
      - Save to email_integrations:
          saveEmailIntegration(userId, tenantId, 'gmail', email, undefined, refreshToken, accessToken)
      - Store token_expires_at in integration doc: $set: { token_expires_at: expiry_date }
      - Redirect to /settings/email?connected=gmail

UI on load: detect ?connected=gmail in URL → show success toast → remove param from URL
```

---

### Token refresh strategy

Before every Gmail API call, check expiry and refresh if needed:

```typescript
export async function getValidAccessToken(
  integrationId: number,
  refreshToken: string,
  tokenExpiresAt: number | null
): Promise<string> {
  const fiveMinutesMs = 5 * 60 * 1000;
  const isExpired = !tokenExpiresAt || Date.now() + fiveMinutesMs >= tokenExpiresAt;

  if (!isExpired) {
    // Return stored token (decrypt from DB before calling this function)
    throw new Error('Use stored access token'); // caller handles this
  }

  const client = initGmailOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();

  // Update in DB
  const db = await getMongoDbOrThrow();
  await db.collection('email_integrations').updateOne(
    { id: integrationId },
    {
      $set: {
        encrypted_access_token: encrypt(credentials.access_token!),
        token_expires_at: credentials.expiry_date ?? null,
        updated_at: new Date().toISOString(),
      },
    }
  );

  return credentials.access_token!;
}
```

---

### Gmail message fetching (Gmail API, not IMAP)

Gmail API messages are **base64url encoded** — very different from IMAP. Parse carefully:

```typescript
export async function fetchGmailMessages(
  accessToken: string,
  lastSyncAt: string | null
): Promise<ParsedGmailMessage[]> {
  const client = initGmailOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: client });

  // Build date query for incremental sync
  const query = lastSyncAt
    ? `after:${new Date(lastSyncAt).toISOString().slice(0, 10).replace(/-/g, '/')}`
    : 'newer_than:7d'; // first sync: last 7 days

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 50,
  });

  const messages = listRes.data.messages ?? [];
  const parsed: ParsedGmailMessage[] = [];

  for (const msg of messages) {
    const fullMsg = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'full',
    });

    parsed.push(parseGmailMessage(fullMsg.data));
  }

  return parsed;
}

function parseGmailMessage(msg: gmail_v1.Schema$Message): ParsedGmailMessage {
  const headers = msg.payload?.headers ?? [];
  const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

  // Decode body — handle multipart messages
  function decodeBody(part: gmail_v1.Schema$MessagePart): { text?: string; html?: string } {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return { text: Buffer.from(part.body.data, 'base64').toString('utf-8') };
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      return { html: Buffer.from(part.body.data, 'base64').toString('utf-8') };
    }
    if (part.parts) {
      let result: { text?: string; html?: string } = {};
      for (const subPart of part.parts) {
        Object.assign(result, decodeBody(subPart));
      }
      return result;
    }
    return {};
  }

  const body = msg.payload ? decodeBody(msg.payload) : {};

  return {
    messageId: msg.id!,
    from: get('From'),
    to: get('To'),
    subject: get('Subject'),
    date: get('Date'),
    text: body.text,
    html: body.html,
  };
}
```

---

### Files to create (4 files)

**`lib/gmail.ts`**
- `initGmailOAuthClient()` — creates OAuth2 client with `GMAIL_REDIRECT_URI`
- `getGmailAuthUrl()` — generates consent URL with `gmail.readonly` scope
- `getValidAccessToken(integrationId, refreshToken, tokenExpiresAt)` — refresh if expired, update DB
- `fetchGmailMessages(accessToken, lastSyncAt)` — list + fetch messages via Gmail API
- `parseGmailMessage(msg)` — decode base64url body, extract headers
- `testGmailConnection(accessToken)` — call `gmail.users.getProfile` to verify token works

**`lib/gmail-sync-runner.ts`**
- `syncGmailInboxForIntegration(integrationId, tenantId)` — same shape as `syncYahooInboxForIntegration`
- Gets integration from DB, decrypts tokens, calls `getValidAccessToken`, calls `fetchGmailMessages`, saves to `email_messages` collection, updates `last_sync_at`

**`app/api/auth/google/email/route.ts`**
```typescript
// GET /api/auth/google/email — generate OAuth URL and redirect
export async function GET(request: NextRequest) {
  await getAuthUser(); // must be logged in
  const state = crypto.randomUUID();
  const url = getGmailAuthUrl(); // from lib/gmail.ts

  // Build the actual URL with state param
  const authUrl = new URL(url);
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  return response;
}
```

**`app/api/auth/google/email/callback/route.ts`**
```typescript
// GET /api/auth/google/email/callback — handle OAuth callback
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const storedState = request.cookies.get('google_oauth_state')?.value;

    // CSRF check
    if (!state || !storedState || state !== storedState) {
      return NextResponse.redirect('/settings/email?error=invalid_state');
    }
    if (!code) {
      return NextResponse.redirect('/settings/email?error=no_code');
    }

    // Exchange code for tokens
    const client = initGmailOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user email
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress!;

    // Save integration
    await saveEmailIntegration(userId, tenantId, 'gmail', email, undefined, tokens.refresh_token!, tokens.access_token!);

    // Store token_expires_at in the integration doc
    if (tokens.expiry_date) {
      const db = await getMongoDbOrThrow();
      await db.collection('email_integrations').updateOne(
        { user_id: userId, provider: 'gmail' },
        { $set: { token_expires_at: tokens.expiry_date, updated_at: new Date().toISOString() } }
      );
    }

    // Clear state cookie
    const response = NextResponse.redirect(new URL('/settings/email?connected=gmail', request.url));
    response.cookies.delete('google_oauth_state');
    return response;
  } catch (error) {
    return NextResponse.redirect(new URL('/settings/email?error=oauth_failed', request.url));
  }
}
```

---

### Files to modify (4 files)

**`app/settings/email/EmailSettingsPageClient.tsx`**

Current Gmail section (lines ~581-595) shows a disabled "Coming Soon" button. Replace entirely:

1. Remove state: `showGmailForm`, `gmailEmail`, `gmailPassword`, `gmailEmailError`, `gmailPasswordRef` — no password form needed for OAuth
2. Add `gmailIntegration` (same pattern as `yahooIntegration`):
   ```typescript
   const gmailIntegration = integrations.find(i => i.provider === 'gmail');
   ```
3. On component mount, detect `?connected=gmail` or `?error=*` in URL params:
   ```typescript
   useEffect(() => {
     const params = new URLSearchParams(window.location.search);
     if (params.get('connected') === 'gmail') {
       toast.success('Gmail conectat cu succes!');
       loadIntegrations();
       window.history.replaceState({}, '', '/settings/email');
     }
     if (params.get('error')) {
       toast.error('Conectarea Gmail a esuat. Incearca din nou.');
       window.history.replaceState({}, '', '/settings/email');
     }
   }, []);
   ```
4. Replace Gmail card content:
   - If `gmailIntegration`: show email + last sync + Test Connection + Disconnect buttons (same layout as Yahoo connected state)
   - If no `gmailIntegration`: show active "Connect with Google" button that navigates to `/api/auth/google/email`
   ```tsx
   <button
     onClick={() => { window.location.href = '/api/auth/google/email'; }}
     className={styles.connectButton}
   >
     Conecteaza cu Google
   </button>
   ```
5. Update description text: `"Conecteaza-ti contul Gmail pentru a sincroniza mesajele. Foloseste OAuth 2.0 — nu este nevoie de parole de aplicatie."`

**`app/api/settings/email-integrations/[id]/test/route.ts`**

Read this file first. Add Gmail case:
```typescript
if (integration.provider === 'gmail') {
  const config = await getEmailIntegrationConfig(integration.user_id, integration.tenant_id, 'gmail');
  if (!config?.accessToken) return createErrorResponse('Gmail not configured', 400);
  const result = await testGmailConnection(config.accessToken);
  return createSuccessResponse({ success: result.ok, error: result.error });
}
```

**`app/api/cron/email-sync/route.ts`**

Add Gmail sync block after the Yahoo loop (around line 119, before `return createSuccessResponse`):
```typescript
// Gmail sync
const activeGmailIntegrations = await db
  .collection('email_integrations')
  .find({ provider: 'gmail', is_active: true })
  .sort({ last_sync_at: 1 })
  .limit(batchSize)
  .project({ id: 1, tenant_id: 1 })
  .toArray();

for (const doc of activeGmailIntegrations) {
  const integrationId = Number(doc.id);
  const tenantId = doc.tenant_id ? String(doc.tenant_id) : null;
  if (!tenantId) continue;
  try {
    await syncGmailInboxForIntegration(integrationId, new ObjectId(tenantId));
    processedInline++;
  } catch (error) {
    logger.error('Cron: Gmail sync failed', { integrationId, tenantId, error });
    failed++;
  }
}
```
Also update the import at the top: `import { syncGmailInboxForIntegration } from '@/lib/gmail-sync-runner';`

**`.env.example`**

Add after the `GOOGLE_REDIRECT_URI` area (or after the email section):
```
# Google OAuth (Gmail integration + Google Calendar)
# GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET already set — used by Calendar + Gmail
# Gmail-specific redirect URI (different from Calendar redirect)
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/google/email/callback
# For production: GMAIL_REDIRECT_URI=https://yourdomain.com/api/auth/google/email/callback
# MVP: app stays in Google Cloud Testing mode — whitelist user emails in Google Cloud Console
```

---

### Gmail vs Yahoo comparison

| Aspect | Yahoo | Gmail |
|--------|-------|-------|
| Auth | App Password → encrypted_password in DB | OAuth tokens → encrypted_access_token + encrypted_refresh_token in DB |
| Platform env vars | None | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (existing), `GMAIL_REDIRECT_URI` (new) |
| Per-user credentials | email + password pasted by user | access_token + refresh_token obtained via OAuth, invisible to user |
| UI connect | Form (email + password) | Single "Conecteaza cu Google" button |
| Message fetch | IMAP (nodemailer/imap) | Gmail API (`gmail.users.messages.list/get`) |
| Message encoding | Raw MIME | base64url encoded, must decode with `Buffer.from(data, 'base64')` |
| Sync cursor | `last_synced_uid` (IMAP UID) | `last_sync_at` + `after:YYYY/MM/DD` query |
| Sending | SMTP | Not implemented (read-only scope) |
| Token refresh | N/A (password never expires) | `refresh_token` → new `access_token` before expiry |
| Scope | Full mailbox | `gmail.readonly` (read only, this phase) |
| Testing mode | N/A | Whitelist emails in Google Cloud Console, no code needed |

---

### Acceptance criteria
- [ ] "Conecteaza cu Google" button appears in Gmail section of `/settings/email`
- [ ] Clicking button redirects to Google consent screen (gmail.readonly scope shown)
- [ ] After granting access, redirected to `/settings/email` with success toast
- [ ] Gmail integration shows connected email + last sync time
- [ ] "Test Connection" returns success for Gmail
- [ ] "Disconnect" removes Gmail integration
- [ ] Cron sync fetches Gmail inbox messages and saves to `email_messages` collection
- [ ] Token auto-refreshes when expired (no manual action needed)
- [ ] `npm run build && npx tsc --noEmit` — zero errors

---

## Implementation order

1. ~~**Services tab**~~ — already done ✅
2. **`lib/gmail.ts`** — OAuth client, auth URL, token refresh, message fetch, parse, test
3. **`lib/gmail-sync-runner.ts`** — sync runner (same shape as yahoo-sync-runner.ts)
4. **`app/api/auth/google/email/route.ts`** — authorize endpoint
5. **`app/api/auth/google/email/callback/route.ts`** — callback endpoint
6. **`app/settings/email/EmailSettingsPageClient.tsx`** — replace Coming Soon with OAuth button, handle redirect params
7. **`app/api/settings/email-integrations/[id]/test/route.ts`** — add Gmail case
8. **`app/api/cron/email-sync/route.ts`** — add Gmail sync loop
9. **`.env.example`** — document new env var

---

## Out of scope (this phase)
- Outlook integration
- Gmail sending (requires `gmail.send` scope — separate phase)
- Google Cloud app verification (stays in Testing mode for MVP)
- Service categories or ordering
- Service description field in UI

---

## Implementation log — 2026-03-04

### Status: ✅ COMPLETE (both features)

---

### Feature 1: Services settings tab

**Implemented by Cursor. Reviewed and shipped.**

**Bug fixed (Claude Code):** `handleSaveEdit` was sending `{ price: null }` when the price field was cleared. `updateServiceSchema` uses `price: z.number().nonnegative().optional()` which rejects `null` → API 400. Fix: omit the `price` key entirely when the field is empty:
```ts
...(editForm.price.trim() !== '' ? { price: Number(editForm.price) } : {})
```

**Files created:**
- `app/settings/services/page.tsx`
- `app/settings/services/ServicesSettingsPageClient.tsx`
- `app/settings/services/page.module.css`

---

### Feature 2: Gmail OAuth integration

**Implemented by Cursor. Security review + fixes applied by Claude Code.**

**Files created by Cursor:**
- `lib/gmail.ts` — OAuth client, auth URL, token refresh, message fetch, multipart parser, test connection
- `lib/gmail-sync-runner.ts` — sync runner (same shape as `yahoo-sync-runner.ts`)
- `app/api/auth/google/email/route.ts` — authorize: generates CSRF state, sets httpOnly cookie, redirects to Google
- `app/api/auth/google/email/callback/route.ts` — callback: CSRF verify, token exchange, save to DB
- `app/api/settings/email-integrations/gmail/route.ts` — (disconnect handled by existing DELETE route)

**Files modified by Cursor:**
- `app/settings/email/EmailSettingsPageClient.tsx` — Gmail "Coming Soon" replaced with OAuth flow
- `app/api/settings/email-integrations/[id]/test/route.ts` — Gmail case added (rate-limited: 5/10min)
- `app/api/settings/email-integrations/[id]/fetch-last-email/route.ts` — Gmail case added
- `app/api/cron/email-sync/route.ts` — Gmail provider added to fan-out loop

**Fixes applied by Claude Code:**
1. `lib/email-integrations.ts` — added `token_expires_at?: number | null` to `EmailIntegration` interface (was missing, causing `as any` casts everywhere)
2. `app/api/settings/email-integrations/[id]/test/route.ts` — removed `(integration as any).token_expires_at` cast (now typed)
3. `app/api/settings/email-integrations/[id]/fetch-last-email/route.ts` — removed `(integration as any).token_expires_at` cast
4. `app/api/auth/google/email/callback/route.ts` — separated auth error from OAuth errors: session expiry now redirects to `/login` instead of `?error=oauth_failed`

**TypeScript:** `npx tsc --noEmit` → zero errors ✅

---

### Security properties confirmed

| Property | How | Verified |
|---|---|---|
| Token encryption at rest | AES-256-GCM via `encrypt()` before every DB write | ✅ |
| Scope | `gmail.readonly` only — no send, delete, or modify | ✅ |
| CSRF | `crypto.randomUUID()` state in `httpOnly` cookie, verified on callback | ✅ |
| Auth on all routes | `getAuthUser()` guards all 3 OAuth routes + test + fetch | ✅ |
| Owner verification | `getEmailIntegrationById(id, userId, tenantId)` prevents testing others' integrations | ✅ |
| Tenant isolation | All DB queries filter `user_id + tenant_id` | ✅ |
| No token logging | Zero `logger.*` calls with decrypted values | ✅ |
| Token refresh → DB update | Refreshed `access_token` encrypted and written back | ✅ |
| `prompt: consent` | Guarantees `refresh_token` on every reconnect | ✅ |
| HTML sanitization | DOMPurify with strict allowlist + protocol blocking in `/inbox` and settings preview | ✅ |
| `ENCRYPTION_KEY` | Env only, never in DB, never in API response | ✅ |
| Revocation | DELETE removes document; Google Account revoke also works | ✅ |
| Rate limiting | Test connection: 5 per 10 min per user+IP | ✅ |

---

### Token lifetime

- **Access token:** 1 hour (Google-issued)
- **Refresh trigger:** 5 minutes before expiry (`Date.now() + 5min >= token_expires_at`)
- **Refresh token:** Permanent — server refreshes silently without user interaction
- **User re-auth needed only if:** user disconnects, revokes in Google Account settings, or refresh token unused 6+ months

---

### Email flow: how emails reach the inbox

```
Cron (POST /api/cron/email-sync)
  → queries email_integrations for active gmail integrations
  → for each: enqueueGmailSyncJob (QStash) OR syncGmailInboxForIntegration (inline)

syncGmailInboxForIntegration:
  → decrypt access_token + refresh_token from DB
  → getValidAccessToken: refresh if expiring within 5 min
  → fetchGmailMessages: Gmail API users.messages.list (after:YYYY/MM/DD) + users.messages.get per message
  → for each message: upsert conversation + insert message (deduped by external_id = Gmail message ID)
  → update last_sync_at on integration

Messages stored in: conversations + messages MongoDB collections
Visible at: /inbox (InboxPageClient.tsx)
```

**Without cron configured:** emails only sync when:
1. Cron endpoint is called manually
2. "Fetch Last Email" in settings (preview only — does NOT store to DB)

---

### Production checklist

| Task | Who | How | Status |
|---|---|---|---|
| Enable Gmail API in Google Cloud | Developer | console.cloud.google.com → APIs & Services → Library → Gmail API → Enable | ✅ Done |
| Add production redirect URI | Developer | Credentials → OAuth Client → Authorized redirect URIs → add `https://yourdomain.com/api/auth/google/email/callback` | ⬜ On deploy |
| Set `GMAIL_REDIRECT_URI` in Vercel | Developer | Vercel dashboard → Environment Variables → `GMAIL_REDIRECT_URI=https://yourdomain.com/api/auth/google/email/callback` | ⬜ On deploy |
| Whitelist dentist Gmail addresses | Developer | Google Cloud Console → OAuth consent screen → Test users → Add email | ⬜ Per user (manual, ~10s each) |
| Configure cron schedule | Developer | Vercel Cron or QStash → call `POST /api/cron/email-sync` every 15 min (06:00–22:00 Bucharest, quiet hours already enforced in code) | ⬜ Pending |

---

### Known limitations (accepted for MVP)

1. **`token_expires_at` stored in separate DB call** after `saveEmailIntegration` — tiny window where the field is missing. Safe: `getValidAccessToken` treats null `token_expires_at` as always-expiring and refreshes immediately.
2. **Testing mode limit:** Google allows max 100 whitelisted test users. Sufficient for current pilot. To exceed: submit for Google verification (no code changes needed).
3. **First sync fetches last 7 days** (`newer_than:7d` query). Subsequent syncs are incremental via `after:YYYY/MM/DD`.
4. **Sequential message fetch** (not parallel) — 50 messages × ~200ms each = ~10s max per sync. Acceptable for current scale.
5. **No Gmail sending** — `gmail.readonly` scope only. Sending requires a separate phase with `gmail.send` scope.

---

## 2026-03-04 Update: Inbox Provider Label Consistency

Implemented a UX consistency fix in Inbox so email conversations are labeled by provider instead of generic `email`:

- Yahoo conversations now render with `Yahoo` tag (red badge)
- Gmail conversations now render with `Gmail` tag (green badge)
- Generic fallback stays `Email` when provider cannot be inferred
- Thread header meta now uses the same provider-aware label as the conversation list

### Technical implementation notes

- Backend enrichment added in `lib/server/inbox.ts`:
  - Conversation payload now includes `email_provider` (`'yahoo' | 'gmail' | null`)
  - Provider is inferred from inbound message markers:
    - Yahoo: `source_uid != null`
    - Gmail: `source_uid == null` and `external_id != null`
- Frontend mapping in `app/inbox/InboxPageClient.tsx`:
  - Added provider-aware label helper (`Yahoo` / `Gmail` / `Email`)
  - Added provider-aware badge class mapping
- Styles in `app/inbox/page.module.css`:
  - Added `.channelYahoo` (red) and `.channelGmail` (green) variants

### Validation

- `npx tsc --noEmit` passed after change set.
