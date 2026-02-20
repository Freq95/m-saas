import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/clients/[id]/activities - Get activity timeline for a client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'all' | 'notes' | 'emails' | 'tasks' | 'appointments'

    const activities: any[] = [];
    const client = await db.collection('clients').findOne({ id: clientId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } });
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Get notes
    if (!type || type === 'all' || type === 'notes') {
      let notes = await db
        .collection('client_notes')
        .find({ client_id: clientId, tenant_id: tenantId })
        .toArray();

      if (notes.length === 0) {
        notes = await db
          .collection('contact_notes')
          .find({ contact_id: clientId, tenant_id: tenantId })
          .toArray();
      }

      activities.push(...notes.map((note: any) => ({
        ...stripMongoId(note),
        activity_type: 'note',
        title: note.content,
        description: note.content,
        activity_date: note.created_at,
      })));
    }

    // Get emails (from conversations)
    if (!type || type === 'all' || type === 'emails') {
      const conversations = await db
        .collection('conversations')
        .find({ client_id: clientId, channel: 'email', tenant_id: tenantId })
        .sort({ updated_at: -1 })
        .toArray();

      const conversationIds = conversations.map((conv: any) => conv.id);
      const messageCounts = new Map<number, number>();
      const latestMessage = new Map<number, any>();

      if (conversationIds.length > 0) {
        const messages = await db
          .collection('messages')
          .find({ conversation_id: { $in: conversationIds }, tenant_id: tenantId })
          .sort({ created_at: -1 })
          .toArray();

        for (const message of messages) {
          const currentCount = messageCounts.get(message.conversation_id) || 0;
          messageCounts.set(message.conversation_id, currentCount + 1);
          if (!latestMessage.has(message.conversation_id)) {
            latestMessage.set(message.conversation_id, message);
          }
        }
      }

      for (const conv of conversations) {
        const latest = latestMessage.get(conv.id);
        const messageCount = messageCounts.get(conv.id) || 0;
        const activityDate = latest?.created_at || conv.updated_at || conv.created_at;

        activities.push({
          id: conv.id,
          activity_type: 'email',
          title: conv.subject || 'No subject',
          description: latest?.content || '',
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
      const [appointments, services] = await Promise.all([
        db.collection('appointments').find({ client_id: clientId, tenant_id: tenantId }).sort({ start_time: -1 }).toArray(),
        db.collection('services').find({ tenant_id: tenantId }).toArray(),
      ]);

      const serviceById = new Map<number, any>(
        services.map((service: any) => [service.id, service])
      );

      activities.push(...appointments.map((appointment: any) => {
        const service = serviceById.get(appointment.service_id);
        return {
          ...stripMongoId(appointment),
          activity_type: 'appointment',
          title: service?.name || 'Appointment',
          description: appointment.notes,
          activity_date: appointment.start_time,
          service_price: service?.price,
        };
      }));
    }

    // Get tasks
    if (!type || type === 'all' || type === 'tasks') {
      const tasks = await db
        .collection('tasks')
        .find({
          tenant_id: tenantId,
          $or: [{ client_id: clientId }, { contact_id: clientId }],
        })
        .sort({ due_date: -1, created_at: -1 })
        .toArray();

      activities.push(...tasks.map((task: any) => ({
        ...stripMongoId(task),
        activity_type: 'task',
        activity_date: task.due_date,
      })));
    }

    // Sort all activities by activity_date (most recent first)
    activities.sort((a, b) => {
      const dateA = new Date(a.activity_date || a.created_at).getTime();
      const dateB = new Date(b.activity_date || b.created_at).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({ activities });
  } catch (error) {
    const { handleApiError } = await import('@/lib/error-handler');
    return handleApiError(error, 'Failed to fetch activities');
  }
}
