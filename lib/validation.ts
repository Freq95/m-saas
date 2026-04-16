/**
 * Validation schemas using Zod
 * Centralized validation for all API endpoints
 */

import { z } from 'zod';

// Common validation patterns
export const emailSchema = z.string().email('Invalid email format').toLowerCase().trim();
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color format');
// Known appointment category keys — must stay in sync with CATEGORY_CONFIG in lib/calendar-color-policy.ts
const APPOINTMENT_CATEGORY_KEYS = ['consultatie', 'tratament', 'control', 'urgenta', 'altele'] as const;
const appointmentCategorySchema = z.enum(APPOINTMENT_CATEGORY_KEYS);
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
export const createAppointmentSchema = z.object({
  conversationId: z.number().int().positive().optional(),
  calendarId: z.number().int().positive().optional(),
  dentistUserId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive(),
  clientId: z.number().int().positive().nullable().optional(),
  clientName: z.string().min(1, 'Client name is required').max(255),
  clientEmail: emailSchema.optional(),
  clientPhone: phoneSchema,
  forceNewClient: z.boolean().optional(),
  startTime: dateTimeSchema,
  endTime: dateTimeSchema.optional(), // Will be calculated if not provided
  category: appointmentCategorySchema.optional(),
  color: hexColorSchema.optional(),
  notes: z.string().max(2000).optional(),
  exportToGoogle: z.boolean().optional().default(false),
  googleAccessToken: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  startTime: dateTimeSchema.optional(),
  endTime: dateTimeSchema.optional(),
  serviceId: z.number().int().positive().optional(),
  clientId: z.number().int().positive().nullable().optional(),
  clientName: z.string().min(1).max(255).optional(),
  clientEmail: emailSchema.optional(),
  clientPhone: phoneSchema,
  forceNewClient: z.boolean().optional(),
  category: appointmentCategorySchema.optional().nullable(),
  color: hexColorSchema.optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurrence: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().positive().default(1),
    endType: z.enum(['date', 'count']).optional(),
    endDate: z.string().date().optional(),
    end_date: z.string().date().optional(),
    count: z.number().int().positive().max(52).optional(),
  }).strict().optional().nullable(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional(),
  notes: z.string().max(2000).optional(),
});

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

export const createCalendarSchema = z.object({
  name: z.string().min(1, 'Calendar name is required').max(255),
  color_mine: hexColorSchema.optional(),
  color_others: hexColorSchema.optional(),
});

export const updateCalendarSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color_mine: hexColorSchema.optional(),
  color_others: hexColorSchema.optional(),
});

export const createCalendarShareSchema = z.object({
  email: emailSchema,
  permissions: calendarPermissionsSchema,
});

export const updateCalendarShareSchema = z.object({
  permissions: calendarPermissionsSchema.optional(),
});

const recurrenceSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().positive().default(1),
    endType: z.enum(['date', 'count']).optional(),
    endDate: z.string().date().optional(),
    end_date: z.string().date().optional(),
    count: z.number().int().positive().max(52).optional(),
  })
  .strict();

export const createRecurringAppointmentSchema = z
  .object({
    calendarId: z.number().int().positive().optional(),
    dentistUserId: z.number().int().positive().optional(),
    serviceId: z.number().int().positive(),
    clientId: z.number().int().positive().nullable().optional(),
    clientName: z.string().min(1, 'Client name is required').max(255),
    clientEmail: emailSchema.optional(),
    clientPhone: phoneSchema,
    startTime: dateTimeSchema,
    endTime: dateTimeSchema,
    notes: z.string().max(2000).optional(),
    category: appointmentCategorySchema.optional(),
    color: hexColorSchema.optional(),
    recurrence: recurrenceSchema,
    forceNewClient: z.boolean().optional(),
  })
  .strict();

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
});

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  durationMinutes: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  description: z.string().max(2000).optional(),
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
