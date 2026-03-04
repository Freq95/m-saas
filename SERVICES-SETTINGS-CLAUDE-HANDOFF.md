# Services Settings + Settings Tabs UX Handoff (Claude Review)

Date: 2026-03-04  
Scope in this batch: **Services Settings tab only** + **Settings tab UX consistency**

Update (same day): Gmail OAuth implementation is now in progress/implemented in separate files:
- `lib/gmail.ts`
- `lib/gmail-sync-runner.ts`
- `app/api/auth/google/email/route.ts`
- `app/api/auth/google/email/callback/route.ts`
- `app/api/jobs/email-sync/gmail/route.ts`
- `app/settings/email/EmailSettingsPageClient.tsx`
- `app/api/settings/email-integrations/[id]/test/route.ts`
- `app/api/settings/email-integrations/[id]/fetch-last-email/route.ts`
- `app/api/cron/email-sync/route.ts`

## What was implemented

### 1) New Services Settings page (full CRUD UI)
- Added server page:
  - `app/settings/services/page.tsx`
  - Auth check via `getAuthUser()`
  - Server-side preload from `GET /api/services`
  - `revalidate = 0`
- Added client page:
  - `app/settings/services/ServicesSettingsPageClient.tsx`
  - Add service (inline form, client validation, toast feedback)
  - Edit service (inline row editing, PATCH)
  - Delete service (inline confirm row, DELETE)
  - In-use delete error mapped to inline Romanian message
  - Empty state + "add first service" CTA
- Added styles:
  - `app/settings/services/page.module.css`

### 2) Settings tabs UX consistency pass
- Added shared tabs component (single source of truth):
  - `app/settings/SettingsTabs.tsx`
  - `app/settings/SettingsTabs.module.css`
- Replaced duplicated tab markup/styles in:
  - `app/settings/email/EmailSettingsPageClient.tsx`
  - `app/settings/services/ServicesSettingsPageClient.tsx`
- Removed duplicated tab CSS from:
  - `app/settings/email/page.module.css`
  - `app/settings/services/page.module.css`
- Fixed placement inconsistency:
  - Tabs now appear **below page title + description** on both pages.
- Fixed width/layout shift on tab switch:
  - Unified container width to `max-width: 960px` for both pages.

## Files changed in this batch
- `app/settings/services/page.tsx` (new)
- `app/settings/services/ServicesSettingsPageClient.tsx` (new)
- `app/settings/services/page.module.css` (new)
- `app/settings/SettingsTabs.tsx` (new)
- `app/settings/SettingsTabs.module.css` (new)
- `app/settings/email/EmailSettingsPageClient.tsx` (modified)
- `app/settings/email/page.module.css` (modified)

## Validation run
- `npx tsc --noEmit` passed.
- `npm run build` passed after initial Services implementation.
- `npx tsc --noEmit` passed after each UX consistency follow-up patch.

## Claude review checklist (targeted)
1. Confirm `/settings/services` SSR preload path is acceptable (`fetch` to internal `/api/services` with forwarded cookies).
2. Confirm Services CRUD UI matches product behavior:
   - add/edit/delete success flows
   - inline delete error for "service in use"
   - loading disabled states
3. Confirm tabs UX consistency:
   - same placement on both pages
   - same width/frame when switching tabs
   - keyboard focus + active state (`aria-current`) works
4. Confirm no regressions in Email integrations page after tab refactor.
5. Confirm CSS variable usage remains aligned with project theming constraints.

## Known intentional gaps
- No `/settings` hub route yet; top nav still points to `/settings/email` entry point.

---

## 2026-03-04 Update: Inbox Provider Labels (Yahoo/Gmail)

Scope: Inbox UI consistency for provider identity badges.

### Implemented
- Backend enrichment in `lib/server/inbox.ts`:
  - Added `email_provider` on conversation payload (`'yahoo' | 'gmail' | null`).
  - Inference rules from inbound messages:
    - Yahoo if `source_uid != null`
    - Gmail if `source_uid == null` and `external_id != null`
- Frontend rendering in `app/inbox/InboxPageClient.tsx`:
  - Replaced generic `channel` label for email conversations with provider-aware label (`Yahoo`, `Gmail`, fallback `Email`).
  - Applied same provider label in thread header meta for consistency.
- Badge styling in `app/inbox/page.module.css`:
  - Added `.channelYahoo` (red badge)
  - Added `.channelGmail` (green badge)

### Verification
- `npx tsc --noEmit` passed after this patch.

### Claude review focus
1. Validate provider inference logic on mixed history threads (inbound + outbound).
2. Confirm no regressions for non-email channels.
3. Confirm badge contrast/accessibility in dark theme.
