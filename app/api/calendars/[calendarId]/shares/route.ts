import { NextRequest } from 'next/server';
import {
  getCalendarAuth,
  getCalendarById,
  normalizeCalendarPermissions,
} from '@/lib/calendar-auth';
import { createCalendarShareInviteToken, sendCalendarShareInviteEmail } from '@/lib/calendar-share-invite';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';

function parseCalendarId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function requireOwnerCalendar(auth: Awaited<ReturnType<typeof getAuthUser>>, calendarId: number) {
  const calendarAuth = await getCalendarAuth(auth, calendarId);
  if (!calendarAuth.isOwner) {
    throw new Error('FORBIDDEN_OWNER_ONLY');
  }
  const calendar = await getCalendarById(calendarId);
  if (!calendar) {
    throw new Error('Calendar not found');
  }
  return calendar;
}

// GET /api/calendars/[calendarId]/shares - List shares for a calendar
export async function GET(_request: NextRequest, props: { params: Promise<{ calendarId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const calendarId = parseCalendarId(params.calendarId);
    if (!calendarId) {
      return createErrorResponse('Invalid calendar ID', 400);
    }

    await requireOwnerCalendar(auth, calendarId);
    const db = await getMongoDbOrThrow();
    const shareDocs = await db.collection('calendar_shares').find({
      calendar_id: calendarId,
    }).sort({ created_at: -1 }).toArray();

    const userIds = shareDocs
      .map((share: any) => share.shared_with_user_id)
      .filter(Boolean);
    const users = userIds.length > 0
      ? await db.collection('users').find({ _id: { $in: userIds } }).toArray()
      : [];
    const userById = new Map<string, any>(users.map((user: any) => [String(user._id), user]));

    const shares = shareDocs.map((share: any) => ({
      ...stripMongoId(share),
      permissions: normalizeCalendarPermissions(share.permissions),
      recipientName: share.shared_with_user_id ? userById.get(String(share.shared_with_user_id))?.name || null : null,
    }));

    return createSuccessResponse({ shares });
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN_OWNER_ONLY') {
      return createErrorResponse('Only the calendar owner can manage shares', 403);
    }
    return handleApiError(error, 'Failed to fetch calendar shares');
  }
}

// POST /api/calendars/[calendarId]/shares - Create a share invite
export async function POST(request: NextRequest, props: { params: Promise<{ calendarId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId, email, name } = auth;
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;
    const calendarId = parseCalendarId(params.calendarId);
    if (!calendarId) {
      return createErrorResponse('Invalid calendar ID', 400);
    }

    const body = await request.json();
    const { createCalendarShareSchema } = await import('@/lib/validation');
    const validationResult = createCalendarShareSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(validationResult.error.errors[0]?.message || 'Invalid input', 400);
    }

    const { email: sharedEmail, permissions } = validationResult.data;
    if (sharedEmail === email.toLowerCase().trim()) {
      return createErrorResponse('Nu poti partaja calendarul cu tine insuti', 400);
    }

    const calendar = await requireOwnerCalendar(auth, calendarId);
    const db = await getMongoDbOrThrow();

    const duplicateShare = await db.collection('calendar_shares').findOne({
      calendar_id: calendarId,
      shared_with_email: sharedEmail,
      status: { $in: ['pending', 'accepted'] },
    });
    if (duplicateShare) {
      return createErrorResponse('Acest calendar este deja partajat cu aceasta adresa de email', 409);
    }

    const existingUser = await db.collection('users').findOne({
      email: sharedEmail,
      status: { $ne: 'deleted' },
    });

    if (existingUser?._id && String(existingUser._id) === String(dbUserId)) {
      return createErrorResponse('Nu poti partaja calendarul cu tine insuti', 400);
    }

    const nowIso = new Date().toISOString();
    const shareId = await getNextNumericId('calendar_shares');
    const invite = createCalendarShareInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const shareDoc = {
      _id: shareId,
      id: shareId,
      calendar_id: calendar.id,
      calendar_tenant_id: calendar.tenant_id,
      shared_with_user_id: existingUser?._id || null,
      shared_with_numeric_user_id: typeof existingUser?.id === 'number' ? existingUser.id : null,
      shared_with_email: sharedEmail,
      shared_with_tenant_id: existingUser?.tenant_id || null,
      permissions: normalizeCalendarPermissions(permissions),
      dentist_display_name: typeof existingUser?.name === 'string' && existingUser.name.trim()
        ? existingUser.name.trim()
        : sharedEmail,
      status: 'pending',
      invite_token_hash: invite.tokenHash,
      expires_at: expiresAt,
      shared_by_user_id: dbUserId,
      shared_by_name: name || email,
      created_at: nowIso,
      updated_at: nowIso,
      accepted_at: null,
    };

    await db.collection<FlexDoc>('calendar_shares').insertOne(shareDoc as unknown as FlexDoc);

    const emailDelivery = await sendCalendarShareInviteEmail({
      to: sharedEmail,
      inviterName: name || email,
      calendarName: calendar.name,
      token: invite.token,
    });

    await invalidateReadCaches({
      tenantId,
      userId,
      calendarId,
      viewerDbUserId: dbUserId,
    });

    return createSuccessResponse(
      {
        message: 'Invitatie trimisa',
        share: stripMongoId(shareDoc),
        emailDelivery: {
          sent: emailDelivery.ok,
          reason: emailDelivery.ok ? 'sent' : emailDelivery.reason,
        },
      },
      201
    );
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN_OWNER_ONLY') {
      return createErrorResponse('Only the calendar owner can manage shares', 403);
    }
    return handleApiError(error, 'Failed to create calendar share');
  }
}
