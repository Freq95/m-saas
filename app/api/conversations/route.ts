import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/conversations - Get all conversations from storage
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || '1');
    const status = searchParams.get('status') || 'all';

    // Get conversations from storage
    let query = `SELECT * FROM conversations WHERE user_id = $1`;
    const params: any[] = [userId];

    if (status !== 'all') {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const conversationsResult = await db.query(query, params);
    const conversations = conversationsResult.rows || [];

    // Get all messages to enrich conversations
    const messagesResult = await db.query(`SELECT * FROM messages ORDER BY sent_at DESC`);
    const allMessages = messagesResult.rows || [];

    // Get all tags
    const tagsResult = await db.query(`SELECT * FROM tags`);
    const allTags = tagsResult.rows || [];

    // Get conversation tags
    const convTagsResult = await db.query(`SELECT * FROM conversation_tags`);
    const allConvTags = convTagsResult.rows || [];

    // Enrich conversations with message counts, last message, and tags
    const enrichedConversations = conversations.map((conv: any) => {
      const messages = allMessages.filter((m: any) => m.conversation_id === conv.id);
      const sortedMessages = messages.sort((a: any, b: any) => {
        const dateA = new Date(a.sent_at || a.created_at || 0).getTime();
        const dateB = new Date(b.sent_at || b.created_at || 0).getTime();
        return dateB - dateA;
      });

      const tagIds = allConvTags
        .filter((ct: any) => ct.conversation_id === conv.id)
        .map((ct: any) => ct.tag_id);
      const tags = allTags
        .filter((t: any) => tagIds.includes(t.id))
        .map((t: any) => t.name);

      return {
        ...conv,
        message_count: messages.length,
        last_message_at: sortedMessages.length > 0 
          ? (sortedMessages[0].sent_at || sortedMessages[0].created_at)
          : conv.created_at,
        tags: tags || [],
      };
    });

    // Sort by last_message_at (most recent first)
    enrichedConversations.sort((a: any, b: any) => {
      const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ conversations: enrichedConversations });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { 
        conversations: [],
        error: 'Failed to fetch conversations',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// POST /api/conversations - Create new conversation
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    
    // Validate input
    const { createConversationSchema } = await import('@/lib/validation');
    const validationResult = createConversationSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { userId, channel, channelId, contactName, contactEmail, contactPhone, subject, initialMessage } = validationResult.data;

    // Create conversation in storage
    const conversationResult = await db.query(
      `INSERT INTO conversations (user_id, channel, channel_id, contact_name, contact_email, contact_phone, subject, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
       RETURNING *`,
      [userId, channel, channelId || '', contactName, contactEmail || '', contactPhone || '', subject || 'Fără subiect']
    );

    const conversation = conversationResult.rows[0];

    // Add initial message if provided
    if (initialMessage) {
      await db.query(
        `INSERT INTO messages (conversation_id, direction, content, sent_at)
         VALUES ($1, 'inbound', $2, CURRENT_TIMESTAMP)`,
        [conversation.id, initialMessage]
      );
    }

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create conversation',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
