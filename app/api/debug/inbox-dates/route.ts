/**
 * Debug endpoint to check date filtering issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTodayInRomania, isTodayInRomania } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    
    // Get all conversations
    const conversationsResult = await db.query(
      `SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [1]
    );
    
    // Get all messages
    const messagesResult = await db.query(`SELECT * FROM messages ORDER BY sent_at DESC LIMIT 100`);
    const allMessages = messagesResult.rows || [];
    
    const todayStart = getTodayInRomania();
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    
    const debugInfo = conversationsResult.rows.map((conv: any) => {
      const messages = allMessages.filter((m: any) => m.conversation_id === conv.id);
      const sortedMessages = messages.sort((a: any, b: any) => {
        const dateA = new Date(a.sent_at || a.created_at || 0).getTime();
        const dateB = new Date(b.sent_at || b.created_at || 0).getTime();
        return dateB - dateA;
      });
      
      const lastMessageAt = sortedMessages.length > 0 
        ? (sortedMessages[0].sent_at || sortedMessages[0].created_at)
        : conv.created_at;
      
      // Parse date with proper error handling
      let lastMessageDate: Date | null = null;
      let parseError: string | null = null;
      
      try {
        if (!lastMessageAt) {
          parseError = 'No last_message_at value';
        } else if (lastMessageAt instanceof Date) {
          lastMessageDate = lastMessageAt;
        } else if (typeof lastMessageAt === 'string') {
          const dateStr = lastMessageAt.trim();
          if (!dateStr) {
            parseError = 'Empty string';
          } else if (dateStr.endsWith('Z') || dateStr.includes('+') || (dateStr.includes('-') && dateStr.length > 10)) {
            lastMessageDate = new Date(dateStr);
          } else {
            lastMessageDate = new Date(dateStr + (dateStr.includes('T') ? 'Z' : 'T00:00:00Z'));
          }
        } else {
          lastMessageDate = new Date(lastMessageAt);
        }
        
        // Validate the parsed date
        if (lastMessageDate && isNaN(lastMessageDate.getTime())) {
          parseError = 'Invalid date after parsing';
          lastMessageDate = null;
        }
      } catch (e: any) {
        parseError = e.message || 'Parse error';
        lastMessageDate = null;
      }
      
      const isToday = lastMessageDate && 
        lastMessageDate.getTime() >= todayStart.getTime() && 
        lastMessageDate.getTime() < tomorrowStart.getTime();
      
      return {
        id: conv.id,
        contact_name: conv.contact_name,
        channel: conv.channel,
        last_message_at_raw: lastMessageAt,
        last_message_at_parsed: lastMessageDate ? lastMessageDate.toISOString() : null,
        parseError,
        message_count: messages.length,
        isToday: !!isToday,
        todayStart: todayStart.toISOString(),
        tomorrowStart: tomorrowStart.toISOString(),
        hoursFromToday: lastMessageDate ? ((lastMessageDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60)).toFixed(2) : null,
        latestMessages: sortedMessages.slice(0, 3).map((m: any) => ({
          id: m.id,
          sent_at: m.sent_at,
          direction: m.direction,
        })),
      };
    });
    
    return NextResponse.json({
      currentTime: new Date().toISOString(),
      todayStart: todayStart.toISOString(),
      tomorrowStart: tomorrowStart.toISOString(),
      totalConversations: conversationsResult.rows.length,
      conversationsToday: debugInfo.filter(c => c.isToday).length,
      conversations: debugInfo,
    });
  } catch (error: any) {
    console.error('Error in debug endpoint:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

