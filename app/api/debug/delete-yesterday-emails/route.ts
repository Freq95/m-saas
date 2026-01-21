/**
 * Debug endpoint to delete yesterday's email messages and re-sync them
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getTodayInRomania } from '@/lib/timezone';

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const todayStart = getTodayInRomania();
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    
    // Get all email conversations
    const emailConvsResult = await db.query(
      `SELECT id FROM conversations WHERE channel = 'email'`
    );
    const emailConvIds = emailConvsResult.rows.map((r: any) => r.id);
    
    if (emailConvIds.length === 0) {
      return NextResponse.json({ message: 'No email conversations found' });
    }
    
    // Get messages from yesterday (between yesterday start and today start)
    const messagesResult = await db.query(
      `SELECT id, conversation_id, sent_at, direction 
       FROM messages 
       WHERE conversation_id = ANY($1::int[])
       AND sent_at >= $2 
       AND sent_at < $3
       ORDER BY sent_at DESC`,
      [emailConvIds, yesterdayStart, todayStart]
    );
    
    const yesterdayMessages = messagesResult.rows || [];
    
    if (yesterdayMessages.length === 0) {
      return NextResponse.json({ 
        message: 'No messages from yesterday found',
        yesterdayStart: yesterdayStart.toISOString(),
        todayStart: todayStart.toISOString(),
      });
    }
    
    // Delete the messages
    const messageIds = yesterdayMessages.map((m: any) => m.id);
    await db.query(
      `DELETE FROM messages WHERE id = ANY($1::int[])`,
      [messageIds]
    );
    
    // Update conversations to remove last_message_at if it was from yesterday
    for (const msg of yesterdayMessages) {
      const convResult = await db.query(
        `SELECT last_message_at FROM conversations WHERE id = $1`,
        [msg.conversation_id]
      );
      
      if (convResult.rows.length > 0) {
        const convLastMsgAt = convResult.rows[0].last_message_at;
        if (convLastMsgAt) {
          const lastMsgDate = new Date(convLastMsgAt);
          if (lastMsgDate >= yesterdayStart && lastMsgDate < todayStart) {
            // Clear last_message_at if it was from yesterday
            await db.query(
              `UPDATE conversations SET last_message_at = NULL WHERE id = $1`,
              [msg.conversation_id]
            );
          }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      deleted: yesterdayMessages.length,
      messages: yesterdayMessages.map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sent_at: m.sent_at,
        direction: m.direction,
      })),
      yesterdayStart: yesterdayStart.toISOString(),
      todayStart: todayStart.toISOString(),
      message: `Deleted ${yesterdayMessages.length} messages from yesterday. You can now re-sync to get them with today's dates.`,
    });
  } catch (error: any) {
    console.error('Error deleting yesterday emails:', error);
    return NextResponse.json(
      { error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined },
      { status: 500 }
    );
  }
}

