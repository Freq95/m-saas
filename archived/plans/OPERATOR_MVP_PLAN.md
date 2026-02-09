# Operator-Only MVP Review and Improvement Plan (m-saas)

Date: 2026-02-06
Repo: d:\m-saas
Scope: Operator-only MVP (front desk / scheduling / message handling)
Message sources: Email, WhatsApp, Facebook, SMS

## Purpose
This document reviews the current platform state against the operator-only MVP definition and provides a phased plan to close gaps, fix critical issues, and ship a usable MVP.

## Operator-Only MVP Definition (Target)
Core workflows:
- Appointments: create, reschedule, cancel, mark no-show, avoid double-booking
- Inbox: view conversations, reply, link conversation to client
- Tasks: create task, assign to self, set due date and status

Supporting basics:
- Client profile with name/phone/notes
- Quick search and filters
- Day/week calendar view
- Activity log per client (appointments, messages, tasks)

Out of scope for now:
- Billing, payments, insurance
- Owner/admin dashboards
- Advanced analytics
- Marketing automation
- Multi-location management

## Current State Summary
The app already implements calendar, inbox, and client profile features, but several critical correctness issues and platform limitations block a reliable operator MVP.

Key strengths:
- Calendar UI with create/edit/delete appointments in `app/calendar/page.tsx`
- Inbox UI with conversation thread and replies in `app/inbox/page.tsx`
- Client profile with tasks, notes, files, and activity in `app/clients/[id]/page.tsx`

Key blockers:
- Status mismatch for no-show (`no_show` vs `no-show`)
- Rescheduling does not re-check slot conflicts
- Outbound email send is broken (missing await)
- Conversation PATCH likely updates all rows
- JSON file storage is not production-safe and breaks filters/aggregations

## Feature Coverage Matrix
| Area | Status | Notes | Key Files |
|---|---|---|---|
| Appointments | Partial | Create/edit/delete exists, conflicts not enforced on reschedule | `app/calendar/page.tsx`, `app/api/appointments/[id]/route.ts`, `lib/calendar.ts` |
| Inbox | Partial | View/reply works, link-to-client missing | `app/inbox/page.tsx`, `app/api/conversations/[id]/route.ts` |
| Tasks | Partial | Client tasks exist, no operator "My Tasks" view | `app/clients/[id]/page.tsx`, `app/api/tasks/route.ts` |
| Client profile | Mostly OK | Notes/files/tasks present, relies on JSON DB | `app/clients/[id]/page.tsx` |
| Search/filters | Risky | SQL parser does not handle LOWER/LIKE | `app/api/clients/route.ts`, `lib/storage-simple.ts` |
| Activity log | Risky | Aggregation relies on limited SQL parser | `app/api/clients/[id]/activities/route.ts`, `lib/storage-simple.ts` |

## Critical Issues (Must Fix Before MVP)
1. No-show status mismatch breaks stats and filters.
- Files: `lib/validation.ts`, `app/calendar/page.tsx`, `app/api/dashboard/route.ts`, `app/api/clients/[id]/stats/route.ts`, `lib/types.ts`
- Fix: choose one enum value and enforce it across UI, API, and analytics

2. Conversation PATCH likely updates all rows.
- Files: `app/api/conversations/[id]/route.ts`
- Cause: incorrect placeholder indexing; JSON DB treats undefined params as match-all
- Fix: correct placeholder numbering and include `WHERE id = $1`

3. Outbound email send is broken.
- Files: `app/api/conversations/[id]/messages/route.ts`
- Cause: `getYahooConfig()` not awaited
- Fix: `const yahooConfig = await getYahooConfig()` and guard null

4. Reschedule does not check for conflicts.
- Files: `app/api/appointments/[id]/route.ts`, `lib/calendar.ts`
- Fix: on update, re-check slot availability (excluding current appointment)

5. Reminders are likely never processed.
- Files: `lib/reminders.ts`, `lib/storage-simple.ts`
- Cause: JSON DB parser does not support `reminder_sent = FALSE`
- Fix: avoid boolean SQL, or migrate to real DB

## Major Gaps (Required for Operator MVP)
1. No "My Tasks" view for staff.
- Files: none
- Fix: add `app/tasks/page.tsx` showing tasks assigned to current user

2. No UI to manage services (procedures).
- Files: `app/api/services/route.ts` only
- Fix: add minimal Services page or seed required services

3. Inbox cannot link conversation to client manually.
- Files: `app/inbox/page.tsx`, `app/api/conversations/[id]/route.ts`
- Fix: add UI to link/create client and persist `client_id`

4. Search and filters unreliable with JSON DB.
- Files: `app/api/clients/route.ts`, `lib/storage-simple.ts`
- Fix: migrate to Postgres or implement in-memory filtering instead of SQL

## Platform Risks
- JSON file storage is not safe for real usage.
- No authentication or tenant isolation.
- Webhooks accept unauthenticated payloads.

Key files: `lib/storage-simple.ts`, `lib/db.ts`, `middleware.ts`, `app/api/webhooks/*`

---

# Phased Improvement Plan

## Phase 0 - Stop the Bleeding (Critical Fixes)
Goal: Make current flows correct and safe for MVP testing.

Checklist:
- Normalize no-show status everywhere.
- Fix conversation PATCH placeholder indexing.
- Fix outbound email send (await config, guard null).
- Enforce conflict check on appointment updates.
- Ensure new appointments set `status='scheduled'` and `reminder_sent=false`.
- Add minimal services seed so calendar can create appointments.

Files:
- `lib/validation.ts`
- `app/calendar/page.tsx`
- `app/api/dashboard/route.ts`
- `app/api/clients/[id]/stats/route.ts`
- `lib/types.ts`
- `app/api/conversations/[id]/route.ts`
- `app/api/conversations/[id]/messages/route.ts`
- `app/api/appointments/[id]/route.ts`
- `app/api/appointments/route.ts`
- `scripts/seed.js`

## Phase 1 - Operator MVP Completeness
Goal: cover the operator workflows end-to-end.

Checklist:
- Add "My Tasks" page and routing.
- Add manual "Link to Client" in Inbox.
- Add minimal Services management page.
- Add fast search/filter that works with current storage.

Files:
- New: `app/tasks/page.tsx`
- Update: `app/inbox/page.tsx`
- Update: `app/api/conversations/[id]/route.ts`
- New: `app/services/page.tsx` or extend calendar with service management
- Update: `app/api/clients/route.ts`

## Phase 2 - Production Safety
Goal: make the system safe for real client usage.

Checklist:
- Replace JSON DB with Postgres + ORM.
- Add authentication (staff accounts).
- Add tenant model if multiple businesses are planned.
- Secure webhooks with signature verification.

Files (replace / add):
- Replace: `lib/storage-simple.ts`, `lib/db.ts`
- Add: auth middleware, session handling
- Update: `app/api/webhooks/*`

## Phase 3 - Optional Enhancements
Goal: reduce no-shows and improve efficiency.

Checklist:
- Configurable reminders and templates.
- Provider availability and working hours.
- Inbox quick actions (create appointment from message).

---

# MVP Readiness Call
Current readiness: NOT READY.

Blocking issues:
- Incorrect appointment status handling
- Reschedule conflict detection missing
- Conversation PATCH bug
- Outbound email send bug
- JSON storage fragility

Once Phase 0 and Phase 1 are complete, you have an operator-grade MVP for pilot use.

---

# Success Criteria (Operator MVP)
- Staff can book, reschedule, cancel, and mark no-show with no double-booking.
- Inbox can reply and link conversations to a client.
- Tasks can be created and tracked from a dedicated operator view.
- Client profile shows history, notes, tasks, and files.
- Search works reliably for daily use.

---

# Next Step
Confirm whether to write this plan into `d:\m-saas\OPERATOR_MVP_REVIEW_AND_PLAN.md` or a different path.
