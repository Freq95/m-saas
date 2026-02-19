import { NextRequest } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getAvailableSlots, getSuggestedSlots } from '@/lib/calendar';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/calendar/slots - Get available time slots
export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser();
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const { calendarSlotsQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: String(userId),
      date: searchParams.get('date') || undefined,
      providerId: searchParams.get('providerId') || undefined,
      resourceId: searchParams.get('resourceId') || undefined,
    };

    const validationResult = calendarSlotsQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }

    const { date, providerId, resourceId } = validationResult.data;
    const serviceId = searchParams.get('serviceId');
    const suggested = searchParams.get('suggested') === 'true';

    const db = await getMongoDbOrThrow();

    // Get service duration
    let serviceDuration = 60; // default
    if (serviceId) {
      const serviceDoc = await db.collection('services').findOne({ id: Number(serviceId) });
      if (serviceDoc?.duration_minutes) {
        serviceDuration = serviceDoc.duration_minutes;
      }
    }

    if (suggested) {
      // Get 2-3 suggested slots for next few days
      const suggestions = await getSuggestedSlots(userId, serviceDuration, 7, {
        providerId,
        resourceId,
      });
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
      const slots = await getAvailableSlots(userId, new Date(date), serviceDuration, { start: '09:00', end: '18:00' }, {
        providerId,
        resourceId,
      });
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
