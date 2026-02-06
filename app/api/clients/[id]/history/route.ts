import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/clients/[id]/history - Get unified timeline of all client activities
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const clientId = parseInt(params.id);

    // Verify client exists
    const clientResult = await db.query(
      `SELECT id FROM clients WHERE id = $1`,
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    const timeline: any[] = [];

    // Get appointments
    const appointmentsResult = await db.query(
      `SELECT 
        a.id,
        'appointment' as type,
        a.start_time as date,
        a.created_at,
        COALESCE(s.name, 'Appointment') as title,
        a.notes as description,
        a.status,
        s.price as amount,
        a.service_id
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.client_id = $1
       ORDER BY a.start_time DESC`,
      [clientId]
    );

    appointmentsResult.rows.forEach((apt: any) => {
      timeline.push({
        id: apt.id,
        type: 'appointment',
        date: apt.date,
        created_at: apt.created_at,
        title: apt.title,
        description: apt.description,
        status: apt.status,
        amount: apt.amount,
        service_id: apt.service_id,
      });
    });

    // Get conversations (all channels)
    const conversationsResult = await db.query(
      `SELECT 
        id,
        'conversation' as type,
        updated_at as date,
        created_at,
        subject as title,
        channel,
        status
       FROM conversations
       WHERE client_id = $1
       ORDER BY updated_at DESC`,
      [clientId]
    );

    // Get message counts for each conversation
    for (const conv of conversationsResult.rows) {
      const msgCountResult = await db.query(
        `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1`,
        [conv.id]
      );
      const messageCount = parseInt(msgCountResult.rows[0]?.count || '0');

      timeline.push({
        id: conv.id,
        type: 'conversation',
        date: conv.date,
        created_at: conv.created_at,
        title: conv.title || 'No subject',
        description: `${messageCount} mesaje`,
        channel: conv.channel,
        status: conv.status,
        message_count: messageCount,
      });
    }

    // Get notes - try client_notes first, fallback to contact_notes
    try {
      let notesResult;
      try {
        notesResult = await db.query(
          `SELECT 
            id,
            'note' as type,
            created_at as date,
            created_at,
            LEFT(content, 100) as title,
            content as description
           FROM client_notes 
           WHERE client_id = $1
           ORDER BY created_at DESC`,
          [clientId]
        );
      } catch (e) {
        notesResult = await db.query(
          `SELECT 
            id,
            'note' as type,
            created_at as date,
            created_at,
            LEFT(content, 100) as title,
            content as description
           FROM contact_notes 
           WHERE contact_id = $1
           ORDER BY created_at DESC`,
          [clientId]
        );
      }

      notesResult.rows.forEach((note: any) => {
        timeline.push({
          id: note.id,
          type: 'note',
          date: note.date,
          created_at: note.created_at,
          title: note.title || 'Notă',
          description: note.description,
        });
      });
    } catch (e) {
      // Table might not exist, skip
    }

    // Get tasks
    try {
      const tasksResult = await db.query(
        `SELECT 
          id,
          'task' as type,
          COALESCE(due_date, created_at) as date,
          created_at,
          title,
          description,
          status,
          due_date
         FROM tasks 
         WHERE client_id = $1 OR contact_id = $1
         ORDER BY COALESCE(due_date, created_at) DESC`,
        [clientId]
      );

      tasksResult.rows.forEach((task: any) => {
        timeline.push({
          id: task.id,
          type: 'task',
          date: task.date,
          created_at: task.created_at,
          title: task.title,
          description: task.description,
          status: task.status,
          due_date: task.due_date,
        });
      });
    } catch (e) {
      // Table might not exist, skip
    }

    // Get files - try client_files first, fallback to contact_files
    try {
      let filesResult;
      try {
        filesResult = await db.query(
          `SELECT 
            id,
            'file' as type,
            created_at as date,
            created_at,
            original_filename as title,
            description,
            file_size,
            mime_type
           FROM client_files 
           WHERE client_id = $1
           ORDER BY created_at DESC`,
          [clientId]
        );
      } catch (e) {
        filesResult = await db.query(
          `SELECT 
            id,
            'file' as type,
            created_at as date,
            created_at,
            original_filename as title,
            description,
            file_size,
            mime_type
           FROM contact_files 
           WHERE contact_id = $1
           ORDER BY created_at DESC`,
          [clientId]
        );
      }

      filesResult.rows.forEach((file: any) => {
        timeline.push({
          id: file.id,
          type: 'file',
          date: file.date,
          created_at: file.created_at,
          title: file.title,
          description: file.description,
          file_size: file.file_size,
          mime_type: file.mime_type,
        });
      });
    } catch (e) {
      // Table might not exist, skip
    }

    // Sort by date (most recent first)
    timeline.sort((a, b) => {
      const dateA = new Date(a.date || a.created_at).getTime();
      const dateB = new Date(b.date || b.created_at).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({ timeline });
  } catch (error) {
    const { handleApiError } = await import('@/lib/error-handler');
    return handleApiError(error, 'Failed to fetch client history');
  }
}

