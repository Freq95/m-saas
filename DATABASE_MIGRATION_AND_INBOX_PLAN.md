# m-saas: Database Migration + Inbox Deep Dive Plan

Date: 2026-02-06
Scope: Split plan for (A) migration from JSON/local storage to database and (B) Inbox feature cleanup + fixes.
Target MVP: Operator-only (appointments, inbox, tasks, client profile).

---

# A) Migration From JSON / Local Storage to Database

## A1) Current Storage Summary
- Current storage is MongoDB-backed with a SQL-like in-memory adapter.
- JSON file storage has been removed; SQL adapter remains for compatibility.

Key files:
- `lib/db/sql-adapter.ts`
- `lib/db/index.ts`
- `lib/db/mongo.ts`

## A2) Target Database Recommendation
- MongoDB (document storage, flexible schema, strong indexing).
- Driver: official `mongodb` Node.js driver.
- Migrations: JS-based index/collection init scripts.

## A3) Migration Strategy (Phased, Low Risk)

### Phase A0 — Prep and Inventory
- Inventory all JSON keys and tables.
- Define a normalized relational schema.
- Identify all reads/writes in code.

Deliverables:
- Schema ERD (tables, keys, indexes).
- Data mapping document (JSON -> SQL tables).

### Phase A1 — Build DB Schema + ETL Script
- Define collection mapping + indexes.
- Write ETL to load JSON data into MongoDB.
- Ensure ETL is idempotent and repeatable.

Deliverables:
- `migrations/*.js` (MongoDB collections + indexes).
- `scripts/migrate-json-to-db.ts` (ETL).

### Phase A2 — Dual-Read, Then Cutover
- Update data access layer to read from DB.
- Keep JSON reads for fallback during validation.
- Validate row counts, spot-check data.

Deliverables:
- Updated `lib/db/index.ts` and data access layer.
- Validation report (counts, integrity).

### Phase A3 — Full Cutover + Cleanup
- Remove JSON storage code.
- Replace the SQL adapter with native Mongo queries.
- Update scripts and docs.

Deliverables:
- Cleaned storage layer.
- Updated `SETUP.md` and environment docs.

## A4) Minimal Schema (Operator-Only MVP)
Collections:
- users
- clients
- conversations
- messages
- services
- appointments
- tasks
- client_notes
- client_files
- conversation_tags
- tags
- reminders

## A5) Migration Risks and Mitigations
- Risk: data loss during migration.
- Mitigation: dry-run ETL, compare counts, export backups.

- Risk: schema mismatch with existing code.
- Mitigation: adapter layer until all code is updated.

- Risk: performance regressions.
- Mitigation: add indexes for hot paths (clients search, appointments by date, messages by conversation_id).

## A6) Validation Checklist
- Row counts match JSON data.
- Appointments + conversations load correctly.
- Inbox and calendar render with expected data.
- Create/update/delete works end-to-end.

## A7) Files to Touch
- Replace: `lib/db/sql-adapter.ts`, `lib/db/index.ts`
- Update: `app/api/**` data access
- Add: `migrations/*` or `prisma/schema.prisma`
- Add: `scripts/migrate-json-to-db.ts`
- Update: `SETUP.md`, `README.md`

## A8) Phase 3 Complete (Mongo-Native Cutover)
Status: Complete (runtime API/lib consumers migrated to Mongo-native access).

### Commands used
PowerShell (from `d:\m-saas`):

```powershell
npx tsc --noEmit
$env:MIGRATE_DRY_RUN='1'; npm run db:migrate:mongo
npm run db:validate:mongo
```

### Verification outcome
- `npx tsc --noEmit`: pass.
- `npm run db:migrate:mongo` with dry-run env flag: pass.
- `npm run db:validate:mongo`: pass.
- Validation report path: `reports/mongo_validation_report.md`.
- Legacy SQL entrypoint is quarantined by design (`lib/db/index.ts` throws).
- Legacy migration script is quarantined by design: `scripts/migrate-clients.js`.

---

# B) Inbox Feature Deep Dive (Cleanup + Fixes)

## B1) Current Behavior Summary
- Inbox UI is functional but has broken email flows and heavy UI logic in a single file.
- Email integration exists but sync is not wired into the inbox flow.

Key files:
- `app/inbox/page.tsx`
- `app/api/conversations/[id]/messages/route.ts`
- `app/api/conversations/[id]/route.ts`
- `app/api/webhooks/email/route.ts`
- `app/api/yahoo/sync/route.ts`
- `lib/yahoo-mail.ts`

## B2) Critical Bugs (Must Fix)
1) Outbound email send broken.
- `getYahooConfig()` is async but not awaited.
- File: `app/api/conversations/[id]/messages/route.ts`

2) Yahoo sync route has duplicate logger declaration.
- Likely TypeScript compile error.
- File: `app/api/yahoo/sync/route.ts`

3) Inbox does not handle `?conversation=` param.
- Client profile links into inbox but selection is ignored.
- Files: `app/clients/[id]/page.tsx`, `app/inbox/page.tsx`

4) Email webhook does not link conversation to client.
- Creates conversations but `client_id` is never assigned.
- File: `app/api/webhooks/email/route.ts`

5) Webhook messages inserted without `sent_at`.
- Inbox sorts by `sent_at`, causing ordering issues.
- File: `app/api/webhooks/email/route.ts`

## B3) Functional Gaps (Why Email Support Feels Broken)
- No UI trigger to run `/api/yahoo/sync` for inbox ingestion.
- Outbound uses env credentials, not integration credentials.
- Linking between email threads and clients is incomplete.

## B4) Inbox Refactor Plan

### Phase B0 — Fix Critical Bugs
- Await Yahoo config in outbound send.
- Fix duplicate logger in yahoo sync.
- Add `sent_at` for webhook messages.
- Read `?conversation=` and auto-select thread.

### Phase B1 — Clean Architecture
Split `app/inbox/page.tsx` into:
- Data layer: `lib/inbox/api.ts`
- Hooks: `useConversations`, `useMessages`, `useSelectedConversation`
- UI components: ConversationList, ThreadView, Composer

### Phase B2 — Scale and Reliability
- Move search to server API (no fetching all messages into memory).
- Add rate limiting and error handling around sync.

## B5) Inbox Success Criteria
- Syncing email creates conversations and messages in inbox.
- Outbound replies actually send.
- Inbox can open a specific conversation via URL.
- Large inbox remains responsive.

## B6) Files to Touch
- `app/inbox/page.tsx`
- `app/api/conversations/[id]/messages/route.ts`
- `app/api/conversations/[id]/route.ts`
- `app/api/webhooks/email/route.ts`
- `app/api/yahoo/sync/route.ts`
- `lib/yahoo-mail.ts`
- Add: `lib/inbox/api.ts`, `components/inbox/*`

---

# Combined Timeline (Suggested)

Phase 0:
- Fix critical inbox bugs.
- Normalize appointment status if not already done.

Phase 1:
- Inbox refactor and sync flow.
- Begin DB schema + ETL script.

Phase 2:
- Cut over to DB for core entities.
- Replace JSON storage.

Phase 3:
- Hardening and performance.

---

# Open Questions
- Which MongoDB provider (Atlas, self-hosted, etc.)?
- Do you want dual-write period or immediate cutover?
- Are inbound messages only email for now or should we stub WhatsApp/Facebook/SMS?

---

# Next Step
Confirm DB provider and desired migration approach. Then I can:
- Generate schema + ETL script
- Implement the inbox fixes/refactor

