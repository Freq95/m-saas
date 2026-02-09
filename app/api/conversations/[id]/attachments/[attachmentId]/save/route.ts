import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { findOrCreateClient, linkConversationToClient } from '@/lib/client-matching';
import * as fs from 'fs';
import * as path from 'path';

const CLIENT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'clients');

if (!fs.existsSync(CLIENT_UPLOAD_DIR)) {
  fs.mkdirSync(CLIENT_UPLOAD_DIR, { recursive: true });
}

// POST /api/conversations/[id]/attachments/[attachmentId]/save
// Save a persisted inbound email attachment to an existing or new client profile.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  try {
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

    const conversation = await db.collection('conversations').findOne({ id: conversationId });
    if (!conversation) {
      return createErrorResponse('Conversation not found', 404);
    }

    const attachment = await db.collection('message_attachments').findOne({
      id: attachmentId,
      conversation_id: conversationId,
    });
    if (!attachment) {
      return createErrorResponse('Attachment not found for conversation', 404);
    }

    if (!attachment.file_path || !fs.existsSync(attachment.file_path)) {
      return createErrorResponse('Attachment file not found on disk', 404);
    }

    let targetClientId: number | null = null;

    if (requestedClientId) {
      const existingClient = await db.collection('clients').findOne({ id: requestedClientId });
      if (!existingClient) {
        return createErrorResponse('Client not found', 404);
      }
      targetClientId = requestedClientId;
    } else if (conversation.client_id && typeof conversation.client_id === 'number') {
      targetClientId = conversation.client_id;
    } else {
      if (!createClient) {
        return createErrorResponse(
          'Conversation is not linked to a client. Provide clientId or set createClient=true.',
          400
        );
      }

      const fallbackName = conversation.contact_name?.trim() || conversation.contact_email || `Client ${conversationId}`;
      const newClient = await findOrCreateClient(
        Number(conversation.user_id) || 1,
        fallbackName,
        conversation.contact_email || undefined,
        conversation.contact_phone || undefined,
        'email'
      );
      targetClientId = newClient.id;
    }

    if (!targetClientId) {
      return createErrorResponse('Could not resolve target client', 400);
    }

    if (conversation.client_id !== targetClientId) {
      await linkConversationToClient(conversationId, targetClientId);
    }

    if (
      attachment.last_saved_client_id === targetClientId &&
      typeof attachment.last_saved_client_file_id === 'number'
    ) {
      const existingByLastSaved = await db.collection('client_files').findOne({
        id: attachment.last_saved_client_file_id,
        client_id: targetClientId,
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
      source_type: 'conversation_attachment',
      source_conversation_id: conversationId,
      source_attachment_id: attachmentId,
    });
    if (existingDuplicate) {
      const now = new Date().toISOString();
      await db.collection('message_attachments').updateOne(
        { id: attachmentId },
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
    const sanitizedOriginal = String(originalFilename).replace(/[^a-zA-Z0-9.-]/g, '_');
    const storedFilename = `${targetClientId}_${Date.now()}_${sanitizedOriginal}`;
    const clientFilePath = path.join(CLIENT_UPLOAD_DIR, storedFilename);

    const sourceBuffer = fs.readFileSync(attachment.file_path);
    fs.writeFileSync(clientFilePath, sourceBuffer);

    const now = new Date().toISOString();
    const fileId = await getNextNumericId('client_files');

    const fileDoc = {
      _id: fileId,
      id: fileId,
      client_id: targetClientId,
      filename: storedFilename,
      original_filename: originalFilename,
      file_path: clientFilePath,
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
      { id: targetClientId },
      { $set: { last_activity_date: now, updated_at: now } }
    );

    await db.collection('message_attachments').updateOne(
      { id: attachmentId },
      {
        $set: {
          last_saved_client_id: targetClientId,
          last_saved_client_file_id: fileId,
          last_saved_at: now,
          updated_at: now,
        },
      }
    );

    invalidateMongoCache();
    return createSuccessResponse({
      success: true,
      clientId: targetClientId,
      file: stripMongoId(fileDoc),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to save attachment to client');
  }
}
