import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import {
  deleteAvailabilityBlock,
  updateAvailabilityBlock,
} from '@/lib/availability-blocks';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { updateAvailabilityBlockSchema } from '@/lib/validation';

function parseBlockId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const blockId = parseBlockId(params.id);
    if (!blockId) return createErrorResponse('Invalid block ID', 400);

    const body = await request.json();
    const parsed = updateAvailabilityBlockSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(parsed.error.errors[0]?.message || 'Invalid input', 400);
    }

    const result = await updateAvailabilityBlock({
      auth,
      blockId,
      patch: {
        typeLabel: parsed.data.typeLabel,
        reason: parsed.data.reason,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        allDay: parsed.data.allDay,
      },
    });

    return createSuccessResponse({
      block: result.block,
      warning: result.overlappingAppointments.length > 0
        ? 'Blocajul a fost salvat, dar exista programari in acest interval.'
        : null,
      overlappingAppointments: result.overlappingAppointments,
    });
  } catch (error: any) {
    if (error?.message === 'NOT_FOUND') return createErrorResponse('Blocajul nu a fost gasit.', 404);
    if (error?.message === 'INVALID_TIME_RANGE') return createErrorResponse('Intervalul nu este valid.', 400);
    if (error?.message === 'FORBIDDEN_EDIT') return createErrorResponse('Nu ai permisiunea sa modifici acest blocaj.', 403);
    return handleApiError(error, 'Failed to update availability block');
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const blockId = parseBlockId(params.id);
    if (!blockId) return createErrorResponse('Invalid block ID', 400);

    await deleteAvailabilityBlock({ auth, blockId });
    return createSuccessResponse({ success: true });
  } catch (error: any) {
    if (error?.message === 'NOT_FOUND') return createErrorResponse('Blocajul nu a fost gasit.', 404);
    if (error?.message === 'FORBIDDEN_DELETE') return createErrorResponse('Nu ai permisiunea sa stergi acest blocaj.', 403);
    return handleApiError(error, 'Failed to delete availability block');
  }
}
