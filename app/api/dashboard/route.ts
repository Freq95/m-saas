import { NextRequest } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getDashboardData } from '@/lib/server/dashboard';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { dashboardCacheKey } from '@/lib/cache-keys';
import { logDataAccess } from '@/lib/audit';

// GET /api/dashboard - Get dashboard statistics
export async function GET(request: NextRequest) {
  try {
    const { userId, dbUserId, tenantId, email, role } = await getAuthUser();
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
    const cacheKey = dashboardCacheKey({ tenantId, userId }, numericDays);
    const data = await getCached(cacheKey, 900, async () =>
      getDashboardData(userId, tenantId, numericDays)
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
      },
    });
    return createSuccessResponse(data);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch dashboard data');
  }
}

