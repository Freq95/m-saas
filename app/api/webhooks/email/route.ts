import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { linkConversationToClient } from '@/lib/client-matching';
import { handleApiError, createErrorResponse, createSuccessResponse } from '@/lib/error-handler';

function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || !signature) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

// POST /api/webhooks/email - Webhook for receiving emails (Gmail/Outlook)
export async function POST(request: NextRequest) {
  try {
    if (!process.env.WEBHOOK_SECRET) {
      return createErrorResponse('Webhook endpoint is disabled', 503);
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-webhook-signature') ?? '';
    if (!verifyWebhookSignature(rawBody, signature)) {
      return createErrorResponse('Unauthorized', 401);
    }

    const db = await getMongoDbOrThrow();
    const body = JSON.parse(rawBody);
    const { userId, from, to, subject, text, html } = body;
    const normalizedUserId = Number.parseInt(String(userId || ''), 10);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
      throw new Error('Webhook payload must include a valid numeric userId');
    }
    const userDoc = await db.collection('users').findOne({ id: normalizedUserId });
    if (!userDoc?.tenant_id) {
      throw new Error('Webhook user has no tenant');
    }
    const tenantId = userDoc.tenant_id;

    // Extract contact info
    const emailMatch = from.match(/<(.+)>/);
    const email = emailMatch ? emailMatch[1] : from;
    const name = from.replace(/<.+>/, '').trim() || email.split('@')[0];

    // Look up an existing client by email only — never auto-create from incoming mail.
    // Spam, newsletters, and automated notifications would otherwise pollute the client list.
    // Client records are created manually by the user.
    let clientId: number | null = null;
    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingClientDoc = await db.collection('clients').findOne({
      user_id: normalizedUserId,
      tenant_id: tenantId,
      email: { $regex: `^${escapedEmail}$`, $options: 'i' },
    });
    if (existingClientDoc) {
      clientId = existingClientDoc.id;
    }

    const existingConv = await db
      .collection('conversations')
      .find({ user_id: normalizedUserId, tenant_id: tenantId, channel: 'email', contact_email: email })
      .sort({ created_at: -1 })
      .limit(1)
      .next();

    let conversationId: number;

    if (existingConv) {
      conversationId = existingConv.id;
      // Link to client if a matching client was found and conversation isn't linked yet
      if (!existingConv.client_id && clientId) {
        await linkConversationToClient(conversationId, clientId, tenantId);
      }
    } else {
      const now = new Date().toISOString();
      conversationId = await getNextNumericId('conversations');
      await db.collection('conversations').insertOne({
        _id: conversationId,
        id: conversationId,
        user_id: normalizedUserId,
        tenant_id: tenantId,
        channel: 'email',
        contact_name: name,
        contact_email: email,
        subject: subject || null,
        client_id: clientId,
        created_at: now,
        updated_at: now,
      });
      if (clientId) {
        await linkConversationToClient(conversationId, clientId, tenantId);
      }
    }

    const now = new Date().toISOString();
    const content = text || html?.replace(/<[^>]*>/g, '') || '';
    const messageId = await getNextNumericId('messages');
    await db.collection('messages').insertOne({
      _id: messageId,
      id: messageId,
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'inbound',
      content,
      is_read: false,
      sent_at: now,
      created_at: now,
    });

    return createSuccessResponse({ success: true, conversationId });
  } catch (error) {
    return handleApiError(error, 'Failed to process email webhook');
  }
}
