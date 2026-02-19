import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { linkConversationToClient } from '@/lib/client-matching';
import { parseStoredMessage, serializeMessage } from '@/lib/email-types';
import * as fs from 'fs';
import * as path from 'path';

const CLIENT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'clients');

if (!fs.existsSync(CLIENT_UPLOAD_DIR)) {
  fs.mkdirSync(CLIENT_UPLOAD_DIR, { recursive: true });
}

function extensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
  };
  return map[mimeType] || 'bin';
}

// POST /api/conversations/[id]/images/save
// Body: { messageId: number, imageIndex: number, clientId?: number, createClient?: boolean }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const conversationId = parseInt(params.id, 10);
    if (Number.isNaN(conversationId) || conversationId <= 0) {
      return createErrorResponse('Invalid conversation ID', 400);
    }

    const body = await request.json().catch(() => ({}));
    const messageId = Number(body?.messageId);
    const imageIndex = Number(body?.imageIndex);
    const requestedClientId = typeof body?.clientId === 'number' ? body.clientId : null;
    const createClient = Boolean(body?.createClient);

    if (!Number.isFinite(messageId) || messageId <= 0) {
      return createErrorResponse('messageId is required', 400);
    }
    if (!Number.isFinite(imageIndex) || imageIndex < 0) {
      return createErrorResponse('imageIndex is required', 400);
    }

    const conversation = await db.collection('conversations').findOne({ id: conversationId });
    if (!conversation) {
      return createErrorResponse('Conversation not found', 404);
    }

    const message = await db.collection('messages').findOne({ id: messageId, conversation_id: conversationId });
    if (!message) {
      return createErrorResponse('Message not found', 404);
    }

    const stored = parseStoredMessage(message.content || '');
    const images = Array.isArray(stored.images) ? stored.images : [];
    const targetImage = images[imageIndex];
    if (!targetImage) {
      return createErrorResponse('Inline image not found', 404);
    }

    const mimeType = targetImage.contentType || 'application/octet-stream';
    if (!mimeType.startsWith('image/')) {
      return createErrorResponse('Selected content is not an image', 400);
    }

    let imageBuffer: Buffer | null = null;
    if (typeof targetImage.data === 'string' && targetImage.data.length > 0) {
      imageBuffer = Buffer.from(targetImage.data, 'base64');
    } else if (typeof targetImage.url === 'string' && targetImage.url.startsWith('data:')) {
      const commaPos = targetImage.url.indexOf(',');
      if (commaPos > -1) {
        imageBuffer = Buffer.from(targetImage.url.substring(commaPos + 1), 'base64');
      }
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return createErrorResponse('Inline image data is not available for saving', 400);
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
      await linkConversationToClient(conversationId, targetClientId);
    }

    const markImageAsSaved = async (savedClientId: number, savedFileId: number, savedAt: string) => {
      const updatedStored = {
        ...stored,
        images: images.map((img: any, idx: number) => {
          if (idx !== imageIndex) {
            return img;
          }
          return {
            ...img,
            last_saved_client_id: savedClientId,
            last_saved_client_file_id: savedFileId,
            last_saved_at: savedAt,
          };
        }),
      };

      await db.collection('messages').updateOne(
        { id: messageId, conversation_id: conversationId },
        {
          $set: {
            content: serializeMessage(updatedStored),
            updated_at: savedAt,
          },
        }
      );
    };

    if (
      targetImage.last_saved_client_id === targetClientId &&
      typeof targetImage.last_saved_client_file_id === 'number'
    ) {
      const existingByLastSaved = await db.collection('client_files').findOne({
        id: targetImage.last_saved_client_file_id,
        client_id: targetClientId,
      });
      if (existingByLastSaved) {
        const now = new Date().toISOString();
        await markImageAsSaved(targetClientId, existingByLastSaved.id, now);
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
      source_type: 'conversation_inline_image',
      source_conversation_id: conversationId,
      source_message_id: messageId,
      source_image_index: imageIndex,
    });
    if (existingDuplicate) {
      const now = new Date().toISOString();
      await markImageAsSaved(targetClientId, existingDuplicate.id, now);
      return createSuccessResponse({
        success: true,
        alreadySaved: true,
        clientId: targetClientId,
        file: stripMongoId(existingDuplicate),
      });
    }

    const extension = extensionFromMimeType(mimeType);
    const originalFilename = `inline-image-${messageId}-${imageIndex + 1}.${extension}`;
    const storedFilename = `${targetClientId}_${Date.now()}_${originalFilename}`;
    const clientFilePath = path.join(CLIENT_UPLOAD_DIR, storedFilename);

    fs.writeFileSync(clientFilePath, imageBuffer);

    const now = new Date().toISOString();
    const fileId = await getNextNumericId('client_files');
    const fileDoc = {
      _id: fileId,
      id: fileId,
      client_id: targetClientId,
      filename: storedFilename,
      original_filename: originalFilename,
      file_path: clientFilePath,
      file_size: imageBuffer.length,
      mime_type: mimeType,
      description: `Saved inline image from conversation #${conversationId}`,
      source_type: 'conversation_inline_image',
      source_conversation_id: conversationId,
      source_message_id: messageId,
      source_image_index: imageIndex,
      created_at: now,
      updated_at: now,
    };

    await db.collection('client_files').insertOne(fileDoc);
    await db.collection('clients').updateOne(
      { id: targetClientId },
      { $set: { last_activity_date: now, updated_at: now } }
    );

    await markImageAsSaved(targetClientId, fileId, now);

    invalidateMongoCache();
    return createSuccessResponse({
      success: true,
      clientId: targetClientId,
      file: stripMongoId(fileDoc),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to save inline image to client');
  }
}
