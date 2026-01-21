import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/clients/[id]/activities - Get activity timeline for a contact
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const contactId = parseInt(params.id);
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'all' | 'notes' | 'emails' | 'tasks' | 'appointments'

    const activities: any[] = [];

    // Get notes
    if (!type || type === 'all' || type === 'notes') {
      try {
        const notesResult = await db.query(
          `SELECT 
            id,
            'note' as activity_type,
            content as title,
            content as description,
            created_at,
            created_at as activity_date,
            user_id
           FROM contact_notes 
           WHERE contact_id = $1`,
          [contactId]
        );
        activities.push(...notesResult.rows.map((n: any) => ({
          ...n,
          activity_type: 'note',
        })));
      } catch (e) {
        // Table might not exist, skip
      }
    }

    // Get emails (from conversations)
    if (!type || type === 'all' || type === 'emails') {
      const conversationsResult = await db.query(
        `SELECT * FROM conversations WHERE client_id = $1 AND channel = 'email' ORDER BY updated_at DESC`,
        [contactId]
      );
      
      // Get message counts and latest message for each conversation
      for (const conv of conversationsResult.rows) {
        const messagesResult = await db.query(
          `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [conv.id]
        );
        const messageCountResult = await db.query(
          `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1`,
          [conv.id]
        );
        
        const latestMessage = messagesResult.rows[0];
        const messageCount = parseInt(messageCountResult.rows[0]?.count || '0');
        const activityDate = latestMessage?.created_at || conv.updated_at || conv.created_at;
        
        activities.push({
          id: conv.id,
          activity_type: 'email',
          title: conv.subject || 'No subject',
          description: latestMessage?.content || '',
          activity_date: activityDate,
          created_at: conv.created_at,
          user_id: conv.user_id,
          channel: conv.channel,
          message_count: messageCount,
        });
      }
    }

    // Get appointments
    if (!type || type === 'all' || type === 'appointments') {
      const appointmentsResult = await db.query(
        `SELECT 
          a.id,
          'appointment' as activity_type,
          COALESCE(s.name, 'Appointment') as title,
          a.notes as description,
          a.start_time as activity_date,
          a.created_at,
          a.user_id,
          a.status,
          s.price as service_price
         FROM appointments a
         LEFT JOIN services s ON a.service_id = s.id
         WHERE a.client_id = $1
         ORDER BY a.start_time DESC`,
        [contactId]
      );
      activities.push(...appointmentsResult.rows.map((a: any) => ({
        ...a,
        activity_type: 'appointment',
      })));
    }

    // Get tasks
    if (!type || type === 'all' || type === 'tasks') {
      try {
        const tasksResult = await db.query(
          `SELECT 
            id,
            'task' as activity_type,
            title,
            description,
            due_date as activity_date,
            created_at,
            user_id,
            status,
            priority
           FROM tasks 
           WHERE contact_id = $1
           ORDER BY due_date DESC, created_at DESC`,
          [contactId]
        );
        activities.push(...tasksResult.rows.map((t: any) => ({
          ...t,
          activity_type: 'task',
        })));
      } catch (e) {
        // Table might not exist, skip
      }
    }

    // Sort all activities by activity_date (most recent first)
    activities.sort((a, b) => {
      const dateA = new Date(a.activity_date || a.created_at).getTime();
      const dateB = new Date(b.activity_date || b.created_at).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({ activities });
  } catch (error: any) {
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities', details: error.message },
      { status: 500 }
    );
  }
}

