import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { createInviteToken, sendInviteEmail } from '@/lib/invite';
import { logAdminAudit } from '@/lib/audit';

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function getNextUserId(db: any): Promise<number> {
  const latest = await db.collection('users').find({ id: { $type: 'number' } }).sort({ id: -1 }).limit(1).next();
  return (latest?.id || 0) + 1;
}

let tenantIndexesEnsured = false;

async function ensureTenantIndexes(db: any) {
  if (tenantIndexesEnsured) return;
  await db.collection('tenants').createIndex({ slug: 1 }, { unique: true });
  tenantIndexesEnsured = true;
}

export async function GET(request: NextRequest) {
  try {
    await getSuperAdmin();
    const db = await getMongoDbOrThrow();
    await ensureTenantIndexes(db);
    const search = request.nextUrl.searchParams.get('search')?.trim();
    const plan = request.nextUrl.searchParams.get('plan')?.trim();
    const status = request.nextUrl.searchParams.get('status')?.trim();
    const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (plan) filter.plan = plan;
    if (status) filter.status = status;

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { slug: { $regex: escaped, $options: 'i' } }];
    }

    const [tenants, total] = await Promise.all([
      db.collection('tenants').find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('tenants').countDocuments(filter),
    ]);

    const ownerIds = tenants.map((t: any) => t.owner_id).filter(Boolean);
    const owners = ownerIds.length
      ? await db.collection('users').find({ _id: { $in: ownerIds } }).toArray()
      : [];
    const ownerMap = new Map<string, any>(owners.map((owner: any) => [String(owner._id), owner]));

    const tenantIds = tenants.map((t: any) => t._id);
    const userCounts = tenantIds.length
      ? await db
          .collection('team_members')
          .aggregate([
            { $match: { tenant_id: { $in: tenantIds }, status: { $in: ['active', 'pending_invite'] } } },
            { $group: { _id: '$tenant_id', count: { $sum: 1 } } },
          ])
          .toArray()
      : [];
    const userCountMap = new Map<string, number>(userCounts.map((row: any) => [String(row._id), row.count]));

    const items = tenants.map((tenant: any) => ({
      ...tenant,
      owner_email: ownerMap.get(String(tenant.owner_id))?.email || null,
      users_count: userCountMap.get(String(tenant._id)) || 0,
    }));

    return createSuccessResponse({
      tenants: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to list tenants');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, email: actorEmail } = await getSuperAdmin();
    const db = await getMongoDbOrThrow();
    await ensureTenantIndexes(db);
    const body = await request.json();

    const clinicName = typeof body?.clinicName === 'string' ? body.clinicName.trim() : '';
    const ownerEmail = typeof body?.ownerEmail === 'string' ? body.ownerEmail.toLowerCase().trim() : '';
    const ownerName = typeof body?.ownerName === 'string' ? body.ownerName.trim() : '';
    const plan = ['free', 'starter', 'pro'].includes(body?.plan) ? body.plan : 'free';
    const maxSeats = Math.max(1, Number.parseInt(String(body?.maxSeats || 1), 10) || 1);
    const sendInvite = body?.sendInvite !== false;

    if (!clinicName || !ownerEmail || !ownerName) {
      return createErrorResponse('clinicName, ownerEmail and ownerName are required', 400);
    }

    const existingEmail = await db.collection('users').findOne({ email: ownerEmail });
    if (existingEmail) {
      return createErrorResponse('Owner email already exists', 409);
    }

    const tenantId = new ObjectId();
    const ownerId = new ObjectId();
    const now = new Date();
    const nowIso = now.toISOString();
    const userNumericId = await getNextUserId(db);

    const tenantDoc = {
      _id: tenantId,
      name: clinicName,
      slug: slugify(clinicName),
      owner_id: ownerId,
      plan,
      max_seats: maxSeats,
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
      _id: ownerId,
      id: userNumericId,
      email: ownerEmail,
      password_hash: null,
      name: ownerName,
      role: 'owner',
      tenant_id: tenantId,
      status: 'pending_invite',
      created_at: nowIso,
      updated_at: nowIso,
    };

    const teamMemberDoc = {
      _id: new ObjectId(),
      tenant_id: tenantId,
      user_id: ownerId,
      role: 'owner',
      status: 'pending_invite',
      invited_at: nowIso,
      accepted_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await db.collection('tenants').insertOne(tenantDoc);
    await db.collection('users').insertOne(userDoc);
    await db.collection('team_members').insertOne(teamMemberDoc);

    const token = await createInviteToken(ownerEmail, ownerId, tenantId, 'owner', userId);
    const inviteEmail = sendInvite
      ? await sendInviteEmail(ownerEmail, ownerName, clinicName, token)
      : { ok: false as const, reason: 'not_requested' as const };

    await logAdminAudit({
      action: 'tenant.create',
      actorUserId: userId,
      actorEmail,
      targetType: 'tenant',
      targetId: tenantId,
      request,
      after: {
        name: tenantDoc.name,
        plan: tenantDoc.plan,
        status: tenantDoc.status,
        max_seats: tenantDoc.max_seats,
        owner_email: ownerEmail,
      },
      metadata: {
        invite_requested: sendInvite,
        invite_sent: inviteEmail.ok,
        invite_reason: inviteEmail.ok ? 'sent' : inviteEmail.reason,
      },
    });

    return createSuccessResponse(
      {
        tenantId: String(tenantId),
        inviteToken: token,
        inviteEmail: {
          requested: sendInvite,
          sent: inviteEmail.ok,
          reason: inviteEmail.ok ? 'sent' : inviteEmail.reason,
        },
      },
      201
    );
  } catch (error) {
    return handleApiError(error, 'Failed to create tenant');
  }
}
