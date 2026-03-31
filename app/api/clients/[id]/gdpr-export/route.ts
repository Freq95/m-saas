import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import { logDataAccess } from '@/lib/audit';
import { checkGdprExportRateLimit } from '@/lib/rate-limit';

// GET /api/clients/[id]/gdpr-export - Export all client data (GDPR Art. 15/20)
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, dbUserId, tenantId, email, role } = await getAuthUser();
    const rateLimitResponse = await checkGdprExportRateLimit(userId);
    if (rateLimitResponse) return rateLimitResponse;

    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    // Verify client exists and belongs to this tenant
    const client = await db.collection('clients').findOne({
      id: clientId,
      user_id: userId,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });
    if (!client) {
      return createErrorResponse('Client not found', 404);
    }

    // Gather all related data
    const [appointments, conversations, clientFiles, contactFiles, clientNotes, contactNotes] = await Promise.all([
      db.collection('appointments').find({ client_id: clientId, tenant_id: tenantId }).sort({ start_time: -1 }).toArray(),
      db.collection('conversations').find({ client_id: clientId, tenant_id: tenantId }).sort({ created_at: -1 }).toArray(),
      db.collection('client_files').find({ client_id: clientId, tenant_id: tenantId }).sort({ created_at: -1 }).toArray(),
      db.collection('contact_files').find({ contact_id: clientId, tenant_id: tenantId }).sort({ created_at: -1 }).toArray(),
      db.collection('client_notes').find({ client_id: clientId, tenant_id: tenantId }).sort({ created_at: -1 }).toArray(),
      db.collection('contact_notes').find({ contact_id: clientId, tenant_id: tenantId }).sort({ created_at: -1 }).toArray(),
    ]);

    // Get reminders for this client's appointments
    const appointmentIds = appointments.map((a: any) => a.id);
    const reminders = appointmentIds.length > 0
      ? await db.collection('reminders').find({ tenant_id: tenantId, appointment_id: { $in: appointmentIds } }).toArray()
      : [];

    // Get messages for all conversations
    const convIds = conversations.map((c: any) => c.id);
    const messages = convIds.length > 0
      ? await db.collection('messages').find({ conversation_id: { $in: convIds }, tenant_id: tenantId }).sort({ created_at: 1 }).toArray()
      : [];

    // Generate file download URLs if storage is configured
    const allFiles = [...clientFiles, ...contactFiles];
    let fileExports: any[] = [];
    if (isStorageConfigured() && allFiles.length > 0) {
      const storage = getStorageProvider();
      fileExports = await Promise.all(
        allFiles.map(async (file) => {
          let downloadUrl = null;
          try {
            if (file.storage_key) {
              downloadUrl = await storage.getSignedUrl(file.storage_key, 3600);
            }
          } catch { /* skip if URL generation fails */ }
          return {
            filename: file.original_filename || file.filename,
            uploaded_at: file.created_at,
            file_size: file.file_size,
            mime_type: file.mime_type,
            description: file.description || null,
            download_url: downloadUrl,
          };
        })
      );
    }

    // Strip internal fields from export
    const stripInternal = (doc: any) => {
      const { _id, tenant_id, user_id, ...rest } = doc;
      return rest;
    };

    const exportData = {
      export_date: new Date().toISOString(),
      export_type: 'GDPR Art. 15/20 - Data Subject Access Request',
      client: {
        name: client.name,
        email: client.email || null,
        phone: client.phone || null,
        notes: client.notes || null,
        created_at: client.created_at,
        consent_given: client.consent_given || false,
        consent_date: client.consent_date || null,
        consent_method: client.consent_method || null,
        is_minor: client.is_minor || false,
        parent_guardian_name: client.parent_guardian_name || null,
      },
      appointments: appointments.map((a: any) => ({
        service_name: a.service_name,
        start_time: a.start_time,
        end_time: a.end_time,
        status: a.status,
        notes: a.notes || null,
        price: a.price_at_time || null,
        created_at: a.created_at,
      })),
      conversations: conversations.map((c: any) => ({
        channel: c.channel,
        subject: c.subject || null,
        contact_name: c.contact_name,
        contact_email: c.contact_email || null,
        created_at: c.created_at,
      })),
      messages: messages.map((m: any) => ({
        conversation_id: m.conversation_id,
        direction: m.direction,
        content: m.content,
        sent_at: m.sent_at || m.created_at,
      })),
      files: fileExports,
      notes: [...clientNotes, ...contactNotes].map((n: any) => ({
        content: n.content,
        created_at: n.created_at,
      })),
      reminders: reminders.map((r: any) => ({
        channel: r.channel,
        status: r.status,
        scheduled_at: r.scheduled_at,
        sent_at: r.sent_at || null,
      })),
    };

    // Log the export action
    await logDataAccess({
      actorUserId: dbUserId,
      actorEmail: email,
      actorRole: role,
      tenantId,
      targetType: 'client.gdpr_export',
      targetId: clientId,
      route: `/api/clients/${params.id}/gdpr-export`,
      request,
    });

    // Return as downloadable JSON
    const clientName = (client.name || 'client').replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `export-${clientName}-${dateStr}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to export client data');
  }
}
