# Setup Instructions

## Prerequisites

- Node.js 18+ installed
- OpenAI API key (for AI agent features)
- No database setup required - uses JSON file storage

## Installation Steps

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `OPENAI_API_KEY` - Your OpenAI API key (required for AI features)
- Other optional integrations (email, Facebook, SMS, Google Calendar)

3. **Initialize JSON storage:**
```bash
npm run db:migrate
```

This creates a `data/` directory with `data.json` file containing default tags.

4. **Seed sample data (optional):**
```bash
npm run db:seed
```

This adds a test user, sample services, and a sample conversation.

5. **Start development server:**
```bash
npm run dev
```

The application will be available at http://localhost:3000

## Features Implemented (V1 MVP)

### ✅ Inbox unificat (beta)
- Conversation list with thread view
- Support for email, Facebook, and form submissions
- Automatic tagging: "Lead nou", "Întrebare preț", "Reprogramare", "Anulare"
- Webhook endpoints for receiving messages:
  - `/api/webhooks/email` - For email integration
  - `/api/webhooks/facebook` - For Facebook Page messages
  - `/api/webhooks/form` - For website form submissions

### ✅ Calendar de programări
- Weekly calendar view
- Time slots with automatic blocking
- Service types with duration and pricing
- Create appointments with client details
- Google Calendar export (when configured)

### ✅ Agent de răspuns semi-automat
- AI-generated response suggestions in Romanian
- Suggests 2-3 available time slots based on calendar
- User must approve before sending (semi-automatic)

### ✅ Reminder automat
- Automatic reminders 24 hours before appointments
- Supports SMS/WhatsApp and email
- Reduces no-show rate
- Process via: `POST /api/reminders/process` (set up as cron job)

### ✅ Dashboard simplu
- Messages per day (last 7 days)
- Appointments per day (last 7 days)
- No-show rate estimation
- Estimated revenue based on service prices

## API Endpoints

### Conversations
- `GET /api/conversations` - List all conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/[id]` - Get conversation with messages
- `PATCH /api/conversations/[id]` - Update conversation
- `POST /api/conversations/[id]/messages` - Send message
- `GET /api/conversations/[id]/suggest-response` - Get AI suggested response

### Appointments
- `GET /api/appointments` - List appointments
- `POST /api/appointments` - Create appointment
- `PATCH /api/appointments/[id]` - Update appointment
- `DELETE /api/appointments/[id]` - Delete appointment

### Calendar
- `GET /api/calendar/slots` - Get available time slots

### Services
- `GET /api/services` - List services
- `POST /api/services` - Create service

### Dashboard
- `GET /api/dashboard` - Get dashboard statistics

### Reminders
- `POST /api/reminders/process` - Process and send reminders (cron job)

## Setting Up Reminders (Cron Job)

To automatically send reminders, set up a cron job that calls:
```
POST http://localhost:3000/api/reminders/process
```

Example cron (every hour):
```bash
0 * * * * curl -X POST http://localhost:3000/api/reminders/process
```

## Next Steps

1. Set up email integration (Gmail/Outlook webhooks)
2. Configure Facebook Page API for message receiving
3. Set up Twilio or similar for SMS/WhatsApp reminders
4. Configure Google Calendar OAuth for export
5. Add authentication system (currently using userId=1 for testing)

