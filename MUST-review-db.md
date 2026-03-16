# Database Schema Review — m-saas

> Generated: 2026-03-07
> Agent analyzed `migrations/001_init_mongodb.js`, `lib/types.ts`, `lib/validation.ts`, and all API routes/services

---

## Models Overview

**Active & Well-Used (10):** Users, Tenants, Clients, Conversations, Messages, Appointments, Services, Tasks, Reminders, Team Members

**Light / Feature-Flagged (8):** Providers, Resources, Blocked Times, Waitlist, Tags, Audit Logs, Email Integrations, Google Calendar Sync

**Potentially Dead (5):** `contact_files`, `contact_custom_fields`, `contact_notes`, Invite Tokens, Password Reset Tokens

**Overall schema health: 7/10**

---

## Potentially Unused / Redundant Fields

| Model | Field | Issue |
|-------|-------|-------|
| Appointment | `reminder_sent` | Set to `false` on creation, **never updated**. The reminders system tracks its own state with a separate `status` field. Dead code. |
| Appointment | `category`, `color` | Stored and returned but never queried, filtered, or used by any calendar visualization. Incomplete feature. |
| Appointment | `price_at_time` | Only 3 references in codebase; most code paths prefer `service.price`. Inconsistently used. |
| Task | `contact_id` | **Legacy duplicate of `client_id`** — comment in `lib/types.ts:96` says "Legacy support". Both fields stored; queried with `$or`. Migration was started but never completed. |
| Reminder | `message` | Optional custom message field. Set to `null` on creation, never retrieved or displayed in any UI. |
| Conversation | `subject` | Defaults to hardcoded `"Fara subiect"` for SMS/WhatsApp channels that have no subject concept. Forced field for non-email channels. |
| Message | `source_uid`, `external_id` | Email-specific sync fields on a generic message model. Not applicable to SMS, WhatsApp, Facebook, or form channels — clutters all conversation types. |
| Provider | `working_hours` | Complex nested object created with defaults, never queried or consumed by any scheduling logic. |
| Client | `deleted_at` | Soft-delete field is indexed and filtered, but no cascade behavior is implemented — deleted clients leave orphaned appointments, conversations, and tasks. |

---

## Collections That May Be Dead / Unused

| Collection | Status | Evidence |
|-----------|--------|----------|
| `waitlist` | **Dead** — no API routes exist | Created in migrations, zero usage anywhere in codebase |
| `contact_custom_fields` | **Dead** — no API or UI found | Created in schema, zero references in any route or service |
| `contact_files` | **Possibly replaced** — naming confusion | Route is `/api/clients/[id]/files` but internally queries `contact_files` collection |
| `contact_notes` | **Possibly replaced** — naming confusion | Route is `/api/clients/[id]/notes` but internally queries `contact_notes` collection |
| `invite_tokens` / `password_reset_tokens` | **Likely dead** — NextAuth has built-in token management | Collections exist in schema but no API routes consume them |
| `providers` / `resources` | **Feature-flagged** — no core UI dependency | Code comment explicitly marks these as "advanced scheduling domain, no core UI dependency" |

---

## Missing Indexes (Should Add)

```js
// providers — filter by active status per user
{ tenant_id: 1, user_id: 1, is_active: 1 }

// resources — filter by type
{ tenant_id: 1, user_id: 1, type: 1 }

// blocked_times — slot availability checks per provider/resource
{ tenant_id: 1, user_id: 1, provider_id: 1, start_time: -1 }
{ tenant_id: 1, user_id: 1, resource_id: 1, start_time: -1 }

// email_integrations — multi-user tenant queries
{ tenant_id: 1, user_id: 1 }

// google_calendar_sync — prevent duplicate sync on same Google event
{ tenant_id: 1, google_event_id: 1 }  // unique: true
```

---

## Unnecessary / Redundant Indexes (Should Remove or Consolidate)

| Collection | Redundant Index | Reason |
|-----------|----------------|--------|
| `messages` | `{ tenant_id, conversation_id, created_at }` | Duplicate of `sent_at` variant — pick one, remove the other |
| `tasks` | `{ tenant_id, contact_id }` | Will be fully obsolete once `contact_id` migration completes |
| `tasks` | 4 total indexes | Over-indexed — consolidate to: `[user_id, status]` + `[client_id, due_date]` |
| `clients` | 6 sort-variant indexes | All start with `[tenant_id, user_id]` — reduce to 3 most queried sorts: `last_activity_date`, `last_appointment_date`, `total_spent`. Let name/email/phone sort in-memory for smaller result sets. |
| `appointments` | `{ tenant_id, user_id, status }` | Rarely filtered by status alone; typical queries include a date range — add `start_time` to this index |

---

## Relation Issues

1. **No cascade on soft-delete** — deleting a client leaves orphaned appointments, conversations, and tasks. No cleanup logic exists anywhere in the codebase.
2. **`Task.contact_id` vs `Task.client_id`** — dual ownership fields, both indexed. Migration to `client_id` was started but never completed.
3. **`Conversation.client_id` is optional but assumed** — some conversations are created without a client link; client profile code assumes it always exists.
4. **No `user_id` on messages** — ownership is implied through conversation context. Makes "all messages sent by user X" impossible without aggregation joins.
5. **Service not validated on appointment creation** — `service_id` is stored without first verifying the service exists.

---

## Field Naming Inconsistencies

| Type | Inconsistency |
|------|--------------|
| Timestamps | `start_time` / `end_time` on Appointment vs `*_at` suffix used everywhere else |
| Booleans | `reminder_sent` (no `is_` prefix) vs `is_active`, `is_read` |
| Denormalized names | `client_name` on Appointment vs `contact_name` on Conversation — same concept, different keys |
| ID types | Mix of numeric and string IDs across collections (no consistent convention) |

---

## Enum Issues

| Enum | Issue |
|------|-------|
| `conversation.channel` includes `'facebook'` | No Facebook sync code exists — only email/Yahoo implemented. Remove until feature ships. |
| `appointment.status` | Schema validation uses `'no-show'` (hyphen), but DB stores `'no_show'` (underscore) — **active bug preventing status updates** |
| `reminder.status` includes `'failed'` | No retry logic or failed-state handling is documented or implemented |

---

## Recommendations (Prioritized)

### High — Breaking Changes Worth Doing Now

| # | Action | Effort |
|---|--------|--------|
| 1 | **Complete `contact_id` → `client_id` migration in Tasks** — write migration script, remove field, drop index, update all queries | 2-3h |
| 2 | **Remove dead collections**: `waitlist`, `contact_custom_fields`, `invite_tokens`, `password_reset_tokens` | 2h |
| 3 | **Clarify `contact_files` / `contact_notes`** — rename collections to `client_files` / `client_notes` to match route naming, or document the intentional split | 2h |

### Medium — Schema Cleanup

| # | Action | Effort |
|---|--------|--------|
| 4 | **Remove `reminder_sent` from Appointment** — reminders track their own `status`; this field is never updated | 30min |
| 5 | **Remove `category` + `color` from Appointment** — or implement them in the calendar UI | 30min |
| 6 | **Reduce over-indexed collections** — Clients (6→3 indexes), Tasks (4→2), Messages (remove `created_at` variant) | 1-2h |
| 7 | **Implement cascade soft-delete** — when a client is deleted, cascade to linked appointments, conversations, tasks | 3-4h |
| 8 | **Remove `'facebook'` from channel enum** until Facebook sync is actually implemented | 15min |
| 9 | **Fix `appointment.status` enum** — change `'no-show'` to `'no_show'` in validation schema to match DB storage | 15min |

### Low — Future Cleanup

| # | Action | Effort |
|---|--------|--------|
| 10 | Standardize timestamps — rename `start_time`/`end_time` → `start_at`/`end_at` | 2h |
| 11 | Standardize booleans — rename `reminder_sent` → `is_reminder_sent` | 30min |
| 12 | Add `user_id` to messages collection for proper audit trail and user-scoped queries | 3-4h |
| 13 | Move `source_uid`/`external_id` off the generic Message model — these are email-specific fields | 2-3h |
| 14 | Reassess `providers`/`resources` collections — remove if scheduling feature is not on active roadmap | 1h |
| 15 | Add missing performance indexes (providers, resources, blocked_times, email_integrations, google_calendar_sync) | 1h |

---

## Summary

| Metric | Count |
|--------|-------|
| Total collections | ~25 |
| Confirmed dead collections | 4-5 |
| Redundant/unused fields | 9 |
| Redundant indexes | 5-8 |
| Missing indexes | 5 |
| Active bug (enum mismatch `no-show` vs `no_show`) | 1 |
| Estimated cleanup debt | ~15-20h |

**Strengths:** Multi-tenancy properly implemented everywhere, sensible soft-delete strategy, reasonable indexing foundation, email/calendar integration fields in place.

**Weaknesses:** Incomplete `contact_id` → `client_id` migration, redundant contact_* collections, feature-flagged dead weight (providers/resources/waitlist), over-indexed write-heavy collections, undefined cascade delete behavior.

**Suggested order of attack:**
1. **This week:** Complete contact_id → client_id migration in Tasks
2. **This sprint:** Remove dead collections; clarify contact_* vs client_* naming
3. **Next sprint:** Reduce indexes on hot tables; implement cascade soft-delete
4. **Future:** Reassess scheduling features; remove providers/resources if not prioritized
