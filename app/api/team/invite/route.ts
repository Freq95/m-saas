import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { createInviteToken, sendInviteEmail } from '@/lib/invite';
import { getAuthUser } from '@/lib/auth-helpers';
import { checkWriteRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/team/invite
 *
 * Idempotent: if a pending invite already exists for the same email in this
 * tenant, the route refreshes the token + name/role/assignments and re-sends
 * the email. Lets the owner retry without manual DB cleanup when the previous
 * email send failed (Resend down, network blip, validation drop, etc.).
 *
 * Email-send failures are surfaced with HTTP 502 so the UI can show a real
 * error rather than a misleading success toast — the DB rows persist so the
 * owner can simply re-submit and we hit the resend path.
 */
export async function POST(request: NextRequest) {
  try {
    const { dbUserId, tenantId, role, userId } = await getAuthUser();
    if (role !== 'owner') {
      return createErrorResponse('Only the clinic owner can invite team members', 403);
    }
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;

    const body = await request.json();
    const { inviteTeamMemberSchema } = await import('@/lib/validation');
    const validationResult = inviteTeamMemberSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(validationResult.error.errors[0]?.message || 'Invalid input', 400);
    }
    const { email, name, role: invitedRole, assigned_dentist_user_ids } = validationResult.data;

    const db = await getMongoDbOrThrow();
    const tenant = await db.collection('tenants').findOne({ _id: tenantId });
    if (!tenant) {
      return createErrorResponse('Tenant not found', 404);
    }

    const userRole = invitedRole;
    const assignmentIds = userRole === 'asistent'
      ? Array.from(new Set(assigned_dentist_user_ids ?? []))
      : [];
    if (userRole === 'asistent' && assignmentIds.length === 0) {
      return createErrorResponse('Selecteaza cel putin un medic.', 400);
    }
    if (assignmentIds.length > 0) {
      const validDentistCount = await db.collection('users').countDocuments({
        tenant_id: tenantId,
        id: { $in: assignmentIds },
        role: { $in: ['owner', 'dentist'] },
        status: { $ne: 'deleted' },
      });
      if (validDentistCount !== assignmentIds.length) {
        return createErrorResponse('One or more assigned dentists are invalid', 400);
      }
    }

    // Look up ANY existing team_members row for this email (including 'removed').
    // We deliberately do NOT filter by status here: the team_members collection
    // has a unique index on (tenant_id, user_id), so if a previously-removed
    // member's row still exists, inserting a new row for the same user blows
    // up with E11000. Reviving the existing row in place avoids the conflict.
    const existingMember = await db.collection('team_members').findOne({
      tenant_id: tenantId,
      email,
    });

    // Active members can't be re-invited — that's an error.
    if (existingMember && existingMember.status === 'active') {
      return createErrorResponse('Acest utilizator este deja membru activ al clinicii.', 409);
    }

    // Both 'pending' (idempotent resend) and 'removed' (revive a previously-removed
    // member) take the same in-place update path. Treating these together keeps
    // us from ever attempting a duplicate insert against the unique index.
    const isReinvite = !!(existingMember && (existingMember.status === 'pending' || existingMember.status === 'removed'));
    const isReviveFromRemoved = !!(existingMember && existingMember.status === 'removed');

    // Reviving a removed member re-claims a seat, so it must pass the seat
    // limit check. Plain resends of an already-pending invite skip this since
    // the seat is already counted.
    if (isReviveFromRemoved) {
      const activeMembers = await db.collection('team_members').countDocuments({
        tenant_id: tenantId,
        status: { $ne: 'removed' },
      });
      const maxSeats = Number(tenant.max_seats || 0);
      if (maxSeats <= 0) {
        return createErrorResponse(
          'Tenant has no seat allocation. Ask platform admin to set seat limit.',
          403,
        );
      }
      if (activeMembers >= maxSeats) {
        return createErrorResponse(
          `Seat limit reached (${activeMembers}/${maxSeats}). Remove a member or ask platform admin to increase seat limit.`,
          403,
        );
      }
    }

    const nowIso = new Date().toISOString();
    let userObjectId: ObjectId;

    if (isReinvite && existingMember) {
      // Find the user row that already backs this pending invite.
      const existingUserDoc = await db.collection('users').findOne(
        { _id: existingMember.user_id, tenant_id: tenantId },
      );
      if (!existingUserDoc) {
        // Defensive: orphan team_members row without a users row. Recreate the user.
        const numericUserId = await getNextNumericId('users');
        const insertResult = await db.collection('users').insertOne({
          id: numericUserId,
          email,
          password_hash: null,
          name,
          role: userRole,
          tenant_id: tenantId,
          status: 'pending_invite',
          session_version: 0,
          created_at: nowIso,
          updated_at: nowIso,
        });
        userObjectId = insertResult.insertedId;
        await db.collection('team_members').updateOne(
          { _id: existingMember._id },
          {
            $set: {
              user_id: userObjectId,
              role: userRole,
              ...(assignmentIds.length > 0 ? { assigned_dentist_user_ids: assignmentIds } : {}),
              invited_by: dbUserId,
              invited_at: nowIso,
              updated_at: nowIso,
              // Revive a removed member back to pending and clear the old
              // acceptance timestamp; harmless no-ops on rows that were
              // already pending.
              status: 'pending',
              accepted_at: null,
            },
            ...(assignmentIds.length === 0 && existingMember.assigned_dentist_user_ids
              ? { $unset: { assigned_dentist_user_ids: '' } }
              : {}),
          },
        );
      } else {
        userObjectId = existingUserDoc._id as ObjectId;
        // Refresh the user + team_members to reflect the latest invite payload
        // (name/role/assignments may have changed between the failed attempt
        // and the retry).
        await db.collection('users').updateOne(
          { _id: existingUserDoc._id, tenant_id: tenantId },
          {
            $set: {
              name,
              role: userRole,
              status: 'pending_invite',
              updated_at: nowIso,
            },
          },
        );
        const memberSet: Record<string, unknown> = {
          role: userRole,
          invited_by: dbUserId,
          invited_at: nowIso,
          updated_at: nowIso,
          // Revive a removed member back to pending and clear the old
          // acceptance timestamp; harmless no-ops on rows that were
          // already pending.
          status: 'pending',
          accepted_at: null,
        };
        if (assignmentIds.length > 0) memberSet.assigned_dentist_user_ids = assignmentIds;
        const memberUpdate: Record<string, unknown> = { $set: memberSet };
        if (assignmentIds.length === 0 && existingMember.assigned_dentist_user_ids) {
          memberUpdate.$unset = { assigned_dentist_user_ids: '' };
        }
        await db.collection('team_members').updateOne({ _id: existingMember._id }, memberUpdate);
      }
    } else {
      // Fresh invite path — enforce seat limit + look up any orphan user row.
      const activeMembers = await db.collection('team_members').countDocuments({
        tenant_id: tenantId,
        status: { $ne: 'removed' },
      });

      const maxSeats = Number(tenant.max_seats || 0);
      if (maxSeats <= 0) {
        return createErrorResponse(
          'Tenant has no seat allocation. Ask platform admin to set seat limit.',
          403,
        );
      }
      if (activeMembers >= maxSeats) {
        return createErrorResponse(
          `Seat limit reached (${activeMembers}/${maxSeats}). Remove a member or ask platform admin to increase seat limit.`,
          403,
        );
      }

      const existingUser = await db.collection('users').findOne({ email, tenant_id: tenantId });

      // Hard conflict: an active or non-pending account with this email already
      // exists in the tenant. Owner needs to remove that account first.
      if (existingUser && existingUser.status !== 'deleted' && existingUser.status !== 'pending_invite') {
        return createErrorResponse('Exista deja un utilizator activ cu acest email in clinica.', 409);
      }

      // Recoverable cases:
      //   - existingUser is null              → fresh user creation
      //   - existingUser.status = 'deleted'   → re-activate the row
      //   - existingUser.status = 'pending_invite' (orphan user without a
      //     team_members row from a previous partial failure) → re-use the row
      const numericUserId = typeof existingUser?.id === 'number'
        ? existingUser.id
        : await getNextNumericId('users');

      if (existingUser) {
        await db.collection('users').updateOne(
          { _id: existingUser._id, tenant_id: tenantId },
          {
            $set: {
              id: numericUserId,
              email,
              name,
              role: userRole,
              status: 'pending_invite',
              updated_at: nowIso,
            },
          },
        );
        userObjectId = existingUser._id as ObjectId;
      } else {
        const insertResult = await db.collection('users').insertOne({
          id: numericUserId,
          email,
          password_hash: null,
          name,
          role: userRole,
          tenant_id: tenantId,
          status: 'pending_invite',
          session_version: 0,
          created_at: nowIso,
          updated_at: nowIso,
        });
        userObjectId = insertResult.insertedId;
      }

      await db.collection('team_members').insertOne({
        tenant_id: tenantId,
        user_id: userObjectId,
        email,
        role: userRole,
        ...(assignmentIds.length > 0 ? { assigned_dentist_user_ids: assignmentIds } : {}),
        invited_by: dbUserId,
        invited_at: nowIso,
        accepted_at: null,
        status: 'pending',
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    // Mark any previously unused tokens for this email as consumed so old
    // links can't be redeemed alongside the new one.
    await db.collection('invite_tokens').updateMany(
      { email, tenant_id: tenantId, used_at: null },
      { $set: { used_at: new Date() } },
    );

    const token = await createInviteToken(email, userObjectId, tenantId, userRole, dbUserId);
    const sendResult = await sendInviteEmail(email, name, (tenant as any).name || 'Clinic', token);

    if (!sendResult.ok) {
      // The DB rows are now in a valid pending state, so the owner can simply
      // hit "Invită" again and we'll come through the resend path. Surface a
      // 502 so the UI can show a real error instead of a misleading success.
      const message = sendResult.reason === 'not_configured'
        ? 'Trimiterea de emailuri nu este configurata. Contacteaza administratorul platformei.'
        : 'Nu am putut trimite emailul de invitatie. Datele invitatiei au fost salvate; te rugam sa reincerci.';
      return createErrorResponse(message, 502);
    }

    return createSuccessResponse(
      { message: isReinvite ? 'Invitatia a fost retrimisa' : 'Invitatia a fost trimisa', resent: isReinvite },
      isReinvite ? 200 : 201,
    );
  } catch (error) {
    return handleApiError(error, 'Failed to invite team member');
  }
}
