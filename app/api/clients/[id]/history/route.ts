import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

// GET /api/clients/[id]/history - Get unified timeline of all client activities
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);

    const client = await db.collection('clients').findOne({
      id: clientId,
      deleted_at: { $exists: false },
    });
    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    const timeline: any[] = [];

    const [appointments, services] = await Promise.all([
      db.collection('appointments').find({ client_id: clientId }).sort({ start_time: -1 }).toArray(),
      db.collection('services').find({}).toArray(),
    ]);

    const serviceById = new Map<number, any>(
      services.map((service: any) => [service.id, service])
    );

    appointments.forEach((apt: any) => {
      const service = serviceById.get(apt.service_id);
      timeline.push({
        id: apt.id,
        type: 'appointment',
        date: apt.start_time,
        created_at: apt.created_at,
        title: service?.name || 'Appointment',
        description: apt.notes,
        status: apt.status,
        amount: service?.price,
        service_id: apt.service_id,
      });
    });

    const conversations = await db
      .collection('conversations')
      .find({ client_id: clientId })
      .sort({ updated_at: -1 })
      .toArray();

    const conversationIds = conversations.map((conv: any) => conv.id);
    const messageCounts = new Map<number, number>();
    if (conversationIds.length > 0) {
      const messages = await db
        .collection('messages')
        .find({ conversation_id: { $in: conversationIds } })
        .toArray();
      for (const message of messages) {
        const count = messageCounts.get(message.conversation_id) || 0;
        messageCounts.set(message.conversation_id, count + 1);
      }
    }

    conversations.forEach((conv: any) => {
      const messageCount = messageCounts.get(conv.id) || 0;
      timeline.push({
        id: conv.id,
        type: 'conversation',
        date: conv.updated_at,
        created_at: conv.created_at,
        title: conv.subject || 'No subject',
        description: `${messageCount} mesaje`,
        channel: conv.channel,
        status: conv.status,
        message_count: messageCount,
      });
    });

    let notes = await db
      .collection('client_notes')
      .find({ client_id: clientId })
      .sort({ created_at: -1 })
      .toArray();

    if (notes.length === 0) {
      notes = await db
        .collection('contact_notes')
        .find({ contact_id: clientId })
        .sort({ created_at: -1 })
        .toArray();
    }

    notes.forEach((note: any) => {
      timeline.push({
        id: note.id,
        type: 'note',
        date: note.created_at,
        created_at: note.created_at,
        title: (note.content || '').slice(0, 100) || 'Nota',
        description: note.content,
      });
    });

    const tasks = await db
      .collection('tasks')
      .find({ $or: [{ client_id: clientId }, { contact_id: clientId }] })
      .sort({ due_date: -1, created_at: -1 })
      .toArray();

    tasks.forEach((task: any) => {
      timeline.push({
        id: task.id,
        type: 'task',
        date: task.due_date || task.created_at,
        created_at: task.created_at,
        title: task.title,
        description: task.description,
        status: task.status,
        due_date: task.due_date,
      });
    });

    let files = await db
      .collection('client_files')
      .find({ client_id: clientId })
      .sort({ created_at: -1 })
      .toArray();

    if (files.length === 0) {
      files = await db
        .collection('contact_files')
        .find({ contact_id: clientId })
        .sort({ created_at: -1 })
        .toArray();
    }

    files.forEach((file: any) => {
      timeline.push({
        id: file.id,
        type: 'file',
        date: file.created_at,
        created_at: file.created_at,
        title: file.original_filename,
        description: file.description,
        file_size: file.file_size,
        mime_type: file.mime_type,
      });
    });

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
