import { NextRequest } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getDashboardData } from '@/lib/server/dashboard';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { dashboardVisibleCalendarsCacheKey } from '@/lib/cache-keys';
import { logDataAccess } from '@/lib/audit';
import { getCalendarListForUser } from '@/lib/server/calendars-list';

// GET /api/dashboard - Get dashboard statistics
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId, email, role } = auth;
    const searchParams = request.nextUrl.searchParams;
    
    // Validate query parameters
    const { dashboardQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      days: searchParams.get('days') || '7',
    };
    
    const validationResult = dashboardQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }
    
    const { days } = validationResult.data;
    const numericDays = Number(days);
    const calendarList = await getCalendarListForUser(auth);
    const visibleCalendarIds = [
      ...calendarList.ownCalendars,
      ...calendarList.sharedCalendars,
    ]
      .map((calendar: any) => calendar.id)
      .filter((id: unknown): id is number => typeof id === 'number');
    const dashboardUserIds = role === 'asistent' && auth.assigned_dentist_user_ids?.length
      ? auth.assigned_dentist_user_ids
      : [userId];
    const cacheKey = dashboardVisibleCalendarsCacheKey({ tenantId, userId }, numericDays, visibleCalendarIds);
    const data = await getCached(cacheKey, 900, async () =>
      getDashboardData(userId, tenantId, numericDays, visibleCalendarIds, dashboardUserIds)
    );

    await logDataAccess({
      actorUserId: dbUserId,
      actorEmail: email,
      actorRole: role,
      tenantId,
      targetType: 'dashboard',
      targetId: userId,
      route: '/api/dashboard',
      request,
      metadata: {
        days: numericDays,
        calendarIds: visibleCalendarIds,
      },
    });
    return createSuccessResponse(data);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch dashboard data');
  }
}
