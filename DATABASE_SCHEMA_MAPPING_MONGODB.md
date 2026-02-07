# MongoDB Schema Mapping (Phase 1)

Date: 2026-02-06
Scope: Phase 1 database foundation for MongoDB. App continues reading JSON; this is an offline target schema + ETL.

## Source of Truth
Current data lives in `data/data.json`. Collections below map 1:1 to the JSON arrays.

## Collection Mapping
Each JSON array maps to a MongoDB collection with the same name.

- `users`
- `clients`
- `conversations`
- `messages`
- `tags`
- `conversation_tags`
- `services`
- `appointments`
- `tasks`
- `client_notes`
- `client_files`
- `reminders`
- `email_integrations`
- `google_calendar_sync`
- `contact_files` (legacy)
- `contact_custom_fields` (legacy)
- `contact_notes` (legacy)

## ID Strategy
- If a document has `id`, it is used as `_id` (numeric).
- `conversation_tags` uses `_id = "{conversation_id}:{tag_id}"` for idempotent upserts.
- `client_notes` and `client_files` use `_id = SHA1(document)` because JSON ids are not unique.
- If no deterministic id exists, a SHA1 of the stable JSON object is used.

`id` is preserved in the document for easier parity with existing queries.

## Index Plan (Initial)
Indexes are created via `migrations/001_init_mongodb.js`.

- `users`: `{ email: 1 }`
- `clients`:
  - `{ user_id: 1, last_activity_date: -1 }`
  - `{ user_id: 1, last_appointment_date: -1 }`
  - `{ user_id: 1, total_spent: -1 }`
  - `{ user_id: 1, name: 1 }`
  - `{ user_id: 1, email: 1 }`
  - `{ user_id: 1, phone: 1 }`
- `conversations`:
  - `{ user_id: 1, created_at: -1 }`
  - `{ user_id: 1, status: 1 }`
  - `{ client_id: 1 }`
- `messages`:
  - `{ conversation_id: 1, sent_at: -1 }`
  - `{ conversation_id: 1, created_at: -1 }`
- `tags`: `{ name: 1 }`
- `conversation_tags`:
  - `{ conversation_id: 1 }`
  - `{ tag_id: 1 }`
  - `{ conversation_id: 1, tag_id: 1 }` unique
- `services`: `{ user_id: 1 }`
- `appointments`:
  - `{ user_id: 1, start_time: 1 }`
  - `{ user_id: 1, status: 1 }`
  - `{ client_id: 1 }`
- `tasks`:
  - `{ user_id: 1, status: 1 }`
  - `{ contact_id: 1 }`
  - `{ client_id: 1 }`
  - `{ due_date: 1 }`
- `client_notes`: `{ client_id: 1, created_at: -1 }`
- `client_files`: `{ client_id: 1, created_at: -1 }`
- `reminders`: `{ user_id: 1 }`, `{ appointment_id: 1 }`
- `email_integrations`: `{ user_id: 1, provider: 1 }` unique
- `google_calendar_sync`: `{ user_id: 1 }`, `{ appointment_id: 1 }`, `{ google_event_id: 1 }`
- `contact_*` legacy: `{ contact_id: 1 }`

## Field Parity Notes
- All fields from JSON are preserved as-is.
- No schema transformation or normalization is applied in Phase 1.
- This ensures a future dual-read or cutover has minimal code changes.

## Phase 1 Scripts
- Index/collection init: `migrations/001_init_mongodb.js`
- JSON -> Mongo ETL: `scripts/migrate-json-to-db.ts`

## Env Variables
- `MONGODB_URI` (required)
- `MONGODB_DB` (optional; overrides db name in URI)
- `MIGRATE_DRY_RUN=1` (optional; logs counts without writing)
- `MIGRATE_BATCH_SIZE=500` (optional)
