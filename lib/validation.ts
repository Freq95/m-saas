/**
 * Validation schemas using Zod
 * Centralized validation for all API endpoints
 */

import { z } from 'zod';

// Common validation patterns
export const emailSchema = z.string().email('Invalid email format').toLowerCase().trim();
const phoneSchema = z.string().regex(/^[\d\s\+\-\(\)]+$/, 'Invalid phone format').optional();
const dateTimeSchema = z.string().datetime().or(z.date());

// Conversation schemas
export const createConversationSchema = z.object({
  userId: z.number().int().positive().optional(),
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
  userId: z.number().int().positive().optional(),
  conversationId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive(),
  clientName: z.string().min(1, 'Client name is required').max(255),
  clientEmail: emailSchema.optional(),
  clientPhone: phoneSchema,
  startTime: dateTimeSchema,
  endTime: dateTimeSchema.optional(), // Will be calculated if not provided
  providerId: z.number().int().positive().optional(),
  resourceId: z.number().int().positive().optional(),
  category: z.string().max(120).optional(),
  color: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  exportToGoogle: z.boolean().optional().default(false),
  googleAccessToken: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  startTime: dateTimeSchema.optional(),
  endTime: dateTimeSchema.optional(),
  serviceId: z.number().int().positive().optional(),
  clientName: z.string().min(1).max(255).optional(),
  clientEmail: emailSchema.optional(),
  clientPhone: phoneSchema,
  providerId: z.number().int().positive().optional().nullable(),
  resourceId: z.number().int().positive().optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  color: z.string().max(120).optional().nullable(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional(),
  notes: z.string().max(2000).optional(),
});

// Client schemas
export const createClientSchema = z.object({
  userId: z.number().int().positive().optional(),
  name: z.string().min(1, 'Name is required').max(255),
  email: emailSchema.optional(),
  phone: phoneSchema,
  notes: z.string().max(5000).optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  notes: z.string().max(5000).optional(),
});

// Service schemas
export const createServiceSchema = z.object({
  userId: z.number().int().positive().optional(),
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
  userId: z.number().int().positive().optional(),
  todayOnly: z.boolean().optional().default(false),
  since: dateTimeSchema.optional(),
  enableAiTagging: z.boolean().optional().default(false),
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
export const userIdQuerySchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const appointmentsQuerySchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  providerId: z.string().regex(/^\d+$/).transform(Number).optional(),
  resourceId: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional(),
  search: z.string().max(120).optional(),
});

export const servicesQuerySchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const conversationsQuerySchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().max(120).optional(),
});

export const dashboardQuerySchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  days: z.string().regex(/^\d+$/).transform(Number).optional().default('7'),
});

export const calendarSlotsQuerySchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  date: z.string().datetime().optional(),
  providerId: z.string().regex(/^\d+$/).transform(Number).optional(),
  resourceId: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const tasksQuerySchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  contactId: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.enum(['open', 'completed', 'cancelled']).optional(),
});

export const remindersQuerySchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number).optional(),
  status: z.enum(['pending', 'sent', 'failed']).optional(),
});

// Client note schema
export const createNoteSchema = z.object({
  userId: z.number().int().positive(),
  content: z.string().min(1, 'Note content is required').max(5000),
});

// Task update schema
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(['open', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

// Email integration schemas
export const createYahooIntegrationSchema = z.object({
  userId: z.number().int().positive().optional(),
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// Route parameter validation schemas
export const integrationIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Integration ID must be a number').transform((val) => parseInt(val, 10)),
});

