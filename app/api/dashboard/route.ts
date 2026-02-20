import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/error-handler';
import { getDashboardData } from '@/lib/server/dashboard';
import { getAuthUser } from '@/lib/auth-helpers';

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
    const data = await getDashboardData(Number(userId), tenantId, Number(days));
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch dashboard data');
  }
}

