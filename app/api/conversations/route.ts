import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTodayInRomania, isTodayInRomania } from '@/lib/timezone';

// GET /api/conversations - Get all conversations from storage
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || '1');
    const status = searchParams.get('status') || 'all';
    const todayOnly = searchParams.get('todayOnly') === 'true';

    // Get conversations from storage
    let query = `SELECT * FROM conversations WHERE user_id = $1`;
    const params: any[] = [userId];

    if (status !== 'all') {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const conversationsResult = await db.query(query, params);
    let conversations = conversationsResult.rows || [];

    // Get all messages to enrich conversations
    const messagesResult = await db.query(`SELECT * FROM messages ORDER BY sent_at DESC`);
    const allMessages = messagesResult.rows || [];

    // Get all tags
    const tagsResult = await db.query(`SELECT * FROM tags`);
    const allTags = tagsResult.rows || [];

    // Get conversation tags
    const convTagsResult = await db.query(`SELECT * FROM conversation_tags`);
    const allConvTags = convTagsResult.rows || [];

    // Enrich conversations with message counts, last message, tags, and unread count
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

      // Get last message date - ensure we use the most recent message's sent_at
      // This is critical for the todayOnly filter to work correctly
      let lastMessageAt: string | Date;
      
      // FIRST: Check if conversation has a last_message_at column set (from sync)
      // This is more reliable than calculating from messages, especially for new emails
      // The sync route updates this column when messages are added
      if (conv.last_message_at) {
        const dbLastMessageAt = typeof conv.last_message_at === 'string' 
          ? new Date(conv.last_message_at) 
          : new Date(conv.last_message_at);
        if (!isNaN(dbLastMessageAt.getTime())) {
          lastMessageAt = conv.last_message_at;
        }
      }
      
      // SECOND: If no database last_message_at, calculate from messages
      if (!lastMessageAt && sortedMessages.length > 0) {
        const lastMsg = sortedMessages[0];
        // Prefer sent_at (actual message time), fallback to created_at, then conversation created_at
        lastMessageAt = lastMsg.sent_at || lastMsg.created_at || conv.created_at;
        
        // Validate the date - ensure it's a valid ISO string or Date
        if (lastMessageAt) {
          const testDate = typeof lastMessageAt === 'string' 
            ? new Date(lastMessageAt) 
            : new Date(lastMessageAt);
          if (isNaN(testDate.getTime())) {
            // If invalid, use conversation created_at
            lastMessageAt = conv.created_at;
          }
        } else {
          lastMessageAt = conv.created_at;
        }
      } else if (!lastMessageAt) {
        // No messages and no database last_message_at, use conversation created_at
        lastMessageAt = conv.created_at;
      }

      // Calculate unread count: count inbound messages that haven't been read
      // For now, we'll count all inbound messages as unread if there's no read tracking
      // In a production system, you'd have a read_at or is_read field
      // For now, we'll use a simple heuristic: if last message is inbound and recent, count as unread
      let unreadCount = 0;
      if (sortedMessages.length > 0) {
        const lastMessage = sortedMessages[0];
        // Count unread inbound messages (messages without direction='outbound' are inbound)
        // Only count messages from the last 7 days to avoid showing old unread counts
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const lastMessageDate = new Date(lastMessage.sent_at || lastMessage.created_at);
        
        if (lastMessage.direction !== 'outbound' && lastMessageDate >= sevenDaysAgo) {
          // Count all inbound messages from the last 7 days
          unreadCount = messages.filter((m: any) => {
            const msgDate = new Date(m.sent_at || m.created_at);
            return m.direction !== 'outbound' && msgDate >= sevenDaysAgo;
          }).length;
        }
      }

      return {
        ...conv,
        message_count: messages.length,
        last_message_at: lastMessageAt,
        tags: tags || [],
        unread_count: unreadCount,
        // Add flag to identify mocks
        isMock: conv.contact_email && conv.contact_email.endsWith('@example.com'),
      };
    });

    // Filter by today if requested
    let filteredConversations = enrichedConversations;
    if (todayOnly) {
      const todayStart = getTodayInRomania();
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      
      // Debug: Log today's range
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG] Today filter range:', {
          todayStart: todayStart.toISOString(),
          tomorrowStart: tomorrowStart.toISOString(),
          totalConversations: enrichedConversations.length,
        });
      }
      
      filteredConversations = enrichedConversations.filter((conv: any) => {
        // Always include mocks
        if (conv.isMock) {
          return true;
        }
        
        // Check if last message is from today in Romania timezone
        if (conv.last_message_at) {
          // Handle both string and Date formats
          let lastMessageDate: Date;
          if (conv.last_message_at instanceof Date) {
            lastMessageDate = conv.last_message_at;
          } else if (typeof conv.last_message_at === 'string') {
            // Parse ISO string - ensure it's treated as UTC
            const dateStr = conv.last_message_at.trim();
            // If it ends with Z or has timezone, use as-is, otherwise assume UTC
            if (dateStr.endsWith('Z') || dateStr.includes('+') || (dateStr.includes('-') && dateStr.length > 10)) {
              lastMessageDate = new Date(dateStr);
            } else {
              // No timezone info, assume UTC
              lastMessageDate = new Date(dateStr + (dateStr.includes('T') ? 'Z' : 'T00:00:00Z'));
            }
          } else {
            lastMessageDate = new Date(conv.last_message_at);
          }
          
          if (isNaN(lastMessageDate.getTime())) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[DEBUG] Invalid last_message_at for conversation ${conv.id}:`, conv.last_message_at);
            }
            return false;
          }
          
          // Direct comparison with today's range in UTC
          const messageTime = lastMessageDate.getTime();
          const isToday = messageTime >= todayStart.getTime() && messageTime < tomorrowStart.getTime();
          
          // Debug logging in development for conversations near today
          if (process.env.NODE_ENV === 'development') {
            const hoursDiff = (messageTime - todayStart.getTime()) / (1000 * 60 * 60);
            if (Math.abs(hoursDiff) < 48) { // Within 48 hours
              console.log(`[DEBUG] Conversation ${conv.id} (${conv.contact_name || 'Unknown'}):`, {
                last_message_at: conv.last_message_at,
                parsedDate: lastMessageDate.toISOString(),
                messageTime,
                todayStart: todayStart.toISOString(),
                tomorrowStart: tomorrowStart.toISOString(),
                hoursFromTodayStart: hoursDiff.toFixed(2),
                isToday,
                channel: conv.channel,
              });
            }
          }
          
          return isToday;
        }
        
        // No last_message_at, exclude from today's view
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DEBUG] Conversation ${conv.id} has no last_message_at`);
        }
        return false;
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEBUG] Filtered to ${filteredConversations.length} conversations from today`);
      }
    }

    // Sort by last_message_at (most recent first)
    filteredConversations.sort((a: any, b: any) => {
      const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ conversations: filteredConversations });
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
