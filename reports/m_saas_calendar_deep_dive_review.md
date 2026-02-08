# m-saas Calendar Feature Deep Dive Review

## Scope
Review of the current calendar implementation for a dental-cabinet workflow target:
- day-by-day operational scheduling
- robust conflict handling
- clean, simple Apple-like UX aligned to the existing m-saas theme

## Executive Summary
The current calendar is a solid prototype for basic appointment management, but it is not yet production-ready for dental clinics.  
Main blockers are multi-tenant security, scheduling integrity on edits, and missing dental-specific primitives (doctor/chair/location/blocked time/waitlist/recurrence).

## Findings (by severity)

### 1) Critical - Tenant isolation and auth are not enforced
- API routes rely on `userId` from query/body and default to `1`.
- Appointment detail/update/delete routes operate by `id` without verified owner scoping.
- Risk: cross-clinic data exposure and unauthorized modifications.

### 2) Critical - Appointment edits can create overlaps
- Create flow checks slot availability, update flow does not.
- No strict validation for invalid ranges (`end <= start`) in PATCH path.
- Risk: accidental double-booking and invalid calendar states.

### 3) Critical - Numeric ID generation is race-prone
- IDs are generated via max+1 scan, not atomic counter.
- Risk: duplicate IDs under concurrent front-desk activity.

### 4) High - Reminder processor endpoint is exposed
- Reminder processing can be triggered without a secure guard.
- Processing runs globally across scheduled appointments.
- Risk: abuse and noisy cross-tenant operational side effects.

### 5) High - Status values are inconsistent
- Uses both `no_show` and `no-show` across validation/UI/reporting.
- Risk: broken filters, inconsistent badges, unreliable reporting.

### 6) High - Dental scheduling model is incomplete
Missing core entities and constraints:
- provider/doctor
- room/chair
- location
- blocked times
- recurrence/treatment-plan scheduling
- waitlist and auto-fill

### 7) High - Google Calendar sync is one-way and brittle
- Only exports create event.
- No update/delete sync.
- Sync storage/index naming mismatch indicates fragility.

### 8) Medium - Working-hours logic mismatch
- Weekly UI renders one interval while slot engine uses a different default.
- Risk: availability suggestions differ from visible schedule.

### 9) Medium - Accessibility/mobile UX gaps
- Heavy div-click interaction without clear keyboard semantics.
- No clear responsive strategy in calendar CSS for dense receptionist use.

### 10) Medium - UX quality issues vs Apple-like target
- Blocking browser alerts/confirms.
- Debug logs in UI actions.
- Text encoding artifacts in labels.

## Coverage Against Dental Blueprint

### Implemented (partial)
- week/month calendar views
- create/edit/delete appointments
- basic service duration usage
- basic reminders

### Missing for day-by-day dental operations
- multi-chair + provider view
- fast reschedule with conflict-aware suggestions
- blocked slots and exceptions
- waitlist one-click fill
- recurring visits/treatment plans
- reminder confirmation links and auto-follow-up
- role permissions + audit trail

## Recommended Build Order
1. Security and tenancy foundation (auth + scoped authorization on all calendar endpoints).
2. Data model upgrade (provider/chair/location/blocked-time/recurrence/waitlist).
3. Scheduling integrity hardening (create+update conflict checks, atomic IDs/counters, status normalization).
4. UX refactor (Apple-simple interaction model, accessible controls, mobile receptionist ergonomics).
5. Reminder workflow v2 (48h/24h/same-day, confirm/cancel links, retry and audit).

## Definition of Done for Calendar v1 (Dental)
- No cross-tenant data access possible.
- No overlapping bookings for same provider/chair/location.
- Reception can reschedule in <= 3 clicks with suggested alternatives.
- Confirm/cancel reminders update appointment status reliably.
- Day view remains readable and operable on desktop and mobile.

