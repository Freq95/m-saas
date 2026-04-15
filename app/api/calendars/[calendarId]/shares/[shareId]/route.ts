import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCalendarAuth, normalizeCalendarPermissions } from '@/lib/calendar-auth';
import { getCalendarDentistColorState } from '@/lib/calendar-dentists';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkUpdateRateLimit } from '@/lib/rate-limit';

function parseId(raw: string, label: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function shareBelongsToCurrentUser(share: any, auth: Awaited<ReturnType<typeof getAuthUser>>): boolean {
  return (
    (share.shared_with_user_id instanceof ObjectId && share.shared_with_user_id.equals(auth.dbUserId)) ||
    (typeof share.shared_with_email === 'string' && share.shared_with_email === auth.email.toLowerCase().trim())
  );
}

async function loadCalendarShare(calendarId: number, shareId: number) {
  const db = await getMongoDbOrThrow();
  const share = await db.collection('calendar_shares').findOne({
    id: shareId,
    calendar_id: calendarId,
  });
  return { db, share };
}

// PATCH /api/calendars/[calendarId]/shares/[shareId] - Update share permissions/color
export async function PATCH(request: NextRequest, props: { params: Promise<{ calendarId: string; shareId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, tenantId, dbUserId } = auth;
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;

    const calendarId = parseId(params.calendarId, 'calendar');
    const shareId = parseId(params.shareId, 'share');
    if (!calendarId || !shareId) {
      return createErrorResponse('Invalid share reference', 400);
    }

    const calendarAuth = await getCalendarAuth(auth, calendarId);
    if (!calendarAuth.isOwner) {
      return createErrorResponse('Only the calendar owner can manage shares', 403);
    }

    const body = await request.json();
    const { updateCalendarShareSchema } = await import('@/lib/validation');
    const validationResult = updateCalendarShareSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(validationResult.error.errors[0]?.message || 'Invalid input', 400);
    }

    const { db, share } = await loadCalendarShare(calendarId, shareId);
    if (!share) {
      return createErrorResponse('Share not found', 404);
    }

    const updates: Record<string, unknown> = {};
    if (validationResult.data.permissions !== undefined) {
      updates.permissions = normalizeCalendarPermissions(validationResult.data.permissions);
    }
    if (validationResult.data.dentistColor !== undefined) {
      const colorState = await getCalendarDentistColorState(calendarId, { excludeShareId: shareId });
      if (colorState.ownerNeedsPaletteNormalization) {
        return createErrorResponse(
          'Alege mai intai o culoare presetata pentru owner in modul Dentisti.',
          409
        );
      }
      if (colorState.reservedPaletteColors.includes(validationResult.data.dentistColor)) {
        return createErrorResponse('Aceasta culoare este deja folosita pe acest calendar', 409);
      }
      updates.dentist_color = validationResult.data.dentistColor;
    }
    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    await db.collection('calendar_shares').updateOne(
      { id: shareId, calendar_id: calendarId },
      { $set: updates }
    );

    const updatedShare = await db.collection('calendar_shares').findOne({
      id: shareId,
      calendar_id: calendarId,
    });

    await invalidateReadCaches({
      tenantId,
      userId,
      calendarId,
      viewerDbUserId: dbUserId,
    });

    return createSuccessResponse({ share: updatedShare ? stripMongoId(updatedShare) : stripMongoId(share) });
  } catch (error) {
    return handleApiError(error, 'Failed to update calendar share');
  }
}

// DELETE /api/calendars/[calendarId]/shares/[shareId] - Revoke or self-remove a share
export async function DELETE(_request: NextRequest, props: { params: Promise<{ calendarId: string; shareId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, tenantId, dbUserId } = auth;
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;

    const calendarId = parseId(params.calendarId, 'calendar');
    const shareId = parseId(params.shareId, 'share');
    if (!calendarId || !shareId) {
      return createErrorResponse('Invalid share reference', 400);
    }

    const calendarAuth = await getCalendarAuth(auth, calendarId);
    const { db, share } = await loadCalendarShare(calendarId, shareId);
    if (!share) {
      return createErrorResponse('Share not found', 404);
    }

    const isOwner = calendarAuth.isOwner;
    const isRecipient = shareBelongsToCurrentUser(share, auth);
    if (!isOwner && !isRecipient) {
      return createErrorResponse('Not authorized to remove this share', 403);
    }

    const now = new Date().toISOString();
    await db.collection('calendar_shares').updateOne(
      { id: shareId, calendar_id: calendarId },
      {
        $set: {
          status: 'revoked',
          expires_at: null,
          invite_token_hash: null,
          updated_at: now,
        },
      }
    );

    await invalidateReadCaches({
      tenantId,
      userId,
      calendarId,
      viewerDbUserId: dbUserId,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, 'Failed to delete calendar share');
  }
}
