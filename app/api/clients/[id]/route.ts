import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { updateClientStats } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import type { Conversation } from '@/lib/types';

// GET /api/clients/[id] - Get client details with history
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const clientId = parseInt(params.id);

    // Get client
    const clientResult = await db.query(
      `SELECT * FROM clients WHERE id = $1`,
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return createErrorResponse('Client not found', 404);
    }

    const client = clientResult.rows[0];

    // Parse tags
    const parsedTags = typeof client.tags === 'string' 
      ? JSON.parse(client.tags || '[]') 
      : (client.tags || []);

    // Get appointments
    const appointmentsResult = await db.query(
      `SELECT a.*, s.name as service_name, s.price as service_price
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.client_id = $1
       ORDER BY a.start_time DESC`,
      [clientId]
    );

    // Get conversations
    const conversationsResult = await db.query(
      `SELECT * FROM conversations
       WHERE client_id = $1
       ORDER BY updated_at DESC`,
      [clientId]
    );

    // Get messages count per conversation
    const conversationsWithCounts = await Promise.all(
      conversationsResult.rows.map(async (conv: Conversation) => {
        const messagesResult = await db.query(
          `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1`,
          [conv.id]
        );
        return {
          ...conv,
          message_count: parseInt(messagesResult.rows[0]?.count || '0'),
        };
      })
    );

    return createSuccessResponse({
      client: {
        ...client,
        tags: parsedTags,
      },
      appointments: appointmentsResult.rows || [],
      conversations: conversationsWithCounts,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch client');
  }
}

// PATCH /api/clients/[id] - Update client
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const clientId = parseInt(params.id);
    const body = await request.json();

    // Validate input
    const { updateClientSchema } = await import('@/lib/validation');
    const validationResult = updateClientSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { name, email, phone, status, tags, notes } = validationResult.data;

    // Build update query
    const updates: string[] = [];
    const updateParams: (string | number | null)[] = [];

    if (name !== undefined) {
      updates.push(`name = $${updateParams.length + 1}`);
      updateParams.push(name.trim());
    }

    if (email !== undefined) {
      updates.push(`email = $${updateParams.length + 1}`);
      updateParams.push(email ? email.toLowerCase().trim() : null);
    }

    if (phone !== undefined) {
      updates.push(`phone = $${updateParams.length + 1}`);
      updateParams.push(phone ? phone.trim() : null);
    }

    if (status !== undefined) {
      updates.push(`status = $${updateParams.length + 1}`);
      updateParams.push(status);
    }

    if (tags !== undefined && Array.isArray(tags)) {
      updates.push(`tags = $${updateParams.length + 1}`);
      updateParams.push(JSON.stringify(tags));
    }

    if (notes !== undefined) {
      updates.push(`notes = $${updateParams.length + 1}`);
      updateParams.push(notes);
    }

    if (updates.length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updateParams.push(clientId);

    await db.query(
      `UPDATE clients SET ${updates.join(', ')} WHERE id = $${updateParams.length}`,
      updateParams
    );

    // Reload client
    const result = await db.query(
      `SELECT * FROM clients WHERE id = $1`,
      [clientId]
    );

    if (result.rows.length === 0) {
      return createErrorResponse('Client not found', 404);
    }

    const updatedClient = result.rows[0];

    return createSuccessResponse({
      client: {
        ...updatedClient,
        tags: typeof updatedClient.tags === 'string' 
          ? JSON.parse(updatedClient.tags || '[]') 
          : (updatedClient.tags || []),
      }
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update client');
  }
}

// DELETE /api/clients/[id] - Delete client (soft delete by setting status to 'deleted')
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const clientId = parseInt(params.id);

    // Soft delete: set status to 'deleted'
    await db.query(
      `UPDATE clients SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [clientId]
    );

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete client');
  }
}

