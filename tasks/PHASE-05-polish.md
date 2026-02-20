# PHASE 5: Production Polish

**Priority:** MEDIUM — Ready for pilot customers
**Estimated effort:** 3-4 days
**Dependencies:** Phase 4 (testing) complete
**Commit message:** `PHASE-05: Email/SMS reminders, Stripe billing, provider CRUD, error pages`

---

## Context

At this point the foundation is solid: auth, tenancy, cloud storage, caching, tests. This phase adds the features needed to onboard pilot clinics.

---

## Task 5.1: Email reminders via Resend

### Install:
```bash
npm install resend
```

### Create `lib/email.ts`:
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping email');
    return null;
  }

  return resend.emails.send({
    from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
    ...options,
  });
}
```

### Create email templates:
- `lib/email-templates/appointment-reminder.ts` — 24h before appointment
- `lib/email-templates/appointment-confirmation.ts` — After booking
- `lib/email-templates/welcome.ts` — After registration

### Update `app/api/cron/reminders/route.ts`:
Use `sendEmail()` instead of inline nodemailer. Process reminders in batches.

### Update `.env.example`:
```
RESEND_API_KEY=
EMAIL_FROM=noreply@yourdomain.com
```

### Acceptance criteria:
- [ ] `lib/email.ts` exists with Resend integration
- [ ] Appointment reminder emails send 24h before
- [ ] Appointment confirmation emails send on booking
- [ ] Welcome email on registration
- [ ] Graceful fallback when RESEND_API_KEY not set
- [ ] Build passes

---

## Task 5.2: SMS reminders via Twilio

### Install:
```bash
npm install twilio
```

### Create `lib/sms.ts`:
```typescript
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSMS(to: string, body: string) {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.warn('TWILIO not configured, skipping SMS');
    return null;
  }

  return client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
}
```

### Update reminder processing to use real SMS (replace the stub in `lib/reminders.ts`).

### Update `.env.example`:
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

### Acceptance criteria:
- [ ] `lib/sms.ts` exists with Twilio integration
- [ ] SMS reminders actually send (when configured)
- [ ] Graceful fallback when TWILIO not configured
- [ ] Build passes

---

## Task 5.3: Stripe billing integration

### Install:
```bash
npm install stripe
```

### Create `lib/stripe.ts`:
```typescript
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export const PLANS = {
  free: { name: 'Free', price: 0, appointments: 100, clients: 50, team: 1, storage: '1GB' },
  starter: { name: 'Starter', priceId: 'price_xxx', appointments: 500, clients: 500, team: 3, storage: '10GB' },
  pro: { name: 'Pro', priceId: 'price_xxx', appointments: Infinity, clients: Infinity, team: 10, storage: '100GB' },
};
```

### Create API routes:

**`app/api/billing/checkout/route.ts`:**
- POST: Create Stripe Checkout session for plan upgrade
- Redirect to Stripe-hosted checkout page

**`app/api/billing/portal/route.ts`:**
- POST: Create Stripe Customer Portal session (manage subscription, payment methods)

**`app/api/billing/webhook/route.ts`:**
- POST: Handle Stripe webhooks
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Update tenant plan/status in database

**`app/api/billing/usage/route.ts`:**
- GET: Return current usage vs plan limits

### Create `lib/billing/limits.ts`:
Usage limit enforcement (check before creating appointments, clients, etc.)

### Update `.env.example`:
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
```

### Acceptance criteria:
- [ ] Stripe Checkout works (upgrade flow)
- [ ] Customer Portal works (manage subscription)
- [ ] Webhook handles plan changes
- [ ] Usage limits enforced (free plan: 100 appointments)
- [ ] Build passes

---

## Task 5.4: Provider and Resource CRUD (missing endpoints)

Currently providers and resources only have GET and POST. Add:

### `app/api/providers/[id]/route.ts`:
- GET: Single provider
- PATCH: Update working hours, name, role, active status
- DELETE: Soft-delete (set `is_active: false`)

### `app/api/resources/[id]/route.ts`:
- GET: Single resource
- PATCH: Update name, type, active status
- DELETE: Soft-delete (set `is_active: false`)

### Acceptance criteria:
- [ ] Providers can be updated and deactivated
- [ ] Resources can be updated and deactivated
- [ ] Deactivated providers/resources excluded from calendar
- [ ] Build passes

---

## Task 5.5: Proper error pages

### Create:
- `app/(auth)/error/page.tsx` — Auth error page (invalid token, expired session)
- `app/not-found.tsx` — Global 404 page
- `app/error.tsx` — Global error page with retry button

### Style:
- Match existing CSS Modules design
- Helpful error messages (Romanian if app is Romanian)
- "Go back" and "Go to dashboard" buttons

### Acceptance criteria:
- [ ] 404 page renders for unknown routes
- [ ] Error page renders with retry button
- [ ] Auth error page renders for auth failures
- [ ] Build passes

---

## Task 5.6: Performance — code splitting and lazy loading

### Lazy-load modals in CalendarPageClient:
```typescript
import dynamic from 'next/dynamic';

const CreateAppointmentModal = dynamic(
  () => import('./modals/CreateAppointmentModal'),
  { ssr: false }
);
```

### Apply to all modals in:
- `app/calendar/CalendarPageClient.tsx` — 5 modals
- `app/clients/[id]/ClientProfileClient.tsx` — Any modals

### Acceptance criteria:
- [ ] Modals are lazy-loaded (not in initial bundle)
- [ ] Calendar page initial JS size reduced
- [ ] Build passes

---

## Task 5.7: Tenant settings page

### Create `app/settings/page.tsx`:
- Clinic name and slug
- Working hours (per day, start/end)
- Timezone selector
- Currency selector
- Logo upload (use cloud storage from Phase 3)
- Team members list with invite button

### Create `app/api/tenant/route.ts`:
- GET: Current tenant settings
- PATCH: Update settings (owner only — no admin role in MVP)

### Acceptance criteria:
- [ ] Settings page renders with current values
- [ ] Working hours editable per day
- [ ] Changes persist to database
- [ ] Only owner can modify (staff gets 403)
- [ ] Build passes

---

## Final Verification

```bash
npm run build && npx tsc --noEmit
npm run test:run

# Full check:
npm run check:cleanup
```

Commit:
```bash
git add -A && git commit -m "PHASE-05: Email/SMS reminders, Stripe billing, provider CRUD, error pages"
```

---

## What's Next (Post-Foundation)

After Phase 5, the app is ready for pilot customers. Future work:
- Dental-specific features (charts, treatment plans) — separate planning needed
- Patient portal (online booking)
- Google Calendar two-way sync
- WhatsApp Business API
- Mobile app (React Native)
- GDPR compliance (data export/deletion)
- Multi-location support
