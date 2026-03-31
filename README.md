# densa — CRM & Scheduling for Clinics

Multi-tenant SaaS platform for managing appointments, clients, email inbox, and team — built for clinics and service businesses. Interface in Romanian.

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
- **Settings** — email integrations (Gmail OAuth, Yahoo), service management
- **Team** — invite members, role assignment (owner/staff), seat limits
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

---

## Key Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run typecheck        # TypeScript checks
npm run check:cleanup    # Build + typecheck + unused exports + dead CSS

npm run db:init:mongo    # Initialize MongoDB collections
npm run db:indexes       # Create tenant indexes
npm run db:validate:mongo # Validate data integrity

npm run bench:baseline   # Run performance benchmarks
npm run bench:report     # Generate benchmark report
```

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

**Last updated:** 2026-03-31
