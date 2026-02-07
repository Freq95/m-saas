import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/error-handler';
import { getDashboardData } from '@/lib/server/dashboard';

// GET /api/dashboard - Get dashboard statistics
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Validate query parameters
    const { dashboardQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: searchParams.get('userId') || '1',
      days: searchParams.get('days') || '7',
    };
    
    const validationResult = dashboardQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }
    
    const { userId, days } = validationResult.data;
    const data = await getDashboardData(Number(userId), Number(days));
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch dashboard data');
  }
}

