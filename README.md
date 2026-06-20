# densa — CRM & Scheduling for Clinics

Multi-tenant SaaS platform for managing appointments, clients, email inbox, and team — built for clinics and service businesses. Interface in Romanian.

---

## Recent Updates (2026-06-20)

- Created an encrypted logical backup of the production Atlas database and restore-verified all 42 collections and 24,336 documents by count and canonical EJSON hash. Backup artifacts remain local under the ignored `backups/` directory.
- Applied the hot-query index migration and the approved five-year GDPR retention migration. Production counts remained unchanged and the first retention dry-run found zero eligible records.
- Completed the patient erasure cascade, treatment-plan sharing safeguards, dental mutation authorization coverage, and tenant-isolation tests.
- CI now runs typecheck, 93 Vitest tests, cleanup scans, a production build, and 10 Playwright checks across desktop and phone viewports.
- Added automated WCAG A/AA checks, restored browser zoom support, corrected public-page contrast, and strengthened global browser security policies.

See [Data Retention](docs/DATA-RETENTION.md) and [MongoDB Index Audit](docs/INDEX-AUDIT.md) for operational evidence.

---

## Recent Updates (2026-05-12)

- Mobile app shell was redesigned for phone/PWA use: icon-only bottom navigation, settings/theme/logout moved into Settings, reduced route motion on mobile, and smoother immediate tap feedback.
- Mobile Settings now uses a Twitter-style index list, with sub-pages using a compact back-header instead of horizontal tabs.
- Calendar gained persistent mobile view preferences, configurable mobile/desktop view density, selectable 3/5/7 day and weekday/full-week ranges, working-hours controls, visible-calendar checkboxes, and unified-vs-columns calendar layout.
- Appointment categories are now configurable per dentist, use a pastel palette, and apply only to the dentist's own default calendar. Shared calendars continue to use dentist/calendar colors.
- Services, team, calendar, and client profile mobile layouts were cleaned up to avoid horizontal scroll, hidden actions, and unstable panels.
- Client profiles now support editing/deleting notes, appointment notes appear in the Notes tab with appointment context, and GDPR list status display was refined.
- Multi-role clinic workflows were expanded around owner/dentist/receptionist/asistent permissions, shared calendars, delegated services, and team management.

---

## Recent Updates (2026-04-05)

- Improved confirmation modal accessibility across logout, email disconnect, and service delete flows with dialog semantics, `Escape` dismissal, and initial focus on open.
- Added explicit accessible labels to the clients page search and filter controls.
- Tightened inbox email HTML sanitization to block interactive form controls inside rendered email content.
- Fixed stale hook dependency patterns in email settings and client profile loaders.
- Removed a few dead/redundant UI bits and documented that remote email images remain blocked by CSP intentionally for privacy/safety.

---

## Quick Start

### Prerequisites
- Node.js 20+
- MongoDB (Atlas or local)

### Installation

```bash
npm install
cp .env.example .env    # Edit with your MongoDB URI + secrets
node migrations/001_init_mongodb.js
npm run dev
```

Application at **http://localhost:3000**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Database | MongoDB (Atlas) |
| Auth | NextAuth v5 (JWT, credentials) |
| File Storage | Cloudflare R2 |
| Cache / Rate Limit | Upstash Redis (optional, in-memory fallback) |
| Job Queue | Upstash QStash (optional, inline fallback) |
| Email (transactional) | Resend |
| Email (sync) | Gmail API + Yahoo IMAP/SMTP |
| Validation | Zod |
| Deployment | Vercel |

---

## Features

- **Dashboard** — today's appointments, revenue stats, recent activity
- **Calendar** — weekly view, drag-and-drop, recurring appointments, conflict detection, blocked times, provider/resource assignment
- **Clients (CRM)** — search, notes, files (R2), activity history, CSV export, GDPR consent tracking, soft delete
- **Inbox** — email conversations (Gmail + Yahoo), reply via SMTP, attachments, inline images, client linking
- **Services** — catalog with pricing, soft delete (historical appointments preserve service name)
- **Theme system** - dark/light mode support via centralized theme tokens and client-side theme provider
- **PWA installability** - manifest + icons + service worker (installable on Android Chrome and iOS Safari 'Add to Home Screen')
- **Team** — invite members, role assignment (owner/dentist/receptionist/asistent), seat limits
- **Admin Panel** — tenant management, user management, audit logs, access logs, security incident register with breach notification workflow
- **Auth** — login, password reset, invite acceptance, session invalidation, 5-minute session refresh
- **Reminders** — API exists, processing gated behind feature flag (no UI yet)

---

## Documentation

| Document | Purpose |
|----------|---------|
| [PRODUCT.md](PRODUCT.md) | Feature-by-feature product documentation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical architecture, API surface, database schema, deployment |
| [CODE-HEALTH.md](CODE-HEALTH.md) | Known issues, technical debt, priority matrix |
| [docs/DATA-RETENTION.md](docs/DATA-RETENTION.md) | Approved retention policy, controls, and production verification |
| [docs/INDEX-AUDIT.md](docs/INDEX-AUDIT.md) | Production hot-query index map and explain evidence |
| [docs/TREATMENT-PLAN-FEATURE.md](docs/TREATMENT-PLAN-FEATURE.md) | Treatment-plan feature and data model |

---

## Key Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run typecheck        # TypeScript checks
npm run test:run         # Vitest unit and integration suite
npm run test:e2e         # Playwright desktop/mobile smoke and WCAG checks
npm run check:cleanup    # Build + typecheck + unused exports + dead CSS

npm run db:init:mongo    # Initialize MongoDB collections
npm run db:indexes       # Create tenant indexes
npm run db:validate:mongo # Validate data integrity

npm run bench:baseline   # Run performance benchmarks
npm run bench:report     # Generate benchmark report
```

PWA note:
- `npm run dev` keeps PWA disabled to avoid stale service-worker caches during development.
- Test install/offline behavior with `npm run build && npm run start` or on Vercel.

---

## Project Structure

```
app/
  (admin)/admin/     # Super-admin pages
  (auth)/            # Login, password reset, invite
  api/               # API route handlers
  calendar/          # Calendar page
  clients/           # CRM pages
  dashboard/         # Dashboard page
  inbox/             # Inbox page
  settings/          # Settings pages
components/          # Shared React components
lib/                 # Utilities, services, validation
  db/                # MongoDB client
  server/            # Server-side data fetchers
scripts/             # DB migrations, benchmarks, admin tools
migrations/          # MongoDB collection/index creation
tests/               # Vitest test files
```

---

**Private project — Not open source**

**Last updated:** 2026-06-20

