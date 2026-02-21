import { NextRequest } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getDashboardData } from '@/lib/server/dashboard';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { dashboardCacheKey } from '@/lib/cache-keys';

// GET /api/dashboard - Get dashboard statistics
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const searchParams = request.nextUrl.searchParams;
    
    // Validate query parameters
    const { dashboardQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: String(userId),
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
    return createSuccessResponse(data);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch dashboard data');
  }
}

