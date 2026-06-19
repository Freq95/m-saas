import { z } from 'zod';

export const TREATMENT_PLAN_STATUSES = ['draft', 'sent', 'accepted'] as const;

const moneySchema = z.coerce.number().min(0).max(100000000);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const treatmentPlanItemSchema = z.object({
  service_id: z.coerce.number().int().positive().nullable().optional().default(null),
  procedure: z.string().trim().min(1, 'Procedura este obligatorie').max(300),
  details: z.string().trim().max(2000).optional().default(''),
  quantity: z.coerce.number().min(1).max(999).default(1),
  unit_price: moneySchema.default(0),
  // null/omitted ⇒ derive from quantity × unit_price; an explicit value
  // (including 0 for a complimentary line) is honored verbatim.
  line_total: moneySchema.nullable().optional().default(null),
});

export const createPlanSchema = z.object({
  doctor_user_id: z.coerce.number().int().positive().optional(),
  plan_date: isoDateSchema.optional(),
  items: z.array(treatmentPlanItemSchema).max(80).optional().default([]),
  total_override: moneySchema.nullable().optional().default(null),
});

export const updatePlanSchema = z.object({
  doctor_user_id: z.coerce.number().int().positive().optional(),
  plan_date: isoDateSchema.optional(),
  items: z.array(treatmentPlanItemSchema).max(80).optional(),
  total_override: moneySchema.nullable().optional(),
  status: z.enum(TREATMENT_PLAN_STATUSES).optional(),
});

export const treatmentPlanSettingsSchema = z.object({
  clinic_name: z.string().trim().min(1).max(160).optional(),
  disclaimer: z.string().trim().min(1).max(2000).optional(),
  signature_label_doctor: z.string().trim().min(1).max(120).optional(),
  signature_label_patient: z.string().trim().min(1).max(120).optional(),
  currency: z.string().trim().min(1).max(12).optional(),
  doctorSubtitle: z.string().trim().max(160).nullable().optional(),
  doctorSpecialty: z.string().trim().max(160).nullable().optional(),
});

export const sendTreatmentPlanEmailSchema = z.object({
  to: z.string().trim().email().optional(),
  message: z.string().trim().max(1000).optional(),
  attachPdf: z.coerce.boolean().optional().default(false),
  // Optional already-issued share token to reuse (so copy/WhatsApp/email share
  // one link instead of reissuing and invalidating a link already sent).
  token: z.string().trim().max(200).optional(),
});

export const shareTreatmentPlanSchema = z.object({
  // 'link' just ensures a PDF + share link exist (for copy / building a wa.me
  // URL client-side); 'whatsapp' additionally marks the plan as sent.
  action: z.enum(['link', 'whatsapp']),
  // An already-issued token to reuse, so copy/WhatsApp/email share one link.
  token: z.string().trim().max(200).optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type TreatmentPlanItemInput = z.infer<typeof treatmentPlanItemSchema>;
export type TreatmentPlanSettingsInput = z.infer<typeof treatmentPlanSettingsSchema>;
