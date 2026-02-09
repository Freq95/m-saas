# m-saas Developer Guide

**Last Updated:** 2026-02-09
**For:** Setup, Integrations, API Reference, Architecture

---

## Table of Contents

1. [Setup & Installation](#setup--installation)
2. [Integrations](#integrations)
3. [API Reference](#api-reference)
4. [Architecture](#architecture)
5. [Features Overview](#features-overview)

---

## Setup & Installation

### Prerequisites

- **Node.js 18+** installed
- **MongoDB** (Atlas or local instance)
- **Optional:** OpenAI API key (for AI Agent features)

### Installation Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and configure:
   ```env
   # MongoDB (REQUIRED)
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
   MONGODB_DB=m-saas  # Optional, defaults to 'm-saas'

   # OpenAI (REQUIRED for AI Agent)
   OPENAI_API_KEY=sk-...

   # Yahoo Mail (Optional)
   YAHOO_EMAIL=your@yahoo.com
   YAHOO_APP_PASSWORD=abcd-efgh-ijkl-mnop

   # Other optional integrations
   GMAIL_CLIENT_ID=...
   GMAIL_CLIENT_SECRET=...
   FACEBOOK_APP_ID=...
   FACEBOOK_APP_SECRET=...
   TWILIO_ACCOUNT_SID=...  # For SMS reminders
   TWILIO_AUTH_TOKEN=...
   ```

3. **Initialize MongoDB collections + indexes:**
   ```bash
   npm run db:init:mongo
   ```

4. **Migrate existing JSON data to MongoDB (if applicable):**
   ```bash
   npm run db:migrate:mongo
   ```

5. **Seed test data (optional):**
   ```bash
   npm run db:seed
   ```
   Creates: 1 user, 4 services, 1 conversation with messages

6. **Start development server:**
   ```bash
   npm run dev
   ```
   Application available at: **http://localhost:3000**

### Production Setup

- Set `NODE_ENV=production`
- Use MongoDB Atlas or managed MongoDB instance
- Enable MongoDB authentication
- Set up cron job for reminder processing (see below)

---

## Integrations

### 1. Yahoo Mail Integration

**Status:** ✅ Fully implemented and working

#### Setup Steps

1. **Create App Password (REQUIRED - more secure):**
   - Go to: https://login.yahoo.com/account/security
   - Scroll to **"App passwords"**
   - Click **"Generate app password"**
   - Name it (e.g., "OpsGenie")
   - Copy the 16-character password (e.g., `abcd-efgh-ijkl-mnop`)
   - **Important:** Save it immediately - shown only once!

2. **Configure environment:**
   ```env
   YAHOO_EMAIL=your@yahoo.com
   YAHOO_APP_PASSWORD=abcd-efgh-ijkl-mnop
   ```

3. **Test connection:**
   ```bash
   curl http://localhost:3000/api/yahoo/sync
   # Should return: {"connected": true, "email": "your@yahoo.com"}
   ```

4. **Sync emails manually:**
   ```bash
   curl -X POST http://localhost:3000/api/yahoo/sync \
     -H "Content-Type: application/json" \
     -d '{"userId": 1}'
   ```

5. **Set up automatic sync (cron job):**
   ```bash
   # Sync every 5 minutes
   */5 * * * * curl -X POST http://localhost:3000/api/yahoo/sync \
     -H "Content-Type: application/json" \
     -d '{"userId": 1}'
   ```

#### Sending emails via Yahoo:
```bash
curl -X POST http://localhost:3000/api/yahoo/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "client@example.com",
    "subject": "Răspuns",
    "text": "Text content",
    "html": "<p>HTML content</p>"
  }'
```

#### Troubleshooting:
- **"Invalid credentials"**: Use App Password, not normal password
- **"Connection timeout"**: Check firewall allows IMAP (993) and SMTP (587/465)
- **No emails synced**: Ensure unread emails exist in Yahoo inbox

#### IMAP/SMTP Settings (auto-configured):
- **IMAP:** `imap.mail.yahoo.com:993` (SSL)
- **SMTP:** `smtp.mail.yahoo.com:587` (TLS)

---

### 2. Gmail Integration

**Status:** ❌ Not implemented (planned for Priority 2)

**Implementation Steps (Future):**

1. Create Google Cloud project
2. Enable Gmail API
3. Configure OAuth 2.0 credentials
4. Use Gmail API for reading/sending emails
5. Set up push notifications for new emails

**API Costs:** ✅ **FREE** - 1 billion requests/day quota

---

### 3. Facebook Messenger Integration

**Status:** ⚠️ Webhook endpoint exists, not fully tested

#### Setup Steps

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create application
3. Add "Messenger" product
4. Configure Webhooks:
   - Callback URL: `https://your-domain.com/api/webhooks/facebook`
   - Verify Token: (set in your `.env` as `FACEBOOK_VERIFY_TOKEN`)
   - Subscribe to `messages` events

5. Test manually:
   ```bash
   curl -X POST http://localhost:3000/api/webhooks/facebook \
     -H "Content-Type: application/json" \
     -d '{
       "userId": 1,
       "senderId": "123456",
       "senderName": "Ion Popescu",
       "message": "Bună! Aveți loc mâine?"
     }'
   ```

**API Costs:** ✅ **FREE** for normal messages (200 requests/second limit)

---

### 4. Webhooks & Form Integration

**Status:** ⚠️ Endpoints exist but not fully tested

#### Email Webhook: `/api/webhooks/email`
```bash
curl -X POST http://localhost:3000/api/webhooks/email \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "from": "client@example.com",
    "to": "your@email.com",
    "subject": "Question",
    "text": "Message content"
  }'
```

#### Form Webhook: `/api/webhooks/form`
```bash
curl -X POST http://localhost:3000/api/webhooks/form \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+40123456789",
    "message": "I need an appointment"
  }'
```

---

### 5. Google Calendar Export

**Status:** ⚠️ API exists but untested

Set up OAuth 2.0 credentials in Google Cloud Console, then configure:
```env
GOOGLE_CALENDAR_CLIENT_ID=...
GOOGLE_CALENDAR_CLIENT_SECRET=...
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/calendar/oauth/callback
```

---

### 6. SMS/WhatsApp Reminders (Twilio)

**Status:** ❌ Not implemented

**Future Setup:**
```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1234567890
```

---

## API Reference

### Base URL
```
http://localhost:3000/api
```

### Authentication
Currently uses `userId` parameter. **Production TODO:** Implement JWT or session-based auth.

### Rate Limiting
- **Read operations:** 100 requests / 15 minutes
- **Write operations:** 20 requests / 15 minutes
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Error Format
```json
{
  "error": "Error message",
  "details": "Additional info (dev mode only)"
}
```

### Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

---

### Clients Endpoints

#### `GET /api/clients`
Get clients list with filtering and pagination.

**Query Parameters:**
- `userId` (int, default: 1)
- `search` (string) - Search by name, email, phone
- `status` (string) - Filter: `all`, `lead`, `active`, `inactive`, `vip`
- `source` (string) - Filter: `all`, `email`, `facebook`, `form`, `walk-in`, `unknown`
- `sortBy` (string) - Sort: `name`, `email`, `total_spent`, `total_appointments`, etc.
- `sortOrder` (string) - `ASC` or `DESC`
- `page` (int, default: 1)
- `limit` (int, default: 20)

**Response:**
```json
{
  "clients": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### `POST /api/clients`
Create new client.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+40123456789",
  "source": "form",
  "status": "lead",
  "tags": ["new"],
  "notes": "Initial contact"
}
```

#### `GET /api/clients/{id}` - Get client details (with appointments + conversations)
#### `PATCH /api/clients/{id}` - Update client
#### `DELETE /api/clients/{id}` - Soft delete (sets status='deleted')
#### `GET /api/clients/{id}/stats` - Get detailed client statistics
#### `GET /api/clients/{id}/notes` - Get client notes
#### `POST /api/clients/{id}/notes` - Create note
#### `GET /api/clients/{id}/files` - Get client files
#### `POST /api/clients/{id}/files` - Upload file (max 10MB)
#### `GET /api/clients/export` - Export clients to CSV

---

### Appointments Endpoints

#### `GET /api/appointments`
**Query Parameters:**
- `userId` (int)
- `startDate` (ISO datetime)
- `endDate` (ISO datetime)
- `status` (string) - `scheduled`, `completed`, `cancelled`, `no-show`

#### `POST /api/appointments`
Create appointment.

**Request:**
```json
{
  "serviceId": 1,
  "clientName": "John Doe",
  "clientEmail": "john@example.com",
  "clientPhone": "+40123456789",
  "startTime": "2024-01-15T10:00:00Z",
  "notes": "Optional notes"
}
```

#### `GET /api/appointments/{id}` - Get appointment
#### `PATCH /api/appointments/{id}` - Update appointment
#### `DELETE /api/appointments/{id}` - Delete appointment

---

### Services Endpoints

#### `GET /api/services?userId=1` - List services
#### `POST /api/services` - Create service
#### `PATCH /api/services/{id}` - Update service
#### `DELETE /api/services/{id}` - Delete service

---

### Conversations Endpoints

#### `GET /api/conversations?userId=1` - List conversations
#### `POST /api/conversations` - Create conversation
#### `GET /api/conversations/{id}` - Get conversation with messages
#### `PATCH /api/conversations/{id}` - Update conversation
#### `POST /api/conversations/{id}/messages` - Send message
#### `GET /api/conversations/{id}/suggest-response` - **AI suggested response**

---

### Dashboard Endpoint

#### `GET /api/dashboard?userId=1&days=7`
**Response:**
```json
{
  "messagesPerDay": [...],
  "appointmentsPerDay": [...],
  "noShowRate": 0.15,
  "estimatedRevenue": 5000,
  "topClients": [...],
  "newClients": [...],
  "inactiveClients": [...]
}
```

---

### Calendar Endpoint

#### `GET /api/calendar/slots`
Get available time slots.

**Query Parameters:**
- `userId` (int)
- `date` (ISO datetime) - Specific date
- `suggested` (boolean) - Get suggested slots for next few days
- `serviceId` (int) - Service duration for calculation

---

### Reminders Endpoint

#### `POST /api/reminders/process`
**Process and send reminders** (set up as cron job).

**Cron Example (every hour):**
```bash
0 * * * * curl -X POST http://localhost:3000/api/reminders/process
```

#### `GET /api/reminders?userId=1` - List reminders
#### `POST /api/reminders` - Create reminder
#### `GET /api/reminders/{id}` - Get reminder
#### `PATCH /api/reminders/{id}` - Update reminder
#### `DELETE /api/reminders/{id}` - Delete reminder

---

### Yahoo Mail Endpoints

#### `POST /api/yahoo/sync` - Sync Yahoo inbox
#### `GET /api/yahoo/sync` - Test Yahoo connection
#### `POST /api/yahoo/send` - Send email via Yahoo SMTP

---

## Architecture

### MongoDB Data Model

**Database Name:** `m-saas` (default, configurable via `MONGODB_DB`)

**Collections:**
```javascript
[
  'users',                  // User accounts
  'clients',                // Client database (CRM)
  'conversations',          // Inbox conversations
  'messages',               // Conversation messages
  'tags',                   // Conversation tags
  'conversation_tags',      // Many-to-many: conversations ↔ tags
  'services',               // Service catalog (e.g., haircut, manicure)
  'appointments',           // Calendar appointments
  'tasks',                  // Task management
  'client_notes',           // Client notes (CRM)
  'client_files',           // Client file uploads
  'reminders',              // Appointment reminders
  'email_integrations',     // Yahoo/Gmail integration settings
  'google_calendar_sync',   // Google Calendar export sync
  'contact_files',          // Contact file uploads
  'contact_custom_fields',  // Custom fields for contacts
  'contact_notes',          // Contact notes
]
```

### Caching Strategy

- **In-memory cache**: 60 seconds TTL (configurable via `MONGO_CACHE_TTL_MS`)
- Cached data invalidated on writes
- Use `getMongoData(force=true)` to bypass cache

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ Yes | MongoDB connection string |
| `MONGODB_DB` | ❌ No | Database name (default: `m-saas`) |
| `OPENAI_API_KEY` | ⚠️ For AI | OpenAI API key for AI Agent |
| `YAHOO_EMAIL` | ❌ No | Yahoo email address |
| `YAHOO_APP_PASSWORD` | ❌ No | Yahoo App Password (16 chars) |
| `GMAIL_CLIENT_ID` | ❌ No | Gmail OAuth client ID |
| `GMAIL_CLIENT_SECRET` | ❌ No | Gmail OAuth secret |
| `FACEBOOK_APP_ID` | ❌ No | Facebook App ID |
| `FACEBOOK_APP_SECRET` | ❌ No | Facebook App Secret |
| `TWILIO_ACCOUNT_SID` | ❌ No | Twilio account SID (for SMS) |
| `TWILIO_AUTH_TOKEN` | ❌ No | Twilio auth token |

### API Patterns

- **RESTful design**: Standard HTTP methods (GET, POST, PATCH, DELETE)
- **Consistent responses**: `{ success, data, error }` format
- **Error handling**: Centralized error responses with Romanian messages
- **Rate limiting**: Configurable per endpoint type

---

## Features Overview

### 1. Unified Inbox
- **Purpose:** Centralize messages from email, Facebook, forms
- **Key Features:** Conversation threading, auto-tagging, AI suggestions
- **Technologies:** Yahoo IMAP/SMTP, Webhook endpoints
- **Status:** Yahoo integration complete; Gmail/Facebook pending

### 2. Calendar & Appointments
- **Purpose:** Schedule client appointments with service selection
- **Key Features:** Week/month views, slot blocking, overlap detection, Google Calendar export
- **Technologies:** MongoDB, time slot calculation
- **Status:** Foundation complete; conflict validation on update needed

### 3. CRM (Client Management)
- **Purpose:** Track clients, history, statistics
- **Key Features:** Auto-creation from emails/appointments, deduplication, notes/files, search/filter
- **Technologies:** MongoDB, pagination
- **Status:** Complete and working

### 4. Dashboard Analytics
- **Purpose:** Business metrics and insights
- **Key Features:** Messages/appointments charts, no-show rate, revenue estimation
- **Technologies:** MongoDB aggregation, date-fns
- **Status:** Complete and working

### 5. AI Agent (Semi-Automatic)
- **Purpose:** Suggest responses to customer inquiries
- **Key Features:** Romanian language, calendar-aware slot suggestions
- **Technologies:** OpenAI API (currently **mock data only**)
- **Status:** API exists; real AI integration pending

### 6. Automated Reminders
- **Purpose:** Send appointment reminders 24h before
- **Key Features:** Email/SMS/WhatsApp support, automatic scheduling
- **Technologies:** Yahoo SMTP, Twilio (planned)
- **Status:** API complete; cron automation + SMS/WhatsApp pending

### 7. Services Management
- **Purpose:** Define services with duration, price, description
- **Status:** Complete CRUD operations

### 8. UI/UX
- **Design:** Dark mode, minimalist, Apple-style modals
- **Accessibility:** Keyboard navigation, ARIA labels, WCAG 2.1 compliant
- **Status:** Calendar + settings page polished; other pages functional

---

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use MongoDB Atlas (or managed instance)
- [ ] Enable MongoDB authentication
- [ ] Set up SSL/TLS for MongoDB connection
- [ ] Configure OpenAI API key (for AI Agent)
- [ ] Set up cron job for reminder processing
- [ ] Configure email integration (Yahoo or Gmail)
- [ ] Test all webhook endpoints
- [ ] Enable rate limiting
- [ ] Set up monitoring (errors, performance)
- [ ] Implement authentication (remove hardcoded userId)
- [ ] Deploy to Vercel/AWS/GCP

---

*For current project status and feature progress, see [STATUS.md](STATUS.md)*
*For project overview and quick start, see [README.md](README.md)*
