/**
 * Validation schemas using Zod
 * Centralized validation for all API endpoints
 */

import { z } from 'zod';
import { CATEGORY_COLOR_PALETTE } from '@/lib/calendar-color-policy';

export const tenantUserRoleSchema = z.enum(['owner', 'dentist', 'receptionist', 'asistent']);

// Common validation patterns
export const emailSchema = z.string().email('Invalid email format').toLowerCase().trim();
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color format');
// Known appointment category keys — must stay in sync with CATEGORY_CONFIG in lib/calendar-color-policy.ts
export const APPOINTMENT_CATEGORY_KEYS = ['consultatie', 'tratament', 'control', 'urgenta', 'altele'] as const;
const appointmentCategorySchema = z.string().trim().min(1).max(80);
const categoryPaletteHexes = CATEGORY_COLOR_PALETTE.map((color) => color.hex) as [string, ...string[]];
const appointmentCategoryColorSchema = z.enum(categoryPaletteHexes);
const phoneSchema = z.string()
  .regex(/^[\d\s\+\-\(\)]+$/, 'Invalid phone format')
  .refine((value) => {
    const digitCount = value.replace(/\D/g, '').length;
    return digitCount >= 7 && digitCount <= 15;
  }, 'Invalid phone length')
  .optional();
const dateTimeSchema = z.string().datetime().or(z.date());

// Conversation schemas
export const createConversationSchema = z.object({
  channel: z.enum(['email', 'facebook', 'form', 'sms', 'whatsapp']).default('email'),
  channelId: z.string().optional(),
  contactName: z.string().min(1, 'Contact name is required').max(255),
  contactEmail: emailSchema.optional(),
  contactPhone: phoneSchema,
  subject: z.string().max(500).optional(),
  initialMessage: z.string().optional(),
});

export const updateConversationSchema = z.object({
  contactName: z.string().min(1).max(255).optional(),
  contactEmail: emailSchema.optional(),
  contactPhone: phoneSchema,
  subject: z.string().max(500).optional(),
  clientId: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
});

// Message schemas
export const createMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required'),
  direction: z.enum(['inbound', 'outbound']).default('outbound'),
});

// Appointment schemas
//
// `serviceIds: number[]` is the source of truth (length >= 1). `serviceId`
// (singular) is accepted as a back-compat alias from older clients — the
// route handlers normalize it to `[serviceId]` before further processing.
const serviceIdsArraySchema = z.array(z.number().int().positive()).min(1).max(10);

export const createAppointmentSchema = z.object({
  conversationId: z.number().int().positive().optional(),
  calendarId: z.number().int().positive().optional(),
  dentistUserId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  serviceIds: serviceIdsArraySchema.optional(),
  clientId: z.number().int().positive().nullable().optional(),
  clientName: z.string().min(1, 'Client name is required').max(255).optional(),
  clientEmail: emailSchema.optional(),
  clientPhone: phoneSchema,
  forceNewClient: z.boolean().optional(),
  startTime: dateTimeSchema,
  endTime: dateTimeSchema.optional(), // Will be calculated if not provided
  category: appointmentCategorySchema.optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  color: hexColorSchema.optional(),
  notes: z.string().max(2000).optional(),
  exportToGoogle: z.boolean().optional().default(false),
  googleAccessToken: z.string().optional(),
}).strict().refine(
  (data) => data.serviceId !== undefined || (data.serviceIds && data.serviceIds.length > 0),
  { message: 'Cel putin un serviciu este obligatoriu', path: ['serviceIds'] }
).refine(
  (data) => typeof data.clientId === 'number' || Boolean(data.clientName?.trim()),
  { message: 'Client name is required when clientId is not provided', path: ['clientName'] }
);

export const updateAppointmentSchema = z.object({
  startTime: dateTimeSchema.optional(),
  endTime: dateTimeSchema.optional(),
  dentistUserId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  serviceIds: serviceIdsArraySchema.optional(),
  clientId: z.number().int().positive().nullable().optional(),
  clientName: z.string().min(1).max(255).optional(),
  clientEmail: emailSchema.optional(),
  clientPhone: phoneSchema,
  forceNewClient: z.boolean().optional(),
  category: appointmentCategorySchema.optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  color: hexColorSchema.optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurrence: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().positive().default(1),
    endType: z.enum(['date', 'count']).optional(),
    endDate: z.string().date().optional(),
    count: z.number().int().positive().max(52).optional(),
  }).strict().optional().nullable(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional(),
  notes: z.string().max(2000).optional(),
  /**
   * Scope of the edit when this appointment belongs to a recurring series.
   * - 'this'   (default): only this occurrence is updated
   * - 'series': all occurrences in the same recurrence_group_id are updated
   *   for non-time fields (serviceIds, notes, category, status, client info).
   *   Time fields (startTime/endTime) always stay per-instance — the server
   *   ignores them for series-wide updates and returns a warning.
   */
  scope: z.enum(['this', 'series']).optional(),
}).strict();

const calendarPermissionsSchema = z
  .object({
    can_view: z.boolean().optional().default(true),
    can_create: z.boolean().optional().default(false),
    can_edit_own: z.boolean().optional().default(false),
    can_edit_all: z.boolean().optional().default(false),
    can_delete_own: z.boolean().optional().default(false),
    can_delete_all: z.boolean().optional().default(false),
  })
  .strict()
  .transform((permissions) => ({
    ...permissions,
    can_view: true,
  }));

const DENTIST_COLOR_IDS = ['blue', 'pink', 'green', 'purple', 'orange', 'teal', 'amber', 'red'] as const;
const dentistColorIdSchema = z.enum(DENTIST_COLOR_IDS);

export const createCalendarSchema = z.object({
  name: z.string().min(1, 'Calendar name is required').max(255),
}).strict();

export const updateCalendarSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color_mine: dentistColorIdSchema.optional(),
}).strict();

export const createAvailabilityBlockSchema = z.object({
  typeLabel: z.string().trim().min(1, 'Tipul este obligatoriu').max(80),
  reason: z.string().trim().max(1000).optional().nullable(),
  startTime: dateTimeSchema,
  endTime: dateTimeSchema,
  allDay: z.boolean().optional().default(false),
}).strict();

export const updateAvailabilityBlockSchema = z.object({
  typeLabel: z.string().trim().min(1, 'Tipul este obligatoriu').max(80).optional(),
  reason: z.string().trim().max(1000).optional().nullable(),
  startTime: dateTimeSchema.optional(),
  endTime: dateTimeSchema.optional(),
  allDay: z.boolean().optional(),
}).strict();

export const availabilityBlocksQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  calendarIds: z
    .string()
    .trim()
    .regex(/^\d+(,\d+)*$/, 'Invalid calendarIds')
    .transform((value) => value.split(',').map((item) => Number.parseInt(item, 10)))
    .optional(),
});

export const createCalendarShareSchema = z.object({
  email: emailSchema,
  permissions: calendarPermissionsSchema,
});

export const updateCalendarShareSchema = z.object({
  permissions: calendarPermissionsSchema.optional(),
  dentist_color: dentistColorIdSchema.optional().nullable(),
});

const recurrenceSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().positive().default(1),
    endType: z.enum(['date', 'count']).optional(),
    endDate: z.string().date().optional(),
    count: z.number().int().positive().max(52).optional(),
  })
  .strict();

export const createRecurringAppointmentSchema = z
  .object({
    calendarId: z.number().int().positive().optional(),
    dentistUserId: z.number().int().positive().optional(),
    serviceId: z.number().int().positive().optional(),
    serviceIds: serviceIdsArraySchema.optional(),
    clientId: z.number().int().positive().nullable().optional(),
    clientName: z.string().min(1, 'Client name is required').max(255).optional(),
    clientEmail: emailSchema.optional(),
    clientPhone: phoneSchema,
    startTime: dateTimeSchema,
    endTime: dateTimeSchema,
    notes: z.string().max(2000).optional(),
    category: appointmentCategorySchema.optional().nullable(),
    categoryId: z.number().int().positive().optional().nullable(),
    color: hexColorSchema.optional(),
    recurrence: recurrenceSchema,
    forceNewClient: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => data.serviceId !== undefined || (data.serviceIds && data.serviceIds.length > 0),
    { message: 'Cel putin un serviciu este obligatoriu', path: ['serviceIds'] }
  )
  .refine(
    (data) => typeof data.clientId === 'number' || Boolean(data.clientName?.trim()),
    { message: 'Client name is required when clientId is not provided', path: ['clientName'] }
  );

// Client schemas
const consentMethodEnum = z.enum(['digital_signature', 'scanned_document', 'paper_on_file']);

export const createClientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: emailSchema.optional(),
  phone: phoneSchema,
  notes: z.string().max(5000).optional(),
  consent_given: z.boolean().optional(),
  consent_date: z.string().datetime().optional(),
  consent_method: consentMethodEnum.optional(),
  is_minor: z.boolean().optional(),
  parent_guardian_name: z.string().max(255).optional(),
  dentistUserId: z.number().int().positive().optional(),
  // When true, skip the existing-by-name match in findOrCreateClient and
  // always insert a new record. Used by the /clients/new flow after the
  // user confirms they want a duplicate despite a same-name match.
  forceNew: z.boolean().optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  notes: z.string().max(5000).optional(),
  consent_given: z.boolean().optional(),
  consent_date: z.string().datetime().optional(),
  consent_method: consentMethodEnum.optional(),
  consent_withdrawn: z.boolean().optional(),
  is_minor: z.boolean().optional(),
  parent_guardian_name: z.string().max(255).optional(),
});

// Service schemas
export const createServiceSchema = z.object({
  name: z.string().min(1, 'Service name is required').max(255),
  durationMinutes: z.number().int().positive('Duration must be positive'),
  price: z.number().nonnegative('Price cannot be negative').optional(),
  description: z.string().max(2000).optional(),
  dentistUserId: z.number().int().positive().optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  durationMinutes: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  description: z.string().max(2000).optional(),
});

export const createAppointmentCategorySchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(50),
  color: appointmentCategoryColorSchema,
  dentistUserId: z.number().int().positive().optional(),
});

export const updateAppointmentCategorySchema = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  color: appointmentCategoryColorSchema.optional(),
  position: z.number().int().nonnegative().optional(),
});

// Yahoo sync schema
export const yahooSyncSchema = z.object({
  todayOnly: z.boolean().optional().default(false),
  since: dateTimeSchema.optional(),
  markAsRead: z.boolean().optional().default(false),
});

// Yahoo send schema
export const yahooSendSchema = z.object({
  to: emailSchema,
  subject: z.string().min(1, 'Subject is required').max(500),
  text: z.string().min(1, 'Message text is required'),
  html: z.string().optional(),
});

// Query parameter schemas
export const appointmentsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  calendarIds: z
    .string()
    .trim()
    .regex(/^\d+(,\d+)*$/, 'Invalid calendarIds')
    .transform((value) => value.split(',').map((item) => Number.parseInt(item, 10)))
    .optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional(),
  search: z.string().max(120).optional(),
});

export const conversationsQuerySchema = z.object({
  search: z.string().max(120).optional(),
});

export const dashboardQuerySchema = z.object({
  days: z.string().regex(/^\d+$/).transform(Number).optional().default('7'),
});

export const calendarSlotsQuerySchema = z.object({
  date: z.string().datetime().optional(),
});

export const remindersQuerySchema = z.object({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
});

// Client note schema
export const createNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required').max(5000),
});

// Team invite schema
export const inviteTeamMemberSchema = z.object({
  email: emailSchema,
  name: z.string().min(1, 'Name is required').max(255),
  role: tenantUserRoleSchema.exclude(['owner']).default('dentist'),
  assigned_dentist_user_ids: z.array(z.number().int().positive()).optional(),
});

// Email integration schemas
export const createYahooIntegrationSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// Route parameter validation schemas
export const integrationIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Integration ID must be a number').transform((val) => parseInt(val, 10)),
});
