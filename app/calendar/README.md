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

## Data Compatibility
`blocked_times.start_time` and `blocked_times.end_time` are handled as mixed legacy values (`Date` or ISO string). New writes are stored as ISO strings.

## Performance Note
For best query performance, run:

```bash
node scripts/migrations/add-calendar-indexes.js
```

## Important
Authentication/tenant scoping is not implemented yet. Current APIs still rely on `userId` passed by client.
