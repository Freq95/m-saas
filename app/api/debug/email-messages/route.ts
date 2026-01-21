/**
 * Debug endpoint to view all email messages in the database
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isTodayInRomania } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    
    // Get all email conversations
    const conversationsResult = await db.query(
      `SELECT * FROM conversations WHERE channel = 'email' ORDER BY created_at DESC`
    );
    
    // Get all messages
    const messagesResult = await db.query(
      `SELECT * FROM messages ORDER BY sent_at DESC LIMIT 200`
    );
    
    const allMessages = messagesResult.rows || [];
    const emailConversations = conversationsResult.rows || [];
    
    // Get messages for email conversations
    const emailMessages = allMessages.filter((msg: any) => 
      emailConversations.some((conv: any) => conv.id === msg.conversation_id)
    );
    
    // Enrich messages with conversation info and parsed content
    const enrichedMessages = emailMessages.map((msg: any) => {
      const conversation = emailConversations.find((c: any) => c.id === msg.conversation_id);
      
      let parsedContent: any = null;
      let contentPreview = '';
      try {
        if (msg.content) {
          const { parseStoredMessage } = require('@/lib/email-types');
          parsedContent = parseStoredMessage(msg.content);
          if (parsedContent.text) {
            contentPreview = parsedContent.text.substring(0, 150);
          } else if (parsedContent.html) {
            // Strip HTML tags for preview
            contentPreview = parsedContent.html.replace(/<[^>]*>/g, '').substring(0, 150);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
      
      const sentAt = msg.sent_at ? new Date(msg.sent_at) : null;
      const isToday = sentAt ? isTodayInRomania(sentAt) : false;
      
      return {
        id: msg.id,
        conversation_id: msg.conversation_id,
        direction: msg.direction,
        sent_at: msg.sent_at,
        created_at: msg.created_at,
        isToday,
        conversation: conversation ? {
          id: conversation.id,
          contact_name: conversation.contact_name,
          contact_email: conversation.contact_email,
          subject: conversation.subject,
          last_message_at: conversation.last_message_at,
          created_at: conversation.created_at,
        } : null,
        content: {
          preview: contentPreview,
          hasText: !!(parsedContent?.text),
          hasHtml: !!(parsedContent?.html),
          hasImages: !!(parsedContent?.images && parsedContent.images.length > 0),
          imageCount: parsedContent?.images?.length || 0,
          hasAttachments: !!(parsedContent?.attachments && parsedContent.attachments.length > 0),
          attachmentCount: parsedContent?.attachments?.length || 0,
        },
      };
    });
    
    // Group by conversation
    const byConversation: Record<number, any[]> = {};
    enrichedMessages.forEach((msg: any) => {
      if (!byConversation[msg.conversation_id]) {
        byConversation[msg.conversation_id] = [];
      }
      byConversation[msg.conversation_id].push(msg);
    });
    
    return NextResponse.json({
      summary: {
        totalMessages: enrichedMessages.length,
        todayMessages: enrichedMessages.filter(m => m.isToday).length,
        totalConversations: emailConversations.length,
        conversationsWithMessages: Object.keys(byConversation).length,
      },
      byConversation: Object.entries(byConversation)
        .sort(([a], [b]) => parseInt(b) - parseInt(a))
        .map(([convId, msgs]) => ({
          conversation_id: parseInt(convId),
          conversation: msgs[0]?.conversation,
          message_count: msgs.length,
          todayMessageCount: msgs.filter(m => m.isToday).length,
          messages: msgs.sort((a, b) => 
            new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime()
          ),
        })),
      allMessages: enrichedMessages.sort((a, b) => 
        new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime()
      ),
    });
  } catch (error: any) {
    console.error('Error fetching email messages:', error);
    return NextResponse.json(
      { error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined },
      { status: 500 }
    );
  }
}

