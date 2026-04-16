import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/lib/auth';
import { hashCalendarShareToken } from '@/lib/calendar-share-invite';
import { getAuthUser } from '@/lib/auth-helpers';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function isExpired(value: unknown): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

async function getOptionalAuthUser() {
  try {
    return await getAuthUser();
  } catch {
    return null;
  }
}

async function buildUniqueTenantSlug(db: any, clinicName: string): Promise<string> {
  const baseSlug = slugify(clinicName) || 'calendar-share-clinic';
  let candidate = baseSlug;
  let suffix = 2;

  while (await db.collection('tenants').findOne({ slug: candidate })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function createRecipientAccount(db: any, params: { email: string; name: string; password: string }) {
  const nowIso = new Date().toISOString();
  const tenantId = new ObjectId();
  const userObjectId = new ObjectId();
  const userNumericId = await getNextNumericId('users');
  const passwordHash = await bcrypt.hash(params.password, 12);
  const clinicName = `Cabinet ${params.name.trim()}`;
  const slug = await buildUniqueTenantSlug(db, clinicName);

  const tenantDoc = {
    _id: tenantId,
    name: clinicName,
    slug,
    owner_id: userObjectId,
    plan: 'free',
    max_seats: 1,
    status: 'active',
    settings: {
      timezone: 'Europe/Bucharest',
      currency: 'RON',
      working_hours: {},
    },
    created_at: nowIso,
    updated_at: nowIso,
  };

  const userDoc = {
    _id: userObjectId,
    id: userNumericId,
    email: params.email,
    password_hash: passwordHash,
    name: params.name.trim(),
    role: 'owner',
    tenant_id: tenantId,
    status: 'active',
    session_version: 0,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const membershipDoc = {
    _id: new ObjectId(),
    tenant_id: tenantId,
    user_id: userObjectId,
    role: 'owner',
    status: 'active',
    invited_at: nowIso,
    accepted_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };

  await db.collection('tenants').insertOne(tenantDoc);
  await db.collection('users').insertOne(userDoc);
  await db.collection('team_members').insertOne(membershipDoc);

  return {
    tenantId,
    userObjectId,
    userNumericId,
    userName: userDoc.name,
  };
}

async function cleanupRecipientAccount(db: any, account: {
  tenantId: ObjectId;
  userObjectId: ObjectId;
}) {
  await Promise.allSettled([
    db.collection('team_members').deleteMany({ tenant_id: account.tenantId, user_id: account.userObjectId }),
    db.collection('users').deleteOne({ _id: account.userObjectId, tenant_id: account.tenantId }),
    db.collection('tenants').deleteOne({ _id: account.tenantId }),
  ]);
}

function shareMatchesAuthUser(share: any, authUser: Awaited<ReturnType<typeof getOptionalAuthUser>>) {
  if (!authUser) return false;
  return (
    (share.shared_with_user_id instanceof ObjectId && share.shared_with_user_id.equals(authUser.dbUserId)) ||
    (typeof share.shared_with_email === 'string' && share.shared_with_email === authUser.email.toLowerCase().trim())
  );
}

async function resolveShareByToken(db: any, token: string) {
  return db.collection('calendar_shares').findOne({
    invite_token_hash: hashCalendarShareToken(token),
  });
}

async function resolveShareByPayload(db: any, payload: { token?: string; shareId?: number }) {
  if (payload.token) {
    return resolveShareByToken(db, payload.token);
  }
  if (typeof payload.shareId === 'number') {
    return db.collection('calendar_shares').findOne({ id: payload.shareId });
  }
  return null;
}

// GET /api/calendar-shares/accept?token=... - Preview invite
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')?.trim();
    if (!token) {
      return createErrorResponse('Token is required', 400);
    }

    const db = await getMongoDbOrThrow();
    const share = await resolveShareByToken(db, token);
    if (!share) {
      return createErrorResponse('Invitatie invalida sau expirata', 404);
    }
    if (share.status !== 'pending') {
      return createErrorResponse('Invitatie deja procesata', 409);
    }
    if (isExpired(share.expires_at)) {
      return createErrorResponse('Aceasta invitatie a expirat', 410);
    }

    const [calendar, existingUser, session] = await Promise.all([
      db.collection('calendars').findOne({
        id: share.calendar_id,
        is_active: true,
        deleted_at: { $exists: false },
      }),
      db.collection('users').findOne({
        email: share.shared_with_email,
        status: { $ne: 'deleted' },
      }),
      auth(),
    ]);

    if (!calendar) {
      return createErrorResponse('Calendarul nu mai este disponibil', 409);
    }

    const sessionEmail = session?.user?.email?.toLowerCase().trim() || '';

    return createSuccessResponse({
      invite: {
        email: share.shared_with_email,
        calendarId: calendar.id,
        calendarName: calendar.name,
        calendarColor: calendar.color,
        sharedByName: share.shared_by_name || null,
        existingUser: Boolean(existingUser),
        isLoggedIn: Boolean(session?.user),
        emailMatchesSession: sessionEmail ? sessionEmail === share.shared_with_email : false,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to validate calendar share invite');
  }
}

// POST /api/calendar-shares/accept - Accept or decline a share
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const shareId = Number.isInteger(body?.shareId) && body.shareId > 0 ? body.shareId : undefined;
    const action = body?.action === 'decline' ? 'decline' : 'accept';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!token && !shareId) {
      return createErrorResponse('Token or shareId is required', 400);
    }

    const db = await getMongoDbOrThrow();
    const share = await resolveShareByPayload(db, { token: token || undefined, shareId });
    if (!share) {
      return createErrorResponse('Invitatie invalida sau expirata', 404);
    }
    if (share.status !== 'pending') {
      return createErrorResponse('Invitatie deja procesata', 409);
    }
    if (isExpired(share.expires_at)) {
      return createErrorResponse('Aceasta invitatie a expirat', 410);
    }

    const calendar = await db.collection('calendars').findOne({
      id: share.calendar_id,
      is_active: true,
      deleted_at: { $exists: false },
    });
    if (!calendar) {
      return createErrorResponse('Calendarul nu mai este disponibil', 409);
    }

    const authUser = await getOptionalAuthUser();
    const nowIso = new Date().toISOString();

    if (action === 'decline') {
      // Without a token the caller must be the authenticated recipient.
      // Allowing unauthenticated shareId-based declines would let anyone
      // enumerate sequential IDs and torch all pending invites.
      if (!token) {
        if (!authUser || !shareMatchesAuthUser(share, authUser)) {
          return createErrorResponse('Autentificare necesara pentru a refuza invitatia.', 401);
        }
      } else if (authUser && !shareMatchesAuthUser(share, authUser)) {
        // Token present but authenticated user is the wrong recipient.
        return createErrorResponse('Invitatia apartine altui utilizator', 403);
      }

      const declineResult = await db.collection('calendar_shares').updateOne(
        { id: share.id, status: 'pending' },
        {
          $set: {
            status: 'declined',
            expires_at: null,
            invite_token_hash: null,
            updated_at: nowIso,
            ...(authUser
              ? {
                  shared_with_user_id: authUser.dbUserId,
                  shared_with_numeric_user_id: authUser.userId,
                  shared_with_tenant_id: authUser.tenantId,
                }
              : {}),
          },
        }
      );

      if (declineResult.matchedCount === 0) {
        return createErrorResponse('Invitatie deja procesata', 409);
      }

      await invalidateReadCaches({
        tenantId: calendar.tenant_id,
        userId: calendar.owner_user_id,
        calendarId: calendar.id,
      });

      return createSuccessResponse({ success: true, status: 'declined' });
    }

    if (authUser) {
      if (!shareMatchesAuthUser(share, authUser)) {
        return createErrorResponse('Invitatia apartine altui utilizator', 403);
      }

      const acceptResult = await db.collection('calendar_shares').updateOne(
        { id: share.id, status: 'pending' },
        {
          $set: {
            status: 'accepted',
            shared_with_user_id: authUser.dbUserId,
            shared_with_numeric_user_id: authUser.userId,
            shared_with_tenant_id: authUser.tenantId,
            dentist_display_name: authUser.name || share.dentist_display_name || authUser.email,
            accepted_at: nowIso,
            updated_at: nowIso,
            expires_at: null,
            invite_token_hash: null,
          },
        }
      );

      if (acceptResult.matchedCount === 0) {
        return createErrorResponse('Invitatie deja procesata', 409);
      }

      await invalidateReadCaches({
        tenantId: calendar.tenant_id,
        userId: calendar.owner_user_id,
        calendarId: calendar.id,
        viewerDbUserId: authUser.dbUserId,
      });

      const acceptedShare = await db.collection('calendar_shares').findOne({ id: share.id });
      return createSuccessResponse({
        message: 'Invitatie acceptata',
        share: acceptedShare ? stripMongoId(acceptedShare) : null,
      });
    }

    const existingUser = await db.collection('users').findOne({
      email: share.shared_with_email,
      status: { $ne: 'deleted' },
    });
    if (existingUser) {
      return createErrorResponse('Acest cont exista deja. Autentifica-te pentru a accepta invitatia.', 401);
    }

    if (!token) {
      return createErrorResponse('Token is required to create a new account', 400);
    }
    if (!name) {
      return createErrorResponse('Numele este obligatoriu', 400);
    }
    if (!password || password.length < 8) {
      return createErrorResponse('Password must be at least 8 characters', 400);
    }

    const createdAccount = await createRecipientAccount(db, {
      email: share.shared_with_email,
      name,
      password,
    });

    try {
      const acceptResult = await db.collection('calendar_shares').updateOne(
        { id: share.id, status: 'pending' },
        {
          $set: {
            status: 'accepted',
            shared_with_user_id: createdAccount.userObjectId,
            shared_with_numeric_user_id: createdAccount.userNumericId,
            shared_with_tenant_id: createdAccount.tenantId,
            dentist_display_name: createdAccount.userName,
            accepted_at: nowIso,
            updated_at: nowIso,
            expires_at: null,
            invite_token_hash: null,
          },
        }
      );

      if (acceptResult.matchedCount === 0) {
        throw new Error('Invite already processed');
      }

      await invalidateReadCaches({
        tenantId: calendar.tenant_id,
        userId: calendar.owner_user_id,
        calendarId: calendar.id,
        viewerDbUserId: createdAccount.userObjectId,
      });
    } catch (error) {
      await cleanupRecipientAccount(db, createdAccount);
      throw error;
    }

    return createSuccessResponse({
      message: 'Cont creat si invitatie acceptata',
      email: share.shared_with_email,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to accept calendar share');
  }
}
