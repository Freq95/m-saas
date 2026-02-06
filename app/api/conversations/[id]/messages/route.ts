import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getYahooConfig, sendYahooEmail } from '@/lib/yahoo-mail';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// POST /api/conversations/[id]/messages - Send message
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const conversationId = parseInt(params.id);
    const body = await request.json();
    
    // Validate input
    const { createMessageSchema } = await import('@/lib/validation');
    const validationResult = createMessageSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { content, direction } = validationResult.data;

    // Get conversation to check channel
    const convResult = await db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (convResult.rows.length === 0) {
      return createErrorResponse('Conversation not found', 404);
    }

    const conversation = convResult.rows[0];

    // Save message to database
    const messageResult = await db.query(
      `INSERT INTO messages (conversation_id, direction, content, sent_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING *`,
      [conversationId, direction, content]
    );

    const newMessage = messageResult.rows[0];

    // If it's an outbound email message, send via Yahoo
    if (direction === 'outbound' && conversation.channel === 'email' && conversation.contact_email) {
      try {
        const yahooConfig = await getYahooConfig(Number(conversation.user_id));
        if (yahooConfig) {
          await sendYahooEmail(
            yahooConfig,
            conversation.contact_email,
            `Re: ${conversation.subject || 'Mesaj'}`,
            content
          );
        }
      } catch (emailError) {
        const { logger } = await import('@/lib/logger');
        logger.error('Error sending email via Yahoo', emailError instanceof Error ? emailError : new Error(String(emailError)), { conversationId });
        // Don't fail the request if email sending fails
      }
    }

    // Update conversation updated_at
    await db.query(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [conversationId]
    );

    return createSuccessResponse({ message: newMessage }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to send message');
  }
}
