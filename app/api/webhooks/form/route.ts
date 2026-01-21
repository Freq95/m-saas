import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { suggestTags } from '@/lib/ai-agent';

// POST /api/webhooks/form - Webhook for form submissions from website
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const { formWebhookSchema } = await import('@/lib/validation');
    const validationResult = formWebhookSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { userId, name, email, phone, message, subject } = validationResult.data;

    const db = getDb();

    // Create conversation
    const convResult = await db.query(
      `INSERT INTO conversations (user_id, channel, contact_name, contact_email, contact_phone, subject, status)
       VALUES ($1, 'form', $2, $3, $4, $5, 'open')
       RETURNING id`,
      [userId, name || 'Anonim', email, phone, subject || 'Formular site']
    );

    const conversationId = convResult.rows[0].id;

    // Add message
    await db.query(
      `INSERT INTO messages (conversation_id, direction, content)
       VALUES ($1, 'inbound', $2)`,
      [conversationId, message]
    );

    // Auto-tag as "Lead nou"
    const tagResult = await db.query('SELECT id FROM tags WHERE LOWER(name) = LOWER($1)', ['Lead nou']);
    if (tagResult.rows.length > 0) {
      await db.query(
        `INSERT INTO conversation_tags (conversation_id, tag_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [conversationId, tagResult.rows[0].id]
      );
    }

    return NextResponse.json({ success: true, conversationId });
  } catch (error: any) {
    console.error('Error processing form webhook:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

