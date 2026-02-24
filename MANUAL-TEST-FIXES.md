# Manual Test Bug Fixes

**Reviewer:** Claude (Opus 4.6)
**Date:** 2026-02-23
**Found by:** Manual end-user testing after Section 35
**Verdict:** Fix all 5 bugs below, then run `npm run typecheck && npm run build`

---

## BUG 1: Client search error not visible when offline

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`

**What's happening:**
When the network is disconnected, the fetch in the client search useEffect throws a TypeError, which sets `clientSuggestionsError` state. The error div IS rendered (line 751) but uses `className={styles.clientSuggestionHint}` — the same muted grey style as the hint text below it ("Daca nu selectezi un client existent..."). It looks identical to the hint, so the user doesn't notice it.

**Fix — two changes:**

Change 1: Give the error a distinct style. Find this block:
```tsx
{clientSuggestionsError && (
  <div className={styles.clientSuggestionHint}>{clientSuggestionsError}</div>
)}
```

Replace with:
```tsx
{clientSuggestionsError && (
  <div className={styles.clientSuggestionError}>{clientSuggestionsError}</div>
)}
```

Change 2: Add the CSS class in `CreateAppointmentModal.module.css`:
```css
.clientSuggestionError {
  font-size: 0.78rem;
  color: var(--color-error, #dc2626);
  padding: 0.25rem 0;
}
```

Also ensure the error is visible even when `showClientSuggestions` is false (it already is — the error is outside the `showClientSuggestions` conditional at line 729 — but double-check that no parent container hides it).

---

## BUG 2: End time equal to start time shows error but doesn't auto-correct

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`

**What's happening:**
The useEffect at ~line 347 detects when `endMinutes <= startMinutes` and sets `timeValidationError`, but it does NOT update `selectedEndTime` to a valid value. The button shows the invalid time (e.g. 00:45 = start) and the user has to manually pick a new end time. Meanwhile the error message appears but the form looks like it might save anyway.

**Fix — in the useEffect that validates end time, also auto-correct the end time:**

Find this block (around lines 347-366):
```typescript
useEffect(() => {
  if (!isOpen) return;
  const startMinutes = parseTimeToMinutes(selectedTime);
  const endMinutes = parseTimeToMinutes(selectedEndTime);
  const fallback = endTimeOptions[0] || '';
  if (startMinutes === null) return;
  if (!fallback) {
    setSelectedEndTime('');
    setTimeValidationError('Ora de inceput este prea tarzie pentru durata minima de 15 minute.');
    return;
  }
  if (endMinutes <= startMinutes) {
    setTimeValidationError('Ora de final trebuie sa fie dupa ora de inceput.');
  }
}, [isOpen, selectedTime, selectedEndTime, endTimeOptions]);
```

Replace the last `if` block so it also corrects the end time:
```typescript
  if (endMinutes === null || endMinutes <= startMinutes) {
    setSelectedEndTime(fallback);
    setTimeValidationError('');
  } else {
    setTimeValidationError('');
  }
```

This way, whenever the start time changes and the current end time becomes invalid, the end time is automatically snapped to the first valid option. No error message needed — the correction is silent and expected UX (same as Google Calendar behavior).

---

## BUG 3: 23:45 start time — validation message not noticeable

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`

**What's happening:**
When start time is 23:45, `endTimeOptions` is empty, the end time button is disabled, and `timeValidationError` is set. But `timeValidationError` is displayed somewhere away from the time pickers and the disabled button alone is not enough — the user doesn't know why they can't proceed.

**Fix:**
Find where `timeValidationError` is displayed in the JSX. It should appear directly below the start/end time row, not at the bottom of the form.

Also: the end time button currently shows `'Nu exista interval disponibil'` when `endTimeOptions.length === 0`. Change that display text to be more explanatory:

```tsx
<span>{selectedEndTime || (endTimeOptions.length === 0 ? 'Ora prea tarzie' : 'Selecteaza ora')}</span>
```

And make sure `timeValidationError` is rendered immediately below the time row (not far away in the form). If it's already there, verify the CSS makes it visible (red, not grey).

---

## BUG 4: Saving without client name fails silently

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`

**What's happening:**
`handleSubmit` has this guard:
```typescript
if (!formData.clientName.trim() || !formData.serviceId) return;
```
It silently returns — no toast, no validation message. The user clicks Save, nothing happens, they don't know why.

**Fix — add feedback for both missing fields:**
```typescript
const handleSubmit = async () => {
  if (isSubmitting) return;
  if (!formData.clientName.trim()) {
    toast.error('Introduceti numele clientului.');
    return;
  }
  if (!formData.serviceId) {
    toast.error('Selectati un serviciu.');
    return;
  }
  // ... rest of handleSubmit unchanged
```

Make sure `toast` is available in the component (it already is — check imports at top of file).

---

## BUG 5: Client dedup still merges different people with same name

**File:** `lib/client-matching.ts` — `findOrCreateClient()` function

**What's happening:**
The Section 35 fix correctly handles the case where MULTIPLE name matches exist. But it does NOT handle the case where exactly ONE match exists and the new booking has a different email:

1. Book "Ion Popescu" with email1 → no existing client → creates client (email: email1)
2. Book "Ion Popescu" with email2 → finds exactly 1 name match (the one with email1) → `nameMatches.length === 1` → returns that client WITHOUT checking email

So the second "Ion Popescu" is silently attached to the first one's record.

**Fix — in the `nameMatches.length === 1` branch, add email disambiguation:**

Find this block (around line 92-94):
```typescript
if (nameMatches.length === 1) {
  existingClient = normalizeClientDoc(nameMatches[0]);
}
```

Replace with:
```typescript
if (nameMatches.length === 1) {
  const match = nameMatches[0];
  // If both the existing client and the new booking have emails,
  // and they don't match, treat as a different person.
  const matchEmail = typeof match.email === 'string' ? match.email.trim().toLowerCase() : null;
  if (normalizedEmail && matchEmail && matchEmail !== normalizedEmail) {
    // Different emails — intentionally create a new client below.
    // The user can merge duplicates later, but we can't un-merge mixed records.
  } else {
    existingClient = normalizeClientDoc(match);
  }
}
```

Apply the same fix to the regex fallback block (around line 128-130) which has identical logic:
```typescript
if (regexMatches.length === 1) {
  const match = regexMatches[0];
  const matchEmail = typeof match.email === 'string' ? match.email.trim().toLowerCase() : null;
  if (normalizedEmail && matchEmail && matchEmail !== normalizedEmail) {
    // Different emails — create new client.
  } else {
    existingClient = normalizeClientDoc(match);
  }
}
```

**Why this is safe:**
- If the existing client has no email: we use the match (can't prove it's different)
- If the new booking has no email: we use the match (can't prove it's different)
- Only if BOTH sides have emails AND they differ: create new client
- This prevents the "Ion Popescu" merge while avoiding false splits for the same person booking twice without email

---

## Validation Checklist

After all fixes:
```bash
npm run typecheck
npm run build
```

Manual verify:
1. [ ] Disconnect network, type 2+ chars in client name field — red error text appears
2. [ ] Set start time to 01:00, end time to 01:00 — end time auto-corrects to 01:15
3. [ ] Set start time to 23:45 — end time button shows 'Ora prea tarzie', is disabled
4. [ ] Click Save with empty client name — toast appears "Introduceti numele clientului."
5. [ ] Book "Ion Popescu" with email A, then book "Ion Popescu" with email B — two separate client records in DB
