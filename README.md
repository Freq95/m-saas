# m-saas - OpsGenie for Micro-Services

**SaaS platform for managing messages, appointments, and automation** for micro-services (salons, dental clinics, workshops).

**Current Status:** MVP V1 ~75% complete (February 2026)

---

## What is m-saas?

A unified platform that helps small businesses (salons, clinics, workshops) manage:
- **Inbox:** All messages (email, Facebook, forms) in one place
- **Calendar:** Appointment scheduling with automatic slot blocking
- **AI Agent:** Semi-automatic response suggestions in Romanian
- **Reminders:** Automated appointment reminders (email/SMS)
- **CRM:** Client management with history and statistics
- **Dashboard:** Business metrics and analytics

---

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (Atlas or local)
- Optional: OpenAI API key (for AI Agent)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI and API keys

# 3. Initialize MongoDB collections
npm run db:init:mongo

# 4. Seed test data (optional)
npm run db:seed

# 5. Start development server
npm run dev
```

Application available at: **http://localhost:3000**

---

## Tech Stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Database:** MongoDB (confirmed in use)
- **AI:** OpenAI API (for response suggestions)
- **Email:** Yahoo Mail (IMAP/SMTP)
- **UI:** React + Tailwind CSS + Dark mode
- **Deployment:** Vercel (planned)

---

## Current Features (What's Working)

✅ **Yahoo Mail Integration** - Full IMAP/SMTP integration
✅ **Calendar & Appointments** - Week/month views with slot blocking
✅ **CRM (Client Management)** - Auto-creation, deduplication, notes/files
✅ **Dashboard Analytics** - Messages/appointments charts, revenue tracking
✅ **Services Management** - Service catalog with pricing
✅ **UI/UX** - Dark mode, keyboard accessibility, Apple-style modals

⚠️ **AI Agent** - API exists but returns mock data (OpenAI integration pending)
⚠️ **Reminders** - API complete but not automated (cron job needed)

❌ **Gmail/Outlook** - Not implemented
❌ **Auth/Multi-tenancy** - Not implemented (hardcoded userId)

---

## Documentation

| Document | Purpose |
|----------|---------|
| **[STATUS.md](STATUS.md)** | Current status, features checklist, recent sessions, next steps |
| **[GUIDE.md](GUIDE.md)** | Setup guide, API reference, integrations, architecture |
| **[archived/](archived/)** | Historical documents, session logs, analysis reports |

---

## Project Structure

```
m-saas/
├── app/              # Next.js App Router
│   ├── api/          # API routes
│   ├── dashboard/    # Dashboard page
│   ├── inbox/        # Inbox page
│   ├── calendar/     # Calendar page
│   └── clients/      # CRM pages
├── lib/              # Utilities
│   ├── db/           # MongoDB client
│   ├── yahoo-mail.ts # Yahoo integration
│   └── calendar.ts   # Calendar logic
├── components/       # React components
└── docs/             # (Removed - see root README, STATUS, GUIDE)
```

---

## Development Workflow

### For AI Agents (Claude Code, Cursor)

1. **Start session:** Read [STATUS.md](STATUS.md) for current status
2. **Implementation:** Check [GUIDE.md](GUIDE.md) for API/setup details
3. **End session:** Update STATUS.md with session notes

### For Developers

1. **Onboarding:** Read this README → STATUS.md → GUIDE.md
2. **Daily work:** Check STATUS.md "Next Steps"
3. **API docs:** See GUIDE.md "API Reference" section
4. **Setup help:** See GUIDE.md "Setup & Installation" section

---

## Key Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production

# Database
npm run db:init:mongo    # Initialize MongoDB collections
npm run db:migrate:mongo # Migrate JSON to MongoDB
npm run db:seed          # Seed test data

# Testing
npm run test:webhooks    # Test webhook endpoints
npm run db:populate      # Populate with mock data
```

---

## Next Steps (Priority Order)

**Priority 1 (Critical):**
1. Implement authentication + multi-tenancy
2. Calendar backend hardening (auth, conflict checks)
3. AI Agent integration (replace mock with real OpenAI)
4. Automated reminders (cron job setup)

**Priority 2:**
5. Gmail integration (OAuth2)
6. Google Calendar two-way sync

**Priority 3:**
7. Testing & bug fixes
8. Mobile responsiveness
9. Production deployment

See [STATUS.md](STATUS.md) for detailed next steps.

---

## Contributing

This is a private project. For questions or suggestions, check documentation first:
- [STATUS.md](STATUS.md) - What's done, what's next
- [GUIDE.md](GUIDE.md) - How to set up and use
- [archived/](archived/) - Historical context

---

## License

Private project - Not open source

---

**Last Updated:** 2026-02-09
**MVP Progress:** ~75% complete
**Database:** MongoDB
