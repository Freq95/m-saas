import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
    const queryParams: any[] = [conversationId];
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
    
    const parsedMessages = messages.map((msg: any) => {
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
    // Since we reversed the messages, the first one (index 0) is the oldest
    const hasMore = parsedMessages.length === limit;
    const oldestMessageId = parsedMessages.length > 0 ? parsedMessages[0].id : null;
    
    // Also check if there are actually more messages in the database
    let actuallyHasMore = hasMore;
    if (hasMore && oldestMessageId) {
      const checkMoreResult = await db.query(
        `SELECT id FROM messages 
         WHERE conversation_id = $1 AND id < $2 
         ORDER BY sent_at DESC LIMIT 1`,
        [conversationId, oldestMessageId]
      );
      // Update hasMore based on actual database check
      actuallyHasMore = checkMoreResult.rows.length > 0;
    }

    return NextResponse.json({
      conversation: conversationResult.rows[0],
      messages: parsedMessages,
      hasMore: actuallyHasMore,
      oldestMessageId,
    });
  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      { 
        conversation: null, 
        messages: [],
        error: 'Failed to fetch conversation',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const updateParams: any[] = [];
    let paramIndex = 1;

    // Allowed fields to update
    const allowedFields: { [key: string]: string } = {
      status: 'status',
      contact_name: 'contact_name',
      contact_email: 'contact_email',
      contact_phone: 'contact_phone',
      subject: 'subject',
      client_id: 'client_id',
    };

    for (const [key, dbField] of Object.entries(allowedFields)) {
      if (body[key] !== undefined) {
        updates.push(`${dbField} = $${paramIndex + 1}`);
        updateParams.push(body[key]);
        paramIndex++;
      }
    }

    // Handle tags update
    if (body.tags !== undefined && Array.isArray(body.tags)) {
      // Remove existing tags
      await db.query(
        `DELETE FROM conversation_tags WHERE conversation_id = $1`,
        [conversationId]
      );

      // Add new tags
      const tagsResult = await db.query(`SELECT id, name FROM tags`);
      const allTags = tagsResult.rows || [];
      
      for (const tagName of body.tags) {
        const tag = allTags.find((t: any) => t.name.toLowerCase() === tagName.toLowerCase());
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

      await db.query(
        `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${paramIndex + 1}`,
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
    const tagIds = convTagsResult.rows.map((r: any) => r.tag_id);
    const tags = allTags
      .filter((t: any) => tagIds.includes(t.id))
      .map((t: any) => t.name);

    return NextResponse.json({
      success: true,
      conversation: {
        ...updatedResult.rows[0],
        tags,
      },
    });
  } catch (error: any) {
    console.error('Error updating conversation:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update conversation',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
