import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAvailableSlots, getSuggestedSlots } from '@/lib/calendar';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// GET /api/calendar/slots - Get available time slots
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Validate query parameters
    const { calendarSlotsQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: searchParams.get('userId') || '1',
      date: searchParams.get('date') || undefined,
    };
    
    const validationResult = calendarSlotsQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }
    
    const { userId, date } = validationResult.data;
    const serviceId = searchParams.get('serviceId');
    const suggested = searchParams.get('suggested') === 'true';

    const db = getDb();

    // Get service duration
    let serviceDuration = 60; // default
    if (serviceId) {
      const serviceResult = await db.query(
        'SELECT duration_minutes FROM services WHERE id = $1',
        [serviceId]
      );
      if (serviceResult.rows.length > 0) {
        serviceDuration = serviceResult.rows[0].duration_minutes;
      }
    }

    if (suggested) {
      // Get 2-3 suggested slots for next few days
      const suggestions = await getSuggestedSlots(userId, serviceDuration);
      return createSuccessResponse({
        suggestions: suggestions.map(s => ({
          date: s.date.toISOString(),
          slots: s.slots.map(slot => ({
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            available: slot.available,
          })),
        })),
      });
    } else if (date) {
      // Get slots for specific date
      const slots = await getAvailableSlots(userId, new Date(date), serviceDuration);
      return createSuccessResponse({
        slots: slots.map(slot => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          available: slot.available,
        })),
      });
    } else {
      return createErrorResponse(
        'Either date or suggested=true must be provided',
        400
      );
    }
  } catch (error) {
    return handleApiError(error, 'Failed to fetch slots');
  }
}

