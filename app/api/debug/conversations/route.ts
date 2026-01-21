import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTodayInRomania, isTodayInRomania } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    
    // Get all conversations
    const convs = await db.query(`SELECT * FROM conversations WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20`);
    
    // Get all messages
    const msgs = await db.query(`SELECT * FROM messages ORDER BY sent_at DESC LIMIT 50`);
    
    // Get today's start in Romania
    const todayStart = getTodayInRomania();
    
    // Enrich with message info
    const enriched = convs.rows.map((conv: any) => {
      const convMessages = msgs.rows.filter((m: any) => m.conversation_id === conv.id);
      const sorted = convMessages.sort((a: any, b: any) => {
        return new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime();
      });
      const lastMsg = sorted[0];
      const lastMsgAt = lastMsg ? (lastMsg.sent_at || lastMsg.created_at) : conv.created_at;
      const isToday = lastMsgAt ? isTodayInRomania(new Date(lastMsgAt)) : false;
      
      return {
        id: conv.id,
        contact_email: conv.contact_email,
        contact_name: conv.contact_name,
        channel: conv.channel,
        message_count: convMessages.length,
        last_message_at: lastMsgAt,
        last_message_at_iso: lastMsgAt ? new Date(lastMsgAt).toISOString() : null,
        is_today: isToday,
        is_mock: conv.contact_email?.endsWith('@example.com'),
        created_at: conv.created_at,
      };
    });
    
    return NextResponse.json({
      today_start_romania: todayStart.toISOString(),
      now: new Date().toISOString(),
      total_conversations: convs.rows.length,
      total_messages: msgs.rows.length,
      conversations: enriched,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

