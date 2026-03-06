# Cursor Implementation Plan — Pre-Deployment Bug Fixes

> **Note — False alarms corrected after code verification:**
> Items #5 (DELETE handler), #7 (Edit client modal), #8 (Add note modal), #9 (suggestions error display),
> #10 (Conflict suggestions), #11 (submit button disabled on isSubmitting), #12 (file delete confirmation)
> are ALL already implemented. Do NOT re-implement them.
>
> From the original appointment issues list:
> - **Issue 1 (time picker centering)** — already fixed: `scrollIntoView({ block: 'center', behavior: 'instant' })` is in place at lines 516 and 527 of CreateAppointmentModal.tsx.
> - **Issue 4 (appointment click opens wrong modal)** — already correct: `handleAppointmentClick` opens `AppointmentPreviewModal`. No action needed.
> - **Issue 5 (drag-drop ghost modal)** — real bug, see FIX 11.

---

## CONFIRMED BUGS — Implement in order

---

### FIX 1 — Settings nav points to wrong page

**File:** `components/AppTopNav.tsx`, line 29

**Problem:** Nav "Setari" link goes to `/settings/email`. New user sees only email settings and misses services and other config.

**Change:**
```ts
// BEFORE
{ key: 'settings', href: '/settings/email', label: 'Setari' },

// AFTER
{ key: 'settings', href: '/settings', label: 'Setari' },
```

Also verify that `/app/settings/page.tsx` exists and redirects to `/settings/services` (the most relevant first tab for a new user) or shows a settings overview. If only `/settings/email` and `/settings/services` exist, change the redirect to `/settings/services`.

---

### FIX 2 — Dashboard inactive clients: add "View all" link

**File:** `app/dashboard/DashboardPageClient.tsx`, line 273–290

**Problem:** `.slice(0, 5)` hard-limits the list with no indication of how many more exist.

**Change:** Add a "Vezi toti" link below the list when `inactiveClients.length > 5`:
```tsx
// After the closing </div> of clientList, before the outer </div>:
{dashboard.clients.inactiveClients.length > 5 && (
  <Link href="/clients?filter=inactive" className={styles.viewAllLink}>
    Vezi toti ({dashboard.clients.inactiveClients.length})
  </Link>
)}
```

Add `viewAllLink` style in the module CSS: `font-size: 0.8rem; color: var(--color-accent); text-decoration: underline; display: block; margin-top: 8px;`

---

### FIX 3 — No "Forgot password" flow

**Problem:** No `/forgot-password` page exists. Users locked out permanently.

**Files to create/modify:**

**3a. Create `app/(auth)/forgot-password/page.tsx`:**
```tsx
import { ForgotPasswordForm } from './ForgotPasswordForm';
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
```

**3b. Create `app/(auth)/forgot-password/ForgotPasswordForm.tsx`:**
- Email input field
- Submit calls POST `/api/auth/forgot-password`
- On success: show message "Daca adresa există, vei primi un email cu instrucțiuni."
- No indication whether email exists (security best practice)

**3c. Create `app/api/auth/forgot-password/route.ts`:**
- Accept POST `{ email: string }`
- Look up user by email in DB
- If found: generate a time-limited token (1 hour), save to DB (`password_reset_tokens` or on user record as `reset_token` + `reset_token_expires`)
- Send email with reset link: `/reset-password?token=...`
- Always return 200 (don't leak whether email exists)

**3d. Create `app/(auth)/reset-password/page.tsx` + `ResetPasswordForm.tsx`:**
- Read `?token=` from URL
- Validate token against DB on load (show error if expired/invalid)
- Show new password + confirm password fields
- Submit calls POST `/api/auth/reset-password`
- On success: redirect to `/login?success=password-reset`

**3e. Create `app/api/auth/reset-password/route.ts`:**
- Accept POST `{ token: string, newPassword: string }`
- Validate token (exists, not expired)
- Hash new password with bcrypt
- Update user password, clear token
- Return 200

**3f. Add link to `app/(auth)/login/LoginForm.tsx`:**
```tsx
// Below the password input, before the submit button:
<Link href="/forgot-password" className={styles.forgotLink}>
  Ai uitat parola?
</Link>
```

> **Check first:** Look for any existing email sending utility in the project (e.g., `lib/email.ts`, `lib/resend.ts`, Resend/Nodemailer setup) and reuse it. If none exists, check `package.json` for `resend` or `nodemailer` and use whichever is present.
>
> **Rate limiting:** Add rate limiting to the POST `/api/auth/forgot-password` endpoint — 5 requests per hour per IP. Create a new limiter in `lib/rate-limit.ts` following the existing pattern (e.g. `forgotPasswordRateLimit`) and apply it at the top of the route handler before any DB query.

---

### FIX 4 — No "unsaved changes" warning on CreateAppointmentModal close

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`

**Problem:** Backdrop click and Escape key call `onClose()` immediately, discarding all typed data.

**Change:**

Add an `isDirty` computed value inside the component:
```ts
const isDirty = useMemo(() => {
  if (mode === 'view') return false;
  if (mode === 'create') {
    return (
      formData.clientName.trim() !== '' ||
      formData.clientEmail !== '' ||
      formData.clientPhone !== '' ||
      formData.notes !== ''
    );
  }
  // edit mode: compare against initialData
  // initialData.startTime / endTime are ISO strings — parse to HH:mm for comparison
  const initStart = initialData?.startTime
    ? format(new Date(initialData.startTime), 'HH:mm')
    : '';
  const initEnd = initialData?.endTime
    ? format(new Date(initialData.endTime), 'HH:mm')
    : '';
  return (
    formData.clientName !== (initialData?.clientName ?? '') ||
    formData.clientEmail !== (initialData?.clientEmail ?? '') ||
    formData.notes !== (initialData?.notes ?? '') ||
    selectedTime !== initStart ||
    selectedEndTime !== initEnd
  );
}, [mode, formData, initialData, selectedTime, selectedEndTime]);
// NOTE: `format` is already imported from 'date-fns' in this file.
```

Modify `handleBackdropClick` and the ESC key handler in the parent (`CalendarPageClient.tsx`):
```ts
// In handleBackdropClick (line ~164):
if (backdropPressStartedRef.current && endedOnBackdrop) {
  if (isDirty && !window.confirm('Ai modificări nesalvate. Închizi fără să salvezi?')) return;
  onClose();
}
```

> Use native `window.confirm` here — it's fine for this single guard. No need for a custom modal.

---

### FIX 5 — Submit button shows no loading feedback

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`, line 1157–1163

**Problem:** Button is disabled when `isSubmitting` but text stays the same. User doesn't know if anything is happening.

**Change:** Update the save button label:
```tsx
<button
  onClick={handleSubmit}
  className={styles.saveButton}
  disabled={services.length === 0 || isSubmitting || showNewClientConfirm}
>
  {isSubmitting ? 'Se salveaza...' : modalSubmitLabel}
</button>
```

---

### FIX 6 — No past-date validation on appointment creation

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`

**Problem:** Can create appointments for past dates with no warning.

**Change:** Add a warning (not a block — receptionists legitimately enter past appointments):

In the date/time section, below the time pickers, add:
```tsx
{selectedStartDateTime < new Date() && selectedDate && (
  <div className={styles.pastDateWarning}>
    ⚠ Aceasta programare este in trecut.
  </div>
)}
```

Add `pastDateWarning` style: `color: #b45309; font-size: 0.75rem; margin-top: 4px;`

---

### FIX 7 — Breadcrumb on `/clients/[id]` page

**File:** `app/clients/[id]/ClientProfileClient.tsx` (or the page wrapper)

**Problem:** No navigation trail. User on a client profile has no quick way back to the list.

**Change:** Add a simple breadcrumb at the top of the client profile page:
```tsx
// At the very top of the returned JSX, before the profile header:
<nav aria-label="Breadcrumb" className={styles.breadcrumb}>
  <Link href="/clients">← Clienti</Link>
  <span> / </span>
  <span>{client.name}</span>
</nav>
```

Add `breadcrumb` style: `font-size: 0.85rem; color: #666; margin-bottom: 16px; display: flex; gap: 4px; align-items: center;`

---

## MEDIUM PRIORITY — Do after the above

---

### FIX 8 — Email integration: show which account is connected

**File:** `app/settings/email/EmailSettingsPageClient.tsx`

**Problem:** User doesn't clearly see which email (Yahoo/Gmail) is connected and if sync is active.

**Change:** At the top of the email settings section, add a status banner:
```tsx
{integrations.length > 0 ? (
  <div className={styles.connectedBanner}>
    ✓ Conectat: {integrations[0].provider} ({integrations[0].email})
    {integrations[0].last_sync_at && (
      <span> · Ultima sincronizare: {format(new Date(integrations[0].last_sync_at), 'dd MMM HH:mm', { locale: ro })}</span>
    )}
  </div>
) : (
  <div className={styles.notConnectedBanner}>
    ✗ Niciun cont de email conectat
  </div>
)}
```

---

### FIX 9 — Inconsistent Romanian empty states

Audit and standardize these messages across the app:

| Location | Current | Standardize to |
|----------|---------|----------------|
| `DayPanel.tsx` — no appointments | "Nicio programare in aceasta zi" | "Nicio programare pentru această zi. Apasă + Adaugă pentru a crea una." |
| `DayPanel.tsx` — no day selected | "Selecteaza o zi" | "Selectează o zi din calendar pentru a vedea programările." |
| `ClientsPageClient.tsx` — no clients | "Nu exista clienti." | "Nu există clienți înregistrați. Apasă 'Client nou' pentru a adăuga primul client." |
| `DashboardPageClient.tsx` — no inactive | "Nu exista clienti inactivi" | "Toți clienții sunt activi. Felicitări!" |

---

### FIX 10 — total_spent uses current service price (architectural)

**Problem:** `updateClientStats` recalculates revenue using the current service price from the `services` collection. If price changes, history changes.

**Fix:** When creating an appointment, snapshot the service price onto the appointment document:

In `app/api/appointments/route.ts` (POST handler), after fetching the service:
```ts
const service = await db.collection('services').findOne({ id: serviceId, tenant_id: tenantId });
// ... existing code ...
const appointmentDoc = {
  // ... existing fields ...
  price_at_time: typeof service?.price === 'number' ? service.price : null,  // ADD THIS
};
```

In `updateClientStats` (`lib/client-matching.ts`, line ~238):
```ts
const totalSpent = completedAppointments.reduce((sum, apt) => {
  // Use price_at_time if available, otherwise fall back to current service price
  const price = typeof apt.price_at_time === 'number'
    ? apt.price_at_time
    : (serviceById.get(apt.service_id)?.price ?? 0);
  return sum + price;
}, 0);
```

> This is backward-compatible: old appointments without `price_at_time` fall back to current price. New appointments will snapshot correctly.

---

### FIX 11 — Drag-and-drop opens preview modal after successful drop

**File:** `app/calendar/CalendarPageClient.tsx`, line 409

**Problem:** After dragging an appointment to a new slot, the `click` event fires on the appointment block and triggers `handleAppointmentClick`, opening the preview modal. `handleSlotClick` already guards against this with `if (justDroppedRef.current) return` (line 354), but `handleAppointmentClick` does not.

**Change:**
```ts
// BEFORE (line 409):
const handleAppointmentClick = (appointment: Appointment) => {
  void openAppointmentDetails(appointment);
};

// AFTER:
const handleAppointmentClick = (appointment: Appointment) => {
  if (justDroppedRef.current) return;   // ADD THIS LINE
  void openAppointmentDetails(appointment);
};
```

One line change. `justDroppedRef` is already declared at line 178 and set at line 232.

---

### FIX 12 — Status labels inconsistent across components (Completat vs Finalizat, etc.)

**Separate plan file:** `CURSOR_STATUS_CONSISTENCY.md` in project root.

**Problem:** Status labels, colors, and CSS class names differ between `AppointmentPreviewModal`, `DayPanel`, `WeekView/AppointmentBlock`, `CreateAppointmentModal`, and `ClientProfileClient`. Some show "Completat" (wrong), some use old CSS class names that don't exist in the stylesheet.

**Action:** Follow the full implementation plan in `CURSOR_STATUS_CONSISTENCY.md`. That file has exact current code and exact replacements for each of the 7 files needing changes.

Do NOT modify `lib/types.ts`, `lib/validation.ts`, or `lib/server/dashboard.ts` — those are already correct (confirmed by validation agent).

---

## LOW PRIORITY — Nice to have before launch

---

### FIX 13 — Keyboard navigation in time pickers

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`

**Problem:** The ora inceput / ora final dropdown lists are mouse-only. Arrow keys do nothing.

**Change:** In the `<div className={styles.modalTimeList}>` for both start and end time, add an `onKeyDown` handler on the list container:
```tsx
onKeyDown={(e) => {
  const items = startTimeListRef.current?.querySelectorAll<HTMLButtonElement>('[data-time-option]');
  if (!items || items.length === 0) return;
  const currentIndex = Array.from(items).findIndex(btn => btn.dataset.timeOption === selectedTime);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = items[Math.min(currentIndex + 1, items.length - 1)];
    next?.focus();
    setSelectedTime(next?.dataset.timeOption ?? selectedTime);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = items[Math.max(currentIndex - 1, 0)];
    prev?.focus();
    setSelectedTime(prev?.dataset.timeOption ?? selectedTime);
  } else if (e.key === 'Enter') {
    setIsStartTimePickerOpen(false);
  } else if (e.key === 'Escape') {
    setIsStartTimePickerOpen(false);
  }
}}
```
Apply same pattern for end time list with `selectedEndTime`/`setSelectedEndTime`/`setIsEndTimePickerOpen`.

---

### FIX 14 — API allows any status transition (no validation)

**File:** `app/api/appointments/[id]/route.ts` (PATCH handler)

**Problem:** The API accepts any status value with no transition rules. Can go from `cancelled` → `completed` etc.

**Note:** Do NOT add hard blocks. Receptionists legitimately need to correct mistakes. Add soft warnings only — return a `warning` field in the 200 response when a transition looks odd:

```ts
// After validating the new status, before saving:
const STATUS_LABELS: Record<string, string> = {
  'scheduled':  'Programat',
  'completed':  'Finalizat',
  'cancelled':  'Anulat',
  'no-show':    'Absent',
};

const WARN_TRANSITIONS: Record<string, string[]> = {
  'cancelled': ['completed'],
  'no-show':   ['completed'],
};
const currentStatus = existingAppointment.status;
const warning = WARN_TRANSITIONS[currentStatus]?.includes(status)
  ? `Statusul a fost schimbat din "${STATUS_LABELS[currentStatus] ?? currentStatus}" în "${STATUS_LABELS[status] ?? status}".`
  : null;

// Include in response:
return NextResponse.json({ appointment: updatedDoc, warning });
```

In `CalendarPageClient.tsx` `updateStatusWithUndo`, if `result.warning` is set, show it as a `toast.warning()` AFTER the status change succeeds. No confirmation dialog needed — the receptionist just acted; warn them after.

---

## NOT WORTH FIXING NOW (Defer to post-launch)

- **#16 Timezone handling** — Deep architectural change, risk of breaking existing appointments. Defer.
- **#25 Inconsistent empty states (full audit)** — Low impact, see FIX 9 for the most visible ones only.

---

## Files modified summary

| File | Fix |
|------|-----|
| `components/AppTopNav.tsx` | FIX 1 — settings link |
| `app/dashboard/DashboardPageClient.tsx` | FIX 2 — view all link |
| `app/(auth)/forgot-password/page.tsx` *(new)* | FIX 3 |
| `app/(auth)/forgot-password/ForgotPasswordForm.tsx` *(new)* | FIX 3 |
| `app/api/auth/forgot-password/route.ts` *(new)* | FIX 3 |
| `app/(auth)/reset-password/page.tsx` *(new)* | FIX 3 |
| `app/(auth)/reset-password/ResetPasswordForm.tsx` *(new)* | FIX 3 |
| `app/api/auth/reset-password/route.ts` *(new)* | FIX 3 |
| `app/(auth)/login/LoginForm.tsx` | FIX 3 — add forgot link |
| `app/calendar/components/modals/CreateAppointmentModal.tsx` | FIX 4, 5, 6, FIX 13 (keyboard nav) |
| `app/clients/[id]/ClientProfileClient.tsx` | FIX 7 |
| `app/settings/email/EmailSettingsPageClient.tsx` | FIX 8 |
| `app/api/appointments/route.ts` | FIX 10 — price_at_time |
| `lib/client-matching.ts` | FIX 10 — use price_at_time |
| Various empty state components | FIX 9 |
| `app/calendar/CalendarPageClient.tsx` | FIX 11 — drag-drop guard (1 line) |
| See `CURSOR_STATUS_CONSISTENCY.md` | FIX 12 — 7 files, full status standardization |
| `app/api/appointments/[id]/route.ts` | FIX 14 — soft status transition warning |
