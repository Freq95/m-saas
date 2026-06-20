import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import {
  createAvailabilityBlock,
  listAvailabilityBlocks,
} from '@/lib/availability-blocks';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import {
  availabilityBlocksQuerySchema,
  createAvailabilityBlockSchema,
} from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const query = availabilityBlocksQuerySchema.safeParse({
      startDate: request.nextUrl.searchParams.get('startDate') || undefined,
      endDate: request.nextUrl.searchParams.get('endDate') || undefined,
      calendarIds: request.nextUrl.searchParams.get('calendarIds') || undefined,
    });
    if (!query.success) {
      return createErrorResponse(query.error.errors[0]?.message || 'Invalid input', 400);
    }

    const blocks = await listAvailabilityBlocks({
      auth,
      calendarIds: query.data.calendarIds || [],
      startTime: new Date(query.data.startDate),
      endTime: new Date(query.data.endDate),
    });

    return createSuccessResponse({ blocks });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch availability blocks');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const limited = await checkWriteRateLimit(auth.userId);
    if (limited) return limited;

    const body = await request.json();
    const parsed = createAvailabilityBlockSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(parsed.error.errors[0]?.message || 'Invalid input', 400);
    }

    const result = await createAvailabilityBlock({
      auth,
      typeLabel: parsed.data.typeLabel,
      reason: parsed.data.reason,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      allDay: parsed.data.allDay,
    });

    return createSuccessResponse({
      block: result.block,
      warning: result.overlappingAppointments.length > 0
        ? 'Blocajul a fost salvat, dar există programări în acest interval.'
        : null,
      overlappingAppointments: result.overlappingAppointments,
    }, 201);
  } catch (error: any) {
    if (error?.message === 'INVALID_TIME_RANGE') {
      return createErrorResponse('Intervalul nu este valid.', 400);
    }
    if (error?.message === 'FORBIDDEN_CREATE') {
      return createErrorResponse('Nu ai permisiunea să creezi blocaje în acest calendar.', 403);
    }
    return handleApiError(error, 'Failed to create availability block');
  }
}
