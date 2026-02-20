import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { linkConversationToClient } from '@/lib/client-matching';
import { getAuthUser } from '@/lib/auth-helpers';
import { buildClientStorageKey, getStorageProvider } from '@/lib/storage';
import { invalidateReadCaches } from '@/lib/cache-keys';

// POST /api/conversations/[id]/attachments/[attachmentId]/save
// Save a persisted inbound email attachment to an existing or new client profile.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const conversationId = parseInt(params.id, 10);
    const attachmentId = parseInt(params.attachmentId, 10);

    if (Number.isNaN(conversationId) || conversationId <= 0) {
      return createErrorResponse('Invalid conversation ID', 400);
    }
    if (Number.isNaN(attachmentId) || attachmentId <= 0) {
      return createErrorResponse('Invalid attachment ID', 400);
    }

    const body = await request.json().catch(() => ({}));
    const requestedClientId = typeof body?.clientId === 'number' ? body.clientId : null;
    const createClient = Boolean(body?.createClient);

    const conversation = await db.collection('conversations').findOne({ id: conversationId, tenant_id: tenantId, user_id: userId });
    if (!conversation) {
      return createErrorResponse('Conversation not found', 404);
    }

    const attachment = await db.collection('message_attachments').findOne({
      id: attachmentId,
      conversation_id: conversationId,
      tenant_id: tenantId,
    });
    if (!attachment) {
      return createErrorResponse('Attachment not found for conversation', 404);
    }

    const storage = getStorageProvider();

    let targetClientId: number | null = null;

    if (requestedClientId) {
      const existingClient = await db.collection('clients').findOne({ id: requestedClientId, tenant_id: tenantId });
      if (!existingClient) {
        return createErrorResponse('Client not found', 404);
      }
      targetClientId = requestedClientId;
    } else if (conversation.client_id && typeof conversation.client_id === 'number') {
      targetClientId = conversation.client_id;
    } else {
      if (createClient) {
        return createErrorResponse(
          'Automatic client creation is disabled. Create the client manually, then retry with clientId.',
          400
        );
      }
      return createErrorResponse(
        'Conversation is not linked to a client. Provide clientId.',
        400
      );
    }

    if (!targetClientId) {
      return createErrorResponse('Could not resolve target client', 400);
    }

    if (conversation.client_id !== targetClientId) {
      await linkConversationToClient(conversationId, targetClientId, tenantId);
    }

    if (
      attachment.last_saved_client_id === targetClientId &&
      typeof attachment.last_saved_client_file_id === 'number'
    ) {
      const existingByLastSaved = await db.collection('client_files').findOne({
        id: attachment.last_saved_client_file_id,
        client_id: targetClientId,
        tenant_id: tenantId,
      });
      if (existingByLastSaved) {
        return createSuccessResponse({
          success: true,
          alreadySaved: true,
          clientId: targetClientId,
          file: stripMongoId(existingByLastSaved),
        });
      }
    }

    const existingDuplicate = await db.collection('client_files').findOne({
      client_id: targetClientId,
      tenant_id: tenantId,
      source_type: 'conversation_attachment',
      source_conversation_id: conversationId,
      source_attachment_id: attachmentId,
    });
    if (existingDuplicate) {
      const now = new Date().toISOString();
      await db.collection('message_attachments').updateOne(
        { id: attachmentId, tenant_id: tenantId },
        {
          $set: {
            last_saved_client_id: targetClientId,
            last_saved_client_file_id: existingDuplicate.id,
            last_saved_at: now,
            updated_at: now,
          },
        }
      );

      return createSuccessResponse({
        success: true,
        alreadySaved: true,
        clientId: targetClientId,
        file: stripMongoId(existingDuplicate),
      });
    }

    const originalFilename = attachment.original_filename || attachment.filename || 'attachment';
    let sourceBuffer: Buffer | null = null;
    if (attachment.storage_key) {
      sourceBuffer = await storage.download(String(attachment.storage_key));
    }
    if (!sourceBuffer || sourceBuffer.length === 0) {
      return createErrorResponse('Attachment file not found in storage', 404);
    }

    const storageKey = buildClientStorageKey(String(tenantId), targetClientId, String(originalFilename));
    await storage.upload(storageKey, sourceBuffer, attachment.mime_type || 'application/octet-stream');

    const now = new Date().toISOString();
    const fileId = await getNextNumericId('client_files');

    const fileDoc = {
      _id: fileId,
      id: fileId,
      tenant_id: tenantId,
      client_id: targetClientId,
      filename: storageKey.split('/').pop() || String(originalFilename),
      original_filename: originalFilename,
      storage_key: storageKey,
      file_size: attachment.file_size || sourceBuffer.length,
      mime_type: attachment.mime_type || 'application/octet-stream',
      description: `Saved from email conversation #${conversationId}`,
      source_type: 'conversation_attachment',
      source_conversation_id: conversationId,
      source_attachment_id: attachmentId,
      created_at: now,
      updated_at: now,
    };

    await db.collection('client_files').insertOne(fileDoc);
    await db.collection('clients').updateOne(
      { id: targetClientId, tenant_id: tenantId },
      { $set: { last_activity_date: now, updated_at: now } }
    );
    await invalidateReadCaches({ tenantId, userId });

    await db.collection('message_attachments').updateOne(
      { id: attachmentId, tenant_id: tenantId },
      {
        $set: {
          last_saved_client_id: targetClientId,
          last_saved_client_file_id: fileId,
          last_saved_at: now,
          updated_at: now,
        },
      }
    );
    return createSuccessResponse({
      success: true,
      clientId: targetClientId,
      file: stripMongoId(fileDoc),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to save attachment to client');
  }
}
