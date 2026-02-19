import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
import { generateResponse } from '@/lib/ai-agent';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuggestedSlots } from '@/lib/calendar';
import { parseStoredMessage } from '@/lib/email-types';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/conversations/[id]/suggest-response - Get AI suggested response
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const conversationId = parseInt(params.id);

    // Validate ID
    if (isNaN(conversationId) || conversationId <= 0) {
      return createErrorResponse('Invalid conversation ID', 400);
    }

    // Get conversation
    const convDoc = await db.collection('conversations').findOne({ id: conversationId, user_id: userId });
    if (!convDoc) {
      return createErrorResponse('Conversation not found', 404);
    }

    // Get last message from conversation
    const lastMessageDoc = await db
      .collection('messages')
      .find({ conversation_id: conversationId })
      .sort({ sent_at: -1, created_at: -1, id: -1 })
      .limit(1)
      .next();

    let lastMessage = '';
    if (lastMessageDoc) {
      const stored = parseStoredMessage(lastMessageDoc.content || '');
      lastMessage = stored.text || stored.html || '';
    }

    // Get available time slots for appointment suggestions
    let availableSlots: Array<{ start: string; end: string }> = [];
    try {
      const slots = await getSuggestedSlots(userId, 60, 7); // 60 min default, next 7 days
      availableSlots = slots
        .flatMap(s => s.slots.filter(slot => slot.available))
        .slice(0, 3)
        .map(s => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
        }));
    } catch (slotError) {
      const { logger } = await import('@/lib/logger');
      logger.warn('Error fetching available slots', { error: slotError instanceof Error ? slotError.message : String(slotError) });
      // Continue without slots - not critical
    }

    // Generate AI response using the real implementation
    // If no API key is configured, skip AI call and return a safe fallback.
    let suggestedResponse: string;
    if (!process.env.OPENAI_API_KEY) {
      suggestedResponse = 'Multumim pentru mesaj! Va vom raspunde in cel mai scurt timp.';
    } else {
      try {
        suggestedResponse = await generateResponse(
          conversationId,
          lastMessage || 'Salut!',
          undefined, // businessInfo - could be enhanced later
          availableSlots
        );
      } catch (aiError) {
        const { logger } = await import('@/lib/logger');
        logger.error('Error generating AI response', aiError instanceof Error ? aiError : new Error(String(aiError)), { conversationId });

        // Fallback to mock response if OpenAI fails for any reason
        // This handles: missing API key, rate limits, network errors, etc.
        suggestedResponse = 'Multumim pentru mesaj! Va vom raspunde in cel mai scurt timp.';
      }
    }

    return createSuccessResponse({
      suggestedResponse,
      availableSlots,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to generate suggested response');
  }
}
