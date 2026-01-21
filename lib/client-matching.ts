/**
 * Client Matching and Management
 * Handles finding or creating clients based on contact information
 */

import { getDb } from './db';

export interface Client {
  id: number;
  user_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  source: string; // 'email', 'facebook', 'form', 'walk-in', 'unknown'
  status: string; // 'lead', 'active', 'inactive', 'vip'
  tags: string[];
  notes: string | null;
  total_spent: number;
  total_appointments: number;
  last_appointment_date: Date | null;
  last_conversation_date: Date | null;
  first_contact_date: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Find or create a client based on contact information
 * Matching priority:
 * 1. Email exact match (highest priority)
 * 2. Phone exact match
 * 3. Name fuzzy match (if email/phone are missing)
 * 4. Create new client if no match found
 */
export async function findOrCreateClient(
  userId: number,
  name: string,
  email?: string,
  phone?: string,
  source: string = 'unknown'
): Promise<Client> {
  const db = getDb();
  
  // Normalize email and phone
  const normalizedEmail = email?.toLowerCase().trim() || null;
  
  // Improved phone normalization - handles various formats
  let normalizedPhone: string | null = null;
  if (phone) {
    // Remove all non-digit characters except +
    let cleaned = phone.trim().replace(/[^\d+]/g, '');
    
    // Handle Romanian phone numbers
    // +40, 0040, 0 prefix -> normalize to +40
    if (cleaned.startsWith('0040')) {
      cleaned = '+40' + cleaned.substring(4);
    } else if (cleaned.startsWith('40') && !cleaned.startsWith('+40')) {
      cleaned = '+40' + cleaned.substring(2);
    } else if (cleaned.startsWith('0') && cleaned.length > 1) {
      cleaned = '+40' + cleaned.substring(1);
    } else if (!cleaned.startsWith('+') && cleaned.length > 0) {
      // If no country code, assume Romanian
      cleaned = '+40' + cleaned;
    }
    
    normalizedPhone = cleaned || null;
  }
  
  const normalizedName = name.trim();
  
  // Try to find existing client
  let existingClient: Client | null = null;
  
  // Priority 1: Match by email (if provided)
  if (normalizedEmail) {
    const emailResult = await db.query(
      `SELECT * FROM clients 
       WHERE user_id = $1 AND LOWER(email) = LOWER($2) 
       LIMIT 1`,
      [userId, normalizedEmail]
    );
    
    if (emailResult.rows.length > 0) {
      existingClient = emailResult.rows[0] as Client;
    }
  }
  
  // Priority 2: Match by phone (if email match failed and phone provided)
  if (!existingClient && normalizedPhone) {
    const phoneResult = await db.query(
      `SELECT * FROM clients 
       WHERE user_id = $1 AND phone = $2 
       LIMIT 1`,
      [userId, normalizedPhone]
    );
    
    if (phoneResult.rows.length > 0) {
      existingClient = phoneResult.rows[0] as Client;
    }
  }
  
  // If found, update if needed and return
  if (existingClient) {
    // Update missing information
    const updates: string[] = [];
    const updateParams: any[] = [existingClient.id];
    
    if (!existingClient.email && normalizedEmail) {
      updates.push(`email = $${updateParams.length + 1}`);
      updateParams.push(normalizedEmail);
    }
    
    if (!existingClient.phone && normalizedPhone) {
      updates.push(`phone = $${updateParams.length + 1}`);
      updateParams.push(normalizedPhone);
    }
    
    if (existingClient.name !== normalizedName) {
      updates.push(`name = $${updateParams.length + 1}`);
      updateParams.push(normalizedName);
    }
    
    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      await db.query(
        `UPDATE clients SET ${updates.join(', ')} WHERE id = $1`,
        updateParams
      );
      
      // Reload client
      const updatedResult = await db.query(
        `SELECT * FROM clients WHERE id = $1`,
        [existingClient.id]
      );
      if (updatedResult.rows.length > 0) {
        existingClient = updatedResult.rows[0] as Client;
      }
    }
    
    return existingClient;
  }
  
  // Create new client
  const now = new Date();
  const tagsJson = JSON.stringify([]);
  
  try {
    const newClientResult = await db.query(
      `INSERT INTO clients 
       (user_id, name, email, phone, source, status, tags, total_spent, total_appointments, 
        last_appointment_date, last_conversation_date, first_contact_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        userId, 
        normalizedName, 
        normalizedEmail, 
        normalizedPhone, 
        source, 
        'lead', 
        tagsJson, 
        0, 
        0, 
        null, 
        null, 
        now, 
        now, 
        now
      ]
    );
    
    if (!newClientResult.rows || newClientResult.rows.length === 0) {
      throw new Error('Failed to create client: no rows returned');
    }
    
    return newClientResult.rows[0] as Client;
  } catch (error: any) {
    console.error('Error creating client in database:', error);
    console.error('Query params:', {
      userId, 
      normalizedName, 
      normalizedEmail, 
      normalizedPhone, 
      source
    });
    throw error;
  }
}

/**
 * Update client statistics
 * Call this when appointments are created/completed
 */
export async function updateClientStats(clientId: number): Promise<void> {
  const db = getDb();
  
  // Get client
  const clientResult = await db.query(
    `SELECT * FROM clients WHERE id = $1`,
    [clientId]
  );
  
  if (clientResult.rows.length === 0) return;
  
  // Calculate total spent from completed appointments
  const spentResult = await db.query(
    `SELECT COALESCE(SUM(s.price), 0) as total
     FROM appointments a
     JOIN services s ON a.service_id = s.id
     WHERE a.client_id = $1 AND a.status = 'completed'`,
    [clientId]
  );
  const totalSpent = parseFloat(spentResult.rows[0]?.total || '0');
  
  // Count total appointments
  const countResult = await db.query(
    `SELECT COUNT(*) as count
     FROM appointments
     WHERE client_id = $1 AND status IN ('scheduled', 'completed')`,
    [clientId]
  );
  const totalAppointments = parseInt(countResult.rows[0]?.count || '0');
  
  // Get last appointment date
  const lastAppResult = await db.query(
    `SELECT MAX(start_time) as last_date
     FROM appointments
     WHERE client_id = $1 AND status IN ('scheduled', 'completed')`,
    [clientId]
  );
  const lastAppointmentDate = lastAppResult.rows[0]?.last_date || null;
  
  // Get last conversation date
  const lastConvResult = await db.query(
    `SELECT MAX(updated_at) as last_date
     FROM conversations
     WHERE client_id = $1`,
    [clientId]
  );
  const lastConversationDate = lastConvResult.rows[0]?.last_date || null;
  
  // Update client
  await db.query(
    `UPDATE clients SET
     total_spent = $1,
     total_appointments = $2,
     last_appointment_date = $3,
     last_conversation_date = $4,
     updated_at = CURRENT_TIMESTAMP
     WHERE id = $5`,
    [totalSpent, totalAppointments, lastAppointmentDate, lastConversationDate, clientId]
  );
}

/**
 * Link a conversation to a client
 */
export async function linkConversationToClient(
  conversationId: number,
  clientId: number
): Promise<void> {
  const db = getDb();
  
  await db.query(
    `UPDATE conversations SET client_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [clientId, conversationId]
  );
  
  // Update last_conversation_date
  await updateClientStats(clientId);
}

/**
 * Link an appointment to a client
 */
export async function linkAppointmentToClient(
  appointmentId: number,
  clientId: number
): Promise<void> {
  const db = getDb();
  
  await db.query(
    `UPDATE appointments SET client_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [clientId, appointmentId]
  );
  
  // Update client stats
  await updateClientStats(clientId);
}

