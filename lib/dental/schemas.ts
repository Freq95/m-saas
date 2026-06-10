import { z } from 'zod';
import {
  fdiIsValid,
  ISSUE_TYPES,
  SEVERITIES,
  SURFACES,
  TOOTH_STATUSES,
  EVENT_ACTIONS,
  type IssueType,
  type Severity,
  type Surface,
  type ToothStatus,
  type EventAction,
} from '@/lib/dental/constants';

// Zod 3 needs a mutable tuple for z.enum; the readonly arrays above are kept
// for typing precision elsewhere. Cast through a typed mutable tuple so output
// types preserve the literal union (not just `string`).
// FDI accepts both permanent (11–48) and deciduous (51–85) numbering.
const fdiSchema = z
  .number()
  .int()
  .refine(fdiIsValid, { message: 'Invalid FDI tooth number' });

const surfaceSchema = z.enum([...SURFACES] as [Surface, ...Surface[]]);
const issueTypeSchema = z.enum([...ISSUE_TYPES] as [IssueType, ...IssueType[]]);
const severitySchema = z.enum([...SEVERITIES] as [Severity, ...Severity[]]);
const statusSchema = z.enum([...TOOTH_STATUSES] as [ToothStatus, ...ToothStatus[]]);
const actionSchema = z.enum([...EVENT_ACTIONS] as [EventAction, ...EventAction[]]);

export const createDentalEventSchema = z.object({
  tooth_fdi: fdiSchema,
  surfaces: z.array(surfaceSchema).max(5).default([]),
  issue_type: issueTypeSchema,
  severity: severitySchema.optional(),
  action: actionSchema.default('diagnosed'),
  occurred_at: z.string().datetime().optional(), // server fills if missing
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateDentalEventSchema = z.object({
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurred_at: z.string().datetime().optional(),
  severity: severitySchema.optional(),
  action: actionSchema.optional(),
});

export const updateToothStatusSchema = z.object({
  status: statusSchema,
});

export type CreateDentalEventInput = z.infer<typeof createDentalEventSchema>;
export type UpdateDentalEventInput = z.infer<typeof updateDentalEventSchema>;
export type UpdateToothStatusInput = z.infer<typeof updateToothStatusSchema>;

// ── Surgery groups (multi-tooth annotations) ──────────────────────────────────

export const createSurgeryGroupSchema = z.object({
  tooth_fdis: z
    .array(fdiSchema)
    .min(1, 'Selectează cel puțin un dinte')
    .max(16, 'Maxim 16 dinți într-o intervenție'),
  comment: z.string().trim().min(1, 'Adaugă un comentariu').max(500),
});

export const updateSurgeryGroupSchema = z.object({
  tooth_fdis: z.array(fdiSchema).min(1).max(16).optional(),
  comment: z.string().trim().min(1).max(500).optional(),
});

export type CreateSurgeryGroupInput = z.infer<typeof createSurgeryGroupSchema>;
export type UpdateSurgeryGroupInput = z.infer<typeof updateSurgeryGroupSchema>;

// ── Bridge groups (multi-tooth dental bridges) ────────────────────────────────

export const createBridgeGroupSchema = z.object({
  tooth_fdis: z
    .array(fdiSchema)
    .min(2, 'O punte trebuie să cuprindă cel puțin 2 dinți')
    .max(8, 'Maxim 8 dinți într-o punte'),
  comment: z.string().trim().max(500).optional().default(''),
});

export const updateBridgeGroupSchema = z.object({
  tooth_fdis: z.array(fdiSchema).min(2).max(8).optional(),
  comment: z.string().trim().max(500).optional(),
});

export type CreateBridgeGroupInput = z.infer<typeof createBridgeGroupSchema>;
export type UpdateBridgeGroupInput = z.infer<typeof updateBridgeGroupSchema>;
