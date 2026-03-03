# Calendar Feature

## Overview
Calendar supports week/month/day views, appointment CRUD, drag/drop rescheduling, recurring appointments, provider/resource filters, blocked times, and conflict suggestions.

## Current Behavior
- `GET /api/appointments` supports: `userId`, `startDate`, `endDate`, `status`, `providerId`, `resourceId`
- `POST /api/appointments` supports: provider/resource/category/color fields
- `PATCH /api/appointments/:id` validates payload and returns structured `409` conflicts:
  - `conflicts: Array<{ type, message }>`
  - `suggestions: Array<{ startTime, endTime, reason }>`
- `POST /api/appointments/recurring` requires `userId` and supports count/date end conditions
- `GET /api/blocked-times` supports: `userId`, `startDate`, `endDate`, `providerId`, `resourceId`
- `GET /api/calendar/slots` supports: `userId`, `date` or `suggested=true`, optional `providerId`, `resourceId`, `serviceId`

## UI/UX Behavior (Updated: 2026-03-03)
- Top calendar page remains non-scrollable; both panels stay visible in viewport.
- Main split layout is responsive via CSS grid:
  - left: calendar workspace
  - right: DayPanel (`clamp(...)` width by breakpoint)
- Left calendar panel is scrollable internally.
- Right DayPanel appointments list is scrollable internally.
- Right panel header now uses:
  - `Astazi` button
  - view-type dropdown (`Zi`, `Saptamana`, `Sapt. lucru`, `Luna`)
- Mini-calendar in DayPanel is compacted (reduced spacing/font) to prioritize appointment visibility.
- Past appointments are visually dimmed in:
  - WeekView blocks
  - MonthView appointment chips
  - DayPanel appointment cards
- Current local time marker:
  - current day column: solid line + dot
  - other visible day columns: dashed line
  - in past/future weeks (without today visible), dashed lines still render across all visible columns.

## Drag & Drop and Conflict Handling (Updated: 2026-03-03)
- Drag-and-drop now preserves half-hour precision (`:00` / `:30`) end-to-end.
- Fixed bug where dropping on `HH:30` snapped to `HH:00`.
- `updateAppointment` now returns structured result:
  - `{ ok, status, error?, conflicts?, suggestions? }`
- API `409` conflicts are treated as business conflicts (warn-level), not generic technical errors.
- On drag/drop `409`, UI opens `ConflictWarningModal` with API `conflicts`/`suggestions`.

## Data Compatibility
`blocked_times.start_time` and `blocked_times.end_time` are handled as mixed legacy values (`Date` or ISO string). New writes are stored as ISO strings.

## Performance Note
For best query performance, run:

```bash
node scripts/migrations/add-calendar-indexes.js
```

## Important
Authentication/tenant scoping is not implemented yet. Current APIs still rely on `userId` passed by client.
