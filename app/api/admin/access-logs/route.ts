import { NextRequest } from 'next/server';
import { createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(request: NextRequest) {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    const db = await getMongoDbOrThrow();

    const route = request.nextUrl.searchParams.get('route')?.trim();
    const targetType = request.nextUrl.searchParams.get('targetType')?.trim();
    const actor = request.nextUrl.searchParams.get('actor')?.trim();
    const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (route) {
      filter.route = route;
    }
    if (targetType) {
      filter.target_type = targetType;
    }
    if (actor) {
      const escaped = escapeRegex(actor);
      filter.actor_email = { $regex: escaped, $options: 'i' };
    }

    const [items, total] = await Promise.all([
      db.collection('data_access_logs').find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('data_access_logs').countDocuments(filter),
    ]);

    await logDataAccess({
      actorUserId,
      actorEmail,
      actorRole: 'super_admin',
      targetType: 'data_access_logs',
      route: '/api/admin/access-logs',
      request,
      metadata: {
        routeFilter: route || null,
        targetType: targetType || null,
        actorFilter: actor || null,
        page,
        limit,
        resultCount: items.length,
      },
    });

    return createSuccessResponse({
      logs: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch access logs');
  }
}

