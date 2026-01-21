/**
 * Validation schemas using Zod
 * Centralized validation for all API endpoints
 */

import { z } from 'zod';

// Common validation patterns
export const emailSchema = z.string().email('Invalid email format').toLowerCase().trim();
export const phoneSchema = z.string().regex(/^[\d\s\+\-\(\)]+$/, 'Invalid phone format').optional();
export const dateTimeSchema = z.string().datetime().or(z.date());

// Conversation schemas
export const createConversationSchema = z.object({
  userId: z.number().int().positive().optional().default(1),
  channel: z.enum(['email', 'facebook', 'form', 'sms', 'whatsapp']).default('email'),
  channelId: z.string().optional(),
  contactName: z.string().min(1, 'Contact name is required').max(255),
  contactEmail: emailSchema.optional(),
  contactPhone: phoneSchema,
  subject: z.string().max(500).optional(),
  initialMessage: z.string().optional(),
});

export const updateConversationSchema = z.object({
  status: z.enum(['open', 'closed', 'pending']).optional(),
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
  userId: z.number().int().positive().optional().default(1),
  conversationId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive(),
  clientName: z.string().min(1, 'Client name is required').max(255),
  clientEmail: emailSchema.optional(),
  clientPhone: phoneSchema,
  startTime: dateTimeSchema,
  endTime: dateTimeSchema.optional(), // Will be calculated if not provided
  notes: z.string().max(2000).optional(),
  exportToGoogle: z.boolean().optional().default(false),
  googleAccessToken: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  serviceId: z.number().int().positive().optional(),
  clientName: z.string().min(1).max(255).optional(),
  clientEmail: emailSchema.optional(),
  clientPhone: phoneSchema,
  startTime: dateTimeSchema.optional(),
  endTime: dateTimeSchema.optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
  notes: z.string().max(2000).optional(),
});

// Client schemas
export const createClientSchema = z.object({
  userId: z.number().int().positive().optional().default(1),
  name: z.string().min(1, 'Name is required').max(255),
  email: emailSchema.optional(),
  phone: phoneSchema,
  source: z.enum(['email', 'facebook', 'form', 'walk-in', 'unknown']).default('unknown'),
  status: z.enum(['lead', 'active', 'inactive', 'vip']).default('lead'),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().max(5000).optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  source: z.enum(['email', 'facebook', 'form', 'walk-in', 'unknown']).optional(),
  status: z.enum(['lead', 'active', 'inactive', 'vip']).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
});

// Service schemas
export const createServiceSchema = z.object({
  userId: z.number().int().positive().optional().default(1),
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
  userId: z.number().int().positive().optional().default(1),
  todayOnly: z.boolean().optional().default(false),
  since: dateTimeSchema.optional(),
});

// Yahoo send schema
export const yahooSendSchema = z.object({
  to: emailSchema,
  subject: z.string().min(1, 'Subject is required').max(500),
  text: z.string().min(1, 'Message text is required'),
  html: z.string().optional(),
});

// Form webhook schema
export const formWebhookSchema = z.object({
  userId: z.number().int().positive().optional().default(1),
  name: z.string().max(255).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  message: z.string().min(1, 'Message is required'),
  subject: z.string().max(500).optional(),
});

