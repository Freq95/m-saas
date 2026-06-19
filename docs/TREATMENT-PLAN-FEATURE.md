# Feature Spec — Treatment Plans ("Plan de tratament")

**Audience:** an implementing agent working in this repo (`m-saas`, Next.js App Router + MongoDB + Vercel).
**Goal:** let a dentist build a per-patient treatment plan, generate a branded **PDF**, **save it into the patient's Fișiere (attachments)**, and **send it by email** or **print** it.
**Out of scope for v1:** WhatsApp delivery (planned later via a `wa.me` link; do not build now).

---

## 0. Conventions you MUST follow (this codebase already has strong patterns — match them)

- **Mongo docs:** every collection uses a numeric `id` AND `_id`. Allocate ids with `getNextNumericId(collection)` from `@/lib/db/mongo-utils`. Strip internal fields on read with `stripMongoId`. Use `type FlexDoc` for inserts.
- **Auth:** `const auth = await getAuthUser()` from `@/lib/auth-helpers` → `{ userId, dbUserId, tenantId, email, role, name, assigned_dentist_user_ids }`. Clinical-only writes: guard with `isClinicalRole(auth.role)`.
- **Patient scoping (critical):** resolve the patient's owning dentist with
  `const scope = await resolveClientScopeForClient(auth, clientId)` from `@/lib/client-permissions` → `{ userId, tenantId } | null` (returns `null` ⇒ 404). **All treatment-plan data is keyed by `(tenant_id, user_id = scope.userId, client_id)`** — exactly like the dental feature.
- **Rate limiting:** `checkWriteRateLimit(userId)` (create), `checkUpdateRateLimit(userId)` (patch/delete) from `@/lib/rate-limit`. Return the response if truthy.
- **Responses/errors:** `createSuccessResponse(data, status?)`, `createErrorResponse(msg, status, details?)`, `handleApiError(error, msg)` from `@/lib/error-handler`.
- **Validation:** `zod`. Put schemas in `lib/treatment-plans/schemas.ts` (mirror `lib/dental/schemas.ts`).
- **Caching:** read endpoints may use `getCached(key, ttl, fn)` from `@/lib/redis` with a key from `lib/cache-keys.ts`; writes call `invalidateReadCaches({ tenantId, userId, calendarId? })` from `@/lib/cache-keys`. (Optional for v1 — plans are low-traffic; you can skip caching.)
- **Audit:** call `logDataAccess({...})` from `@/lib/audit` on send/export-type actions (see `gdpr-export/route.ts` for the shape).
- **Storage (R2):** `getStorageProvider()` + `isStorageConfigured()` from `@/lib/storage`. **Reuse the existing patient-files upload path** — see `app/api/clients/[id]/files/route.ts` for the exact upload call and the `client_files` document shape; do not invent new field names.
- **Email:** `sendEmail({ to, subject, html })` from `@/lib/email` (Resend). You will extend it to support attachments (see §7).
- **Reference implementation to copy from:** the **dental feature** is the closest analogue. Mirror its structure:
  - server logic: `lib/server/dental.ts`, `lib/dental/schemas.ts`
  - routes: `app/api/clients/[id]/dental/**`
  - UI tab wiring: `app/clients/[id]/page.tsx` (passes `canEditDental`), `ClientProfileClient.tsx` (tab bar), `app/clients/[id]/dental/**`
  - migration: `migrations/006_dental_chart.js`
- **Indentation/style:** match surrounding files. LF line endings (git will warn about CRLF — ignore).

---

## 1. What the two reference plans contain (data to capture)

Header (branding): clinic wordmark/logo + **doctor line** ("BY DR. ANDREEA NICOLESCU"), optional **specialty line** ("CHIRURG MAXILO FACIAL"). Title "PLAN DE TRATAMENT". Then:
- **Pacient:** (name) · **Data:** (date)
- **Table:** `Nr. crt. | Procedură | Detalii | Cost` — N rows. `Detalii` carries free-text incl. per-unit math (e.g. "4 implanturi MUA × 3.300 lei (3.300 lei/bucată)").
- **RECAPITULARE:** grouped summary lines (procedure → subtotal).
- **TOTAL GENERAL: X LEI**
- Signature block: doctor name (+ specialty), `Semnătură medic` / `Semnătură pacient`.
- Footer disclaimer (standard RO text).

---

## 2. Configured ONCE — Settings ("Plan de tratament" tab)

### 2a. Data: `treatment_plan_settings` (one doc per tenant, upsert)
```
{
  _id, id,                       // numeric
  tenant_id: ObjectId,
  clinic_name: string,           // "CMArt Dent"
  logo_storage_key: string|null, // R2 key of uploaded logo (optional)
  disclaimer: string,            // default text below
  signature_label_doctor: string,   // default "Semnătură medic"
  signature_label_patient: string,  // default "Semnătură pacient"
  currency: string,              // default "lei"
  created_at, updated_at
}
```
Default `disclaimer`:
> "Planul de tratament poate suferi modificări în funcție de evoluția clinică și necesitățile apărute pe parcursul tratamentului."

### 2b. Per-dentist branding (on the `users` doc)
Add optional fields, edited by each clinician for themselves:
- `plan_doctor_subtitle?: string`  → e.g. "BY DR. ANDREEA NICOLESCU"
- `plan_doctor_specialty?: string` → e.g. "CHIRURG MAXILO FACIAL" (optional second line)

### 2c. Settings UI + API
- Add `'treatment-plan'` to `SettingsTabKey` and `SETTINGS_TABS` in `app/settings/settings-tabs.ts` (`clinicalOnly: true`, label "Plan de tratament", href `/settings/treatment-plan`).
- `app/settings/treatment-plan/page.tsx` (server: load settings + current user's subtitle) + a client form component.
  - Owner edits clinic-wide fields (name, logo, disclaimer, signature labels, currency).
  - Every clinician edits their own `plan_doctor_subtitle` / `plan_doctor_specialty`.
- API:
  - `GET /api/settings/treatment-plan` → `{ settings, doctorSubtitle, doctorSpecialty }`
  - `PUT /api/settings/treatment-plan` → upsert clinic settings (**owner only** for clinic fields) + the caller's own subtitle fields.
  - `POST /api/settings/treatment-plan/logo` → upload logo to R2 (reuse storage provider), store `logo_storage_key`. (Owner only.)

---

## 3. Per-patient — the Builder

### 3a. Entry point
- Add a **"Plan de tratament"** tab to the patient profile tab bar in `app/clients/[id]/ClientProfileClient.tsx` (next to "Fișiere"/"Dental").
- In `app/clients/[id]/page.tsx`, compute `const canEditTreatmentPlans = isClinicalRole(auth.role)` and pass it down (mirror the existing `canEditDental` prop, including the early-return branches that also pass the flag).

### 3b. UI (`app/clients/[id]/treatment-plans/`)
- `TreatmentPlansTab.tsx` — lists saved plans for the patient (date, total, status badge draft/sent/accepted) + "Plan nou" button. Each row: open / regenerate PDF / send email / download / delete.
- `PlanBuilder.tsx` — the editor:
  - Auto: patient name; **Data** (defaults to today, editable date input).
  - **Performing doctor** selector (defaults to current dentist; drives subtitle + signature). For a shared-calendar clinic, allow choosing among the tenant's dentists the user may act for.
  - **Line items** (the core requirement):
    - **Service picker** reusing the existing searchable picker pattern from `app/calendar/components/modals/AppointmentModal/sections/ServiceSection.tsx` (services come from the **performing doctor's** catalog via `GET /api/services?dentistUserId=…`). Selecting a service fills `procedure` (name) + `unit_price` (service price).
    - Per row, editable: **Cantitate** (qty, default 1), **Detalii** (free text), **Cost** (line_total — defaults to `qty × unit_price`, but **manually editable**).
    - Add / remove / reorder rows. Allow a fully free-form row (no service) too.
  - **RECAPITULARE**: auto-derived — group rows by `procedure`, sum their `line_total`. Display only (not separately editable).
  - **TOTAL GENERAL**: auto-sum of line totals, with an **editable override** (`total_override`). Final `total = total_override ?? sum`.
  - Actions: **Salvează** (draft), **Generează PDF**, then **Trimite pe email** / **Printează** / **Descarcă**.

---

## 4. Data: `treatment_plans` (per patient)
```
{
  _id, id,                          // numeric
  tenant_id: ObjectId,
  user_id: number,                  // = scope.userId (owning dentist)
  client_id: number,
  doctor_user_id: number,           // performing doctor (signer)
  doctor_name_snapshot: string,     // users.name at creation
  doctor_subtitle_snapshot: string|null,
  doctor_specialty_snapshot: string|null,
  plan_date: string,                // ISO date shown on the plan
  items: Array<{
    service_id: number|null,
    procedure: string,              // snapshot
    details: string,                // free text
    quantity: number,               // >= 1
    unit_price: number,             // snapshot (lei)
    line_total: number              // editable; default qty*unit_price
  }>,
  recap: Array<{ label: string, amount: number }>,  // derived snapshot
  total_override: number|null,
  total: number,                    // final
  currency: string,                 // snapshot ("lei")
  clinic_name_snapshot: string,
  logo_storage_key_snapshot: string|null,
  disclaimer_snapshot: string,
  signature_label_doctor_snapshot: string,
  signature_label_patient_snapshot: string,
  status: 'draft' | 'sent' | 'accepted',
  pdf_file_id: number|null,         // client_files.id of the generated PDF
  sent_at: string|null,
  sent_to_email: string|null,
  created_by_user_id: ObjectId,
  created_at, updated_at,
  deleted_at?: string
}
```
**Why snapshots:** an issued plan must not change if a service price or clinic setting changes later (same rationale as `appointments.price_at_time` and `tooth_events.doctor_name_snapshot`). Snapshot branding + prices + disclaimer at PDF-generation time.

**Indexes** (in the migration):
- `{ tenant_id: 1, client_id: 1, user_id: 1 }`
- `{ tenant_id: 1, client_id: 1, created_at: -1 }`

---

## 5. PDF generation

- **Add dependency:** `@react-pdf/renderer` (server-side renderer, **no Chromium** — safe on Vercel; do NOT use Puppeteer).
- `lib/treatment-plans/pdf.tsx` — a `<Document>` template matching the reference layout: header (logo via R2 signed URL or embedded buffer + clinic name + doctor subtitle/specialty) → "PLAN DE TRATAMENT" → Pacient/Data → table (Nr. crt./Procedură/Detalii/Cost) → RECAPITULARE → TOTAL GENERAL → signatures → disclaimer. Use `StyleSheet` to approximate the serif, bordered, black-header look.
- Export `async function renderTreatmentPlanPdf(plan, { logoBuffer? }): Promise<Buffer>` using `renderToBuffer(<Document/>)`.
- Register a serif font (e.g. bundle a TTF under `public/fonts` or `assets/`) for the heading look; fall back to Helvetica if not added.

**Generate route:** `POST /api/clients/[id]/treatment-plans/[planId]/pdf`
1. auth + clinical role + `resolveClientScopeForClient` + load the plan (scoped).
2. Re-snapshot branding from `treatment_plan_settings` + the doctor's user fields (only if still draft / on first generate).
3. `renderTreatmentPlanPdf(...)` → Buffer.
4. **Upload to R2 and create a `client_files` record** by REUSING the exact logic in `app/api/clients/[id]/files/route.ts` (same storage key scheme, same `client_files` fields: `client_id, tenant_id, storage_key, original_filename, filename, file_size, mime_type, description, created_at`). Set `mime_type: 'application/pdf'`, `original_filename: 'Plan-tratament-<patient>-<date>.pdf'`, `description: 'Plan de tratament'`.
5. Set `treatment_plans.pdf_file_id` to the new file id.
6. Return the updated plan. → The PDF now appears in the patient's **Fișiere** tab automatically (no extra work).

**Download/preview:** reuse the existing scoped routes `GET /api/clients/[id]/files/[fileId]/download` and `/preview`. The builder previews the PDF via the file's preview/download URL (e.g. in an `<iframe>`); "Descarcă" / "Printează" use the download URL.

---

## 6. API routes (all under existing scoping/auth rules)

| Method & path | Purpose |
|---|---|
| `GET /api/clients/[id]/treatment-plans` | list plans for patient |
| `POST /api/clients/[id]/treatment-plans` | create (draft) — validate with `createPlanSchema` |
| `GET /api/clients/[id]/treatment-plans/[planId]` | get one |
| `PATCH /api/clients/[id]/treatment-plans/[planId]` | update items/date/doctor/status (draft only for line edits) |
| `DELETE /api/clients/[id]/treatment-plans/[planId]` | soft-delete (`deleted_at`) and delete the linked file |
| `POST /api/clients/[id]/treatment-plans/[planId]/pdf` | (re)generate PDF → store in Fișiere |
| `POST /api/clients/[id]/treatment-plans/[planId]/send-email` | email the PDF (see §7) |
| `GET/PUT /api/settings/treatment-plan` | settings (see §2c) |
| `POST /api/settings/treatment-plan/logo` | logo upload |

Server logic lives in `lib/server/treatment-plans.ts` (list/get/create/update/softDelete + settings get/upsert), all scoped by `(tenant_id, user_id, client_id)`. Mirror `lib/server/surgery.ts` / `bridges.ts` for the CRUD shape (every query includes the full scope; update/delete via `findOneAndUpdate`/`deleteOne` with the scope filter).

---

## 7. Email delivery

1. **Extend `sendEmail`** in `lib/email.ts` to accept an optional `attachments?: Array<{ filename: string; content: Buffer | string }>` and pass them to Resend: `resend.emails.send({ from, to, subject, html, attachments })`. Resend expects each attachment as `{ filename, content }` where `content` is a base64 string or Buffer. Keep the existing signature backward-compatible (attachments optional).
2. **`POST /api/clients/[id]/treatment-plans/[planId]/send-email`**:
   - auth + clinical role + scope + load plan; require `pdf_file_id` (generate first if missing).
   - Body: `{ to?: string }` (defaults to the patient's email; 400 if neither present).
   - Fetch the PDF bytes from R2 (`storage` provider) → pass as attachment.
   - Subject e.g. `"Plan de tratament — <clinic_name>"`; short HTML body (clinic name + greeting + "găsiți atașat planul de tratament").
   - On success: set `status: 'sent'`, `sent_at`, `sent_to_email`; `logDataAccess({... targetType: 'client.treatment_plan_email' ...})`.
   - Rate-limit with `checkWriteRateLimit`.

---

## 8. Security & permissions
- Every route: `getAuthUser()` → `resolveClientScopeForClient(auth, clientId)` (404 if null) → writes also require `isClinicalRole(auth.role)` (403 otherwise) → rate limit → zod validation.
- The generated PDF is a `client_files` record, so it inherits the existing file access scoping (download/preview routes already enforce tenant/user/client).
- Settings: clinic-wide fields = **owner only**; each clinician edits **only their own** subtitle/specialty.
- No public/unauthenticated routes in v1 (WhatsApp deferred — that's the only thing that would have needed a tokenized public link).

---

## 9. GDPR (do not skip — keep parity with dental)
- **Export** (`app/api/clients/[id]/gdpr-export/route.ts`): add `treatment_plans` (by `{ client_id, tenant_id }`, exclude soft-deleted) to the export payload (items, totals, status, dates, doctor name). The PDFs are `client_files` and are already exported under `files`.
- **Erase** (`app/api/clients/[id]/gdpr-erase/route.ts`): add `db.collection('treatment_plans').deleteMany({ client_id, tenant_id })` to the cascade. The PDF files are already removed via the `client_files` cascade.
- Add `'treatment_plans'` and `'treatment_plan_settings'` to the tenant-scoped purge lists in `scripts/create-test-tenant.js` and `scripts/seed-demo-clinic.js` (`TENANT_SCOPED` arrays).

---

## 10. Files to CREATE
```
migrations/009_treatment_plans.js                 # collections + indexes (copy 006 pattern)
lib/treatment-plans/schemas.ts                    # zod: createPlan, updatePlan, settings
lib/server/treatment-plans.ts                     # CRUD + settings, scoped
lib/treatment-plans/pdf.tsx                       # @react-pdf/renderer template + renderToBuffer
app/api/clients/[id]/treatment-plans/route.ts                 # GET list / POST create
app/api/clients/[id]/treatment-plans/[planId]/route.ts        # GET / PATCH / DELETE
app/api/clients/[id]/treatment-plans/[planId]/pdf/route.ts    # POST generate PDF
app/api/clients/[id]/treatment-plans/[planId]/send-email/route.ts  # POST email
app/api/settings/treatment-plan/route.ts          # GET / PUT settings
app/api/settings/treatment-plan/logo/route.ts     # POST logo upload
app/settings/treatment-plan/page.tsx              # settings page (server)
app/settings/treatment-plan/TreatmentPlanSettingsClient.tsx
app/settings/treatment-plan/treatment-plan.module.css
app/clients/[id]/treatment-plans/TreatmentPlansTab.tsx
app/clients/[id]/treatment-plans/PlanBuilder.tsx
app/clients/[id]/treatment-plans/treatment-plans.module.css
```

## 11. Files to MODIFY
```
package.json                                       # add @react-pdf/renderer
lib/email.ts                                       # add optional attachments
app/settings/settings-tabs.ts                      # add 'treatment-plan' tab (clinicalOnly)
app/clients/[id]/page.tsx                          # compute + pass canEditTreatmentPlans
app/clients/[id]/ClientProfileClient.tsx           # add "Plan de tratament" tab
app/api/clients/[id]/gdpr-export/route.ts          # include treatment_plans
app/api/clients/[id]/gdpr-erase/route.ts           # cascade-delete treatment_plans
scripts/create-test-tenant.js                      # TENANT_SCOPED += treatment_plans, treatment_plan_settings
scripts/seed-demo-clinic.js                        # TENANT_SCOPED += same (and optionally seed a sample plan)
```

---

## 12. Phasing (ship incrementally; each phase typechecks + builds)
1. **Data + settings:** migration, schemas, `treatment_plan_settings`, settings tab/page/API (incl. logo + per-dentist subtitle).
2. **Builder + persistence:** patient tab, `PlanBuilder`, plans CRUD routes, save draft.
3. **PDF:** add `@react-pdf/renderer`, template, generate route, store into Fișiere, in-app preview/print/download.
4. **Email:** `sendEmail` attachments + send-email route + status tracking.
5. **GDPR + seeds:** export/erase + purge lists.

---

## 13. Acceptance criteria
- [ ] A dentist can open a patient → "Plan de tratament" → "Plan nou", add rows from the service catalog with qty + comment, edit a line cost, override the total, and **Salvează** (draft persists, scoped to the patient's dentist).
- [ ] **Generează PDF** produces a branded PDF matching the reference layout (header/doctor subtitle, table, recapitulare, total, signatures, disclaimer) and it **appears in the patient's Fișiere** tab.
- [ ] **Trimite pe email** emails the PDF as an attachment to the patient's email; plan status flips to **sent** with `sent_at`.
- [ ] **Printează / Descarcă** open the stored PDF.
- [ ] Settings: clinic name/logo/disclaimer/signature labels (owner) + each dentist's own subtitle/specialty persist and appear on generated PDFs.
- [ ] Receptionist/asistent: can view plans they have client access to but **cannot** create/edit/send (403) unless clinical; owner edits clinic settings only.
- [ ] GDPR export includes treatment plans; GDPR erase removes them + their PDF files. `--cleanup` of the demo/test tenant removes the new collections.
- [ ] `npx tsc --noEmit` passes; `npm run build` passes.

---

## 14. Open assumptions (flag to product owner if any are wrong)
- PDF engine = `@react-pdf/renderer` (template rebuilt in its primitives, not HTML/CSS).
- RECAPITULARE is auto-derived (grouped by procedure), not separately editable.
- Total override is allowed (free-text final amount).
- Logo upload is optional; text wordmark (clinic_name) is the fallback.
- WhatsApp deferred. When added later: generate a tokenized **public** download link for the stored PDF and open `https://wa.me/<phone>?text=<message + link>` — no new provider needed.
