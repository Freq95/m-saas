import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAvailableSlots, getSuggestedSlots } from '@/lib/calendar';

// GET /api/calendar/slots - Get available time slots
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || '1';
    const date = searchParams.get('date');
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
      const suggestions = await getSuggestedSlots(parseInt(userId), serviceDuration);
      return NextResponse.json({
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
      const slots = await getAvailableSlots(parseInt(userId), new Date(date), serviceDuration);
      return NextResponse.json({
        slots: slots.map(slot => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          available: slot.available,
        })),
      });
    } else {
      return NextResponse.json(
        { error: 'Either date or suggested=true must be provided' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error fetching slots:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

