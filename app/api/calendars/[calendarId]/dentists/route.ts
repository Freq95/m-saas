import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getBookableDentistsForCalendar } from '@/lib/calendar-dentists';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';

function parseCalendarId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(_request: NextRequest, props: { params: Promise<{ calendarId: string }> }) {
  const params = await props.params;

  try {
    const auth = await getAuthUser();
    const calendarId = parseCalendarId(params.calendarId);
    if (!calendarId) {
      return createErrorResponse('Invalid calendar ID', 400);
    }

    const dentists = await getBookableDentistsForCalendar(auth, calendarId);

    return createSuccessResponse({
      dentists: dentists.map((dentist) => ({
        userId: dentist.userId,
        dbUserId: dentist.dbUserId.toString(),
        displayName: dentist.displayName,
        isOwner: dentist.isOwner,
        isCurrentUser: dentist.isCurrentUser,
      })),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch calendar dentists');
  }
}
