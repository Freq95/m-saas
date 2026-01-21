import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getYahooConfig, sendYahooEmail } from '@/lib/yahoo-mail';

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
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { content, direction } = validationResult.data;

    // Get conversation to check channel
    const convResult = await db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (convResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
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
        const yahooConfig = getYahooConfig();
        if (yahooConfig) {
          await sendYahooEmail(
            yahooConfig,
            conversation.contact_email,
            `Re: ${conversation.subject || 'Mesaj'}`,
            content
          );
        }
      } catch (emailError: any) {
        console.error('Error sending email via Yahoo:', emailError);
        // Don't fail the request if email sending fails
      }
    }

    // Update conversation updated_at
    await db.query(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [conversationId]
    );

    return NextResponse.json({ message: newMessage }, { status: 201 });
  } catch (error: any) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send message',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
