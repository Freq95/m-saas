import { NextRequest, NextResponse } from 'next/server';
import { generateResponse } from '@/lib/ai-agent';
import { getDb } from '@/lib/db';
import { getSuggestedSlots } from '@/lib/calendar';
import { parseStoredMessage } from '@/lib/email-types';

// GET /api/conversations/[id]/suggest-response - Get AI suggested response
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const conversationId = parseInt(params.id);
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || '1');

    // Get conversation
    const convResult = await db.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );

    if (convResult.rows.length === 0) {
      return NextResponse.json(
        { suggestedResponse: null, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const conversation = convResult.rows[0];

    // Get last message from conversation
    const messagesResult = await db.query(
      `SELECT * FROM messages 
       WHERE conversation_id = $1 
       ORDER BY sent_at DESC 
       LIMIT 1`,
      [conversationId]
    );

    let lastMessage = '';
    if (messagesResult.rows.length > 0) {
      const stored = parseStoredMessage(messagesResult.rows[0].content || '');
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
      console.warn('Error fetching available slots:', slotError);
      // Continue without slots - not critical
    }

    // Generate AI response using the real implementation
    let suggestedResponse: string;
    try {
      suggestedResponse = await generateResponse(
        conversationId,
        lastMessage || 'Salut!',
        undefined, // businessInfo - could be enhanced later
        availableSlots
      );
    } catch (aiError: any) {
      console.error('Error generating AI response:', aiError);
      
      // Fallback to mock response if OpenAI fails
      if (aiError.message?.includes('API key') || !process.env.OPENAI_API_KEY) {
        suggestedResponse = 'Mulțumim pentru mesaj! Vă vom răspunde în cel mai scurt timp.';
      } else {
        throw aiError;
      }
    }

    return NextResponse.json({
      suggestedResponse,
      availableSlots,
    });
  } catch (error: any) {
    console.error('Error generating suggested response:', error);
    return NextResponse.json(
      { 
        suggestedResponse: null, 
        error: error.message || 'Failed to generate response',
        availableSlots: []
      },
      { status: 500 }
    );
  }
}

