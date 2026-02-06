import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getDb } from '@/lib/db';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import type { Message } from '@/lib/types';

// GET /api/conversations/[id] - Get conversation with messages
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const conversationId = parseInt(params.id);

    // Get conversation
    const conversationResult = await db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (conversationResult.rows.length === 0) {
      return NextResponse.json(
        { conversation: null, messages: [] },
        { status: 404 }
      );
    }

    // Get pagination parameters
    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const beforeId = searchParams.get('beforeId'); // For cursor-based pagination (load older messages)

    let messagesQuery = `SELECT * FROM messages WHERE conversation_id = $1`;
    const queryParams: (string | number)[] = [conversationId];
    let paramIndex = 2;

    // If beforeId is provided, load messages before that ID (for infinite scroll loading older messages)
    if (beforeId) {
      messagesQuery += ` AND id < $${paramIndex}`;
      queryParams.push(parseInt(beforeId));
      paramIndex++;
    }

    messagesQuery += ` ORDER BY sent_at DESC LIMIT $${paramIndex}`;
    queryParams.push(limit);
    
    if (offset > 0 && !beforeId) {
      messagesQuery += ` OFFSET $${paramIndex + 1}`;
      queryParams.push(offset);
    }

    const messagesResult = await db.query(messagesQuery, queryParams);
    
    // Reverse to get chronological order (oldest first)
    const messages = (messagesResult.rows || []).reverse();

    // Parse messages using standardized format
    const { parseStoredMessage } = await import('@/lib/email-types');
    
    const parsedMessages = messages.map((msg: Message) => {
      const stored = parseStoredMessage(msg.content || '');
      
      return {
        ...msg,
        // Only set content to text if HTML is not available (to avoid showing both)
        content: stored.html ? undefined : stored.text, // Don't show text if HTML exists
        text: stored.text,
        html: stored.html,
        images: stored.images,
        attachments: stored.attachments,
      };
    });

    // Check if there are more messages to load
    const hasMore = parsedMessages.length === limit;
    const oldestMessageId = parsedMessages.length > 0 ? parsedMessages[0].id : null;

    return createSuccessResponse({
      conversation: conversationResult.rows[0],
      messages: parsedMessages,
      hasMore,
      oldestMessageId,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch conversation');
  }
}

// PATCH /api/conversations/[id] - Update conversation
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const conversationId = parseInt(params.id);
    const body = await request.json();
    
    // Validate conversation exists
    const existingConv = await db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (existingConv.rows.length === 0) {
      return createErrorResponse('Conversation not found', 404);
    }

    // Validate input
    const { updateConversationSchema } = await import('@/lib/validation');
    const validationResult = updateConversationSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const updateParams: (string | number | null)[] = [];

    // Allowed fields to update from validated data
    const validatedData = validationResult.data;
    
    if (validatedData.status !== undefined) {
      updates.push(`status = $${updateParams.length + 1}`);
      updateParams.push(validatedData.status);
    }
    
    if (validatedData.contactName !== undefined) {
      updates.push(`contact_name = $${updateParams.length + 1}`);
      updateParams.push(validatedData.contactName);
    }
    
    if (validatedData.contactEmail !== undefined) {
      updates.push(`contact_email = $${updateParams.length + 1}`);
      updateParams.push(validatedData.contactEmail || null);
    }
    
    if (validatedData.contactPhone !== undefined) {
      updates.push(`contact_phone = $${updateParams.length + 1}`);
      updateParams.push(validatedData.contactPhone || null);
    }
    
    if (validatedData.subject !== undefined) {
      updates.push(`subject = $${updateParams.length + 1}`);
      updateParams.push(validatedData.subject || null);
    }
    
    if (validatedData.clientId !== undefined) {
      updates.push(`client_id = $${updateParams.length + 1}`);
      updateParams.push(validatedData.clientId || null);
    }

    // Handle tags update
    if (validatedData.tags !== undefined && Array.isArray(validatedData.tags)) {
      // Remove existing tags
      await db.query(
        `DELETE FROM conversation_tags WHERE conversation_id = $1`,
        [conversationId]
      );

      // Add new tags
      const tagsResult = await db.query(`SELECT id, name FROM tags`);
      const allTags = tagsResult.rows || [];
      
      for (const tagName of validatedData.tags) {
        const tag = allTags.find((t: { id: number; name: string }) => t.name.toLowerCase() === tagName.toLowerCase());
        if (tag) {
          await db.query(
            `INSERT INTO conversation_tags (conversation_id, tag_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [conversationId, tag.id]
          );
        }
      }
    }

    // Update conversation if there are fields to update
    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updateParams.push(conversationId);
      const whereParamIndex = updateParams.length;

      await db.query(
        `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${whereParamIndex}`,
        updateParams
      );
    }

    // Fetch updated conversation
    const updatedResult = await db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    // Get tags for response
    const tagsResult = await db.query(`SELECT * FROM tags`);
    const allTags = tagsResult.rows || [];
    const convTagsResult = await db.query(
      `SELECT tag_id FROM conversation_tags WHERE conversation_id = $1`,
      [conversationId]
    );
    const tagIds = convTagsResult.rows.map((r: { tag_id: number }) => r.tag_id);
    const tags = allTags
      .filter((t: { id: number; name: string }) => tagIds.includes(t.id))
      .map((t: { id: number; name: string }) => t.name);

    return createSuccessResponse({
      success: true,
      conversation: {
        ...updatedResult.rows[0],
        tags,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update conversation');
  }
}
